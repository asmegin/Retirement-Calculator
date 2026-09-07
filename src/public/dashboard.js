

const E = window.RetireEngine;
let config = null, sim = null, charts = {}, saveTimer = null, scenarioSims = {}, wizardOffered = false;
const isSingle = () => config?.assumptions.householdType === 'single';
const agesText = r => r.ages.slice(0,isSingle()?1:2).join(' / ');
function openSetupWizard() { clearTimeout(saveTimer); el('setup-frame').src='./config.html?wizard=1'; el('setup-host').showModal(); }
window.addEventListener('message',event=>{if(event.origin===location.origin && event.source===el('setup-frame').contentWindow && event.data?.type==='wizard-closed')el('setup-host').close();});

const CAD = new Intl.NumberFormat('en-CA', {style:'currency', currency:'CAD', maximumFractionDigits:0});
const fmt = v => CAD.format(isFinite(v) ? v : 0);
const pct = v => (isFinite(v) ? (v*100).toFixed(1) : '0.0') + '%';
const fmtM = v => (Math.abs(v) >= 1e6 ? '$' + (v/1e6).toFixed(1) + 'M' : '$' + Math.round(v/1000) + 'k');
const el = id => document.getElementById(id);
const real = () => el('real-toggle').checked;
/* Deflate a nominal figure for a given year when the today's-dollars view is on. */
function D(v, row) { return real() ? v * row.deflator : v; }

/* ---------------------------------------------------------------- tabs */
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.setAttribute('aria-selected', x === t));
  document.querySelectorAll('.panel').forEach(p => p.hidden = p.id !== t.dataset.panel);
  Object.values(charts).forEach(c => c && c.resize());
}));

function fillSelect(sel, from, to) {
  sel.innerHTML = '';
  for (let a = from; a <= to; a++) { const o = document.createElement('option'); o.value = a; o.textContent = a; sel.appendChild(o); }
}
fillSelect(el('p1-cpp'), 60, 70); fillSelect(el('p2-cpp'), 60, 70);
fillSelect(el('p1-oas'), 65, 70); fillSelect(el('p2-oas'), 65, 70);

['p1-cpp','p2-cpp','p1-oas','p2-oas','strategy','return-mode','rrsp-floor']
  .forEach(id => el(id).addEventListener('change', onStateChange));
el('toggle-lines').addEventListener('change', () => charts.traj && charts.traj.update());
el('real-toggle').addEventListener('change', () => run());
el('p1-slider').addEventListener('input', e => { el('p1-age-val').textContent = e.target.value; plannerFixed=0; onStateChange(); });
el('p2-slider').addEventListener('input', e => { el('p2-age-val').textContent = e.target.value; plannerFixed=1; onStateChange(); });
el('spend-slider').addEventListener('input', e => { el('m-goal').value = e.target.value; el('spend-val').textContent = fmt(e.target.value); onStateChange(); });
el('m-goal').addEventListener('change', e => { const v = Math.max(0, +e.target.value || 0); e.target.value = v; el('spend-slider').value = v; el('spend-val').textContent = fmt(v); onStateChange(); });

function receiveConfig(c) { config = E.normalizeConfig(c); config.assumptions.spendingMode='target'; syncControls(); run(); if(config.onboardingComplete===false && !wizardOffered){wizardOffered=true;openSetupWizard();} }
AppStorage.subscribe(c=>{window.dispatchEvent(new Event('planinputschange'));receiveConfig(c);});
AppStorage.bindState(()=>config,receiveConfig);
AppStorage.fetch('/api/config').then(r=>{if(!r.ok)throw new Error('Could not load configuration');return r.json();}).then(c=>{if(!config)receiveConfig(c);}).catch(err=>{el('banner-text').textContent=err.message;});

function syncControls() {
  const P = config.incomes;
  if(config.assumptions.spendingMode==='categories')config.assumptions.desiredMonthlyIncome=PlanningCore.spendingBaseline(config.assumptions.spendingCategories)/12;
  [0,1].forEach(k=>{fillSelect(el('p'+(k+1)+'-cpp'),60,P[k].cppPlan==='QPP'?72:70);});
  document.body.classList.toggle('single-household',isSingle());
  el('p2-slider').closest('.ctl').hidden=isSingle();
  ['ch-p2-tax','ch-p2-mr'].forEach(id=>el(id).hidden=isSingle());
  el('household-summary').textContent = `${isSingle()?'Single':'Couple'} | ${E.PROVINCES[config.assumptions.province].name} | Tax schedules: 2025 base, projected with inflation. GIS and corporate tax are planning estimates.`;
  el('lbl-p1').childNodes[0].nodeValue = P[0].name + ' retirement age: ';
  el('lbl-p2').childNodes[0].nodeValue = P[1].name + ' retirement age: ';
  el('p1-slider').min = Math.min(P[0].targetRetireAge,new Date().getFullYear()-P[0].birthYear); el('p1-slider').max=Math.max(75,P[0].targetRetireAge);
  el('p1-slider').value = P[0].targetRetireAge; el('p1-age-val').textContent = P[0].targetRetireAge;
  el('p2-slider').min = Math.min(P[1].targetRetireAge,new Date().getFullYear()-P[1].birthYear); el('p2-slider').max=Math.max(75,P[1].targetRetireAge);
  el('p2-slider').value = P[1].targetRetireAge; el('p2-age-val').textContent = P[1].targetRetireAge;
  el('p1-cpp').value = P[0].cppStartAge; el('p2-cpp').value = P[1].cppStartAge;
  el('p1-oas').value = P[0].oasStartAge; el('p2-oas').value = P[1].oasStartAge;
  el('strategy').value = config.assumptions.withdrawalStrategy;
  el('return-mode').value = ['conservative','bad-decade'].includes(config.assumptions.returnMode) ? config.assumptions.returnMode : 'deterministic';
  /* keep any custom floor set on the config page selectable here */
  const floor = String(config.assumptions.rrspMinMarginalRate);
  const floorSel = el('rrsp-floor');
  if (![...floorSel.options].some(o => o.value === floor)) {
    const o = document.createElement('option');
    o.value = floor; o.textContent = floor + '% marginal';
    floorSel.appendChild(o);
  }
  floorSel.value = floor;
  el('spend-slider').min=0; el('spend-slider').max=Math.max(25000,config.assumptions.desiredMonthlyIncome);
  el('spend-slider').value = config.assumptions.desiredMonthlyIncome;
  el('m-goal').value = Math.round(config.assumptions.desiredMonthlyIncome);
  el('spend-val').textContent = fmt(config.assumptions.desiredMonthlyIncome);
  el('mc-vol').value = config.assumptions.mcVolatility;
  el('mc-runs').value = String(config.assumptions.mcRuns);
  ['ch-p1-tax','ch-p1-mr'].forEach((id,i) => el(id).textContent = P[0].name + (i ? ' marginal' : ' taxable'));
  ['ch-p2-tax','ch-p2-mr'].forEach((id,i) => el(id).textContent = P[1].name + (i ? ' marginal' : ' taxable'));
}

