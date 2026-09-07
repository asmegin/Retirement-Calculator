'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PlanningCore=factory();})(typeof self!=='undefined'?self:this,function(){
  const number=(v,d=0)=>Number.isFinite(parseFloat(v))?parseFloat(v):d;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const spendingNames=['Groceries','Dining out','Utilities','Internet & mobile','Home insurance','Home maintenance','Property taxes','Rent','Vehicle operating costs','Vehicle replacement','Public transit','Travel','Healthcare','Dental care','Vision care','Long-term care','Fitness','Clothing','Personal care','Entertainment','Hobbies','Subscriptions','Gifts','Charitable giving','Children & education','Pets','Professional fees','Other spending'];
  function annualAmount(item){return Math.max(0,number(item.amount))*(item.frequency==='monthly'?12:1);}
  function spendingBaseline(items){return (items||[]).reduce((s,x)=>s+(x.enabled===false?0:annualAmount(x)/Math.max(1,number(x.everyYears,1))),0);}
  function spendingForYear(items,people,year,startYear,inflation){
    return (items||[]).map(item=>{
      const ref=item.ageReference==='person2'&&people.length>1?1:0;
      const age=item.ageReference==='older'?Math.max(...people.map(p=>year-p.birthYear)):year-people[ref].birthYear;
      const from=number(item.startAge,0),to=number(item.endAge,120),interval=Math.max(1,Math.round(number(item.everyYears,1)));
      const referenceBirth=item.ageReference==='older'?Math.min(...people.map(p=>p.birthYear)):people[ref].birthYear;
      const first=from>0?from:startYear-referenceBirth;
      const occurs=item.enabled!==false&&age>=from&&age<=to&&((Math.round(age-first)%interval)===0);
      return {name:item.name||'Expense',amount:occurs?annualAmount(item)*Math.pow(1+number(item.inflation,inflation)/100,year-startYear):0};
    });
  }
  // CRA annual maximum pensionable earnings, 1966–2026. Future ceilings are projections.
  const ceilings=[5000,5000,5100,5200,5300,5400,5500,5600,6600,7400,8300,9300,10400,11700,13100,14700,16500,18500,20800,23400,25800,25900,26500,27700,28900,30500,32200,33400,34400,34900,35400,35800,36900,37400,37600,38300,39100,39900,40500,41100,42100,43700,44900,46300,47200,48300,50100,51100,52500,53600,54900,55300,55900,57400,58700,61600,64900,66600,68500,71300,74600];
  function ympe(year,growth=2.1){return year<1966?0:year<=2026?ceilings[year-1966]:74600*Math.pow(1+growth/100,year-2026);}
  function cppHistory(person,options={}){
    const plan=person.cppPlan==='QPP'?'QPP':'CPP',startAge=clamp(number(person.cppStartAge,65),60,plan==='QPP'?72:70);
    const birthMonth=clamp(Math.round(number(person.birthMonth,1)),1,12),startMonth=clamp(Math.round(number(person.cppStartMonth,birthMonth+1)),1,12);
    const claimYear=person.birthYear+Math.floor(startAge),claimIndex=claimYear*12+startMonth-1;
    const first=Math.max(1966*12, (person.birthYear+18)*12+birthMonth);
    const now=options.startYear||new Date().getFullYear(),growth=number(options.inflation,2.1);
    const history=Array.isArray(person.cppHistory)?person.cppHistory:[],lookup=new Map();
    history.forEach(r=>{if(r.month)lookup.set(r.year+'-'+r.month,r);else for(let m=1;m<=12;m++)lookup.set(r.year+'-'+m,{...r,earnings:number(r.earnings)/12});});
    const aympe=[0,1,2,3,4].reduce((s,k)=>s+ympe(claimYear-k,growth),0)/5;
    let missing=0,forecast=0,caregiverDropped=0,disabilityDropped=0;
    const months=[];
    for(let index=first;index<claimIndex;index++){
      const year=Math.floor(index/12),month=index%12+1,age=(index-(person.birthYear*12+birthMonth-1))/12;
      let r=lookup.get(year+'-'+month);
      if(!r&&year>=now){r={earnings:year<person.birthYear+person.targetRetireAge?number(person.salary)*Math.pow(1+number(person.salaryGrowth)/100,year-now)/12:0};forecast++;}
      if(!r){r={earnings:0};missing++;}
      const ceiling=number(r.ympe,ympe(year,growth));
      const upper=number(r.yampe,year===2024?73200:year===2025?81200:year===2026?85000:Math.floor(ceiling*1.14/100)*100);
      const wage=Math.max(0,number(r.earnings)),normalized=ceiling?Math.min(wage,ceiling/12)/ceiling*aympe:0;
      const phase=year<2019?0:year===2019?.15:year===2020?.3:year===2021?.5:year===2022?.75:1;
      const tier2=year>=2024?Math.max(0,Math.min(wage,upper/12)-ceiling/12)/ceiling*aympe:0;
      const prior=months.slice(-60),dropin=prior.length?prior.reduce((s,m)=>s+m.enhanced,0)/prior.length:0;
      months.push({year,age,base:normalized,caregiver:r.caregiver===true,disabled:r.disabled===true,
        enhanced:r.caregiver===true?Math.max(normalized*phase,dropin):normalized*phase,second:tier2});
    }
    let base=months.filter(m=>{if(m.disabled){disabilityDropped++;return false;}return true;});
    // Remove eligible low-income caregiving months only where doing so improves the average.
    let average=base.reduce((s,m)=>s+m.base,0)/Math.max(1,base.length);
    base=base.filter(m=>{if(m.caregiver&&m.base<average){caregiverDropped++;return false;}return true;});
    // The base benefit must not decrease solely because of low earnings after 65.
    const pre65=base.filter(m=>m.age<65),post65=base.filter(m=>m.age>=65);
    if(post65.length){
      const sorted=pre65.slice().sort((a,b)=>a.base-b.base);
      post65.sort((a,b)=>b.base-a.base).forEach(m=>{if(sorted.length&&m.base>sorted[0].base){sorted[0]=m;sorted.sort((a,b)=>a.base-b.base);}});
      base=sorted;
    }
    const drop=Math.floor(base.length*(plan==='QPP'?.15:.17));
    base.sort((a,b)=>b.base-a.base);base=base.slice(0,Math.max(0,base.length-drop));
    const original=base.reduce((s,m)=>s+m.base,0)/Math.max(120,base.length)*.25;
    const enhanced=months.map(m=>m.enhanced).sort((a,b)=>b-a).slice(0,480).reduce((s,v)=>s+v,0)/480/12;
    const second=months.map(m=>m.second).sort((a,b)=>b-a).slice(0,480).reduce((s,v)=>s+v,0)/480/3;
    const early=plan==='QPP'?.005+.001*clamp(original/(aympe/12*.25),0,1):.006;
    const adjustment=startAge<65?1-(65-startAge)*12*early:1+(startAge-65)*12*.007;
    return {plan,monthly:(original+enhanced+second)*adjustment,base:original*adjustment,enhanced:enhanced*adjustment,second:second*adjustment,
      missingMonths:missing,forecastMonths:forecast,generalDropoutMonths:drop,caregiverDropoutMonths:caregiverDropped,disabilityDropoutMonths:disabilityDropped,
      claimYear,claimMonth:startMonth,aympe,provisional:missing>0||forecast>0||history.some(r=>!r.month)};
  }
  function parseEarningsCSV(input){
    const lines=String(input).trim().split(/\r?\n/).filter(Boolean);
    const headers=(lines.shift()||'').split(',').map(x=>x.trim().toLowerCase());
    if(!headers.includes('year')||!headers.includes('earnings'))throw new Error('CSV needs year and earnings columns. Optional: month, ympe, yampe, caregiver, disabled.');
    const seen=new Set();return lines.map((line,i)=>{
      const values=line.split(',').map(v=>v.trim()),row={};headers.forEach((key,k)=>{if(['year','month','earnings','ympe','yampe'].includes(key)&&values[k]!=='')row[key]=Number(values[k]);if(['caregiver','disabled'].includes(key))row[key]=['true','1','yes'].includes((values[k]||'').toLowerCase());});
      if(!Number.isInteger(row.year)||row.year<1966||!Number.isFinite(row.earnings)||row.earnings<0||row.month!==undefined&&(!Number.isInteger(row.month)||row.month<1||row.month>12))throw new Error('Invalid earnings record at line '+(i+2));
      if(['ympe','yampe'].some(key=>row[key]!==undefined&&(!Number.isFinite(row[key])||row[key]<=0)))throw new Error('Invalid earnings ceiling at line '+(i+2));
      const periods=row.month?[row.year+'-'+row.month]:Array.from({length:12},(_,m)=>row.year+'-'+(m+1));
      if(periods.some(id=>seen.has(id)))throw new Error('Duplicate or overlapping earnings period in '+row.year);
      periods.forEach(id=>seen.add(id));return row;
    });
  }
  function smallBusinessLimit(passive,capital=0){return Math.max(0,500000-Math.max(5*Math.max(0,passive-50000),500000*clamp((capital-10000000)/40000000,0,1)));}
  function corporateDistribution(amount,account){
    const capital=account.useCDA===false?0:Math.min(amount,Math.max(0,number(account.cda)));
    const eligible=account.dividendType==='eligible'?Math.min(amount-capital,Math.max(0,number(account.grip))):0;
    const nonEligible=amount-capital-eligible;
    const refundNon=Math.min(number(account.nrdtoh),nonEligible*23/60);
    const refundEligible=Math.min(number(account.erdtoh),(eligible+nonEligible)*23/60-refundNon);
    return {capital,eligible,nonEligible,taxable:eligible*1.38+nonEligible*1.15,refund:refundNon+refundEligible,refundNon,refundEligible};
  }
  function probate(value,province,options={}){
    if(options.probateOverride!==null&&options.probateOverride!==undefined&&options.probateOverride!=='')return Math.max(0,number(options.probateOverride));
    value=Math.max(0,value);
    if(province==='ON')return Math.ceil(Math.max(0,value-50000)/1000)*15;
    if(province==='BC')return value<=25000?0:200+Math.ceil((Math.min(value,50000)-25000)/1000)*6+Math.ceil(Math.max(0,value-50000)/1000)*14;
    if(province==='AB')return value===0?0:value<=10000?35:value<=25000?135:value<=125000?275:value<=250000?400:525;
    if(province==='QC'&&options.notarialWill!==false)return 0;
    return null; // Do not invent fees for an unsupported province or type of will.
  }
  function gains(income,couple,eligible,idx=1){return eligible?Math.max(0,92*12*idx-.25*Math.max(0,income/(couple?2:1))):0;}
  return {number,clamp,spendingNames,annualAmount,spendingBaseline,spendingForYear,ympe,cppHistory,parseEarningsCSV,smallBusinessLimit,corporateDistribution,probate,gains};
});
