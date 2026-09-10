'use strict';
// Run with Node 22+: node scripts/benchmark-rental-search.js [--quick-only] [--case=0]
// An optional RENTAL_REFERENCE_ENGINE path compares against a saved earlier engine.
const E=require('../src/public/engine.js');
const {performance}=require('node:perf_hooks');
const startYear=2026;
function fixtures(){
  function household(name,years){
    const c=E.defaultConfig();c.onboardingComplete=true;
    c.incomes.forEach((p,k)=>Object.assign(p,{name:'Person '+k,birthYear:startYear-60+k*2,salary:k?45000:85000,targetRetireAge:k?64:65,cppBaseAt65:1000,oasBaseAt65:700,deathAge:60+years-k*2}));
    c.assumptions.targetDeathAge=60+years;c.assumptions.desiredMonthlyIncome=5000;
    c.accounts=[{name:'RRSP',owner:'Person 0',type:'RRSP',balance:500000,growthRate:4},{name:'TFSA',owner:'Person 1',type:'TFSA',balance:180000,growthRate:4}];
    c.realEstate=[
      {name:'Rental A',type:'rental',value:600000,acb:400000,buildingAcb:300000,uccPool:240000,buildingSalePercent:75,ccaEnabled:true,grossRentMonthly:2600,annualPropertyTax:3500,annualInsurance:1500,annualMaintenance:2500,mortgage:180000,interestRate:4,paymentMonthly:1500,appreciation:2,sellingCostPct:5},
      {name:'Rental B',type:'rental',value:420000,acb:300000,buildingAcb:220000,uccPool:190000,buildingSalePercent:75,ccaEnabled:true,grossRentMonthly:1900,annualPropertyTax:2500,annualInsurance:1200,annualMaintenance:2000,mortgage:100000,interestRate:4.5,paymentMonthly:1000,appreciation:2,sellingCostPct:5}
    ];
    return {name,config:c,compareCCA:true};
  }
  const standard=household('Retirement and pension transitions',25);
  const growth=household('Different rental growth and yields',30);
  Object.assign(growth.config.realEstate[0],{appreciation:4,grossRentMonthly:1400});
  Object.assign(growth.config.realEstate[1],{appreciation:0,grossRentMonthly:2600,ccaEnabled:false});
  const short=household('Short horizon with exhaustive reference',5);
  short.config.incomes.forEach(p=>{p.salary=0;p.targetRetireAge=58;});
  short.config.assumptions.desiredMonthlyIncome=3000;
  return [short,standard,growth];
}
function run(engine,fixture,searchMode,maxEvaluations){
  const begin=performance.now();
  const r=engine.compareRentalSales(fixture.config,{startYear,propertyIndices:[0,1],compareCCA:fixture.compareCCA,searchMode,maxEvaluations});
  return {ms:Math.round(performance.now()-begin),searched:r.evaluated,verified:r.rows.length,monthlySpend:r.bestSpending.monthlySpend,
    choices:r.bestSpending.sales.map(s=>({year:s.year,cca:s.cca})),method:r.searchMethod};
}
if(require.main===module){
  const reference=process.env.RENTAL_REFERENCE_ENGINE?require(require('node:path').resolve(process.env.RENTAL_REFERENCE_ENGINE)):E;
  const output=[];
  E.simulate(fixtures()[0].config,{startYear});reference.simulate(fixtures()[0].config,{startYear});
  const caseArg=process.argv.find(arg=>arg.startsWith('--case='));
  for(const fixture of (caseArg?[fixtures()[Number(caseArg.split('=')[1])]]:fixtures())){
    const quick=run(E,fixture,'quick');
    const thorough=process.argv.includes('--quick-only')?null:run(reference,fixture,'thorough');
    const row={name:fixture.name,quick,thorough};
    if(thorough){row.speedup=Number((thorough.ms/Math.max(1,quick.ms)).toFixed(2));row.spendingDifference=quick.monthlySpend-thorough.monthlySpend;}
    output.push(row);console.log(JSON.stringify(row));
  }
}
module.exports={fixtures};
