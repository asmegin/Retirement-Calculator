'use strict';
const E=RetireEngine,Core=PlanningCore,$=id=>document.getElementById(id);
const money=value=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0}).format(Number.isFinite(value)?value:0);
const clone=value=>JSON.parse(JSON.stringify(value));
let config,projection,sandbox,worker,optimized,revision=0,refreshTimer,sandboxTimer,sequence=0,objective='tax';
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
  revision++;delete config.assumptions.withdrawalPlan;optimized=null;
  if(worker){worker.terminate();worker=null;$('optimization-status').textContent='Inputs changed. Run the search again for this plan.';}
  $('cancel-optimize').hidden=true;$('optimize').disabled=false;$('apply-optimized').hidden=true;$('export-withdrawals').hidden=true;
  $('save-status').textContent='Unsaved changes';clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,200);
}
function refresh(){
  try{
    if(config.assumptions.spendingMode==='categories')config.assumptions.desiredMonthlyIncome=Core.spendingBaseline(config.assumptions.spendingCategories)/12;
    projection=E.simulate(config);summary();renderResults();renderSandbox();
  }catch(error){$('save-status').textContent='Check inputs: '+error.message;}
}
function summary(){
  $('workspace-summary').replaceChildren();
  [['After-tax monthly budget',money(config.assumptions.desiredMonthlyIncome),'Today’s dollars'],['Ending net worth',money(projection.finalNetWorthReal),'Today’s dollars · '+projection.endYear],['Lifetime personal tax',money(projection.lifetimeTax),'Includes OAS recovery and terminal tax']].forEach(([label,value,sub])=>{
    const card=document.createElement('div');card.className='metric-card';const l=document.createElement('label');l.textContent=label;const v=document.createElement('div');v.className='val';v.textContent=value;const s=document.createElement('div');s.className='sub';s.textContent=sub;card.append(l,v,s);$('workspace-summary').appendChild(card);
  });
}
function render(){renderSpending();renderCPP();renderEstate();renderCorporate();renderDebt();renderBenefits();renderScenarioControls();renderOptimizationControls();refresh();}
function renderSpending(){
  const a=config.assumptions;$('spending-controls').replaceChildren();
  const g=grid($('spending-controls'));
  g.append(field(a,'spendingMode','Budget method','Monthly target uses the overview goal and spending phases. Categories replace those phases with each category’s own schedule.','select',[{value:'target',label:'One monthly target'},{value:'categories',label:'Detailed categories'}]));
  g.append(field(a,'desiredMonthlyIncome','Monthly target',SettingHelp.text.desiredMonthlyIncome));
  g.append(field(a,'applySpendingBeforeRetirement','Include spending while working','Apply your target or category budget before either person retires. Leave off if your contribution amounts already represent savings after living expenses.','checkbox'));
  $('spending-rows').replaceChildren();
  a.spendingCategories.forEach((item,i)=>{
    const row=document.createElement('details');row.className='planning-row';row.open=item.name==='New expense';row.dataset.expenseIndex=i;
    const summary=document.createElement('summary');summary.textContent=item.name+' · '+money(item.amount)+' / '+item.frequency+' · ages '+item.startAge+'–'+item.endAge;row.appendChild(summary);
    const g=grid(row);
    [['name','Category','Name this expense so you recognize it in the annual spending schedule.','text'],['enabled','Include category','Include this expense in the category budget.','checkbox'],['amount','Amount','Dollar amount today, per month or year as selected.'],['frequency','Frequency','Monthly amounts occur 12 times per year; yearly amounts occur once.','select',['monthly','yearly']],['ageReference','Whose age?','Start/end ages refer to this person or the older household member.','select',['person1','person2','older']],['startAge','Start age','First age to include this cost.'],['endAge','End age','Last age to include this cost, inclusive.'],['everyYears','Repeat every N years','1 means every year. Use 5 for a vehicle purchase every five years.'],['inflation','Inflation % / year','Annual increase in this category’s prices. Blank uses the household inflation rate.']].forEach(([key,label,help,type,options])=>g.append(field(item,key,label,help,type||'number',options)));
    row.append(button('Remove category',()=>{a.spendingCategories.splice(i,1);changed();renderSpending();}));$('spending-rows').appendChild(row);
  });
}
$('add-expense').onclick=()=>{config.assumptions.spendingCategories.push({name:'New expense',enabled:true,amount:0,frequency:'monthly',startAge:0,endAge:120,everyYears:1,inflation:null,ageReference:'person1'});changed();renderSpending();};
$('expense-templates').onclick=()=>{Core.spendingNames.filter(name=>!config.assumptions.spendingCategories.some(x=>x.name===name)).forEach(name=>config.assumptions.spendingCategories.push({name,enabled:true,amount:0,frequency:'monthly',startAge:0,endAge:120,everyYears:1,inflation:null,ageReference:'person1'}));changed();renderSpending();};
function renderCPP(){
  $('cpp-rows').replaceChildren();people().forEach((p,k)=>{
    const row=document.createElement('div');row.className='planning-row';heading(row,p.name);const g=grid(row);
    p.cppMethod ||= 'statement';p.cppPlan ||= config.assumptions.province==='QC'?'QPP':'CPP';p.birthMonth ||= 1;p.cppStartMonth ||= 2;
    g.append(field(p,'cppMethod','Benefit input','Statement preserves your government estimate. History calculates a provisional benefit from imported pensionable earnings. Missing months are treated as zero and reported.','select',[{value:'statement',label:'Government statement estimate'},{value:'history',label:'Earnings history calculation'}]));
    g.append(field(p,'cppPlan','Pension plan','CPP uses a 17% general dropout and maximum start age 70; QPP uses 15% and maximum start age 72.','select',['CPP','QPP']));
    g.append(field(p,'cppStartAge','Start age','Age to begin benefits. CPP: 60–70. QPP: 60–72.'));g.append(field(p,'birthMonth','Birth month','1 for January through 12 for December. Used to define contributory months.'));
    g.append(field(p,'cppStartMonth','First payment month','1–12, in the year you reach your start age. The first payment year is prorated.'));
    g.append(field(p,'cppBaseAt65','Statement amount at 65 / month',SettingHelp.text.cppBaseAt65));
    const csv={text:'year,month,earnings,caregiver,disabled\n'+(p.cppHistory||[]).map(r=>[r.year,r.month||'',r.earnings,r.caregiver||false,r.disabled||false].join(',')).join('\n')};
    const text=field(csv,'text','Paste earnings CSV','Historical records from your CPP/QPP statement. Annual rows omit month; monthly rows include it. Caregiver and disability flags must describe eligible periods.','textarea');
    text.querySelector('textarea').onchange=event=>csv.text=event.target.value;row.append(g,text);
    const status=document.createElement('p');status.className='small-note';status.id='cpp-status-'+k;row.append(status);
    row.append(button('Import earnings records',()=>{try{p.cppHistory=Core.parseEarningsCSV(text.querySelector('textarea').value);changed();refresh();status.textContent=p.cppHistory.length+' records imported. '+status.textContent;}catch(error){status.textContent=error.message;}}));
    $('cpp-rows').appendChild(row);
  });
}
function renderEstate(){
  const a=config.assumptions.estate;$('estate-controls').replaceChildren();const g=grid($('estate-controls'));
  g.append(field(a,'enabled','Include death and terminal taxes','Model death at the end of each person’s chosen year; stop salary, OAS and own CPP thereafter.','checkbox'));
  g.append(field(a,'spousalRollover','Roll eligible assets to surviving spouse','Defer registered-account and capital-property tax at the first death when a spouse survives. Final death includes the remaining registered balances and deemed gains.','checkbox'));
  g.append(field(a,'survivorSpendingPercent','Survivor spending %','Percentage of the household spending schedule required after the first death.'));
  g.append(field(a,'notarialWill','Quebec notarial will','A Quebec notarial will generally does not need probate. Otherwise enter an override.','checkbox'));
  g.append(field(a,'probateOverride','Probate fee override','Optional fixed fee per non-rollover death. Blank uses supported provincial schedules; zero explicitly excludes probate fees.'));
  people().forEach(p=>{p.deathAge ??=config.assumptions.targetDeathAge;g.append(field(p,'deathAge',p.name+' lifespan (age)','The model treats death as occurring at year end at this age.'));});
  config.accounts.forEach(ac=>{ac.probateIncluded ??=true;g.append(field(ac,'probateIncluded',ac.name+': include in probate','Exclude only if this asset passes outside the probate estate, for example through an effective beneficiary designation. Tax liability can still apply.','checkbox'));});
  config.dbPensions.forEach(p=>{p.survivorPercent ??=60;g.append(field(p,'survivorPercent',p.name+': survivor pension %','Percentage of lifetime pension continuing to the spouse. Temporary bridge payments stop. Use your plan’s actual survivor election.'));});
}
function renderCorporate(){
  $('corporate-rows').replaceChildren();config.accounts.filter(ac=>ac.type==='CORP').forEach(ac=>{
    Object.entries({integratedCorporate:false,cdaOpening:0,gripOpening:0,erdtohOpening:0,nrdtohOpening:0,useCDA:true,businessIncome:0,businessSmallRate:12.2,businessGeneralRate:26.5,priorPassiveIncome:0,associatedPassiveIncome:0,capitalReturnShare:50,realizationRate:25}).forEach(([k,v])=>{ac[k]??=v;});
    const row=document.createElement('div');row.className='planning-row';heading(row,ac.name);const g=grid(row);
    [['integratedCorporate','Track corporate tax accounts','Enable CDA, GRIP and refundable tax balances for this corporation.','checkbox'],['businessIncome','Annual active business profit','Profit before owner salary and employer CPP, after other expenses. Leave 0 for a pure investment holding company.'],['businessSmallRate','Combined small-business tax %','Effective federal plus provincial small-business rate. Ontario default 12.2%; enter the appropriate rate for your province.'],['businessGeneralRate','Combined general business tax %','Effective general corporate rate on active profit above the available business limit. Ontario default 26.5%.'],['corporateTaxRate','Passive investment income tax %',SettingHelp.text.corporateTaxRate],['priorPassiveIncome','Previous-year passive income','Adjusted aggregate investment income used for the current small-business limit.'],['associatedPassiveIncome','Associated corporations’ passive income','Additional prior-year passive investment income from associated corporations.'],['cdaOpening','Opening CDA','Capital Dividend Account available for tax-free capital dividends. Enter the actual tax-account balance, not cash assets.'],['gripOpening','Opening GRIP','General Rate Income Pool supporting eligible dividend designations. Eligible withdrawals above available GRIP become non-eligible in this projection.'],['erdtohOpening','Opening eligible RDTOH','Refundable corporate tax balance associated with eligible dividends.'],['nrdtohOpening','Opening non-eligible RDTOH','Refundable corporate tax balance associated with non-eligible dividends.'],['capitalReturnShare','Capital gains share of return %','Percentage of total investment return represented by price gains; the rest is modelled as interest.'],['realizationRate','Capital gains realized each year %','Portion of this year’s price gains realized in the corporation, creating taxable gains and CDA.'],['useCDA','Pay capital dividends first','Use available CDA before taxable corporate distributions. Actual tax-free payments require a valid election.','checkbox']].forEach(([key,label,help,type])=>g.append(field(ac,key,label,help,type||'number')));
    const owner=config.incomes.find(p=>p.name===ac.owner);if(owner){g.append(field(owner,'salary','Owner salary',SettingHelp.text.salary));g.append(field(owner,'eligibleDividends','Owner eligible dividends / year',SettingHelp.text.eligibleDividends));g.append(field(owner,'nonEligibleDividends','Owner non-eligible dividends / year',SettingHelp.text.nonEligibleDividends));}
    $('corporate-rows').appendChild(row);
  });
  if(!$('corporate-rows').children.length)$('corporate-rows').textContent='No corporate investment accounts yet. Add one here, then set its balance and owner under Household & accounts.';
}
$('add-corporation').onclick=()=>{config.accounts.push({name:'Holding company '+(config.accounts.filter(a=>a.type==='CORP').length+1),owner:people()[0].name,type:'CORP',balance:0,growthRate:5,corporateTaxRate:50.17,integratedCorporate:true,dividendType:'non-eligible'});changed();renderCorporate();};
function renderDebt(){
  $('debt-rows').replaceChildren();config.realEstate.forEach(p=>{
    const row=document.createElement('div');row.className='planning-row';heading(row,p.name);const g=grid(row);
    [['extraPaymentAnnual','Extra principal payment / year','Additional annual cash used to repay this debt. It is charged to cash flow beyond ordinary payments.'],['extraPaymentStart','First prepayment year','First calendar year to make the extra annual payment.'],['extraPaymentEnd','Last prepayment year','Last calendar year to make extra payments, inclusive.'],['smithEnabled','Reborrow principal into investments','Readvance repaid mortgage principal into a dedicated non-registered investment portfolio. Both the assets and interest-only debt remain in the plan.','checkbox'],['smithRate','Investment loan interest %','Annual rate on the separately tracked investment HELOC. Interest is paid from household cash; no interest capitalization is assumed.'],['smithLimit','Maximum investment loan','Maximum outstanding reborrowed principal; lending capacity beyond this amount is unavailable.'],['smithGrowthRate','Borrowed portfolio return %','Annual total return assumption for the dedicated taxable portfolio.'],['smithOwner','Investment loan owner','Income and interest deductions are attributed to this person.','select',people().map(p=>p.name)]].forEach(([key,label,help,type,options])=>g.append(field(p,key,label,help,type||'number',options)));
    $('debt-rows').appendChild(row);
  });
  if(!config.realEstate.length)$('debt-rows').textContent='Add your mortgage or HELOC under Household & accounts first.';
}
function renderBenefits(){
  $('benefits-controls').replaceChildren();const g=grid($('benefits-controls'));
  g.append(field(config.assumptions,'gisEnabled','Include GIS',SettingHelp.text.gisEnabled,'checkbox'));
  people().forEach(p=>{g.append(field(p,'gisIncomeOpening',p.name+': prior-year GIS income',SettingHelp.text.gisIncomeOpening));g.append(field(p,'gainsEligible',p.name+': eligible for Ontario GAINS','Enable only for an Ontario resident who satisfies GAINS age, residence, OAS and GIS requirements. The estimate uses indexed July 2026 rates.','checkbox'));});
}
function renderResults(){
  const a=config.assumptions;
  document.querySelectorAll('[data-expense-index]').forEach(row=>{const c=a.spendingCategories[+row.dataset.expenseIndex];row.querySelector('summary').textContent=c.name+' · '+money(c.amount)+' / '+c.frequency+' · ages '+c.startAge+'–'+c.endAge;});
  const target=$('spending-controls').querySelector('input');if(target){target.disabled=a.spendingMode==='categories';target.value=a.desiredMonthlyIncome;}
  $('spending-result').textContent=a.spendingMode==='categories'?'Category budget enabled. Recurring annual equivalent: '+money(Core.spendingBaseline(a.spendingCategories))+' in today’s dollars. Actual totals vary with ages, repeat intervals and inflation.':'Monthly-target mode is active. Your categories are saved but do not affect withdrawals until you select Detailed categories.';
  const categoryIndexes=a.spendingCategories.map((c,i)=>c.enabled!==false&&c.amount>0?i:-1).filter(i=>i>=0);
  table($('spending-schedule'),['Year','Total spending target',...categoryIndexes.map(i=>a.spendingCategories[i].name)],projection.years.map(r=>[r.year,money(r.spendTarget),...categoryIndexes.map(i=>money(r.spendingCategories[i].amount))]));
  people().forEach((p,k)=>{const r=Core.cppHistory(p,{inflation:a.inflation});$('cpp-status-'+k).textContent=`History estimate: ${money(r.monthly)}/month at commencement (${r.claimYear}), including base ${money(r.base)}, first enhancement ${money(r.enhanced)}, second enhancement ${money(r.second)}. General dropout: ${r.generalDropoutMonths} months; caregiving: ${r.caregiverDropoutMonths}; disability: ${r.disabilityDropoutMonths}. Missing historical months: ${r.missingMonths}; forecast months: ${r.forecastMonths}. ${p.cppMethod==='history'?'Used in this projection.':'Statement amount is used in this projection.'}`;});
  table($('estate-result'),['Death year','Person','Treatment','Terminal income','Probate','Net household estate'],projection.estateEvents.map(e=>[e.year,e.name,e.rollover?'Rollover to '+e.recipient:'Deemed disposition',money(e.terminalIncome),e.probateNeedsOverride?'Enter provincial override':money(e.probate),money(e.netEstate)]));
  if(!a.estate.enabled)$('estate-result').textContent='Estate modelling is off. Enable it above to include terminal taxes in projected net worth.';
  table($('corporate-result'),['Year','Corporate tax','CDA','GRIP','Refundable tax','Dividend refunds'],projection.years.filter(r=>r.accounts.some(ac=>ac.type==='CORP')).map(r=>{
    const accounts=r.accounts.filter(ac=>ac.type==='CORP');const sum=key=>accounts.reduce((s,a)=>s+(a[key]||0),0);
    return [r.year,money(r.corporateOperatingTax+r.corporateInvestmentTax),money(sum('cda')),money(sum('grip')),money(sum('erdtoh')+sum('nrdtoh')),money(sum('corporateRefund'))];
  }));
  const warnings=[...new Set(projection.years.flatMap(r=>r.corporateWarnings))];if(warnings.length){const p=document.createElement('p');p.className='negative';p.textContent=warnings.join(' ');$('corporate-result').prepend(p);}
  $('benefits-result').textContent='Projected lifetime GIS and provincial supplements: '+money(projection.lifetimeBenefits)+'. First-year GIS: '+money(projection.years[0]?.gis||0)+'; provincial supplement: '+money(projection.years[0]?.provincialBenefits||0)+'. Use the Benefits objective in the withdrawal search to compare paths.';
}
function renderScenarioControls(){
  sandbox=clone(config);$('scenario-controls').replaceChildren();const g=grid($('scenario-controls'));
  const details={name:'My alternative',downsizeAge:70,replacementValue:500000,downsize:false};sandbox._scenario=details;
  const add=(obj,key,label,help,type,options)=>{const f=field(obj,key,label,help,type,options);const control=f.querySelector('input,select');control.onchange=()=>{obj[key]=type==='checkbox'?control.checked:type==='number'?Number(control.value):control.value;clearTimeout(sandboxTimer);sandboxTimer=setTimeout(renderSandbox,150);};g.appendChild(f);};
  add(details,'name','Scenario name','Name this alternative for saving and comparison.','text');
  people().forEach((_,k)=>{add(sandbox.incomes[k],'targetRetireAge',sandbox.incomes[k].name+': retire at','Only this sandbox changes; your workspace baseline remains unchanged.','number');add(sandbox.incomes[k],'cppStartAge',sandbox.incomes[k].name+': CPP/QPP start','Try 60 versus 70; QPP supports deferral to 72.','number');});
  add(details,'downsize','Downsize primary home','Sell the first principal residence at the chosen age and buy a mortgage-free replacement using the proceeds.','checkbox');
  add(details,'downsizeAge','Downsize at Person 1 age','Calendar year is calculated from Person 1’s birth year.','number');
  add(details,'replacementValue','Replacement home value today','Estimated value today; projected forward using the original property appreciation assumption. The purchase consumes cash and creates a replacement property.','number');
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
$('scenario-save').onclick=async()=>{try{const response=await fetch('/api/scenarios',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:sandbox._scenario.name,config:scenarioConfig()})});if(!response.ok)throw new Error('Could not save scenario');$('save-status').textContent='Scenario saved; workspace baseline unchanged.';loadSaved();}catch(error){$('save-status').textContent=error.message;}};
async function loadSaved(){try{const list=await(await fetch('/api/scenarios')).json();$('saved-scenarios').replaceChildren();list.forEach(s=>{$('saved-scenarios').append(button('Compare: '+s.name,()=>compareMetrics(projection,E.simulate(s.config),s.name,$('scenario-result'))));});}catch(error){$('saved-scenarios').textContent='Saved scenarios could not be loaded.';}}
function renderOptimizationControls(){const obj={objective};const f=field(obj,'objective','Search objective','Minimize taxes or tax minus benefits while preserving the baseline estate; alternatively maximize ending estate. The search evaluates a bounded set of multi-year schedules.','select',[{value:'tax',label:'Reduce lifetime tax'},{value:'benefits',label:'Improve tax and benefits'},{value:'estate',label:'Maximize ending estate'}]);f.querySelector('select').onchange=event=>objective=event.target.value;$('optimization-controls').replaceChildren(f);}
$('optimize').onclick=()=>{
  if(worker)worker.terminate();const id=++revision;optimized=null;$('optimize').disabled=true;$('cancel-optimize').hidden=false;$('apply-optimized').hidden=true;
  $('optimization-status').textContent='Comparing full retirement paths…';worker=new Worker('/optimization-worker.js');
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
$('apply-optimized').onclick=()=>{if(!optimized)return;config.assumptions.withdrawalStrategy=optimized.withdrawalStrategy;config.assumptions.withdrawalPlan=optimized.withdrawalPlan;$('save-status').textContent='Withdrawal plan applied in workspace. Save plan to retain it.';refresh();};
$('export-withdrawals').onclick=()=>{if(!optimized)return;const csv=[['year','rrsp_rrif','tfsa','taxable','tax','benefits','ending_net_worth'],...withdrawalRows(optimized.result)].map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));const link=document.createElement('a');link.href=url;link.download='withdrawal-plan.csv';link.click();URL.revokeObjectURL(url);};
$('compare-paydown').onclick=()=>{
  const alternative=clone(config);alternative.realEstate.forEach(p=>{if(p.extraPaymentAnnual>0){alternative.accounts.push({name:p.name+' extra investment',owner:people()[0].name,type:'TAXABLE',balance:0,growthRate:p.smithGrowthRate||5,contribAmt:p.extraPaymentAnnual,contribFreq:'yearly',contribStartYear:p.extraPaymentStart,contribEndYear:p.extraPaymentEnd,contributeInRetirement:true});p.extraPaymentAnnual=0;}});
  compareMetrics(projection,E.simulate(alternative),'Invest extra payments',$('debt-result'));
};
$('save-plan').onclick=async()=>{
  $('save-plan').disabled=true;try{
    const normalized=E.normalizeConfig(config);const result=E.simulate(normalized);
    if(result.years.length===0)throw new Error('The plan must extend into the current year.');
    const response=await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(normalized)});const body=await response.json();if(!response.ok)throw new Error(body.error||'Save failed');config=body.config||normalized;$('save-status').textContent='Plan saved.';
  }catch(error){$('save-status').textContent=error.message;}finally{$('save-plan').disabled=false;}
};
fetch('/api/config').then(r=>{if(!r.ok)throw new Error('Could not load plan');return r.json();}).then(c=>{config=E.normalizeConfig(c);render();loadSaved();}).catch(error=>$('save-status').textContent=error.message);
