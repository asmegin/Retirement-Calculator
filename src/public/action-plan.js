(function(){
  'use strict';
  const E=RetireEngine,$=id=>document.getElementById(id);
  const money=v=>Number(v||0).toLocaleString('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0});
  const buttons=[...document.querySelectorAll('[data-action]')];
  let config=null,worker=null,generation=0,proposal=null,source=null,applying=false,orderComparison=null;
  const key=c=>JSON.stringify(E.normalizeConfig(c));
  const people=c=>c.incomes.slice(0,c.assumptions.householdType==='single'?1:2);
  function busy(value){buttons.forEach(b=>b.disabled=value||!config);$('run-master').disabled=value||!config;$('cancel-action').hidden=!value;$('action-results').setAttribute('aria-busy',String(value));}
  function cancel(){generation++;worker?.terminate();worker=null;proposal=null;source=null;busy(false);$('apply-action').hidden=true;}
  function receive(c){
    const normalized=E.normalizeConfig(c);if(config&&key(config)===key(normalized))return;
    const previous=!!config;cancel();config=normalized;busy(applying);$('action-results').hidden=true;
    $('action-context').textContent=people(config).map(p=>p.name+': retire at '+p.targetRetireAge+' ('+(p.birthYear+p.targetRetireAge)+')').join(' · ')+' · Spending goal '+money(config.assumptions.desiredMonthlyIncome)+'/month after tax.';
    $('retirement-preferences').hidden=people(config).length===1;
    $('retirement-sell-rentals').disabled=!config.realEstate.some(p=>p.type==='rental');
    if($('retirement-sell-rentals').disabled)$('retirement-sell-rentals').checked=false;
    $('retirement-fixed').replaceChildren(new Option('Find ages for both',''));
    people(config).forEach((p,k)=>$('retirement-fixed').append(new Option('Keep '+p.name+' at age '+p.targetRetireAge,String(k))));
    describeRetirement();
    orderComparison?.invalidate();$('order-comparison').replaceChildren();
    orderComparison=PlanComparison.mount($('order-comparison'),{task:'withdrawals',getConfig:()=>config,onApply:async candidate=>{await AppStorage.save(candidate);$('action-status').textContent='Withdrawal order applied and saved.';}});
    if(previous)$('action-status').textContent='Your saved plan changed. Run a fresh check to use the latest settings.';
  }
  function describeRetirement(){
    const gap=$('retirement-gap').value;
    $('retirement-heading').textContent=people(config).length===1?'Retire sooner':'Retire sooner, together';
    $('retirement-description').textContent=people(config).length===1?'Find the earliest retirement age that funds your spending goal.':'Find the earliest funded retirement dates'+(gap===''?'.':gap==='0'?', in the same calendar year.':', within '+gap+' calendar years of each other.');
  }
  function step(text){const li=document.createElement('li');li.textContent=text;$('action-steps').append(li);}
  function metric(label,value,note){const box=document.createElement('div'),title=document.createElement('span'),amount=document.createElement('strong'),hint=document.createElement('small');title.textContent=label;amount.textContent=value;hint.textContent=note;box.append(title,amount,hint);$('action-metrics').append(box);}
  function comparisonMetric(label,before,after,lowerBetter,note){
    const box=document.createElement('div'),title=document.createElement('span'),change=document.createElement('strong'),hint=document.createElement('small');title.textContent=label;change.append(PlanComparison.delta(after-before,lowerBetter?after<before:after>before));hint.textContent='Current '+money(before)+' → Proposed '+money(after)+'. '+note;box.append(title,change,hint);$('action-metrics').append(box);
  }
  function funded(r){return r.depletedYear===null&&!r.years.some(y=>y.unfunded>1);}
  function fundingText(r){return funded(r)?'Your spending is funded through '+r.endYear+'.':'Your spending first falls short in '+(r.depletedYear||r.years.find(y=>y.unfunded>1)?.year)+'.';}
  function withdrawals(r){
    const table=document.createElement('table'),head=document.createElement('thead'),body=document.createElement('tbody');
    const headers=document.createElement('tr');['Year','Withdrawals before tax','Personal tax'].forEach(label=>{const th=document.createElement('th');th.textContent=label;th.scope='col';headers.append(th);});head.append(headers);
    r.years.forEach(row=>{const tr=document.createElement('tr');[row.year,row.accounts.filter(a=>a.draw+a.forced>1).map(a=>a.owner+' · '+a.name+': '+money(a.draw+a.forced)).join('; ')||'No investment withdrawal needed',money(row.totalTax)].forEach(value=>{const td=document.createElement('td');td.textContent=value;tr.append(td);});body.append(tr);});
    table.append(head,body);$('action-schedule-table').replaceChildren(table);$('action-schedule').hidden=false;$('action-schedule').open=false;
  }
  function show(kind,result,snapshot){
    $('action-results').hidden=false;$('action-metrics').replaceChildren();$('action-steps').replaceChildren();$('action-schedule').hidden=true;
    $('action-status').textContent='Check complete. Review the result below.';
    if(result.config&&result.objective){
      const spending=result.objective==='spending',estate=result.objective==='estate';
      $('action-result-title').textContent=spending?'Your plan for more monthly spending':estate?'Your plan for higher ending net worth':'Your plan for lower lifetime tax';
      $('action-summary').textContent=result.improved?'A combined plan improved your selected goal. Review the changes below.':'No improvement was found among the combined plans tested.';
      metric(spending?'Monthly after-tax spending capacity':estate?'Ending net worth':'Lifetime tax',money(spending?result.monthlySpend:estate?result.result.finalNetWorthReal:result.result.lifetimeTax+result.result.lifetimeCorporateTax),spending?'Current capacity '+money(result.baselineSpend)+'/month; today’s dollars':'At your current spending goal');
      people(result.config).forEach((p,k)=>{for(const field of ['cppStartAge','oasStartAge'])if(p[field]!==snapshot.incomes[k][field])step(p.name+': '+(field==='cppStartAge'?'CPP / QPP':'OAS')+' starts at age '+p[field]+' (was '+snapshot.incomes[k][field]+').');});
      step('Withdrawal order: '+PlanComparison.names[result.config.assumptions.withdrawalStrategy]+'.');
      step('Contribution allocation: '+(result.config.assumptions.optimizeContributions?'optimize eligible contributions with an RRSP marginal-rate floor of '+result.config.assumptions.rrspMinMarginalRate+'%.':'use the configured account contributions.'));
      result.config.accounts.forEach((a,k)=>{if(a.flexible!==snapshot.accounts[k]?.flexible&&a.flexible)step(a.name+': include its contribution budget in RRSP / TFSA allocation.');});
      result.config.realEstate.forEach((p,k)=>{const old=snapshot.realEstate[k];if(p.saleYear!==old.saleYear||p.ccaEnabled!==old.ccaEnabled)step(p.name+': '+(p.saleYear?'sell in '+p.saleYear:'keep through the plan')+'; '+(p.ccaEnabled?'claim future CCA':'stop future CCA claims')+'.');});
      $('action-explanation').textContent='Tested '+result.evaluated+' combined plans using pension timing, withdrawal orders and contribution allocation'+(result.sellRentals?', plus rental sale years and CCA':'')+'. Promising choices are revisited together and finalists are recalculated at full precision. This bounded search may miss a better combination. Already-started benefits stay fixed. Applying keeps your spending goal and contribution budgets; the displayed capacity is an estimate under your assumptions.';
      if(result.improved){proposal=result.config;$('apply-action').textContent='Apply and save optimized plan';withdrawals(result.result);}
    }else if(kind==='status'){
      const {baseline,stressed,monteCarlo:mc}=result;
      $('action-result-title').textContent='Your current plan: the results';
      $('action-summary').textContent=fundingText(baseline)+' In the market simulations, '+Math.round(mc.successRate*mc.runs)+' of '+mc.runs+' paths funded the full plan.';
      metric('Market simulations funded',(mc.successRate*100).toFixed(1)+'%',mc.runs+' Monte Carlo runs');
      metric('Final net worth',money(baseline.finalNetWorthReal),'Your selected returns, in today’s dollars');
      metric('Lifetime tax',money(baseline.lifetimeTax+baseline.lifetimeCorporateTax),'Personal and corporate tax; future dollars');
      step('Your selected return assumption: '+fundingText(baseline));step('Difficult first decade: '+fundingText(stressed));
      step('Monte Carlo tries different annual investment returns using your configured volatility of '+snapshot.assumptions.mcVolatility+'%. A funded run covers the spending goal for the full plan.');
      step(funded(baseline)?'To explore improvements, choose an earlier retirement or withdrawal search above.':'Try a later retirement date, lower spending goal or higher savings, then check again.');
      $('action-explanation').textContent='This is a check of your saved settings, so there are no changes to apply. The percentage describes the simulated paths, not a guaranteed chance of success. Taxes, pensions and spending follow your assumptions; the difficult-decade check uses your configured reduction in returns.';
    }else if(kind==='retirement'){
      $('action-result-title').textContent=result.found?'Your earliest funded retirement dates':'No matching retirement dates found';
      const gap=$('retirement-gap').value;
      $('action-explanation').textContent='Searches whole years through age 75, before your plan ends. It first finds the earliest year by which everyone can retire, then favours closer dates. '+(people(snapshot).length===2&&gap!==''?'Dates must be within '+gap+' calendar years. ':'')+'Past retirement dates stay fixed. This uses your expected projection; run Check current status after applying to test market uncertainty.';
      if(!result.found){$('action-summary').textContent='No tested combination funded '+money(result.goal)+'/month under these search preferences.';step(people(snapshot).length===1?'Try lowering the spending goal or updating your savings and pension estimates.':'Try a wider retirement gap or allow both dates to change. You can also lower the spending goal or update your savings and pension estimates.');reveal();return;}
      const candidate=structuredClone(snapshot);delete candidate.assumptions.withdrawalPlan;
      if(result.rentalSales){
        result.rentalSales.forEach(s=>{const property=candidate.realEstate[s.index];step(property.name+': '+(s.year?'sell at the start of '+s.year:'keep through the plan')+' (current setting: '+(property.saleYear||'keep')+').');property.saleYear=s.year;});
        step('Sale timing includes rental income, selling costs, mortgage repayment, capital gains and CCA recapture. Multiple rentals are tested together in a common sale year; other combinations may perform differently.');
      }
      people(candidate).forEach((p,k)=>{step(p.name+': change retirement from age '+p.targetRetireAge+' ('+(p.birthYear+p.targetRetireAge)+') to age '+result.ages[k]+' ('+result.years[k]+').');p.targetRetireAge=result.ages[k];metric(p.name+' retires','Age '+result.ages[k],String(result.years[k]));});
      $('action-summary').textContent='These dates fund your '+money(result.goal)+'/month spending goal through '+result.endYear+' under the entered assumptions.';
      step('Keep your configured savings contributions and spending goal. Pension start dates change only for workplace pensions linked to retirement.');
      step('Applying replaces the retirement ages and clears any saved withdrawal schedule so it can be recalculated for the new dates.');
      if(key(candidate)!==key(snapshot)){proposal=candidate;$('apply-action').textContent=result.rentalSales?'Apply retirement ages and rental settings':'Apply these retirement ages';}
      else step('Your current plan already uses these dates. There is nothing to apply.');
    }else{
      const estate=kind==='estate',r=result.result;
      $('action-result-title').textContent=estate?'Steps to increase final net worth':'Steps to reduce lifetime tax';
      const improved=estate?result.estateChange>1:result.taxSavings>1;
      $('action-summary').textContent=(improved?'A better withdrawal path was found. ':'No improvement was found among the paths tested. ')+fundingText(r);
      comparisonMetric('Lifetime tax change',result.baseline.lifetimeTax+result.baseline.lifetimeCorporateTax,r.lifetimeTax+r.lifetimeCorporateTax,true,'Personal and corporate tax; future dollars.');
      comparisonMetric('Final net worth change',result.baseline.finalNetWorthReal,r.finalNetWorthReal,false,'In today’s dollars.');
      comparisonMetric('Lifetime benefits change',result.baseline.lifetimeBenefits,r.lifetimeBenefits,false,'GIS and supplements; future dollars.');
      step('Keep the current retirement ages and '+money(snapshot.assumptions.desiredMonthlyIncome)+'/month spending goal.');
      step('Withdrawal order: '+PlanComparison.names[snapshot.assumptions.withdrawalStrategy]+' → '+PlanComparison.names[result.withdrawalStrategy]+'. Annual registered-account targets may change even when the order stays the same.');
      if(improved){
        step('Apply the proposed account withdrawal order and annual registered-account targets. The year-by-year table shows the projected amounts from each account, including mandatory withdrawals.');
        const first=r.years.find((row,i)=>JSON.stringify(row.accounts.map(a=>[a.draw,a.forced]))!==JSON.stringify(result.baseline.years[i]?.accounts.map(a=>[a.draw,a.forced])));
        if(first)step('First changed year: '+first.year+'. '+first.accounts.filter(a=>a.draw+a.forced>1).map(a=>money(a.draw+a.forced)+' from '+a.owner+'’s '+a.name).join('; ')+'.');
        proposal=structuredClone(snapshot);proposal.assumptions.withdrawalStrategy=result.withdrawalStrategy;proposal.assumptions.withdrawalPlan=result.withdrawalPlan;
        $('apply-action').textContent='Apply this withdrawal plan';withdrawals(r);
      }else step('Your saved plan stays as it is. Try different retirement dates or update your assumptions before searching again.');
      $('action-explanation').textContent='Compared '+result.evaluated+' withdrawal paths across the plan. This searches how to use existing accounts; it does not change your salary, property sales or pension elections. The search is limited and may not find the best possible result. Changes are proposed minus current: lower tax is green, higher tax is red; higher net worth or benefits is green. Review both tax and net worth before applying.';
    }
    reveal();
  }
  function reveal(){$('apply-action').hidden=!proposal;$('action-result-title').focus({preventScroll:true});$('action-results').scrollIntoView({behavior:'smooth',block:'start'});}
  function start(kind,combined=false){
    if(!config||applying)return;
    cancel();const id=generation,snapshot=structuredClone(config);source=key(snapshot);busy(true);$('action-results').hidden=true;
    $('action-status').textContent=kind==='status'?'Checking spending and difficult markets, then running Monte Carlo…':kind==='retirement'?'Searching for funded retirement dates…':'Comparing withdrawal paths across your plan…';
    try{
      worker=AppWorkers.create(kind==='retirement'?'retirement':kind==='status'?'status':'optimization');
      const fail=message=>{cancel();$('action-status').textContent='Could not finish: '+message+' Your saved plan is unchanged.';};
      worker.onerror=()=>{if(id===generation)fail('calculation worker failed. Please try again.');};
      worker.onmessage=({data})=>{
        if(id!==generation||data.id!==id||!worker)return;
        if(data.error){fail(data.error);return;}
        if(!data.result){$('action-status').textContent=data.progress?.phase?data.progress.phase+': '+data.progress.evaluated+' combined plans checked.':data.progress?.fraction!=null?'Testing market outcomes: '+Math.round(data.progress.fraction*100)+'% complete.':data.progress?'Compared '+data.progress.evaluated+' withdrawal paths…':'Checked '+data.tested+' of '+data.total+' retirement combinations…';return;}
        worker.terminate();worker=null;busy(false);try{show(kind,data.result,snapshot);}catch(error){fail(error.message);}
      };
      const searchConfig=structuredClone(snapshot);if(kind==='retirement')delete searchConfig.assumptions.withdrawalPlan;
      worker.postMessage({id,config:searchConfig,objective:kind,combined,sellRentals:combined?$('master-sell-rentals').checked:$('retirement-sell-rentals').checked,maxYearGap:$('retirement-gap').value===''?null:+$('retirement-gap').value,preferClose:true,fixedPerson:$('retirement-fixed').value===''?null:+$('retirement-fixed').value});
    }catch(error){cancel();$('action-status').textContent='Could not start the calculation: '+error.message;}
  }
  buttons.forEach(b=>b.onclick=()=>start(b.dataset.action));
  $('run-master').onclick=()=>{const goal=$('master-goal').value;orderComparison?.invalidate();$('withdrawal-options').open=false;start(goal,['spending','estate','tax'].includes(goal));};
  ['master-goal','master-sell-rentals'].forEach(id=>$(id).onchange=()=>{cancel();$('action-results').hidden=true;$('action-status').textContent='Goal or options changed. Optimize again to update the recommendation.';});
  $('cancel-action').onclick=()=>{cancel();$('action-status').textContent='Calculation cancelled. Your saved plan is unchanged.';};
  ['retirement-gap','retirement-fixed','retirement-sell-rentals'].forEach(id=>$(id).onchange=()=>{cancel();$('action-results').hidden=true;describeRetirement();$('action-status').textContent='Search preferences updated. Choose Find earliest retirement to run again.';});
  $('apply-action').onclick=async()=>{
    if(!proposal||applying)return;
    const candidate=structuredClone(proposal),expected=source;applying=true;buttons.forEach(b=>b.disabled=true);$('apply-action').disabled=true;
    try{
      const response=await AppStorage.fetch('/api/config');if(!response.ok)throw new Error('Could not read your saved plan.');
      const latest=await response.json();if(key(latest)!==expected){receive(latest);throw new Error('Your plan changed. Run this search again before applying.');}
      const saved=await AppStorage.save(candidate);receive(saved);cancel();$('action-results').hidden=true;
      $('action-status').textContent='Changes applied and saved. Check current status to test your updated plan, or view Overview.';
    }catch(error){$('action-status').textContent=error.message;}
    finally{applying=false;busy(false);$('apply-action').disabled=false;}
  };
  AppStorage.bindState(()=>config,receive);AppStorage.subscribe(receive);
  AppStorage.fetch('/api/config').then(r=>{if(!r.ok)throw new Error('Could not load the saved plan.');return r.json();}).then(c=>{receive(c);const goal=new URLSearchParams(location.search).get('goal');if(goal&&[...$('master-goal').options].some(o=>o.value===goal)){$('master-goal').value=goal;$('run-master').click();}}).catch(error=>$('action-status').textContent=error.message);
})();
