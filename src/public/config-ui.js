
const E = window.RetireEngine;
const page=document.body.dataset.page||'household';
let config = null;
let settingsDirty=false;
function markSettingsDirty(){if(page==='app-config')return;settingsDirty=true;el('settings-save-status').textContent='Unsaved changes';}

const schema = {
  incomes: {
    title: 'People',
    note: 'CPP and OAS amounts are what you would receive at 65 in today\'s dollars — the engine applies the early or late adjustment, the 10% lift at 75, and inflation indexing itself. RRSP and TFSA room are your current unused amounts from your CRA notice of assessment; the engine accrues new room each year from your salary and subtracts any employer DPSP pension adjustment. Set the required HBP payment and your actual repayment budget separately. Unpaid amounts are taxable RRSP income and give no cash or deduction.',
    fixed: 2,
    fields: [
      {key:'name', label:'Name', type:'text'},
      {key:'birthYear', label:'Birth year', type:'number'},
      {key:'salary', label:'Current salary', type:'number'},
      {key:'incorporated', label:'Incorporated business owner', type:'checkbox'},
      {key:'eligibleDividends', label:'Eligible dividends /yr', type:'number'},
      {key:'nonEligibleDividends', label:'Non-eligible dividends /yr', type:'number'},
      {key:'annualDeductions', label:'Other deductible expenses /yr', type:'number'},
      {key:'pensionAdjustment', label:'DB / other pension adjustment /yr', type:'number'},
      {key:'gisEligible', label:'Eligible for GIS (Canadian resident, no sponsorship)', type:'checkbox'},
      {key:'gisIncomeOpening', label:'Prior-year GIS income (blank = estimate)', type:'number'},
      {key:'fhsaOpenYear', label:'First FHSA opened in year', type:'number'},
      {key:'fhsaRoomOpening', label:'Current FHSA participation room', type:'number'},
      {key:'fhsaLifetimeContributions', label:'FHSA lifetime contributions / transfers used', type:'number'},
      {key:'salaryGrowth', label:'Salary growth %/yr', type:'number', step:'0.1'},
      {key:'targetRetireAge', label:'Retirement age', type:'number'},
      {key:'cppBaseAt65', label:'CPP at 65 ($/mo)', type:'number'},
      {key:'cppStartAge', label:'CPP start age', type:'select', options:[60,61,62,63,64,65,66,67,68,69,70]},
      {key:'oasBaseAt65', label:'OAS at 65 ($/mo)', type:'number'},
      {key:'oasStartAge', label:'OAS start age', type:'select', options:[65,66,67,68,69,70]},
      {key:'rrspRoomOpening', label:'Unused RRSP room', type:'number'},
      {key:'tfsaRoomOpening', label:'Unused TFSA room', type:'number'},
      {key:'hbpAnnual', label:'HBP repayment /yr', type:'number'},
      {key:'hbpYears', label:'HBP years remaining', type:'number'},
      {key:'hbpRepaymentBudget', label:'Planned HBP repayment /yr', type:'number'},
      {key:'rrifConversionAge', label:'RRSP to RRIF conversion age', type:'number'}
    ]
  },
  accounts: {
    title: 'Investment accounts',
    note: 'Tick Solve to bracket on the RRSP you top up manually — the engine calculates the contribution that brings you down to the floor rate and shows it as this year\'s target instead of using what you typed. Tick Flexible on any account whose contribution the optimizer is allowed to move elsewhere — it pools all flexible contributions plus last year\'s refund and directs them to whichever RRSP has the highest marginal rate, then to TFSAs. Leave employer-matched and payroll-locked accounts unticked. Employer match is not your cash, is not deductible, and reduces next year\'s RRSP room by the same amount.',
    fields: [
      {key:'name', label:'Name', type:'text'},
      {key:'owner', label:'Owner', type:'owner'},
      {key:'type', label:'Type', type:'select', options:['RRSP','TFSA','FHSA','TAXABLE','CORP','DC']},
      {key:'balance', label:'Balance', type:'number'},
      {key:'corporateTaxRate', label:'CORP effective tax on returns %', type:'number', hint:'Use an effective rate reflecting your investment mix and refunds. Enable detailed CDA, GRIP and RDTOH tracking in the planning workspace.'},
      {key:'distributionType',label:'Non-registered distribution income',type:'select',options:['interest','eligible','non-eligible']},
      {key:'dividendType', label:'CORP distribution type', type:'select', options:['eligible','non-eligible']},
      {key:'qualifyingWithdrawalYear', label:'FHSA qualifying home purchase year (0 = none)', type:'number'},
      {key:'qualifyingWithdrawalAmount', label:'FHSA qualifying withdrawal (0 = full balance)', type:'number'},
      {key:'costBasis', label:'Cost basis (non-reg only)', type:'number'},
      {key:'growthRate', label:'Growth %/yr', type:'number', step:'0.1'},
      {key:'distributionYield', label:'Taxable yield %/yr (non-reg)', type:'number', step:'0.1'},
      {key:'contribAmt', label:'Contribution / retained business earnings', type:'number', hint:'For CORP, enter retained earnings after operating tax, salary, dividends and employer payroll costs. These are separate from personal cash flow.'},
      {key:'contribFreq', label:'Frequency', type:'select', options:['weekly','biweekly','semimonthly','monthly','yearly']},
      {key:'contribGrowth', label:'Contribution growth %/yr', type:'number', step:'0.1'},
      {key:'annualBonus', label:'Extra lump sum /yr', type:'number'},
      {key:'employerMatchPct', label:'Employer match % of salary', type:'number', step:'0.1'},
      {key:'solveToTarget', label:'Solve to bracket — amount is calculated', type:'checkbox'},
      {key:'flexible', label:'Flexible — optimizer may move it', type:'checkbox'},
      {key:'hbpAccount', label:'Receives HBP repayments', type:'checkbox'},
      {key:'reinvestTarget', label:'Receives freed-up debt payments', type:'checkbox'}
    ]
  },
  realEstate: {
    title: 'Property and debt',
    note: 'Balances amortize from the rate and payment you enter; the payoff year is only used as a cross-check and the dashboard warns you if the two disagree. Renewal rate applies from the renewal year onward. Attach a HELOC to the rental when it funded the rental, so its payment comes out of rental cash flow and its interest is deductible. Other deductible interest covers debt the app has no schedule for — set it from your T776 line 8710 when the modelled interest comes up short. ACB is purchase price plus capital improvements — it decides the capital gain if you set a sale year. Principal residence sales are exempt.',
    fields: [
      {key:'name', label:'Name', type:'text'},
      {key:'type', label:'Type', type:'select', options:['principal','rental','heloc']},
      {key:'value', label:'Estimated value', type:'number'},
      {key:'appreciation', label:'Appreciation %/yr', type:'number', step:'0.1'},
      {key:'mortgage', label:'Balance owing', type:'number'},
      {key:'interestRate', label:'Interest rate %', type:'number', step:'0.01'},
      {key:'renewalYear', label:'Renewal year', type:'number'},
      {key:'renewalRate', label:'Rate after renewal %', type:'number', step:'0.01'},
      {key:'paymentBiweekly', label:'Payment (biweekly)', type:'number', step:'0.01'},
      {key:'paymentMonthly', label:'Payment (monthly)', type:'number', step:'0.01'},
      {key:'payoffYear', label:'Expected payoff year', type:'number'},
      {key:'vacancyRate', label:'Property vacancy % (blank = household)', type:'number'},
      {key:'ownerSplit', label:'Person 1 ownership % (blank = household)', type:'number'},
      {key:'rentalName', label:'Attached rental name (blank = first rental)', type:'text'},
      {key:'ccaRate', label:'CCA declining balance rate %', type:'number'},
      {key:'grossRentMonthly', label:'Gross rent /mo', type:'number'},
      {key:'annualPropertyTax', label:'Property tax /yr', type:'number'},
      {key:'annualInsurance', label:'Insurance /yr', type:'number'},
      {key:'annualMaintenance', label:'Maintenance /yr', type:'number'},
      {key:'otherAnnualInterest', label:'Other deductible interest /yr', type:'number'},
      {key:'acb', label:'ACB (price + improvements)', type:'number'},
      {key:'buildingAcb',label:'Building cost excluding land',type:'number'},
      {key:'buildingSalePercent',label:'Building share of sale proceeds %',type:'number'},
      {key:'saleYear', label:'Sale year (0 = never)', type:'number'},
      {key:'sellingCostPct', label:'Selling costs %', type:'number', step:'0.1'},
      {key:'uccPool', label:'CCA pool remaining (UCC)', type:'number'},
      {key:'ccaEnabled', label:'Claim CCA each year', type:'checkbox'},
      {key:'attachToRental', label:'Funds the rental', type:'checkbox'},
      {key:'interestDeductible', label:'Interest deductible', type:'checkbox'},
      {key:'reinvestOnPayoff', label:'Invest the payment once paid off', type:'checkbox'}
    ]
  },
  dbPensions: {
    title:'Pensions (optional)',
    note:'Add a workplace pension only if you have one. Enter the monthly lifetime amount from your pension statement, then any temporary bridge and annual increases. You can link commencement to retirement and add estimates for different start ages. For a defined contribution (DC) plan, add its balance under Investment accounts. Existing HOOPP estimates appear here as a named plan.',
    fields:[
      {key:'name',label:'Plan name',type:'text'}, {key:'owner',label:'Member',type:'owner'},
      {key:'startAge',label:'Start age',type:'number'}, {key:'lifetime',label:'Lifetime pension /mo',type:'number'},
      {key:'bridge',label:'Bridge /mo',type:'number'}, {key:'bridgeCutoffAge',label:'Bridge ends at age',type:'number'},
      {key:'indexingRate',label:'Indexing %/yr',type:'number',step:'0.1'},
      {key:'indexBeforeStart',label:'Index amounts before commencement',type:'checkbox'},
      {key:'followsRetirement',label:'Start when member retires',type:'checkbox'}
    ]
  },

};

