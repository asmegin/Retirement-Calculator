'use strict';
function configureSettingsSchema(){
  Object.assign(SettingHelp.text,{
    name:'A name you will recognize in your plan.',birthYear:'Your four-digit birth year.',salary:'Your yearly pay before tax.',
    targetRetireAge:'Age when you stop working. Move a slider to hold that person’s age fixed while finding the other person’s retirement age.',
    desiredMonthlyIncome:'What your household wants to spend each month after tax, in today’s dollars.',
    type:'Choose the kind of account, property or loan.',owner:'The person who owns this account or pension.',balance:'What this account is worth today.',
    startAge:'Age payments begin.',lifetime:'Monthly pension before tax, paid for life. Use your pension statement.',bridge:'Extra monthly pension paid temporarily. Enter zero if there is none.',
    cppBaseAt65:'Monthly CPP or QPP estimate at 65, before tax. Use your government statement.',cppStartAge:'Choose when payments begin. CPP: ages 60–70. QPP: ages 60–72. Later starts generally mean larger payments.',
    targetDeathAge:'Age to plan through. Separate lifespans can be set under Estate and survivor settings.',
    value:'What the property is worth today.',mortgage:'What you still owe on this mortgage or loan.',acb:'Purchase cost plus improvements and eligible buying costs. This is used to calculate taxable profit on sale.',
    uccPool:'Building tax value left after past depreciation claims. Find this on your rental tax schedule.',
    solveToTarget:'Calculate the RRSP deposit needed to reach your chosen tax rate. Expected deposits and refunds use your goal completion percentage.',
    corporateTaxRate:'Tax rate on corporate investment income. Advanced corporate tracking includes refundable tax balances.'
  });
  assumptionFields.push({key:'rrspGoalCompletion',label:'Goal reached estimate per year (%)',type:'number',hint:'How much of the calculated RRSP goal you expect to contribute. 85 means an estimated $8,500 deposit toward a $10,000 goal. Tax savings and refunds use the deposit you expect to make.'});
  schema.incomes.fields.push({key:'cppPlan',label:'CPP or QPP',type:'select',options:['CPP','QPP'],hint:'Choose QPP for Quebec pension benefits. QPP can start as late as age 72.'},{key:'gainsEligible',label:'Eligible for Ontario GAINS',type:'checkbox',hint:'Include the Ontario low-income senior supplement if you meet its residency rules and receive OAS and GIS.'});
  schema.accounts.fields.forEach(f=>{
    if(['corporateTaxRate','dividendType'].includes(f.key))f.accountTypes=['CORP'];
    if(['distributionType','distributionYield','costBasis'].includes(f.key))f.accountTypes=['TAXABLE'];
    if(f.key.startsWith('qualifying'))f.accountTypes=['FHSA'];
    if(['solveToTarget','hbpAccount'].includes(f.key))f.accountTypes=['RRSP'];
  });
  const corporate=[
    ['integratedCorporate','Track corporate tax balances','Track tax-free dividends, eligible dividends and refundable corporate tax.','checkbox'],
    ['businessIncome','Business profit before owner pay','Annual profit before your salary and employer CPP costs. Use one operating corporation per person. Zero means an investment-only company.'],
    ['businessSmallRate','Small-business tax (%)','Combined federal and provincial rate. For example, 12.2 in Ontario.'],
    ['businessGeneralRate','General corporate tax (%)','Combined rate for business profit above the small-business limit. For example, 26.5 in Ontario.'],
    ['cdaOpening','Tax-free dividend balance (CDA)','Amount your accountant confirms can be paid as capital dividends. This is a tax balance, not extra cash.'],
    ['gripOpening','Eligible dividend balance (GRIP)','Amount available to support eligible dividend payments.'],
    ['erdtohOpening','Refundable tax: eligible dividends','Opening eligible refundable dividend tax balance from your corporate return.'],
    ['nrdtohOpening','Refundable tax: other dividends','Opening non-eligible refundable dividend tax balance from your corporate return.'],
    ['priorPassiveIncome','Last year’s passive income','Investment income used to calculate the current federal small-business limit. The reduction starts above $50,000 of passive income.'],
    ['associatedPassiveIncome','Related companies’ passive income','Other passive income counted with this corporation when calculating its federal small-business limit.'],
    ['capitalReturnShare','Price gains as share of return (%)','How much of the investment return comes from rising prices. The rest is treated as interest.'],
    ['realizationRate','Price gains sold each year (%)','Share of this year’s gains realized inside the corporation.'],
    ['useCDA','Use tax-free dividends first','Use the available CDA before taxable dividends. Your accountant must arrange the required election.','checkbox']
  ];
  corporate.forEach(([key,label,hint,type])=>schema.accounts.fields.push({key,label,hint,type:type||'number',accountTypes:['CORP']}));
  const property=[
    ['extraPaymentAnnual','Extra debt payment each year','Extra principal paid at year end, in addition to your regular mortgage payments.'],
    ['extraPaymentStart','Extra payments start in','First calendar year for extra principal payments.'],
    ['extraPaymentEnd','Extra payments stop in','Last calendar year for extra principal payments.'],
    ['smithEnabled','Reborrow paid principal to invest','Model the Smith Maneuver: invest reborrowed mortgage principal in a separate taxable portfolio. Assets and the investment loan are both tracked.','checkbox'],
    ['smithRate','Investment loan interest (%)','Annual rate on the separate investment HELOC. Interest is paid from household cash.'],
    ['smithLimit','Investment loan limit','Maximum total borrowed for investments.'],
    ['smithGrowthRate','Borrowed investments’ growth (%)','Expected annual return on the taxable investments bought with borrowed money.'],
    ['smithOwner','Investment loan owner','Person who owns the investments and reports the related interest deduction.','owner']
  ];
  property.forEach(([key,label,hint,type])=>schema.realEstate.fields.push({key,label,hint,type:type||'number'}));
  schema.realEstate.fields.find(f=>f.key==='ownerSplit').label='Person 1 ownership (%)';
  schema.dbPensions.fields.push({key:'survivorPercent',label:'Pension paid to survivor (%)',type:'number',hint:'Share of the lifetime pension paid to your spouse after your death. Use your pension plan’s survivor election.'});
}
function extraSection(title){const sec=document.createElement('div');sec.className='section';const h=document.createElement('h2');h.textContent=title;sec.append(h);return sec;}
function extraFields(parent,obj,definitions){const row=document.createElement('div');row.className='item-row';definitions.forEach(([key,label,hint,type,options])=>row.append(field({key,label,hint,type:type||'number',options},obj[key],v=>obj[key]=v)));parent.append(row);return row;}
function estateSection(){
  const sec=extraSection('Estate and survivor settings'),a=config.assumptions.estate;
  extraFields(sec,a,[['enabled','Include death and terminal tax','Project each death at year end, including tax on registered savings and investment gains.','checkbox'],['spousalRollover','Transfer assets to surviving spouse','Defer eligible asset taxes at the first death. Final death includes the remaining taxable estate.','checkbox'],['survivorSpendingPercent','Survivor spending (%)','Share of the monthly household budget needed after the first death.'],['notarialWill','Quebec notarial will','These wills generally do not require probate.','checkbox'],['probateOverride','Probate fee override','Blank uses Ontario, BC, Alberta or Quebec notarial-will rules. Enter a fixed fee for other cases.']]);
  config.incomes.slice(0,config.assumptions.householdType==='single'?1:2).forEach(p=>extraFields(sec,p,[['deathAge',p.name+': plan lifespan','Age at year-end death. Blank uses the household planning age.']]));
  config.accounts.forEach(ac=>{ac.probateIncluded??=true;extraFields(sec,ac,[['probateIncluded',ac.name+': include in probate','Clear only when the account passes outside the probate estate. Tax may still apply.','checkbox']]);});
  const note=document.createElement('p');note.className='inline-help';note.textContent='Year-end estimates; CPP survivor benefits and corporate post-death tax planning need separate assessment.';sec.append(note);return sec;
}
function earningsSection(){
  const sec=extraSection('CPP / QPP earnings history');
  config.incomes.slice(0,config.assumptions.householdType==='single'?1:2).forEach(p=>{
    const h=document.createElement('h3');h.textContent=p.name;sec.append(h);
    extraFields(sec,p,[['cppMethod','Use statement or history','Statement uses your monthly estimate. History uses the earnings imported below.','select',['statement','history']],['birthMonth','Birth month','1 is January; 12 is December.'],['cppStartMonth','First payment month','Month in the year you reach the chosen start age. The first year is prorated.']]);
    const label=document.createElement('label');label.textContent='Pensionable earnings CSV';const input=document.createElement('textarea');input.setAttribute('aria-label',p.name+' pensionable earnings CSV');input.value='year,month,earnings,caregiver,disabled\n'+(p.cppHistory||[]).map(r=>[r.year,r.month||'',r.earnings,r.caregiver||false,r.disabled||false].join(',')).join('\n');sec.append(label,input);
    SettingHelp.attach(input,'Paste annual or monthly earnings from your statement. Leave month blank for annual records. Mark only eligible child-rearing or disability periods.');
    const status=document.createElement('p');status.className='inline-help';const report=()=>{const r=PlanningCore.cppHistory(p,{inflation:config.assumptions.inflation});status.textContent='History estimate: $'+Math.round(r.monthly)+'/month at commencement. Missing historical months: '+r.missingMonths+'; forecast months: '+r.forecastMonths+'. Base and enhanced CPP/QPP are estimated; annual data and special benefit rules can differ from a government calculation.';};report();
    const b=document.createElement('button');b.className='btn ghost';b.textContent='Use these earnings records';b.onclick=()=>{try{p.cppHistory=PlanningCore.parseEarningsCSV(input.value);p.cppMethod='history';report();toast('Earnings imported. Save changes to update your plan.');}catch(error){status.textContent=error.message;}};sec.append(b,status);
  });return sec;
}
function systemSection(){
  const sec=extraSection('Appearance and server');
  const dark=field({key:'appearance',label:'Dark Appearance',type:'checkbox',hint:'Switch between light and dark. Light is the default.'},document.documentElement.dataset.theme==='dark',v=>AppTheme.apply(v?'dark':'light'));dark.querySelector('input').setAttribute('data-dark-appearance','');sec.append(dark);
  const state=document.createElement('p');state.className='inline-help';sec.append(state);
  AppStorage.fetch('/api/system').then(r=>r.json()).then(s=>state.textContent=AppStorage.mode==='server'?'Docker mode. HTTP Auth is '+(s.authEnabled?'enabled.':'disabled.'):'Standalone mode. Your plan is stored in this browser; no HTTP server or HTTP Auth is running.');
  const auth=document.createElement('div');auth.innerHTML='<h3>HTTP Auth on Unraid</h3><p class="inline-help">Edit the container’s environment variables, then restart it. Authentication protects both the pages and real-time sync. Credentials stay on the server.</p><pre>BASIC_AUTH_ENABLED=true\nBASIC_AUTH_USER=your-username\nBASIC_AUTH_PASS=your-password</pre><p class="inline-help">The Docker port defaults to 3333. Keep the data folder mapped to persistent Unraid storage. Standalone plans can be moved between browsers with Export JSON and Import JSON.</p>';sec.append(auth);return sec;
}
function debtComparisonSection(){
  const sec=extraSection('Pay debt or invest the same money?'),options={growth:5};
  extraFields(sec,options,[['growth','Investment return (%)','Expected yearly return if you invest the extra payments in a taxable account instead.']]);
  const button=document.createElement('button');button.className='btn ghost';button.textContent='Compare strategies';const result=document.createElement('p');result.className='inline-help';result.setAttribute('role','status');
  button.onclick=()=>{
    try{
      const baseline=E.simulate(config),alternative=E.normalizeConfig(config);delete alternative.assumptions.withdrawalPlan;
      alternative.realEstate.forEach(p=>p.extraPaymentAnnual=0);
      baseline.years.filter(y=>y.extraDebtPayments>0).forEach(y=>alternative.accounts.push({name:'Extra investment '+y.year,owner:config.incomes[0].name,type:'TAXABLE',balance:0,growthRate:options.growth,contribAmt:y.extraDebtPayments,contribFreq:'yearly',contribStartYear:y.year,contribEndYear:y.year,contributeInRetirement:true}));
      const r=E.simulate(alternative),fmt=v=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0}).format(v);
      result.textContent='Extra debt payments: ending net worth '+fmt(baseline.finalNetWorthReal)+'. Invest the same annual cash instead: '+fmt(r.finalNetWorthReal)+'; change '+fmt(r.finalNetWorthReal-baseline.finalNetWorthReal)+' in today’s dollars. Lifetime personal tax changes by '+fmt(r.lifetimeTax-baseline.lifetimeTax)+'. First shortfall: '+(r.depletedYear||'none')+'. This comparison leaves your saved plan unchanged.';
    }catch(error){result.textContent=error.message;}
  };sec.append(button,result);return sec;
}
