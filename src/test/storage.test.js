'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const Store=require('../server-store'),E=require('../public/engine');

async function fixture(t){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'retirement-store-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const store=new Store(dir);await store.init();return {store,dir};
}
test('fresh installation has neutral defaults; old household data survives normalization',async t=>{
  const {store,dir}=await fixture(t),fresh=await store.readConfig();
  assert.equal(fresh.onboardingComplete,false);assert.equal(fresh.accounts.length,0);assert.equal(fresh.realEstate.length,0);
  const saved=structuredClone(fresh);saved.incomes[0].name='Existing owner';saved.incomes[0].salary=85000;
  saved.assumptions.desiredMonthlyIncome=5200;delete saved.onboardingComplete;
  await fs.writeFile(path.join(dir,'config.json'),JSON.stringify(saved));
  const restored=await new Store(dir).init();
  assert.equal(restored.incomes[0].name,'Existing owner');assert.equal(restored.incomes[0].salary,85000);
  assert.equal(restored.assumptions.desiredMonthlyIncome,5200);assert.equal(restored.onboardingComplete,true);
});
test('concurrent saves and scenario edits are serialized and backups stay unique and bounded',async t=>{
  const {store,dir}=await fixture(t),initial=await store.readConfig();
  await Promise.all(Array.from({length:35},(_,i)=>{
    const c=structuredClone(initial);c.assumptions.desiredMonthlyIncome=3000+i;return store.saveConfig(c);
  }));
  assert.equal((await store.readConfig()).assumptions.desiredMonthlyIncome,3034);
  const backups=await store.listBackups();assert.equal(backups.length,30);assert.equal(new Set(backups.map(b=>b.file)).size,30);
  for(const b of backups)assert.ok(JSON.parse(await fs.readFile(path.join(dir,'backups',b.file),'utf8')).assumptions);
  await Promise.all(Array.from({length:8},(_,i)=>store.saveScenario('Case '+i,initial)));
  assert.equal((await store.listScenarios()).length,8);
  assert.equal((await new Store(dir).init()).assumptions.desiredMonthlyIncome,3034);
});
test('backup restore preserves a recoverable copy and rejects traversal or invalid data',async t=>{
  const {store}=await fixture(t),before=await store.readConfig(),file=await store.backup();
  const edited=structuredClone(before);edited.assumptions.desiredMonthlyIncome=7200;await store.saveConfig(edited);
  const restored=await store.restore(file);assert.equal(restored.assumptions.desiredMonthlyIncome,before.assumptions.desiredMonthlyIncome);
  await assert.rejects(store.restore('../config.json'),/Invalid backup/);
  await assert.rejects(store.saveConfig({assumptions:{},incomes:[]}),/household settings/i);
  assert.deepEqual(await store.readConfig(),restored);
});
test('corrupt data is reported without silently replacing a household or scenario collection',async t=>{
  const {store,dir}=await fixture(t);
  const scenarios=path.join(dir,'scenarios.json');await fs.writeFile(scenarios,'{broken');
  await assert.rejects(store.saveScenario('New',E.defaultConfig()));assert.equal(await fs.readFile(scenarios,'utf8'),'{broken');
  const config=path.join(dir,'config.json');await fs.writeFile(config,'{broken');
  await assert.rejects(new Store(dir).init());assert.equal(await fs.readFile(config,'utf8'),'{broken');
});
test('failed atomic replacement leaves the last saved file intact and removes temporary files',async t=>{
  const {store,dir}=await fixture(t),before=await store.readConfig();
  const original=fs.rename;fs.rename=async(from,to)=>{if(to===path.join(dir,'config.json'))throw new Error('Injected disk failure');return original(from,to);};
  try{const c=structuredClone(before);c.assumptions.desiredMonthlyIncome=9999;await assert.rejects(store.saveConfig(c),/disk failure/);}
  finally{fs.rename=original;}
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir,'config.json'),'utf8')),before);
  assert.equal((await fs.readdir(dir)).filter(f=>f.endsWith('.tmp')).length,0);
});
