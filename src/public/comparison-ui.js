(function(root){
  'use strict';
  const E=RetireEngine,money=v=>Number(v||0).toLocaleString('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0});
  const names={'tfsa-first':'TFSA first','rrsp-first':'RRSP first','taxable-first':'Non-registered first','min-tax':'Fill first tax bracket','oas-smart':'Manage OAS recovery'};
  const explanations={'tfsa-first':'Use tax-free savings first, then non-registered investments, then RRSPs. This limits taxable withdrawals now but can leave larger registered balances for later.', 'rrsp-first':'Use RRSPs first, then non-registered investments, then TFSAs. Earlier registered withdrawals can spread taxable income across more years, at the cost of paying tax sooner.', 'taxable-first':'Use non-registered investments first, then RRSPs, then TFSAs. The taxable portion follows your investment cost basis.', 'min-tax':'Draw registered savings toward the first federal bracket, then use other accounts for spending. This is a yearly rule; the lowest current bracket does not guarantee the lowest lifetime tax.', 'oas-smart':'Draw registered savings toward the OAS recovery threshold, then use other accounts. Other taxable income can still cause OAS recovery.'};
  const copy=v=>JSON.parse(JSON.stringify(v)),key=v=>JSON.stringify(E.normalizeConfig(v));
  function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
  function delta(value,good){return el('span',(Math.abs(value)<.5?'No change':(value>0?'+':'−')+money(Math.abs(value)))+(Math.abs(value)<.5?'':good?' · better':' · worse'),Math.abs(value)<.5?'delta-neutral':good?'delta-positive':'delta-negative');}
  function mount(parent,{task,getConfig,onApply}){
    const rental=task==='rental',section=el('section',null,'card comparison-tool');section.dataset.comparison=task;
    section.append(el('h2',rental?'When should I sell my rental?':'Calculate the best withdrawal options'));
    section.append(el('p',rental?'Compare keeping your rental with selling at the start of each projected year. Rental income stops on sale; tax, CCA recapture, debt, lost rent and invested proceeds flow through your household plan.':'This is the Withdrawal strategy finder used by the withdrawal order control. Compare all five orders at your current spending goal, then use the annual schedule search below for finer tax and estate adjustments.','section-description'));
    const controls=el('div',null,'form-grid'),property=el('select'),cca=el('input');cca.type='checkbox';cca.checked=true;
    if(rental){
      property.setAttribute('aria-label','Rental property to compare');
      getConfig().realEstate.forEach((p,i)=>{if(p.type==='rental')property.append(new Option(p.name,String(i)));});
      const label=el('label','Rental property to compare');label.append(property);controls.append(label);
      const toggle=el('label','Also compare stopping future CCA claims');toggle.prepend(cca);controls.append(toggle);
      section.append(controls,el('p','Before calculating, check Properties → Advanced options: purchase cost, building cost excluding land, building share of sale proceeds, remaining UCC, ownership, selling costs, rental expenses and debt. Historical CCA is still recaptured when future claims are disabled.','inline-help'));
    }
    const actions=el('div',null,'row-actions'),run=el('button',rental?'Calculate best sale years':'Compare withdrawal options','btn'),cancel=el('button','Cancel comparison','btn ghost'),status=el('p',rental?'Uses the values currently entered on this page.':'Choose a comparison to see changes from your current settings.','tool-status'),output=el('div');
    status.setAttribute('role','status');cancel.hidden=true;run.type=cancel.type='button';actions.append(run,cancel);section.append(actions,status,output);parent.append(section);
    let worker=null,revision=0,snapshot=null,source=null;
    function stop(){revision++;worker?.terminate();worker=null;run.disabled=rental&&!property.options.length;cancel.hidden=true;section.setAttribute('aria-busy','false');}
    function invalidate(){stop();output.replaceChildren();status.textContent='Inputs changed. Calculate again to update the comparison.';}
    property.onchange=cca.onchange=invalidate;
    cancel.onclick=()=>{stop();output.replaceChildren();status.textContent='Comparison cancelled.';};
    run.disabled=rental&&!property.options.length;
    if(run.disabled)status.textContent='Add a rental property above to compare sale dates.';
    function review(row,result){
      let panel=output.querySelector('.comparison-detail');if(!panel){panel=el('div',null,'comparison-detail');output.append(panel);}panel.replaceChildren(el('h3',rental?row.label:row.label==='Current settings'?row.label:names[row.strategy]));
      if(rental&&row.sale){
        const s=row.sale;
        [['Sale price',s.grossPrice],['Selling costs',s.sellingCosts],['Mortgage discharged',s.mortgageDischarged],['Cash before income tax',s.netCash],['Capital gain / land loss',s.capitalGain],['Taxable capital gain (50%)',s.taxableGain],['CCA recapture (100% taxable)',s.ccaRecapture],['Terminal loss deduction',s.terminalLoss],['Estimated household sale-income tax, including OAS recovery',row.saleIncomeTax]].forEach(([label,value])=>panel.append(el('p',label+': '+money(value))));
        panel.append(el('small','The tax estimate holds other income and withdrawals constant and includes all property sales in that year. Lifetime comparisons also reflect later GIS changes. Attached HELOCs remain payable under their entered schedules.'));
      }
      if(!rental){panel.append(el('p',explanations[row.strategy]));if(row.plan)panel.append(el('p','Your saved annual withdrawal targets also apply to this current-settings row.'));panel.append(el('p','Estimated sustainable monthly spending: '+money(row.monthlySpend)+' in today’s dollars. Applying selects this withdrawal order and keeps your current spending goal. This estimate uses your return assumptions, up to the calculator’s $40,000/month search limit.'));}
      panel.append(el('p',row.funded?'Current spending is funded throughout the comparison.':'Current spending first falls short in '+row.shortfallYear+'.'));
      const apply=el('button',rental?'Use this sale and CCA setting':'Use this withdrawal order','btn');apply.type='button';
      apply.disabled=row===result.rows[0];
      apply.onclick=()=>{
        if(key(getConfig())!==source){invalidate();return;}
        const c=copy(snapshot);
        if(rental){c.realEstate[result.propertyIndex].saleYear=row.year;c.realEstate[result.propertyIndex].ccaEnabled=row.cca;delete c.assumptions.withdrawalPlan;}
        else {c.assumptions.withdrawalStrategy=row.strategy;c.assumptions.withdrawalPlan=row.plan;}
        stop();onApply(c);output.replaceChildren();status.textContent='Applied on this page. Save your plan to keep the change.';
      };panel.append(apply);
      panel.scrollIntoView({behavior:'smooth',block:'nearest'});
    }
    function show(result){
      output.replaceChildren();const cards=el('div',null,'comparison-cards');
      [['Lowest lifetime tax',result.bestTax],['Highest ending net worth',result.bestEstate],...(!rental?[['Most monthly spending',result.bestSpending]]:[])].forEach(([title,row])=>{
        const card=el('div',null,'metric-card');card.append(el('h3',title));
        if(row){const measure=title==='Lowest lifetime tax'?'tax':title==='Most monthly spending'?'monthlySpend':'estate';card.append(el('strong',money(row[measure])+(measure==='monthlySpend'?'/mo':'')),el('p',rental?row.label:row.label==='Current settings'?row.label:names[row.strategy]));const difference=row[measure]-result.rows[0][measure];card.append(delta(difference,measure==='tax'?difference<0:difference>0));const b=el('button','Review option','btn ghost');b.onclick=()=>review(row,result);card.append(b);}else card.append(el('p','No tested option funds your current spending.'));
        cards.append(card);
      });output.append(cards);
      const scroll=el('div',null,'data-scroll'),table=el('table'),head=el('thead'),hr=el('tr');
      const headers=rental?['Option','Future CCA','Lifetime tax','Tax change','Ending net worth','Net worth change','Spending funded','Review']:['Withdrawal order','Lifetime tax','Tax change','Ending net worth','Net worth change','Sustainable spending /mo','Spending change /mo','Spending funded','Review'];
      headers.forEach(h=>{const th=el('th',h);th.scope='col';hr.append(th);});head.append(hr);table.append(head);const body=el('tbody'),base=result.rows[0];
      result.rows.forEach(row=>{
        const tr=el('tr'),values=[rental?row.label:row.label==='Current settings'?row.label:names[row.strategy],...(rental?[row.cca?'Claim CCA':'No new claims']:[]),money(row.tax),delta(row.tax-base.tax,row.tax<base.tax),money(row.estate),delta(row.estate-base.estate,row.estate>base.estate),...(!rental?[money(row.monthlySpend),delta(row.monthlySpend-base.monthlySpend,row.monthlySpend>base.monthlySpend)]:[]),row.funded?'Yes':'Shortfall '+row.shortfallYear];
        values.forEach(v=>{const td=el('td');td.append(v instanceof Node?v:document.createTextNode(v));tr.append(td);});const td=el('td'),b=el('button','Review','btn ghost');b.onclick=()=>review(row,result);td.append(b);tr.append(td);body.append(tr);
      });table.append(body);scroll.append(table);output.append(scroll);
      status.textContent='Compared '+result.rows.length+' options. Changes are versus Current settings. Tax is in future dollars; ending net worth is in today’s dollars. '+(rental?'Every option includes terminal tax at the configured lifespans so keeping a rental also recognizes its future tax liability. Alternatives recalculate withdrawals without a saved annual schedule; applying clears that schedule. ':'Tax and net worth recommendations fund the current spending goal. ')+'Best among the options tested, under your assumptions.';
      if(rental){
        const notes=el('details'),summary=el('summary','Tax rules and comparison assumptions');notes.append(summary);
        notes.append(el('p','Rules checked September 8, 2026: 50% capital gains inclusion; recapture is ordinary income. CCA cannot create or increase an aggregate rental loss. Each building is treated as a separate CCA class emptied on sale. The search assumes an established, personally owned long-term rental, with no change of use or principal-residence exemption. Corporate rentals, flipped property, GST/HST, capital-loss carryovers and special elections are outside this comparison. Future brackets follow the app’s indexed tax assumptions.'));
        [['CRA rental income guide','https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4036/rental-income.html'],['Capital gains increase cancelled','https://www.pm.gc.ca/en/news/news-releases/2025/03/21/prime-minister-mark-carney-cancels-proposed-capital-gains-tax-increase']].forEach(([title,url])=>{const p=el('p'),a=el('a',title);a.href=url;a.target='_blank';a.rel='noopener noreferrer';p.append(a);notes.append(p);});output.append(notes);
      }
    }
    run.onclick=()=>{
      stop();const id=revision;snapshot=copy(getConfig());source=key(snapshot);run.disabled=true;cancel.hidden=false;output.replaceChildren();status.textContent='Comparing full household projections…';section.setAttribute('aria-busy','true');
      try{
        worker=AppWorkers.create('comparison');
        const fail=message=>{stop();status.textContent=message;};
        worker.onerror=()=>{if(id===revision)fail('Comparison failed. Try again.');};
        worker.onmessage=({data})=>{if(id!==revision||data.id!==id)return;if(!section.isConnected){stop();return;}if(key(getConfig())!==source){invalidate();return;}if(data.error){fail(data.error);return;}if(data.progress){status.textContent='Compared '+data.progress.evaluated+' of '+data.progress.maxEvaluations+' options.';return;}stop();show(data.result);};
        worker.postMessage({id,task,config:snapshot,propertyIndex:Number(property.value),compareCCA:cca.checked});
      }catch(error){stop();status.textContent=error.message;}
    };
    window.addEventListener('pagehide',stop,{once:true});
    return {run:()=>run.click(),invalidate};
  }
  root.PlanComparison={mount,delta,names};
})(window);
