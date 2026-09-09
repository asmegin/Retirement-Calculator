'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../public/engine'),P=require('../public/planning-core');
const near=(a,b,t=.02)=>assert.ok(Math.abs(a-b)<t,`${a} differs from ${b}`);
function fixture(single=true){const c=E.defaultConfig();c.incomes.forEach((p,k)=>Object.assign(p,{name:'P'+k,birthYear:1961,salary:0,targetRetireAge:65,cppBaseAt65:0,oasBaseAt65:0,hbpAnnual:0,hbpYears:0,hooppStartAge:null,tfsaRoomOpening:0,rrspRoomOpening:0}));Object.assign(c.assumptions,{householdType:single?'single':'couple',targetDeathAge:70,inflation:0,desiredMonthlyIncome:0,gisEnabled:false,reinvestRefund:false,optimizeContributions:false,reinvestPayoffPayments:false,childcare:{childrenBirthYears:[],items:[]},spendingPhases:[{untilAge:999,factor:100}]});c.accounts=[];c.realEstate=[];c.dbPensions=[];return c;}
const simulate=c=>E.simulate(c,{startYear:2026});
test('category schedules replace flat target and have independent inflation and age windows',()=>{const c=fixture();Object.assign(c.assumptions,{spendingMode:'categories',desiredMonthlyIncome:10000,spendingCategories:[{name:'Travel',amount:1000,frequency:'monthly',startAge:65,endAge:66,inflation:5},{name:'Healthcare',amount:1200,frequency:'yearly',startAge:66,endAge:90,inflation:10}]});c.accounts=[{name:'Savings',owner:'P0',type:'TFSA',balance:300000,growthRate:0}];const r=simulate(c).years;near(r[0].spendTarget,12000);near(r[1].spendTarget,12600+1320);near(r[2].spendTarget,1452);near(r[0].unfunded,0);});
test('irregular vehicle costs recur at their configured interval',()=>{const p=[{birthYear:1961}],items=[{name:'Car',amount:40000,frequency:'yearly',startAge:65,endAge:75,everyYears:5}];near(P.spendingForYear(items,p,2026,2026,0)[0].amount,40000);near(P.spendingForYear(items,p,2027,2026,0)[0].amount,0);near(P.spendingForYear(items,p,2031,2026,0)[0].amount,40000);});
test('CPP historical ceilings, maximum base pension, dropout, enhancements, and history gaps',()=>{const p={birthYear:1961,birthMonth:1,cppStartAge:65,cppStartMonth:2,targetRetireAge:65,cppHistory:[]};for(let year=1979;year<=2026;year++)p.cppHistory.push({year,earnings:P.ympe(year)});let r=P.cppHistory(p,{startYear:2026,inflation:0});near(r.base,r.aympe/12*.25);assert.ok(r.enhanced>0);near(r.second,0);assert.equal(r.missingMonths,0);assert.ok(r.generalDropoutMonths>90);const q=P.cppHistory({...p,cppPlan:'QPP'},{startYear:2026,inflation:0});assert.ok(q.generalDropoutMonths<r.generalDropoutMonths);p.cppHistory=p.cppHistory.filter(r=>r.year!==1990);assert.equal(P.cppHistory(p,{startYear:2026}).missingMonths,12);});
test('child-rearing low-income periods do not reduce base CPP versus ordinary zero earnings',()=>{const p={birthYear:1961,cppStartAge:65,targetRetireAge:65,cppHistory:[]};for(let year=1979;year<=2026;year++)p.cppHistory.push({year,earnings:year>=1983&&year<=1995?0:P.ympe(year)});const no=P.cppHistory(p,{startYear:2026,inflation:0});p.cppHistory.forEach(r=>{if(r.year>=1983&&r.year<=1995)r.caregiver=true;});const yes=P.cppHistory(p,{startYear:2026,inflation:0});assert.ok(yes.base>no.base);assert.ok(yes.caregiverDropoutMonths>0);});
test('second enhanced CPP is earned only on earnings above YMPE from 2024',()=>{const p={birthYear:1961,cppStartAge:65,targetRetireAge:65,cppHistory:[{year:2023,earnings:100000},{year:2024,earnings:73200},{year:2025,earnings:81200}]};assert.ok(P.cppHistory(p,{startYear:2026,inflation:0}).second>0);p.cppHistory=p.cppHistory.filter(r=>r.year<2024);near(P.cppHistory(p,{startYear:2026,inflation:0}).second,0);});
test('CSV import validates periods, accepts annual and monthly records, rejects duplicates',()=>{const r=P.parseEarningsCSV('year,month,earnings,caregiver\n2020,,50000,true\n2021,1,4000,false');assert.equal(r.length,2);assert.equal(r[0].caregiver,true);assert.throws(()=>P.parseEarningsCSV('year,earnings\n2020,10\n2020,20'),/Duplicate/);assert.throws(()=>P.parseEarningsCSV('year,month,earnings\n2020,13,10'),/Invalid/);});
test('spousal rollover defers RRSP tax, survivor continues, final death includes full remaining RRIF',()=>{const c=fixture(false);c.assumptions.estate={enabled:true,spousalRollover:true,probateOverride:0};c.incomes[0].deathAge=65;c.incomes[1].deathAge=67;c.accounts=[{name:'RRSP',owner:'P0',type:'RRSP',balance:1000000,growthRate:0}];const r=simulate(c);assert.equal(r.years.length,3);near(r.years[0].terminalTax,0);assert.equal(r.estateEvents[0].rollover,true);near(r.estateEvents[1].terminalIncome,1000000);assert.ok(r.years[2].terminalTax>300000);near(r.finalNetWorth,1000000-r.years[2].terminalTax);});
test('terminal property gain and historic CCA, registered inclusion, and probate reduce estate',()=>{const c=fixture();c.assumptions.estate={enabled:true,spousalRollover:false,probateOverride:1000};c.incomes[0].deathAge=65;c.accounts=[{name:'RRSP',owner:'P0',type:'RRSP',balance:100000,growthRate:0}];c.realEstate=[{name:'Rental',type:'rental',value:750000,appreciation:0,acb:500000,buildingAcb:500000,uccPool:420000,ccaEnabled:false}];const r=simulate(c);near(r.estateEvents[0].terminalIncome,305000);near(r.years[0].probateFees,1000);near(r.finalNetWorth,850000-r.years[0].terminalTax-1000);});
test('probate follows provincial boundaries and flags unsupported provinces',()=>{near(P.probate(50000,'ON'),0);near(P.probate(50001,'ON'),15);near(P.probate(1000000,'ON'),14250);near(P.probate(100000,'BC'),1050);near(P.probate(300000,'AB'),525);near(P.probate(1000000,'QC'),0);assert.equal(P.probate(100000,'NS'),null);near(P.probate(100000,'NS',{probateOverride:900}),900);});
test('CDA is tax-free, eligible distributions are constrained by GRIP, RDTOH refunds are bounded',()=>{const r=P.corporateDistribution(100000,{cda:30000,grip:20000,dividendType:'eligible',erdtoh:10000,nrdtoh:5000});near(r.capital,30000);near(r.eligible,20000);near(r.nonEligible,50000);near(r.taxable,20000*1.38+50000*1.15);near(r.refund,15000);});
test('passive income reduces federal $500,000 business limit, not a $50,000 business limit',()=>{near(P.smallBusinessLimit(50000),500000);near(P.smallBusinessLimit(100000),250000);near(P.smallBusinessLimit(150000),0);});
test('integrated corporate withdrawals draw CDA without taxing it or duplicating spendable cash',()=>{const c=fixture();c.assumptions.desiredMonthlyIncome=2000;c.accounts=[{name:'Holdco',owner:'P0',type:'CORP',balance:100000,growthRate:0,integratedCorporate:true,cdaOpening:40000,gripOpening:0,useCDA:true}];const r=simulate(c).years[0];near(r.taxableIncome[0],0);near(r.netCash,24000,1);assert.ok(r.accounts.find(a=>a.name==='Holdco').cda<17000);});
test('mortgage prepayment reduces principal and is charged to household cash',()=>{const c=fixture();c.accounts=[{name:'Savings',owner:'P0',type:'TFSA',balance:100000,growthRate:0}];c.realEstate=[{name:'Home',type:'principal',value:300000,mortgage:100000,interestRate:4,paymentMonthly:1000,extraPaymentAnnual:10000,extraPaymentStart:2026,extraPaymentEnd:2026}];const r=simulate(c).years[0];near(r.extraDebtPayments,10000);near(r.spendTarget,10000);assert.ok(r.discretionaryDraw>=10000);const schedule=E.buildSchedule(E.normalizeConfig(c).realEstate[0],2026,2036);near(schedule.byYear[2027].extraPayment,0);});
test('Smith borrowing creates equal investment assets and debt, and interest starts on opening balance',()=>{const c=fixture();c.realEstate=[{name:'Home',type:'principal',value:300000,mortgage:100000,interestRate:0,paymentMonthly:1000,payoffYear:2035,smithEnabled:true,smithRate:6,smithLimit:20000,smithGrowthRate:0,smithOwner:'P0'}];const r=simulate(c).years;near(r[0].smithDebt,r[0].smithAdvance);near(r[0].smithInterest,0);near(r[1].smithInterest,r[0].smithDebt*.06);assert.ok(r[2].smithDebt<=20000);});
test('replacement home is not free: purchase consumes sale proceeds and preserves only the difference',()=>{const c=fixture();c.incomes[0].deathAge=65;c.assumptions.targetDeathAge=65;c.accounts=[{name:'TFSA',owner:'P0',type:'TFSA',balance:0,growthRate:0}];c.realEstate=[{name:'Home',type:'principal',value:1000000,appreciation:0,saleYear:2026,sellingCostPct:0},{name:'Smaller home',type:'principal',value:500000,appreciation:0,purchaseYear:2026}];const r=simulate(c).years[0];near(r.spendTarget,500000);near(r.principalEquity,500000);near(r.netWorth,1000000);near(r.portfolio,500000);});
test('bounded withdrawal optimization does not mutate inputs or worsen a funded baseline',()=>{const c=fixture();c.assumptions.desiredMonthlyIncome=3000;c.accounts=[{name:'RRSP',owner:'P0',type:'RRSP',balance:500000,growthRate:0},{name:'TFSA',owner:'P0',type:'TFSA',balance:100000,growthRate:0}];const before=JSON.stringify(c),r=E.optimizeWithdrawals(c,{startYear:2026,maxEvaluations:50});assert.equal(JSON.stringify(c),before);assert.equal(r.globalOptimum,false);assert.ok(r.evaluated<=50);assert.equal(r.result.depletedYear,null);assert.ok(r.taxSavings>=-1);});

