(function(){
  'use strict';
  let saved='light';try{saved=localStorage.getItem('retirement-theme')||'light';}catch(_){}
  document.documentElement.dataset.theme=saved==='dark'?'dark':'light';
  function apply(theme,persist=true){document.documentElement.dataset.theme=theme;try{localStorage.setItem('retirement-theme',theme);}catch(_){}if(persist)AppStorage.setPreference('theme',theme).catch(error=>{const status=document.getElementById('file-status');if(status)status.textContent=error.message;});document.querySelectorAll('[data-dark-appearance]').forEach(c=>c.checked=theme==='dark');window.dispatchEvent(new CustomEvent('themechange',{detail:theme}));}
  window.AppTheme={apply};
  function mountPlanFileTools(container,status){
    const report=message=>{const target=status||document.getElementById('file-status');if(target)target.textContent=message;};
    const tools=document.createElement('template');
    tools.innerHTML='<button class="btn ghost" id="export-json">Export Plan</button><label class="backup-encryption"><input id="encrypt-backup" type="checkbox"> Encrypt backup with a password</label><button class="btn ghost" id="import-json">Import Plan</button><input type="file" accept=".json,application/json" id="import-json-file" hidden aria-label="Import retirement plan JSON">';
    const fragment=tools.content,exportButton=fragment.querySelector('#export-json'),encrypt=fragment.querySelector('#encrypt-backup'),input=fragment.querySelector('#import-json-file');
    exportButton.onclick=async()=>{try{await AppStorage.ready;const done=await PlanBackupUI.export(window.PlanState?.get()||(await(await AppStorage.fetch('/api/config')).json()),encrypt.checked);report(done?'Plan exported.':'Export cancelled.');}catch(error){report(error.message);}};
    fragment.querySelector('#import-json').onclick=()=>input.click();
    input.onchange=async()=>{try{if(!input.files[0])return;report('Reading plan…');const imported=await PlanBackupUI.read(input.files[0]);if(!imported){report('Import cancelled.');return;}if(AppStorage.isDemo)await AppStorage.leaveDemo();delete imported.demoProfile;const c=await AppStorage.save(imported);window.PlanState?.set(c);report('Plan imported successfully and recalculated. You are now using your own plan.');}catch(error){report('Import failed: '+error.message);}finally{input.value='';}};
    container.append(fragment);return container;
  }
  window.PlanFileTools={mount:mountPlanFileTools};
  document.addEventListener('DOMContentLoaded',()=>{
    document.body.classList.add('app-shell');
    const page=document.body.dataset.page||'overview',aside=document.createElement('aside');aside.className='app-sidebar';aside.setAttribute('aria-label','Main navigation');
    const link=(file,label,id)=>`<a href="./${file}.html"${page===id?' aria-current="page"':''}>${label}</a>`;
    aside.innerHTML='<a class="app-brand" href="./index.html"><span class="brand-mark">◇</span><span>Retirement</span></a><nav>'+link('index','Overview','overview')+link('detailed','Plan details','detailed')+'<details'+(['household','accounts','employment','properties','pensions','config'].includes(page)?' open':'')+'><summary>Configuration</summary>'+link('household','Household','household')+link('accounts','Accounts','accounts')+link('employment','Employment','employment')+link('properties','Properties','properties')+link('pensions','Pensions','pensions')+'</details><details'+(['action-plan','plan-settings','scenarios','withdrawals','plan-properties'].includes(page)?' open':'')+'><summary>Plan</summary>'+link('action-plan','Plan optimizer','action-plan')+link('plan-settings','Plan settings','plan-settings')+link('plan-properties','Properties','plan-properties')+link('scenarios','Compare scenarios','scenarios')+'</details>'+link('app-config','App Config','app-config')+'</nav>';
    document.body.prepend(aside);
    const menu=document.createElement('button');menu.className='mobile-menu-toggle';menu.textContent='Menu';menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-controls','app-navigation');aside.querySelector('nav').id='app-navigation';menu.onclick=()=>menu.setAttribute('aria-expanded',String(aside.classList.toggle('nav-open')));aside.prepend(menu);
    const bar=document.createElement('div');bar.className='settings-bar';bar.setAttribute('aria-label','Plan storage status');
    bar.innerHTML='<span class="storage-mode" role="status"></span><span id="file-status" role="status"></span>';
    aside.insertAdjacentElement('afterend',bar);const status=bar.querySelector('#file-status');
    const mode=()=>bar.querySelector('.storage-mode').textContent=AppStorage.mode==='server'?(AppStorage.online?(AppStorage.realtime?'Connected to Docker':'Connected to server · HTTP sync'):'Server offline · saves unavailable'):(location.protocol==='file:'?'Saved on this device':'Static site · saved in this browser');
    AppStorage.ready.then(mode);window.addEventListener('storagemodechange',mode);
    AppStorage.getPreference('theme').then(theme=>apply(theme||document.documentElement.dataset.theme,false)).catch(error=>status.textContent=error.message);
  });
  window.addEventListener('storage',event=>{if(event.key==='retirement-theme')apply(event.newValue==='dark'?'dark':'light');});
})();