const assumptionFields = [
  {key:'householdType',label:'Household',type:'select',options:['single','couple']},
  {key:'province',label:'Province / territory',type:'select',options:Object.keys(E.PROVINCES)},
  {key:'desiredMonthlyIncome', label:'After-tax spending $/mo', type:'number', hint:"Today's dollars. The engine grosses up withdrawals to hit this after tax."},
  {key:'inflation', label:'Inflation %/yr', type:'number', step:'0.1'},
  {key:'rentalIncomeInflation', label:'Rent growth %/yr', type:'number', step:'0.1'},
  {key:'vacancyRate', label:'Vacancy and credit loss %', type:'number', step:'0.5'},
  {key:'rentalOwnerSplit', label:'Rental income taxed to person 1 (%)', type:'number'},
  {key:'targetDeathAge', label:'Plan to age', type:'number'},
  {key:'withdrawalStrategy', label:'Withdrawal order', type:'select', options:['tfsa-first','rrsp-first','taxable-first','min-tax','oas-smart']},
  {key:'rrspMinMarginalRate', label:'RRSP floor marginal rate %', type:'number', step:'1', hint:'The optimizer contributes to an RRSP only while that person\'s marginal rate is at or above this. Below it, TFSA wins.'},
  {key:'returnMode', label:'Market assumption', type:'select', options:['deterministic','conservative','bad-decade']},
  {key:'conservativeDelta', label:'Conservative haircut %', type:'number', step:'0.1'},
  {key:'badDecadeDelta', label:'Bad-decade haircut %', type:'number', step:'0.1'},
  {key:'mcRuns', label:'Monte Carlo runs', type:'number'},
  {key:'mcVolatility', label:'Return volatility %', type:'number', step:'0.5'},
  {key:'contributionSlice', label:'Optimizer step size $', type:'number', hint:'Smaller is more precise and slower. $500 is plenty.'}
];