test('2026 payroll uses published CPP/QPP rates, YMPE and second ceiling',()=>{
  near(E.payrollCPP(100000,50,1,'ON',2026,0).total,4646.45);
  near(E.payrollCPP(100000,50,1,'QC',2026,0).total,4895.3);
  near(E.payrollCPP(100000,73,1,'QC',2026,0).total,0);
});
test('RRSP goal completion scales actual deposits, deductions and refunds while preserving the full target',()=>{
  const c=fixture();Object.assign(c.incomes[0],{birthYear:1976,salary:140000,rrspRoomOpening:100000,targetRetireAge:65});
  Object.assign(c.assumptions,{optimizeContributions:true,reinvestRefund:true,rrspMinMarginalRate:35,rrspGoalCompletion:100});
  c.accounts=[{name:'RRSP goal',owner:'P0',type:'RRSP',balance:0,growthRate:0,solveToTarget:true}];
  const full=simulate(c).years[0];c.assumptions.rrspGoalCompletion=85;const partial=simulate(c).years[0];
  assert.ok(full.rrspTarget[0]>0);near(partial.rrspTarget[0],full.rrspTarget[0]);
  near(partial.accounts.find(a=>a.name==='RRSP goal').contrib,full.rrspTarget[0]*.85);
  near(partial.person[0].deductible,full.person[0].deductible*.85);assert.ok(partial.refund<full.refund);
  c.accounts.push({...c.accounts[0],name:'Second RRSP goal'});near(simulate(c).years[0].person[0].deductible,partial.person[0].deductible);
  c.assumptions.rrspGoalCompletion=0;near(simulate(c).years[0].person[0].deductible,0);
});
test('CSV rejects overlapping annual and monthly data and invalid ceilings',()=>{
  assert.throws(()=>P.parseEarningsCSV('year,month,earnings\n2020,,12000\n2020,1,1000'),/overlapping/);
  assert.throws(()=>P.parseEarningsCSV('year,earnings,ympe\n2020,12000,-1'),/Invalid/);
  assert.throws(()=>P.parseEarningsCSV(''),/CSV needs/);
});
test('same-year deaths tax both ownership shares of rental gains and recapture',()=>{
  const c=fixture(false);c.assumptions.estate={enabled:true,spousalRollover:true,probateOverride:0};
  c.incomes.forEach(p=>p.deathAge=65);
  c.realEstate=[{name:'Rental',type:'rental',value:750000,appreciation:0,acb:500000,buildingAcb:500000,uccPool:420000,ccaEnabled:false,ownerSplit:50}];
  const r=simulate(c);near(r.estateEvents.reduce((s,e)=>s+e.terminalIncome,0),205000);
  near(r.years[0].taxableIncome[0],102500);near(r.years[0].taxableIncome[1],102500);
  near(r.years[0].person.reduce((s,p)=>s+p.tax+p.clawback,0),r.years[0].totalTax);
});
test('survivor income follows the correct person after either spouse dies',()=>{
  for(const deceased of [0,1]){
    const c=fixture(false);c.assumptions.estate={enabled:true,spousalRollover:true,probateOverride:0};
    c.incomes.forEach((p,k)=>Object.assign(p,{deathAge:k===deceased?65:67,cppBaseAt65:1000,oasBaseAt65:700}));
    const r=simulate(c).years[1];assert.equal(r.person.length,1);assert.equal(r.person[0].name,'P'+(1-deceased));near(r.person[0].cpp,12000);near(r.person[0].oas,8400);
  }
});
test('operating corporation pays remuneration from profit or existing assets and applies GRIP/refunds',()=>{
  const c=fixture();c.incomes[0].birthYear=1976;c.incomes[0].targetRetireAge=65;
  Object.assign(c.incomes[0],{salary:60000,eligibleDividends:10000,nonEligibleDividends:10000});
  c.accounts=[{name:'Business',owner:'P0',type:'CORP',balance:100000,growthRate:0,integratedCorporate:true,businessIncome:100000,businessSmallRate:12.2,gripOpening:5000,nrdtohOpening:1000}];
  const r=simulate(c).years[0],corp=r.accounts.find(a=>a.name==='Business');
  const profit=100000-60000-r.person[0].payrollCPP;
  near(corp.operatingTax,profit*.122);near(corp.contrib,profit-profit*.122-20000);
  near(r.person[0].eligibleDividends,5000);near(r.person[0].nonEligibleDividends,15000);near(corp.grip,0);near(corp.corporateRefund,1000);
  near(r.corporateInvestmentTax,-1000);
  c.accounts[0].businessIncome=1000;c.accounts[0].balance=0;
  assert.ok(simulate(c).years[0].unfunded>79000);
  c.accounts.push({...c.accounts[0],name:'Duplicate business'});assert.throws(()=>simulate(c),/one operating/);
});
test('Smith investment portfolio does not replace an existing taxable account return assumption',()=>{
  const c=fixture();c.accounts=[{name:'Existing savings',owner:'P0',type:'TAXABLE',balance:100000,growthRate:10}];
  c.realEstate=[{name:'Home',type:'principal',value:300000,mortgage:100000,interestRate:0,paymentMonthly:1000,smithEnabled:true,smithLimit:20000,smithGrowthRate:0,smithOwner:'P0'}];
  const r=simulate(c).years[0];near(r.accounts.find(a=>a.name==='Existing savings').growth,10000);assert.ok(r.accounts.filter(a=>a.type==='TAXABLE').length>=2);
});

