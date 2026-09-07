(function(){
  'use strict';
  let saved='light';try{saved=localStorage.getItem('retirement-theme')||'light';}catch(_){}
  document.documentElement.dataset.theme=saved==='dark'?'dark':'light';
  function apply(theme,persist=true){document.documentElement.dataset.theme=theme;try{localStorage.setItem('retirement-theme',theme);}catch(_){}if(persist)AppStorage.setPreference('theme',theme);document.querySelectorAll('[data-dark-appearance]').forEach(c=>c.checked=theme==='dark');window.dispatchEvent(new CustomEvent('themechange',{detail:theme}));}
  window.AppTheme={apply};
  document.addEventListener('DOMContentLoaded',()=>{
    document.body.classList.add('app-shell');
    const page=document.body.dataset.page||'overview',aside=document.createElement('aside');aside.className='app-sidebar';aside.setAttribute('aria-label','Main navigation');
    const link=(file,label,id)=>`<a href="./${file}.html"${page===id?' aria-current="page"':''}>${label}</a>`;
    aside.innerHTML='<a class="app-brand" href="./index.html"><span class="brand-mark">◇</span><span>Retirement</span></a><nav>'+link('index','Overview','overview')+'<details'+(['overview','detailed'].includes(page)?' open':'')+'><summary>Overview details</summary>'+link('detailed','Detailed Overview','detailed')+'</details><details'+(['household','employment','properties','pensions','config'].includes(page)?' open':'')+'><summary>Configuration</summary>'+link('household','Household','household')+link('employment','Employment','employment')+link('properties','Properties','properties')+link('pensions','Pensions','pensions')+'</details><details'+(['scenarios','withdrawals'].includes(page)?' open':'')+'><summary>Plan</summary>'+link('scenarios','Compare scenarios','scenarios')+link('withdrawals','Withdrawal strategy','withdrawals')+'</details>'+link('app-config','App Config','app-config')+'</nav>';
    document.body.prepend(aside);
    const menu=document.createElement('button');menu.className='mobile-menu-toggle';menu.textContent='Menu';menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-controls','app-navigation');aside.querySelector('nav').id='app-navigation';menu.onclick=()=>menu.setAttribute('aria-expanded',String(aside.classList.toggle('nav-open')));aside.prepend(menu);
    const bar=document.createElement('div');bar.className='settings-bar';bar.setAttribute('aria-label','Plan file settings');
    bar.innerHTML='<span class="storage-mode" role="status"></span><button class="btn ghost" id="export-json">Export JSON</button><button class="btn ghost" id="import-json">Import JSON</button><input type="file" accept=".json,application/json" id="import-json-file" hidden aria-label="Import retirement plan JSON"><span id="file-status" role="status"></span>';
    aside.insertAdjacentElement('afterend',bar);const status=bar.querySelector('#file-status');
    const mode=()=>bar.querySelector('.storage-mode').textContent=AppStorage.mode==='server'?'Connected to Docker':'Saved on this device';
    AppStorage.ready.then(mode);window.addEventListener('storagemodechange',mode);
    bar.querySelector('#export-json').onclick=async()=>{try{await AppStorage.ready;AppStorage.download(window.PlanState?.get()||(await(await AppStorage.fetch('/api/config')).json()));status.textContent='Plan exported.';}catch(error){status.textContent=error.message;}};
    const input=bar.querySelector('input');bar.querySelector('#import-json').onclick=()=>input.click();
    input.onchange=async()=>{try{if(!input.files[0])return;const c=await AppStorage.save(JSON.parse(await input.files[0].text()));window.PlanState?.set(c);status.textContent='Plan imported and recalculated.';}catch(error){status.textContent=error.message;}finally{input.value='';}};
    AppStorage.getPreference('theme').then(theme=>apply(theme||document.documentElement.dataset.theme,false));
  });
  window.addEventListener('storage',event=>{if(event.key==='retirement-theme')apply(event.newValue==='dark'?'dark':'light');});
})();