function onStateChange() {
  window.dispatchEvent(new Event('planinputschange'));
  if (!config) return;
  delete config.assumptions.withdrawalPlan;
  config.incomes[0].targetRetireAge = +el('p1-slider').value;
  if (!isSingle()) config.incomes[1].targetRetireAge = +el('p2-slider').value;
  config.incomes[0].cppStartAge = +el('p1-cpp').value;
  if (!isSingle()) config.incomes[1].cppStartAge = +el('p2-cpp').value;
  config.incomes[0].oasStartAge = +el('p1-oas').value;
  if (!isSingle()) config.incomes[1].oasStartAge = +el('p2-oas').value;
  config.assumptions.withdrawalStrategy = el('strategy').value;
  config.assumptions.returnMode = el('return-mode').value;
  config.assumptions.rrspMinMarginalRate = +el('rrsp-floor').value;
  const newGoal=Math.max(0,+el('m-goal').value||0);
  config.assumptions.spendingMode='target';
  config.assumptions.desiredMonthlyIncome = newGoal;
  run();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    AppStorage.fetch('/api/config', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(config)});
  }, 450);
}

let plannerFixed=null, plannerWorker=null, plannerTimer=null, plannerId=0, plannerResult=null;
function schedulePlanner() {
  clearTimeout(plannerTimer); if(plannerWorker) {plannerWorker.terminate();plannerWorker=null;}
  const id=++plannerId;plannerResult=null;el('planner-apply').hidden=true;
  if(isSingle()) plannerFixed=null;
  el('planner-both').hidden=isSingle();
  el('planner-status').textContent='Checking retirement ages for '+fmt(config.assumptions.desiredMonthlyIncome)+'/month?';
  el('planner-context').textContent=plannerFixed===null ? 'Find the earliest year by which everyone can retire; among ties, minimize total years worked.' :
    'Holding '+config.incomes[plannerFixed].name+' at age '+config.incomes[plannerFixed].targetRetireAge+'. Finding the other person?s earliest feasible retirement.';
  plannerTimer=setTimeout(()=>{
    try {
      plannerWorker=AppWorkers.create('retirement');
      plannerWorker.onmessage=event=>{
        if(event.data.id!==plannerId||!plannerWorker)return;
        const {result,error,tested,total}=event.data;
        if(error){el('planner-status').textContent='Could not calculate retirement ages: '+error;plannerWorker.terminate();plannerWorker=null;return;}
        if(!result){el('planner-status').textContent='Checking retirement ages? '+tested+' of '+total+' combinations tested.';return;}
        plannerWorker.terminate();plannerWorker=null;plannerResult=result;
        if(result.found) {
          const count=isSingle()?1:2;
          const people=config.incomes.slice(0,count).map((p,k)=>p.name+' can retire at '+result.ages[k]+' ('+result.years[k]+')');
          el('planner-status').textContent='To fund '+fmt(result.goal)+'/month: '+people.join('; ')+'.';
          el('planner-apply').hidden=result.ages.slice(0,count).every((age,k)=>age===config.incomes[k].targetRetireAge);
        } else {
          el('planner-status').textContent='No funded retirement combination found through age '+result.maxAge+' with these settings. '+(plannerFixed!==null ? 'Try ?Find ages for both?, ' : 'Try ')+ 'a lower spending goal, more savings, or revised pension estimates.';
        }
      };
      plannerWorker.onerror=()=>{if(id!==plannerId||!plannerWorker)return;el('planner-status').textContent='Retirement search failed. Reload the page to try again.';plannerWorker.terminate();plannerWorker=null;};
      plannerWorker.postMessage({id,config:structuredClone(config),fixedPerson:plannerFixed});
    } catch(error) {el('planner-status').textContent='Retirement search is unavailable in this browser: '+error.message;}
  },300);
}
el('planner-both').onclick=()=>{plannerFixed=null;schedulePlanner();};
el('planner-apply').onclick=()=>{
  if(!plannerResult?.found)return;
  plannerResult.ages.slice(0,isSingle()?1:2).forEach((age,k)=>config.incomes[k].targetRetireAge=age);
  syncControls();onStateChange();
};
const dashboardHelp={
  'real-toggle':'Show projected money in today?s purchasing power. Turn off to show the actual dollar amounts expected in each future year.',
  'm-goal':SettingHelp.text.desiredMonthlyIncome,
  'p1-slider':SettingHelp.text.targetRetireAge,'p2-slider':SettingHelp.text.targetRetireAge,
  'p1-cpp':SettingHelp.text.cppStartAge,'p2-cpp':SettingHelp.text.cppStartAge,
  'p1-oas':SettingHelp.text.oasStartAge,'p2-oas':SettingHelp.text.oasStartAge,
  'spend-slider':SettingHelp.text.desiredMonthlyIncome,'strategy':SettingHelp.text.withdrawalStrategy,
  'return-mode':SettingHelp.text.returnMode,'rrsp-floor':SettingHelp.text.rrspMinMarginalRate,
  'toggle-lines':'Show vertical markers on the portfolio chart when a debt is calculated to be paid off.',
  'mc-runs':SettingHelp.text.mcRuns,'mc-vol':SettingHelp.text.mcVolatility,
  'scenario-name':'Give this saved set of assumptions a name, such as Retire at 60. Saved scenarios can be compared against the current plan.'
};
Object.entries(dashboardHelp).forEach(([id,text])=>SettingHelp.attach(el(id),text));

