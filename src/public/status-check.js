// Shared by the HTTP worker and the offline Blob worker.
function RetirementStatusCheck({id,config}) {
  try {
    const baseline=RetireEngine.simulate(config);
    const stressed=RetireEngine.simulate(config,{returnMode:'bad-decade'});
    const runs=Math.max(100,Math.min(2000,Math.round(config.assumptions.mcRuns||500)));
    RetireEngine.monteCarloRun(config,runs,20260806,
      progress=>self.postMessage({id,progress:{fraction:progress}}),
      monteCarlo=>self.postMessage({id,result:{baseline,stressed,monteCarlo}}));
  }catch(error){self.postMessage({id,error:error.message});}
}
