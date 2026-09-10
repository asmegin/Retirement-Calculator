"""Real server + file:// browser checks. Requires Playwright, Edge, Node and server dependencies."""
from pathlib import Path
import json,os,socket,subprocess,tempfile,time,urllib.request
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
NODE=os.environ.get('NODE_EXE','node')
def check_comparisons(page,base):
    page.goto(base+'/properties.html');page.wait_for_selector('[data-category=realEstate]')
    original=page.evaluate('PlanState.get()')
    page.evaluate('''async()=>{const c=structuredClone(PlanState.get());const year=new Date().getFullYear();
      c.incomes.forEach(p=>Object.assign(p,{birthYear:year-65,targetRetireAge:67,deathAge:70}));
      c.assumptions.targetDeathAge=70;c.assumptions.desiredMonthlyIncome=2000;
      c.realEstate=[{name:'Test rental',type:'rental',value:500000,appreciation:2,acb:300000,buildingAcb:250000,buildingSalePercent:80,uccPool:200000,ccaEnabled:true,grossRentMonthly:2000,mortgage:100000,interestRate:5,paymentMonthly:1000,sellingCostPct:5,saleYear:0}];
      await AppStorage.save(c);}''')
    saved=page.evaluate('PlanState.get()')
    # Rental-only fields disappear for homes and HELOCs, and entered values survive toggles.
    record=page.locator('[data-category=realEstate] .setting-record').first
    record.locator('[data-setting=type] select').select_option('principal')
    assert record.locator('[data-setting=grossRentMonthly]').count()==0
    record.locator('[data-setting=type] select').select_option('heloc')
    assert record.locator('[data-setting=value]').count()==0
    assert record.locator('[data-setting=attachToRental]').count()==1
    record.locator('[data-setting=type] select').select_option('rental')
    assert record.locator('[data-setting=grossRentMonthly] input').input_value()=='2000'
    assert record.locator('[data-setting=uccPool] input').input_value()=='200000'
    page.goto(base+'/plan-properties.html')
    page.wait_for_selector('#save-plan:enabled')
    assert page.locator('a[href="./plan-properties.html"][aria-current=page]').count()==1
    tool=page.locator('[data-comparison=rental]')
    assert tool.get_by_label('Comparison depth',exact=True).is_hidden()
    # Validation must survive the worker boundary and offer the actual configuration page.
    for patch,expected in [({'uccPool':350000},['CCA pool remaining (UCC)','$350,000','$250,000']),
                           ({'buildingAcb':350000},['Building cost excluding land','$350,000','$300,000']),
                           ({'acb':0},['ACB (price + improvements)','$0']),
                           ({'saleYear':2020},['Sale year (0 = never)','2020',str(time.localtime().tm_year)])]:
        page.evaluate('async({saved,patch})=>{const c=structuredClone(saved);Object.assign(c.realEstate[0],patch);await AppStorage.save(c);}',{'saved':saved,'patch':patch})
        tool.get_by_role('button',name='Calculate best sale years',exact=True).click()
        link=tool.get_by_role('link',name='Open Properties',exact=True);link.wait_for()
        message=tool.locator('.tool-status').inner_text()
        assert all(text in message for text in ['Test rental','Configuration › Properties','Advanced options']+expected),message
        assert link.get_attribute('href')=='./properties.html'
        assert tool.locator('.comparison-spending-table').count()==0
    with page.expect_navigation(wait_until='load'):link.click()
    page.wait_for_selector('[data-category=realEstate]')
    assert page.locator('[data-setting=saleYear]').locator('xpath=ancestor::details').count()==1
    page.evaluate('c=>AppStorage.save(c)',saved)
    page.goto(base+'/plan-properties.html');page.wait_for_selector('#save-plan:enabled')
    tool.get_by_role('button',name='Calculate best sale years',exact=True).click()
    tool.locator('.comparison-spending-table tbody tr').first.wait_for(timeout=60000)
    assert tool.locator('.comparison-spending-table tbody tr').count()==15
    assert 'Most retirement spending' in tool.inner_text()
    assert 'Estimated total:' in tool.locator('.spending-recommendation').inner_text()
    assert not tool.locator('.comparison-supporting').evaluate('(el)=>el.open')
    assert 'Spending change /mo' in tool.locator('.comparison-spending-table').inner_text()
    assert tool.locator('.delta-positive,.delta-negative').count()>0
    tool.locator('.comparison-spending-table tr[data-option-label="Sell '+str(time.localtime().tm_year)+'"]').get_by_role('button',name='Review',exact=True).click()
    assert 'CCA recapture (100% taxable): $50,000' in tool.locator('.comparison-detail').inner_text()
    tool.get_by_role('button',name='Use this sale and CCA setting',exact=True).click()
    assert page.evaluate('PlanState.get().realEstate[0].saleYear')==time.localtime().tm_year
    assert page.evaluate('async()=>await (await AppStorage.fetch("/api/config")).json()')==saved
    page.locator('#save-plan').click()
    page.wait_for_function('document.getElementById("save-status").textContent==="Plan saved."')
    page.reload();page.wait_for_selector('[data-comparison=rental]')
    assert page.evaluate('PlanState.get().realEstate[0].saleYear')==time.localtime().tm_year
    page.evaluate('c=>AppStorage.save(c)',saved)
    tool.get_by_role('button',name='Calculate best sale years',exact=True).click();tool.locator('.comparison-spending-table tbody tr').first.wait_for(timeout=60000)
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(Path(tempfile.gettempdir())/'retirement-rental-comparison-mobile.png'),full_page=True)
    page.set_viewport_size({'width':1512,'height':1000})
    page.get_by_text('Compare extra debt payments with investing',exact=True).click()
    page.get_by_role('button',name='Compare strategies',exact=True).click()
    assert 'ending net worth' in page.locator('#debt-comparison').inner_text()
    # Select both rentals and ensure applying updates both dates but does not save automatically.
    page.evaluate('''async()=>{const c=structuredClone(PlanState.get());c.realEstate.push({...c.realEstate[0],name:'Second rental',value:250000,acb:200000,buildingAcb:150000,uccPool:100000,ccaEnabled:false});await AppStorage.save(c);}''')
    multi_saved=page.evaluate('PlanState.get()')
    tool.get_by_label('Second rental',exact=True).check()
    assert tool.get_by_label('Comparison depth',exact=True).input_value()=='quick'
    tool.get_by_label('Also compare stopping future CCA claims',exact=True).uncheck()
    tool.get_by_role('button',name='Calculate best sale years',exact=True).click()
    tool.locator('.spending-recommendation').wait_for(timeout=60000)
    assert 'Joint search:' in tool.locator('.tool-status').inner_text()
    # Switching depth discards stale results, and both values reach real workers.
    tool.get_by_label('Comparison depth',exact=True).select_option('thorough')
    assert tool.locator('.comparison-spending-table').count()==0
    tool.get_by_role('button',name='Calculate best sale years',exact=True).click()
    tool.locator('.spending-recommendation').wait_for(timeout=60000)
    tool.locator('.spending-recommendation').get_by_role('button',name='Review option',exact=True).click()
    apply=tool.get_by_role('button',name='Use this sale and CCA setting',exact=True)
    if apply.is_enabled():
        apply.click()
        assert page.evaluate('async()=>await (await AppStorage.fetch("/api/config")).json()')==multi_saved
        # A saved-plan update in another tab cannot erase the unsaved proposal.
        proposed=page.evaluate('PlanState.get()')
        page.evaluate('c=>AppStorage.save(c)',multi_saved)
        assert page.evaluate('PlanState.get()')==proposed
    page.goto(base+'/withdrawals.html?compare=1');tool=page.locator('[data-comparison=withdrawals]');tool.locator('.comparison-spending-table tbody tr').first.wait_for(timeout=60000)
    assert tool.locator('.comparison-spending-table tbody tr').count()==6
    assert 'Most monthly spending' in tool.inner_text()
    tool.locator('.comparison-spending-table tbody tr').nth(2).get_by_role('button',name='Review',exact=True).click()
    tool.get_by_role('button',name='Use this withdrawal order',exact=True).click()
    assert page.evaluate('config.assumptions.withdrawalStrategy')=='rrsp-first'
    assert page.evaluate('async()=>await (await AppStorage.fetch("/api/config")).json()')==multi_saved
    page.locator('#save-plan').click();page.wait_for_function('document.getElementById("save-status").textContent==="Plan saved."')
    page.goto(base+'/action-plan.html');page.wait_for_selector('[data-action=retirement]:enabled')
    page.locator('#retirement-sell-rentals').check();page.locator('[data-action=retirement]').click()
    page.wait_for_selector('#action-results:not([hidden])',timeout=60000)
    assert 'Test rental:' in page.locator('#action-steps').inner_text()
    page.locator('#apply-action').click();page.wait_for_function('document.getElementById("action-status").textContent.startsWith("Changes applied")')
    page.evaluate('c=>AppStorage.save(c)',original)

