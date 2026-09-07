(function(root){
  root.AppWorkers={create(kind){
    if(location.protocol!=='file:')return new Worker('./'+(kind==='retirement'?'planner-worker':'optimization-worker')+'.js');
    const handler=kind==='retirement'?`self.onmessage=function(e){const {id,config,fixedPerson}=e.data;try{self.postMessage({id,result:RetireEngine.solveRetirementAges(config,{fixedPerson,onProgress:(tested,total)=>self.postMessage({id,tested,total})})});}catch(error){self.postMessage({id,error:error.message});}};`:`self.onmessage=function(e){const {id,config,objective}=e.data;try{self.postMessage({id,result:RetireEngine.optimizeWithdrawals(config,{objective,onProgress:progress=>self.postMessage({id,progress})})});}catch(error){self.postMessage({id,error:error.message});}};`;
    const url=URL.createObjectURL(new Blob([root.RetirementWorkerSource,handler],{type:'text/javascript'}));
    const worker=new Worker(url);URL.revokeObjectURL(url);return worker;
  }};
})(window);
