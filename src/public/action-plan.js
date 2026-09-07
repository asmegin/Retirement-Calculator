(function(){
  'use strict';
  if(document.body.dataset.page==='overview'){
    const metrics=document.querySelector('body > .metrics-grid');
    ['p1-slider','p2-slider'].forEach(id=>{const control=document.getElementById(id).closest('.ctl');control.classList.add('metric-card');metrics.append(control);});
  }
  document.getElementById('planner-title').closest('section').parentElement.classList.add('action-shell');
  if(document.body.dataset.page==='overview'){
    const layout=document.createElement('div');layout.className='overview-main';const action=document.querySelector('.action-shell');action.before(layout);layout.append(document.getElementById('p-projection'),action);
  }else document.querySelector('h1').textContent='Detailed Overview';
  const steps=document.getElementById('action-steps'),status=document.getElementById('estate-action-status');
  let worker,result,generation=0,lastAges='';
  function cancel(){generation++;worker?.terminate();worker=null;result=null;document.getElementById('maximize-estate').disabled=false;document.getElementById('cancel-estate').hidden=true;document.getElementById('apply-estate').hidden=true;document.getElementById('estate-schedule').hidden=true;}
  function add(text){const item=document.createElement('li');item.textContent=text;steps.append(item);}
  function retirementSteps(){
    if(!config||!plannerResult?.found){steps.replaceChildren();lastAges='';return;}
    const key=JSON.stringify([plannerResult.ages,config]);if(key===lastAges)return;lastAges=key;steps.replaceChildren();
    const candidate=E.normalizeConfig(config);plannerResult.ages.forEach((age,k)=>candidate.incomes[k].targetRetireAge=age);
    const projection=E.simulate(candidate),first=projection.years[0];
    add('Keep your after-tax household spending goal at '+fmt(candidate.assumptions.desiredMonthlyIncome)+' per month in today’s dollars.');
    const people=candidate.incomes.slice(0,candidate.assumptions.householdType==='single'?1:2);
    people.forEach((p,k)=>{
      const deposits=first.accounts.filter(a=>a.owner===p.name&&a.type!=='CORP').reduce((s,a)=>s+a.contrib,0);
      if(deposits>0)add(p.name+': follow the '+fmt(deposits)+' total account deposits projected for '+first.year+' (including any employer deposits). RRSP goal completion is '+candidate.assumptions.rrspGoalCompletion+'%.');
      add(p.name+': retire at '+p.targetRetireAge+' in '+plannerResult.years[k]+'. Start CPP/QPP at '+p.cppStartAge+' and OAS at '+p.oasStartAge+'.');
    });
    const row=projection.years.find(y=>y.retired.some(Boolean));
    if(row){const draws=row.accounts.filter(a=>a.draw+a.forced>1).map(a=>fmt(a.draw+a.forced)+' from '+a.owner+'’s '+a.name);if(draws.length)add('In '+row.year+', the projection needs '+draws.join(', ')+'. Later amounts change with your income and tax.');}
    add('Use the retirement ages below to apply this funded projection. It assumes the savings and returns in your plan.');
  }
  new MutationObserver(retirementSteps).observe(document.getElementById('planner-status'),{childList:true,subtree:true,characterData:true});
  document.getElementById('maximize-estate').onclick=()=>{
    cancel();const id=generation;worker=AppWorkers.create('optimization');document.getElementById('maximize-estate').disabled=true;document.getElementById('cancel-estate').hidden=false;status.textContent='Comparing withdrawal paths for your current retirement ages…';
    worker.onmessage=event=>{
      if(id!==generation||!worker)return;const data=event.data;
      if(data.progress){status.textContent='Compared '+data.progress.evaluated+' withdrawal paths…';return;}
      worker.terminate();worker=null;document.getElementById('maximize-estate').disabled=false;document.getElementById('cancel-estate').hidden=true;
      if(data.error){status.textContent=data.error;return;}result=data.result;
      status.textContent='Best evaluated path changes final net worth by '+fmt(result.estateChange)+' in today’s dollars and lifetime tax by '+fmt(-result.taxSavings)+'. '+(result.result.depletedYear?'This plan still has a shortfall in '+result.result.depletedYear+'.':'The spending goal is funded through '+result.result.endYear+'.')+' This bounded search does not prove a global optimum.';
      const parent=document.getElementById('estate-action-schedule');parent.replaceChildren();const table=document.createElement('table');table.innerHTML='<thead><tr><th>Year</th><th>Withdrawal steps</th><th>Personal tax</th></tr></thead>';const body=document.createElement('tbody');
      result.result.years.forEach(row=>{const tr=document.createElement('tr');[row.year,row.accounts.filter(a=>a.draw+a.forced>1).map(a=>a.owner+' · '+a.name+': '+fmt(a.draw+a.forced)).join('; ')||'No investment withdrawal needed',fmt(row.totalTax)].forEach(value=>{const td=document.createElement('td');td.textContent=value;tr.append(td);});body.append(tr);});table.append(body);parent.append(table);
      document.getElementById('estate-schedule').hidden=false;document.getElementById('estate-schedule').open=true;document.getElementById('apply-estate').hidden=false;
    };
    worker.onerror=()=>{cancel();status.textContent='The search could not finish. Your plan is unchanged.';};worker.postMessage({id,config:structuredClone(config),objective:'estate'});
  };
  document.getElementById('cancel-estate').onclick=()=>{cancel();status.textContent='Search cancelled.';};
  document.getElementById('apply-estate').onclick=async()=>{if(!result)return;try{const c=E.normalizeConfig(config);c.assumptions.withdrawalStrategy=result.withdrawalStrategy;c.assumptions.withdrawalPlan=result.withdrawalPlan;const saved=await AppStorage.save(c);receiveConfig(saved);status.textContent='Withdrawal steps applied and saved.';}catch(error){status.textContent=error.message;}};
  window.addEventListener('planinputschange',()=>{cancel();status.textContent='';});
})();