test('start-of-year sale repays opening mortgage without free principal or rental cash',()=>{
  const c=fixture();c.realEstate=[{name:'Rental',type:'rental',value:500000,appreciation:0,acb:500000,buildingAcb:500000,uccPool:500000,mortgage:200000,interestRate:5,paymentMonthly:2000,saleYear:2026,sellingCostPct:0,grossRentMonthly:3000}];
  c.accounts=[{name:'Savings',owner:'P0',type:'TAXABLE',balance:0,growthRate:0}];
  const r=simulate(c).years[0];near(r.saleEvents[0].mortgageDischarged,200000);near(r.saleProceeds,300000);near(r.rentCash,0);near(r.netWorth,300000);
});
test('underwater rental sale charges the cash deficit instead of erasing debt',()=>{
  const c=fixture();c.accounts=[{name:'Cash',owner:'P0',type:'TFSA',balance:100000,growthRate:0}];
  c.realEstate=[{name:'Rental',type:'rental',value:200000,appreciation:0,acb:200000,mortgage:250000,interestRate:5,paymentMonthly:2000,saleYear:2026,sellingCostPct:0}];
  const r=simulate(c).years[0];near(r.saleProceeds,-50000);near(r.portfolio,50000,1);near(r.netWorth,50000,1);near(r.unfunded,0);
});
test('optimizer compares against and preserves an existing annual withdrawal schedule',()=>{
  const c=fixture();c.assumptions.desiredMonthlyIncome=2000;c.assumptions.withdrawalPlan={2026:[30000,0],2027:[40000,0]};
  c.accounts=[{name:'RRSP',owner:'P0',type:'RRSP',balance:400000,growthRate:0},{name:'TFSA',owner:'P0',type:'TFSA',balance:100000,growthRate:0}];
  const original=JSON.stringify(c),baseline=simulate(c),r=E.optimizeWithdrawals(c,{startYear:2026,maxEvaluations:0});
  near(r.baseline.lifetimeTax,baseline.lifetimeTax);assert.deepEqual(r.withdrawalPlan,c.assumptions.withdrawalPlan);near(r.taxSavings,0);assert.equal(JSON.stringify(c),original);
});
test('withdrawal comparison covers all orders, retains baseline schedule, and reports reproducible spending',()=>{
  const c=fixture();c.assumptions.desiredMonthlyIncome=2000;c.assumptions.withdrawalPlan={2026:[30000,0]};
  c.accounts=[{name:'RRSP',owner:'P0',type:'RRSP',balance:400000,growthRate:0},{name:'TFSA',owner:'P0',type:'TFSA',balance:100000,growthRate:0}];
  const original=JSON.stringify(c),r=E.compareWithdrawalOrders(c,{startYear:2026});assert.equal(r.rows.length,6);near(r.rows[0].tax,simulate(c).lifetimeTax);assert.deepEqual(r.rows[0].plan,c.assumptions.withdrawalPlan);
  assert.ok(r.bestSpending.monthlySpend>=r.rows[0].monthlySpend);assert.ok(r.bestTax.funded);assert.ok(r.bestEstate.funded);
  const candidate=structuredClone(c);candidate.assumptions.withdrawalPlan=r.bestSpending.plan;candidate.assumptions.withdrawalStrategy=r.bestSpending.strategy;candidate.assumptions.desiredMonthlyIncome=r.bestSpending.monthlySpend;
  assert.equal(simulate(candidate).depletedYear,null);assert.equal(JSON.stringify(c),original);
});
test('rental sale comparison tests every year, CCA alternatives and holding with terminal tax',()=>{
  const c=fixture();c.accounts=[{name:'Cash',owner:'P0',type:'TFSA',balance:100000,growthRate:0}];
  c.realEstate=[{name:'Rental',type:'rental',value:750000,appreciation:0,acb:500000,buildingAcb:500000,uccPool:420000,ccaEnabled:true,grossRentMonthly:2000,sellingCostPct:0}];
  const original=JSON.stringify(c),r=E.compareRentalSales(c,{startYear:2026,propertyIndex:0,compareCCA:true});
  assert.equal(r.rows.length,15);assert.equal(r.includesTerminalTax,true);assert.ok(r.rows[0].tax>0);assert.equal(r.bestTax.funded,true);
  const now=r.rows.find(x=>x.label==='Sell 2026');near(now.sale.ccaRecapture,80000);near(now.sale.taxableGain,125000);assert.ok(now.saleIncomeTax>0);
  const later=r.rows.find(x=>x.label==='Sell 2027'),noCCA=r.rows.find(x=>x.label==='Sell 2027; no future CCA');assert.ok(later.sale.ccaRecapture>noCCA.sale.ccaRecapture);near(noCCA.sale.ccaRecapture,80000);
  assert.equal(JSON.stringify(c),original);assert.equal(c.assumptions.estate,undefined);
});
test('rental comparison respects per-property selection and rejects invalid tax inputs',()=>{
  const c=fixture();c.realEstate=[{name:'Home',type:'principal',value:100000},{name:'Rental',type:'rental',value:200000,acb:100000,buildingAcb:80000,uccPool:70000}];
  assert.throws(()=>E.compareRentalSales(c,{propertyIndex:0,startYear:2026}),/rental property/);
  const r=E.compareRentalSales(c,{propertyIndex:1,startYear:2026});assert.equal(r.propertyIndex,1);assert.equal(r.propertyName,'Rental');
  // A rejected cost basis has to name the property, the fields and the amounts that clash.
  const rejection=()=>{try{E.compareRentalSales(c,{propertyIndex:1,startYear:2026});}catch(error){return error;}throw new Error('Expected the comparison to reject this property.');};
  c.realEstate[1].uccPool=90000;
  const ucc=rejection();
  assert.match(ucc.message,/^Rental: .*\$90,000.*\$80,000/);
  assert.match(ucc.message,/Configuration › Properties page, under Advanced options/);
  assert.equal(ucc.fix,'properties');
  c.realEstate[1].uccPool=70000;c.realEstate[1].buildingAcb=120000;
  assert.match(rejection().message,/^Rental: .*\$120,000.*\$100,000/);
  c.realEstate[1].buildingAcb=80000;c.realEstate[1].acb=0;
  assert.match(rejection().message,/^Rental: .*ACB \(price \+ improvements\).*\$0/);
  c.realEstate[1].acb=100000;c.realEstate[1].saleYear=2020;
  assert.match(rejection().message,/^Rental: the sale year is set to 2020, which is before 2026/);
  assert.equal(rejection().fix,'properties');
  c.realEstate[1].saleYear=0;c.realEstate[1].buildingAcb=80000.25;c.realEstate[1].uccPool=80000.50;
  assert.match(rejection().message,/\$80,000\.5.*\$80,000\.25/);
});