/* ---------------------------------------------------------------- charts */
Chart.register({
  id: 'payoffLines',
  afterDatasetsDraw(c) {
    if (c.canvas.id !== 'chart-trajectory' || !el('toggle-lines').checked || !sim) return;
    const ctx = c.ctx, x = c.scales.x, y = c.scales.y;
    sim.schedules.filter(s => s.actualPayoff).forEach((s, i) => {
      const idx = c.data.labels.indexOf(s.actualPayoff);
      if (idx < 0) return;
      const px = x.getPixelForValue(idx);
      ctx.save();
      ctx.beginPath(); ctx.moveTo(px, y.top); ctx.lineTo(px, y.bottom);
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(239,68,68,.75)'; ctx.setLineDash([4,4]); ctx.stroke();
      ctx.fillStyle = '#ef4444'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'right';
      ctx.fillText(s.name + ' paid off (' + s.actualPayoff + ')', px - 6, y.top + 18 + i*16);
      ctx.restore();
    });
  }
});

const axisMoney = { grid:{color:'rgba(255,255,255,.05)'}, ticks:{color:'#94a3b8', callback:v=>fmtM(v)} };
const axisX = { grid:{color:'rgba(255,255,255,.05)'}, ticks:{color:'#94a3b8', maxTicksLimit:14} };
const baseOpts = () => ({
  responsive:true, maintainAspectRatio:false, interaction:{mode:'index', intersect:false},
  plugins:{ legend:{labels:{color:document.documentElement.dataset.theme==='dark'?'#a6b1c6':'#69758a', boxWidth:12}},
    tooltip:{callbacks:{label:c=>c.dataset.label+': '+fmt(c.parsed.y)}} },
  scales:{ x:axisX, y:axisMoney }
});
window.addEventListener('themechange',()=>{const dark=document.documentElement.dataset.theme==='dark';Chart.defaults.color=dark?'#a6b1c6':'#69758a';Object.values(charts).forEach(chart=>{Object.values(chart.options.scales||{}).forEach(axis=>{if(axis.ticks)axis.ticks.color=Chart.defaults.color;if(axis.grid)axis.grid.color=dark?'#344058':'#e3e7ef';});chart.update('none');});});
function upsert(key, canvasId, cfg) {
  if (isSingle()) cfg.data.datasets = cfg.data.datasets.filter(d=>!d.person2);
  if (charts[key]) charts[key].destroy();
  charts[key] = new Chart(document.getElementById(canvasId).getContext('2d'), cfg);
}

