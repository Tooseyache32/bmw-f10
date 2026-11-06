(() => {
  'use strict';
  let csrfToken = null;
  let initialising = null;
  class APIError extends Error {
    constructor(message,status=0) { super(message); this.name='APIError'; this.status=status; }
  }
  async function send(path,{ method='GET',body,signal }={}) {
    if (!path.startsWith('/api/')) throw new APIError('Недопустимый адрес API.');
    if (!/^https?:$/.test(location.protocol)) throw new APIError('Серверные функции доступны через http://localhost:3000, а не file://.');
    let response;
    try {
      response=await fetch(path,{
        method,credentials:'same-origin',cache:'no-store',
        headers: { Accept:'application/json',...(body !== undefined ? {'Content-Type':'application/json'} : {}),
          ...(method !== 'GET' && csrfToken ? {'X-CSRF-Token':csrfToken} : {}) },
        ...(body !== undefined ? { body:JSON.stringify(body) } : {}),
        signal:signal || AbortSignal.timeout(12000)
      });
    } catch { throw new APIError('Нет связи с сервером. Действие не подтверждено; проверьте соединение.'); }
    let result;
    try { result=await response.json(); }
    catch { throw new APIError('Сервер проекта не отвечает как API. Запустите npm start.',response.status); }
    if (!response.ok) throw new APIError(result.error || 'Не удалось выполнить запрос.',response.status);
    if (result.csrfToken) csrfToken=result.csrfToken;
    return result;
  }
  async function session() {
    if (!initialising) initialising=send('/api/auth/me').finally(() => { initialising=null; });
    return initialising;
  }
  async function request(path,options={}) {
    const method=(options.method || 'GET').toUpperCase();
    if (method !== 'GET' && !csrfToken) await session();
    // Never automatically retry mutations: a lost response may already have committed in PostgreSQL.
    return send(path,{...options,method});
  }
  window.F10_API={ request,session,APIError,statusLabels:{new:'Новый',in_progress:'В работе',completed:'Завершён',rejected:'Отклонён'} };
})();
