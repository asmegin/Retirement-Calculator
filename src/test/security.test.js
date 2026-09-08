'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const E=require('../public/engine');globalThis.PlanSchema=require('../public/plan-schema');require('../public/backup-crypto');
test('versioned and legacy backups preserve the plan and use independent salt/IV values',async()=>{
  const c=E.defaultConfig();c.incomes[0].name='Élodie';const normalized=PlanSchema.validate(c);
  const plain=await PlanBackup.encode(c);assert.deepEqual(plain,{version:1,encrypted:false,data:normalized});
  assert.deepEqual(await PlanBackup.decode(plain),normalized);assert.deepEqual(await PlanBackup.decode(c),normalized);
  const password='Maple 🍁 phrase',a=await PlanBackup.encode(c,password),b=await PlanBackup.encode(c,password);
  assert.equal(a.iterations,250000);assert.equal(Buffer.from(a.salt,'base64').length,16);assert.equal(Buffer.from(a.iv,'base64').length,12);
  assert.notEqual(a.salt,b.salt);assert.notEqual(a.iv,b.iv);assert.notEqual(a.data,b.data);
  assert.deepEqual(await PlanBackup.decode(a,password),normalized);
  // Independent Node cipher API verifies the Web Crypto wire format, including the GCM tag.
  const key=crypto.pbkdf2Sync(password,Buffer.from(a.salt,'base64'),250000,32,'sha256'),encrypted=Buffer.from(a.data,'base64');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(a.iv,'base64'));decipher.setAuthTag(encrypted.subarray(-16));
  assert.deepEqual(JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(0,-16)),decipher.final()]).toString('utf8')),normalized);
});
test('wrong passwords, tampered ciphertext and malformed encryption parameters fail closed',async()=>{
  const backup=await PlanBackup.encode(E.defaultConfig(),'correct password');
  await assert.rejects(PlanBackup.decode(backup,'wrong password'),/Incorrect password/);
  const damaged=structuredClone(backup),data=Buffer.from(damaged.data,'base64');data[0]^=1;damaged.data=data.toString('base64');
  await assert.rejects(PlanBackup.decode(damaged,'correct password'),/Incorrect password/);
  for(const patch of [{version:2},{iterations:1e12},{iterations:2.5},{salt:'***='},{iv:'AAAA'},{data:''},{encrypted:'true'}])await assert.rejects(PlanBackup.decode({...backup,...patch},'correct password'));
  await assert.rejects(PlanBackup.encode(E.defaultConfig(),''),/password/);
});
test('untrusted plan objects cannot introduce prototype keys, non-finite numbers or unbounded horizons',()=>{
  for(const key of ['__proto__','constructor','prototype']){
    const c=E.defaultConfig();c.accounts=[JSON.parse('{"'+key+'":{"polluted":true}}')];assert.throws(()=>PlanSchema.validate(c),/Unsafe object keys/);
  }
  assert.equal({}.polluted,undefined);
  for(const edit of [c=>c.assumptions.targetDeathAge=1e9,c=>c.incomes[0].birthYear=3000,c=>c.incomes[0].salary=Infinity,c=>c.incomes[0].name={},c=>c.accounts=Array(201).fill({}),c=>c.incomes[0].deathAge='Infinity']){
    const c=E.defaultConfig();edit(c);assert.throws(()=>PlanSchema.validate(c));
  }
  let deep={};for(let i=0;i<40;i++)deep={next:deep};const c=E.defaultConfig();c.extra=deep;assert.throws(()=>PlanSchema.validate(c),/nesting/);
});
