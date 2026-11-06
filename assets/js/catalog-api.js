(() => {
  'use strict';
  const init=async () => {
    if (!window.F10_SPECS) return;
    const badge=document.createElement('p'); badge.className='field-hint'; badge.setAttribute('role','status'); badge.dataset.catalogSource='local';
    badge.textContent='Каталог: локальные справочные данные, без связи с сервером.';
    const target=document.querySelector('#modelAnnouncement') || document.querySelector('.metric-row') || document.querySelector('main');
    if (target) target.after(badge);
    const original=window.F10_SPECS;
    try {
      if (!window.F10_API) throw new Error('No API client');
      const response=await window.F10_API.request('/api/models');
      if (!Array.isArray(response.models) || !response.models.length) throw new Error('Empty catalog');
      const models=Object.fromEntries(response.models.map(model => [model.slug,model]));
      // Update the original object: chapters.js holds a reference to this same models dictionary.
      Object.assign(original.models,models);
      original.scope=response.models[0].scope;
      original.consumptionScope=response.models[0].consumptionScope;
      original.release=response.models[0].release;
      badge.dataset.catalogSource='server'; badge.textContent='Каталог загружен из PostgreSQL сервера проекта. Европа · июль 2013 · RWD · 8-ступенчатая АКПП.';
      const selected=document.querySelector('[data-model-choice][aria-pressed="true"]');
      selected?.click();
      window.dispatchEvent(new CustomEvent('f10:catalog',{detail:{source:'server',models}}));
    } catch {
      window.dispatchEvent(new CustomEvent('f10:catalog',{detail:{source:'local',models:original.models}}));
      // Only catalog rendering has a local read-only fallback. No server writes are faked.
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else void init();
})();
