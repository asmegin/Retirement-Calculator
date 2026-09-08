(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(()=>require('./engine'));
  else root.PlanSchema=factory(()=>root.RetireEngine);
})(typeof self!=='undefined'?self:this,function(engine){
  'use strict';
  function validate(value){
    if(!value||typeof value!=='object'||Array.isArray(value)||!value.assumptions||typeof value.assumptions!=='object'||Array.isArray(value.assumptions)||!Array.isArray(value.incomes)||value.incomes.length<1||value.incomes.length>2||value.incomes.some(p=>!p||typeof p!=='object'||Array.isArray(p)))throw new Error('Choose a retirement plan JSON file with household settings and one or two people.');
    if(JSON.stringify(value).length>2*1024*1024)throw new Error('The plan exceeds the 2 MB limit.');
    const c=engine().normalizeConfig(value);
    if(!engine().simulate(c).years.length)throw new Error('Choose a planning age that extends into the current year.');
    c.onboardingComplete=true;return c;
  }
  function scenarioName(value){const name=String(value||'').trim().slice(0,60);if(!name)throw new Error('Enter a scenario name.');return name;}
  return {validate,scenarioName};
});
