(function(root){
  'use strict';
  const base=new URL('.',document.currentScript.src),local=BrowserPlanStore,listeners=new Set();
  const deployment=AppRuntime.mode==='server'?'server':'static',mode=deployment==='server'?'server':'local';
  const nativeFetch=root.fetch.bind(root);let demoActive=false,current,signature,online=deployment==='static',realtime=false,socket,polling;
  const reply=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
  function status(){root.dispatchEvent(new Event('storagemodechange'));}
  function emit(c){const next=JSON.stringify(c);current=c;if(next===signature)return;signature=next;listeners.forEach(fn=>fn(c));}
  function setOnline(value){if(online!==value){online=value;status();}}
  async function remote(path,options={}){
    try{
      const response=await nativeFetch(new URL(path.replace(/^\//,''),base),{...options,credentials:'same-origin',cache:'no-store',signal:options.signal||AbortSignal.timeout(8000)});
      setOnline(response.status<500&&response.status!==401);
      return response;
    }catch(_){setOnline(false);throw new Error('Server unavailable. Your save was not confirmed. Reconnect before saving, or Export Plan to keep your edits.');}
  }
  async function cache(c){try{await local.cacheConfig(c);}catch(_){/* A full browser cache must not block durable server storage. */}}
  async function sync(){
    if(deployment!=='server'||demoActive)return;
    try{const r=await remote('/api/config');if(!r.ok)return;const c=await r.json();if(!c.assumptions||!Array.isArray(c.incomes))throw new Error('Invalid server response');await cache(c);emit(c);}catch(_){}
  }
  function startRealtime(){
    const script=document.createElement('script');script.src=new URL('vendor/socket.io.min.js',base);
    script.onload=()=>{
      if(typeof root.io!=='function')return;
      socket=root.io({path:new URL('socket.io',base).pathname,reconnection:true,timeout:4000,transports:['websocket','polling']});
      socket.on('connect',()=>{realtime=true;status();sync();});
      socket.on('disconnect',()=>{realtime=false;status();});
      socket.on('connect_error',()=>{realtime=false;status();});
      socket.on('config_updated',async c=>{if(demoActive)return;setOnline(true);await cache(c);emit(c);});
    };
    script.onerror=()=>{realtime=false;status();};document.head.append(script);
    // HTTP persistence is independent of WebSocket availability.
    polling=setInterval(()=>{if(!document.hidden&&!realtime)sync();},15000);
    root.addEventListener('focus',()=>sync());
    root.addEventListener('online',()=>sync());
    root.addEventListener('pagehide',()=>{clearInterval(polling);socket?.close();},{once:true});
  }
  const ready=(async()=>{
    try{demoActive=(await local.getPreference('demo-active'))===true;}catch(_){demoActive=false;}
    if(deployment==='static'||demoActive)return;
    await sync();startRealtime();status();
  })();
  async function localRequest(path,method,body){
    const local=demoActive?BrowserPlanStore.demo:BrowserPlanStore;
    if(path==='/api/config'){
      if(method==='GET')return reply(await local.readConfig());
      if(method==='POST'){const c=await local.saveConfig(body);emit(c);return reply({success:true,ok:true,config:c});}
    }
    if(path==='/api/system'&&method==='GET')return reply({mode:location.protocol==='file:'?'standalone':'static',version:AppRuntime.version,authEnabled:false,authManagedByEnvironment:false});
    if(path==='/api/scenarios'){
      if(method==='GET')return reply(await local.listScenarios());
      if(method==='POST')return reply({ok:true,scenarios:await local.saveScenario(body.name,body.config)});
    }
    if(path.startsWith('/api/scenarios/')&&method==='DELETE')return reply({ok:true,scenarios:await local.deleteScenario(decodeURIComponent(path.slice('/api/scenarios/'.length)))});
    if(path==='/api/backups'&&method==='GET')return reply(await local.listBackups());
    if(path==='/api/backup'&&method==='POST')return reply({ok:true,file:await local.backup()});
    if(path==='/api/backups/restore'&&method==='POST'){const c=await local.restore(body.file);emit(c);return reply({ok:true,config:c});}
    return reply({error:'Unknown storage operation.'},404);
  }
  async function request(url,options={}){
    await ready;const path='/'+String(url).replace(/^\.?\//,''),method=(options.method||'GET').toUpperCase();
    if(!path.startsWith('/api/'))return reply({error:'Unsupported application request.'},400);
    if(deployment==='server'&&!demoActive){
      try{
        const response=await remote(path,options);
        if(response.ok&&(path==='/api/config'||path==='/api/backups/restore')){
          const body=await response.json(),c=method==='GET'?body:body.config;
          if(c){await cache(c);emit(c);}return reply(body,response.status);
        }
        if(response.status>=500)throw new Error('The server could not complete the request. Your save was not confirmed.');
        return response;
      }catch(error){
        if(method==='GET'&&path==='/api/config'){try{const c=current||await local.readCache();if(c)return reply(c);}catch(_){} }
        return reply({ok:false,success:false,error:error.message},503);
      }
    }
    try{return await localRequest(path,method,options.body?JSON.parse(options.body):{});}catch(error){return reply({ok:false,success:false,error:error.message},400);}
  }
  async function save(value){const c=PlanSchema.validate(value),r=await request('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(c)}),body=await r.json();if(!r.ok)throw new Error(body.error||'Save failed');return body.config;}
  async function download(c,password){const exported=await PlanBackup.encode(c,password);const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(exported,null,2)],{type:'application/json'}));a.href=url;a.download='retirement-plan.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  root.AppStorage={ready,fetch:request,save,download,validate:PlanSchema.validate,get mode(){return demoActive?'local':mode;},deployment,get isDemo(){return demoActive;},async loadDemo(config){await ready;await local.demo.saveConfig(config);await local.setPreference('demo-active',true);demoActive=true;socket?.close();status();emit(config);},async leaveDemo(){await local.setPreference('demo-active',false);demoActive=false;status();},get online(){return online;},get realtime(){return realtime;},getPreference:local.getPreference,setPreference:local.setPreference,bindState(get,set){root.PlanState={get,set};},subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
  root.addEventListener('storage',event=>{if(!demoActive&&deployment==='static'&&event.key===local.stateKey&&event.newValue){try{emit(JSON.parse(event.newValue).config);}catch(_){} }});
  local.subscribe(c=>{if(!demoActive&&deployment==='static')emit(c);});
  local.demo.subscribe(c=>{if(demoActive)emit(c);});
})(window);
