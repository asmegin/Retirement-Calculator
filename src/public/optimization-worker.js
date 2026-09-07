'use strict';
importScripts('./planning-core.js','./engine.js');
self.onmessage=event=>{
  const {config,objective,id}=event.data;
  try{
    const result=RetireEngine.optimizeWithdrawals(config,{objective,onProgress:progress=>self.postMessage({id,progress})});
    self.postMessage({id,result});
  }catch(error){self.postMessage({id,error:error.message});}
};
