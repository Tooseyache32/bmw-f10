(() => {
  'use strict';
  const page = document.body.dataset.page;
  if (!['tech', 'versions', 'contact'].includes(page)) return;
  const body = document.body;
  const easing = 'cubic-bezier(.18,.76,.16,1)';
  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const abort = new AbortController();
  const on = (element, event, callback, options = {}) => element?.addEventListener(event, callback, { ...options, signal: abort.signal });
  const records = new Map();
  const running = new Set();
  const depths = [];
  const narrow = matchMedia('(max-width: 760px)');
  let destroyed = false;
  let frame = 0;
  let lastTime = 0;
  let dirty = true;
  let revealObserver;

  function play(element, frames, options = {}) {
    if (!element?.animate || destroyed) return null;
    const animation = element.animate(frames, { duration: 1650, easing, fill: 'backwards', ...options });
    running.add(animation);
    animation.finished.then(() => running.delete(animation), () => running.delete(animation));
    return animation;
  }
  function trajectory(kind, index) {
    const travel = narrow.matches ? .38 : 1;
    const sign = index % 2 ? 1 : -1;
    const variants = {
      left: [`translate3d(${-110 * travel}px,42px,0) rotate(-3deg)`, 'translate3d(0,0,0) rotate(0)'],
      right: [`translate3d(${110 * travel}px,52px,0) rotate(3deg)`, 'translate3d(0,0,0) rotate(0)'],
      rise: ['translate3d(0,100px,0) scale(.965)', 'translate3d(0,0,0) scale(1)'],
      fold: [`perspective(1500px) translate3d(${sign * 65 * travel}px,75px,-50px) rotateY(${sign * 13}deg) rotateX(8deg)`, 'perspective(1500px) translate3d(0,0,0) rotateY(0) rotateX(0)'],
      lens: ['translate3d(0,55px,0) scale(.9)', 'translate3d(0,0,0) scale(1)'],
      paper: [`perspective(1800px) translate3d(${sign * 90 * travel}px,70px,0) rotateZ(${sign * 5}deg) rotateY(${sign * 9}deg)`, 'perspective(1800px) translate3d(0,0,0) rotateZ(0) rotateY(0)'],
      row: [`translate3d(${sign * 48 * travel}px,25px,0)`, 'translate3d(0,0,0)'],
      fade: ['translate3d(0,22px,0)', 'translate3d(0,0,0)']
    };
    const [start, end] = variants[kind] || variants.rise;
    const frames = [{ opacity: 0, transform: start }, { opacity: 1, transform: end }];
    if (kind === 'lens') {
      frames[0].clipPath = 'inset(12% 8% 12% 8% round 60px)';
      frames[1].clipPath = 'inset(0% 0% 0% 0% round 0px)';
    }
    return frames;
  }
  function reveal(record, immediate = false) {
    if (!record || record.done || destroyed) return;
    record.done = true;
    record.element.classList.remove('motion-waiting');
    revealObserver?.unobserve(record.element);
    if (immediate) return;
    record.element.classList.add('motion-running');
    const animation = play(record.element, trajectory(record.kind, record.index), { duration: record.duration, delay: record.delay });
    if (animation) animation.finished.then(() => record.element.classList.remove('motion-running'), () => record.element.classList.remove('motion-running'));
    record.heading?.forEach((glyph, index) => play(glyph, [
      { opacity: 0, transform: page === 'contact' ? 'translate3d(0,75%,0) rotate(-8deg)' : 'perspective(650px) translate3d(0,85%,0) rotateX(-65deg)' },
      { opacity: 1, transform: 'perspective(650px) translate3d(0,0,0) rotateX(0) rotate(0)' }
    ], { duration: 1600, delay: record.delay + 110 + index * Math.min(24, 650 / record.heading.length) }));
  }
  revealObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top).forEach(entry => reveal(records.get(entry.target)));
  }, { threshold: .08, rootMargin: '0px 0px -25px 0px' }) : null;

  function splitHeading(element) {
    if (!element || element.matches('[data-model-text], [data-selected-model]') || element.querySelector('[data-spec], .motion-text-word')) return [];
    const text = element.textContent;
    const nodes = [];
    const glyphs = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, { acceptNode: node => node.textContent.trim() && !node.parentElement.closest('[aria-hidden="true"]') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const fragment = document.createDocumentFragment();
      (node.textContent.match(/\s+|\S+/g) || []).forEach(token => {
        if (!token.trim()) { fragment.append(document.createTextNode(token)); return; }
        const word = document.createElement('span');
        word.className = 'motion-text-word';
        word.setAttribute('aria-hidden', 'true');
        Array.from(token).forEach((letter, index) => {
          const glyph = document.createElement('span');
          glyph.className = 'motion-text-glyph';
          glyph.textContent = letter;
          glyph.style.setProperty('--glyph-order', String(index));
          word.append(glyph);
          glyphs.push(glyph);
        });
        fragment.append(word);
      });
      node.replaceWith(fragment);
    });
    const accessible = document.createElement('span');
    accessible.className = 'motion-accessible';
    accessible.textContent = text;
    element.append(accessible);
    return glyphs;
  }
  function register(element, kind, index = 0, options = {}) {
    if (!element || records.has(element) || element.closest('#inquiryResult')) return;
    element.classList.add('motion-reveal');
    const heading = element.matches('h1,h2,h3') ? splitHeading(element) : null;
    const record = { element, kind, index, delay: options.delay ?? (index % 4) * 95, duration: options.duration || (kind === 'paper' ? 1900 : kind === 'lens' ? 2100 : 1700), done: false, heading };
    records.set(element, record);
    if (revealObserver) {
      const rect = element.getBoundingClientRect();
      if (rect.top > innerHeight + 40 && !element.matches('.field,.check-field')) element.classList.add('motion-waiting');
      revealObserver.observe(element);
    } else reveal(record);
  }
  function group(selector, kind, options) { document.querySelectorAll(selector).forEach((element, index) => register(element, typeof kind === 'function' ? kind(index) : kind, index, options)); }
  function depth(element, options = {}) {
    if (!element) return;
    element.classList.add(options.image ? 'motion-media' : 'motion-depth');
    const item = { element, region: options.region || element, amount: options.amount || 18, x: options.x || 0, rotation: options.rotation || 0, image: !!options.image, progress: .5, target: .5, visible: false };
    depths.push(item);
  }
  function schedule() { if (!frame && !destroyed && !document.hidden) frame = requestAnimationFrame(paint); }
  function measure() {
    dirty = false;
    depths.forEach(item => {
      const rect = item.region.getBoundingClientRect();
      item.visible = rect.top < innerHeight + 80 && rect.bottom > -80;
      item.target = clamp((innerHeight - rect.top) / (innerHeight + rect.height));
    });
  }
  function paint(time) {
    frame = 0;
    if (destroyed || document.hidden) return;
    const dt = lastTime ? Math.min((time - lastTime) / 1000, .05) : 1 / 60;
    lastTime = time;
    if (dirty) measure();
    let settling = false;
    depths.forEach(item => {
      if (!item.visible) return;
      item.progress += (item.target - item.progress) * (1 - Math.exp(-dt * 5));
      const p = (item.progress - .5) * (narrow.matches ? .55 : 1);
      if (Math.abs(item.progress - item.target) > .0004) settling = true;
      if (item.image) {
        item.element.style.setProperty('--image-y', `${p * item.amount}px`);
        item.element.style.setProperty('--image-scale', String(1.07 + Math.abs(p) * .025));
      } else {
        item.element.style.setProperty('--depth-y', `${p * item.amount}px`);
        item.element.style.setProperty('--depth-x', `${p * item.x}px`);
        item.element.style.setProperty('--depth-rotate', `${p * item.rotation}deg`);
      }
    });
    if (settling) schedule();
  }

  body.classList.add('chapter-cinema-ready');
  if (page === 'tech') {
    group('.tech-kicker-row', 'fade');
    group('#tech-title', 'left', { delay: 90, duration: 1900 });
    group('.tech-hero-intro', 'right', { delay: 260 });
    group('.tech-hero-panel', 'lens', { delay: 190 });
    group('.tech-hero-caption > *', 'right');
    group('.section-head h2,.tech-check-intro h2', 'left');
    group('.section-head > .lede,.tech-check-intro > .lede', 'right');
    group('.tech-suspension-panel', 'fold');
    group('.tech-suspension-copy > h3,.tech-suspension-copy > p', 'right');
    group('.tech-option-list > li', index => index % 2 ? 'right' : 'left');
    group('.tech-under-panel > *', index => index % 2 ? 'right' : 'left');
    group('.tech-assistant-grid > .feature-card,.tech-assistant-stack > .feature-card,.tech-cabin-grid > .feature-card', 'fold');
    group('.tech-comfort-points > div', index => index % 2 ? 'right' : 'left');
    group('.tech-accordions > details', 'row');
    group('.tech-year-note', 'rise');
    group('.tech-next', 'lens');
    group('.tech-next h3', 'right');
    document.querySelectorAll('.tech-hero-photo img,.tech-suspension-photo img,.tech-parking-media img,.tech-idrive-media img,.tech-sound-media img,.tech-comfort-media img').forEach(image => depth(image, { image: true, region: image.parentElement, amount: 24 }));
    document.querySelectorAll('.tech-assistant-stack > .feature-card').forEach((card,index) => depth(card,{ amount: index ? -16 : 16, rotation: index ? .8 : -.8 }));
  } else if (page === 'versions') {
    group('.versions-folio', 'fade');
    group('.versions-heading > h1', 'left', { delay: 110, duration: 1900 });
    group('.versions-heading > .lede', 'right', { delay: 240 });
    group('.versions-stage', 'fold', { delay: 180, duration: 1950 });
    group('.version-intro > *', 'right');
    group('.metric', 'fold');
    group('.section-head h2', 'left');
    group('.section-head > .lede', 'right');
    group('.compare-toolbar', 'fade');
    group('.comparison-table thead th', 'rise');
    group('.comparison-table tbody > tr', 'row', { duration: 1450 });
    group('.comparison-help > p', index => index % 2 ? 'right' : 'left');
    group('.choice-intro > *', 'left');
    group('.choice-row', index => index % 2 ? 'right' : 'left', { duration: 1800 });
    group('.before-buying', 'fold', { duration: 1900 });
    group('.next-chapter h2', 'left');
    group('.next-chapter > .button', 'right');
    depth(document.querySelector('.version-photo img'), { image: true, region: document.querySelector('.version-photo'), amount: 24 });
    document.querySelectorAll('.choice-row').forEach((row,index) => depth(row,{ amount: 10, x: index % 2 ? 8 : -8 }));
    document.querySelectorAll('[data-model-choice]').forEach(button => on(button,'click',() => {
      document.querySelectorAll('.version-number,.version-intro h2,.version-intro > .lede').forEach((element,index) => play(element,[{opacity:.2,transform:'translate3d(30px,18px,0)'},{opacity:1,transform:'translate3d(0,0,0)'}],{duration:1150,delay:index*70}));
      const key = button.dataset.modelChoice;
      document.querySelectorAll(`[data-model-column="${key}"]`).forEach((cell,index) => {
        if (cell.getBoundingClientRect().top > innerHeight) return;
        play(cell,[{opacity:.35},{opacity:1}],{duration:950,delay:index*35});
      });
    }));
    document.querySelectorAll('[data-comparison-filter]').forEach(button => on(button,'click',() => {
      document.querySelectorAll('.comparison-table tbody > tr:not([hidden])').forEach((row,index) => { reveal(records.get(row),true); play(row,[{opacity:.2,transform:'translateY(14px)'},{opacity:1,transform:'translateY(0)'}],{duration:950,delay:Math.min(index*55,450)}); });
      dirty=true; schedule();
    }));
  } else {
    group('.contact-folio', 'fade');
    group('#contactTitle', 'left', { duration: 2000, delay: 100 });
    group('.contact-hero-grid > div > .lede,.contact-hero-grid > div > .text-link', 'left');
    group('.contact-plate', 'paper', { delay: 200, duration: 2100 });
    group('.contact-section-heading h2', 'left');
    group('.contact-section-heading > p,.contact-mode', 'right');
    group('#inquiryForm .form-grid > .field', 'rise', { duration: 1350 });
    group('#inquiryForm .check-field,#inquiryForm .contact-form-actions', 'fade');
    group('.contact-brief > h3', 'right');
    group('.contact-checklist > li', 'paper', { duration: 1750 });
    group('.contact-privacy', 'fade');
    group('.contact-channels h2,.contact-faq h2', 'left');
    group('[data-contact-channels] > *, .contact-channels > p', 'paper');
    group('.contact-faq > details', 'row');
    group('.contact-endnote > *', index => index % 2 ? 'right' : 'left');
    depth(document.querySelector('.contact-plate'), { amount: -16, rotation: 1.2 });
    const form = document.getElementById('inquiryForm');
    on(form,'focusin',event => {
      const field = event.target.closest('.field,.check-field');
      const record = records.get(field);
      reveal(record,true);
      running.forEach(animation => { if (animation.effect?.target === field) animation.finish(); });
    });
    const result = document.getElementById('inquiryResult');
    const resultObserver = new MutationObserver(() => {
      if (!result.hidden) play(result,[{opacity:0,transform:'translate3d(0,35px,0)'},{opacity:1,transform:'translate3d(0,0,0)'}],{duration:1300});
      dirty = true; schedule();
    });
    resultObserver.observe(result,{attributes:true,attributeFilter:['hidden']});
    on(window,'pagehide',() => resultObserver.disconnect());
  }
  group('.chapter-footer-title', 'rise');
  group('.chapter-directory > a', 'row', { duration: 1350 });
  document.querySelectorAll('main details').forEach(details => on(details,'toggle',() => {
    if (details.open) [...details.children].filter(child => child.tagName !== 'SUMMARY').forEach((child,index) => play(child,[{opacity:0,transform:'translate3d(0,-10px,0)'},{opacity:1,transform:'translate3d(0,0,0)'}],{duration:900,delay:index*60}));
    dirty = true; schedule();
  }));
  document.querySelectorAll('textarea,select,.comparison-table-wrap').forEach(element => element.classList.add('motion-native-scroll'));
  on(document,'focusin',event => records.forEach(record => { if(record.element.contains(event.target)) reveal(record,true); }));
  on(window,'scroll',() => { dirty=true; schedule(); },{passive:true});
  on(window,'resize',() => { dirty=true; schedule(); },{passive:true});
  on(document,'visibilitychange',() => { cancelAnimationFrame(frame); frame=0; lastTime=0; if(!document.hidden){dirty=true;schedule();} });
  on(window,'beforeprint',() => { records.forEach(record=>reveal(record,true)); running.forEach(animation=>animation.finish()); });
  on(window,'pagehide',event => {
    if(event.persisted) return;
    destroyed=true; cancelAnimationFrame(frame); revealObserver?.disconnect(); running.forEach(animation=>animation.cancel()); abort.abort();
  });
  schedule();
})();
