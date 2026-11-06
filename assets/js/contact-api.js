(() => {
  'use strict';
  const init=() => {
    const form=document.getElementById('inquiryForm');
    if (!form) return;
    const status=document.getElementById('inquiryStatus');
    const result=document.getElementById('inquiryResult');
    const textArea=document.getElementById('inquiryText');
    const http=/^https?:$/.test(location.protocol);
    const setStatus=(message,error=false) => { status.textContent=message; status.classList.toggle('is-error',error); };
    let submitting=false;
    let saved=false;
    // Capture runs before inline onsubmit and the existing chapters.js local-only listener.
    form.addEventListener('submit',async event => {
      if (!http) return; // Preserve the explicitly local-only file:// experience.
      event.preventDefault();
      event.stopImmediatePropagation();
      if (submitting || !form.reportValidity()) return;
      result.hidden=true;
      saved=false;
      const data=new FormData(form);
      const payload=Object.fromEntries(['name','contact','interest','modification','message'].map(key => [key,String(data.get(key) || '').trim()]));
      payload.consent=data.has('consent');
      if (!payload.name || !payload.contact || !payload.interest || !payload.message) {
        setStatus('Заполните обязательные поля: пробелы не заменяют текст.',true); return;
      }
      const button=form.querySelector('[type="submit"]');
      submitting=true;
      if (button) button.disabled=true;
      setStatus('Сохраняем запрос на сервере проекта…');
      try {
        if (!window.F10_API) throw new Error('Клиент API не загружен. Серверное сохранение недоступно.');
        const response=await window.F10_API.request('/api/inquiries',{method:'POST',body:payload});
        saved=true;
        const ticketUrl=`${location.origin}/contact.html?ticket=${encodeURIComponent(response.ticketToken)}`;
        textArea.value=[
          'Запрос · F10 Anatomy',`Номер: ${response.inquiry.id}`,
          'Сохранён на сервере учебного проекта. Дилеру и по email не отправлялся.',
          `Проверка статуса: ${ticketUrl}`,
          'Ссылка содержит секретный код доступа только к статусу. Не публикуйте её.',
          '',`Имя: ${payload.name}`,`Обратная связь: ${payload.contact}`,
          `Тема: ${payload.interest}`,`Модификация: ${payload.modification || 'Не определился'}`,'',payload.message
        ].join('\n');
        result.hidden=false;
        setStatus(`${response.message} Номер: ${response.inquiry.id}. Сохраните текст со ссылкой для проверки статуса.`);
      } catch (error) {
        setStatus(`${error.message} Форма сохранена в браузере, но успешное сохранение запроса на сервере не подтверждено.`,true);
      } finally { submitting=false; if (button) button.disabled=false; }
    },true);
    document.getElementById('copyInquiry')?.addEventListener('click',async event => {
      if (!http) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!saved) { setStatus('Нет подтверждённого сервером запроса для копирования.',true); return; }
      try { await navigator.clipboard.writeText(textArea.value); setStatus('Текст и ссылка на статус скопированы. Запрос уже сохранён на сервере проекта.'); }
      catch { textArea.focus(); textArea.select(); setStatus('Текст выделен. Скопируйте вручную; серверный запрос уже сохранён.'); }
    },true);
    document.getElementById('downloadInquiry')?.addEventListener('click',event => {
      if (!http) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!saved) { setStatus('Нет подтверждённого сервером запроса для скачивания.',true); return; }
      const url=URL.createObjectURL(new Blob([textArea.value],{type:'text/plain;charset=utf-8'}));
      const link=document.createElement('a'); link.href=url; link.download='f10-server-request.txt';
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url),1000);
      setStatus('Скачивание текста и ссылки запущено. Запрос уже сохранён на сервере проекта.');
    },true);
    const ticket=new URLSearchParams(location.search).get('ticket');
    if (ticket && http) {
      const panel=document.createElement('section'); panel.className='contact-result';
      const title=document.createElement('h3'); title.textContent='Статус серверного запроса';
      const message=document.createElement('p'); message.setAttribute('role','status');
      const button=document.createElement('button'); button.type='button'; button.className='button secondary'; button.textContent='Обновить статус';
      panel.append(title,message,button); form.before(panel);
      const update=async () => {
        button.disabled=true; message.textContent='Проверяем статус…';
        try {
          if (!window.F10_API) throw new Error('Клиент API не загружен.');
          const response=await window.F10_API.request(`/api/tickets/${encodeURIComponent(ticket)}`);
          message.textContent=`Статус: ${window.F10_API.statusLabels[response.status] || response.status}. Публичная ссылка не раскрывает контактные данные и текст.`;
        } catch (error) { message.textContent=error.message; }
        finally { button.disabled=false; }
      };
      button.addEventListener('click',update); void update();
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
