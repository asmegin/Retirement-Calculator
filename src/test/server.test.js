'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process');
async function launch(t,auth=false){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'retirement-http-'));
  const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
  const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,DATA_DIR:dir,PORT:String(port),BIND:'127.0.0.1',BASIC_AUTH_ENABLED:String(auth),BASIC_AUTH_USER:'test-user',BASIC_AUTH_PASS:'test-password'},stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',s=>logs+=s);child.stderr.on('data',s=>logs+=s);
  t.after(async()=>{if(child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}await fs.rm(dir,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+port;
  for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)return {base,dir,child};}catch(_){}if(child.exitCode!==null)throw new Error(logs);await new Promise(resolve=>setTimeout(resolve,50));}
  throw new Error('Server did not become ready: '+logs);
}
test('server runtime, durable API, origin protection and payload errors',async t=>{
  const {base,dir}=await launch(t);
  const runtime=await fetch(base+'/runtime-config.js');assert.match(await runtime.text(),/"mode":"server"/);assert.equal(runtime.headers.get('cache-control'),'no-store');
  const response=await fetch(base+'/api/config'),c=await response.json();assert.equal(response.headers.get('cache-control'),'no-store');
  c.assumptions.desiredMonthlyIncome=6100;
  const options={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(c)};
  assert.equal((await fetch(base+'/api/config',{...options,headers:{...options.headers,Origin:'https://unrelated.example'}})).status,403);
  assert.equal((await fetch(base+'/api/config',options)).status,200);
  assert.equal(JSON.parse(await fs.readFile(path.join(dir,'config.json'),'utf8')).assumptions.desiredMonthlyIncome,6100);
  assert.equal((await fetch(base+'/api/config',{...options,body:'{bad'})).status,400);
  assert.equal((await fetch(base+'/api/config',{...options,body:JSON.stringify({padding:'x'.repeat(2*1024*1024)})})).status,413);
  assert.equal((await fetch(base+'/api/missing')).status,404);
  assert.equal((await fetch(base+'/server.js')).status,404);
  assert.equal((await fetch(base+'/api/config').then(r=>r.json())).assumptions.desiredMonthlyIncome,6100);
});
test('Basic Auth protects pages, runtime, API and Socket.IO while health remains available',async t=>{
  const {base}=await launch(t,true);
  for(const route of ['/','/runtime-config.js','/api/config','/socket.io/?EIO=4&transport=polling']){
    const r=await fetch(base+route);assert.equal(r.status,401,route);assert.match(r.headers.get('www-authenticate'),/Basic/);
  }
  assert.equal((await fetch(base+'/healthz')).status,200);
  const headers={Authorization:'Basic '+Buffer.from('test-user:test-password').toString('base64')};
  assert.equal((await fetch(base+'/api/config',{headers})).status,200);
  assert.equal((await fetch(base+'/socket.io/?EIO=4&transport=polling',{headers})).status,200);
  assert.equal((await fetch(base+'/socket.io/?EIO=4&transport=polling',{headers:{...headers,Origin:'https://unrelated.example'}})).status,403);
});