test('rental spending ranks spendable cash rather than unsold equity and compares capacity, not the goal',()=>{
  const c=fixture();c.assumptions.desiredMonthlyIncome=6000;
  c.accounts=[{name:'Cash',owner:'P0',type:'TFSA',balance:72000,growthRate:0}];
  c.realEstate=[{name:'Rental',type:'rental',value:300000,appreciation:0,acb:300000,buildingAcb:240000,buildingSalePercent:80,uccPool:240000,sellingCostPct:0,grossRentMonthly:0}];
  const original=JSON.stringify(c),r=E.compareRentalSales(c,{propertyIndex:0,startYear:2026});
  near(r.rows[0].monthlySpend,1000,2);
  assert.equal(r.bestSpending.year,2026);
  near(r.bestSpending.monthlySpend,372000/72,2);
  assert.equal(r.bestSpending.spendingChange,r.bestSpending.monthlySpend-r.rows[0].monthlySpend);
  assert.equal(r.bestSpending.funded,false); // Useful even when the entered goal is too high.
  for(const row of r.rows){
    const candidate=structuredClone(c);candidate.realEstate[0].saleYear=row.year;candidate.realEstate[0].ccaEnabled=row.cca;
    candidate.assumptions.desiredMonthlyIncome=row.monthlySpend;
    assert.ok(simulate(candidate).years.every(y=>y.unfunded<=1),row.label);
  }
  assert.equal(JSON.stringify(c),original);
});

