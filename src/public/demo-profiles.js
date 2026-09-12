(function(root){
  'use strict';
  function create(id){
    if(!['couple','investor','landlord'].includes(id))throw new Error('Unknown demo profile.');
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
    if(id==='landlord'){
      c.incomes.forEach((p,k)=>Object.assign(p,{
        name:k?'Morgan':'Taylor',birthYear:year-47+k*3,targetRetireAge:62,
        salary:k?90000:125000,incorporated:true,
        nonEligibleDividends:k?35000:65000,annualDeductions:k?8000:14000,
        cppBaseAt65:k?900:1100,oasBaseAt65:700,rrspRoomOpening:0,tfsaRoomOpening:0
      }));
      Object.assign(c.assumptions,{desiredMonthlyIncome:12000,rentalOwnerSplit:50});
      c.accounts=c.incomes.flatMap((p,k)=>[
        {name:p.name+' RRSP',owner:p.name,type:'RRSP',balance:k?725000:950000,growthRate:4.5,contribAmt:k?16200:22500,contribFreq:'yearly'},
        {name:p.name+' TFSA',owner:p.name,type:'TFSA',balance:k?112000:125000,growthRate:4.5,contribAmt:7000,contribFreq:'yearly'}
      ]);
      c.accounts.push(
        {name:'Operating company investments',owner:'Taylor',type:'CORP',balance:900000,costBasis:610000,growthRate:4.5,corporateTaxRate:50,dividendType:'non-eligible',integratedCorporate:true,cdaOpening:35000,gripOpening:45000,nrdtohOpening:30000},
        {name:'Property reserve',owner:'Taylor',type:'TAXABLE',balance:275000,costBasis:230000,growthRate:3.5,distributionYield:2,distributionType:'interest'}
      );
      const rentals=[
        ['Maple Duplex',720000,430000,330000,255000,265000,3400,4300,1800,3000,100],
        ['Cedar Triplex',890000,510000,390000,305000,370000,4750,5200,2100,3900,50],
        ['Birch Bungalow',540000,315000,235000,195000,155000,2550,3300,1450,2300,50],
        ['Pine Fourplex',1180000,690000,525000,410000,510000,6800,7200,2700,5200,50],
        ['Lakeview House',665000,385000,285000,230000,225000,3050,4100,1650,2800,0],
        ['King Street Duplex',780000,455000,345000,270000,290000,3950,4800,1900,3300,100],
        ['Queen Street House',610000,360000,265000,215000,205000,2850,3700,1550,2500,50],
        ['Oak Townhouse',495000,295000,220000,180000,140000,2350,3100,1400,2150,50],
        ['River Road Duplex',745000,420000,315000,245000,275000,3650,4500,1750,3100,100],
        ['Hillcrest House',575000,335000,250000,205000,175000,2700,3500,1500,2400,0],
        ['Parkside Triplex',940000,550000,415000,325000,395000,5100,5700,2250,4200,50]
      ];
      c.realEstate=rentals.map((r,k)=>({
        name:r[0],type:'rental',value:r[1],acb:r[2],buildingAcb:r[3],buildingSalePercent:75,
        uccPool:r[4],ccaEnabled:k%3!==2,ownerSplit:r[10],appreciation:2,mortgage:r[5],
        interestRate:4.25,paymentMonthly:Math.round(r[5]*.006),grossRentMonthly:r[6],
        annualPropertyTax:r[7],annualInsurance:r[8],annualMaintenance:r[9],sellingCostPct:5,saleYear:0
      }));
    }
    return PlanSchema.validate(c);
  }
  function mount(container,status){
    const label=document.createElement('label');label.textContent='Load Demo Profile ';
    const select=document.createElement('select');select.id='demo-profile';select.setAttribute('aria-label','Load Demo Profile');
    for(const [value,text] of [['','Choose an example…'],['couple','Profile A: Canadian couple'],['investor','Profile B: Business owner / rental investor'],['landlord','Profile C: Self-employed landlords / 11 rentals']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}label.append(select);container.append(label);
    select.onchange=async()=>{if(!select.value)return;select.disabled=true;try{await AppStorage.loadDemo(create(select.value));location.href='./index.html';}catch(e){const target=status||document.getElementById('file-status');if(target)target.textContent=e.message;select.disabled=false;}};
    return label;
  }
  root.DemoProfiles={create,mount};
  document.addEventListener('DOMContentLoaded',()=>{
    const bar=document.querySelector('.settings-bar');
    const badge=document.createElement('div');badge.id='demo-badge';badge.className='demo-badge';badge.hidden=true;
    const text=document.createElement('strong');text.textContent='Demo profile · fictional figures';const start=document.createElement('button');start.className='btn';start.id='start-own-plan';start.textContent='Start My Own Plan';
    start.onclick=async()=>{try{await AppStorage.leaveDemo();location.href='./index.html';}catch(e){document.getElementById('file-status').textContent=e.message;}};badge.append(text,start);bar.after(badge);
    const footer=document.createElement('footer');footer.className='privacy-notice';footer.id='privacy-notice';document.body.append(footer);
    const update=()=>{badge.hidden=!AppStorage.isDemo;footer.textContent=AppStorage.isDemo?'Demo mode: fictional figures stay in this browser. Your own saved plan is kept separately.':AppStorage.deployment==='server'?'Self-hosted & private — Your financial plan is saved on your own server.':'100% Client-Side & Private — Your financial data never leaves your device.';};
    AppStorage.ready.then(update);window.addEventListener('storagemodechange',update);
  });
})(window);