const assumptionToggles = [
  {key:'gisEnabled',label:'Include estimated GIS for eligible OAS recipients'},
  {key:'optimizeContributions', label:'Optimize where flexible contributions go'},
  {key:'reinvestRefund', label:'Reinvest RRSP refunds the following year'},
  {key:'spendingIncludesDebtPayments', label:'Spending goal already covers home mortgage and HELOC payments'},
  {key:'applySpendingBeforeRetirement', label:'Apply the spending goal before anyone retires'},
  {key:'optimizePensionSplit', label:'Split eligible pension income between spouses'},
  {key:'reinvestSurplus', label:'Reinvest surplus cash (forced RRIF income) into TFSA then non-registered'},
  {key:'reinvestPayoffPayments', label:'Invest freed-up payments after a debt is paid off'},
];

const el = id => document.getElementById(id);
function toast(msg, isErr) {
  const t = el('toast'); t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : '');
  setTimeout(() => t.className = 'toast', 2400);
}


let wizardDraft = null, wizardStep = 0;
const wizardSteps = ['Household','Province','Ages','Income and business','Existing balances','Real estate and review'];
function openWizard() {
  if(!config){toast('Load or import a saved plan before opening setup.',true);return;}
  wizardDraft = structuredClone(config); wizardStep = 0;
  if (config.onboardingComplete === false) {
    wizardDraft.accounts = []; wizardDraft.realEstate = []; wizardDraft.dbPensions = [];
    wizardDraft.assumptions.childcare = {childrenBirthYears:[],items:[]};
    wizardDraft.incomes.forEach((p,i) => Object.assign(p,{name:'Person '+(i+1), salary:0, hooppStartAge:null,
      pension2Amount:0,hbpAnnual:0,hbpRepaymentBudget:0,hbpYears:0,rrspRoomOpening:0,tfsaRoomOpening:0}));
  }
  if (window.parent !== window) document.body.classList.add('wizard-only');
  el('setup-wizard').showModal(); renderWizard();
}
function closeWizard() {
  el('setup-wizard').close(); wizardDraft = null;
  if (window.parent !== window) window.parent.postMessage({type:'wizard-closed'},location.protocol==='file:'?'*':location.origin);
}
function wizardPeople() { return wizardDraft.incomes.slice(0,wizardDraft.assumptions.householdType === 'single' ? 1 : 2); }
function wizardField(row, obj, f) {
  if (f.type === 'owner') f = {...f,type:'select',options:wizardPeople().map(p=>p.name)};
  row.appendChild(field(f,obj[f.key],v => {obj[f.key]=v;if(f.key==='type')renderWizard();}));
}
function renderWizard() {
  const body = el('wizard-body'); body.replaceChildren(); el('wizard-error').textContent='';
  el('wizard-progress').textContent = `Step ${wizardStep+1} of 6: ${wizardSteps[wizardStep]}`;
  el('wizard-back').hidden = wizardStep===0; el('wizard-next').textContent = wizardStep===5 ? 'Save setup' : 'Next';
  const row = document.createElement('div'); row.className='item-row'; body.appendChild(row);
  if (wizardStep===0) wizardField(row,wizardDraft.assumptions,{key:'householdType',label:'Household type',type:'select',options:['single','couple']});
  if (wizardStep===1) wizardField(row,wizardDraft.assumptions,{key:'province',label:'Province / territory',type:'select',options:Object.keys(E.PROVINCES)});
  if (wizardStep===2 || wizardStep===3) wizardPeople().forEach((p,i) => {
    const section=document.createElement('div'); section.className='item-row'; const heading=document.createElement('strong'); heading.textContent=p.name; section.appendChild(heading); body.appendChild(section);
    const fields=wizardStep===2 ? [
      {key:'name',label:'Name',type:'text'}, {key:'birthYear',label:'Birth year',type:'number'},
      {key:'targetRetireAge',label:'Retirement age',type:'number'}
    ] : schema.incomes.fields.filter(f=>['salary','salaryGrowth','incorporated','eligibleDividends','nonEligibleDividends','rrspRoomOpening','tfsaRoomOpening'].includes(f.key));
    fields.forEach(f=> {
      if(f.key==='name') section.appendChild(field(f,p.name,v=> {
        ['accounts','dbPensions'].forEach(key=>wizardDraft[key].forEach(a=>{if(a.owner===p.name)a.owner=v;})); p.name=v;
      })); else wizardField(section,p,f);
    });
    if(wizardStep===3) {
      const note=document.createElement('p'); note.textContent='Enter salary and actual cash dividends separately. Salary creates RRSP room and CPP/QPP costs. Dividends shown here come from business earnings outside the investment accounts; CORP withdrawals are calculated separately.'; body.appendChild(note);
    }
  });
  if (wizardStep===4 || wizardStep===5) {
    const cat=wizardStep===4?'accounts':'realEstate';
    const keys=wizardStep===4 ? ['name','owner','type','balance','costBasis','growthRate','corporateTaxRate'] : ['name','type','value','mortgage','interestRate','paymentMonthly','grossRentMonthly','vacancyRate','uccPool','ccaEnabled'];
    const note=document.createElement('p'); note.textContent=wizardStep===4 ? 'Add each existing RRSP, TFSA, FHSA, taxable, corporate, or DC account. For an existing FHSA, update its opening year, unused room and lifetime contributions below.' : 'Add each property or debt. You can set sale dates, ownership and attached rental debt in Configure after setup. Saving applies this household, province, people and balances.'; body.appendChild(note);
    wizardDraft[cat].forEach((obj,i)=> {
      if(cat==='accounts' && !wizardPeople().some(p=>p.name===obj.owner) && obj.owner!=='Joint') return;
      const section=document.createElement('div'); section.className='item-row'; body.appendChild(section);
      const more=document.createElement('div');more.className='item-row';
      schema[cat].fields.filter(f=>keys.includes(f.key)).filter(f=>!f.accountTypes||f.accountTypes.includes(obj.type)).forEach(f=>wizardField(['name','owner','type','balance','value','mortgage'].includes(f.key)?section:more,obj,f));
      if(more.children.length)section.append(advanced(more));
      const remove=document.createElement('button'); remove.className='btn danger';remove.textContent='Remove'; remove.onclick=()=>{wizardDraft[cat].splice(i,1);renderWizard();};section.appendChild(remove);
    });
    const add=document.createElement('button');add.className='btn ghost';add.textContent=wizardStep===4?'Add account':'Add property / debt';
    add.onclick=()=>{wizardDraft[cat].push(wizardStep===4 ? {name:'Account',owner:wizardPeople()[0].name,type:'TFSA',balance:0,growthRate:5} : {name:'Property '+(wizardDraft[cat].length+1),type:'principal',value:0,mortgage:0,interestRate:4,paymentMonthly:0,grossRentMonthly:0});renderWizard();};body.appendChild(add);
    if(wizardStep===4&&wizardDraft.accounts.some(a=>a.type==='FHSA'&&a.enabled!==false)) wizardPeople().forEach(p=>{
      const section=document.createElement('div');section.className='item-row';const title=document.createElement('strong');title.textContent=p.name+' FHSA history';section.appendChild(title);body.appendChild(section);
      schema.incomes.fields.filter(f=>f.key.startsWith('fhsa')).forEach(f=>wizardField(section,p,f));
    });
    if(wizardStep===5) {
      const heading=document.createElement('h3'); heading.textContent='Pensions (optional)';body.appendChild(heading);
      wizardDraft.dbPensions.forEach(plan=>{
        const section=document.createElement('div');section.className='item-row';body.appendChild(section);
        const more=document.createElement('div');more.className='item-row';
        pensionFields(plan,wizardPeople(),section,more);section.append(advanced(more));
        const remove=document.createElement('button');remove.className='btn danger';remove.textContent='Remove pension';remove.onclick=()=>{wizardDraft.dbPensions.splice(wizardDraft.dbPensions.indexOf(plan),1);renderWizard();};section.appendChild(remove);
      });
      const addPension=document.createElement('button');addPension.className='btn ghost';addPension.textContent='Add pension';addPension.onclick=()=>{wizardDraft.dbPensions.push(newPension(wizardPeople()[0].name));renderWizard();};body.appendChild(addPension);
      const review=document.createElement('p');review.textContent=`${wizardDraft.assumptions.householdType} | ${E.PROVINCES[wizardDraft.assumptions.province].name} | ${wizardPeople().map(p=>p.name+' (born '+p.birthYear+')').join(', ')} | ${wizardDraft.accounts.length} accounts`;body.appendChild(review);
    }
  }
}
async function wizardMove(direction) {
  if(direction<0){wizardStep--;renderWizard();return;}
  if(wizardPeople().some(p=>!p.name.trim() || !Number.isFinite(+p.birthYear) || +p.birthYear<1900 || +p.birthYear>new Date().getFullYear()-18)) {el('wizard-error').textContent='Enter a name and a valid adult birth year for each person.';return;}
  if(wizardPeople().length===2 && wizardPeople()[0].name===wizardPeople()[1].name){el('wizard-error').textContent='Use distinct names so account ownership stays unambiguous.';return;}
  if(wizardStep<5){wizardStep++;renderWizard();return;}
  el('wizard-next').disabled=true;
  try {
    wizardDraft.onboardingComplete=true;
    const normalized=E.normalizeConfig(wizardDraft);E.simulate(normalized);
    const res=await AppStorage.fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(normalized)});
    const data=await res.json();if(!res.ok)throw new Error(data.error || 'Could not save setup');
    config=data.config;settingsDirty=false;el('settings-save-status').textContent='All changes saved';render();closeWizard();toast('Setup saved');
  } catch(err){el('wizard-error').textContent=err.message;}
  finally{el('wizard-next').disabled=false;}
}