test('rental spending preserves actual lifespan settings and clears only alternative withdrawal schedules',()=>{
  const c=fixture();c.incomes[0].deathAge=66;c.assumptions.estate={enabled:false};
  c.assumptions.withdrawalPlan={2026:[30000,0]};
  c.accounts=[{name:'RRSP',owner:'P0',type:'RRSP',balance:300000,growthRate:0}];
  c.realEstate=[{name:'Rental',type:'rental',value:200000,acb:200000,buildingAcb:160000,buildingSalePercent:80,uccPool:140000,ccaEnabled:true,grossRentMonthly:1000}];
  const r=E.compareRentalSales(c,{propertyIndex:0,startYear:2026,compareCCA:true});
  assert.equal(r.endYear,2031);
  assert.equal(r.rows[0].monthlySpend,Math.floor(E.maxSustainableSpend(c,{startYear:2026,fastSolve:false})));
  const candidate=structuredClone(c),row=r.bestSpending;
  if(row!==r.rows[0])delete candidate.assumptions.withdrawalPlan;
  Object.assign(candidate.realEstate[0],{saleYear:row.year,ccaEnabled:row.cca});
  candidate.assumptions.desiredMonthlyIncome=row.monthlySpend;
  assert.ok(simulate(candidate).years.every(y=>y.unfunded<=1));
  assert.equal(candidate.assumptions.estate.enabled,false);
});

