'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../public/engine');
const close=(a,b,tolerance=.01)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
function config(age=65,single=false) {
  const c=E.defaultConfig();
  c.incomes.forEach((p,i)=>Object.assign(p,{name:'Person '+(i+1),birthYear:2026-age,salary:0,salaryGrowth:0,
    targetRetireAge:age,cppBaseAt65:0,oasBaseAt65:0,hooppStartAge:null,pension2Amount:0,
    hbpAnnual:0,hbpYears:0,rrspRoomOpening:0,tfsaRoomOpening:0,rrifConversionAge:71}));
  Object.assign(c.assumptions,{householdType:single?'single':'couple',inflation:0,desiredMonthlyIncome:0,
    targetDeathAge:age+3,gisEnabled:false,optimizeContributions:false,reinvestRefund:false,
    reinvestPayoffPayments:false,spendingPhases:[{untilAge:999,factor:100}],childcare:{childrenBirthYears:[],items:[]}});
  c.accounts=[];c.realEstate=[];c.dbPensions=[];return c;
}
const run=c=>E.simulate(c,{startYear:2026});
const account=(type,balance,extra={})=>({name:type,owner:'Person 1',type,balance,growthRate:0,distributionYield:0,...extra});
test('1: DB pension splits at 58, RRIF at 62 does not, RRIF at 65 does; ordinary RRSP never splits',()=>{
  const c=config(58);c.assumptions.targetDeathAge=66;
  c.dbPensions=[{name:'DB',owner:'Person 1',startAge:58,lifetime:4000}];
  c.accounts=[account('RRSP',1000000)];c.incomes[0].rrifConversionAge=61;
  const s=run(c);close(s.years[0].pensionSplit,24000);
  close(s.years.find(r=>r.ages[0]===62).pensionSplit,24000);
  assert.ok(s.years.find(r=>r.ages[0]===65).pensionSplit>24000);
  const ordinary=config(65);ordinary.accounts=[account('RRSP',500000)];ordinary.assumptions.desiredMonthlyIncome=6000;
  close(run(ordinary).years[0].pensionSplit,0);
  ordinary.incomes[0].rrifConversionAge=65;
  const row=run(ordinary).years[0];assert.ok(row.pensionSplit>0);close(row.netCash,row.spendTarget,1);
});
test('2: taxable-account eligible dividends use 138% taxable income for OAS recovery',()=>{
  const c=config(65,true);c.incomes[0].oasBaseAt65=750;
  c.accounts=[account('TAXABLE',1500000,{growthRate:5,distributionYield:5,distributionType:'eligible'})];
  const row=run(c).years[0];close(row.person[0].eligibleDividends,75000);
  close(row.taxableIncome[0],75000*1.38+9000);
  close(row.oasClawback,(112500-93454)*.15);
  assert.ok(row.oasClawback>0);
});
test('2: corporate dividends use gross-up without double-counting cash during withdrawal solve',()=>{
  const c=config(65,true);c.incomes[0].oasBaseAt65=750;c.assumptions.desiredMonthlyIncome=7000;
  c.accounts=[account('CORP',500000,{dividendType:'eligible'})];
  const row=run(c).years[0];close(row.taxableIncome[0],9000+row.discretionaryDraw*1.38);
  close(row.netCash,row.spendTarget,1);assert.ok(row.oasClawback>0);
});
test('3: TFSA drawdown does not reduce GIS or increase taxable income',()=>{
  const c=config(65,true);c.incomes[0].cppBaseAt65=400;c.incomes[0].oasBaseAt65=750;
  c.assumptions.gisEnabled=true;c.assumptions.desiredMonthlyIncome=4000;c.accounts=[account('TFSA',500000)];
  const s=run(c);s.years.forEach(row=>{
    close(row.taxableIncome[0],13800);close(row.gis,E.gisBenefit(4800,true,false,1));
    assert.ok(row.gis>10000);close(row.oasClawback,0);close(row.unfunded,0);assert.ok(row.discretionaryDraw>0);
  });
  const before=s.years[0].gis;c.assumptions.desiredMonthlyIncome=0;close(run(c).years[0].gis,before);
});
test('4: childcare follows lower income, child age limits and two-thirds earned income',()=>{
  const c=config(40);c.incomes[0].salary=140000;c.incomes[1].salary=30000;c.incomes.forEach(p=>p.targetRetireAge=65);
  c.assumptions.childcare={childrenBirthYears:[2019,2022],items:[{amount:16000,startYear:2026,endYear:2027}]};
  let row=run(c).years[0];assert.equal(row.childcareClaimant,'Person 2');close(row.childcareClaim,13000);
  c.incomes[1].salary=12000;row=run(c).years[0];close(row.childcareClaim,8000);
  c.incomes[1].salary=0;close(run(c).years[0].childcareClaim,0);
});
test('5: historical CCA recapture is ordinary income, gain is included at 50%',()=>{
  const c=config(65,true);c.realEstate=[{name:'Rental',type:'rental',value:750000,acb:500000,uccPool:420000,
    saleYear:2026,sellingCostPct:0,ccaEnabled:false}];
  const row=run(c).years[0],sale=row.saleEvents[0];close(sale.ccaRecapture,80000);close(sale.capitalGain,250000);
  close(sale.taxableGain,125000);close(row.person[0].sale,205000);close(sale.terminalLoss,0);
});
test('5: sale below UCC gives terminal loss, not recapture or a building capital loss',()=>{
  const c=config(65,true);c.realEstate=[{name:'Rental',type:'rental',value:350000,acb:500000,uccPool:420000,saleYear:2026,sellingCostPct:0}];
  const row=run(c).years[0],sale=row.saleEvents[0];close(sale.terminalLoss,70000);close(sale.ccaRecapture,0);
  close(sale.capitalLoss,0);close(row.person[0].sale,-70000);
  c.realEstate[0].value=450000;close(run(c).years[0].saleEvents[0].ccaRecapture,30000);
});
test('6: QC brackets, independent BPA, federal abatement and 18.75% family-income credit reduction',()=>{
  const qc=E.personTax(60000,60,0,0,1,'QC'),on=E.personTax(60000,60,0,0,1,'ON');
  close(qc.federal,on.federal*.835);close(qc.provincial,53255*.14+(60000-53255)*.19-18571*.14);
  const low=E.personTax(42000,65,0,0,1,'QC');close(low.provincial,(42000-18571-3906)*.14);
  const taper=E.personTax(45000,65,0,0,1,'QC');close(taper.provincialAgeAmount,3906-(45000-42090)*.1875);
  const a={taxable:48000,age:58,eligiblePension:48000,oas:0},b={taxable:0,age:58,eligiblePension:0,oas:0};
  const split=E.householdTax(a,b,1,true,'QC',false);close(split.split,24000);close(split.provincialSplit,0);
  close(split.p1.provincial,E.personTax(48000,58,48000,0,1,'QC',{familyIncome:48000}).provincial);
});
test('7: Ontario stacks both surtaxes, with $750 health premium at 120k and $900 at 210k',()=>{
  function expected(income){
    let remaining=income,prev=0,gross=0;
    for(const [cap,rate] of E.ONT.brackets){gross+=Math.max(0,Math.min(income,cap)-prev)*rate;prev=cap;if(cap>=income)break;}
    const basic=gross-E.ONT.bpa*.0505;
    return basic+.2*Math.max(0,basic-5710)+.36*Math.max(0,basic-7307)+(income===120000?750:900);
  }
  close(E.personTax(120000,60,0,0,1,'ON').provincial,expected(120000));
  close(E.personTax(210000,60,0,0,1,'ON').provincial,expected(210000));
});
test('6: Quebec Schedule B pools spouses credits and applies the family taper once',()=>{
  const p={taxable:25000,age:65,eligiblePension:2000,oas:0};
  const result=E.householdTax(p,p,1,false,'QC',false);
  const creditPool=2*(3906+2000*1.25)-(50000-42090)*.1875;
  close(result.p1.provincial+result.p2.provincial,2*(25000-18571)*.14-creditPool*.14);
});
test('1: under-65 recipient cannot claim the pension credit on transferred RRIF income',()=>{
  const p1={taxable:50000,age:65,eligiblePension:50000,eligibleDB:0,oas:0};
  const p2={taxable:0,age:60,eligiblePension:0,eligibleDB:0,oas:0};
  const result=E.householdTax(p1,p2,1,true,'ON',false);
  close(result.p2.income,E.personTax(25000,60,0,0,1,'ON').income);
});
test('8: conversion by 71; minimum begins next year at 5.28% and surplus is reinvested',()=>{
  const c=config(71,true);c.accounts=[account('RRSP',1000000)];c.assumptions.desiredMonthlyIncome=0;
  const rows=run(c).years;close(rows[0].rrifForced,0);assert.equal(rows[0].accounts[0].type,'RRIF');
  close(rows[1].rrifForced,52800);close(rows[2].rrifForced,(1000000-52800)*.054);
  assert.ok(rows[1].incomeTax>0);assert.ok(rows[1].accounts.some(a=>a.type==='TFSA' && a.end>0));
  assert.ok(rows[1].accounts.some(a=>a.type==='TAXABLE' && a.end>0));
  close(rows[1].portfolio,1000000-rows[1].totalTax);
  c.incomes[0].rrifConversionAge=70;close(run(c).years[0].rrifForced,50000);
  close(E.rrifFactor(71),.0528);close(E.rrifFactor(95),.2);
});
test('9: unpaid and partial HBP repayment adds RRSP income, no cash or room reduction, and schedule advances',()=>{
  const c=config(40,true);Object.assign(c.incomes[0],{salary:50000,targetRetireAge:65,hbpAnnual:1516,hbpRepaymentBudget:0,hbpYears:2,rrspRoomOpening:10000});
  const rows=run(c).years;close(rows[0].hbpShortfall,1516);close(rows[0].hbpRepayments,0);
  close(rows[1].hbpShortfall,1516);close(rows[2].hbpShortfall,0);close(rows[0].employment,50000);
  const without=structuredClone(c);without.incomes[0].hbpYears=0;
  const ordinary=run(without).years[0];close(rows[0].taxableIncome[0]-ordinary.taxableIncome[0],1516);close(rows[0].rrspRoom[0],ordinary.rrspRoom[0]);
  c.incomes[0].hbpRepaymentBudget=500;const partial=run(c).years[0];close(partial.hbpRepayments,500);close(partial.hbpShortfall,1016);close(partial.deductibleContributions,0);
});
test('10: federal and Ontario age amounts start at 65 and taper independently',()=>{
  const low=E.personTax(42000,65,0,0,1,'ON'),high=E.personTax(75000,65,0,0,1,'ON');
  close(low.federalAgeAmount,9028);close(low.provincialAgeAmount,6223);
  close(high.federalAgeAmount,9028-.15*(75000-45522));close(high.provincialAgeAmount,6223-.15*(75000-46330));
  close(E.personTax(42000,64,0,0,1,'ON').federalAgeAmount,0);
});
test('pensions are opt-in and legacy migration is idempotent with original income preserved',()=>{
  close(E.normalizeConfig(E.defaultConfig()).dbPensions.length,0);
  const c=config(60);c.incomes[1].hooppStartAge=60;c.incomes[0].pension2Amount=1000;c.incomes[0].pension2StartAge=60;
  c.hooppTiers=[{startAge:60,lifetime:4180,bridge:990}];
  const normalized=E.normalizeConfig(c);assert.equal(normalized.dbPensions.length,2);assert.equal(normalized.incomes[1].hooppStartAge,null);
  assert.deepEqual(E.normalizeConfig(normalized),normalized);
  close(run(normalized).years[0].pension,1000*12+(4180+990)*12);
});
test('pension can follow retirement, using interpolated age estimates',()=>{
  const c=config(60,true);c.incomes[0].targetRetireAge=62;
  c.dbPensions=[{name:'Plan',owner:'Person 1',startAge:60,followsRetirement:true,tiers:[{startAge:60,lifetime:1000,bridge:0},{startAge:64,lifetime:2000,bridge:0}]}];
  const rows=run(c).years;close(rows[0].pension,0);close(rows[2].pension,18000);
});
test('retirement search finds earliest feasible pair, respects either fixed age and does not mutate config',()=>{
  const c=config(60);c.incomes.forEach(p=>Object.assign(p,{salary:40000,targetRetireAge:60}));
  c.assumptions.targetDeathAge=68;c.assumptions.desiredMonthlyIncome=3000;c.accounts=[account('TFSA',170000)];
  const before=structuredClone(c),result=E.solveRetirementAges(c,{startYear:2026,maxAge:65});
  assert.equal(result.found,true);assert.deepEqual(c,before);
  const ordered=E.retirementCandidates(c,{startYear:2026,maxAge:65});
  for(const ages of ordered){
    const candidate=structuredClone(c);ages.forEach((a,k)=>candidate.incomes[k].targetRetireAge=a);
    if(ages.join()===result.ages.join()){assert.equal(run(candidate).depletedYear,null);break;}
    assert.notEqual(run(candidate).depletedYear,null);
  }
  for(const fixedPerson of [0,1]){const r=E.solveRetirementAges(c,{startYear:2026,maxAge:65,fixedPerson});assert.equal(r.found,true);assert.equal(r.ages[fixedPerson],60);}
});
test('retirement search supports single, impossible target, zero spending, and empty search range',()=>{
  const c=config(60,true);c.assumptions.targetDeathAge=68;
  assert.equal(E.solveRetirementAges(c,{startYear:2026}).ages[0],60);
  c.assumptions.desiredMonthlyIncome=10000;assert.equal(E.solveRetirementAges(c,{startYear:2026,maxAge:65}).found,false);
  assert.equal(E.solveRetirementAges(c,{startYear:2026,maxAge:59}).found,false);
});