/* ------------------------------------------------------------------ run */
function run() {
  if (!config) return;
  schedulePlanner();
  sim = E.simulate(config);
  const years = sim.years;
  const labels = years.map(r => r.year);
  const P = config.incomes;
  const unit = real() ? " in today's dollars" : ' nominal';

  /* banner */
  const banner = el('status-banner'), text = el('banner-text');
  if (sim.depletedYear) {
    const r = years.find(x => x.year === sim.depletedYear);
    banner.className = 'alert-banner danger';
    text.textContent = `Spending goal is not fully funded from ${sim.depletedYear} (${r.person.map((p,i)=>p.name+' '+r.ages[i]).join(', ')}).`;
    el('m-depleted').textContent = sim.depletedYear;
    el('m-depleted').style.color = 'var(--danger)';
    el('m-depleted-sub').textContent = `ages ${agesText(r)}`;
  } else {
    banner.className = 'alert-banner success';
    text.textContent = `Spending goal is funded every year through age ${config.assumptions.targetDeathAge}.`;
    el('m-depleted').textContent = 'Never';
    el('m-depleted').style.color = 'var(--green)';
    el('m-depleted-sub').textContent = `plan runs to ${sim.endYear}`;
  }

  /* data-quality warnings */
  const warn = [];
  sim.schedules.forEach(s => {
    if (s.negativeAmortization) warn.push(`${s.name}: the payment does not cover the interest at this rate — the balance is growing.`);
    else if (s.mismatch) warn.push(`${s.name}: your configured payoff year is ${s.configuredPayoff}, but this rate and payment amortize to ${s.actualPayoff || 'never'}. The schedule is used, not the configured year.`);
  });
  el('warnings').innerHTML = warn.map(w => `<div class="alert-banner warn"><span>${w}</span></div>`).join('');

  el('m-goal').value = Math.round(config.assumptions.desiredMonthlyIncome);
  const last = years[years.length - 1];
  el('m-tax').textContent = fmt(real() ? years.reduce((s,r)=>s+r.totalTax*r.deflator, 0) : sim.lifetimeTax);
  el('m-refund').textContent = fmt(real() ? years.reduce((s,r)=>s+r.refund*r.deflator, 0) : sim.lifetimeRefunds);
  el('m-nw').textContent = fmt(real() ? sim.finalNetWorthReal : sim.finalNetWorth);
  el('m-nw-sub').textContent = real() ? "today's dollars" : sim.endYear + ' dollars';

  const maxSpend = E.maxSustainableSpend(config);
  el('m-max').textContent = fmt(maxSpend) + '/mo';
  el('m-max-sub').textContent = `to age ${config.assumptions.targetDeathAge}, today's dollars`;

  /* trajectory */
  upsert('traj', 'chart-trajectory', {
    type:'line',
    data:{ labels, datasets:[
      { label:'Investments'+unit, data: years.map(r=>D(r.portfolio,r)), borderColor:'#38bdf8', backgroundColor:'rgba(56,189,248,.35)', fill:true, tension:.1, pointRadius:0 },
      { label:'Rental equity', data: years.map(r=>D(r.rentalEquity,r)), borderColor:'#f97316', backgroundColor:'rgba(249,115,22,.35)', fill:true, tension:.1, pointRadius:0 },
      { label:'Home equity', data: years.map(r=>D(r.principalEquity,r)), borderColor:'#22c55e', backgroundColor:'rgba(34,197,94,.3)', fill:true, tension:.1, pointRadius:0 }
    ]},
    options: Object.assign(baseOpts(), { scales:{ x:axisX, y:Object.assign({stacked:true}, axisMoney) } })
  });

  /* net worth */
  upsert('nw', 'chart-networth', {
    type:'line',
    data:{ labels, datasets:[
      { label:'Net worth'+unit, data: years.map(r=>D(r.netWorth,r)), borderColor:'#a78bfa', backgroundColor:'rgba(167,139,250,.15)', fill:true, tension:.1, pointRadius:0, borderWidth:3 },
      { label:'Investments', data: years.map(r=>D(r.portfolio,r)), borderColor:'#38bdf8', tension:.1, pointRadius:0 },
      { label:'Home equity', data: years.map(r=>D(r.principalEquity,r)), borderColor:'#22c55e', tension:.1, pointRadius:0 },
      { label:'Rental equity', data: years.map(r=>D(r.rentalEquity,r)), borderColor:'#f97316', tension:.1, pointRadius:0 },
      { label:'Debt outstanding', data: years.map(r=>-D(r.debt,r)), borderColor:'#ef4444', tension:.1, pointRadius:0, borderDash:[5,4] }
    ]},
    options: baseOpts()
  });

  /* cash flow */
  upsert('cf', 'chart-cashflow', {
    type:'bar',
    data:{ labels, datasets:[
      { label:'Dividends', data:years.map(r=>D(r.dividends,r)), backgroundColor:'#eab308',stack:'i' },
      { label:'FHSA home purchase withdrawal', data:years.map(r=>D(r.fhsaQualifyingWithdrawal,r)),backgroundColor:'#14b8a6',stack:'i' },
      { label:'CPP/QPP contributions',data:years.map(r=>-D(r.payrollCPP,r)),backgroundColor:'#fb7185',stack:'cost' },
      { label:'Employment', data: years.map(r=>D(r.employment,r)), backgroundColor:'#64748b', stack:'i' },
      { label:'CPP + OAS + GIS', data: years.map(r=>D(r.cpp+r.oas+r.gis,r)), backgroundColor:'#22c55e', stack:'i' },
      { label:'DB pensions', data: years.map(r=>D(r.pension - r.pension2,r)), backgroundColor:'#a78bfa', stack:'i' },
      { label:'Other pensions', data: years.map(r=>D(r.pension2,r)), backgroundColor:'#c4b5fd', stack:'i' },
      { label:'Rental cash flow', data: years.map(r=>D(r.rentCash,r)), backgroundColor:'#f97316', stack:'i' },
      { label:'Sale proceeds', data: years.map(r=>D(r.saleProceeds,r)), backgroundColor:'#eab308', stack:'i' },
      { label:'RRIF minimum', data: years.map(r=>D(r.rrifForced,r)), backgroundColor:'#0ea5e9', stack:'i' },
      { label:'Portfolio draw', data: years.map(r=>D(r.discretionaryDraw,r)), backgroundColor:'#38bdf8', stack:'i' },
      { label:'Total tax', type:'line', data: years.map(r=>D(r.totalTax,r)), borderColor:'#ef4444', borderDash:[5,4], pointRadius:0, tension:.1 },
      { label:'Spending goal', type:'line', data: years.map(r=>D(r.spendTarget,r)), borderColor:document.documentElement.dataset.theme==='dark'?'#edf1fa':'#202b43', pointRadius:0, tension:.1, borderWidth:2 }
    ]},
    options: Object.assign(baseOpts(), { scales:{ x:Object.assign({stacked:true}, axisX), y:Object.assign({stacked:true}, axisMoney) } })
  });

  /* contributions */
  const working = years.filter(r => r.contributions > 0 || r.refund > 0);
  upsert('contrib', 'chart-contrib', {
    type:'bar',
    data:{ labels: working.map(r=>r.year), datasets:[
      { label:P[0].name+' RRSP', data: working.map(r=>D(sumContrib(r,'RRSP',P[0].name),r)), backgroundColor:'#38bdf8', stack:'c' },
      { person2:true, label:P[1].name+' RRSP', data: working.map(r=>D(sumContrib(r,'RRSP',P[1].name),r)), backgroundColor:'#0ea5e9', stack:'c' },
      { label:P[0].name+' TFSA', data: working.map(r=>D(sumContrib(r,'TFSA',P[0].name),r)), backgroundColor:'#22c55e', stack:'c' },
      { person2:true, label:P[1].name+' TFSA', data: working.map(r=>D(sumContrib(r,'TFSA',P[1].name),r)), backgroundColor:'#4ade80', stack:'c' },
      { label:'FHSA', data:working.map(r=>D(sumContrib(r,'FHSA',null),r)),backgroundColor:'#14b8a6',stack:'c' },
      { label:'Corporate', data:working.map(r=>D(sumContrib(r,'CORP',null),r)),backgroundColor:'#eab308',stack:'c' },
      { label:'DC pension', data:working.map(r=>D(sumContrib(r,'DC',null),r)),backgroundColor:'#c4b5fd',stack:'c' },
      { label:'Non-registered', data: working.map(r=>D(sumContrib(r,'TAXABLE',null),r)), backgroundColor:'#f97316', stack:'c' },
      { label:'Refund generated', type:'line', data: working.map(r=>D(r.refund,r)), borderColor:'#a78bfa', borderWidth:3, pointRadius:0, tension:.1 }
    ]},
    options: Object.assign(baseOpts(), { scales:{ x:Object.assign({stacked:true}, axisX), y:Object.assign({stacked:true}, axisMoney) } })
  });

  el('contrib-body').innerHTML = working.map(r => `<tr>
    <td>${r.year}</td>
    <td>${fmt(D(r.taxableIncome[0],r))}</td><td>${pct(r.marginalRates[0])}</td>
    ${isSingle()?'':`<td>${fmt(D(r.taxableIncome[1],r))}</td><td>${pct(r.marginalRates[1])}</td>`}
    <td style="color:var(--violet);font-weight:700">${(r.rrspTarget[0]+r.rrspTarget[1]) > 0 ? fmt(D(r.rrspTarget[0]+r.rrspTarget[1],r)) : '—'}</td>
    <td style="color:var(--accent)">${fmt(D(sumContrib(r,'RRSP',null),r))}</td>
    <td style="color:var(--green)">${fmt(D(sumContrib(r,'TFSA',null),r))}</td>
    <td>${fmt(D(r.employerContributions,r))}</td>
    <td>${fmt(D(r.hbpRepayments,r))}</td>
    <td style="color:var(--violet)">${fmt(D(r.refund,r))}</td>
    <td>${r.childcareClaim > 0 ? fmt(D(r.childcareClaim,r)) + (r.childcareClaim < r.childcareSpend ? ' <span class="pill">capped</span>' : '') : '—'}</td>
    <td>${r.rrspRoom.slice(0,isSingle()?1:2).map(v=>fmt(D(v,r))).join(' / ')}</td>
    <td>${r.tfsaRoom.slice(0,isSingle()?1:2).map(v=>fmt(D(v,r))).join(' / ')}</td>
  </tr>`).join('');

  renderTargetCard(years);
  renderLedger(years);
  renderTimeline();
}