test('rental spending handles category scaling and exposes the search ceiling',()=>{
  const c=fixture();c.assumptions.spendingMode='categories';
  c.assumptions.spendingCategories=[{name:'Living',amount:1000,frequency:'monthly',startAge:65,endAge:999,inflation:0}];
  c.accounts=[{name:'Cash',owner:'P0',type:'TFSA',balance:72000,growthRate:0}];
  c.realEstate=[{name:'Rental',type:'rental',value:120000,appreciation:0,acb:120000,buildingAcb:120000,uccPool:120000,sellingCostPct:0}];
  const r=E.compareRentalSales(c,{propertyIndex:0,startYear:2026}),row=r.bestSpending;
  near(row.monthlySpend,192000/72,2);
  c.realEstate[0].saleYear=row.year;
  assert.ok(E.simulate(c,{startYear:2026,spendingScale:row.monthlySpend/1000}).years.every(y=>y.unfunded<=1));
  c.accounts[0].balance=100000000;
  assert.equal(E.compareRentalSales(c,{propertyIndex:0,startYear:2026}).rows[0].spendingAtLimit,true);
  c.assumptions.spendingCategories=[];
  assert.throws(()=>E.compareRentalSales(c,{propertyIndex:0,startYear:2026}),/positive spending category/);
});
test('selling rental enables earlier retirement and returned sale settings reproduce funding',()=>{
  const c=fixture();c.incomes[0].targetRetireAge=67;c.assumptions.desiredMonthlyIncome=2000;
  c.realEstate=[{name:'Rental',type:'rental',value:500000,appreciation:0,acb:500000,uccPool:500000,sellingCostPct:0}];
  const original=JSON.stringify(c),hold=E.solveRetirementAges(c,{startYear:2026}),sell=E.solveRetirementAges(c,{startYear:2026,sellRentals:true});
  assert.equal(hold.found,false);assert.equal(sell.found,true);assert.equal(sell.ages[0],65);assert.equal(sell.rentalSales[0].year,2026);assert.equal(JSON.stringify(c),original);
  c.incomes[0].targetRetireAge=sell.ages[0];sell.rentalSales.forEach(s=>c.realEstate[s.index].saleYear=s.year);
  assert.ok(simulate(c).years.every(y=>y.unfunded<=1));
});
test('terminal rental loss reduces final-year income tax and increases net estate',()=>{
  const c=fixture();c.incomes[0].deathAge=65;c.assumptions.estate={enabled:true,spousalRollover:false,probateOverride:0};
  c.incomes[0].cppBaseAt65=5000;c.realEstate=[{name:'Rental',type:'rental',value:350000,appreciation:0,acb:500000,buildingAcb:500000,uccPool:420000,ccaEnabled:false}];
  c.assumptions.reinvestSurplus=false;
  const r=simulate(c);near(r.estateEvents[0].terminalIncome,-70000);assert.ok(r.years[0].terminalTax<0);near(r.lifetimeTax,0);
});

