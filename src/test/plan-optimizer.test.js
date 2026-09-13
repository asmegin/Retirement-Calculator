const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../public/engine'),optimize=require('../public/plan-optimizer');
test('combined spending search preserves inputs, budgets and started benefits and reproduces capacity',()=>{
 const c=E.defaultConfig();c.assumptions.householdType='single';c.assumptions.targetDeathAge=68;c.assumptions.desiredMonthlyIncome=1000;
 c.incomes.forEach(p=>Object.assign(p,{birthYear:1961,targetRetireAge:65,cppStartAge:60,cppBaseAt65:600,oasBaseAt65:600}));
 c.accounts=[{name:'Savings',owner:c.incomes[0].name,type:'TFSA',balance:100000,growthRate:0}];
 const before=JSON.stringify(c),r=optimize(c,{startYear:2026,maxEvaluations:12});
 assert.equal(JSON.stringify(c),before);assert.equal(r.config.incomes[0].cppStartAge,60);assert.ok(r.monthlySpend>=r.baselineSpend);assert.ok(r.evaluated<=12);
 assert.equal(r.monthlySpend,Math.floor(E.maxSustainableSpend(r.config,{startYear:2026,fastSolve:false})));
 assert.equal(r.config.assumptions.desiredMonthlyIncome,1000);assert.deepEqual(r.config.realEstate,E.normalizeConfig(c).realEstate);
});
