'use strict';
importScripts('./planning-core.js','./engine.js');
self.onmessage = function(event) {
  const {config, fixedPerson, maxYearGap, preferClose, sellRentals, id} = event.data;
  try {
    const result = RetireEngine.solveRetirementAges(config, {fixedPerson,maxYearGap,preferClose,sellRentals,
      onProgress: (tested,total) => self.postMessage({id,tested,total})});
    self.postMessage({id,result});
  } catch (error) { self.postMessage({id,error:error.message}); }
};