async function init() {
  const response=await AppStorage.fetch('/api/config'),body=await response.json();
  if(!response.ok)throw new Error(body.error||'Could not load your saved plan.');
  config = E.normalizeConfig(body);
  config.assumptions.spendingMode='target';
  render();
  if (config.onboardingComplete === false || new URLSearchParams(location.search).has('wizard')) openWizard();
}

function advanced(content,label='Advanced Options') {
  const d=document.createElement('details');d.className='advanced-options';const title=document.createElement('summary');title.textContent=label;d.append(title,content);return d;
}
function render() {
  el('save-settings').disabled=false;
  const editor=el('editor');editor.replaceChildren();
  const titles={household:'Household',accounts:'Accounts','plan-settings':'Plan settings',employment:'Employment',properties:'Properties',pensions:'Pensions','app-config':'App Config'};
  el('page-title').textContent=titles[page]||'Household';document.title=el('page-title').textContent+' - Retirement';
  if(page==='app-config'){el('save-settings').hidden=true;el('settings-save-status').textContent='Appearance saves automatically';editor.append(systemSection(),backupSection());queueMicrotask(loadBackups);return;}
  if(page!=='accounts')editor.appendChild(assumptionsSection());
  if(['household','accounts','employment','pensions','plan-settings'].includes(page))editor.appendChild(listSection('incomes'));
  if(page==='household')editor.appendChild(childcareSection());
  if(page==='accounts')editor.prepend(listSection('accounts'));
  if(page==='plan-settings')editor.append(advanced(phasesSection(),'Spending changes over time'),advanced(estateSection(),'Estate and survivor settings'));
  if(page==='properties'){editor.appendChild(listSection('realEstate'));PlanComparison.mount(editor,{task:'rental',getConfig:()=>config,onApply:c=>{config=E.normalizeConfig(c);markSettingsDirty();render();toast('Sale and CCA settings applied. Save changes to keep them.');}});editor.append(advanced(debtComparisonSection(),'Compare extra debt payments with investing'));}
  if(page==='pensions'){editor.appendChild(listSection('dbPensions'));editor.appendChild(advanced(earningsSection(),'CPP / QPP earnings history'));}
}