test('close retirement searches compare calendar years, respect fixed dates and preserve earliest completion',()=>{
  const c=config(60);c.incomes[1].birthYear-=8;c.incomes[1].targetRetireAge=70;
  c.assumptions.targetDeathAge=90;
  const opts={startYear:2026,maxAge:75,maxYearGap:3,preferClose:true};
  const candidates=E.retirementCandidates(c,opts);
  assert.ok(candidates.length);
  candidates.forEach(a=>assert.ok(Math.abs(c.incomes[0].birthYear+a[0]-c.incomes[1].birthYear-a[1])<=3));
  const together=E.solveRetirementAges(c,{...opts,maxYearGap:0});
  assert.equal(together.found,true);assert.equal(together.years[0],together.years[1]);
  assert.notEqual(together.ages[0],together.ages[1]);
  const fixed=E.solveRetirementAges(c,{...opts,fixedPerson:1});
  assert.equal(fixed.found,true);assert.equal(fixed.ages[1],70);
  const latest=a=>Math.max(c.incomes[0].birthYear+a[0],c.incomes[1].birthYear+a[1]);
  candidates.slice(1).forEach((a,i)=>assert.ok(latest(a)>=latest(candidates[i])));
  c.incomes[1].targetRetireAge=55;
  assert.equal(E.solveRetirementAges(c,opts).found,false);
  c.assumptions.householdType='single';assert.equal(E.solveRetirementAges(c,opts).found,true);
});
