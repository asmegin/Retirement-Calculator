'use strict';
importScripts('./planning-core.js','./engine.js');
self.onmessage=({data})=>{
  const {id,config,task,propertyIndex,compareCCA}=data;
  try{
    const options={propertyIndex,compareCCA,onProgress:progress=>self.postMessage({id,progress})};
    const result=task==='rental'?RetireEngine.compareRentalSales(config,options):RetireEngine.compareWithdrawalOrders(config,options);
    self.postMessage({id,result});
  }catch(error){self.postMessage({id,error:error.message});}
};
