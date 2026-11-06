(() => {
  'use strict';
  const body = document.body;
  if (body.dataset.page !== 'engine') return;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const ease = 'cubic-bezier(.18,.76,.16,1)';
  const typeRecords = new Map();
  const activeType = new Set();
  const runningAnimations = new Set();
  const listeners = new AbortController();
  const on = (element, name, callback, options = {}) => element?.addEventListener(name, callback, { ...options, signal: listeners.signal });
  const textSelector = 'main h1, main h2, main h3, .engine-model .model-mark, .engine-lead > p, .engine-lead .text-link, .section-head .lede, .engineering-point p, .driving-bottom > p, .next-chapter .button, .chapter-footer-title';
  const heroTitle = document.getElementById('engineTitle');
  const hero = document.querySelector('.engine-hero');
  const visual = document.querySelector('.engine-visual');
  const stage = document.querySelector('.engine-stage');
  const architecture = document.querySelector('.architecture-section');
  const blueprint = document.querySelector('.blueprint');
  const powerTile = document.querySelector('.power-tile');
  const photoFrame = document.querySelector('.driving-photo');
  const photo = photoFrame.querySelector('img');
  const divider = document.querySelector('.kinetic-divider');
  const track = document.querySelector('.kinetic-track');
  const glyphSegmenter = 'Segmenter' in Intl ? new Intl.Segmenter('ru', { granularity: 'grapheme' }) : null;
  const glow = document.createElement('div');
  glow.className = 'engine-effects-glow';
  glow.setAttribute('aria-hidden', 'true');
  body.prepend(glow);
  [...track.children].forEach(child => track.append(child.cloneNode(true)));
  const trackStars = [...track.querySelectorAll('i')];
  let paused = body.classList.contains('motion-paused');
  let frame = 0;
  let lastTime = 0;
  let elapsed = 0;
  let dirty = true;
  let scrollVelocity = 0;
  let lastScroll = scrollY;
  let trackOffset = 0;
  let trackLength = 1;
  let trackVisible = false;
  let stageVisible = false;
  let heroVisible = false;
  let photoVisible = false;
  let blueprintVisible = false;
  let sceneProgress = .35;
  let photoProgress = .5;
  let heroProgress = 0;
  let blueprintProgress = .5;
  let previousSceneProgress = -1;
  let destroyed = false;
  let smoothScene = .35;
  let smoothPhoto = .5;
  let smoothHero = 0;
  let smoothBlueprint = .5;

  function motionAllowed() {
    return !paused && (!reducedMotion.matches || body.dataset.engineMotion === 'full');
  }
  function play(element, keyframes, options) {
    if (!element?.animate || !motionAllowed()) return;
    const animation = element.animate(keyframes, { ...options, easing: options?.easing || ease });
    runningAnimations.add(animation);
    animation.finished.then(() => runningAnimations.delete(animation), () => runningAnimations.delete(animation));
    return animation;
  }
  function schedule() {
    if (!frame && !destroyed && !document.hidden) frame = requestAnimationFrame(tick);
  }

  function measureLetters(record) {
    record.size = parseFloat(getComputedStyle(record.element).fontSize) || 24;
    record.glyphs.forEach(glyph => {
      const rect = glyph.slot.getBoundingClientRect();
      glyph.x = rect.left + rect.width / 2;
      glyph.y = rect.top + rect.height / 2;
    });
    record.needsMeasure = false;
  }
  function activateType(record, event, isTouch = false) {
    if (!motionAllowed()) return;
    record.hovered = !isTouch;
    record.pointerX = event.clientX;
    record.pointerY = event.clientY;
    record.waveStarted = performance.now();
    record.needsMeasure = true;
    record.element.classList.add('is-type-active');
    activeType.add(record);
    schedule();
  }
  function resetType(record) {
    record.hovered = false;
    record.waveStarted = -10000;
    record.element.classList.remove('is-type-active');
    record.glyphs.forEach(glyph => {
      glyph.rise = glyph.velocity = glyph.rotate = 0;
      glyph.node.style.removeProperty('transform');
      glyph.node.style.removeProperty('--glyph-echo');
      glyph.node.style.removeProperty('--glyph-trail');
      glyph.node.classList.remove('is-hot');
    });
    activeType.delete(record);
  }

  function prepareType(element) {
    const old = typeRecords.get(element);
    if (old && element.querySelector('.type-slot')) return old;
    if (old) { resetType(old); old.events.abort(); }
    const original = element.innerText.replace(/\s+/g, ' ').trim();
    if (!original) return null;
    const record = { element, glyphs: [], hovered: false, pointerX: -9999, pointerY: -9999, waveStarted: -10000, size: 24, needsMeasure: true, events: new AbortController() };
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
        if (node.parentElement.closest('.engine-sr-only, [aria-hidden="true"], svg, [data-spec], script, style')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach(textNode => {
      const fragment = document.createDocumentFragment();
      const tokens = textNode.textContent.match(/\S+|\s+/g) || [];
      tokens.forEach(token => {
        if (/^\s+$/.test(token)) { fragment.append(document.createTextNode(token)); return; }
        const word = document.createElement('span');
        word.className = 'type-word';
        word.setAttribute('aria-hidden', 'true');
        const graphemes = glyphSegmenter ? [...glyphSegmenter.segment(token)].map(item => item.segment) : Array.from(token);
        graphemes.forEach(character => {
          const slot = document.createElement('span');
          slot.className = 'type-slot';
          const glyph = document.createElement('span');
          glyph.className = 'type-glyph';
          glyph.textContent = character;
          glyph.dataset.glyph = character;
          slot.append(glyph);
          word.append(slot);
          record.glyphs.push({ node: glyph, slot, x: 0, y: 0, rise: 0, velocity: 0, rotate: 0 });
        });
        fragment.append(word);
      });
      if (element.tagName === 'A' && textNode.parentElement === element) {
        const copy = document.createElement('span');
        copy.className = 'type-copy';
        copy.append(fragment);
        textNode.replaceWith(copy);
      } else textNode.replaceWith(fragment);
    });
    if (!record.glyphs.length) return null;
    const accessibleText = document.createElement('span');
    accessibleText.className = 'engine-sr-only';
    accessibleText.textContent = original;
    element.append(accessibleText);
    element.classList.add('kinetic-type');
    const listen = (name, handler, options = {}) => element.addEventListener(name, handler, { ...options, signal: record.events.signal });
    listen('pointerenter', event => { if (event.pointerType !== 'touch') activateType(record, event); });
    listen('pointermove', event => {
      if (event.pointerType === 'touch' || !motionAllowed()) return;
      record.pointerX = event.clientX;
      record.pointerY = event.clientY;
      if (!record.hovered) activateType(record, event);
      schedule();
    }, { passive: true });
    listen('pointerleave', () => { record.hovered = false; schedule(); });
    listen('pointerdown', event => { if (event.pointerType === 'touch') activateType(record, event, true); }, { passive: true });
    listen('focusin', () => {
      const rect = element.getBoundingClientRect();
      activateType(record, { clientX: rect.left + rect.width * .5, clientY: rect.top + rect.height * .5 });
    });
    listen('focusout', () => { record.hovered = false; schedule(); });
    typeRecords.set(element, record);
    return record;
  }

  function revealType(record, delay = 0) {
    if (!record || !motionAllowed()) return;
    const isHeadline = record.element.matches('h1, h2, h3, .model-mark, .chapter-footer-title');
    if (!isHeadline) {
      const direction = [...typeRecords.keys()].indexOf(record.element) % 2 ? 1 : -1;
      play(record.element, [{ opacity: 0, transform: `translate3d(${direction * (innerWidth < 760 ? 20 : 65)}px,35px,0)` }, { opacity: 1, transform: 'translate3d(0,0,0)' }], { duration: 1550, delay, fill: 'backwards' });
      return;
    }
    const spread = Math.min(28, 700 / Math.max(1, record.glyphs.length));
    const direction = [...typeRecords.keys()].indexOf(record.element) % 2 ? 1 : -1;
    record.glyphs.forEach((glyph, index) => {
      play(glyph.slot, [
        { opacity: 0, transform: `perspective(900px) translate3d(${direction * 35}px,90%,0) rotateX(-55deg) rotateZ(${direction * 5}deg)` },
        { opacity: 1, transform: 'perspective(900px) translate3d(0,0,0) rotateX(0) rotateZ(0)' }
      ], { duration: 1750, delay: delay + index * spread, fill: 'backwards' });
    });
  }

  function paintType(record, time, delta) {
    if (record.needsMeasure) measureLetters(record);
    const size = record.size;
    const radius = Math.max(90, size * 2.75);
    let moving = record.hovered;
    const waveSpeed = Math.min(18, 460 / Math.max(1, record.glyphs.length));
    record.glyphs.forEach((glyph, index) => {
      const dx = glyph.x - record.pointerX;
      const dy = glyph.y - record.pointerY;
      const proximity = record.hovered ? Math.max(0, 1 - Math.hypot(dx / radius, dy / (size * 1.8))) : 0;
      const influence = proximity * proximity;
      const waveTime = (time - record.waveStarted - index * waveSpeed) / 650;
      const wave = waveTime > 0 && waveTime < 1 ? Math.sin(waveTime * Math.PI) ** 2 : 0;
      const strength = Math.max(influence, wave * .65);
      const targetRise = -size * (.36 * influence + .17 * wave);
      glyph.velocity = (glyph.velocity + (targetRise - glyph.rise) * .065 * delta) * Math.pow(.78, delta);
      glyph.rise += glyph.velocity * delta;
      const targetRotate = clamp(dx / radius, -1, 1) * influence * -10 + Math.sin(index * .65) * wave * 3;
      glyph.rotate += (targetRotate - glyph.rotate) * Math.min(1, .1 * delta);
      if (Math.abs(glyph.rise) > .025 || Math.abs(glyph.velocity) > .025 || wave > 0) moving = true;
      glyph.node.style.transform = `translate3d(0,${glyph.rise.toFixed(2)}px,0) rotate(${glyph.rotate.toFixed(2)}deg) scaleY(${(1 + strength * .06).toFixed(3)})`;
      glyph.node.style.setProperty('--glyph-echo', `${(-glyph.rise * .9).toFixed(2)}px`);
      glyph.node.style.setProperty('--glyph-trail', (strength * .17).toFixed(3));
      glyph.node.classList.toggle('is-hot', strength > .055);
    });
    if (!moving && time - record.waveStarted > 1350) resetType(record);
  }

  function measureScene() {
    dirty = false;
    const viewportHeight = innerHeight;
    const stageRect = stage.getBoundingClientRect();
    const photoRect = photoFrame.getBoundingClientRect();
    const dividerRect = divider.getBoundingClientRect();
    const heroRect = hero.getBoundingClientRect();
    const architectureRect = architecture.getBoundingClientRect();
    stageVisible = stageRect.top < viewportHeight && stageRect.bottom > 0;
    photoVisible = photoRect.top < viewportHeight + 80 && photoRect.bottom > -80;
    trackVisible = dividerRect.top < viewportHeight + 120 && dividerRect.bottom > -120;
    heroVisible = heroRect.bottom > 0;
    blueprintVisible = architectureRect.top < viewportHeight && architectureRect.bottom > 0;
    sceneProgress = clamp((viewportHeight - stageRect.top) / (viewportHeight + stageRect.height));
    photoProgress = clamp((viewportHeight - photoRect.top) / (viewportHeight + photoRect.height));
    heroProgress = clamp(-heroRect.top / Math.max(1, heroRect.height));
    blueprintProgress = clamp((viewportHeight - architectureRect.top) / (viewportHeight + architectureRect.height));
    trackLength = Math.max(1, track.scrollWidth / 2);
    activeType.forEach(record => { record.needsMeasure = true; });
  }
  function tick(time) {
    frame = 0;
    if (destroyed || document.hidden) return;
    const delta = lastTime ? clamp((time - lastTime) / 16.667, .2, 2) : 1;
    lastTime = time;
    if (dirty) measureScene();
    if (!motionAllowed()) return;
    elapsed += delta / 60;
    const smoothing = 1 - Math.exp(-delta * .065);
    smoothScene += (sceneProgress - smoothScene) * smoothing;
    smoothPhoto += (photoProgress - smoothPhoto) * smoothing;
    smoothHero += (heroProgress - smoothHero) * smoothing;
    smoothBlueprint += (blueprintProgress - smoothBlueprint) * smoothing;
    scrollVelocity *= Math.pow(.91, delta);
    activeType.forEach(record => paintType(record, time, delta));
    if (trackVisible) {
      trackOffset = (trackOffset + (.52 + Math.abs(scrollVelocity) * .08) * delta) % trackLength;
      const transform = `translate3d(${-trackOffset}px,0,0) skewX(${clamp(-scrollVelocity * .17, -7, 7).toFixed(2)}deg)`;
      track.style.setProperty('--kinetic-transform', transform);
      track.style.transform = transform;
      trackStars.forEach((star, index) => { star.style.transform = `rotate(${elapsed * 23 + index * 45 + scrollY * .04}deg)`; });
    }
    if (stageVisible) {
      stage.style.setProperty('--orbit-angle', `${-24 + elapsed * 5 + smoothScene * 35}deg`);
      if (Math.abs(previousSceneProgress - smoothScene) > .0004) {
        document.dispatchEvent(new CustomEvent('f10:scene-scroll', { detail: { progress: smoothScene } }));
        previousSceneProgress = smoothScene;
      }
    }
    if (heroVisible) {
      const lines = heroTitle.querySelectorAll('.title-line');
      lines.forEach((line, index) => { line.style.transform = `translate3d(${smoothHero * (index ? 42 : -42)}px,${smoothHero * -16}px,0)`; });
    }
    if (photoVisible) {
      photo.style.transform = `translate3d(0,${(smoothPhoto - .5) * 36}px,0) scale(${1.13 - smoothPhoto * .07})`;
      photoFrame.style.setProperty('--photo-reveal', String(smoothPhoto));
    }
    if (blueprintVisible) {
      blueprint.style.rotate = `${(smoothBlueprint - .5) * 1.6}deg`;
    }
    const settling = Math.abs(smoothPhoto - photoProgress) + Math.abs(smoothHero - heroProgress) + Math.abs(smoothBlueprint - blueprintProgress) > .0008;
    if (trackVisible || stageVisible || activeType.size || Math.abs(scrollVelocity) > .2 || settling) schedule();
  }

  const revealCallbacks = new Map();
  const revealObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      revealCallbacks.get(entry.target)?.();
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: .12 }) : null;
  function observeReveal(element, callback) {
    if (!element) return;
    if (revealObserver) { revealCallbacks.set(element, callback); revealObserver.observe(element); }
    else callback();
  }

  body.classList.add('engine-effects-ready');
  document.querySelectorAll(textSelector).forEach(element => {
    if (element.querySelector('[data-spec]')) return;
    const record = prepareType(element);
    observeReveal(element, () => revealType(record, element === heroTitle ? 120 : 0));
  });
  observeReveal(visual, () => play(visual, [
    { opacity: 0, transform: 'perspective(1600px) translate3d(0,95px,-80px) rotateX(13deg) scale(.95)', clipPath: 'inset(8% 3% 0 round 40px)' },
    { opacity: 1, transform: 'perspective(1600px) translate3d(0,0,0) rotateX(0) scale(1)', clipPath: 'inset(0 round 14px)' }
  ], { duration: 2200, delay: 160, fill: 'backwards' }));
  observeReveal(blueprint, () => {
    play(blueprint, [{ opacity: 0, transform: 'perspective(1000px) rotateY(-17deg) translateX(-65px)' }, { opacity: 1, transform: 'perspective(1000px) rotateY(0) translateX(0)' }], { duration: 1800, fill: 'backwards' });
    blueprint.querySelectorAll('.diagram-outline, .diagram-structure').forEach((path, index) => {
      const length = path.getTotalLength();
      play(path, [{ strokeDasharray: `${length} ${length}`, strokeDashoffset: length }, { strokeDasharray: `${length} ${length}`, strokeDashoffset: 0 }], { duration: 1800, delay: 180 + index * 110, fill: 'backwards' });
    });
  });
  observeReveal(powerTile, () => play(powerTile, [
    { opacity: 0, transform: 'perspective(1200px) translate3d(80px,65px,0) rotateY(-18deg) rotateZ(3deg)' },
    { opacity: 1, transform: 'perspective(1200px) translate3d(0,0,0) rotateY(0) rotateZ(0)' }
  ], { duration: 1850, fill: 'backwards' }));
  observeReveal(photoFrame, () => play(photoFrame, [
    { clipPath: 'inset(19% 12% 19% 12% round 90px)', opacity: .35 },
    { clipPath: 'inset(0% 0% 0% 0% round 12px)', opacity: 1 }
  ], { duration: 2300, fill: 'backwards' }));
  document.querySelectorAll('.metric').forEach((metric, index) => observeReveal(metric, () => {
    play(metric, [{ opacity: 0, transform: `perspective(900px) translate3d(${index % 2 ? 40 : -40}px,45px,0) rotateX(-15deg)` }, { opacity: 1, transform: 'perspective(900px) translate3d(0,0,0) rotateX(0)' }], { duration: 1700, delay: index * 130, fill: 'backwards' });
  }));

  document.querySelectorAll('.engine-model, .power-tile').forEach(panel => {
    let rect;
    on(panel, 'pointerenter', event => {
      if (event.pointerType === 'touch') return;
      rect = panel.getBoundingClientRect();
      panel.style.setProperty('--panel-light', '1');
    });
    on(panel, 'pointermove', event => {
      if (!finePointer.matches || !motionAllowed() || !rect) return;
      const x = clamp((event.clientX - rect.left) / rect.width);
      const y = clamp((event.clientY - rect.top) / rect.height);
      panel.style.setProperty('--panel-x', `${x * 100}%`);
      panel.style.setProperty('--panel-y', `${y * 100}%`);
      panel.style.setProperty('--panel-rotate-x', `${(y - .5) * -12}deg`);
      panel.style.setProperty('--panel-rotate-y', `${(x - .5) * 14}deg`);
    }, { passive: true });
    on(panel, 'pointerleave', () => {
      panel.style.setProperty('--panel-light', '0');
      panel.style.setProperty('--panel-rotate-x', '0deg');
      panel.style.setProperty('--panel-rotate-y', '0deg');
      rect = null;
    });
  });
  document.querySelectorAll('.engine-lead .text-link, .next-chapter .button, .diagram-button').forEach(button => {
    let rect;
    on(button, 'pointerenter', () => { rect = button.getBoundingClientRect(); });
    on(button, 'pointermove', event => {
      if (!finePointer.matches || !motionAllowed() || !rect) return;
      const x = clamp((event.clientX - rect.left - rect.width / 2) * .13, -10, 10);
      const y = clamp((event.clientY - rect.top - rect.height / 2) * .22, -7, 7);
      button.style.translate = `${x}px ${y}px`;
    }, { passive: true });
    on(button, 'pointerleave', () => { button.style.translate = '0px 0px'; rect = null; });
  });
  document.querySelectorAll('[data-model-choice]').forEach(button => on(button, 'click', () => {
    ['.engine-model .model-title', '.engine-model .model-mark'].forEach(selector => revealType(prepareType(document.querySelector(selector))));
    document.querySelectorAll('.metric dd').forEach((number, index) => {
      play(number, [{ opacity: .1, transform: 'perspective(500px) rotateX(-45deg) translateY(17px)' }, { opacity: 1, transform: 'perspective(500px) rotateX(0) translateY(0)' }], { duration: 800, delay: index * 55, fill: 'backwards' });
    });
    dirty = true;
    schedule();
  }));
  document.querySelectorAll('[data-diagram-choice]').forEach(button => on(button, 'click', () => {
    const copy = document.querySelector(`[data-diagram-copy="${button.dataset.diagramChoice}"]`);
    const heading = copy.querySelector('h3');
    revealType(typeRecords.get(heading) || prepareType(heading));
    play(copy, [{ opacity: .15, transform: 'translate3d(28px,0,0)' }, { opacity: 1, transform: 'translate3d(0,0,0)' }], { duration: 800 });
    dirty = true;
    schedule();
  }));
  document.querySelectorAll('.chapter-theme [data-theme]').forEach(button => on(button, 'click', () => {
    if (!motionAllowed()) return;
    const rect = button.getBoundingClientRect();
    const wave = document.createElement('span');
    wave.className = 'engine-theme-wave';
    wave.setAttribute('aria-hidden', 'true');
    wave.style.left = `${rect.left + rect.width / 2}px`;
    wave.style.top = `${rect.top + rect.height / 2}px`;
    body.append(wave);
    const animation = play(wave, [{ transform: 'scale(.3)', opacity: .7 }, { transform: `scale(${Math.max(innerWidth, innerHeight) / 20})`, opacity: 0 }], { duration: 1100, easing: 'cubic-bezier(.2,.7,.2,1)' });
    if (animation) animation.finished.then(() => wave.remove(), () => wave.remove());
    else wave.remove();
  }));

  on(window, 'scroll', () => {
    scrollVelocity = clamp(scrollY - lastScroll, -60, 60);
    lastScroll = scrollY;
    dirty = true;
    schedule();
  }, { passive: true });
  on(window, 'resize', () => { dirty = true; schedule(); }, { passive: true });
  on(document, 'pointermove', event => {
    if (!finePointer.matches || !motionAllowed()) return;
    glow.style.setProperty('--ambient-x', `${event.clientX / innerWidth * 100}%`);
    glow.style.setProperty('--ambient-y', `${event.clientY / innerHeight * 100}%`);
  }, { passive: true });
  on(document, 'f10:motion', event => {
    paused = event.detail.paused;
    if (paused) {
      activeType.forEach(resetType);
      runningAnimations.forEach(animation => { try { animation.finish(); } catch (_) { animation.cancel(); } });
      heroTitle.querySelectorAll('.title-line').forEach(line => line.style.removeProperty('transform'));
      photo.style.transform = 'none';
      blueprint.style.transform = 'none';
      blueprint.style.rotate = '0deg';
      track.style.transform = 'none';
      track.style.setProperty('--kinetic-transform', 'none');
      document.querySelectorAll('.button, .text-link, .diagram-button').forEach(button => button.style.removeProperty('translate'));
      cancelAnimationFrame(frame);
      frame = 0;
    } else { dirty = true; lastTime = 0; schedule(); }
  });
  on(document, 'visibilitychange', () => {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    if (!document.hidden) { dirty = true; schedule(); }
  });
  on(window, 'pagehide', event => {
    if (event.persisted) return;
    destroyed = true;
    cancelAnimationFrame(frame);
    revealObserver?.disconnect();
    typeRecords.forEach(record => record.events.abort());
    runningAnimations.forEach(animation => animation.cancel());
    listeners.abort();
  });
  document.fonts?.ready.then(() => { dirty = true; schedule(); });
  schedule();
})();
