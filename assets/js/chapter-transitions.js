(() => {
  'use strict';
  const body = document.body;
  const page = body.dataset.page;
  if (!['engine', 'tech', 'versions', 'contact'].includes(page)) return;
  const signal = new AbortController();
  const on = (element, type, handler, options = {}) => element?.addEventListener(type, handler, { ...options, signal: signal.signal });
  const ease = 'cubic-bezier(.18,.76,.16,1)';
  const animations = new Set();
  let navigating = false;
  function animate(element, keyframes, options) {
    if (!element?.animate || body.classList.contains('motion-paused')) return null;
    const animation = element.animate(keyframes, options);
    animations.add(animation);
    animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
    return animation;
  }
  const curtain = document.createElement('div');
  curtain.className = 'chapter-transition';
  curtain.setAttribute('aria-hidden','true');
  const panels = Array.from({length:6},(_,index) => {
    const panel = document.createElement('span');
    panel.className = 'chapter-transition-panel';
    curtain.append(panel);
    return panel;
  });
  const label = document.createElement('div');
  label.className = 'chapter-transition-label';
  label.setAttribute('aria-hidden','true');
  body.append(curtain,label);
  const titles = {engine:'Движение.',tech:'Комфорт.',versions:'Характер.',contact:'Диалог.',account:'Ваш F10.',admin:'Управление.'};
  const route = element => {
    try {
      const url = new URL(element.href,location.href);
      if(url.origin!==location.origin || url.pathname===location.pathname || !url.pathname.endsWith('.html')) return null;
      const key=url.pathname.split('/').pop().replace('.html','');
      return titles[key] ? {url,key} : null;
    } catch (_) { return null; }
  };
  on(document,'click',event => {
    const link = event.target.closest('a[href]');
    if(!link || event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target==='_blank' || link.hasAttribute('download') || navigating || body.classList.contains('motion-paused')) return;
    const target=route(link); if(!target)return;
    event.preventDefault(); navigating=true; label.textContent=titles[target.key];
    const movement=page==='contact'?'paper':page==='versions'?'side':'rise';
    const jobs=panels.map((panel,index)=> {
      const from=movement==='side'?`translateX(${index%2?'-':' '}110%)`:movement==='paper'?`translateY(110%) rotate(${index%2?4:-4}deg)`:'translateY(110%)';
      const job=animate(panel,[{transform:from},{transform:'translate(0,0) rotate(0)'}],{duration:680,delay:index*45,easing:ease,fill:'forwards'});
      return job?.finished.catch(()=>{});
    });
    animate(label,[{opacity:0,transform:'translateY(30px)'},{opacity:1,transform:'translateY(0)'}],{duration:560,delay:220,easing:ease,fill:'forwards'});
    Promise.all(jobs).then(()=>location.assign(target.url.href));
  });
  on(window,'pageshow',()=> { navigating=false; panels.forEach(panel=>panel.getAnimations().forEach(animation=>animation.cancel()));label.getAnimations().forEach(animation=>animation.cancel()); });

  const mediaRecipes = page==='tech' ? [
    ['.tech-hero-photo','aperture'],['.tech-suspension-photo','slit'],['.tech-parking-media','fold'],['.tech-idrive-media','slit'],['.tech-sound-media','aperture'],['.tech-comfort-media','fold']
  ] : page==='versions' ? [['.version-photo','slit']] : page==='contact' ? [['.contact-plate img','paper']] : [];
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries=>entries.forEach(entry=> {
    if(!entry.isIntersecting)return;
    const element=entry.target, kind=element.dataset.cinemaMask;
    if(kind==='slit') {
      element.querySelectorAll('.cinema-shutter').forEach((shutter,index)=> {
        const job=animate(shutter,[{transform:'scaleX(1)'},{transform:'scaleX(0)'}],{duration:1450,delay:index*120,easing:ease,fill:'forwards'});
        if(job)job.finished.then(()=>shutter.remove(),()=>shutter.remove());else shutter.remove();
      });
    } else {
      const frames=kind==='aperture'?[{clipPath:'circle(9% at 35% 55%)'},{clipPath:'circle(145% at 50% 50%)'}]:kind==='fold'?[{clipPath:'polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)'},{clipPath:'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)'}]:[{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0 0 0 0)'}];
      animate(element,frames,{duration:2100,easing:ease});
    }
    observer.unobserve(element);
  }),{threshold:.08}) : null;
  mediaRecipes.forEach(([selector,kind])=>document.querySelectorAll(selector).forEach(element=> {
    element.dataset.cinemaMask=kind;
    element.classList.add(`cinema-${kind}`);
    if(kind==='slit' && observer && !body.classList.contains('motion-paused')) {
      for(let index=0;index<4;index++) {
        const shutter=document.createElement('span');shutter.className='cinema-shutter';shutter.style.left=`${index*25}%`;shutter.setAttribute('aria-hidden','true');element.append(shutter);
      }
    }
    observer?.observe(element);
  }));
  if(page==='tech') document.querySelectorAll('.feature-card .feature-copy').forEach(copy=> {
    copy.classList.add('cinema-card-content');
    on(copy.parentElement,'pointermove',event=> {
      if(event.pointerType==='touch')return;
      const rect=copy.parentElement.getBoundingClientRect();
      copy.style.setProperty('--cinema-tilt-y',`${((event.clientX-rect.left)/rect.width-.5)*7}deg`);
      copy.style.setProperty('--cinema-tilt-x',`${((event.clientY-rect.top)/rect.height-.5)*-5}deg`);
    },{passive:true});
    on(copy.parentElement,'pointerleave',()=> { copy.style.setProperty('--cinema-tilt-x','0deg');copy.style.setProperty('--cinema-tilt-y','0deg'); });
  });
  if(page==='versions') {
    let previousPositions=[];
    on(document,'pointerdown',event=> {
      if(!event.target.closest('[data-comparison-filter]'))return;
      previousPositions=[...document.querySelectorAll('.comparison-table tbody tr')].map(row=>({row,top:row.getBoundingClientRect().top}));
    },{passive:true});
    on(document,'click',event=> {
      if(!event.target.closest('[data-comparison-filter]'))return;
      previousPositions.forEach(({row,top},index)=> {
        if(row.hidden)return;
        const dy=top-row.getBoundingClientRect().top;
        if(Math.abs(dy)>1)animate(row,[{transform:`translateY(${dy}px)`},{transform:'translateY(0)'}],{duration:1100,delay:index*25,easing:ease});
      });
    });
  }
  on(document,'f10:motion',event=> {
    if(event.detail.paused){animations.forEach(animation=> {try{animation.finish();}catch(_){animation.cancel();}});document.querySelectorAll('.cinema-shutter').forEach(shutter=>shutter.remove());}
  });
  on(window,'pagehide',event=> {if(!event.persisted){observer?.disconnect();signal.abort();}});
})();