def check_quick_rental_search(page,base):
    page.goto(base+'/plan-properties.html');page.wait_for_selector('#save-plan:enabled')
    original=page.evaluate('PlanState.get()')
    page.evaluate('''async()=>{const c=RetireEngine.defaultConfig(),year=new Date().getFullYear();c.onboardingComplete=true;
      c.incomes.forEach((p,k)=>Object.assign(p,{name:'Person '+k,birthYear:year-65,salary:0,targetRetireAge:65,cppBaseAt65:0,oasBaseAt65:0}));
      Object.assign(c.assumptions,{targetDeathAge:75,desiredMonthlyIncome:2000,inflation:0,gisEnabled:false,optimizeContributions:false});
      c.accounts=[{name:'Cash',type:'TFSA',owner:'Person 0',balance:100000,growthRate:0}];
      c.realEstate=[0,1].map(i=>({name:'Quick rental '+i,type:'rental',value:200000,acb:160000,buildingAcb:120000,uccPool:100000,ccaEnabled:true,grossRentMonthly:700,appreciation:0}));
      await AppStorage.save(c);
      const create=AppWorkers.create;AppWorkers.create=function(kind){const worker=create(kind);worker.addEventListener('message',({data})=>{if(data.result)window.lastComparison=data.result;});return worker;};
    }''')
    tool=page.locator('[data-comparison=rental]');tool.get_by_label('Quick rental 1',exact=True).check()
    run=tool.get_by_role('button',name='Calculate best sale years',exact=True)
    run.click();tool.locator('.spending-recommendation').wait_for(timeout=60000)
    result=page.evaluate('lastComparison')
    assert result['searchMode']=='quick' and result['shortlisted']
    assert result['evaluated']<=120 and result['fullPrecisionEvaluated']==len(result['rows'])<=24
    assert 'fully verified' in tool.locator('.tool-status').inner_text()
    assert tool.locator('.comparison-spending-table tbody tr').count()==len(result['rows'])
    page.set_viewport_size({'width':320,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.set_viewport_size({'width':1512,'height':1000})
    tool.get_by_label('Comparison depth',exact=True).select_option('thorough')
    run.click();tool.get_by_role('button',name='Cancel comparison',exact=True).click()
    assert 'cancelled' in tool.locator('.tool-status').inner_text()
    assert tool.locator('.comparison-spending-table').count()==0
    run.click();tool.locator('.spending-recommendation').wait_for(timeout=60000)
    assert page.evaluate('lastComparison.searchMode')=='thorough'
    assert not page.evaluate('lastComparison.shortlisted')
    assert page.evaluate('lastComparison.evaluated')<=400
    page.evaluate('c=>AppStorage.save(c)',original)

def check_action_plan(page,url):
    page.goto(url);page.wait_for_selector('[data-action=status]:enabled')
    original=page.evaluate('PlanState.get()')
    page.evaluate('async()=>{const c=structuredClone(PlanState.get());c.assumptions.mcRuns=100;await AppStorage.save(c);}')
    saved=page.evaluate('PlanState.get()')
    assert page.get_by_role('link',name='Action plan',exact=True).get_attribute('aria-current')=='page'
    page.screenshot(path=str(Path(tempfile.gettempdir())/'retirement-action-plan.png'),full_page=True)
    for kind in ['status','estate','tax','retirement']:
        page.locator(f'[data-action={kind}]').click()
        page.wait_for_selector('#action-results:not([hidden])',timeout=60000)
        assert page.locator('#action-steps li').count()>0
        if kind in ['tax','estate']:
            assert page.locator('#action-metrics .delta-positive,#action-metrics .delta-negative,#action-metrics .delta-neutral').count()==3
            assert 'Current' in page.locator('#action-metrics').inner_text() and 'Proposed' in page.locator('#action-metrics').inner_text()
        assert page.evaluate('async()=>await (await AppStorage.fetch("/api/config")).json()')==saved
        if kind=='status':
            assert '100 paths' in page.locator('#action-summary').inner_text()
            assert page.locator('#apply-action').is_hidden()
        if kind in ['estate','tax'] and page.locator('#apply-action').is_visible():
            assert page.locator('#action-schedule-table tbody tr').count()>0
            page.locator('#apply-action').click()
            page.wait_for_function('document.getElementById("action-status").textContent.startsWith("Changes applied")')
            applied=page.evaluate('async()=>await (await AppStorage.fetch("/api/config")).json()')
            assert applied['incomes']==saved['incomes']
            assert (applied['assumptions'].get('withdrawalPlan'),applied['assumptions']['withdrawalStrategy'])!=(saved['assumptions'].get('withdrawalPlan'),saved['assumptions']['withdrawalStrategy'])
            page.evaluate('c=>AppStorage.save(c)',saved)
    assert page.locator('#apply-action').is_visible()
    page.screenshot(path=str(Path(tempfile.gettempdir())/'retirement-action-result.png'),full_page=True)
    page.locator('#apply-action').click()
    page.wait_for_function('document.getElementById("action-status").textContent.startsWith("Changes applied")')
    changed=page.evaluate('async()=>await (await AppStorage.fetch("/api/config")).json()')
    years=[p['birthYear']+p['targetRetireAge'] for p in changed['incomes']]
    assert abs(years[0]-years[1])<=3
    assert changed['incomes']!=saved['incomes']
    # Cancel before a worker can reply; late messages must not show a result.
    page.evaluate('document.querySelector("[data-action=status]").click();document.getElementById("cancel-action").click();')
    page.wait_for_timeout(150);assert page.locator('#action-results').is_hidden()
    page.evaluate('c=>AppStorage.save(c)',saved)
    page.locator('[data-action=retirement]').click();page.wait_for_selector('#apply-action:not([hidden])',timeout=60000)
    page.evaluate('async()=>{const c=structuredClone(PlanState.get());c.assumptions.desiredMonthlyIncome+=1;await AppStorage.save(c);}')
    assert page.locator('#apply-action').is_hidden() and page.locator('#action-results').is_hidden()
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(Path(tempfile.gettempdir())/'retirement-action-plan-mobile.png'),full_page=True)
    page.set_viewport_size({'width':1512,'height':1000})
    page.evaluate('c=>AppStorage.save(c)',original)
fixture=json.loads(subprocess.check_output([NODE,'-e',"const E=require('./public/engine');let c=E.defaultConfig();c.onboardingComplete=true;c.incomes.forEach((p,k)=>Object.assign(p,{birthYear:1976+k,salary:100000,targetRetireAge:60}));c.assumptions.targetDeathAge=75;c.assumptions.desiredMonthlyIncome=5000;c.realEstate=[];c.accounts=[{name:'Retirement savings',owner:c.incomes[0].name,type:'RRSP',balance:1500000,growthRate:4},{name:'Tax-free savings',owner:c.incomes[1].name,type:'TFSA',balance:400000,growthRate:4}];console.log(JSON.stringify(c));"],cwd=ROOT))
with tempfile.TemporaryDirectory(prefix='retirement-browser-data-') as data:
    Path(data,'config.json').write_text(json.dumps(fixture),encoding='utf-8')
    with socket.socket() as port_socket:port_socket.bind(('127.0.0.1',0));port=port_socket.getsockname()[1]
    env={**os.environ,'DATA_DIR':data,'PORT':str(port),'BIND':'127.0.0.1','BASIC_AUTH_ENABLED':'false'}
    server=subprocess.Popen([NODE,'server.js'],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    base=f'http://127.0.0.1:{port}'
    try:
        for _ in range(80):
            try:urllib.request.urlopen(base+'/api/system',timeout=.3);break
            except Exception:
                if server.poll() is not None:raise RuntimeError(server.stderr.read().decode())
                time.sleep(.1)
        with sync_playwright() as pw:
            browser=pw.chromium.launch(channel=os.environ.get('BROWSER_CHANNEL','msedge'),headless=True)
            context=browser.new_context(viewport={'width':1512,'height':1000})
            page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(base+'/index.html');page.wait_for_function('config && sim && AppStorage.mode==="server"')
            assert page.evaluate('document.documentElement.dataset.theme')=='light'
            assert not page.get_by_role('link',name='Configure',exact=True).count()
            assert page.locator('.help-button').count()==0
            assert page.locator('.app-sidebar a[href*="#"]').count()==0
            assert page.locator('#planner-title').count()==0
            assert page.get_by_role('link',name='Plan details',exact=True).count()==1
            assert not page.get_by_text('Overview details',exact=True).count()
            # Slider labels remain live; a burst produces one full calculation, including its save echo.
            page.evaluate('window.originalRun=run;window.dashboardRuns=0;window.runTrace=[];run=function(){window.dashboardRuns++;window.runTrace.push([performance.now(),new Error().stack]);return window.originalRun();};void 0')
            for age in [54,55,56,57,58,59,60]:
                page.locator('#p1-slider').evaluate('(el,age)=>{el.value=age;el.dispatchEvent(new Event("input",{bubbles:true}));}',age)
                page.wait_for_timeout(80)
                assert page.locator('#p1-age-val').inner_text()==str(age)
            page.wait_for_timeout(250);assert page.evaluate('window.dashboardRuns')==0,page.evaluate('({trace:window.runTrace,timer:inputTimer})')
            page.wait_for_function('window.dashboardRuns===1',timeout=15000)
            page.wait_for_timeout(1100);assert page.evaluate('window.dashboardRuns')==1
            page.evaluate('run=window.originalRun;void 0')
            page.screenshot(path=str(Path(tempfile.gettempdir())/'retirement-overview-simple.png'))
            # Real Socket.IO sync between two pages.
            other=context.new_page();other.goto(base+'/index.html');other.wait_for_function('config && AppStorage.mode==="server"')
            page.locator('#m-goal').fill('5200');page.locator('#m-goal').press('Tab')
            other.wait_for_function('config.assumptions.desiredMonthlyIncome===5200',timeout=15000);other.close()
            action=context.new_page();action.on('pageerror',lambda e:errors.append(str(e)))
            check_action_plan(action,base+'/action-plan');action.close()
            page.goto(base+'/household.html');page.wait_for_selector('[data-category=incomes]')
            assert page.locator('[data-category=accounts]').count()==0
            assert page.get_by_label('After-tax spending $/mo',exact=True).count()==0
            assert page.get_by_label('Current salary',exact=True).count()==0
            child_count=page.locator('.child-row').count()
            page.get_by_role('button',name='Add child',exact=True).click()
            assert page.locator('.child-row').count()==child_count+1
            assert page.locator('#settings-save-status').inner_text()=='Unsaved changes'
            page.get_by_role('button',name='Save changes',exact=True).click()
            page.wait_for_function('document.getElementById("settings-save-status").textContent==="All changes saved"')
            page.screenshot(path=str(Path(tempfile.gettempdir())/'retirement-household-polished.png'))
            page.goto(base+'/plan-settings.html');page.wait_for_selector('#editor input')
            assert page.get_by_label('After-tax spending $/mo',exact=True).count()==1
            page.goto(base+'/accounts.html');page.wait_for_selector('[data-category=accounts]')
            assert not page.get_by_label('First FHSA opened in year',exact=True).count()
            assert page.get_by_label('Growth %/yr',exact=True).first.is_hidden()
            page.locator('[data-category=accounts] details').first.locator('summary').click()
            assert page.get_by_label('Growth %/yr',exact=True).first.is_visible()
            page.locator('[data-category=accounts]').get_by_role('button',name='Add account',exact=True).click()
            page.locator('[data-category=accounts]').get_by_label('Type',exact=True).last.select_option('FHSA')
            assert page.get_by_label('First FHSA opened in year',exact=True).count()==2
            page.goto(base+'/employment.html');page.wait_for_selector('#editor input')
            assert page.get_by_label('Goal reached estimate per year (%)',exact=True).input_value()=='85'
            salary=page.get_by_label('Current salary',exact=True).first;salary.fill('123000');salary.press('Tab')
            remote=context.request.get(base+'/api/config').json();remote['incomes'][0]['salary']=105000
            assert context.request.post(base+'/api/config',data=remote).ok
            page.wait_for_function('document.getElementById("settings-save-status").textContent.includes("another window")')
            assert salary.input_value()=='123000'
            page.goto(base+'/pensions.html');page.wait_for_selector('#pensions')
            page.get_by_role('button',name='Add pension',exact=True).click()
            assert page.locator('#pensions').get_by_label('Start age',exact=True).last.is_visible()
            assert page.locator('#pensions').get_by_label('Bridge /mo',exact=True).last.is_hidden()
            # Statement estimates drive the main selector and both monthly amounts.
            pension=page.locator('#pensions .setting-record').last
            pension.locator('.advanced-options > summary').click()
            pension.locator('.pension-estimates > summary').click()
            for age,lifetime,bridge in [(65,3000,0),(60,2500,400),(55,2000,500)]:
                pension.get_by_role('button',name='Add age estimate',exact=True).click()
                estimate=pension.locator('.pension-estimates .item-row').last
                for label,value in [('Start age',age),('Lifetime pension /mo',lifetime),('Bridge /mo',bridge)]:
                    estimate.get_by_label(label,exact=True).fill(str(value));estimate.get_by_label(label,exact=True).press('Tab')
            age_control=pension.locator('[data-setting=startAge] select')
            assert age_control.locator('option').count()==3
            age_control.select_option('55')
            assert pension.locator('[data-setting=lifetime] input').input_value()=='2000'
            assert pension.locator('[data-setting=bridge] input').input_value()=='500'
            assert pension.locator('[data-setting=lifetime] input').get_attribute('readonly') is not None
            pension.get_by_label('Start when member retires',exact=True).check()
            assert age_control.is_disabled() and age_control.input_value()=='60'
            assert pension.locator('[data-setting=lifetime] input').input_value()=='2500'
            pension.get_by_label('Start when member retires',exact=True).uncheck()
            assert age_control.input_value()=='55'
            # Existing ages between statement estimates remain explicit, with engine interpolation.
            page.evaluate('config.dbPensions.at(-1).startAge=58;render()')
            assert age_control.input_value()=='58'
            assert 'estimated' in age_control.locator('option:checked').inner_text()
            assert pension.locator('[data-setting=lifetime] input').input_value()=='2300'
            age_control.select_option('60')
            page.get_by_role('button',name='Save changes',exact=True).click()
            page.wait_for_function('document.getElementById("settings-save-status").textContent==="All changes saved"')
            page.reload();page.wait_for_selector('#pensions')
            assert age_control.input_value()=='60'
            assert pension.locator('[data-setting=lifetime] input').input_value()=='2500'
            assert page.locator('#editor input:not([aria-describedby]),#editor select:not([aria-describedby])').count()==0
            page.get_by_role('button',name='Setup Wizard',exact=True).click()
            assert page.locator('#setup-wizard').is_visible()
            assert page.locator('#wizard-body input:not([aria-describedby]),#wizard-body select:not([aria-describedby])').count()==0
            for _ in range(2):page.locator('#wizard-next').click()
            assert page.locator('#wizard-body').get_by_label('RRSP balance',exact=True).count()>=1
            assert page.locator('#wizard-body').get_by_label('Corporate balance',exact=True).count()==2
            assert page.evaluate('config.dbPensions.at(-1).startAge')==60
            page.locator('#wizard-cancel').click()
            pension.locator('.advanced-options > summary').click()
            selected_estimate=pension.locator('.pension-estimates .item-row').nth(1)
            selected_estimate.get_by_label('Lifetime pension /mo',exact=True).fill('2700')
            selected_estimate.get_by_label('Lifetime pension /mo',exact=True).press('Tab')
            assert pension.locator('[data-setting=lifetime] input').input_value()=='2700'
            for _ in range(3):pension.get_by_role('button',name='Remove estimate',exact=True).last.click()
            assert pension.locator('[data-setting=startAge] input').input_value()=='60'
            assert pension.locator('[data-setting=lifetime] input').is_editable()
            page.goto(base+'/properties.html');page.wait_for_selector('[data-category=realEstate]')
            page.get_by_role('button',name='Add property or debt',exact=True).click()
            assert page.get_by_label('Sale year (0 = never)',exact=True).is_hidden()
            page.locator('[data-category=realEstate] details summary').first.click()
            assert page.get_by_label('Sale year (0 = never)',exact=True).is_visible()
            assert page.get_by_label('Reborrow paid principal to invest',exact=True).is_visible()
            page.goto(base+'/scenarios.html');page.wait_for_selector('#scenario-result tbody tr')
            assert not page.get_by_text('Spending that reflects your life').count()
            assert page.get_by_label('Downsize at Person 1 age',exact=True).is_hidden()
            assert page.get_by_label('Downsize primary home',exact=True).is_disabled()
            before=page.evaluate('config.incomes[0].targetRetireAge')
            page.locator('#scenario-controls').get_by_label(fixture['incomes'][0]['name']+': retire at',exact=True).fill('65')
            page.locator('#scenario-controls').get_by_label(fixture['incomes'][0]['name']+': retire at',exact=True).press('Tab')
            assert page.evaluate('config.incomes[0].targetRetireAge')==before
            page.goto(base+'/app-config.html');page.wait_for_selector('[data-dark-appearance]');page.locator('[data-dark-appearance]').check()
            page.goto(base+'/index.html');page.wait_for_function('document.documentElement.dataset.theme==="dark" && sim')
            page.screenshot(path=str(Path(tempfile.gettempdir())/'retirement-overview-dark.png'))
            # Demo edits remain in browser storage even when opened on a Docker server.
            demo_context=browser.new_context();demo_page=demo_context.new_page()
            demo_page.goto(base+'/index.html');demo_page.wait_for_function('config && sim')
            assert 'own server' in demo_page.locator('#privacy-notice').inner_text()
            demo_page.goto(base+'/app-config.html');demo_page.wait_for_selector('#demo-profile')
            with demo_page.expect_navigation(wait_until='load'):demo_page.locator('#demo-profile').select_option('investor')
            demo_page.wait_for_function('config && AppStorage.isDemo')
            demo_page.evaluate('async()=>{const c=structuredClone(PlanState.get());c.assumptions.desiredMonthlyIncome=9999;await AppStorage.save(c);}')
            assert json.load(urllib.request.urlopen(base+'/api/config'))['assumptions']['desiredMonthlyIncome']==5200
            with demo_page.expect_navigation(wait_until='load'):demo_page.locator('#start-own-plan').click()
            demo_page.wait_for_function('config && !AppStorage.isDemo')
            assert demo_page.evaluate('config.assumptions.desiredMonthlyIncome')==5200
            demo_context.close()
            # A failed Socket.IO connection still saves authoritatively through HTTP.
            fallback=browser.new_context();fallback.route('**/vendor/socket.io.min.js',lambda route:route.fulfill(content_type='text/javascript',body="window.io=()=>({once(event,cb){if(event==='connect_error')queueMicrotask(cb);return this;},on(){},close(){}});"))
            fallback_page=fallback.new_page();fallback_page.goto(base+'/index.html');fallback_page.wait_for_function('config && sim')
            assert fallback_page.evaluate('AppStorage.mode')=='server'
            fallback_page.locator('#m-goal').fill('5400');fallback_page.locator('#m-goal').press('Tab');fallback_page.wait_for_timeout(900)
            fallback_page.goto(base+'/household.html');fallback_page.wait_for_selector('#editor input')
            assert fallback_page.evaluate('config.assumptions.desiredMonthlyIncome')==5400
            assert json.load(urllib.request.urlopen(base+'/api/config'))['assumptions']['desiredMonthlyIncome']==5400
            fallback_page.evaluate('async()=>{const c=structuredClone(PlanState.get());c.assumptions.desiredMonthlyIncome=5200;await AppStorage.save(c);}')
            # An unavailable API never confirms a save or writes it into a local plan.
            baseline=fallback_page.evaluate('PlanState.get()')
            fallback.route('**/api/**',lambda route:route.abort())
            failed=fallback_page.evaluate('''async()=>{const c=structuredClone(PlanState.get());c.assumptions.desiredMonthlyIncome=9999;try{await AppStorage.save(c);return false;}catch(error){return error.message;}}''')
            assert failed and 'not confirmed' in failed
            assert fallback_page.evaluate('AppStorage.mode')=='server'
            assert fallback_page.evaluate('()=>BrowserPlanStore.readCache()')==baseline
            assert json.load(urllib.request.urlopen(base+'/api/config'))['assumptions']['desiredMonthlyIncome']==5200
            fallback_page.goto(base+'/index.html');fallback_page.wait_for_function('config && sim')
            assert fallback_page.evaluate('config.assumptions.desiredMonthlyIncome')==5200
            assert 'Server offline' in fallback_page.locator('.storage-mode').inner_text()
            fallback.close()
            unavailable=browser.new_context()
            unavailable.route('**/api/**',lambda route:route.abort())
            unavailable.route('**/vendor/socket.io.min.js',lambda route:route.abort())
            unavailable_page=unavailable.new_page();unavailable_page.goto(base+'/household.html')
            unavailable_page.wait_for_function('document.getElementById("settings-save-status").textContent.includes("Server unavailable")')
            assert unavailable_page.locator('#save-settings').is_disabled()
            assert 'Server unavailable' in unavailable_page.locator('#settings-save-status').inner_text()
            assert unavailable_page.evaluate('PlanState.get()') is None
            unavailable.close()
            # No connection: file resources, calculations, shared storage across dedicated files.
            offline=browser.new_context(viewport={'width':1440,'height':1000},offline=True)
            local=offline.new_page();local.on('pageerror',lambda e:errors.append(str(e)))
            local.goto((ROOT/'public/index.html').as_uri());local.wait_for_function('config && sim',timeout=20000)
            assert local.evaluate('AppStorage.mode')=='local'
            assert local.locator('#import-json-file').count()==0 and local.locator('#export-json').count()==0
            local.goto((ROOT/'public/app-config.html').as_uri());local.wait_for_selector('#import-json')
            local.locator('#import-json-file').set_input_files({'name':'plan.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()})
            local.wait_for_function('config.assumptions.desiredMonthlyIncome===5000')
            local.goto((ROOT/'public/index.html').as_uri());local.wait_for_function('config && sim')
            local.locator('#m-goal').fill('5300');local.locator('#m-goal').press('Tab');local.wait_for_timeout(900)
            local.goto((ROOT/'public/household.html').as_uri());local.wait_for_selector('#editor input')
            assert local.evaluate('config.assumptions.desiredMonthlyIncome')==5300
            local.goto((ROOT/'public/index.html').as_uri());local.wait_for_function('sim !== null',timeout=60000)
            assert local.evaluate('config.assumptions.desiredMonthlyIncome')==5300
            check_action_plan(local,(ROOT/'public/action-plan.html').as_uri())
            local.goto((ROOT/'public/app-config.html').as_uri());local.wait_for_selector('#export-json')
            with local.expect_download() as download:local.locator('#export-json').click()
            assert download.value.suggested_filename=='retirement-plan.json'
            local.locator('[data-dark-appearance]').check()
            local.goto((ROOT/'public/index.html').as_uri());local.wait_for_function('config && document.documentElement.dataset.theme==="dark"')
            before=local.evaluate('config.assumptions.desiredMonthlyIncome')
            local.goto((ROOT/'public/app-config.html').as_uri());local.wait_for_selector('#import-json')
            local.locator('#import-json-file').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':b'{"unrelated":true}'})
            local.wait_for_function('document.getElementById("plan-file-status").textContent.includes("Choose a retirement plan")')
            assert local.evaluate('config.assumptions.desiredMonthlyIncome')==before
            local.goto((ROOT/'public/index.html').as_uri());local.wait_for_function('config && sim')
            local.set_viewport_size({'width':390,'height':844});local.wait_for_timeout(100)
            local.locator('.mobile-menu-toggle').click();assert local.get_by_role('link',name='Overview',exact=True).is_visible();local.locator('.mobile-menu-toggle').click()
            local.screenshot(path=str(Path(tempfile.gettempdir())/'retirement-overview-mobile.png'))
            assert local.evaluate('document.documentElement.scrollWidth<=innerWidth'),local.evaluate('[...document.querySelectorAll("body *")].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&getComputedStyle(e).display!=="none").map(e=>[e.tagName,e.id,e.className,e.getBoundingClientRect().width]).slice(0,25)')
            local.screenshot(path=str(Path(tempfile.gettempdir())/'retirement-overview-mobile.png'))
            # Plan details keeps the payoff-marker toggle above the canvas instead of over the chart legend.
            restore=local.evaluate('PlanState.get()')
            local.evaluate('''async()=>{const c=structuredClone(PlanState.get());
              c.realEstate=[{name:'Home with a very long property name that must fit in the chart',type:'principal',value:800000,acb:500000,appreciation:2,mortgage:40000,interestRate:4,paymentMonthly:2600},
                {name:'Rental',type:'rental',value:500000,acb:300000,buildingAcb:250000,uccPool:200000,appreciation:2,grossRentMonthly:2000,mortgage:200000,interestRate:4,paymentMonthly:1400}];
              await AppStorage.save(c);}''')
            local.goto((ROOT/'public/detailed.html').as_uri());local.wait_for_function('config && sim',timeout=60000)
            layout=local.evaluate('''()=>{
              const bar=document.querySelector('.chart-toolbar').getBoundingClientRect();
              const canvas=document.getElementById('chart-trajectory').getBoundingClientRect();
              return {barBottom:bar.bottom,barRight:bar.right,canvasTop:canvas.top,width:innerWidth};
            }''')
            assert layout['barBottom']<=layout['canvasTop']+1,layout
            assert layout['barRight']<=layout['width']+1,layout
            # Payoff labels are drawn inside the plot area rather than clipped against the value axis.
            drawn=local.evaluate('''()=>{
              const chart=Object.values(charts).find(c=>c.canvas.id==='chart-trajectory'),axis=chart.scales.x,calls=[];
              const original=CanvasRenderingContext2D.prototype.fillText;
              CanvasRenderingContext2D.prototype.fillText=function(text,tx){calls.push({text:String(text),x:tx,align:this.textAlign,width:this.measureText(text).width});return original.apply(this,arguments);};
              try{chart.draw();}finally{CanvasRenderingContext2D.prototype.fillText=original;}
              return {left:axis.left,right:axis.right,labels:calls.filter(c=>c.text.includes(' paid off ('))};
            }''')
            assert len(drawn['labels'])==2,drawn
            for label in drawn['labels']:
                left=label['x']-label['width'] if label['align']=='right' else label['x']
                assert left>=drawn['left']-1,(label,drawn['left'])
                assert left+label['width']<=drawn['right']+1,(label,drawn['right'])
            local.evaluate('c=>AppStorage.save(c)',restore)
            local.goto((ROOT/'public/index.html').as_uri());local.wait_for_function('config && sim',timeout=60000)
            assert not errors,errors
            check_comparisons(page,base)
            check_comparisons(local,(ROOT/'public').as_uri())
            check_quick_rental_search(page,base)
            check_quick_rental_search(local,(ROOT/'public').as_uri())
            assert not errors,errors
            browser.close();print('PASS: Docker real-time sync, file:// offline storage/navigation/workers, import/export, dedicated pages, advanced disclosure, FHSA conditional fields, RRSP goal, action plan, rental sale and withdrawal comparisons, themes and mobile layout.')
    finally:
        server.terminate();server.wait(timeout=10)
