(function(root){
  'use strict';
  const listeners=new Set(),key='retirement-config-v1',nativeFetch=root.fetch.bind(root);
  let mode='local',socket,bridge,bridgeReady,serial=0,current;
  const pending=new Map();
  function emit(value){current=value;listeners.forEach(fn=>fn(value));}
  function localBridge(){
    if(location.protocol!=='file:')return Promise.resolve();
    if(bridgeReady)return bridgeReady;
    bridgeReady=new Promise((resolve,reject)=>{
      const mount=()=>{bridge=document.createElement('iframe');bridge.hidden=true;bridge.title='Local plan storage';bridge.src='./storage.html';document.body.appendChild(bridge);};
      const timeout=setTimeout(()=>reject(new Error('Local storage could not start. Reopen index.html from the extracted folder.')),5000);
      root.addEventListener('message',event=>{
        if(event.source!==bridge?.contentWindow||event.data?.channel!=='retirement-storage')return;
        if(event.data.ready){clearTimeout(timeout);resolve();return;}
        const job=pending.get(event.data.id);if(job){pending.delete(event.data.id);event.data.error?job.reject(new Error(event.data.error)):job.resolve(event.data.value);}
      });
      document.body?mount():document.addEventListener('DOMContentLoaded',mount,{once:true});
    });return bridgeReady;
  }
  async function local(op,k,value){
    await localBridge();
    if(!bridge){if(op==='get')return JSON.parse(localStorage.getItem(k)||'null');localStorage.setItem(k,JSON.stringify(value));return value;}
    return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});bridge.contentWindow.postMessage({channel:'retirement-storage',id,op,key:k,value},'*');});
  }
  const ready=(async()=>{
    await localBridge();
    if(location.protocol==='file:')return;
    try{
      const response=await nativeFetch('./api/config',{signal:AbortSignal.timeout(2500)});
      if(!response.ok)return;
      const config=await response.json();
      if(!config.assumptions||!Array.isArray(config.incomes))return;
      current=config;await local('set','retirement-server-cache-v1',config);
      await new Promise((resolve,reject)=>{
        if(typeof root.io!=='function'){reject();return;}
        socket=root.io({reconnection:false,timeout:2000,transports:['websocket','polling']});
        socket.once('connect',resolve);socket.once('connect_error',reject);
      });
      mode='server';current=config;
      socket.on('config_updated',async c=>{await local('set','retirement-server-cache-v1',c);emit(c);});
      socket.on('disconnect',()=>{mode='local';socket.close();root.dispatchEvent(new Event('storagemodechange'));});
    }catch(_){socket?.close();}
    root.dispatchEvent(new Event('storagemodechange'));
  })();
  function validate(value){
    if(!value||typeof value!=='object'||!value.assumptions||!Array.isArray(value.incomes))throw new Error('Choose a retirement plan JSON file with household settings and people.');
    const c=RetireEngine.normalizeConfig(value);if(!RetireEngine.simulate(c).years.length)throw new Error('Choose a planning age that extends into the current year.');c.onboardingComplete=true;return c;
  }
  const response=(body,status=200)=>({ok:status<400,status,json:async()=>body});
  async function request(url,options={}){
    await ready;const path=String(url).replace(/^\.\//,'/'),method=options.method||'GET';
    if(mode==='server'){
      try{const r=await nativeFetch('.'+path,options);if(r.status>=500)throw new Error('Server unavailable');return r;}
      catch(_){mode='local';socket?.close();root.dispatchEvent(new Event('storagemodechange'));}
    }
    try{
      const body=options.body?JSON.parse(options.body):{};
      if(path==='/api/config'){
        if(method==='GET'){const c=await local('get',key)||current||await local('get','retirement-server-cache-v1')||RetireEngine.defaultConfig();return response(c);}
        const c=validate(body),previous=await local('get',key);
        if(previous){const list=await local('get','retirement-backups-v1')||[];list.unshift({file:'local-'+Date.now()+'.json',modified:new Date().toISOString(),size:JSON.stringify(previous).length,config:previous});await local('set','retirement-backups-v1',list.slice(0,30));}
        await local('set',key,c);emit(c);return response({success:true,ok:true,config:c});
      }
      if(path==='/api/system')return response({mode:'standalone',authEnabled:false,authManagedByEnvironment:true});
      if(path.startsWith('/api/scenarios')){
        let list=await local('get','retirement-scenarios-v1')||[];
        if(method==='POST'){const name=String(body.name||'').trim().slice(0,60);if(!name)throw new Error('Enter a scenario name.');list=list.filter(s=>s.name!==name);list.push({name,savedAt:new Date().toISOString(),config:validate(body.config)});}
        if(method==='DELETE')list=list.filter(s=>s.name!==decodeURIComponent(path.split('/').pop()));
        if(method!=='GET')await local('set','retirement-scenarios-v1',list);return response(method==='GET'?list:{ok:true});
      }
      if(path==='/api/backups')return response((await local('get','retirement-backups-v1')||[]).map(({config,...b})=>b));
      if(path==='/api/backup'){
        const config=current||await local('get',key)||RetireEngine.defaultConfig(),file='local-'+Date.now()+'.json';
        const list=await local('get','retirement-backups-v1')||[];list.unshift({file,modified:new Date().toISOString(),size:JSON.stringify(config).length,config});await local('set','retirement-backups-v1',list.slice(0,30));return response({ok:true,file});
      }
      if(path==='/api/backups/restore'){const item=(await local('get','retirement-backups-v1')||[]).find(b=>b.file===body.file);if(!item)throw new Error('Backup not found.');return request('/api/config',{method:'POST',body:JSON.stringify(item.config)});}
      return response({error:'Unavailable in standalone mode.'},404);
    }catch(error){return response({success:false,error:error.message},400);}
  }
  async function save(c){const r=await request('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(validate(c))});const body=await r.json();if(!r.ok)throw new Error(body.error);return body.config;}
  function download(c){validate(c);const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(c,null,2)],{type:'application/json'}));a.href=url;a.download='retirement-plan.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function bindState(get,set){root.PlanState={get,set};}
  root.AppStorage={ready,fetch:request,save,download,validate,bindState,getPreference:name=>local('get','retirement-pref-'+name),setPreference:(name,value)=>local('set','retirement-pref-'+name,value),get mode(){return mode;},subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
  root.addEventListener('storage',event=>{if(event.key===key&&event.newValue){try{emit(JSON.parse(event.newValue));}catch(_){}}});
})(window);
