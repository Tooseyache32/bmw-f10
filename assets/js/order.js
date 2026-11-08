(() => {
  'use strict';
  const form = document.getElementById('orderForm');
  if (!form) return;
  const status = document.getElementById('orderStatus');
  const button = document.getElementById('orderSubmit');
  const buttonLabel = button.querySelector('[data-order-button-label]');
  const modelSelect = document.getElementById('orderModel');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let submitting = false;
  let saved = false;

  function setStatus(message, kind = '') {
    status.textContent = message;
    status.classList.toggle('is-error', kind === 'error');
    status.classList.toggle('is-success', kind === 'success');
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll('.chapter-theme [data-theme]').forEach(control => {
      control.setAttribute('aria-pressed', String(control.dataset.theme === theme));
    });
    try { localStorage.setItem('f10-interior-theme', theme); } catch (_) {}
  }
  setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  document.querySelectorAll('.chapter-theme [data-theme]').forEach(control => {
    control.addEventListener('click', () => setTheme(control.dataset.theme));
  });
  const menu = document.querySelector('.unified-menu');
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) {
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  });
  document.addEventListener('pointerdown', event => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });

  const preselected = new URLSearchParams(location.search).get('model');
  if (['520d', '528i', '535i'].includes(preselected)) modelSelect.value = preselected;
  if (!reducedMotion.matches) {
    document.querySelector('.order-heading').animate([
      { opacity: 0, transform: 'translateY(25px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 950, easing: 'cubic-bezier(.2,.8,.2,1)' });
    form.animate([
      { opacity: 0, transform: 'translateY(35px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 1150, delay: 100, fill: 'backwards', easing: 'cubic-bezier(.2,.8,.2,1)' });
  }

  async function loadModels() {
    try {
      const response = await window.F10_API.request('/api/models');
      if (!Array.isArray(response.models) || !response.models.length) return;
      const selected = modelSelect.value;
      const first = document.createElement('option');
      first.value = '';
      first.disabled = true;
      first.textContent = 'Выберите автомобиль';
      modelSelect.replaceChildren(first);
      response.models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.slug;
        option.textContent = `BMW F10 · ${model.name}`;
        modelSelect.append(option);
      });
      modelSelect.value = response.models.some(model => model.slug === selected) ? selected : '';
    } catch (_) {}
  }
  if (window.F10_API) loadModels();

  form.addEventListener('input', () => {
    if (submitting || !saved) return;
    saved = false;
    button.disabled = false;
    buttonLabel.textContent = 'Отправить заявку';
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || saved || !form.reportValidity()) return;
    const data = new FormData(form);
    const phone = String(data.get('phone') || '').trim();
    const digits = phone.replace(/\D/g, '');
    if (!/^\+?[0-9\s().-]+$/.test(phone) || digits.length < 10 || digits.length > 15) {
      setStatus('Укажите телефон: от 10 до 15 цифр.', 'error');
      document.getElementById('orderPhone').focus();
      return;
    }
    const payload = {
      name: String(data.get('name') || '').trim(),
      phone,
      modification: String(data.get('modification') || ''),
      city: String(data.get('city') || '').trim(),
      budget: data.get('budget') === '' ? null : Number(data.get('budget')),
      message: String(data.get('message') || '').trim(),
      consent: data.has('consent')
    };
    if (!payload.name || !payload.city) {
      setStatus('Заполните имя и город: пробелы не заменяют текст.', 'error');
      return;
    }
    submitting = true;
    button.disabled = true;
    buttonLabel.textContent = 'Сохраняем…';
    form.setAttribute('aria-busy', 'true');
    setStatus('Отправляем заявку…');
    try {
      if (!window.F10_API) throw new Error('Не удалось подключить форму. Обновите страницу.');
      const response = await window.F10_API.request('/api/car-orders', { method: 'POST', body: payload });
      if (!response.order?.id) throw new Error('Сервер не подтвердил сохранение заявки.');
      saved = true;
      setStatus(`Заявка №${response.order.id} на BMW F10 ${payload.modification} сохранена.`, 'success');
      buttonLabel.textContent = 'Заявка отправлена';
    } catch (error) {
      setStatus(`${error.message} Введённые данные остались в форме.`, 'error');
      buttonLabel.textContent = 'Отправить заявку';
    } finally {
      submitting = false;
      button.disabled = saved;
      form.removeAttribute('aria-busy');
    }
  });
})();
