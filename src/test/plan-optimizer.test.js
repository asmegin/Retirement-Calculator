const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../public/engine'),optimize=require('../public/plan-optimizer');
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
 assert.equal(JSON.stringify(c),before);assert.equal(r.config.incomes[0].cppStartAge,60);assert.ok(r.monthlySpend>=r.baselineSpend);assert.ok(r.evaluated<=12);
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
 assert.equal(JSON.stringify(c),original);assert.deepEqual(r.rows.map(row=>row.ages),[[50,49],[55,54],[60,59],[61,60]]);
 assert.ok(r.rows[0].unavailable);assert.ok(r.rows[1].unavailable);
 for(const row of r.rows.filter(row=>!row.unavailable)){
   assert.equal(row.config.assumptions.desiredMonthlyIncome,row.monthlySpend);
   assert.deepEqual(row.config.incomes.map(p=>p.targetRetireAge),row.ages);
   assert.ok(E.simulate(row.config,{startYear:2032}).years.every(y=>y.unfunded<=1));
 }
});
