"""Real server + file:// browser checks. Requires Playwright, Edge, Node and server dependencies."""
from pathlib import Path
import json,os,socket,subprocess,tempfile,time,urllib.request
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
NODE=os.environ.get('NODE_EXE','node')
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
            page.wait_for_function('plannerResult !== null',timeout=60000)
            assert page.locator('#action-steps li').count()>0
            page.locator('#maximize-estate').click();page.wait_for_selector('#estate-schedule:not([hidden])',timeout=60000)
            assert page.locator('#estate-action-schedule tbody tr').count()>0
            page.locator('#estate-schedule').evaluate('e=>e.open=false')
            page.screenshot(path=str(Path(tempfile.gettempdir())/'retirement-overview-simple.png'))
            # Real Socket.IO sync between two pages.
            other=context.new_page();other.goto(base+'/index.html');other.wait_for_function('config && AppStorage.mode==="server"')
            page.locator('#m-goal').fill('5200');page.locator('#m-goal').press('Tab')
            other.wait_for_function('config.assumptions.desiredMonthlyIncome===5200',timeout=15000);other.close()
            page.goto(base+'/household.html');page.wait_for_selector('[data-category=accounts]')
            assert not page.get_by_label('First FHSA opened in year',exact=True).count()
            assert page.get_by_label('Growth %/yr',exact=True).first.is_hidden()
            page.locator('[data-category=accounts] details').first.locator('summary').click()
            assert page.get_by_label('Growth %/yr',exact=True).first.is_visible()
            page.locator('[data-category=accounts]').get_by_role('button',name='Add account',exact=True).click()
            page.locator('[data-category=accounts]').get_by_label('Type',exact=True).last.select_option('FHSA')
            assert page.get_by_label('First FHSA opened in year',exact=True).count()==2
            page.goto(base+'/employment.html');page.wait_for_selector('#editor input')
            assert page.get_by_label('Goal reached estimate per year (%)',exact=True).input_value()=='85'
            page.goto(base+'/pensions.html');page.wait_for_selector('#pensions')
            page.get_by_role('button',name='Add pension',exact=True).click()
            assert page.locator('#pensions').get_by_label('Start age',exact=True).last.is_visible()
            assert page.locator('#pensions').get_by_label('Bridge /mo',exact=True).last.is_hidden()
            assert page.locator('#editor input:not([aria-describedby]),#editor select:not([aria-describedby])').count()==0
            page.get_by_role('button',name='Setup Wizard',exact=True).click()
            assert page.locator('#setup-wizard').is_visible()
            assert page.locator('#wizard-body input:not([aria-describedby]),#wizard-body select:not([aria-describedby])').count()==0
            for _ in range(4):page.locator('#wizard-next').click()
            assert not page.locator('#wizard-body').get_by_label('First FHSA opened in year',exact=True).count()
            page.locator('#wizard-body').get_by_label('Type',exact=True).first.select_option('FHSA')
            assert page.locator('#wizard-body').get_by_label('First FHSA opened in year',exact=True).count()==2
            page.locator('#wizard-cancel').click()
            page.goto(base+'/properties.html');page.wait_for_selector('[data-category=realEstate]')
            page.get_by_role('button',name='Add property or debt',exact=True).click()
            assert page.get_by_label('Sale year (0 = never)',exact=True).is_hidden()
            page.locator('[data-category=realEstate] details summary').first.click()
            assert page.get_by_label('Sale year (0 = never)',exact=True).is_visible()
            assert page.get_by_label('Reborrow paid principal to invest',exact=True).is_visible()
            page.goto(base+'/scenarios.html');page.wait_for_selector('#scenario-result tbody tr')
            assert not page.get_by_text('Spending that reflects your life').count()
            before=page.evaluate('config.incomes[0].targetRetireAge')
            page.locator('#scenario-controls').get_by_label(fixture['incomes'][0]['name']+': retire at',exact=True).fill('65')
            page.locator('#scenario-controls').get_by_label(fixture['incomes'][0]['name']+': retire at',exact=True).press('Tab')
            assert page.evaluate('config.incomes[0].targetRetireAge')==before
            page.goto(base+'/app-config.html');page.wait_for_selector('[data-dark-appearance]');page.locator('[data-dark-appearance]').check()
            page.goto(base+'/index.html');page.wait_for_function('document.documentElement.dataset.theme==="dark" && sim')
            page.screenshot(path=str(Path(tempfile.gettempdir())/'retirement-overview-dark.png'))
            # A failed Socket.IO connection uses local storage without changing Docker data.
            fallback=browser.new_context();fallback.route('**/vendor/socket.io.min.js',lambda route:route.fulfill(content_type='text/javascript',body="window.io=()=>({once(event,cb){if(event==='connect_error')queueMicrotask(cb);return this;},on(){},close(){}});"))
            fallback_page=fallback.new_page();fallback_page.goto(base+'/index.html');fallback_page.wait_for_function('config && sim')
            assert fallback_page.evaluate('AppStorage.mode')=='local'
            fallback_page.locator('#m-goal').fill('5400');fallback_page.locator('#m-goal').press('Tab');fallback_page.wait_for_timeout(900)
            fallback_page.goto(base+'/household.html');fallback_page.wait_for_selector('#editor input')
            assert fallback_page.evaluate('config.assumptions.desiredMonthlyIncome')==5400
            assert json.load(urllib.request.urlopen(base+'/api/config'))['assumptions']['desiredMonthlyIncome']==5200
            fallback.close()
            # No connection: file resources, calculations, shared storage across dedicated files.
            offline=browser.new_context(viewport={'width':1440,'height':1000},offline=True)
            local=offline.new_page();local.on('pageerror',lambda e:errors.append(str(e)))
            local.goto((ROOT/'public/index.html').as_uri());local.wait_for_function('config && sim',timeout=20000)
            assert local.evaluate('AppStorage.mode')=='local'
            local.locator('#import-json-file').set_input_files({'name':'plan.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()})
            local.wait_for_function('config.assumptions.desiredMonthlyIncome===5000')
            local.locator('#m-goal').fill('5300');local.locator('#m-goal').press('Tab');local.wait_for_timeout(900)
            local.goto((ROOT/'public/household.html').as_uri());local.wait_for_selector('#editor input')
            assert local.evaluate('config.assumptions.desiredMonthlyIncome')==5300
            local.goto((ROOT/'public/index.html').as_uri());local.wait_for_function('plannerResult !== null',timeout=60000)
            assert local.evaluate('config.assumptions.desiredMonthlyIncome')==5300
            assert 'unavailable' not in local.locator('#planner-status').inner_text()
            local.locator('#maximize-estate').click();local.wait_for_selector('#estate-schedule:not([hidden])',timeout=60000)
            with local.expect_download() as download:local.locator('#export-json').click()
            assert download.value.suggested_filename=='retirement-plan.json'
            local.goto((ROOT/'public/app-config.html').as_uri());local.wait_for_selector('[data-dark-appearance]');local.locator('[data-dark-appearance]').check()
            local.goto((ROOT/'public/index.html').as_uri());local.wait_for_function('config && document.documentElement.dataset.theme==="dark"')
            before=local.evaluate('config.assumptions.desiredMonthlyIncome')
            local.locator('#import-json-file').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':b'{"unrelated":true}'})
            local.wait_for_function('document.getElementById("file-status").textContent.includes("Choose a retirement plan")')
            assert local.evaluate('config.assumptions.desiredMonthlyIncome')==before
            local.set_viewport_size({'width':390,'height':844});local.wait_for_timeout(100)
            local.locator('.mobile-menu-toggle').click();assert local.get_by_role('link',name='Overview',exact=True).is_visible();local.locator('.mobile-menu-toggle').click()
            local.screenshot(path=str(Path(tempfile.gettempdir())/'retirement-overview-mobile.png'))
            assert local.evaluate('document.documentElement.scrollWidth<=innerWidth'),local.evaluate('[...document.querySelectorAll("body *")].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&getComputedStyle(e).display!=="none").map(e=>[e.tagName,e.id,e.className,e.getBoundingClientRect().width]).slice(0,25)')
            local.screenshot(path=str(Path(tempfile.gettempdir())/'retirement-overview-mobile.png'))
            assert not errors,errors
            browser.close();print('PASS: Docker real-time sync, file:// offline storage/navigation/workers, import/export, dedicated pages, advanced disclosure, FHSA conditional fields, RRSP goal, action plan, themes and mobile layout.')
    finally:
        server.terminate();server.wait(timeout=10)
