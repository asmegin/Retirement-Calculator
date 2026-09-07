(function(){
  'use strict';
  let saved='light';try{saved=localStorage.getItem('retirement-theme') || 'light';}catch(_){}
  document.documentElement.dataset.theme=saved==='dark'?'dark':'light';
  function apply(theme){
    document.documentElement.dataset.theme=theme;
    try{localStorage.setItem('retirement-theme',theme);}catch(_){}
    document.querySelectorAll('[data-theme-toggle]').forEach(button=>{
      button.textContent=theme==='light'?'☾  Dark appearance':'☀  Light appearance';
      button.setAttribute('aria-label','Switch to '+(theme==='light'?'dark':'light')+' mode');
    });
    window.dispatchEvent(new CustomEvent('themechange',{detail:theme}));
  }
  document.addEventListener('DOMContentLoaded',()=>{
    document.body.classList.add('app-shell');
    const aside=document.createElement('aside');aside.className='app-sidebar';aside.setAttribute('aria-label','Main navigation');
    aside.innerHTML='<a class="app-brand" href="/"><span class="brand-mark">◈</span><span>Retirement<span class="brand-sub">YOUR FINANCIAL PICTURE</span></span></a><div class="nav-caption">YOUR PLAN</div><nav><a href="/" data-page="overview">◫ <span>Overview</span></a><a href="/planning" data-page="planning">◎ <span>Planning workspace</span></a><a href="/planning#spending">▤ <span>Spending & cash flow</span></a><a href="/planning#scenarios">⇄ <span>Compare scenarios</span></a><a href="/planning#optimization">↗ <span>Withdrawal strategy</span></a><a href="/config" data-page="config">⚙ <span>Household & accounts</span></a></nav><div class="sidebar-footer"><div class="sidebar-note">See the possibilities.<br>Make a plan that fits.</div><button type="button" class="theme-toggle" data-theme-toggle></button></div>';
    document.body.prepend(aside);
    const path=location.pathname;
    const page=path.includes('config')?'config':path.includes('planning')?'planning':'overview';
    aside.querySelector('[data-page="'+page+'"]').setAttribute('aria-current','page');
    aside.querySelector('[data-theme-toggle]').onclick=()=>apply(document.documentElement.dataset.theme==='light'?'dark':'light');
    apply(document.documentElement.dataset.theme);
  });
  window.addEventListener('storage',event=>{if(event.key==='retirement-theme')apply(event.newValue==='dark'?'dark':'light');});
})();