test('zero-interest loan honours the entered monthly payment',()=>{
  const s=E.buildSchedule({mortgage:100000,interestRate:0,paymentMonthly:1000},2026,2050);
  near(s.byYear[2026].principal,12000);near(s.byYear[2026].endBalance,88000);near(s.byYear[2026].interest,0);assert.equal(s.actualPayoffYear,2034);
});
test('start-of-year property sale skips extra payments and new Smith advances',()=>{
  const c=fixture();c.realEstate=[{name:'Home',type:'principal',value:500000,appreciation:0,mortgage:200000,paymentMonthly:2000,interestRate:5,saleYear:2026,sellingCostPct:0,extraPaymentAnnual:20000,smithEnabled:true}];
  const r=simulate(c).years[0];near(r.extraDebtPayments,0);near(r.smithAdvance,0);near(r.saleEvents[0].mortgageDischarged,200000);near(r.saleProceeds,300000);
});
test('rental alternatives reproduce the cleared schedule that will be applied',()=>{
  const c=fixture();c.assumptions.withdrawalPlan={2026:[200000,0]};c.accounts=[{name:'RRSP',owner:'P0',type:'RRSP',balance:300000,growthRate:0}];
  c.realEstate=[{name:'Rental',type:'rental',value:500000,acb:300000,buildingAcb:300000,uccPool:250000}];
  const result=E.compareRentalSales(c,{propertyIndex:0,startYear:2026}),sale=result.rows[2];
  const candidate=E.normalizeConfig(c);candidate.assumptions.estate.enabled=true;delete candidate.assumptions.withdrawalPlan;candidate.realEstate[0].saleYear=sale.year;
  near(sale.tax,simulate(candidate).lifetimeTax);near(sale.estate,simulate(candidate).finalNetWorthReal);
});

test('joint multi-property sale search finds at least as good a spend as optimizing either property alone',()=>{
  const c=fixture();c.accounts=[{name:'Cash',owner:'P0',type:'TFSA',balance:50000,growthRate:0}];
  c.realEstate=[
    {name:'Rental A',type:'rental',value:400000,appreciation:0,acb:300000,buildingAcb:300000,uccPool:250000,grossRentMonthly:1500,sellingCostPct:0},
    {name:'Rental B',type:'rental',value:300000,appreciation:0,acb:250000,buildingAcb:250000,uccPool:200000,grossRentMonthly:1200,sellingCostPct:0}
  ];
  const original=JSON.stringify(c);
  const joint=E.compareRentalSales(c,{startYear:2026,propertyIndices:[0,1]});
  const soloA=E.compareRentalSales(c,{startYear:2026,propertyIndex:0}).bestSpending.monthlySpend;
  const soloB=E.compareRentalSales(c,{startYear:2026,propertyIndex:1}).bestSpending.monthlySpend;
  assert.ok(joint.bestSpending.monthlySpend>=Math.max(soloA,soloB)-1,`${joint.bestSpending.monthlySpend} vs ${soloA}/${soloB}`);
  assert.deepEqual(joint.propertyIndices,[0,1]);assert.deepEqual(joint.propertyNames,['Rental A','Rental B']);
  joint.rows.forEach(row=>assert.equal(row.sales.length,2));
  assert.equal(JSON.stringify(c),original);
});
test('wealth-at-max-spend is attached only to the keep and best-spending rows',()=>{
  const c=fixture();c.accounts=[{name:'Cash',owner:'P0',type:'TFSA',balance:50000,growthRate:0}];
  c.realEstate=[
    {name:'Rental A',type:'rental',value:400000,appreciation:0,acb:300000,buildingAcb:300000,uccPool:250000,grossRentMonthly:1500,sellingCostPct:0},
    {name:'Rental B',type:'rental',value:300000,appreciation:0,acb:250000,buildingAcb:250000,uccPool:200000,grossRentMonthly:1200,sellingCostPct:0}
  ];
  const joint=E.compareRentalSales(c,{startYear:2026,propertyIndices:[0,1]});
  assert.ok(joint.keepRow.wealthAtMaxSpend);assert.ok(Number.isFinite(joint.keepRow.wealthAtMaxSpend.tax));
  assert.ok(joint.bestSpending.wealthAtMaxSpend);
  const untouched=joint.rows.filter(r=>r!==joint.keepRow&&r!==joint.bestSpending);
  assert.ok(untouched.length>0);untouched.forEach(row=>assert.equal(row.wealthAtMaxSpend,undefined));
  const single=E.compareRentalSales(c,{startYear:2026,propertyIndex:0});
  assert.ok(single.keepRow.wealthAtMaxSpend);assert.equal(single.keepRow.label,'Keep through plan');
});
test('propertyIndices requires every selected property to be a rental',()=>{
  const c=fixture();c.realEstate=[{name:'Home',type:'principal',value:100000},{name:'Rental',type:'rental',value:200000,acb:100000,buildingAcb:80000,uccPool:70000}];
  assert.throws(()=>E.compareRentalSales(c,{propertyIndices:[0,1],startYear:2026}),/rental property/);
  assert.throws(()=>E.compareRentalSales(c,{propertyIndices:[1,1],startYear:2026}),/only once/);
});