/* This year's RRSP recommendation — the number you act on, not a setting. */
function renderTargetCard(years) {
  const now = new Date().getFullYear();
  const r = years.find(x => x.year === now) || years[0];
  const P = config.incomes;
  const rows = (isSingle()?[0]:[0,1])
    .filter(k => r.rrspTarget[k] > 0 || r.rrspPace[k] > 0)
    .map(k => {
      const gap = r.rrspTarget[k] - r.rrspPace[k];
      return `<div style="flex:1;min-width:260px">
        <div style="font-weight:800;font-size:1.05rem;margin-bottom:.35rem">${P[k].name}</div>
        <div style="font-size:2rem;font-weight:800;color:var(--violet);line-height:1.1">${fmt(r.rrspTarget[k])}</div>
        <div style="color:var(--muted);font-size:.8rem;margin:.3rem 0 .6rem">full calculated RRSP goal for ${r.year}, beyond payroll deposits</div>
        <div style="font-size:.85rem">Projection assumes ${config.assumptions.rrspGoalCompletion}%: <strong>${fmt(r.rrspTarget[k]*config.assumptions.rrspGoalCompletion/100)}</strong> contributed.</div><div style="font-size:.85rem">Configured pace: <strong>${fmt(r.rrspPace[k])}</strong> (${fmt(r.rrspPace[k]/12)}/mo)</div>
        <div style="font-size:.85rem;margin-top:.2rem">${
          gap > 1 ? `Top up <strong style="color:var(--accent)">${fmt(gap)}</strong> to complete the full target`
          : gap < -1 ? `<span style="color:#fde047">Ahead by ${fmt(-gap)} — you can ease off</span>`
          : `<span style="color:var(--green)">On target</span>` }</div>
        <div style="font-size:.78rem;color:var(--muted);margin-top:.4rem">Lands at ${pct(r.marginalRates[k])} marginal &middot; ${fmt(r.rrspRoom[k])} room left after</div>
      </div>`;
    });
  const card = el('target-card');
  if (!rows.length) { card.hidden = true; return; }
  card.hidden = false;
  card.innerHTML = `<div style="color:var(--muted);font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.9rem">This year's RRSP target</div>
    <div style="display:flex;gap:2rem;flex-wrap:wrap">${rows.join('')}</div>
    <div style="font-size:.78rem;color:var(--muted);margin-top:1rem;border-top:1px solid var(--line);padding-top:.7rem">
      Every extra dollar of bonus raises the target by exactly one dollar, so a February top-up of "whatever I'm short, plus the bonus" lands on target. Projections assume you hit this each year.</div>`;
}

function sumContrib(row, type, owner) {
  return row.accounts.filter(a => (a.type === type || (type === 'RRSP' && a.type === 'RRIF')) && (!owner || a.owner === owner))
    .reduce((s, a) => s + a.contrib, 0);
}

/* --------------------------------------------------------------- ledger */
function renderLedger(years) {
  el('ledger-body').innerHTML = years.map(r => `
    <tr class="clickable ${r.unfunded > 1 ? 'short' : ''} ${r.saleEvents.length ? 'sale' : ''}" onclick="showYear(${r.year})">
      <td>${r.year}${r.saleEvents.length ? ' <span class="pill">sale</span>' : ''}</td>
      <td>${agesText(r)}</td>
      <td>${fmt(D(r.employment+r.dividends,r))}</td>
      <td>${fmt(D(r.cpp + r.oas + r.pension + r.gis,r))}</td>
      <td>${fmt(D(r.rentCash,r))}</td>
      <td>${fmt(D(r.rrifForced,r))}</td>
      <td style="color:var(--orange)">${fmt(D(r.discretionaryDraw,r))}</td>
      <td style="color:#fca5a5">${fmt(D(r.totalTax,r))}</td>
      <td style="color:var(--green)">${fmt(D(r.netCash,r))}</td>
      <td>${fmt(D(r.spendTarget,r))}</td>
      <td style="color:var(--accent);font-weight:700">${fmt(D(r.portfolio,r))}</td>
      <td>${fmt(D(r.netWorth,r))}</td>
    </tr>`).join('');
}

