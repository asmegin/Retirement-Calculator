(function(root){
  'use strict';
  function create(id){
    if(!['couple','investor'].includes(id))throw new Error('Unknown demo profile.');
    const c=RetireEngine.defaultConfig(),year=new Date().getFullYear();c.onboardingComplete=true;c.demoProfile=id;
    c.incomes.forEach((p,k)=>Object.assign(p,{name:k?'Sam':'Alex',birthYear:year-50+k*2,salary:k?65000:85000,targetRetireAge:65,cppBaseAt65:1000,oasBaseAt65:700,rrspRoomOpening:20000,tfsaRoomOpening:15000}));
    c.assumptions.desiredMonthlyIncome=5000;
    c.accounts=c.incomes.flatMap((p,k)=>[
      {name:'RRSP',owner:p.name,type:'RRSP',balance:k?180000:250000,growthRate:4,contribAmt:500,contribFreq:'monthly'},
      {name:'TFSA',owner:p.name,type:'TFSA',balance:k?70000:90000,growthRate:4,contribAmt:250,contribFreq:'monthly'}
    ]);
    if(id==='investor'){
      c.incomes[0].incorporated=true;c.incomes[0].salary=80000;c.incomes[0].nonEligibleDividends=25000;
      c.accounts.push({name:'Corporate investments',owner:'Alex',type:'CORP',balance:650000,costBasis:420000,growthRate:4,corporateTaxRate:50,dividendType:'non-eligible',integratedCorporate:true,cdaOpening:20000,gripOpening:30000,nrdtohOpening:15000});
      c.accounts.push({name:'Non-registered investments',owner:'Alex',type:'TAXABLE',balance:180000,costBasis:110000,growthRate:4});
      c.realEstate=[{name:'Demo rental',type:'rental',value:600000,acb:400000,buildingAcb:300000,buildingSalePercent:75,uccPool:240000,ccaEnabled:true,ownerSplit:50,appreciation:2,mortgage:220000,interestRate:4,paymentMonthly:1400,grossRentMonthly:2800,annualPropertyTax:3800,annualInsurance:1500,annualMaintenance:2400,sellingCostPct:5,saleYear:0}];
    }
    return PlanSchema.validate(c);
  }
  root.DemoProfiles={create};
  document.addEventListener('DOMContentLoaded',()=>{
    const bar=document.querySelector('.settings-bar');
    const label=document.createElement('label');label.textContent='Load Demo Profile ';
    const select=document.createElement('select');select.id='demo-profile';select.setAttribute('aria-label','Load Demo Profile');
    for(const [value,text] of [['','Choose an example…'],['couple','Profile A: Canadian couple'],['investor','Profile B: Business owner / rental investor']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}label.append(select);bar.append(label);
    select.onchange=async()=>{if(!select.value)return;select.disabled=true;try{await AppStorage.loadDemo(create(select.value));location.href='./index.html';}catch(e){document.getElementById('file-status').textContent=e.message;select.disabled=false;}};
    const badge=document.createElement('div');badge.id='demo-badge';badge.className='demo-badge';badge.hidden=true;
    const text=document.createElement('strong');text.textContent='Demo profile · fictional figures';const start=document.createElement('button');start.className='btn';start.id='start-own-plan';start.textContent='Start My Own Plan';
    start.onclick=async()=>{try{await AppStorage.leaveDemo();location.href='./index.html';}catch(e){document.getElementById('file-status').textContent=e.message;}};badge.append(text,start);bar.after(badge);
    const footer=document.createElement('footer');footer.className='privacy-notice';footer.id='privacy-notice';document.body.append(footer);
    const update=()=>{badge.hidden=!AppStorage.isDemo;footer.textContent=AppStorage.isDemo?'Demo mode: fictional figures stay in this browser. Your own saved plan is kept separately.':AppStorage.deployment==='server'?'Self-hosted & private — Your financial plan is saved on your own server.':'100% Client-Side & Private — Your financial data never leaves your device.';};
    AppStorage.ready.then(update);window.addEventListener('storagemodechange',update);
  });
})(window);