let fieldSequence = 0;
function field(f, value, onchange) {
  if (!f.hint && !SettingHelp.text[f.key]) throw new Error('Missing setting help: '+f.key+' '+f.label);
  const fieldId = 'field-' + (++fieldSequence);
  const g = document.createElement('div');
  g.className = 'input-group' + (f.type === 'checkbox' ? ' check' : '');
  if (f.type === 'checkbox') {
    const inp = document.createElement('input');
    inp.id = fieldId;
    inp.type = 'checkbox'; inp.checked = value === true;
    inp.onchange = e => onchange(e.target.checked);
    const lab = document.createElement('label'); lab.textContent = f.label; lab.htmlFor = fieldId;
    g.append(inp, lab);
    SettingHelp.attach(inp, f.hint || SettingHelp.text[f.key]);
    return g;
  }
  const lab = document.createElement('label'); lab.textContent = f.label; lab.htmlFor = fieldId; g.appendChild(lab);
  if (f.type === 'select' || f.type === 'owner') {
    const sel = document.createElement('select');
    sel.id = fieldId;
    const opts = f.type === 'owner' ? [...config.incomes.slice(0, config.assumptions.householdType === 'single' ? 1 : 2).map(p=>p.name), ...(f.label === 'Member' ? [] : ['Joint'])] : f.options;
    opts.forEach(o => {
      const opt = document.createElement('option');
      const names={single:'One adult',couple:'Two adults',TAXABLE:'Non-registered investments',CORP:'Company investments',DC:'Workplace pension account',principal:'Primary residence',rental:'Rental property',heloc:'Line of credit (HELOC)',deterministic:'Expected returns',conservative:'Lower returns', 'bad-decade':'Poor first decade'};
      opt.value = o; opt.textContent = names[o]||String(o);
      if (String(value) === String(o)) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.onchange = e => onchange(e.target.value);
    g.appendChild(sel);
  } else {
    const inp = document.createElement('input');
    inp.id = fieldId;
    inp.type = f.type; if (f.step) inp.step = f.step;
    inp.value = (value === undefined || value === null) ? '' : value;
    inp.onchange = e => onchange(f.type === 'number' ? (e.target.value === '' ? '' : parseFloat(e.target.value)) : e.target.value);
    g.appendChild(inp);
  }
  SettingHelp.attach(g.querySelector('input,select'), f.hint || SettingHelp.text[f.key]);

  return g;
}

function assumptionsSection() {
  const sections={household:['householdType'],'plan-settings':['province','desiredMonthlyIncome','targetDeathAge','inflation','returnMode','conservativeDelta','badDecadeDelta','mcRuns','mcVolatility','spendingIncludesDebtPayments','applySpendingBeforeRetirement','reinvestSurplus'],employment:['rrspMinMarginalRate','rrspGoalCompletion','optimizeContributions','reinvestRefund','contributionSlice'],properties:['rentalIncomeInflation','vacancyRate','rentalOwnerSplit','reinvestPayoffPayments'],pensions:['optimizePensionSplit','gisEnabled']};
  const sec=document.createElement('div');sec.className='section';const title=document.createElement('h2');title.textContent={household:'Household type','plan-settings':'Spending and assumptions',employment:'Savings and RRSP goals',properties:'Property defaults',pensions:'Pension and benefit settings'}[page];sec.append(title);
  const row=document.createElement('div');row.className='item-row';const more=document.createElement('div');more.className='item-row';
  [...assumptionFields,...assumptionToggles.map(f=>({...f,type:'checkbox'}))].filter(f=>(sections[page]||[]).includes(f.key)).forEach(f=>{
    const target=['householdType','province','desiredMonthlyIncome','rrspGoalCompletion','optimizeContributions','gisEnabled','optimizePensionSplit'].includes(f.key)?row:more;
    target.append(field(f,config.assumptions[f.key],v=>{config.assumptions[f.key]=v;if(f.key==='householdType')render();}));
  });
  if(row.children.length)sec.append(row);if(more.children.length)sec.append(advanced(more));return sec;
}

function phasesSection() {
  const sec = document.createElement('div'); sec.className = 'section';
  sec.innerHTML = '<h2>Spending phases</h2><div class="notice">Each phase applies a percentage of the base spending goal up to the age shown, matched against the older spouse\'s age. Leave the last phase at 999 so it covers the rest of the plan.</div>';
  config.assumptions.spendingPhases.forEach((p, i) => {
    const row = document.createElement('div'); row.className = 'item-row';
    row.appendChild(field({key:'untilAge',label:'Through age', type:'number'}, p.untilAge, v => p.untilAge = v));
    row.appendChild(field({key:'factor',label:'% of spending goal', type:'number'}, p.factor, v => p.factor = v));
    const del = document.createElement('button'); del.className = 'btn danger'; del.textContent = 'Remove';
    del.onclick = () => { config.assumptions.spendingPhases.splice(i,1); render(); };
    row.appendChild(del);
    sec.appendChild(row);
  });
  const add = document.createElement('button'); add.className = 'btn ghost'; add.textContent = 'Add phase';
  add.onclick = () => { config.assumptions.spendingPhases.push({untilAge:999, factor:100}); render(); };
  sec.appendChild(add);
  return sec;
}

function childcareSection() {
  const cc = config.assumptions.childcare;
  const sec = document.createElement('div'); sec.className = 'section';
  sec.innerHTML = '<h2>Children</h2><div class="notice">Claimed automatically by the spouse with lower income before the childcare deduction, capped at the CRA limits ($8,000 per child under 7, $5,000 ages 7 to 16) and at two thirds of that spouse\'s earned income. Each cost line runs from its start year to its end year, dropping by the decline amount every year.</div>';

  const children=document.createElement('div');children.className='children-list';sec.append(children);
  cc.childrenBirthYears.forEach((year,i)=>{
    const row=document.createElement('div');row.className='item-row child-row';
    row.append(field({key:'birthYear',label:'Child '+(i+1)+' birth year',type:'number'},year,v=>cc.childrenBirthYears[i]=v));
    const remove=document.createElement('button');remove.className='btn ghost';remove.textContent='Remove child';remove.onclick=()=>{cc.childrenBirthYears.splice(i,1);render();};row.append(remove);children.append(row);
  });
  if(!cc.childrenBirthYears.length){const note=document.createElement('p');note.className='inline-help';note.textContent='No children added. Add their birth years to include childcare in your plan.';sec.append(note);}
  const addChild=document.createElement('button');addChild.className='btn ghost';addChild.textContent='Add child';addChild.onclick=()=>{cc.childrenBirthYears.push(new Date().getFullYear());render();};sec.append(addChild);

  const costs=document.createElement('div');
  cc.items.forEach((it, i) => {
    const row = document.createElement('div'); row.className = 'item-row';
    row.appendChild(field({key:'name',label:'Cost', type:'text'}, it.name, v => it.name = v));
    row.appendChild(field({key:'amount',label:'Amount /yr', type:'number'}, it.amount, v => it.amount = v));
    row.appendChild(field({key:'startYear',label:'Start year', type:'number'}, it.startYear, v => it.startYear = v));
    row.appendChild(field({key:'endYear',label:'End year', type:'number'}, it.endYear, v => it.endYear = v));
    row.appendChild(field({key:'declinePerYear',label:'Decline /yr', type:'number'}, it.declinePerYear, v => it.declinePerYear = v));
    const del = document.createElement('button'); del.className = 'btn danger'; del.textContent = 'Remove';
    del.onclick = () => { cc.items.splice(i,1); render(); };
    row.appendChild(del);
    costs.appendChild(row);
  });
  const add = document.createElement('button'); add.className = 'btn ghost'; add.textContent = 'Add cost';
  add.onclick = () => { cc.items.push({name:'New cost', amount:0, startYear:new Date().getFullYear(), endYear:new Date().getFullYear(), declinePerYear:0}); render(); };
  costs.appendChild(add);sec.appendChild(advanced(costs,'Childcare expenses'));
  return sec;
}

function personFieldVisible(key){
  if(key.startsWith('fhsa')&&!config.accounts.some(a=>a.type==='FHSA'&&a.enabled!==false))return false;
  const employment=['salary','salaryGrowth','incorporated','eligibleDividends','nonEligibleDividends','annualDeductions','pensionAdjustment'];
  const pension=['cppBaseAt65','cppStartAge','cppPlan','oasBaseAt65','oasStartAge','gisEligible','gisIncomeOpening','gainsEligible','rrifConversionAge'];
  if(page==='household')return ['name','birthYear'].includes(key);
  if(page==='plan-settings')return key==='targetRetireAge';
  if(page==='accounts')return ['rrspRoomOpening','tfsaRoomOpening','hbpAnnual','hbpYears','hbpRepaymentBudget','fhsaOpenYear','fhsaRoomOpening','fhsaLifetimeContributions'].includes(key);
  if(key==='name')return true;if(page==='employment')return employment.includes(key);if(page==='pensions')return pension.includes(key);
  return !employment.includes(key)&&!pension.includes(key);
}
function listSection(cat) {
  const spec=schema[cat],sec=document.createElement('div');sec.className='section';sec.dataset.category=cat;
  const h=document.createElement('h2');h.textContent=cat==='incomes'?({household:'People',accounts:'Contribution room and home buyer repayments','plan-settings':'Retirement ages',employment:'Work income',pensions:'Government pensions'}[page]):spec.title;sec.append(h);
  if(cat==='dbPensions')sec.id='pensions';
  const core={accounts:['name','owner','type','balance'],realEstate:['name','ownerSplit','type','value','mortgage'],dbPensions:['name','owner','startAge','lifetime'],incomes:page==='household'?['name','birthYear']:page==='accounts'?['rrspRoomOpening','tfsaRoomOpening']:page==='plan-settings'?['targetRetireAge']:page==='employment'?['name','salary','incorporated']:['name','cppBaseAt65','cppStartAge','oasBaseAt65','oasStartAge']};
  config[cat].forEach((item,i)=>{
    if(config.assumptions.householdType==='single'&&((cat==='incomes'&&i===1)||(['accounts','dbPensions'].includes(cat)&&item.owner===config.incomes[1].name)))return;
    if(cat==='accounts'&&item.type==='CORP')Object.entries({useCDA:true,integratedCorporate:false,businessSmallRate:12.2,businessGeneralRate:26.5,capitalReturnShare:50,realizationRate:25}).forEach(([key,value])=>item[key]??=value);
    if(cat==='dbPensions')item.survivorPercent??=60;
    const wrapper=document.createElement('div');wrapper.className='setting-record';
    if(cat==='incomes'&&['accounts','plan-settings'].includes(page)){const title=document.createElement('h3');title.textContent=item.name;wrapper.append(title);}const row=document.createElement('div');row.className='item-row core-fields';const more=document.createElement('div');more.className='item-row advanced-fields';
    (cat==='dbPensions'?[]:spec.fields).filter(f=>cat!=='incomes'||personFieldVisible(f.key)).filter(f=>!f.accountTypes||f.accountTypes.includes(item.type)).forEach(f=>{
      if(f.key==='cppStartAge'&&item.cppPlan==='QPP')f={...f,options:Array.from({length:13},(_,k)=>60+k)};
      const node=field(f,item[f.key],v=>{
        if(cat==='incomes'&&f.key==='name'){const old=item.name;['accounts','dbPensions'].forEach(key=>config[key].forEach(a=>{if(a.owner===old)a.owner=v;}));}
        item[f.key]=v;if(f.key==='type'||f.key==='cppPlan')render();
      });node.dataset.setting=f.key;(core[cat].includes(f.key)?row:more).appendChild(node);
    });
    if(cat==='dbPensions')pensionFields(item,config.incomes.slice(0,config.assumptions.householdType==='single'?1:2),row,more);
    wrapper.append(row);if(more.children.length)wrapper.append(advanced(more));
    if(!spec.fixed){const del=document.createElement('button');del.className='btn ghost';del.textContent='Remove';del.onclick=()=>{config[cat].splice(i,1);render();};wrapper.append(del);}
    sec.append(wrapper);
  });
  if(!spec.fixed){const add=document.createElement('button');add.className='btn ghost';add.textContent=cat==='dbPensions'?'Add pension':cat==='accounts'?'Add account':'Add property or debt';add.onclick=()=>{config[cat].push(cat==='dbPensions'?newPension(config.incomes[0].name):cat==='accounts'?{name:'New account',owner:config.incomes[0].name,type:'TFSA',balance:0,growthRate:5}:{name:'New property',type:'principal',ownerSplit:100,value:0,mortgage:0});render();};sec.append(add);}
  return sec;
}

function newPension(owner) {
  return {name:'Workplace pension',owner,startAge:65,lifetime:0,bridge:0,bridgeCutoffAge:65,indexingRate:0,indexBeforeStart:false,followsRetirement:false,tiers:[]};
}
function pensionFields(plan, people, row, more) {
  const groups={};
  const startSpec=schema.dbPensions.fields.find(f=>f.key==='startAge');
  const startAge=()=>plan.followsRetirement ? (people.find(p=>p.name===plan.owner)||people[0]).targetRetireAge : plan.startAge;
  const estimates=()=>[...(plan.tiers||[])].sort((a,b)=>a.startAge-b.startAge);
  const amounts=()=>plan.tiers?.length ? E.pensionEstimate(estimates(),+startAge()) : plan;
  function sync() {
    const tiers=estimates(),age=startAge(),linked=plan.followsRetirement;
    const spec={...startSpec,hint:linked?'Payments start at the member’s retirement age. Turn off “Start when member retires” in Advanced Options to choose a different age.':tiers.length?'Choose an age estimate from your pension statement. The monthly amounts update together.':startSpec.hint};
    if(tiers.length)Object.assign(spec,{type:'select',options:[...new Set(tiers.map(t=>+t.startAge).concat(+age))].sort((a,b)=>a-b)});
    const group=field(spec,age,v=>{plan.startAge=+v;Object.assign(plan,{lifetime:amounts().lifetime,bridge:amounts().bridge});sync();});
    group.dataset.setting='startAge';
    const control=group.querySelector('input,select');control.disabled=!!linked;
    if(tiers.length)Array.from(control.options).forEach(option=>{
      const amount=E.pensionEstimate(tiers,+option.value);
      const estimated=tiers.some(t=>+t.startAge===+option.value)?'':' (estimated)';
      option.textContent=`Age ${option.value}${estimated} — ${money(amount.lifetime)}/mo`;
    });
    const focused=groups.startAge.contains(document.activeElement);
    groups.startAge.replaceWith(group);groups.startAge=group;if(focused)control.focus();
    ['lifetime','bridge'].forEach(key=>{
      const input=groups[key].querySelector('input');input.readOnly=tiers.length>0;input.value=amounts()[key];
      groups[key].querySelector('.inline-help').textContent=tiers.length?'Calculated for the start age above. Edit your statement amounts under Pension estimates in Advanced Options.':schema.dbPensions.fields.find(f=>f.key===key).hint||SettingHelp.text[key];
    });
  }
  function money(value){return Number(value||0).toLocaleString('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:2});}
  schema.dbPensions.fields.forEach(f=>{
    if(f.type==='owner')f={...f,type:'select',options:people.map(p=>p.name)};
    const group=field(f,plan[f.key],v=>{plan[f.key]=v;if(['owner','followsRetirement'].includes(f.key))sync();});
    group.dataset.setting=f.key;groups[f.key]=group;
    (['name','owner','startAge','lifetime'].includes(f.key)?row:more).append(group);
  });
  more.append(pensionTiers(plan,()=>{
    if(plan.tiers?.length){const amount=amounts();plan.lifetime=amount.lifetime;plan.bridge=amount.bridge;}
    sync();
  }));
  sync();
}
function pensionTiers(plan, changed) {
  const section=document.createElement('details');section.style.width='100%';
  section.className='pension-estimates';
  section.open=(plan.tiers || []).length > 0;
  const summary=document.createElement('summary');section.appendChild(summary);
  const note=document.createElement('p');note.textContent='Copy the ages and monthly amounts from your pension statement, then choose one in the Start age dropdown. If payments follow retirement, the calculator estimates amounts between these ages and uses the nearest estimate outside this range.';section.appendChild(note);
  const rows=document.createElement('div');section.append(rows);
  function drawRows(){
  rows.replaceChildren();summary.textContent='Pension estimates at different ages ('+(plan.tiers||[]).length+')';
  (plan.tiers || []).forEach((tier,i)=>{
    const row=document.createElement('div');row.className='item-row';
    ['startAge','lifetime','bridge'].forEach(key=>row.appendChild(field(schema.dbPensions.fields.find(f=>f.key===key),tier[key],v=>{
      const selected=+plan.startAge===+tier.startAge;tier[key]=v;
      if(key==='startAge'&&selected)plan.startAge=+v;
      changed();
    })));
    const remove=document.createElement('button');remove.className='btn danger';remove.textContent='Remove estimate';remove.onclick=()=>{
      changed();plan.tiers.splice(i,1);changed();drawRows();
    };row.appendChild(remove);rows.appendChild(row);
  });
  }
  drawRows();
  const add=document.createElement('button');add.className='btn ghost';add.textContent='Add age estimate';add.onclick=()=>{
    const tiers=plan.tiers||=[];let age=+plan.startAge||65;while(tiers.some(t=>+t.startAge===age))age++;
    tiers.push({startAge:age,lifetime:plan.lifetime||0,bridge:plan.bridge||0});changed();drawRows();section.open=true;
  };section.appendChild(add);
  return section;
}

function backupSection() {
  const sec = document.createElement('div'); sec.className = 'section';
  sec.innerHTML = '<h2>Backups</h2><div class="notice">A backup is written automatically before every save, and the 30 most recent are kept. Restoring replaces the live configuration immediately.</div><div id="backup-list">Loading…</div>';
  return sec;
}

async function loadBackups() {
  if(!el('backup-list'))return;
  const list = await (await AppStorage.fetch('/api/backups')).json();
  const box = el('backup-list');
  if (!box) return;
  box.innerHTML = list.length ? '' : '<div style="color:var(--muted);font-size:.85rem">No backups yet.</div>';
  list.forEach(b => {
    const row = document.createElement('div'); row.className = 'backup-row';
    const filename=document.createElement('span'),size=document.createElement('span');filename.textContent=b.file;size.textContent=(b.size/1024).toFixed(1)+' kB';size.style.color='var(--muted)';row.append(filename,size);
    const btn = document.createElement('button'); btn.className = 'btn ghost'; btn.textContent = 'Restore';
    btn.onclick = async () => {
      if (!confirm('Replace the live configuration with ' + b.file + '?')) return;
      const r = await (await AppStorage.fetch('/api/backups/restore', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({file:b.file})})).json();
      if (r.ok) { config = r.config; render(); loadBackups(); toast('Configuration restored'); }
      else toast('Restore failed', true);
    };
    row.appendChild(btn);
    box.appendChild(row);
  });
}

async function save() {
  const button=el('save-settings');button.disabled=true;
  try{
    delete config.assumptions.withdrawalPlan;
    const saved=await AppStorage.save(config);
    config=saved;settingsDirty=false;render();loadBackups();
    el('settings-save-status').textContent='All changes saved';toast('Changes saved and projection updated');
  }catch(error){el('settings-save-status').textContent='Not saved: '+error.message;toast(error.message,true);}
  finally{button.disabled=false;}
}

function exportConfig() {
  const blob = new Blob([JSON.stringify(config, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'retirement-config-' + new Date().toISOString().slice(0,19).replace(/[:T]/g,'-') + '.json';
  a.click(); URL.revokeObjectURL(a.href);
}

function importConfig(evt) {
  const file = evt.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      const res = await AppStorage.fetch('/api/config', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(parsed)});
      const body = await res.json();
      if (!body.success) throw new Error(body.error || 'rejected');
      config = body.config; render(); loadBackups(); toast('Configuration imported');
    } catch (e) { toast('That file is not a valid configuration', true); }
    evt.target.value = '';
  };
  reader.readAsText(file);
}

async function backupNow() {
  const r = await (await AppStorage.fetch('/api/backup', {method:'POST'})).json();
  if (r.ok) { loadBackups(); toast('Backed up to ' + r.file); } else toast('Backup failed', true);
}

el('setup-wizard').addEventListener('cancel',event=>{event.preventDefault();closeWizard();});
configureSettingsSchema();
function receiveSettings(c){config=E.normalizeConfig(c);config.assumptions.spendingMode='target';settingsDirty=false;el('settings-save-status').textContent='All changes saved';render();}
AppStorage.bindState(()=>config,receiveSettings);
AppStorage.subscribe(c=>{if(settingsDirty){el('settings-save-status').textContent='The saved plan changed in another window. Your unsaved edits are kept here.';return;}receiveSettings(c);});
el('editor').addEventListener('input',event=>{if(!event.target.closest('.comparison-tool'))markSettingsDirty();});
el('editor').addEventListener('change',event=>{if(!event.target.closest('.comparison-tool'))markSettingsDirty();});
el('editor').addEventListener('click',event=>{if(event.target.closest('button')&&/^(Add|Remove|Use these earnings)/.test(event.target.textContent))markSettingsDirty();});
el('save-settings').disabled=true;
init().catch(error=>{el('settings-save-status').textContent=error.message;el('save-settings').disabled=true;toast(error.message,true);});