function showYear(y) {
  const r = sim.years.find(x => x.year === y); if (!r) return;
  const P = config.incomes;
  let h = `<h2 style="margin:0;color:var(--accent)">${y} &middot; ages ${agesText(r)}</h2>
    <div style="color:var(--muted);font-size:.85rem;margin-top:.35rem">
      After-tax cash ${fmt(r.netCash)} against a goal of ${fmt(r.spendTarget)}
      ${r.unfunded > 1 ? `<span style="color:#fca5a5"> &mdash; short by ${fmt(r.unfunded)}</span>` : ''}
      ${r.surplus > 1 ? `<span style="color:#86efac"> &mdash; ${fmt(r.surplus)} surplus reinvested</span>` : ''}
      <div style="margin-top:.25rem">All figures below are ${y} dollars.</div>
    </div>`;

  if (r.saleEvents.length) {
    h += `<div class="modal-header">Property sale</div>`;
    r.saleEvents.forEach(s => {
      h += `<div class="modal-row"><span style="font-weight:700">${s.name}</span><span>${fmt(s.grossPrice)}</span></div>`;
      h += `<div class="modal-row"><span style="padding-left:1rem;color:var(--muted)">Selling costs</span><span>-${fmt(s.sellingCosts)}</span></div>`;
      h += `<div class="modal-row"><span style="padding-left:1rem;color:var(--muted)">Mortgage discharged</span><span>-${fmt(s.mortgageDischarged)}</span></div>`;
      h += `<div class="modal-row"><span style="padding-left:1rem;color:var(--green)">Cash released</span><span style="color:var(--green)">${fmt(s.netCash)}</span></div>`;
      if (s.exempt) h += `<div class="modal-row"><span style="padding-left:1rem;color:var(--muted)">Principal residence exemption — no tax on the gain</span><span></span></div>`;
      else {
        if (s.capitalLoss > 0) h += `<div class="modal-row"><span style="padding-left:1rem;color:#fca5a5">Capital loss ${fmt(s.capitalLoss)} — offsets capital gains only, not income</span><span></span></div>`;
        else h += `<div class="modal-row"><span style="padding-left:1rem;color:var(--muted)">Capital gain ${fmt(s.capitalGain)}, half taxable</span><span style="color:#fca5a5">${fmt(s.taxableGain)}</span></div>`;
        if (s.terminalLoss > 0) h += `<div class="modal-row"><span>Terminal loss (income deduction)</span><span>${fmt(s.terminalLoss)}</span></div>`;
        if (s.ccaRecapture > 0) h += `<div class="modal-row"><span style="padding-left:1rem;color:var(--muted)">CCA recapture (fully taxable)</span><span style="color:#fca5a5">${fmt(s.ccaRecapture)}</span></div>`;
      }
    });
  }

  h += `<div class="modal-header">Income and tax by person</div>`;
  r.person.forEach((p, i) => {
    h += `<div class="modal-row"><span style="font-weight:700">${p.name}</span><span class="pill">marginal ${pct(r.marginalRates[i])}</span></div>`;
    [['Employment',p.employment],['Eligible dividends',p.eligibleDividends],['Non-eligible dividends',p.nonEligibleDividends],['GIS',p.gis],['CPP/QPP contributions',-p.payrollCPP],['CPP',p.cpp],['OAS',p.oas],['DB lifetime',p.pension - p.pension2],['Other pension',p.pension2],['DB bridge',p.bridge],['RRIF minimum',p.rrif],['Rental income',p.rental],['Sale income',p.sale],['Unpaid HBP (taxable, no cash)',p.hbpShortfall]]
      .filter(x => Math.abs(x[1]) > 1)
      .forEach(x => h += `<div class="modal-row"><span style="padding-left:1rem;color:var(--muted)">${x[0]}</span><span style="color:var(--green)">${fmt(x[1])}</span></div>`);
    if (p.childcare > 1) h += `<div class="modal-row"><span style="padding-left:1rem;color:var(--muted)">Childcare deduction</span><span style="color:var(--accent)">-${fmt(p.childcare)}</span></div>`;
    if (p.deductible > 1) h += `<div class="modal-row"><span style="padding-left:1rem;color:var(--muted)">RRSP deduction</span><span style="color:var(--accent)">-${fmt(p.deductible)}</span></div>`;
    h += `<div class="modal-row"><span style="padding-left:1rem;color:var(--muted)">Income tax</span><span style="color:#fca5a5">-${fmt(p.tax)}</span></div>`;
    h += `<div class="modal-row"><span style="padding-left:1rem;color:var(--muted)">Federal / provincial tax</span><span>${fmt(p.federalTax)} / ${fmt(p.provincialTax)}</span></div>`;
    if(p.federalAgeAmount > 0) h += `<div class="modal-row"><span style="padding-left:1rem;color:var(--muted)">Federal age amount (before credit rate)</span><span>${fmt(p.federalAgeAmount)}</span></div>`;
    if (p.clawback > 1) h += `<div class="modal-row"><span style="padding-left:1rem;color:var(--muted)">OAS recovery tax</span><span style="color:#fca5a5">-${fmt(p.clawback)}</span></div>`;
    h += `<div class="modal-row"><span style="padding-left:1rem;color:var(--muted)">Room remaining (RRSP / TFSA)</span><span>${fmt(p.rrspRoom)} / ${fmt(p.tfsaRoom)}</span></div>`;
  });
  if (Math.abs(r.pensionSplit) > 1)
    h += `<div class="modal-row"><span>Pension income split to ${r.pensionSplit > 0 ? P[1].name : P[0].name}</span><span>${fmt(Math.abs(r.pensionSplit))}</span></div>`;
  if(config.assumptions.province==='QC') h += `<div class="modal-row"><span>Quebec pension income split</span><span>${fmt(Math.abs(r.provincialPensionSplit))}</span></div>`;
  if (r.refund > 1)
    h += `<div class="modal-row"><span>Refund generated, reinvested next year</span><span style="color:var(--violet)">${fmt(r.refund)}</span></div>`;
  if (r.childcareClaim > 0 && r.childcareClaim < r.childcareSpend)
    h += `<div class="modal-row"><span style="color:#fde047">Childcare spend ${fmt(r.childcareSpend)} exceeds the CRA cap of ${fmt(r.childcareCap)}</span><span style="color:#fde047">${fmt(r.childcareSpend - r.childcareClaim)} not deductible</span></div>`;

  if(r.fhsaQualifyingWithdrawal>0) h+=`<div class="modal-row"><span>FHSA qualifying withdrawal (tax free)</span><span>${fmt(r.fhsaQualifyingWithdrawal)}</span></div>`;
  if (r.rentals.length) {
    h+='<div class="modal-header">Each rental property</div>';
    r.rentals.forEach(p=>{ h+=`<div class="modal-row"><span>${p.name}: cash ${fmt(p.cash)} &middot; taxable ${fmt(p.taxable)}</span><span>CCA ${fmt(p.cca)} &middot; UCC ${fmt(p.ucc)}</span></div>`; });
  }
  if (r.rentGross > 0) {
    h += `<div class="modal-header">Rental property</div>`;
    h += `<div class="modal-row"><span>Rent collected (after vacancy)</span><span>${fmt(r.rentGross)}</span></div>`;
    h += `<div class="modal-row"><span>Operating costs</span><span>-${fmt(r.rentOpex)}</span></div>`;
    h += `<div class="modal-row"><span>Debt payments</span><span>-${fmt(r.rentPayment)}</span></div>`;
    h += `<div class="modal-row"><span>Cash flow</span><span style="color:${r.rentCash>=0?'var(--green)':'#fca5a5'}">${fmt(r.rentCash)}</span></div>`;
    h += `<div class="modal-row"><span>Deductible interest</span><span>${fmt(r.rentInterest)}</span></div>`;
    if (r.ccaClaim > 0) h += `<div class="modal-row"><span>CCA claimed (UCC left ${fmt(r.uccRemaining)})</span><span>-${fmt(r.ccaClaim)}</span></div>`;
    h += `<div class="modal-row"><span>Taxable rental income</span><span>${fmt(r.rentTaxable)}</span></div>`;
  }

  h += `<div class="modal-header">Accounts</div>`;
  r.accounts.forEach(a => {
    const bits = [];
    if (a.contrib > 1) bits.push(`<span style="color:var(--accent)">+${fmt(a.contrib)} in</span>`);
    if (a.forced > 1) bits.push(`<span style="color:#0ea5e9">-${fmt(a.forced)} RRIF min</span>`);
    if (a.corporateTax > 1) bits.push(`<span>Corporate tax ${fmt(a.corporateTax)}</span>`);
    if (a.qualifyingWithdrawal > 1) bits.push(`<span>Home purchase ${fmt(a.qualifyingWithdrawal)}</span>`);
    if (a.draw > 1) bits.push(`<span style="color:var(--orange)">-${fmt(a.draw)} drawn</span>`);
    bits.push(`<span style="color:${a.growth>=0?'var(--green)':'#fca5a5'}">${a.growth>=0?'+':''}${fmt(a.growth)} growth</span>`);
    h += `<div style="margin-bottom:.9rem;padding-bottom:.9rem;border-bottom:1px solid var(--line)">
      <div style="font-weight:700">${a.owner} &middot; ${a.name} <span class="pill">${a.type}</span></div>
      <div style="display:flex;justify-content:space-between;gap:1rem;font-size:.82rem;color:var(--muted);margin-top:.3rem;flex-wrap:wrap">
        <span>Start ${fmt(a.start)}</span><div style="display:flex;gap:.9rem;flex-wrap:wrap">${bits.join('')}</div>
        <span style="color:#fff;font-weight:700">End ${fmt(a.end)}</span>
      </div></div>`;
  });

  const liveDebt = r.debts.filter(d => d.balance > 1 || d.payment > 1);
  if (liveDebt.length) {
    h += `<div class="modal-header">Debt</div>`;
    liveDebt.forEach(d => {
      h += `<div class="modal-row"><span>${d.name}</span><span>${fmt(d.balance)} owing &middot; ${fmt(d.interest)} interest &middot; ${fmt(d.payment)} paid</span></div>`;
    });
  }

  el('detail-modal-content').innerHTML = h;
  el('detail-modal').style.display = 'flex';
}