test('joint search enforces a total budget and explores CCA in coordinate descent',()=>{
  const c=fixture();c.assumptions.targetDeathAge=66;
  c.accounts=[{name:'Cash',owner:'P0',type:'TFSA',balance:100000,growthRate:0}];
  c.realEstate=Array.from({length:5},(_,i)=>({name:'Rental '+i,type:'rental',value:100000,acb:100000,buildingAcb:100000,uccPool:80000,ccaEnabled:true,grossRentMonthly:1000}));
  const progress=[],r=E.compareRentalSales(c,{propertyIndices:[0,1,2,3,4],startYear:2026,compareCCA:true,maxEvaluations:8,onProgress:p=>progress.push(p)});
  assert.ok(r.rows.length<=8);assert.equal(r.searchMethod,'coordinate descent');assert.equal(r.budgetReached,true);
  assert.ok(progress.every(p=>p.evaluated<=p.maxEvaluations));
  assert.ok(r.rows.some(row=>row.sales.some(s=>!s.cca)));
  assert.notEqual(r.keepRow,r.rows[0]);assert.equal(r.keepRow.isCurrent,false);
});

test('maximum-spending wealth uses identical lifespan, CCA and withdrawal settings to the spending estimate',()=>{
  const c=fixture();c.assumptions.estate={enabled:false};c.incomes[0].deathAge=66;
  c.assumptions.withdrawalPlan={2026:[180000,0]};
  c.accounts=[{name:'RRSP',owner:'P0',type:'RRSP',balance:300000,growthRate:0}];
  c.realEstate=[{name:'Rental',type:'rental',value:200000,acb:160000,buildingAcb:160000,uccPool:120000,ccaEnabled:true,grossRentMonthly:1000}];
  const r=E.compareRentalSales(c,{propertyIndex:0,startYear:2026,compareCCA:true});
  for(const row of [r.keepRow,r.bestSpending]){
    const candidate=structuredClone(c);
    row.sales.forEach(s=>Object.assign(candidate.realEstate[s.index],{saleYear:s.year,ccaEnabled:s.cca}));
    if(!row.isCurrent)delete candidate.assumptions.withdrawalPlan;
    candidate.assumptions.desiredMonthlyIncome=row.monthlySpend;
    const expected=simulate(candidate),wealth=row.wealthAtMaxSpend;
    near(wealth.tax,expected.lifetimeTax+expected.lifetimeCorporateTax);near(wealth.estate,expected.finalNetWorthReal);
    assert.equal(wealth.endYear,2031);assert.equal(wealth.funded,true);
  }
});

test('joint sale breakdown identifies properties by index even when their names match',()=>{
  const c=fixture();c.assumptions.targetDeathAge=65;
  c.realEstate=[100000,300000].map(value=>({name:'Rental',type:'rental',value,appreciation:0,acb:value,buildingAcb:value,uccPool:value,sellingCostPct:0}));
  const r=E.compareRentalSales(c,{propertyIndices:[0,1],startYear:2026});
  const sold=r.rows.find(row=>row.sales.every(s=>s.year===2026));
  assert.ok(sold);assert.equal(sold.sales[0].sale.grossPrice,100000);assert.equal(sold.sales[1].sale.grossPrice,300000);
});

test('property normalization honours an explicit type and retains zero or inherited values',()=>{
  const c=fixture();c.realEstate=[{name:'Rental with HELOC',type:'rental',value:100000,acb:80000,uccPool:0,ownerSplit:null,interestRate:0}];
  const p=E.normalizeConfig(c).realEstate[0];
  assert.equal(p.type,'rental');assert.equal(p.uccPool,0);assert.equal(p.ownerSplit,null);assert.equal(p.interestRate,0);
  assert.equal(p.buildingAcb,80000);assert.equal(p.sellingCostPct,5);
});

test('Monte Carlo does not count unfunded contributions before retirement as a successful plan',async()=>{
  const c=fixture();c.incomes[0].birthYear=new Date().getFullYear()-65;c.incomes[0].targetRetireAge=66;
  c.accounts=[{name:'Savings',owner:'P0',type:'TAXABLE',balance:0,growthRate:0,contribAmt:10000,contribFreq:'yearly'}];c.assumptions.mcVolatility=0;
  const baseline=E.simulate(c);assert.equal(baseline.depletedYear,null);assert.ok(baseline.years[0].unfunded>1);
  near(E.monteCarloSync(c,3,1),0);
  const result=await new Promise(resolve=>E.monteCarloRun(c,3,1,null,resolve));near(result.successRate,0);assert.ok(result.results.every(r=>r.funded===false));
});
