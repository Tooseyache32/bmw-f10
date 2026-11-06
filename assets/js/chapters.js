(() => {
  'use strict';
  const pages = [
    ['index.html', 'Главная', '01', 'index'], ['exterior.html', 'Экстерьер', '02', 'exterior'],
    ['interior.html', 'Интерьер', '03', 'interior'], ['engine.html', 'Двигатель', '04', 'engine'],
    ['tech.html', 'Технологии', '05', 'tech'], ['versions.html', 'Модификации', '06', 'versions'],
    ['contact.html', 'Контакты', '07', 'contact']
  ];
  const currentPage = document.body.dataset.page;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const cinematicMotion = ['engine', 'tech', 'versions', 'contact'].includes(currentPage) && document.body.dataset.chapterMotion === 'cinematic';
  const motionReduced = () => reducedMotion.matches && !cinematicMotion;
  const format = (value, decimals = 0) => new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals
  }).format(value);
  const pageLinks = (numbered = false) => pages.map(([href, title, number, key]) =>
    `<a href="${href}"${key === currentPage ? ' aria-current="page"' : ''}>${title}${numbered ? `<span>${number} ↗</span>` : ''}</a>`
  ).join('');
  const header = document.querySelector('[data-site-header]');
  if (header) header.innerHTML = `
    <a href="#main" class="skip-link">Перейти к содержанию</a>
    <header class="chapter-header">
      <div class="chapter-header-inner">
        <a class="chapter-brand" href="index.html" aria-label="F10 Anatomy — главная"><span class="chapter-brand-mark" aria-hidden="true">F10</span><span class="brand-word">Anatomy</span></a>
        <nav class="chapter-nav" aria-label="Все семь страниц">${pageLinks()}</nav>
        <div class="chapter-tools">
          <div class="chapter-theme" role="group" aria-label="Цветовая тема">
            <button type="button" data-theme="light" aria-label="Светлая тема" aria-pressed="true"><span aria-hidden="true">☼</span></button>
            <button type="button" data-theme="dark" aria-label="Тёмная тема" aria-pressed="false"><span aria-hidden="true">◐</span></button>
          </div>
          <button type="button" class="chapter-menu-toggle" aria-controls="chapterMenu" aria-expanded="false">Главы <span aria-hidden="true">+</span></button>
        </div>
      </div>
      <nav id="chapterMenu" class="chapter-menu" aria-label="Мобильная навигация" data-lenis-prevent hidden>${pageLinks(true)}</nav>
      <div class="chapter-progress" aria-hidden="true"></div>
    </header>`;
  const footer = document.querySelector('[data-site-footer]');
  if (footer) footer.innerHTML = `<footer class="chapter-footer">
    <div class="chapter-footer-main"><a href="index.html" class="chapter-footer-title">Собран<br><span>из деталей.</span></a><nav class="chapter-directory" aria-label="Все главы проекта">${pageLinks(true)}</nav></div>
    <div class="chapter-footer-bottom"><span>F10 Anatomy © ${new Date().getFullYear()} · Независимый проект, не официальный сайт BMW.</span><span>Данные относятся к указанному году и комплектации.</span></div>
  </footer>`;

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll('.chapter-theme [data-theme]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.theme === theme)));
    try { localStorage.setItem('f10-interior-theme', theme); } catch (_) {}
  }
  let theme = document.documentElement.dataset.theme || 'light';
  try { theme = localStorage.getItem('f10-interior-theme') || theme; } catch (_) {}
  setTheme(theme === 'dark' ? 'dark' : 'light');
  document.querySelectorAll('.chapter-theme [data-theme]').forEach(button => button.addEventListener('click', () => setTheme(button.dataset.theme)));

  const menuButton = document.querySelector('.chapter-menu-toggle');
  const menu = document.getElementById('chapterMenu');
  function closeMenu() {
    if (!menuButton || !menu) return;
    menu.hidden = true;
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.querySelector('span').textContent = '+';
  }
  menuButton?.addEventListener('click', () => {
    const open = menu.hidden;
    menu.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.querySelector('span').textContent = open ? '−' : '+';
  });
  menu?.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu && !menu.hidden) { closeMenu(); menuButton.focus(); }
  });

  let lenis = null;
  let lenisFrame = 0;
  let scrollDisposed = false;
  function scrollRaf(time) {
    lenisFrame = 0;
    if (!lenis || scrollDisposed || document.hidden) return;
    lenis.raf(time);
    lenisFrame = requestAnimationFrame(scrollRaf);
  }
  function startScroll() {
    if (!window.Lenis || motionReduced() || lenis || scrollDisposed) return;
    lenis = new window.Lenis(cinematicMotion ? {
      lerp: .048,
      smoothWheel: true,
      wheelMultiplier: .88,
      syncTouch: false,
      autoResize: true,
      prevent: element => element.matches('textarea, select, input[type="range"], [contenteditable="true"]'),
      virtualScroll: ({ event, deltaX, deltaY }) => !event.shiftKey && Math.abs(deltaY) >= Math.abs(deltaX)
    } : { lerp: .085, smoothWheel: true, wheelMultiplier: .9 });
    if (cinematicMotion) lenis.on('scroll', instance => document.dispatchEvent(new CustomEvent('f10:scroll', {
      detail: { scroll: instance.scroll, velocity: instance.velocity, progress: instance.progress }
    })));
    lenisFrame = requestAnimationFrame(scrollRaf);
  }
  startScroll();
  reducedMotion.addEventListener('change', () => {
    if (motionReduced() && lenis) {
      cancelAnimationFrame(lenisFrame);
      lenisFrame = 0;
      lenis.destroy();
      lenis = null;
    } else startScroll();
  });
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(lenisFrame);
    lenisFrame = 0;
    if (!document.hidden && lenis && !scrollDisposed) {
      lenis.time = 0;
      lenisFrame = requestAnimationFrame(scrollRaf);
    }
  });
  window.addEventListener('pagehide', event => {
    cancelAnimationFrame(lenisFrame);
    lenisFrame = 0;
    if (!event.persisted) { scrollDisposed = true; lenis?.destroy(); lenis = null; }
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted && lenis && !lenisFrame) { lenis.time = 0; lenisFrame = requestAnimationFrame(scrollRaf); }
  });
  document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', event => {
    const href = link.getAttribute('href');
    if (href.length < 2) return;
    const target = document.getElementById(href.slice(1));
    if (!target) return;
    event.preventDefault();
    closeMenu();
    const isSkip = link.matches('.skip-link, .tech-skip, .contact-skip');
    if (lenis) lenis.scrollTo(target, { offset: -110, duration: isSkip ? .8 : 1.9, lerp: 0 });
    else target.scrollIntoView({ behavior: motionReduced() ? 'instant' : 'smooth' });
    if (isSkip) {
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  }));

  if ('IntersectionObserver' in window && !motionReduced() && !cinematicMotion) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.remove('is-pending'); observer.unobserve(entry.target); }
    }), { threshold: .05 });
    document.querySelectorAll('.reveal').forEach(element => {
      element.classList.add('is-pending'); observer.observe(element);
    });
  }
  const progressBar = document.querySelector('.chapter-progress');
  const parallaxImage = cinematicMotion ? null : document.querySelector('[data-hero-parallax]');
  const hero = parallaxImage?.closest('[data-parallax-region]');
  let paintScheduled = false;
  let scrollRange = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  let heroStart = hero ? hero.getBoundingClientRect().top + scrollY : 0;
  let heroHeight = hero?.offsetHeight || 1;
  function paintScroll() {
    paintScheduled = false;
    if (progressBar) progressBar.style.transform = `scaleX(${Math.min(1, Math.max(0, scrollY / scrollRange))})`;
    if (parallaxImage && !motionReduced() && scrollY < heroStart + heroHeight) {
      const amount = Math.min(1, Math.max(0, (scrollY - heroStart) / heroHeight));
      parallaxImage.style.transform = `translate3d(0,${(amount * 25).toFixed(1)}px,0) scale(1.045)`;
    }
  }
  function schedulePaint() { if (!paintScheduled) { paintScheduled = true; requestAnimationFrame(paintScroll); } }
  function measureScroll() {
    scrollRange = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    heroStart = hero ? hero.getBoundingClientRect().top + scrollY : 0;
    heroHeight = hero?.offsetHeight || 1;
    schedulePaint();
  }
  window.addEventListener('scroll', schedulePaint, { passive: true });
  window.addEventListener('resize', measureScroll, { passive: true });
  window.addEventListener('load', measureScroll, { once: true });
  measureScroll();

  const counting = new WeakMap();
  function animateNumber(element, to, decimals = 0, animate = true) {
    const previousId = counting.get(element);
    if (previousId) cancelAnimationFrame(previousId);
    const from = Number(element.dataset.currentValue ?? to);
    element.dataset.currentValue = String(to);
    if (!animate || motionReduced() || from === to) {
      element.textContent = format(to, decimals); counting.delete(element); return;
    }
    const started = performance.now();
    const step = time => {
      const t = Math.min(1, (time - started) / (cinematicMotion ? 1100 : 700));
      const value = from + (to - from) * (1 - (1 - t) ** 3);
      element.textContent = format(value, decimals);
      if (t < 1) counting.set(element, requestAnimationFrame(step));
      else counting.delete(element);
    };
    counting.set(element, requestAnimationFrame(step));
  }
  const models = window.F10_SPECS?.models;
  const switchButtons = document.querySelectorAll('[data-model-choice]');
  let activeModel = null;
  let hasSelectedModel = false;
  function setModel(key, animate = true) {
    const model = models?.[key];
    if (!model) return;
    activeModel = key;
    switchButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.modelChoice === key)));
    document.querySelectorAll('[data-spec]').forEach(element => {
      const value = model[element.dataset.spec];
      if (typeof value === 'number') animateNumber(element, value, Number(element.dataset.decimals || 0), animate);
      else if (value != null) element.textContent = value;
    });
    document.querySelectorAll('[data-model-text]').forEach(element => {
      const value = model[element.dataset.modelText];
      if (value != null) element.textContent = value;
    });
    document.querySelectorAll('[data-selected-model]').forEach(element => element.textContent = key);
    document.querySelectorAll('[data-model-column]').forEach(element => element.classList.toggle('is-selected', element.dataset.modelColumn === key));
    document.querySelectorAll('[data-model-source]').forEach(link => link.href = model.source);
    document.querySelectorAll('[data-power-bar]').forEach(element => element.style.width = `${model.power / 306 * 100}%`);
    document.querySelectorAll('[data-cylinder]').forEach((element, index) => element.classList.toggle('is-unused', index >= model.cylinders));
    const announcement = document.getElementById('modelAnnouncement');
    if (announcement) announcement.textContent = `${key}: ${model.power} л.с., ${format(model.acceleration, 1)} секунды до 100 км/ч.`;
    const requestLink = document.querySelector('[data-model-request]');
    if (requestLink) requestLink.href = `contact.html?model=${encodeURIComponent(key)}`;
  }
  if (models && switchButtons.length) {
    const choice = new URLSearchParams(location.search).get('model');
    const initial = models[choice] ? choice : (currentPage === 'engine' ? '535i' : '528i');
    setModel(initial, false);
    switchButtons.forEach(button => button.addEventListener('click', () => {
      hasSelectedModel = true;
      setModel(button.dataset.modelChoice);
    }));
    const metrics = document.querySelector('.metric-row');
    if (metrics && 'IntersectionObserver' in window && !motionReduced()) {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          if (hasSelectedModel) { observer.disconnect(); return; }
          metrics.querySelectorAll('[data-spec]').forEach(element => {
            const value = models[activeModel][element.dataset.spec];
            if (typeof value === 'number') {
              element.dataset.currentValue = String(value * .83);
              animateNumber(element, value, Number(element.dataset.decimals || 0));
            }
          });
          observer.disconnect();
        }
      }, { threshold: .25 });
      observer.observe(metrics);
    }
  }
  const diagramButtons = document.querySelectorAll('[data-diagram-choice]');
  diagramButtons.forEach(button => button.addEventListener('click', () => {
    const selected = button.dataset.diagramChoice;
    diagramButtons.forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    document.querySelectorAll('[data-diagram-part]').forEach(part => part.classList.toggle('is-active', part.dataset.diagramPart === selected));
    document.querySelectorAll('[data-diagram-copy]').forEach(part => part.hidden = part.dataset.diagramCopy !== selected);
  }));
  const filterButtons = document.querySelectorAll('[data-comparison-filter]');
  filterButtons.forEach(button => button.addEventListener('click', () => {
    const differencesOnly = button.dataset.comparisonFilter === 'differences';
    filterButtons.forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    document.querySelectorAll('[data-common-row]').forEach(row => row.hidden = differencesOnly);
  }));

  const channels = document.querySelector('[data-contact-channels]');
  const config = window.F10_SITE?.contact || {};
  const isHttpsUrl = value => {
    try { return new URL(value).protocol === 'https:'; } catch (_) { return false; }
  };
  if (channels) {
    const list = document.createElement('div'); list.className = 'contact-channel-list';
    const addChannel = (label, value, href) => {
      const row = document.createElement(href ? 'a' : 'div'); row.className = 'contact-channel';
      if (href) { row.href = href; if (href.startsWith('https:')) { row.target = '_blank'; row.rel = 'noopener noreferrer'; } }
      const strong = document.createElement('strong'); strong.textContent = label;
      const text = document.createElement('span'); text.textContent = value;
      row.append(strong, text); list.append(row);
    };
    if (config.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email)) addChannel('Email', config.email, `mailto:${config.email}`);
    if (config.telegram && isHttpsUrl(config.telegram)) addChannel('Telegram', 'Написать ↗', config.telegram);
    if (config.whatsapp && isHttpsUrl(config.whatsapp)) addChannel('WhatsApp', 'Написать ↗', config.whatsapp);
    if (config.address) addChannel('Адрес', config.address);
    if (list.childElementCount) channels.replaceChildren(list);
  }
  const form = document.getElementById('inquiryForm');
  if (form) {
    const preselected = new URLSearchParams(location.search).get('model');
    if (['520d', '528i', '535i'].includes(preselected)) form.elements.namedItem('modification').value = preselected;
    const status = document.getElementById('inquiryStatus');
    const result = document.getElementById('inquiryResult');
    const textArea = document.getElementById('inquiryText');
    const statusMessage = (message, error = false) => {
      status.textContent = message; status.classList.toggle('is-error', error);
    };
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const data = new FormData(form);
      const fields = ['name', 'contact', 'interest', 'message'];
      const empty = fields.find(name => !String(data.get(name) || '').trim());
      if (empty) { statusMessage('Заполните поля: пробелы не заменяют имя, контакт или текст.', true); return; }
      const text = [
        'Запрос · F10 Anatomy', '', `Имя: ${String(data.get('name')).trim()}`,
        `Обратная связь: ${String(data.get('contact')).trim()}`,
        `Тема: ${data.get('interest')}`, `Модификация: ${data.get('modification') || 'Не определился'}`,
        '', String(data.get('message')).trim()
      ].join('\n');
      textArea.value = text; result.hidden = false;
      statusMessage('Текст готов. Он не отправлен: скопируйте или скачайте его для выбранного вами получателя.');
    });
    document.getElementById('copyInquiry')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(textArea.value);
        statusMessage('Текст скопирован. Автоматической отправки не было.');
      } catch (_) {
        textArea.focus(); textArea.select();
        statusMessage('Браузер не дал доступ к буферу. Текст выделен — скопируйте его вручную.');
      }
    });
    document.getElementById('downloadInquiry')?.addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob([textArea.value], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = 'f10-request.txt';
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      statusMessage('Скачивание текста запущено. Запрос не отправлен.');
    });
  }
})();