/* ------------------------------------------------------------- timeline */
function renderTimeline() {
  const now = new Date().getFullYear();
  el('timeline-list').innerHTML = E.buildTimeline(config, sim).map(e =>
    `<li><span class="yr">${e.year}</span><span>${e.label}<div class="ago">${e.year - now <= 0 ? 'this year' : 'in ' + (e.year - now) + ' years'}</div></span></li>`
  ).join('');
}

/* ------------------------------------------------------------------ CSV */
function exportCsv() {
  if (!sim) return;
  const cols = ['year','age1','age2','employment','cpp','oas','db_pension','other_pension','rental_cash','rental_taxable','cca_claimed',
    'rrif_minimum','portfolio_draw','rrsp_target','rrsp_contrib','tfsa_contrib','employer_contrib','hbp_repayment','refund',
    'childcare_claim','marginal_1','marginal_2','income_tax','oas_clawback','after_tax_cash','spending_goal','shortfall',
    'sale_proceeds','investments','home_equity','rental_equity','debt','net_worth','deflator','gis','dividends','cpp_qpp_contributions','fhsa_qualifying_withdrawal'];
  const rows = sim.years.map(r => [r.year,r.ages[0],r.ages[1],r.employment,r.cpp,r.oas,r.pension - r.pension2,r.pension2,r.rentCash,r.rentTaxable,r.ccaClaim,
    r.rrifForced,r.discretionaryDraw,r.rrspTarget[0]+r.rrspTarget[1],sumContrib(r,'RRSP',null),sumContrib(r,'TFSA',null),r.employerContributions,r.hbpRepayments,r.refund,
    r.childcareClaim,r.marginalRates[0],r.marginalRates[1],r.incomeTax,r.oasClawback,r.netCash,r.spendTarget,r.unfunded,
    r.saleProceeds,r.portfolio,r.principalEquity,r.rentalEquity,r.debt,r.netWorth,r.deflator,r.gis,r.dividends,r.payrollCPP,r.fhsaQualifyingWithdrawal]
    .filter((v,i)=>!isSingle() || ![2,21].includes(i))
    .map(v => typeof v === 'number' ? (Math.abs(v) < 2 && v !== 0 ? v.toFixed(4) : Math.round(v)) : v).join(','));
  const blob = new Blob([cols.filter((v,i)=>!isSingle() || ![2,21].includes(i)).join(',') + '\n' + rows.join('\n')], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'retirement-ledger-' + new Date().toISOString().slice(0,10) + '.csv';
  a.click(); URL.revokeObjectURL(a.href);
}

/* ---------------------------------------------------------- monte carlo */
function runMonteCarlo() {
  const runs = +el('mc-runs').value;
  config.assumptions.mcVolatility = +el('mc-vol').value;
  config.assumptions.mcRuns = runs;
  el('mc-status').textContent = 'Running…';
  E.monteCarloRun(config, runs, 20260806,
    p => { el('mc-bar').style.width = (p*100).toFixed(0) + '%'; },
    res => {
      el('mc-status').textContent = runs + ' runs complete';
      el('mc-success').textContent = (res.successRate*100).toFixed(1) + '%';
      el('mc-success').style.color = res.successRate >= .85 ? 'var(--green)' : res.successRate >= .7 ? 'var(--orange)' : 'var(--danger)';
      const finals = res.results.map(r => r.finalNetWorth).sort((a,b)=>a-b);
      el('mc-median').textContent = fmt(finals[Math.floor(finals.length/2)]);
      el('mc-worst').textContent = fmt(finals[Math.floor(finals.length*0.1)]);
      upsert('mc', 'chart-mc', {
        type:'line',
        data:{ labels: res.bands.map(b => b.year), datasets:[
          { label:'90th percentile', data:res.bands.map(b=>b.p90), borderColor:'rgba(34,197,94,.6)', pointRadius:0, tension:.1 },
          { label:'75th', data:res.bands.map(b=>b.p75), borderColor:'rgba(56,189,248,.5)', pointRadius:0, tension:.1 },
          { label:'Median', data:res.bands.map(b=>b.p50), borderColor:'#38bdf8', borderWidth:3, pointRadius:0, tension:.1 },
          { label:'25th', data:res.bands.map(b=>b.p25), borderColor:'rgba(249,115,22,.6)', pointRadius:0, tension:.1 },
          { label:'10th percentile', data:res.bands.map(b=>b.p10), borderColor:'rgba(239,68,68,.7)', pointRadius:0, tension:.1 }
        ]},
        options: baseOpts()
      });
      AppStorage.fetch('/api/config', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(config)});
    });
}

