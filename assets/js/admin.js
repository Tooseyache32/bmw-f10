(() => {
  'use strict';
  const $=id => document.getElementById(id);
  const api=window.F10_API;
  let page=1;
  let total=0;
  const status=(message,error=false) => { $('adminStatus').textContent=message; $('adminStatus').classList.toggle('is-error',error); };
  const el=(tag,text,className) => { const node=document.createElement(tag); if (text !== undefined) node.textContent=text; if (className) node.className=className; return node; };
  const date=value => new Date(value).toLocaleString('ru-RU');
  async function history(id,target) {
    const response=await api.request(`/api/admin/inquiries/${id}/events`);
    target.replaceChildren();
    if (!response.events.length) target.append(el('p','Изменений статуса пока нет.','muted'));
    const list=el('ol');
    for (const item of response.events) list.append(el('li',`${date(item.createdAt)} · ${item.adminEmail}: ${api.statusLabels[item.fromStatus]} → ${api.statusLabels[item.toStatus]}${item.note?` · ${item.note}`:''}`));
    target.append(list);
  }
  function renderItem(item) {
    const article=el('article',undefined,'inquiry');
    const heading=el('div',undefined,'inquiry-header');
    heading.append(el('h3',`№ ${item.id} · ${item.interest}`),el('span',api.statusLabels[item.status],'badge'));
    article.append(heading,el('p',`${date(item.createdAt)} · ${item.modification || 'Не определился'}`,'meta'),
      el('p',`${item.name} · ${item.contact}`,'meta'),el('p',item.message,'message'));
    const form=el('form',undefined,'edit-form');
    const label=el('label','Новый статус');
    const select=el('select'); select.setAttribute('aria-label',`Статус запроса ${item.id}`);
    for (const [key,value] of Object.entries(api.statusLabels)) { const option=el('option',value); option.value=key; select.append(option); }
    select.value=item.status; label.append(select);
    const noteLabel=el('label','Примечание к изменению');
    const note=el('input'); note.maxLength=500; note.placeholder='Необязательно, до 500 символов'; noteLabel.append(note);
    const button=el('button','Сохранить статус'); button.type='submit';
    form.append(label,noteLabel,button); article.append(form);
    const details=el('details',undefined,'history'); const summary=el('summary','Журнал изменений'); const target=el('div');
    details.append(summary,target); article.append(details);
    details.addEventListener('toggle',async () => {
      if (!details.open) return;
      try { await history(item.id,target); }
      catch (error) { target.textContent=error.message; }
    });
    form.addEventListener('submit',async event => {
      event.preventDefault(); button.disabled=true;
      try {
        const response=await api.request(`/api/admin/inquiries/${item.id}/status`,{method:'PATCH',body:{status:select.value,note:note.value}});
        status(response.changed?'Статус и запись журнала сохранены одной транзакцией.':'Статус не изменён; дублирующая запись журнала не добавлена.');
        await load();
      } catch (error) { status(error.message,true); }
      finally { button.disabled=false; }
    });
    return article;
  }
  async function load() {
    const params=new URLSearchParams({page:String(page)});
    if ($('statusFilter').value) params.set('status',$('statusFilter').value);
    const response=await api.request(`/api/admin/inquiries?${params}`);
    total=response.total;
    $('adminInquiries').replaceChildren(...response.inquiries.map(renderItem));
    if (!response.inquiries.length) $('adminInquiries').append(el('p','Запросов с таким фильтром нет.','muted'));
    $('adminCount').textContent=`Всего: ${total}`;
    $('pageLabel').textContent=`Страница ${page} из ${Math.max(1,Math.ceil(total/50))}`;
    $('previousPage').disabled=page<=1; $('nextPage').disabled=page*50>=total;
  }
  $('filterForm').addEventListener('submit',async event => {
    event.preventDefault(); page=1;
    try { await load(); status('Список обновлён с сервера.'); }
    catch (error) { status(error.message,true); }
  });
  for (const [id,delta] of [['previousPage',-1],['nextPage',1]]) $(id).addEventListener('click',async () => {
    const previous=page; page+=delta;
    try { await load(); }
    catch (error) { page=previous; status(error.message,true); }
  });
  (async () => {
    try {
      const response=await api.session();
      if (!response.user || response.user.role !== 'admin') {
        $('adminLogin').hidden=false; status('Недостаточно прав для просмотра запросов.',true); return;
      }
      $('adminPanel').hidden=false;
      await load(); status(`Вход: ${response.user.email}. Список загружен с сервера.`);
    } catch (error) { status(error.message,true); $('adminLogin').hidden=false; }
  })();
})();
