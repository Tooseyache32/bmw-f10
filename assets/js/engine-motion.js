(() => {
  'use strict';
  const stage = document.querySelector('[data-engine-scene]');
  if (!stage) return;
  const body = document.body;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const motionReduced = () => reducedMotion.matches && body.dataset.engineMotion !== 'full';
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const canvas = document.getElementById('engineCanvas');
  const rpmInput = document.getElementById('engineRpm');
  const rpmOutput = document.querySelector('[data-rpm-value]');
  const pauseButton = document.querySelector('[data-motion-toggle]');
  const explodeButton = document.querySelector('[data-engine-explode]');
  const format = new Intl.NumberFormat('ru-RU');
  const moduleUrl = new URL('engine-scene.js', document.currentScript.src).href;
  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const animations = new Set();
  const scrollProgress = document.querySelector('.engine-progress');
  const kineticTrack = document.querySelector('.kinetic-track');
  const photoRegion = document.querySelector('.driving-photo');
  const photo = photoRegion?.querySelector('img');
  const dial = document.querySelector('.power-tile');
  const fallbackPistons = [...document.querySelectorAll('[data-fallback-piston]')];
  const fallbackHead = document.querySelector('[data-fallback-head]');
  let controller = null;
  let visible = true;
  let paused = motionReduced();
  let exploded = false;
  let activeModel = document.querySelector('[data-model-choice][aria-pressed="true"]')?.dataset.modelChoice || '535i';
  let scrollFrame = 0;
  let fallbackFrame = 0;
  let fallbackTime = 0;
  let lastFallbackTime = 0;
  let destroyed = false;
  let sceneRequested = false;
  let sceneScroll = .35;
  document.addEventListener('f10:scene-scroll', event => {
    sceneScroll = clamp(event.detail.progress);
    controller?.setScrollProgress(sceneScroll);
  });

  function animate(element, keyframes, options) {
    if (!element || paused || motionReduced() || !element.animate) return;
    const animation = element.animate(keyframes, options);
    animations.add(animation);
    animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
    return animation;
  }

  function setRpm() {
    const rpm = Number(rpmInput.value);
    rpmOutput.textContent = format.format(rpm);
    rpmInput.setAttribute('aria-valuetext', `${format.format(rpm)} условных оборотов в минуту`);
    rpmInput.style.setProperty('--rpm-progress', `${(rpm - 800) / 6200 * 100}%`);
    controller?.setRpm(rpm);
  }

  function paintFallback(time) {
    fallbackFrame = 0;
    if (destroyed || controller) return;
    const delta = lastFallbackTime ? Math.min(50, time - lastFallbackTime) : 0;
    lastFallbackTime = time;
    if (!paused && !motionReduced()) fallbackTime += delta * (.0004 + Number(rpmInput.value) / 5000000);
    const count = window.F10_SPECS?.models[activeModel]?.cylinders || 6;
    const phases = count === 6 ? [0, 2.094, 4.189, 4.189, 2.094, 0] : [0, Math.PI, Math.PI, 0];
    fallbackPistons.forEach((piston, index) => {
      piston.style.display = index >= count ? 'none' : '';
      piston.setAttribute('transform', `translate(${count === 4 ? 73 : 0},${Math.sin(fallbackTime + (phases[index] || 0)) * 13})`);
    });
    fallbackHead.setAttribute('transform', `translate(0,${exploded ? -22 : 0})`);
    if (visible && !document.hidden && !paused && !motionReduced()) fallbackFrame = requestAnimationFrame(paintFallback);
  }

  function requestFallback() {
    if (!controller && !fallbackFrame && !destroyed) fallbackFrame = requestAnimationFrame(paintFallback);
  }

  function updatePlayback() {
    const still = paused || motionReduced();
    if (still) {
      const energy = document.querySelector('.energy-path');
      if (energy) energy.style.animationPlayState = 'paused';
    } else {
      const energy = document.querySelector('.energy-path');
      if (energy) energy.style.animationPlayState = 'running';
    }
    body.classList.toggle('motion-paused', still);
    pauseButton.setAttribute('aria-pressed', String(still));
    pauseButton.setAttribute('aria-label', still ? 'Продолжить анимации' : 'Приостановить анимации');
    pauseButton.title = still ? 'Продолжить анимации' : 'Приостановить анимации';
    pauseButton.querySelector('[data-pause-label]').textContent = still ? 'Движение' : 'Пауза';
    pauseButton.querySelector('[data-pause-icon]').setAttribute('d', still ? 'm6 3 8 6-8 6Z' : 'M6 4v10M12 4v10');
    if (motionReduced()) {
      pauseButton.setAttribute('aria-label', 'Сокращённая анимация включена в настройках системы');
      pauseButton.title = 'Сокращённая анимация включена в настройках системы';
      pauseButton.disabled = true;
    } else pauseButton.disabled = false;
    controller?.setPaused(still);
    controller?.setReducedMotion(motionReduced());
    document.dispatchEvent(new CustomEvent('f10:motion', { detail: { paused: still } }));
    if (still) animations.forEach(animation => animation.finish());
    if (fallbackFrame) cancelAnimationFrame(fallbackFrame);
    fallbackFrame = 0;
    lastFallbackTime = 0;
    requestFallback();
    scheduleScroll();
  }

  function setModel(key, transition = true) {
    const model = window.F10_SPECS?.models[key];
    if (!model) return;
    activeModel = key;
    document.querySelector('[data-inline-mark]').textContent = `I${model.cylinders}`;
    document.querySelector('[data-scene-caption]').textContent = `Рядная компоновка / I${model.cylinders}`;
    dial.style.setProperty('--power-ratio', String(model.power / 306));
    controller?.setCylinders(model.cylinders);
    requestFallback();
    if (transition && !body.classList.contains('engine-effects-ready')) {
      animate(document.querySelector('.engine-model .model-mark'), [{ opacity: .15, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 650, easing: 'cubic-bezier(.16,1,.3,1)' });
      animate(document.querySelector('.engine-model .model-title'), [{ opacity: .25, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 700, easing: 'cubic-bezier(.16,1,.3,1)' });
    }
  }

  async function loadScene() {
    if (sceneRequested || destroyed) return;
    sceneRequested = true;
    if (location.protocol === 'file:') return;
    try {
      const { createEngineScene } = await import(moduleUrl);
      if (destroyed) return;
      controller = createEngineScene(canvas, {
        onReady() {
          stage.dataset.renderer = 'webgl';
          document.querySelector('[data-scene-status]').textContent = 'Интерактивная анатомия / 3D';
          document.querySelector('[data-scene-hint]').textContent = finePointer.matches ? 'Поверните движением курсора' : 'Управляйте оборотами ниже';
        },
        onError() {
          controller?.destroy();
          controller = null;
          stage.dataset.renderer = 'schematic';
          document.querySelector('[data-scene-status]').textContent = 'Анатомия движения / 2D';
          document.querySelector('[data-scene-hint]').textContent = 'Управляйте оборотами ниже';
          requestFallback();
        }
      });
      controller.setCylinders(window.F10_SPECS?.models[activeModel]?.cylinders || 6);
      controller.setRpm(Number(rpmInput.value));
      controller.setReducedMotion(motionReduced());
      controller.setPaused(paused);
      controller.setExploded(exploded);
      controller.setVisible(visible);
      controller.setScrollProgress(sceneScroll);
      if (fallbackFrame) cancelAnimationFrame(fallbackFrame);
      fallbackFrame = 0;
    } catch (error) {
      stage.dataset.renderer = 'schematic';
      document.querySelector('[data-scene-status]').textContent = 'Анатомия движения / 2D';
      document.querySelector('[data-scene-hint]').textContent = 'Управляйте оборотами ниже';
      requestFallback();
      console.info('F10: используется резервная схема двигателя.', error.message);
    }
  }

  function paintScroll() {
    scrollFrame = 0;
    const range = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    scrollProgress.style.transform = `scaleX(${clamp(scrollY / range)})`;
    if (paused || motionReduced()) {
      kineticTrack.style.setProperty('--kinetic-shift', '-35px');
      if (photo) photo.style.transform = 'none';
      return;
    }
    if (body.classList.contains('engine-effects-ready')) return;
    const dividerRect = kineticTrack.parentElement.getBoundingClientRect();
    if (dividerRect.top < innerHeight + 150 && dividerRect.bottom > -150) {
      const progress = clamp((innerHeight - dividerRect.top) / (innerHeight + dividerRect.height));
      kineticTrack.style.setProperty('--kinetic-shift', `${-30 - progress * Math.min(230, innerWidth * .18)}px`);
    }
    if (photo) {
      const rect = photoRegion.getBoundingClientRect();
      if (rect.top < innerHeight && rect.bottom > 0) {
        const progress = clamp((innerHeight - rect.top) / (innerHeight + rect.height));
        photo.style.transform = `translate3d(0,${(progress - .5) * rect.height * .1}px,0) scale(1.015)`;
      }
    }
  }
  function scheduleScroll() { if (!scrollFrame && !destroyed) scrollFrame = requestAnimationFrame(paintScroll); }

  body.classList.add('engine-enhanced');
  rpmInput.disabled = false;
  explodeButton.disabled = false;
  pauseButton.disabled = false;
  rpmInput.addEventListener('input', setRpm);
  explodeButton.addEventListener('click', () => {
    exploded = !exploded;
    explodeButton.setAttribute('aria-pressed', String(exploded));
    explodeButton.setAttribute('aria-label', exploded ? 'Собрать детали двигателя' : 'Разнести детали двигателя');
    explodeButton.title = exploded ? 'Собрать детали двигателя' : 'Разнести детали двигателя';
    explodeButton.querySelector('[data-explode-label]').textContent = exploded ? 'Собрать' : 'Разнести';
    controller?.setExploded(exploded);
    requestFallback();
  });
  pauseButton.addEventListener('click', () => { paused = !paused; updatePlayback(); });
  reducedMotion.addEventListener('change', () => { paused = motionReduced(); updatePlayback(); });
  document.querySelectorAll('[data-model-choice]').forEach(button => button.addEventListener('click', () => setModel(button.dataset.modelChoice)));

  const diagramButtons = [...document.querySelectorAll('[data-diagram-choice]')];
  const diagramParts = [...document.querySelectorAll('[data-diagram-part]')];
  diagramParts.forEach(part => {
    const activate = () => diagramButtons.find(button => button.dataset.diagramChoice === part.dataset.diagramPart)?.click();
    part.addEventListener('click', activate);
    part.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
    });
  });
  diagramButtons.forEach(button => button.addEventListener('click', () => {
    const key = button.dataset.diagramChoice;
    diagramParts.forEach(part => part.setAttribute('aria-pressed', String(part.dataset.diagramPart === key)));
    if (!body.classList.contains('engine-effects-ready')) animate(document.querySelector(`[data-diagram-copy="${key}"]`), [{ opacity: .1, transform: 'translateY(14px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 580, easing: 'cubic-bezier(.16,1,.3,1)' });
  }));

  const svgNamespace = 'http://www.w3.org/2000/svg';
  const ticks = document.querySelector('[data-dial-ticks]');
  for (let i = 0; i <= 54; i++) {
    const angle = (135 + i * 5) * Math.PI / 180;
    const line = document.createElementNS(svgNamespace, 'line');
    const innerRadius = i % 6 === 0 ? 145 : 152;
    line.setAttribute('x1', String(210 + Math.cos(angle) * innerRadius));
    line.setAttribute('y1', String(160 + Math.sin(angle) * innerRadius));
    line.setAttribute('x2', String(210 + Math.cos(angle) * 159));
    line.setAttribute('y2', String(160 + Math.sin(angle) * 159));
    line.setAttribute('class', `dial-tick${i % 6 === 0 ? ' major' : ''}`);
    ticks.append(line);
  }

  let visibilityObserver;
  let revealObserver;
  if ('IntersectionObserver' in window) {
    visibilityObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        visible = entry.isIntersecting;
        controller?.setVisible(visible);
        if (visible) { loadScene(); requestFallback(); }
        else { cancelAnimationFrame(fallbackFrame); fallbackFrame = 0; lastFallbackTime = 0; }
      });
    }, { rootMargin: '120px 0px' });
    visibilityObserver.observe(stage);
    revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const element = entry.target;
      if (element === dial) dial.style.setProperty('--dial-reveal', '1');
      revealObserver.unobserve(element);
    }), { threshold: .18 });
    if (!motionReduced()) dial.style.setProperty('--dial-reveal', '0');
    revealObserver.observe(dial);
  } else loadScene();


  const menu = document.querySelector('.unified-menu');
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu?.open) { menu.open = false; menu.querySelector('summary').focus(); }
  });
  document.addEventListener('pointerdown', event => { if (menu?.open && !menu.contains(event.target)) menu.open = false; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(fallbackFrame); fallbackFrame = 0; lastFallbackTime = 0; }
    else requestFallback();
  });
  window.addEventListener('scroll', scheduleScroll, { passive: true });
  window.addEventListener('resize', scheduleScroll, { passive: true });
  window.addEventListener('load', scheduleScroll, { once: true });
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    destroyed = true;
    controller?.destroy();
    cancelAnimationFrame(scrollFrame);
    cancelAnimationFrame(fallbackFrame);
    visibilityObserver?.disconnect();
    revealObserver?.disconnect();
    animations.forEach(animation => animation.cancel());
  });
  setRpm();
  setModel(activeModel, false);
  updatePlayback();
  scheduleScroll();
})();
