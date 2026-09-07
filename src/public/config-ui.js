
const E = window.RetireEngine;
const page=document.body.dataset.page||'household';
let config = {};

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
        schema.dbPensions.fields.forEach(f=>wizardField(section,plan,f));
        section.appendChild(pensionTiers(plan,renderWizard));
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
    config=data.config;render();closeWizard();toast('Setup saved');
  } catch(err){el('wizard-error').textContent=err.message;}
  finally{el('wizard-next').disabled=false;}
}

async function init() {
  config = E.normalizeConfig(await (await AppStorage.fetch('/api/config')).json());
  config.assumptions.spendingMode='target';
  render();
  if(page==='app-config')loadBackups();
  if (config.onboardingComplete === false || new URLSearchParams(location.search).has('wizard')) openWizard();
}

function advanced(content,label='Advanced Options') {
  const d=document.createElement('details');d.className='advanced-options';const title=document.createElement('summary');title.textContent=label;d.append(title,content);return d;
}
function render() {
  const editor=el('editor');editor.replaceChildren();
  const titles={household:'Household',employment:'Employment',properties:'Properties',pensions:'Pensions','app-config':'App Config'};
  el('page-title').textContent=titles[page]||'Household';document.title=el('page-title').textContent+' ? Retirement';
  if(page==='app-config'){editor.append(systemSection(),backupSection());queueMicrotask(loadBackups);return;}
  editor.appendChild(assumptionsSection());
  if(['household','employment','pensions'].includes(page))editor.appendChild(listSection('incomes'));
  if(page==='household'){editor.append(listSection('accounts'),advanced(phasesSection(),'Spending changes over time'),advanced(estateSection(),'Estate and survivor settings'));}
  if(page==='employment')editor.appendChild(advanced(childcareSection(),'Childcare expenses'));
  if(page==='properties'){editor.appendChild(listSection('realEstate'));editor.append(advanced(debtComparisonSection(),'Compare extra debt payments with investing'));}
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
      opt.value = o; opt.textContent = String(o);
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
  const sections={household:['householdType','province','desiredMonthlyIncome','targetDeathAge','inflation','returnMode','conservativeDelta','badDecadeDelta','mcRuns','mcVolatility','spendingIncludesDebtPayments','applySpendingBeforeRetirement','reinvestSurplus'],employment:['rrspMinMarginalRate','rrspGoalCompletion','optimizeContributions','reinvestRefund','contributionSlice'],properties:['rentalIncomeInflation','vacancyRate','rentalOwnerSplit','reinvestPayoffPayments'],pensions:['optimizePensionSplit','gisEnabled']};
  const sec=document.createElement('div');sec.className='section';const title=document.createElement('h2');title.textContent={household:'Your plan',employment:'Savings and RRSP goals',properties:'Property defaults',pensions:'Pension and benefit settings'}[page];sec.append(title);
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
  sec.innerHTML = '<h2>Childcare deduction</h2><div class="notice">Claimed automatically by the spouse with lower income before the childcare deduction, capped at the CRA limits ($8,000 per child under 7, $5,000 ages 7 to 16) and at two thirds of that spouse\'s earned income. Each cost line runs from its start year to its end year, dropping by the decline amount every year.</div>';

  const kidsRow = document.createElement('div'); kidsRow.className = 'item-row';
  kidsRow.appendChild(field({key:'childrenBirthYears',label:'Children\'s birth years (comma separated)', type:'text'},
    cc.childrenBirthYears.join(', '),
    v => cc.childrenBirthYears = String(v).split(',').map(x => parseInt(x.trim(),10)).filter(x => x > 1900)));
  sec.appendChild(kidsRow);

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
    sec.appendChild(row);
  });
  const add = document.createElement('button'); add.className = 'btn ghost'; add.textContent = 'Add cost';
  add.onclick = () => { cc.items.push({name:'New cost', amount:0, startYear:new Date().getFullYear(), endYear:0, declinePerYear:0}); render(); };
  sec.appendChild(add);
  return sec;
}

