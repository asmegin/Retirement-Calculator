const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../public/engine'),optimize=require('../public/plan-optimizer');
const close=(a,b,tolerance=.01)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
test('combined optimizer upgrades unsafe RRSP marginal-rate floors',()=>{
 const c=E.defaultConfig();c.assumptions.rrspMinMarginalRate=0;c.assumptions.targetDeathAge=66;
 const r=optimize(c,{startYear:2026,maxEvaluations:0});
 assert.equal(r.config.assumptions.rrspMinMarginalRate,30);
});
test('combined spending search preserves inputs, budgets and started benefits and reproduces capacity',()=>{
 const c=E.defaultConfig();c.assumptions.householdType='single';c.assumptions.targetDeathAge=68;c.assumptions.desiredMonthlyIncome=1000;
 c.incomes.forEach(p=>Object.assign(p,{birthYear:1961,targetRetireAge:65,cppStartAge:60,cppBaseAt65:600,oasBaseAt65:600}));
 c.accounts=[{name:'Savings',owner:c.incomes[0].name,type:'TFSA',balance:100000,growthRate:0}];
 const before=JSON.stringify(c),r=optimize(c,{startYear:2026,maxEvaluations:12});
 assert.equal(JSON.stringify(c),before);assert.equal(r.config.incomes[0].cppStartAge,60);assert.ok(r.monthlySpend>=r.baselineSpend);assert.ok(r.evaluated<=r.maxEvaluations);assert.ok(r.searchBudget===12);
 assert.equal(r.monthlySpend,Math.floor(E.maxSustainableSpend(r.config,{startYear:2026,fastSolve:false})));
 assert.equal(r.config.assumptions.desiredMonthlyIncome,r.monthlySpend);assert.ok(r.result.years.every(y=>y.unfunded<=1));assert.deepEqual(r.config.realEstate,E.normalizeConfig(c).realEstate);
});
test('spending recommendation scales categories and is funded without a transient spending override',()=>{
 const c=E.defaultConfig();c.incomes.forEach(p=>Object.assign(p,{birthYear:1961,targetRetireAge:65}));
 Object.assign(c.assumptions,{targetDeathAge:66,spendingMode:'categories',spendingCategories:[{name:'Living',amount:1000,frequency:'monthly',startAge:0,endAge:999},{name:'Travel',amount:6000,frequency:'yearly',startAge:0,endAge:999}]});
 c.accounts=[{name:'Savings',owner:c.incomes[0].name,type:'TFSA',balance:100000,growthRate:0}];
 const r=optimize(c,{startYear:2026,maxEvaluations:0});
 assert.equal(r.config.assumptions.desiredMonthlyIncome,r.monthlySpend);
 assert.ok(Math.abs(E.Planning.spendingBaseline(r.config.assumptions.spendingCategories)/12-r.monthlySpend)<.001);
 assert.ok(Math.abs(r.config.assumptions.spendingCategories[1].amount/r.config.assumptions.spendingCategories[0].amount-6)<1e-10);
 assert.ok(E.simulate(r.config,{startYear:2026}).years.every(y=>y.unfunded<=1));
});
test('retirement spending pairs ages at five-year intervals including a non-round lifespan endpoint',()=>{
 const c=E.defaultConfig();c.incomes.forEach((p,k)=>Object.assign(p,{name:k?'Kristen':'Jon',birthYear:1976+k,targetRetireAge:60}));c.assumptions.targetDeathAge=61;
 c.accounts=[{name:'Savings',owner:'Jon',type:'TFSA',balance:100000,growthRate:0}];
 const original=JSON.stringify(c),r=optimize(c,{objective:'retirement-spending',startYear:2032,maxEvaluations:0});
 /* Jon is 56 in 2032, so the sweep starts at his next five-year milestone and
    runs to the lifespan endpoint; ages already behind him are not offered. */
 assert.equal(JSON.stringify(c),original);assert.deepEqual(r.rows.map(row=>row.ages),[[60,59],[61,60]]);
 assert.ok(r.rows.every(row=>!row.unavailable));
 assert.ok(r.rows.every(row=>row.year>=2032));
 for(const row of r.rows.filter(row=>!row.unavailable)){
   assert.equal(row.config.assumptions.desiredMonthlyIncome,row.monthlySpend);
   assert.deepEqual(row.config.incomes.map(p=>p.targetRetireAge),row.ages);
   assert.ok(E.simulate(row.config,{startYear:2032}).years.every(y=>y.unfunded<=1));
 }
});
test('retirement spending stops at the latest age worth choosing between',()=>{
 const c=E.defaultConfig();c.incomes.forEach((p,k)=>Object.assign(p,{name:k?'B':'A',birthYear:1980+k,targetRetireAge:60}));
 c.assumptions.targetDeathAge=95;
 c.accounts=[{name:'Savings',owner:'A',type:'TFSA',balance:100000,growthRate:0}];
 const r=optimize(c,{objective:'retirement-spending',startYear:2026,maxEvaluations:0});
 const ages=r.rows.map(row=>row.ages[0]);
 /* A turns 46 in 2026, so the sweep runs 50..75 in fives and never offers a
    retirement age past 75, where every row would saturate the spending solver. */
 assert.deepEqual(ages,[50,55,60,65,70,75]);
 assert.ok(r.rows.every(row=>row.monthlySpend===undefined||row.monthlySpend<39999));
});
test('combined optimizer reports the side effects of reaching its goal',()=>{
 const c=E.defaultConfig();c.assumptions.householdType='single';c.assumptions.targetDeathAge=72;
 c.assumptions.desiredMonthlyIncome=2000;
 c.incomes.forEach(p=>Object.assign(p,{birthYear:1958,targetRetireAge:68,cppBaseAt65:900,oasBaseAt65:700}));
 c.accounts=[{name:'RRSP',owner:c.incomes[0].name,type:'RRSP',balance:400000,growthRate:4}];
 for(const objective of ['spending','estate','tax']){
   const r=optimize(c,{startYear:2026,objective,maxEvaluations:20});
   assert.ok(r.reference,objective+' reports a comparison baseline');
   assert.equal(typeof r.budgetReached,'boolean');
   assert.ok(r.evaluated<=r.maxEvaluations,objective+' stays inside its reported budget');
   /* Deltas describe the applied plan against that same comparison baseline. */
   close(r.taxChange,(r.result.lifetimeTax+r.result.lifetimeCorporateTax)-(r.reference.lifetimeTax+r.reference.lifetimeCorporateTax),.01);
   close(r.estateChange,r.result.finalNetWorthReal-r.reference.finalNetWorthReal,.01);
   close(r.benefitChange,r.result.lifetimeBenefits-r.reference.lifetimeBenefits,.01);
 }
 /* For the spending goal the comparison is the current plan spending its own
    maximum, so the deltas isolate the plan changes rather than the extra spending. */
 const spend=optimize(c,{startYear:2026,objective:'spending',maxEvaluations:20});
 close(spend.reference.years[0].spendTarget,E.simulate(Object.assign(E.normalizeConfig(c),{assumptions:Object.assign(E.normalizeConfig(c).assumptions,{desiredMonthlyIncome:spend.baselineSpend})}),{startYear:2026}).years[0].spendTarget,1);
});
