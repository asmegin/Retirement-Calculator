'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const E=require('./public/engine'),Schema=require('./public/plan-schema');

class ServerStore {
  constructor(directory){this.directory=path.resolve(directory);this.backups=path.join(this.directory,'backups');this.queue=Promise.resolve();}
  serial(work){const job=this.queue.then(work);this.queue=job.catch(()=>{});return job;}
  async init(){await fs.mkdir(this.backups,{recursive:true,mode:0o700});return this.readConfig();}
  async json(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
  async write(file,value){
    const temp=file+'.'+crypto.randomUUID()+'.tmp';let handle;
    try{handle=await fs.open(temp,'wx',0o600);await handle.writeFile(JSON.stringify(value,null,2));await handle.sync();await handle.close();handle=null;await fs.rename(temp,file);}
    finally{await handle?.close();await fs.unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  }
  async config(){
    const file=path.join(this.directory,'config.json'),raw=await this.json(file,undefined);
    if(raw===undefined){const fresh=E.normalizeConfig(E.defaultConfig());await this.write(file,fresh);return fresh;}
    const normalized=Schema.validate(raw);normalized.onboardingComplete=raw.onboardingComplete!==false;
    if(JSON.stringify(raw)!==JSON.stringify(normalized)){await this.snapshot(raw);await this.write(file,normalized);}
    return normalized;
  }
  readConfig(){return this.serial(()=>this.config());}
  async snapshot(config){
    const file='config-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID()+'.json';
    await this.write(path.join(this.backups,file),config);
    const files=(await fs.readdir(this.backups)).filter(f=>f.endsWith('.json')).sort().reverse();
    await Promise.all(files.slice(30).map(f=>fs.unlink(path.join(this.backups,f))));return file;
  }
  saveConfig(incoming){return this.serial(async()=>{const c=Schema.validate(incoming);await this.snapshot(await this.config());await this.write(path.join(this.directory,'config.json'),c);return c;});}
  backup(){return this.serial(async()=>this.snapshot(await this.config()));}
  listBackups(){return this.serial(async()=>{const files=(await fs.readdir(this.backups)).filter(f=>f.endsWith('.json')).sort().reverse();return Promise.all(files.map(async file=>{const s=await fs.stat(path.join(this.backups,file));return {file,size:s.size,modified:s.mtime};}));});}
  restore(file){return this.serial(async()=>{
    if(typeof file!=='string'||path.basename(file)!==file||!file.endsWith('.json'))throw new Error('Invalid backup name.');
    const raw=await this.json(path.join(this.backups,file),null);if(!raw)throw new Error('Backup not found.');
    const c=Schema.validate(raw);await this.snapshot(await this.config());await this.write(path.join(this.directory,'config.json'),c);return c;
  });}
  async scenarios(){const list=await this.json(path.join(this.directory,'scenarios.json'),[]);if(!Array.isArray(list))throw new Error('Invalid saved scenarios file. Restore it from backup.');return list;}
  listScenarios(){return this.serial(()=>this.scenarios());}
  saveScenario(name,config){return this.serial(async()=>{name=Schema.scenarioName(name);const c=Schema.validate(config);const list=(await this.scenarios()).filter(s=>s.name!==name);list.push({name,savedAt:new Date().toISOString(),config:c});await this.write(path.join(this.directory,'scenarios.json'),list);return list;});}
  deleteScenario(name){return this.serial(async()=>{const list=(await this.scenarios()).filter(s=>s.name!==name);await this.write(path.join(this.directory,'scenarios.json'),list);return list;});}
}
module.exports=ServerStore;
