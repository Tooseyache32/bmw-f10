(() => {
  'use strict';
  const $=id => document.getElementById(id);
  const api=window.F10_API;
  let user=null;
  const status=(message,error=false) => { $('accountStatus').textContent=message; $('accountStatus').classList.toggle('is-error',error); };
  const el=(tag,text,className) => { const node=document.createElement(tag); if (text !== undefined) node.textContent=text; if (className) node.className=className; return node; };
  const date=value => new Date(value).toLocaleString('ru-RU');
  async function inquiries() {
    const response=await api.request('/api/inquiries');
    const list=$('ownInquiries'); list.replaceChildren();
    if (!response.inquiries.length) list.append(el('p','У вас пока нет серверных запросов.','muted'));
    for (const item of response.inquiries) {
      const article=el('article',undefined,'inquiry');
      const heading=el('div',undefined,'inquiry-header');
      heading.append(el('h3',`№ ${item.id} · ${item.interest}`),el('span',api.statusLabels[item.status],'badge'));
      article.append(heading,el('p',`${date(item.createdAt)} · ${item.modification || 'Не определился'}`,'meta'),
        el('p',`${item.name} · ${item.contact}`,'meta'),el('p',item.message,'message'));
      list.append(article);
    }
  }
  async function favorites() {
    const [catalog,saved]=await Promise.all([api.request('/api/models'),api.request('/api/favorites')]);
    const selected=new Set(saved.favorites.map(model => model.slug));
    const list=$('favoriteList'); list.replaceChildren();
    for (const model of catalog.models) {
      const card=el('article',undefined,'card');
      const link=el('a','О модификации →'); link.href=`versions.html?model=${encodeURIComponent(model.slug)}`;
      const button=el('button',selected.has(model.slug)?'Убрать из избранного':'В избранное',selected.has(model.slug)?'secondary':''); button.type='button';
      button.setAttribute('aria-pressed',String(selected.has(model.slug)));
      button.addEventListener('click',async () => {
        button.disabled=true;
        try {
          await api.request(`/api/favorites/${encodeURIComponent(model.slug)}`,{method:selected.has(model.slug)?'DELETE':'PUT',body:{}});
          status('Избранное сохранено на сервере.'); await favorites();
        } catch (error) { status(error.message,true); }
        finally { button.disabled=false; }
      });
      card.append(el('h3',model.name),el('p',`${model.power} л.с. · ${model.torque} Н·м · ${model.acceleration.toLocaleString('ru-RU')} с до 100 км/ч`),link,button);
      list.append(card);
    }
  }
  async function render(nextUser) {
    user=nextUser;
    $('authPanel').hidden=!!user; $('memberPanel').hidden=!user;
    if (!user) return;
    $('memberName').textContent=`Здравствуйте, ${user.name}`;
    $('memberEmail').textContent=`${user.email}${user.role === 'admin'?' · Администратор':''}`;
    await Promise.all([favorites(),inquiries()]);
  }
  for (const [id,path] of [['loginForm','login'],['registerForm','register']]) {
    $(id).addEventListener('submit',async event => {
      event.preventDefault();
      const form=event.currentTarget;
      if (!form.reportValidity()) return;
      const button=form.querySelector('button'); button.disabled=true;
      status('Проверяем данные…');
      try {
        const body=Object.fromEntries(new FormData(form));
        const response=await api.request(`/api/auth/${path}`,{method:'POST',body});
        form.reset(); await render(response.user); status(path==='register'?'Аккаунт создан на сервере.':'Вход выполнен.');
      } catch (error) { status(error.message,true); }
      finally { button.disabled=false; }
    });
  }
  $('logoutButton').addEventListener('click',async () => {
    $('logoutButton').disabled=true;
    try { await api.request('/api/auth/logout',{method:'POST',body:{}}); await api.session(); await render(null); status('Вы вышли из аккаунта.'); }
    catch (error) { status(error.message,true); }
    finally { $('logoutButton').disabled=false; }
  });
  $('refreshInquiries').addEventListener('click',async () => {
    $('refreshInquiries').disabled=true;
    try { await inquiries(); status('Статусы обновлены с сервера.'); }
    catch (error) { status(error.message,true); }
    finally { $('refreshInquiries').disabled=false; }
  });
  (async () => {
    try { const response=await api.session(); await render(response.user); status(response.user?'Данные загружены с сервера.':'Войдите или создайте аккаунт.'); }
    catch (error) {
      status(error.message,true);
      $('authPanel').querySelectorAll('button').forEach(button => { button.disabled=true; });
    }
  })();
})();
