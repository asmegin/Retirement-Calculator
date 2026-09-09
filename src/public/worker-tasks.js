// Shared dispatch for HTTP workers and the bundled file:// worker.
(function(root){
  'use strict';
  root.runRetirementTask=function(kind,data){
    if(kind==='status')return RetirementStatusCheck(data);
    const {id,config}=data,progress=value=>root.postMessage({id,progress:value});
    try{
      let result;
      if(kind==='comparison'){
        const options={propertyIndex:data.propertyIndex,propertyIndices:data.propertyIndices,compareCCA:data.compareCCA,maxEvaluations:data.maxEvaluations,onProgress:progress};
        result=data.task==='rental'?RetireEngine.compareRentalSales(config,options):RetireEngine.compareWithdrawalOrders(config,options);
      }else if(kind==='retirement'){
        result=RetireEngine.solveRetirementAges(config,{fixedPerson:data.fixedPerson,maxYearGap:data.maxYearGap,preferClose:data.preferClose,sellRentals:data.sellRentals,onProgress:(tested,total)=>root.postMessage({id,tested,total})});
      }else if(kind==='optimization')result=RetireEngine.optimizeWithdrawals(config,{objective:data.objective,onProgress:progress});
      else throw new Error('Unknown calculation task.');
      root.postMessage({id,result});
    }catch(error){root.postMessage({id,error:error.message,fix:error.fix});}
  };
})(self);
