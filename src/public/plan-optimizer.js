(function(root){
  'use strict';
  const E=typeof module==='object'?require('./engine'):root.RetireEngine;
  const copy=v=>JSON.parse(JSON.stringify(v));
  function retirementSpending(config,options){
    const original=E.normalizeConfig(config),start=options.startYear||new Date().getFullYear();
    const people=original.incomes.slice(0,original.assumptions.householdType==='single'?1:2);
    const deathAge=original.assumptions.estate.enabled?(people[0].deathAge??original.assumptions.targetDeathAge):original.assumptions.targetDeathAge;
    const ages=[];for(let age=50;age<=deathAge;age+=5)ages.push(age);
    if(deathAge>=50&&!ages.includes(deathAge))ages.push(deathAge);
    const rows=[];
    ages.forEach((age,index)=>{
      const year=people[0].birthYear+age,pair=people.map(p=>year-p.birthYear);
      const row={year,ages:pair,label:people.map((p,k)=>p.name+' '+pair[k]).join(' / ')};
      if(year<start)row.unavailable='This retirement year is in the past.';
      else if(pair.some(a=>a<18))row.unavailable='A household member would be under 18.';
      else if(pair.some(a=>a>120))row.unavailable='Outside the supported retirement-age range.';
      else if(original.assumptions.estate.enabled&&people.some((p,k)=>pair[k]>(p.deathAge??original.assumptions.targetDeathAge)))row.unavailable='After a household member’s planning lifespan.';
      else{
        const candidate=copy(original);delete candidate.assumptions.withdrawalPlan;
        people.forEach((p,k)=>candidate.incomes[k].targetRetireAge=pair[k]);
        const result=optimize(candidate,{...options,objective:'spending',onProgress:progress=>options.onProgress?.({...progress,phase:row.label+' — '+progress.phase,option:index+1,options:ages.length})});
        Object.assign(row,{config:result.config,monthlySpend:result.monthlySpend,result:result.result,evaluated:result.evaluated});
      }
      rows.push(row);options.onProgress?.({phase:'Retirement options',evaluated:index+1,maxEvaluations:ages.length});
    });
    return {objective:'retirement-spending',rows};
  }
  function optimize(config,options={}){
    const original=E.normalizeConfig(config),start=options.startYear||new Date().getFullYear();
    const objective=options.objective||'spending';
    if(objective==='retirement-spending')return retirementSpending(config,options);
    if(!['spending','estate','tax'].includes(objective))throw new Error('Choose a supported optimization goal.');
    const funded=r=>r.years.length>0&&r.years.every(y=>y.unfunded<=1);
    const baseline=E.simulate(original,{startYear:start}),cap=options.maxEvaluations??(180+(options.sellRentals?original.realEstate.filter(p=>p.type==='rental').length*30:0));
    let evaluated=0,phase='Current plan';const seen=new Map(),candidates=[];
    function evaluate(c,precise=false){
      const r=E.simulate(c,{startYear:start});
      const spend=objective==='spending'?Math.floor(E.maxSustainableSpend(c,{startYear:start,fastSolve:false,spendingTolerance:precise?0:50})):null;
      const valid=objective==='spending'||(!funded(baseline)||funded(r))&&(objective!=='tax'||r.finalNetWorthReal>=baseline.finalNetWorthReal-1);
      const shortfall=r.years.reduce((s,y)=>s+y.unfunded*y.deflator,0);
      const score=objective==='spending'?spend:!valid?-Infinity:(objective==='estate'?r.finalNetWorthReal:-(r.lifetimeTax+r.lifetimeCorporateTax))-shortfall*1e7;
      return {config:copy(c),result:r,score,monthlySpend:spend};
    }
    let best=evaluate(original,true);const initial=best;candidates.push(best);seen.set(JSON.stringify(original),best);
    function tryPlan(c){
      const key=JSON.stringify(c);if(seen.has(key))return;
      if(evaluated>=cap)return;
      const candidate=evaluate(c);evaluated++;seen.set(key,candidate);candidates.push(candidate);
      if(candidate.score>best.score)best=candidate;
      options.onProgress?.({evaluated,maxEvaluations:cap,phase});
    }
    function choices(values,change){const base=copy(best.config);values.forEach(value=>{const c=copy(base);delete c.assumptions.withdrawalPlan;change(c,value);tryPlan(c);});}
    const people=original.incomes.slice(0,original.assumptions.householdType==='single'?1:2);
    const rentals=original.realEstate.map((p,index)=>({p,index})).filter(({p})=>p.type==='rental'&&(!p.saleYear||p.saleYear>=start));
    if(options.sellRentals)rentals.forEach(({p})=>{if(!(p.acb>0&&p.buildingAcb<=p.acb&&p.uccPool<=p.buildingAcb))throw new Error('Check purchase cost, building cost and UCC for '+p.name+' in Configuration > Properties.');});
    for(let pass=0;pass<2&&evaluated<cap;pass++){
      phase='Withdrawal order';choices(['tfsa-first','rrsp-first','taxable-first','min-tax','oas-smart'],(c,v)=>c.assumptions.withdrawalStrategy=v);
      phase='CPP / QPP and OAS timing';
      people.forEach((p,k)=>{
        for(const field of ['cppStartAge','oasStartAge']){
          // Already-started benefits are elections, not available search choices.
          if(p.birthYear+p[field]<start)continue;
          const lo=field==='oasStartAge'?65:60,hi=field==='oasStartAge'?70:p.cppPlan==='QPP'?72:70;
          const ages=[];for(let age=Math.max(lo,start-p.birthYear);age<=hi;age++)ages.push(age);
          choices(ages,(c,v)=>c.incomes[k][field]=v);
        }
      });
      phase='RRSP / TFSA contribution allocation';
      choices([false,true],(c,v)=>{c.accounts.forEach(a=>{if(['RRSP','TFSA'].includes(a.type)&&!a.solveToTarget)a.flexible=v;});c.assumptions.optimizeContributions=true;});
      choices([false,true],(c,v)=>c.assumptions.optimizeContributions=v);
      choices([0,20,30,35,40,99],(c,v)=>{c.assumptions.optimizeContributions=true;c.assumptions.rrspMinMarginalRate=v;});
      if(options.sellRentals){
        phase='Rental sale years and future CCA';
        rentals.forEach(({p,index})=>{
          const lo=Math.max(start,p.purchaseYear||start),end=baseline.endYear,center=best.config.realEstate[index].saleYear||lo;
          const years=new Set([0,p.saleYear,end]);
          if(pass===0){for(let y=lo;y<=end;y+=10)years.add(y);people.forEach(person=>years.add(person.birthYear+person.targetRetireAge));}
          else for(let y=center-5;y<=center+5;y++)years.add(y);
          choices([...years].filter(y=>y===0||y>=lo&&y<=end),(c,v)=>c.realEstate[index].saleYear=v);
          choices([false,true],(c,v)=>c.realEstate[index].ccaEnabled=v);
        });
      }
    }
    phase='Verifying combined plans';
    candidates.sort((a,b)=>b.score-a.score).slice(0,6).forEach(candidate=>{const checked=evaluate(candidate.config,true);if(checked.score>initial.score&&checked.score> (best.verifiedScore??-Infinity)){best=checked;best.verifiedScore=checked.score;}});
    if(best.verifiedScore==null)best=initial;
    phase='Annual withdrawal schedule';options.onProgress?.({evaluated,maxEvaluations:cap,phase});
    const schedule=E.optimizeWithdrawals(best.config,{startYear:start,objective:objective==='tax'?'tax':'estate',maxEvaluations:80});
    const scheduled=copy(best.config);scheduled.assumptions.withdrawalStrategy=schedule.withdrawalStrategy;scheduled.assumptions.withdrawalPlan=schedule.withdrawalPlan;
    const verified=evaluate(scheduled,true);if(verified.score>best.score)best=verified;
    const applied=copy(best.config);
    if(objective==='spending'){
      if(applied.assumptions.spendingMode==='categories'){
        const monthly=E.Planning.spendingBaseline(applied.assumptions.spendingCategories)/12;
        if(monthly<=0)throw new Error('Add a positive spending category before optimizing monthly spending.');
        applied.assumptions.spendingCategories.forEach(item=>item.amount*=best.monthlySpend/monthly);
      }
      applied.assumptions.desiredMonthlyIncome=best.monthlySpend;
    }
    const appliedResult=E.simulate(applied,{startYear:start});
    return {objective,config:applied,baseline,result:appliedResult,monthlySpend:best.monthlySpend,baselineSpend:initial.monthlySpend,evaluated,improved:best.score>initial.score,globalOptimum:false,sellRentals:!!options.sellRentals};
  }
  if(typeof module==='object')module.exports=optimize;else root.optimizeRetirementPlan=optimize;
})(typeof self==='undefined'?globalThis:self);
