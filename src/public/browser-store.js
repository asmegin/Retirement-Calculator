(function(root){
  'use strict';
  const base=new URL('.',document.currentScript.src);
  function createStore(suffix=''){
  const scope='retirement-'+encodeURIComponent(base.pathname)+suffix,stateKey=scope+'-state-v3';
  const pending=new Map(),listeners=new Set();let bridge,bridgeReady,serial=0,queue=Promise.resolve(),database;
  const channel=location.protocol!=='file:'&&typeof BroadcastChannel==='function'?new BroadcastChannel(scope):null;
  if(channel)channel.onmessage=event=>listeners.forEach(fn=>fn(event.data));
  const copy=v=>JSON.parse(JSON.stringify(v));
  function localBridge(){
    if(location.protocol!=='file:')return Promise.resolve();
    if(bridgeReady)return bridgeReady;
    bridgeReady=new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Local storage could not start. Reopen index.html from the extracted folder.')),5000);
      const mount=()=>{bridge=document.createElement('iframe');bridge.hidden=true;bridge.title='Local plan storage';bridge.src=new URL('storage.html',base);document.body.appendChild(bridge);};
      root.addEventListener('message',event=>{
        if(event.source!==bridge?.contentWindow||event.data?.channel!=='retirement-storage')return;
        if(event.data.ready){clearTimeout(timeout);resolve();return;}
        const job=pending.get(event.data.id);if(job){pending.delete(event.data.id);clearTimeout(job.timer);event.data.error?job.reject(new Error(event.data.error)):job.resolve(event.data.value);}
      });
      document.body?mount():document.addEventListener('DOMContentLoaded',mount,{once:true});
    });return bridgeReady;
  }
  async function local(op,key,value){
    await localBridge();
    if(!bridge){try{if(op==='get')return JSON.parse(localStorage.getItem(key)||'null');localStorage.setItem(key,JSON.stringify(value));return value;}catch(error){throw new Error('Browser storage is unavailable, full or contains invalid data. Export your plan before changing browser storage. '+error.message);}}
    return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Local storage did not respond. Your save was not confirmed.'));},5000);pending.set(id,{resolve,reject,timer});bridge.contentWindow.postMessage({channel:'retirement-storage',id,op,key,value},'*');});
  }
  async function legacy(){
    const state=await local('get',scope+'-state-v2');
    if(state){if(state.schemaVersion!==2||!state.config||!Array.isArray(state.scenarios)||!Array.isArray(state.backups))throw new Error('This browser plan uses an unsupported or invalid storage format. Export/import a valid plan.');return state;}
    // Copy legacy data without deleting it, so an upgrade remains reversible.
    if(suffix)return {schemaVersion:2,config:RetireEngine.defaultConfig(),scenarios:[],backups:[]};
    const legacy=await local('get','retirement-config-v1');
    return {schemaVersion:2,config:legacy||RetireEngine.defaultConfig(),scenarios:await local('get','retirement-scenarios-v1')||[],backups:await local('get','retirement-backups-v1')||[]};
  }
  function openDatabase(){
    if(database)return database;
    database=new Promise((resolve,reject)=>{
      if(!root.indexedDB){reject(new Error('Browser plan storage is unavailable. Enable site storage to save plans.'));return;}
      const request=indexedDB.open(scope,1);
      request.onupgradeneeded=()=>request.result.createObjectStore('state');
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();database=null;};resolve(db);};
      request.onerror=()=>{database=null;reject(new Error('Browser plan storage could not open: '+request.error.message));};
      request.onblocked=()=>{database=null;reject(new Error('Close other calculator tabs to upgrade browser storage.'));};
    });return database;
  }
  async function read(){
    if(location.protocol!=='file:'){
      const db=await openDatabase();
      const current=await new Promise((resolve,reject)=>{const request=db.transaction('state').objectStore('state').get('plan-v3');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
      if(current){if(current.schemaVersion!==2||!current.config||!Array.isArray(current.scenarios)||!Array.isArray(current.backups))throw new Error('Unsupported browser plan format. Import a valid plan.');return current;}
    }
    const state=await local('get',stateKey);
    if(state){
      if(state.schemaVersion!==2||!state.config||!Array.isArray(state.scenarios)||!Array.isArray(state.backups))throw new Error('Unsupported browser plan format. Import a valid plan.');
      return state;
    }
    // Retain the earlier records unchanged when migrating to transactional storage.
    if(location.protocol!=='file:'&&root.indexedDB){
      const db=await openDatabase();
      const old=await new Promise((resolve,reject)=>{const request=db.transaction('state').objectStore('state').get('plan');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
      if(old){if(old.schemaVersion!==2||!old.config||!Array.isArray(old.scenarios)||!Array.isArray(old.backups))throw new Error('Unsupported legacy database format.');return old;}
    }
    return legacy();
  }
  function mutate(action){
    const run=async()=>{
      if(location.protocol!=='file:'){
        const seed=await read(),db=await openDatabase();let saved;
        const value=await new Promise((resolve,reject)=>{
          const tx=db.transaction('state','readwrite'),objects=tx.objectStore('state');let value,failure;
          tx.oncomplete=()=>resolve(value);
          tx.onabort=()=>reject(failure||new Error('Browser storage could not save your changes. '+(tx.error?.message||'The transaction was aborted.')));
          tx.onerror=()=>{}; // The abort handler reports the failed transaction once.
          const request=objects.get('plan-v3');
          request.onsuccess=()=>{
            try{
              // Read and write inside one transaction: locks alone do not refresh
              // another browser process's localStorage cache.
              saved=copy(request.result||seed);value=action(saved);objects.put(saved,'plan-v3');
            }catch(error){failure=error.code==='PLAN_VALIDATION'?error:new Error('Browser storage could not save your changes. '+error.message);tx.abort();}
          };
        });
        channel?.postMessage(saved.config);return value;
      }
      const state=copy(await read()),value=action(state);
      await local('set',stateKey,state);
      return value;
    };
    const result=queue.then(run);queue=result.catch(()=>{});return result;
  }
  function snapshot(state){
    const entry={file:'local-'+Date.now()+'-'+(crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16)).join('-'))+'.json',modified:new Date().toISOString(),size:JSON.stringify(state.config).length,config:copy(state.config)};
    state.backups.unshift(entry);state.backups=state.backups.slice(0,30);return entry.file;
  }
  const store={
    stateKey,
    subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},
    readConfig:async()=>{const raw=copy((await read()).config),c=PlanSchema.validate(raw);if(raw.onboardingComplete===false)c.onboardingComplete=false;return c;},
    saveConfig:c=>mutate(state=>{const normalized=PlanSchema.validate(c);snapshot(state);state.config=normalized;return copy(normalized);}),
    listScenarios:async()=>copy((await read()).scenarios),
    saveScenario:(name,config)=>mutate(state=>{name=PlanSchema.scenarioName(name);const c=PlanSchema.validate(config);state.scenarios=state.scenarios.filter(s=>s.name!==name);state.scenarios.push({name,savedAt:new Date().toISOString(),config:c});return copy(state.scenarios);}),
    deleteScenario:name=>mutate(state=>{state.scenarios=state.scenarios.filter(s=>s.name!==name);return copy(state.scenarios);}),
    listBackups:async()=>(await read()).backups.map(({config,...b})=>b),
    backup:()=>mutate(state=>snapshot(state)),
    restore:file=>mutate(state=>{const item=state.backups.find(b=>b.file===file);if(!item)throw new Error('Backup not found.');const c=PlanSchema.validate(item.config);snapshot(state);state.config=c;return copy(c);}),
    getPreference:async name=>(await local('get',scope+'-pref-'+name))??await local('get','retirement-pref-'+name),
    setPreference:(name,value)=>local('set',scope+'-pref-'+name,value),
    readCache:()=>local('get',scope+'-server-cache'),
    cacheConfig:c=>local('set',scope+'-server-cache',c)
  };
  return store;
  }
  root.BrowserPlanStore=createStore();
  root.BrowserPlanStore.demo=createStore('-demo');
})(window);