/* ------------------------------------------------------------ scenarios */
async function loadScenarios() {
  const list = await (await AppStorage.fetch('/api/scenarios')).json();
  el('scenario-list').innerHTML = list.length ? '' : '<div style="color:var(--muted);font-size:.85rem">No saved scenarios yet.</div>';
  list.forEach(s => {
    const div = document.createElement('div');
    div.className = 'scenario-row';
    div.innerHTML = `<div><strong>${s.name}</strong><div style="font-size:.72rem;color:var(--muted)">saved ${new Date(s.savedAt).toLocaleString('en-CA')}</div></div>`;
    const acts = document.createElement('div');
    acts.style.display = 'flex'; acts.style.gap = '.5rem';
    const cmp = document.createElement('button'); cmp.className='btn ghost'; cmp.textContent='Compare';
    cmp.onclick = () => compareScenario(s);
    const ld = document.createElement('button'); ld.className='btn ghost'; ld.textContent='Load';
    ld.onclick = () => AppStorage.fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(s.config)});
    const del = document.createElement('button'); del.className='btn ghost'; del.textContent='Delete';
    del.onclick = async () => { await AppStorage.fetch('/api/scenarios/' + encodeURIComponent(s.name), {method:'DELETE'}); loadScenarios(); };
    acts.append(cmp, ld, del); div.appendChild(acts);
    el('scenario-list').appendChild(div);
  });
}
async function saveScenario() {
  const name = el('scenario-name').value.trim();
  if (!name) { el('scenario-name').focus(); return; }
  await AppStorage.fetch('/api/scenarios', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name, config})});
  el('scenario-name').value = '';
  loadScenarios();
}
function compareScenario(s) {
  scenarioSims[s.name] = E.simulate(s.config);
  const palette = ['#38bdf8','#f97316','#a78bfa','#22c55e','#ef4444','#eab308'];
  const pick = r => real() ? r.netWorth * r.deflator : r.netWorth;
  const datasets = [{ label:'Current plan', data: sim.years.map(r=>({x:r.year,y:pick(r)})), borderColor:document.documentElement.dataset.theme==='dark'?'#edf1fa':'#202b43', borderWidth:3, pointRadius:0, tension:.1 }];
  Object.keys(scenarioSims).forEach((k,i) => datasets.push({
    label:k, data: scenarioSims[k].years.map(r=>({x:r.year,y:pick(r)})),
    borderColor: palette[i % palette.length], pointRadius:0, tension:.1
  }));
  upsert('sc', 'chart-scenarios', {
    type:'line', data:{datasets},
    options: Object.assign(baseOpts(), { scales:{ x:Object.assign({type:'linear'}, axisX), y:axisMoney } })
  });
}
async function backupNow() {
  const r = await (await AppStorage.fetch('/api/backup', {method:'POST'})).json();
  alert(r.ok ? 'Backed up to ' + r.file : 'Backup failed');
}
loadScenarios();
