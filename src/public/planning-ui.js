'use strict';
const E=RetireEngine,Core=PlanningCore,$=id=>document.getElementById(id);
const money=value=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0}).format(Number.isFinite(value)?value:0);
const clone=value=>JSON.parse(JSON.stringify(value));
let config,projection,sandbox,worker,optimized,orderComparison,workspaceDirty=false,revision=0,refreshTimer,sandboxTimer,sequence=0,objective='tax';
const people=()=>config.incomes.slice(0,config.assumptions.householdType==='single'?1:2);
function button(label,action,primary=false){const b=document.createElement('button');b.type='button';b.className='btn'+(primary?'':' ghost');b.textContent=label;b.onclick=action;return b;}
function field(obj,key,label,help,type='number',options){
  const wrap=document.createElement('div');wrap.className='form-field';
  const lab=document.createElement('label');lab.textContent=label;lab.htmlFor='workspace-field-'+(++sequence);
  const control=document.createElement(type==='select'?'select':type==='textarea'?'textarea':'input');control.id=lab.htmlFor;
  if(type==='select')options.forEach(option=>{const opt=document.createElement('option');opt.value=typeof option==='object'?option.value:option;opt.textContent=typeof option==='object'?option.label:option;control.appendChild(opt);});
  else if(type!=='textarea')control.type=type;
  if(type==='checkbox')control.checked=obj[key]===true;else control.value=obj[key]??'';
  if(type==='number')control.step='any';
  control.onchange=()=>{obj[key]=type==='checkbox'?control.checked:type==='number'?(control.value===''?null:Number(control.value)):control.value;changed();};
  wrap.append(lab,control);SettingHelp.attach(control,help);return wrap;
}
function grid(parent){const g=document.createElement('div');g.className='form-grid';parent.appendChild(g);return g;}
function heading(parent,text){const h=document.createElement('h3');h.textContent=text;parent.appendChild(h);}
function table(parent,headers,rows){
  const t=document.createElement('table'),head=document.createElement('thead'),tr=document.createElement('tr');
  headers.forEach(label=>{const th=document.createElement('th');th.textContent=label;tr.appendChild(th);});head.appendChild(tr);t.appendChild(head);
  const body=document.createElement('tbody');rows.forEach(row=>{const r=document.createElement('tr');row.forEach(value=>{const td=document.createElement('td');td.textContent=value??'—';r.appendChild(td);});body.appendChild(r);});t.appendChild(body);parent.replaceChildren(t);
}
function changed(){
  workspaceDirty=true;orderComparison?.invalidate();
  revision++;delete config.assumptions.withdrawalPlan;optimized=null;
  if(worker){worker.terminate();worker=null;$('optimization-status').textContent='Inputs changed. Run the search again for this plan.';}
  $('cancel-optimize').hidden=true;$('optimize').disabled=false;$('apply-optimized').hidden=true;$('export-withdrawals').hidden=true;
  $('save-status').textContent='Unsaved changes';clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,200);
}
function refresh(){
  try{
    projection=E.simulate(config);summary();renderSandbox();
  }catch(error){$('save-status').textContent='Check inputs: '+error.message;}
}
function summary(){
  $('workspace-summary').replaceChildren();
  [['After-tax monthly budget',money(config.assumptions.desiredMonthlyIncome),'Today’s dollars'],['Ending net worth',money(projection.finalNetWorthReal),'Today’s dollars · '+projection.endYear],['Lifetime personal tax',money(projection.lifetimeTax),'Includes OAS recovery and terminal tax']].forEach(([label,value,sub])=>{
    const card=document.createElement('div');card.className='metric-card';const l=document.createElement('label');l.textContent=label;const v=document.createElement('div');v.className='val';v.textContent=value;const s=document.createElement('div');s.className='sub';s.textContent=sub;card.append(l,v,s);$('workspace-summary').appendChild(card);
  });
}
function render(){
  orderComparison?.invalidate();$('order-comparison').replaceChildren();
  if(document.body.dataset.page==='withdrawals')orderComparison=PlanComparison.mount($('order-comparison'),{task:'withdrawals',getConfig:()=>config,onApply:c=>{receivePlan(c);workspaceDirty=true;$('save-status').textContent='Withdrawal order applied. Save plan to keep it.';}});
  renderScenarioControls();renderOptimizationControls();refresh();
}
function renderScenarioControls(){
  sandbox=clone(config);$('scenario-controls').replaceChildren();const g=grid($('scenario-controls'));
  const details={name:'My alternative',downsizeAge:70,replacementValue:500000,downsize:false};sandbox._scenario=details;
  const downsizeFields=[];
  const add=(obj,key,label,help,type,options)=>{const f=field(obj,key,label,help,type,options);const control=f.querySelector('input,select');control.onchange=()=>{obj[key]=type==='checkbox'?control.checked:type==='number'?Number(control.value):control.value;downsizeFields.forEach(row=>row.hidden=!details.downsize);clearTimeout(sandboxTimer);sandboxTimer=setTimeout(renderSandbox,250);};g.appendChild(f);return f;};
  add(details,'name','Scenario name','Name this alternative for saving and comparison.','text');
  people().forEach((_,k)=>{add(sandbox.incomes[k],'targetRetireAge',sandbox.incomes[k].name+': retire at','Only this sandbox changes; your workspace baseline remains unchanged.','number');add(sandbox.incomes[k],'cppStartAge',sandbox.incomes[k].name+': CPP/QPP start','Try 60 versus 70; QPP supports deferral to 72.','number');});
  const hasHome=config.realEstate.some(p=>p.type==='principal');
  const toggle=add(details,'downsize','Downsize primary home',hasHome?'Sell your primary home at the chosen age and buy a mortgage-free replacement.':'Add a primary residence under Properties to compare downsizing.','checkbox');toggle.querySelector('input').disabled=!hasHome;
  downsizeFields.push(add(details,'downsizeAge','Downsize at Person 1 age','The sale year follows Person 1\'s birth year.','number'));
  downsizeFields.push(add(details,'replacementValue','Replacement home value today','Price of the smaller home today. Future price growth follows your current home.','number'));
  downsizeFields.forEach(row=>row.hidden=true);
}
function scenarioConfig(){
  const c=clone(sandbox);delete c._scenario;delete c.assumptions.withdrawalPlan;
  if(sandbox._scenario.downsize){const home=c.realEstate.find(p=>p.type==='principal');if(!home)throw new Error('Add a principal residence before modelling downsizing.');const year=c.incomes[0].birthYear+sandbox._scenario.downsizeAge;home.saleYear=year;c.realEstate.push({name:'Replacement home',type:'principal',value:Math.max(0,sandbox._scenario.replacementValue),appreciation:home.appreciation,purchaseYear:year,mortgage:0,acb:sandbox._scenario.replacementValue});}
  return c;
}
function compareMetrics(baseline,alternative,label,parent){
  const rows=[['Ending net worth (today’s dollars)',baseline.finalNetWorthReal,alternative.finalNetWorthReal],['Lifetime personal tax',baseline.lifetimeTax,alternative.lifetimeTax],['Lifetime corporate tax',baseline.lifetimeCorporateTax,alternative.lifetimeCorporateTax],['Lifetime GIS + supplements',baseline.lifetimeBenefits,alternative.lifetimeBenefits],['First shortfall year',baseline.depletedYear||'None',alternative.depletedYear||'None'],['Projection ends',baseline.endYear,alternative.endYear]];
  table(parent,['Measure','Workspace plan',label,'Change'],rows.map(([key,a,b])=>[key,typeof a==='number'&&key!=='Projection ends'&&key!=='First shortfall year'?money(a):a,typeof b==='number'&&key!=='Projection ends'&&key!=='First shortfall year'?money(b):b,typeof a==='number'&&typeof b==='number'&&key!=='Projection ends'&&key!=='First shortfall year'?(b-a>=0?'+':'')+money(b-a):'—']));
}
function renderSandbox(){if(!sandbox||!projection)return;try{compareMetrics(projection,E.simulate(scenarioConfig()),sandbox._scenario.name,$('scenario-result'));}catch(error){$('scenario-result').textContent=error.message;}}
$('scenario-reset').onclick=()=>{renderScenarioControls();renderSandbox();};
$('scenario-apply').onclick=()=>{try{config=E.normalizeConfig(scenarioConfig());changed();render();}catch(error){$('scenario-result').textContent=error.message;}};
$('scenario-save').onclick=async()=>{try{const response=await AppStorage.fetch('/api/scenarios',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:sandbox._scenario.name,config:scenarioConfig()})});if(!response.ok)throw new Error('Could not save scenario');$('save-status').textContent='Scenario saved; workspace baseline unchanged.';loadSaved();}catch(error){$('save-status').textContent=error.message;}};
async function loadSaved(){try{const list=await(await AppStorage.fetch('/api/scenarios')).json();$('saved-scenarios').replaceChildren();list.forEach(s=>{$('saved-scenarios').append(button('Compare: '+s.name,()=>compareMetrics(projection,E.simulate(s.config),s.name,$('scenario-result'))));});}catch(error){$('saved-scenarios').textContent='Saved scenarios could not be loaded.';}}
function renderOptimizationControls(){const obj={objective};const f=field(obj,'objective','Search objective','Minimize taxes or tax minus benefits while preserving the baseline estate; alternatively maximize ending estate. The search evaluates a bounded set of multi-year schedules.','select',[{value:'tax',label:'Reduce lifetime tax'},{value:'benefits',label:'Improve tax and benefits'},{value:'estate',label:'Maximize ending estate'}]);f.querySelector('select').onchange=event=>objective=event.target.value;$('optimization-controls').replaceChildren(f);}
$('optimize').onclick=()=>{
  if(worker)worker.terminate();const id=++revision;optimized=null;$('export-withdrawals').hidden=true;$('optimization-result').replaceChildren();$('optimize').disabled=true;$('cancel-optimize').hidden=false;$('apply-optimized').hidden=true;
  $('optimization-status').textContent='Comparing full retirement paths…';worker=AppWorkers.create('optimization');
  worker.onmessage=event=>{if(event.data.id!==revision||!worker)return;const {progress,result,error}=event.data;if(progress){$('optimization-status').textContent='Evaluated '+progress.evaluated+' / '+progress.maxEvaluations+' schedules. Best personal tax so far: '+money(progress.bestTax)+'.';return;}
    worker.terminate();worker=null;$('optimize').disabled=false;$('cancel-optimize').hidden=true;
    if(error){$('optimization-status').textContent=error;return;}optimized=result;
    $('optimization-status').textContent='Evaluated '+result.evaluated+' schedules. Lifetime tax change: '+money(-result.taxSavings)+'. Benefits change: '+money(result.benefitChange)+'. Ending estate change (today’s dollars): '+money(result.estateChange)+'. Best evaluated plan; global optimality is not guaranteed.';
    $('apply-optimized').hidden=false;$('export-withdrawals').hidden=false;
    table($('optimization-result'),['Year','RRSP / RRIF','TFSA','Non-registered','Tax','GIS + supplements','Ending net worth'],withdrawalRows(result.result));
  };
  worker.onerror=()=>{if(id!==revision||!worker)return;$('optimization-status').textContent='Search failed. Your plan has not changed.';$('optimize').disabled=false;$('cancel-optimize').hidden=true;worker.terminate();worker=null;};
  worker.postMessage({id,config,objective});
};
function withdrawalRows(result){return result.years.map(r=>{const draw=types=>r.accounts.filter(a=>types.includes(a.type)).reduce((s,a)=>s+a.draw+a.forced,0);return [r.year,money(draw(['RRSP','RRIF','DC'])),money(draw(['TFSA'])),money(draw(['TAXABLE'])),money(r.totalTax),money(r.gis+r.provincialBenefits),money(r.netWorth)];});}
$('cancel-optimize').onclick=()=>{revision++;if(worker)worker.terminate();worker=null;$('optimize').disabled=false;$('cancel-optimize').hidden=true;$('optimization-status').textContent='Search cancelled. Your plan is unchanged.';};
$('apply-optimized').onclick=()=>{if(!optimized)return;workspaceDirty=true;orderComparison?.invalidate();config.assumptions.withdrawalStrategy=optimized.withdrawalStrategy;config.assumptions.withdrawalPlan=optimized.withdrawalPlan;$('save-status').textContent='Withdrawal plan applied in workspace. Save plan to retain it.';refresh();};
$('export-withdrawals').onclick=()=>{if(!optimized)return;const csv=[['year','rrsp_rrif','tfsa','taxable','tax','benefits','ending_net_worth'],...withdrawalRows(optimized.result)].map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));const link=document.createElement('a');link.href=url;link.download='withdrawal-plan.csv';link.click();URL.revokeObjectURL(url);};
$('save-plan').onclick=async()=>{
  $('save-plan').disabled=true;try{
    const normalized=E.normalizeConfig(config);const result=E.simulate(normalized);
    if(result.years.length===0)throw new Error('The plan must extend into the current year.');
    const response=await AppStorage.fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(normalized)});const body=await response.json();if(!response.ok)throw new Error(body.error||'Save failed');config=body.config||normalized;workspaceDirty=false;$('save-status').textContent='Plan saved.';
  }catch(error){$('save-status').textContent=error.message;}finally{$('save-plan').disabled=false;}
};
AppStorage.fetch('/api/config').then(r=>{if(!r.ok)throw new Error('Could not load plan');return r.json();}).then(c=>{config=E.normalizeConfig(c);render();loadSaved();if(new URLSearchParams(location.search).has('compare'))orderComparison?.run();}).catch(error=>$('save-status').textContent=error.message);

function receivePlan(c){
  workspaceDirty=false;
  revision++;worker?.terminate();worker=null;optimized=null;
  $('optimize').disabled=false;$('cancel-optimize').hidden=true;$('apply-optimized').hidden=true;$('export-withdrawals').hidden=true;
  $('optimization-result').replaceChildren();$('optimization-status').textContent='Plan updated. Run the search for this plan.';
  config=E.normalizeConfig(c);render();
}
AppStorage.bindState(()=>config,receivePlan);
AppStorage.subscribe(c=>{if(workspaceDirty){$('save-status').textContent='The saved plan changed in another window. Your unsaved workspace edits are kept here.';return;}receivePlan(c);});
