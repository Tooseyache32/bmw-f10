(() => {
  'use strict';
  if (window.F10CabinMotion?.version === 'cabin-effects-3') return;
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce) and (update: none)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
  const ease = value => 1 - (1 - value) ** 4;
  const $ = id => document.getElementById(id);
  const heroWrap = $('cabinOrbitSection');
  const hero = $('pilatoStickyHero');
  const image = $('heroMainImg');
  const content = $('heroContentParallax');
  const editorial = $('sectionErgonomics');
  const nav = $('siteNav');
  if (!heroWrap || !hero || !image || !editorial) return;
  const preloader = $('pilatoPreloader');
  const curtain = $('cabinOpeningCurtain');
  const letters = Array.from(document.querySelectorAll('.cabin-flight-letter'));
  const flight = $('cabinFlightTitle');
  const scan = $('cabinScanLine');
  const scrollFill = $('cabinScrollFill');
  const caption = document.querySelector('.cabin-flight-caption');
  const heroLines = Array.from(document.querySelectorAll('.pilato-line'));
  const discover = $('heroDiscoverBtn');
  const states = [];
  const photos = [];
  const counters = [];
  const magnets = [];
  const tilts = [];
  const themeButtons = document.querySelectorAll('[data-theme-choice]');
  let lenis = null;
  let rafId = 0;
  let lastTime = 0;
  let y = scrollY;
  let vh = innerHeight;
  let vw = innerWidth;
  let heroTop = 0;
  let heroTravel = 1;
  let introStart = 0;
  let loaded = false;
  let introComplete = false;
  let dirty = true;
  let lastHero = -1;
  let lastNav = false;
  const flights = [
    [-.82, -.9, -34], [-.58, 1.02, 24], [-.35, -1.08, -18], [-.17, 1.05, 28],
    [.19, -.95, -24], [.42, 1.0, 32], [.62, -.84, 17], [.91, .92, -28]
  ];

  function requestFrame() {
    if (!rafId && !document.hidden) rafId = requestAnimationFrame(tick);
  }
  function setTheme(theme) {
    root.dataset.theme = theme === 'dark' ? 'dark' : 'light';
    themeButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.themeChoice === root.dataset.theme)));
    try { localStorage.setItem('f10-interior-theme', root.dataset.theme); } catch (_) {}
  }
  setTheme(root.dataset.theme);
  themeButtons.forEach(button => button.addEventListener('click', () => setTheme(button.dataset.themeChoice)));

  function setupScroll() {
    if (reduced.matches || !window.Lenis) return;
    lenis = new window.Lenis({ lerp: .06, smoothWheel: true, wheelMultiplier: .95, syncTouch: false });
    lenis.on('scroll', () => { y = scrollY; dirty = true; });
  }
  function scrollTo(target) {
    if (lenis) lenis.scrollTo(target, { duration: 1.55, offset: typeof target === 'number' ? 0 : -90, easing: ease });
    else if (typeof target === 'number') window.scrollTo({ top: target, behavior: reduced.matches ? 'instant' : 'smooth' });
    else target.scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth' });
  }
  document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', event => {
    const target = $(link.getAttribute('href').slice(1));
    if (!target) return;
    event.preventDefault();
    scrollTo(target === heroWrap ? 0 : target);
    if (link.classList.contains('skip-link')) { target.tabIndex = -1; target.focus({ preventScroll: true }); }
  }));
  $('backToTopBtn')?.addEventListener('click', () => scrollTo(0));

  function addState(element, kind, index = 0) {
    const state = { element, kind, index, top: 0, height: 1, progress: 0, target: 0, last: -1, words: [] };
    element.classList.add('cabin-fx-target');
    element.dataset.cabinFx = kind;
    states.push(state);
    return state;
  }
  function prepareText(heading) {
    const state = addState(heading, 'heading');
    heading.setAttribute('aria-label', heading.textContent.replace(/\s+/g, ' ').trim());
    const existingLines = heading.querySelectorAll('.pilato-split-line');
    if (existingLines.length) {
      existingLines.forEach(line => {
        line.classList.add('cabin-fx-word');
        line.parentElement.classList.add('cabin-fx-mask');
        line.parentElement.setAttribute('aria-hidden', 'true');
        state.words.push(line);
      });
      return;
    }
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const fragment = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach(word => {
        if (!word || /^\s+$/.test(word)) { fragment.append(document.createTextNode(word)); return; }
        const mask = document.createElement('span');
        mask.className = 'cabin-fx-mask'; mask.setAttribute('aria-hidden', 'true');
        const inner = document.createElement('span');
        inner.className = 'cabin-fx-word'; inner.textContent = word;
        mask.append(inner); fragment.append(mask); state.words.push(inner);
      });
      node.replaceWith(fragment);
    });
  }
  function prepareContent() {
    document.querySelectorAll('.section-title, .feature-title, .statement h2, #closingTitle').forEach(prepareText);
    document.querySelectorAll('.editorial .eyebrow, .intro-copy, .feature-number, .feature-description, .feature-note, .statement>p, .closing-actions, .materials-note, .interior-footer').forEach((element, index) => {
      if (element.closest('.intro-copy') && !element.classList.contains('intro-copy')) return;
      addState(element, 'copy', index);
    });
    document.querySelectorAll('.feature-photo').forEach((element, index) => {
      const state = addState(element, 'photo', index);
      const img = element.querySelector('img');
      const layer = document.createElement('div'); layer.className = 'cabin-photo-depth';
      if (img) { img.before(layer); layer.append(img); }
      state.layer = layer;
      state.label = element.querySelector('.photo-label');
      photos.push(state);
    });
    document.querySelectorAll('.spec').forEach((element, index) => {
      addState(element, 'spec', index);
      const number = element.querySelector('[data-count-to]');
      if (number) counters.push({ element: number, container: element, target: Number(number.dataset.countTo), decimals: Number(number.dataset.decimals || 0), started: 0, done: false });
    });
    document.querySelectorAll('.feature, .closing').forEach((element, index) => {
      const state = addState(element, 'card', index);
      const surface = document.createElement('div'); surface.className = 'cabin-card-surface';
      while (element.firstChild) surface.append(element.firstChild);
      element.append(surface);
      state.surface = surface;
      tilts.push({ element, surface, x: 0, z: 0, targetX: 0, targetZ: 0, hovered: false, rect: null });
    });
  }
  function measure() {
    vw = innerWidth; vh = innerHeight;
    heroTop = heroWrap.getBoundingClientRect().top + scrollY;
    heroTravel = Math.max(1, heroWrap.offsetHeight - hero.offsetHeight);
    states.forEach(state => {
      const oldTranslate = state.element.style.translate;
      state.element.style.translate = '';
      const rect = state.element.getBoundingClientRect();
      state.top = rect.top + scrollY;
      state.height = rect.height;
      state.element.style.translate = oldTranslate;
    });
    dirty = true; lastHero = -1; requestFrame();
  }

  function updateHero(time) {
    const scrollProgress = clamp((y - heroTop) / heroTravel);
    const opening = reduced.matches ? 1 : clamp((time - introStart) / 1650);
    if (!loaded) return;
    const openingEase = ease(opening);
    if (!introComplete) {
      if (preloader) preloader.style.transform = `translate3d(0,${(-openingEase * 105).toFixed(2)}%,0)`;
      if (curtain) curtain.style.transform = `scaleY(${(1 - openingEase).toFixed(4)})`;
      hero.classList.add('is-ready', 'is-assembled');
      if (opening >= 1) {
        introComplete = true;
        if (preloader) preloader.hidden = true;
        if (curtain) curtain.hidden = true;
      }
    }
    if (scrollProgress === lastHero && introComplete) return;
    lastHero = scrollProgress;
    const p = reduced.matches ? 0 : scrollProgress;
    const scatter = clamp((p - .025) / .48);
    letters.forEach((letter, index) => {
      const t = clamp((scatter - index * .015) / (1 - index * .015));
      const [dx, dy, rotation] = flights[index];
      const entrance = clamp((opening - .15 - index * .025) / .45);
      const entranceEase = ease(entrance);
      letter.style.transform = `translate3d(${(dx * vw * t).toFixed(2)}px,${(dy * vh * t + (1 - entranceEase) * 95).toFixed(2)}px,0) rotate(${(rotation * t).toFixed(2)}deg)`;
      letter.style.opacity = String(entranceEase * (1 - clamp((t - .91) / .09)));
    });
    if (caption) caption.style.opacity = String(openingEase * (1 - clamp(p * 7)));
    const textIn = ease(clamp((p - .28) / .16));
    const textOut = clamp((p - .67) / .3);
    heroLines.forEach((line, index) => {
      line.style.opacity = String(textIn * (1 - textOut));
      line.style.transform = `translate3d(0,${((1 - textIn) * (55 + index * 15) - textOut * 75).toFixed(2)}px,0)`;
    });
    const frameProgress = ease(clamp((p - .52) / .48));
    const inset = (vw < 700 ? 4 : 11) * frameProgress;
    image.style.clipPath = `inset(${(frameProgress * 7).toFixed(2)}% ${inset.toFixed(2)}% round ${(frameProgress * 24).toFixed(1)}px)`;
    image.style.transform = `translate3d(0,${(-p * 4).toFixed(2)}%,0) scale(${(1.02 + (1 - openingEase) * .16 + p * .05).toFixed(4)})`;
    image.style.opacity = '1';
    hero.style.opacity = String(1 - clamp((p - .88) / .12) * .4);
    if (discover) discover.style.opacity = String(openingEase * (1 - clamp(p * 2.8)));
    if (scan) {
      scan.style.transform = `translate3d(0,${((openingEase + p) * vh).toFixed(1)}px,0)`;
      scan.style.opacity = String((1 - opening) * .65);
    }
    if (scrollFill) scrollFill.style.transform = `scaleX(${p.toFixed(4)})`;
  }
  function targetProgress(state) {
    const start = state.top - vh * .94;
    const travel = state.kind === 'photo' || state.kind === 'card' ? vh * .65 : vh * .45;
    return clamp((y - start) / Math.max(1, travel));
  }
  function drawState(state) {
    const p = ease(state.progress);
    if (state.kind === 'heading') {
      state.words.forEach((word, index) => {
        const local = ease(clamp((state.progress - Math.min(index, 10) * .025) / .72));
        word.style.transform = `translate3d(0,${((1 - local) * 115).toFixed(2)}%,0) rotateX(${((1 - local) * -22).toFixed(2)}deg)`;
        word.style.opacity = String(local);
      });
      return;
    }
    if (state.kind === 'photo') {
      const direction = state.index % 2 ? -1 : 1;
      state.element.style.clipPath = direction > 0
        ? `inset(0 ${(1 - p) * 100}% 0 0 round 18px)`
        : `inset(0 0 0 ${(1 - p) * 100}% round 18px)`;
      const imageY = clamp((y + vh - state.top) / (vh + state.height)) - .5;
      state.layer.style.transform = `translate3d(0,${(imageY * (vw < 700 ? 24 : 55)).toFixed(2)}px,0) scale(${(1.06 + (1 - p) * .22).toFixed(4)})`;
      if (state.label) { state.label.style.opacity = String(clamp((p - .35) / .65)); state.label.style.translate = `0 ${((1 - p) * 28).toFixed(1)}px`; }
      return;
    }
    const direction = state.index % 2 ? 1 : -1;
    const distance = vw < 700 ? 32 : 82;
    if (state.kind === 'card') {
      state.element.style.transform = `perspective(1400px) translate3d(${((1 - p) * direction * distance).toFixed(2)}px,${((1 - p) * 75).toFixed(2)}px,0) rotateY(${((1 - p) * direction * -8).toFixed(2)}deg) scale(${(.94 + p * .06).toFixed(4)})`;
    } else {
      state.element.style.transform = `translate3d(${((1 - p) * (state.kind === 'spec' ? 0 : direction * 20)).toFixed(2)}px,${((1 - p) * (state.kind === 'spec' ? 80 : 40)).toFixed(2)}px,0)`;
    }
    state.element.style.opacity = String(clamp(state.progress * 4));
  }
  function updateContent(dt, time) {
    const alpha = 1 - Math.exp(-dt / 110);
    let moving = false;
    states.forEach(state => {
      if (y + vh < state.top - 160 || y > state.top + state.height + 160) return;
      state.target = reduced.matches ? 1 : targetProgress(state);
      state.progress += (state.target - state.progress) * alpha;
      if (Math.abs(state.target - state.progress) < .001) state.progress = state.target;
      const imageMoving = state.kind === 'photo';
      if (Math.abs(state.progress - state.last) > .0001 || imageMoving) {
        drawState(state); state.last = state.progress;
      }
      if (Math.abs(state.progress - state.target) > .001) moving = true;
    });
    counters.forEach(counter => {
      if (counter.done) return;
      if (!counter.started && counter.container.getBoundingClientRect().top < vh * .85) counter.started = time;
      if (!counter.started) return;
      const p = reduced.matches ? 1 : clamp((time - counter.started) / 1500);
      counter.element.textContent = (counter.target * ease(p)).toFixed(counter.decimals).replace('.', ',');
      if (p === 1) counter.done = true;
      else moving = true;
    });
    tilts.forEach(state => {
      if (!state.hovered && Math.abs(state.x) < .01 && Math.abs(state.z) < .01) return;
      state.x += (state.targetX - state.x) * alpha;
      state.z += (state.targetZ - state.z) * alpha;
      state.surface.style.transform = `perspective(1200px) rotateX(${state.x.toFixed(3)}deg) rotateY(${state.z.toFixed(3)}deg)`;
      if (Math.abs(state.targetX - state.x) > .01 || Math.abs(state.targetZ - state.z) > .01) moving = true;
    });
    magnets.forEach(state => {
      if (Math.abs(state.x - state.targetX) < .01 && Math.abs(state.y - state.targetY) < .01) return;
      state.x += (state.targetX - state.x) * alpha; state.y += (state.targetY - state.y) * alpha;
      state.element.style.translate = `${state.x.toFixed(2)}px ${state.y.toFixed(2)}px`;
      moving = true;
    });
    return moving;
  }
  function setupPointer() {
    if (!fine.matches || reduced.matches) return;
    tilts.forEach(state => {
      state.element.addEventListener('pointerenter', () => { state.hovered = true; state.rect = state.element.getBoundingClientRect(); });
      state.element.addEventListener('pointermove', event => {
        if (!state.rect) return;
        const px = clamp((event.clientX - state.rect.left) / state.rect.width);
        const py = clamp((event.clientY - state.rect.top) / state.rect.height);
        state.targetX = (.5 - py) * 6; state.targetZ = (px - .5) * 7;
        state.surface.style.setProperty('--mx', `${px * 100}%`); state.surface.style.setProperty('--my', `${py * 100}%`);
        state.surface.style.setProperty('--glare-op', '.6');
        dirty = true; requestFrame();
      }, { passive: true });
      state.element.addEventListener('pointerleave', () => { state.hovered = false; state.targetX = 0; state.targetZ = 0; state.surface.style.setProperty('--glare-op', '0'); dirty = true; requestFrame(); });
    });
    document.querySelectorAll('[data-magnetic]').forEach(element => {
      const state = { element, x: 0, y: 0, targetX: 0, targetY: 0 };
      magnets.push(state);
      element.addEventListener('pointermove', event => {
        const rect = element.getBoundingClientRect();
        state.targetX = (event.clientX - rect.left - rect.width / 2) * .2;
        state.targetY = (event.clientY - rect.top - rect.height / 2) * .2;
        dirty = true; requestFrame();
      }, { passive: true });
      element.addEventListener('pointerleave', () => { state.targetX = 0; state.targetY = 0; dirty = true; requestFrame(); });
    });
  }
  function revealImage() {
    if (loaded) return;
    loaded = true; introStart = performance.now();
    root.classList.add('cabin-effects-active');
    measure(); requestFrame();
  }
  function tick(time) {
    rafId = 0;
    if (document.hidden) return;
    lenis?.raf(time);
    const dt = Math.min(64, lastTime ? time - lastTime : 16.7);
    lastTime = time;
    let moving = false;
    if (dirty || !introComplete) updateHero(time);
    if (dirty || !introComplete) moving = updateContent(dt, time);
    dirty = moving;
    const nextNav = y > editorial.getBoundingClientRect().top + y - 90;
    if (nav && nextNav !== lastNav) { nav.classList.toggle('is-editorial', nextNav); lastNav = nextNav; }
    if (lenis || dirty || !introComplete) requestFrame();
  }
  function showWithoutMotion() {
    root.classList.remove('cabin-effects-active');
    if (preloader) preloader.hidden = true;
    if (curtain) curtain.hidden = true;
    hero.classList.add('is-ready', 'is-assembled');
    image.style.opacity = '1';
    states.forEach(state => { state.progress = 1; drawState(state); });
    if (flight) flight.style.opacity = '1';
  }
  try {
    prepareContent(); setupScroll(); setupPointer();
    if (image.complete) revealImage();
    else { image.addEventListener('load', revealImage, { once: true }); image.addEventListener('error', revealImage, { once: true }); }
    if (reduced.matches) showWithoutMotion();
    measure(); requestFrame();
    window.F10CabinMotion = { version: 'cabin-effects-3', scrollTo };
    root.dataset.cabinMotion = 'ready';
  } catch (error) {
    showWithoutMotion();
    root.dataset.cabinMotion = 'fallback';
    console.error('Cabin effects could not start:', error);
  }
  window.addEventListener('scroll', () => { y = scrollY; dirty = true; requestFrame(); }, { passive: true });
  window.addEventListener('resize', () => { measure(); requestFrame(); }, { passive: true });
  window.addEventListener('load', measure, { once: true });
  document.querySelectorAll('.editorial img').forEach(img => img.addEventListener('load', measure, { once: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(rafId); rafId = 0; }
    else { lastTime = 0; dirty = true; requestFrame(); }
  });
  reduced.addEventListener('change', () => {
    lenis?.destroy(); lenis = null;
    if (reduced.matches) showWithoutMotion();
    else { setupScroll(); root.classList.add('cabin-effects-active'); dirty = true; requestFrame(); }
  });
})();