function personFieldVisible(key){
  if(key.startsWith('fhsa')&&!config.accounts.some(a=>a.type==='FHSA'&&a.enabled!==false))return false;
  const employment=['salary','salaryGrowth','incorporated','eligibleDividends','nonEligibleDividends','annualDeductions','pensionAdjustment'];
  const pension=['cppBaseAt65','cppStartAge','cppPlan','oasBaseAt65','oasStartAge','gisEligible','gisIncomeOpening','gainsEligible','rrifConversionAge'];
  if(key==='name')return true;if(page==='employment')return employment.includes(key);if(page==='pensions')return pension.includes(key);
  return !employment.includes(key)&&!pension.includes(key);
}
function listSection(cat) {
  const spec=schema[cat],sec=document.createElement('div');sec.className='section';sec.dataset.category=cat;
  const h=document.createElement('h2');h.textContent=cat==='incomes'?({household:'People',employment:'Work income',pensions:'Government pensions'}[page]):spec.title;sec.append(h);
  if(cat==='dbPensions')sec.id='pensions';
  const core={accounts:['name','owner','type','balance'],realEstate:['name','ownerSplit','type','value','mortgage'],dbPensions:['name','owner','startAge','lifetime'],incomes:page==='household'?['name','birthYear','targetRetireAge']:page==='employment'?['name','salary','incorporated']:['name','cppBaseAt65','cppStartAge','oasBaseAt65','oasStartAge']};
  config[cat].forEach((item,i)=>{
    if(config.assumptions.householdType==='single'&&((cat==='incomes'&&i===1)||(['accounts','dbPensions'].includes(cat)&&item.owner===config.incomes[1].name)))return;
    if(cat==='accounts'&&item.type==='CORP')Object.entries({useCDA:true,integratedCorporate:false,businessSmallRate:12.2,businessGeneralRate:26.5,capitalReturnShare:50,realizationRate:25}).forEach(([key,value])=>item[key]??=value);
    if(cat==='dbPensions')item.survivorPercent??=60;
    const wrapper=document.createElement('div');wrapper.className='setting-record';const row=document.createElement('div');row.className='item-row core-fields';const more=document.createElement('div');more.className='item-row advanced-fields';
    spec.fields.filter(f=>cat!=='incomes'||personFieldVisible(f.key)).filter(f=>!f.accountTypes||f.accountTypes.includes(item.type)).forEach(f=>{
      if(f.key==='cppStartAge'&&item.cppPlan==='QPP')f={...f,options:Array.from({length:13},(_,k)=>60+k)};
      const node=field(f,item[f.key],v=>{
        if(cat==='incomes'&&f.key==='name'){const old=item.name;['accounts','dbPensions'].forEach(key=>config[key].forEach(a=>{if(a.owner===old)a.owner=v;}));}
        item[f.key]=v;if(f.key==='type'||f.key==='cppPlan')render();
      });node.dataset.setting=f.key;(core[cat].includes(f.key)?row:more).appendChild(node);
    });
    if(cat==='dbPensions')more.appendChild(pensionTiers(item,render));
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
function pensionTiers(plan, refresh) {
  const section=document.createElement('details');section.style.width='100%';
  section.open=(plan.tiers || []).length > 0;
  const summary=document.createElement('summary');summary.textContent='Pension estimates at different ages ('+(plan.tiers || []).length+')';section.appendChild(summary);
  const note=document.createElement('p');note.textContent='Optional: copy estimates from your pension statement. These override the lifetime and bridge amounts above. Between ages, amounts are interpolated; outside the entered range, the nearest estimate is used. Link the pension to retirement to use these in the retirement planner.';section.appendChild(note);
  (plan.tiers || []).forEach((tier,i)=>{
    const row=document.createElement('div');row.className='item-row';
    ['startAge','lifetime','bridge'].forEach(key=>row.appendChild(field(schema.dbPensions.fields.find(f=>f.key===key),tier[key],v=>tier[key]=v)));
    const remove=document.createElement('button');remove.className='btn danger';remove.textContent='Remove estimate';remove.onclick=()=>{plan.tiers.splice(i,1);refresh();};row.appendChild(remove);section.appendChild(row);
  });
  const add=document.createElement('button');add.className='btn ghost';add.textContent='Add age estimate';add.onclick=()=>{(plan.tiers ||= []).push({startAge:65,lifetime:0,bridge:0});refresh();};section.appendChild(add);
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
    row.innerHTML = `<span>${b.file}</span><span style="color:var(--muted)">${(b.size/1024).toFixed(1)} kB</span>`;
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
  delete config.assumptions.withdrawalPlan;
  const res = await AppStorage.fetch('/api/config', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(config)});
  const body = await res.json();
  if (body.success) { config = body.config; render(); loadBackups(); E.simulate(config); toast('Changes saved and projection updated'); }
  else toast(body.error || 'Save failed', true);
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
AppStorage.bindState(()=>config,c=>{config=E.normalizeConfig(c);config.assumptions.spendingMode='target';render();});
AppStorage.subscribe(c=>{config=E.normalizeConfig(c);config.assumptions.spendingMode='target';render();});
init().catch(error=>toast(error.message,true));
