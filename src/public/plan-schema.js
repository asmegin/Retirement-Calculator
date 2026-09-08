(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(()=>require('./engine'));
  else root.PlanSchema=factory(()=>root.RetireEngine);
})(typeof self!=='undefined'?self:this,function(engine){
  'use strict';
  function invalid(message){const error=new Error(message);error.code='PLAN_VALIDATION';throw error;}
  function inspect(value,depth=0){
    if(depth>30)invalid('Plan nesting exceeds the supported limit.');
    if(typeof value==='number'&&(!Number.isFinite(value)||Math.abs(value)>1e12))invalid('Plan numbers must be finite and within supported limits.');
    if(typeof value==='string'&&value.length>16384)invalid('A plan text field is too long.');
    if(!value||typeof value!=='object')return;
    if(Array.isArray(value)&&value.length>4096)invalid('A plan collection is too large.');
    for(const [key,item] of Object.entries(value)){
      if(['__proto__','constructor','prototype'].includes(key))invalid('Unsafe object keys are not allowed in a plan.');
      if(['name','owner','pension2Name'].includes(key)&&item!=null&&typeof item!=='string')invalid('Names and ownership labels must be text.');
      inspect(item,depth+1);
    }
  }
  function validate(value){
    inspect(value);
    if(!value||typeof value!=='object'||Array.isArray(value)||!value.assumptions||typeof value.assumptions!=='object'||Array.isArray(value.assumptions)||!Array.isArray(value.incomes)||value.incomes.length<1||value.incomes.length>2||value.incomes.some(p=>!p||typeof p!=='object'||Array.isArray(p)))invalid('Choose a retirement plan JSON file with household settings and one or two people.');
    if(new TextEncoder().encode(JSON.stringify(value)).length>2*1024*1024)invalid('The plan exceeds the 2 MB limit.');
    for(const [key,limit] of [['accounts',200],['realEstate',50],['dbPensions',100]])if(value[key]!==undefined&&(!Array.isArray(value[key])||value[key].length>limit||value[key].some(item=>!item||typeof item!=='object'||Array.isArray(item))))invalid('Invalid or oversized '+key+' collection.');
    let c;
    try{c=engine().normalizeConfig(value);}catch(_){invalid('Check the plan fields and numeric values.');}
    const year=new Date().getFullYear();
    if(c.incomes.some(p=>p.birthYear<1900||p.birthYear>year-18||p.targetRetireAge<18||p.targetRetireAge>120||p.deathAge!=null&&(Number(p.deathAge)<18||Number(p.deathAge)>120)))invalid('Use adult birth years and retirement/lifespan ages between 18 and 120.');
    if(c.assumptions.targetDeathAge<18||c.assumptions.targetDeathAge>120)invalid('The planning lifespan must be between 18 and 120.');
    let simulation;try{simulation=engine().simulate(c);}catch(_){invalid('The plan could not be calculated. Check numeric values and dates.');}
    if(!simulation.years.length)invalid('Choose a planning age that extends into the current year.');
    if(!Number.isFinite(simulation.finalNetWorth)||!Number.isFinite(simulation.lifetimeTax))invalid('The plan exceeds supported calculation limits.');
    c.onboardingComplete=true;return c;
  }
  function scenarioName(value){if(typeof value!=='string')invalid('Enter a scenario name.');const name=value.trim().slice(0,60);if(!name)invalid('Enter a scenario name.');return name;}
  return {validate,scenarioName};
});
