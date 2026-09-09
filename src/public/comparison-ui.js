(function(root){
  'use strict';
  const E=RetireEngine,money=v=>Number(v||0).toLocaleString('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0});
  const names={'tfsa-first':'TFSA first','rrsp-first':'RRSP first','taxable-first':'Non-registered first','min-tax':'Fill first tax bracket','oas-smart':'Manage OAS recovery'};
  const explanations={'tfsa-first':'Use tax-free savings first, then non-registered investments, then RRSPs. This limits taxable withdrawals now but can leave larger registered balances for later.', 'rrsp-first':'Use RRSPs first, then non-registered investments, then TFSAs. Earlier registered withdrawals can spread taxable income across more years, at the cost of paying tax sooner.', 'taxable-first':'Use non-registered investments first, then RRSPs, then TFSAs. The taxable portion follows your investment cost basis.', 'min-tax':'Draw registered savings toward the first federal bracket, then use other accounts for spending. This is a yearly rule; the lowest current bracket does not guarantee the lowest lifetime tax.', 'oas-smart':'Draw registered savings toward the OAS recovery threshold, then use other accounts. Other taxable income can still cause OAS recovery.'};
  const copy=v=>JSON.parse(JSON.stringify(v)),key=v=>JSON.stringify(E.normalizeConfig(v));
  function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
  const signedMoney=value=>(value>0?'+':value<0?'\u2212':'')+money(Math.abs(value));
  const spendingText=row=>money(row.monthlySpend)+(row.spendingAtLimit?'+':'')+'/mo';
  function delta(value,good){return el('span',(Math.abs(value)<.5?'No change':(value>0?'+':'−')+money(Math.abs(value)))+(Math.abs(value)<.5?'':good?' · better':' · worse'),Math.abs(value)<.5?'delta-neutral':good?'delta-positive':'delta-negative');}
  function mount(parent,{task,getConfig,onApply}){
    const rental=task==='rental',section=el('section',null,'card comparison-tool');section.dataset.comparison=task;
    section.append(el('h2',rental?'When should I sell my rental?':'Calculate the best withdrawal options'));
    section.append(el('p',rental?'Find which sale year — or combination of sale years, if you pick more than one rental — supports the most after-tax retirement spending each month. The recommendation compares net wealth and income against keeping the selected rentals. Tax and inheritance trade-offs are available below the spending results.':'This is the Withdrawal strategy finder used by the withdrawal order control. Compare all five orders at your current spending goal, then use the annual schedule search below for finer tax and estate adjustments.','section-description'));
    const controls=el('div',null,'form-grid'),cca=el('input');cca.type='checkbox';cca.checked=true;
    let propertyChecks=[];
    if(rental){
      const rentals=[];getConfig().realEstate.forEach((p,i)=>{if(p.type==='rental')rentals.push({index:i,name:p.name});});
      propertyChecks=rentals.map((p,n)=>{
        const box=el('input');box.type='checkbox';box.checked=n===0;box.value=String(p.index);
        const label=el('label',p.name);label.prepend(box);controls.append(label);
        return box;
      });
      const toggle=el('label','Also compare stopping future CCA claims');toggle.prepend(cca);controls.append(toggle);
      section.append(controls,el('p','Select one or more rentals to find the best sale years for each jointly. Before calculating, check Properties → Advanced options: purchase cost, building cost excluding land, building share of sale proceeds, remaining UCC, ownership, selling costs, rental expenses and debt. Historical CCA is still recaptured when future claims are disabled.','inline-help'));
    }
    function selectedIndices(){return propertyChecks.filter(b=>b.checked).map(b=>Number(b.value));}
    const actions=el('div',null,'row-actions'),run=el('button',rental?'Calculate best sale years':'Compare withdrawal options','btn'),cancel=el('button','Cancel comparison','btn ghost'),status=el('p',rental?'Uses the values in this planning workspace.':'Choose a comparison to see changes from your current settings.','tool-status'),output=el('div');
    status.setAttribute('role','status');cancel.hidden=true;run.type=cancel.type='button';actions.append(run,cancel);section.append(actions,status,output);parent.append(section);
    let worker=null,revision=0,snapshot=null,source=null;
    function stop(){revision++;worker?.terminate();worker=null;run.disabled=rental&&!propertyChecks.length;cancel.hidden=true;section.setAttribute('aria-busy','false');}
    function invalidate(){stop();output.replaceChildren();status.textContent='Inputs changed. Calculate again to update the comparison.';}
    propertyChecks.forEach(box=>box.onchange=invalidate);cca.onchange=invalidate;
    cancel.onclick=()=>{stop();output.replaceChildren();status.textContent='Comparison cancelled.';};
    run.disabled=rental&&!propertyChecks.length;
    if(run.disabled)status.textContent='Add a rental under Configuration > Properties to compare sale dates.';
    function review(row,result){
      let panel=output.querySelector('.comparison-detail');if(!panel){panel=el('div',null,'comparison-detail');output.append(panel);}panel.replaceChildren(el('h3',rental?row.label:row.label==='Current settings'?row.label:names[row.strategy]));
      if(rental){
        panel.append(el('p','Estimated after-tax retirement spending: '+spendingText(row)+' in today\u2019s dollars.'),el('p',signedMoney(row.spendingChange)+'/mo versus current settings. Applying keeps your spending goal; review it separately after choosing a sale date.'));
        const sold=row.sales.filter(s=>s.year);
        if(sold.length)panel.append(el('p','Ages in the sale year: '+sold.map(s=>s.name+' '+s.year+' ('+snapshot.incomes.slice(0,snapshot.assumptions.householdType==='single'?1:2).map(p=>p.name+' '+(s.year-p.birthYear)).join(', ')+')').join('; ')+'.'));
      }
      if(rental)row.sales.filter(s=>s.sale).forEach(s=>{
        if(row.sales.length>1)panel.append(el('h4',s.name));
        [['Sale price',s.sale.grossPrice],['Selling costs',s.sale.sellingCosts],['Mortgage discharged',s.sale.mortgageDischarged],['Cash before income tax',s.sale.netCash],['Capital gain / land loss',s.sale.capitalGain],['Taxable capital gain (50%)',s.sale.taxableGain],['CCA recapture (100% taxable)',s.sale.ccaRecapture],['Terminal loss deduction',s.sale.terminalLoss]].forEach(([label,value])=>panel.append(el('p',label+': '+money(value))));
      });
      if(rental){const years=new Set();row.sales.filter(s=>s.sale).forEach(s=>{if(!years.has(s.year)){years.add(s.year);panel.append(el('p',s.year+' estimated household sale-income tax, including OAS recovery: '+money(s.saleIncomeTax)));}});}
      if(rental&&row.sales.some(s=>s.sale))panel.append(el('small','The tax estimate holds other income and withdrawals constant and includes all property sales in that year. Lifetime comparisons also reflect later GIS changes. Attached HELOCs remain payable under their entered schedules.'));
      if(!rental){panel.append(el('p',explanations[row.strategy]));if(row.plan)panel.append(el('p','Your saved annual withdrawal targets also apply to this current-settings row.'));panel.append(el('p','Estimated sustainable monthly spending: '+money(row.monthlySpend)+' in today’s dollars. Applying selects this withdrawal order and keeps your current spending goal. This estimate uses your return assumptions, up to the calculator’s $40,000/month search limit.'));}
      panel.append(el('p',row.funded?'Current spending is funded throughout the comparison.':'Current spending first falls short in '+row.shortfallYear+'.'));
      const apply=el('button',rental?'Use this sale and CCA setting':'Use this withdrawal order','btn');apply.type='button';
      apply.disabled=row===result.rows[0];
      apply.onclick=()=>{
        if(key(getConfig())!==source){invalidate();return;}
        const c=copy(snapshot);
        if(rental){row.sales.forEach(s=>{c.realEstate[s.index].saleYear=s.year;c.realEstate[s.index].ccaEnabled=s.cca;});delete c.assumptions.withdrawalPlan;}
        else {c.assumptions.withdrawalStrategy=row.strategy;c.assumptions.withdrawalPlan=row.plan;}
        stop();onApply(c);output.replaceChildren();status.textContent='Applied on this page. Save your plan to keep the change.';
      };panel.append(apply);
      panel.scrollIntoView({behavior:'smooth',block:'nearest'});
    }
    function show(result){
      output.replaceChildren();
      const base=result.rows[0],cards=el('div',null,'comparison-cards');
      function reviewButton(row){const b=el('button','Review option','btn ghost');b.type='button';b.onclick=()=>review(row,result);return b;}
      function metricCard(title,row,measure){
        const card=el('div',null,'metric-card');card.append(el('h3',title));
        if(row){
          card.append(el('strong',measure==='monthlySpend'?spendingText(row):money(row[measure])),el('p',rental?row.label:row.label==='Current settings'?row.label:names[row.strategy]));
          const difference=row[measure]-base[measure];
          card.append(rental&&measure==='tax'?el('span',signedMoney(difference)+' in tax','delta-neutral'):delta(difference,measure==='tax'?difference<0:difference>0));
          if(rental)card.append(el('p','Spending capacity: '+spendingText(row)+' ('+signedMoney(row.spendingChange)+'/mo).'));
          card.append(reviewButton(row));
        }else card.append(el('p','No tested option funds your current spending.'));
        return card;
      }
      const supporting=el('details',null,'comparison-supporting');
      if(rental){
        const current=el('div',null,'metric-card');current.append(el('h3','Current spending capacity'),el('strong',spendingText(base)),el('p','After tax, in today\u2019s dollars, using your current sale and CCA settings.'),reviewButton(base));cards.append(current);
        const best=result.bestSpending,recommendation=el('div',null,'metric-card spending-recommendation');
        recommendation.append(el('h3','Most retirement spending'));
        const gain=el('strong',signedMoney(best.spendingChange)+'/mo',best.spendingChange>0?'delta-positive':'delta-neutral');
        recommendation.append(gain,el('p',best.monthlySpend>0?best.label:'No tested option supports positive spending throughout the plan.'),el('p','Estimated total: '+spendingText(best)),el('p',best.spendingChange>0?'Extra spending capacity versus current settings.':'No tested change increases spending capacity.'),reviewButton(best));cards.append(recommendation);
        if(result.keepRow&&best!==result.keepRow&&best.wealthAtMaxSpend&&result.keepRow.wealthAtMaxSpend){
          const w=best.wealthAtMaxSpend,k=result.keepRow.wealthAtMaxSpend,compare=el('div',null,'metric-card spending-recommendation-compare');
          const wealthLine=(label,diff,higherIsBetter)=>{const p=el('p',label+': ');p.append(delta(diff,higherIsBetter?diff>0:diff<0));return p;};
          compare.append(el('h3','Compared with keeping selected rentals'),
            el('p',signedMoney(best.monthlySpend-result.keepRow.monthlySpend)+'/mo versus keeping ('+spendingText(result.keepRow)+'). Both figures assume spending the maximum sustainable amount each way, in today’s dollars.'),
            el('p','Lifetime tax change (future dollars): '+signedMoney(w.tax-k.tax)),wealthLine('Ending net worth (today\u2019s dollars)',w.estate-k.estate,true),wealthLine('Income-tested benefits: GIS/provincial (future dollars)',w.benefits-k.benefits,true),el('p','Each option uses its own maximum spending and the same lifespan/estate settings. Unselected properties keep their existing sale dates; tax differences are not overall gains.'));
          cards.append(compare);
        }
        output.append(cards,el('p','Your entered spending goal: '+money(snapshot.assumptions.spendingMode==='categories'?E.Planning.spendingBaseline(snapshot.assumptions.spendingCategories)/12:snapshot.assumptions.desiredMonthlyIncome)+'/mo. Changes below compare sustainable capacity with current settings, not with this goal.','inline-help'));
        output.append(el('p','Spending follows your retirement ages, spending phases or category schedule, and current lifespan/estate settings through '+result.endYear+'. It includes lost rent, sale costs, mortgage repayment, sale tax and invested proceeds. No minimum inheritance is reserved. This is an estimate under your return assumptions, not a probability of success; small differences between years may not be meaningful.'));
        if(snapshot.assumptions.applySpendingBeforeRetirement)output.append(el('p','Your plan also applies spending before retirement, so this estimate scales working-year spending too.','inline-help'));
        if(result.rows.some(row=>row.spendingAtLimit))output.append(el('p','Some options reach the $40,000/month search ceiling. Their true spending capacity may be higher; the search cannot distinguish options above that limit.','inline-help'));
        const checks=[];const normalizedSnapshot=E.normalizeConfig(snapshot);
        (result.propertyIndices||[result.propertyIndex]).forEach(idx=>{
          const selected=normalizedSnapshot.realEstate[idx],prefix=result.propertyIndices?selected.name+': ':'';
          if(selected.buildingAcb===selected.acb&&selected.buildingSalePercent===100)checks.push(prefix+'All purchase cost and sale proceeds are allocated to the building. Confirm that excluding land is appropriate; this allocation affects CCA recapture and gains.');
          if(selected.otherAnnualInterest>0&&selected.mortgage>0)checks.push(prefix+'Other deductible interest is added to the interest calculated from this mortgage. Confirm it is a separate expense, so mortgage interest is not counted twice.');
        });
        if(checks.length){const notice=el('div',null,'notice comparison-input-checks');notice.append(el('h3','Review inputs before relying on the result'));checks.forEach(text=>notice.append(el('p',text)));output.append(notice);}
        supporting.append(el('summary','Tax and inheritance trade-offs'),el('p','These figures use the current spending goal, not each option\u2019s maximum spending. Lower lifetime tax can result from lower income and is not necessarily a better retirement. Net worth includes property you may never spend. Tax totals are in future dollars; ending net worth is in today\u2019s dollars. Both illustrations include terminal tax at the configured lifespans, even if estate modelling is off in your saved plan.'));
        const alternatives=el('div',null,'comparison-cards');alternatives.append(metricCard('Lowest lifetime tax',result.bestTax,'tax'),metricCard('Highest ending net worth',result.bestEstate,'estate'));supporting.append(alternatives);
      }else{
        cards.append(metricCard('Lowest lifetime tax',result.bestTax,'tax'),metricCard('Highest ending net worth',result.bestEstate,'estate'),metricCard('Most monthly spending',result.bestSpending,'monthlySpend'));output.append(cards);
      }
      function makeTable(rows,tradeoffs=false){
        const scroll=el('div',null,'data-scroll'),table=el('table'),head=el('thead'),hr=el('tr');
        table.className=tradeoffs?'comparison-tradeoff-table':'comparison-spending-table';
        const headers=rental?(tradeoffs?['Option','Lifetime tax','Tax change','Ending net worth','Net worth change']:['Option','Future CCA','Sustainable spending /mo','Spending change /mo','Current goal funded','Review']):['Withdrawal order','Lifetime tax','Tax change','Ending net worth','Net worth change','Sustainable spending /mo','Spending change /mo','Spending funded','Review'];
        headers.forEach(h=>{const th=el('th',h);th.scope='col';hr.append(th);});head.append(hr);table.append(head);const body=el('tbody');
        rows.forEach(row=>{
          const tr=el('tr');tr.dataset.optionLabel=row.label;
          const wealth=[money(row.tax),rental?el('span',signedMoney(row.tax-base.tax),'delta-neutral'):delta(row.tax-base.tax,row.tax<base.tax),money(row.estate),delta(row.estate-base.estate,row.estate>base.estate)];
          const spending=[spendingText(row),delta(row.monthlySpend-base.monthlySpend,row.monthlySpend>base.monthlySpend),row.funded?'Yes':'Shortfall '+row.shortfallYear];
          const ccaText=rental&&row.sales?(row.sales.length>1?row.sales.map(s=>(s.name+': '+(s.cca?'claim':'none'))).join(', '):(row.sales[0]&&row.sales[0].cca?'Claim CCA':'No new claims')):'';
          const values=rental?[row.label,...(tradeoffs?wealth:[ccaText,...spending])]:[row.label==='Current settings'?row.label:names[row.strategy],...wealth,...spending];
          values.forEach(v=>{const td=el('td');td.append(v instanceof Node?v:document.createTextNode(v));tr.append(td);});
          if(!tradeoffs){const td=el('td'),b=el('button','Review','btn ghost');b.type='button';b.onclick=()=>review(row,result);td.append(b);tr.append(td);}
          body.append(tr);
        });table.append(body);scroll.append(table);return scroll;
      }
      const ranked=rental?[base,...result.rows.slice(1).sort((a,b)=>b.monthlySpend-a.monthlySpend)]:result.rows;
      output.append(makeTable(ranked));
      if(rental){supporting.append(makeTable(ranked,true));output.append(supporting);}
      status.textContent='Compared '+result.rows.length+' options. Changes are versus Current settings. '+(rental?'Sale options are ranked by after-tax monthly spending in today\u2019s dollars. Alternatives recalculate withdrawals without a saved annual schedule; applying clears that schedule. ':'Tax is in future dollars; ending net worth is in today\u2019s dollars. Tax and net worth recommendations fund the current spending goal. ')+'Best among the options tested, under your assumptions.';
      if(rental&&result.propertyIndices)status.textContent+=' Joint search: '+result.searchMethod+'. '+(result.budgetReached?'The '+result.maxEvaluations+'-option budget was reached. ':'')+'A limited search can miss a better combination.';
      if(rental){
        const notes=el('details'),summary=el('summary','Tax rules and comparison assumptions');notes.append(summary);
        notes.append(el('p','Rules checked September 8, 2026: 50% capital gains inclusion; recapture is ordinary income. CCA cannot create or increase an aggregate rental loss. Each building is treated as a separate CCA class emptied on sale. The search assumes an established, personally owned long-term rental, with no change of use or principal-residence exemption. Corporate rentals, flipped property, GST/HST, capital-loss carryovers and special elections are outside this comparison. Future brackets follow the app’s indexed tax assumptions.'));
        [['CRA rental income guide','https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/t4036/rental-income.html'],['Capital gains increase cancelled','https://www.pm.gc.ca/en/news/news-releases/2025/03/21/prime-minister-mark-carney-cancels-proposed-capital-gains-tax-increase']].forEach(([title,url])=>{const p=el('p'),a=el('a',title);a.href=url;a.target='_blank';a.rel='noopener noreferrer';p.append(a);notes.append(p);});output.append(notes);
      }
    }
    // Setup problems name the property and the fields to correct, and link to the page that holds them.
    function showFailure(message,fix){
      status.replaceChildren(document.createTextNode(message));
      if(fix==='properties'){const link=el('a','Open Properties');link.href='./properties.html';status.append(' ',link);}
    }
    run.onclick=()=>{
      if(rental&&!selectedIndices().length){status.textContent='Select at least one rental property to compare.';return;}
      stop();const id=revision;snapshot=copy(getConfig());source=key(snapshot);run.disabled=true;cancel.hidden=false;output.replaceChildren();status.textContent='Comparing full household projections…';section.setAttribute('aria-busy','true');
      try{
        worker=AppWorkers.create('comparison');
        const fail=(message,fix)=>{stop();showFailure(message,fix);};
        worker.onerror=()=>{if(id===revision)fail('Comparison failed. Try again.');};
        worker.onmessage=({data})=>{if(id!==revision||data.id!==id)return;if(!section.isConnected){stop();return;}if(key(getConfig())!==source){invalidate();return;}if(data.error){fail(data.error,data.fix);return;}if(data.progress){status.textContent='Compared '+data.progress.evaluated+(data.progress.maxEvaluations?' of '+data.progress.maxEvaluations:'')+' options.';return;}stop();show(data.result);};
        worker.postMessage({id,task,config:snapshot,propertyIndices:selectedIndices(),compareCCA:cca.checked});
      }catch(error){stop();showFailure(error.message,error.fix);}
    };
    window.addEventListener('pagehide',stop,{once:true});
    return {run:()=>run.click(),invalidate};
  }
  root.PlanComparison={mount,delta,names};
})(window);
