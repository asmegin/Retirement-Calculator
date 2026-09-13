"""Browser verification of public onboarding, privacy, encrypted backup and demo isolation."""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json, os, tempfile, threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
    def copyfile(self,source,output):
        try: super().copyfile(source,output)
        except (ConnectionError,BrokenPipeError): pass

server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT/'dist')))
thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
try:
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel=os.environ.get('BROWSER_CHANNEL','msedge'),headless=True)
        for mode,base in [('static',f'http://127.0.0.1:{server.server_port}/pages'),('file',(ROOT/'src/public').as_uri())]:
            context=browser.new_context();page=context.new_page();errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(base+'/index.html');page.wait_for_function('window.PlanState && PlanState.get() && document.getElementById("setup-host").open')
            assert page.locator('meta[name=apple-mobile-web-app-capable]').get_attribute('content')=='yes'
            assert page.locator('link[rel=apple-touch-icon]').get_attribute('href').startswith('./')
            wizard=page.frame_locator('#setup-frame')
            wizard.locator('#wizard-skip').click()
            page.wait_for_function('!document.getElementById("setup-host").open && PlanState.get().onboardingComplete')
            page.reload();page.wait_for_function('window.PlanState && PlanState.get()?.onboardingComplete')
            assert not page.locator('#setup-host').evaluate('(el)=>el.open')
            page.evaluate('openSetupWizard()')
            wizard.get_by_label('Person 1: current age',exact=True).fill('50')
            wizard.get_by_label('Person 1: current age',exact=True).press('Tab')
            assert wizard.get_by_label('Target retirement age',exact=True).count()==2
            wizard.locator('#wizard-next').click()
            assert 'Step 2' in wizard.locator('#wizard-progress').inner_text(), (wizard.locator('#wizard-error').inner_text(),wizard.locator('#wizard-progress').inner_text())
            wizard.get_by_label('Spending period',exact=True).select_option('annual')
            wizard.get_by_label('Target after-tax retirement spending',exact=True).fill('60000')
            wizard.get_by_label('Target after-tax retirement spending',exact=True).press('Tab')
            wizard.get_by_label('Person 1: current gross annual income',exact=True).fill('95000')
            wizard.get_by_label('Person 1: current gross annual income',exact=True).press('Tab')
            wizard.locator('#wizard-next').click();wizard.get_by_label('RRSP balance',exact=True).first.fill('350000')
            wizard.get_by_label('RRSP balance',exact=True).first.press('Tab');wizard.locator('#wizard-next').click()
            page.wait_for_function('!document.getElementById("setup-host").open && PlanState.get().assumptions.desiredMonthlyIncome===5000')
            saved=page.evaluate('()=>BrowserPlanStore.readConfig()')
            assert saved['incomes'][0]['salary']==95000
            assert saved['accounts'][0]['balance']==350000
            # Plan file tools and discreet mode belong to App Config, not to every page.
            assert page.locator('#privacy-toggle').count()==0 and page.locator('#export-json').count()==0 and page.locator('#demo-profile').count()==0
            # Discreet mode masks figures, disables numeric editing and hides chart pixels.
            page.goto(base+'/app-config.html');page.wait_for_selector('#privacy-toggle')
            page.set_viewport_size({'width':320,'height':844})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'App Config overflows at 320px'
            page.set_viewport_size({'width':1280,'height':900})
            page.locator('#privacy-toggle').click()
            # file:// preferences use an asynchronous storage frame; masking precedes its acknowledgement.
            page.wait_for_function('async()=>AppPrivacy.active && (await AppStorage.getPreference("privacy"))===true')
            page.goto(base+'/index.html');page.wait_for_function('window.PlanState && PlanState.get() && AppPrivacy.active')
            assert page.locator('#m-max .private-original').is_hidden()
            assert page.locator('#m-max .private-mask').inner_text()=='••••••'
            assert page.locator('#m-goal').is_hidden()
            assert page.evaluate('()=>BrowserPlanStore.readConfig()')==saved
            page.reload();page.wait_for_function('window.PlanState && PlanState.get() && AppPrivacy.active')
            assert page.locator('#m-max .private-original').is_hidden()
            page.goto(base+'/app-config.html');page.wait_for_selector('#privacy-toggle')
            page.locator('#privacy-toggle').click()
            page.wait_for_function('async()=>!AppPrivacy.active && (await AppStorage.getPreference("privacy"))===false')
            # Plain export is versioned; encrypted export never contains plaintext household fields.
            with page.expect_download() as download: page.locator('#export-json').click()
            plain=json.loads(Path(download.value.path()).read_text())
            assert plain['version']==1 and plain['encrypted'] is False and plain['data']==saved
            page.locator('#encrypt-backup').check();page.locator('#export-json').click()
            page.locator('#backup-password').fill('Maple test phrase');page.locator('#backup-confirm').fill('Maple test phrase')
            with page.expect_download() as download:page.locator('#backup-submit').click()
            encrypted=Path(download.value.path()).read_bytes();envelope=json.loads(encrypted)
            assert envelope['encrypted'] is True and envelope['iterations']==250000
            assert b'assumptions' not in encrypted and b'Maple test phrase' not in encrypted
            page.evaluate('async()=>{const c=structuredClone(PlanState.get());c.assumptions.desiredMonthlyIncome=5100;await AppStorage.save(c);}')
            assert page.locator('#encrypt-backup').is_checked(), 'Saved-plan updates reset the encryption choice'
            page.locator('#import-json-file').set_input_files({'name':'encrypted.json','mimeType':'application/json','buffer':encrypted})
            page.locator('#backup-password').fill('wrong password');page.locator('#backup-submit').click()
            page.wait_for_function('document.getElementById("backup-error").textContent==="Incorrect password"')
            assert page.evaluate('async()=>(await BrowserPlanStore.readConfig()).assumptions.desiredMonthlyIncome')==5100
            page.locator('#backup-password').fill('Maple test phrase');page.locator('#backup-submit').click()
            page.wait_for_function('!document.getElementById("backup-dialog").open && PlanState.get().assumptions.desiredMonthlyIncome===5000')
            assert page.locator('#backup-password').input_value()==''
            assert page.locator('#plan-file-status').inner_text()=='Plan imported successfully and recalculated. You are now using your own plan.'
            # Demonstrations never replace the personal plan, including edits made in demo mode.
            for profile in ['couple','investor','landlord']:
                page.goto(base+'/app-config.html');page.wait_for_selector('#demo-profile')
                with page.expect_navigation(wait_until='load'):page.locator('#demo-profile').select_option(profile)
                page.wait_for_function('window.PlanState && PlanState.get()?.demoProfile && AppStorage.isDemo')
                assert page.locator('#demo-badge').is_visible()
                assert page.evaluate('()=>BrowserPlanStore.readConfig()')==saved
                if profile=='investor':assert page.evaluate('PlanState.get().realEstate[0].ccaEnabled') is True
                if profile=='landlord':
                    landlord=page.evaluate('PlanState.get()')
                    assert landlord['demoProfile']=='landlord' and len(landlord['realEstate'])==11
                    assert all(p['type']=='rental' and p['uccPool']<=p['buildingAcb']<=p['acb'] for p in landlord['realEstate'])
                    assert all(p['incorporated'] for p in landlord['incomes'])
                    assert all(p['rrspRoomOpening']==0 and p['tfsaRoomOpening']==0 for p in landlord['incomes'])
                    rrsps=[a for a in landlord['accounts'] if a['type']=='RRSP']
                    tfsas=[a for a in landlord['accounts'] if a['type']=='TFSA']
                    assert len(rrsps)==2 and all(a['balance']>=725000 for a in rrsps)
                    assert len(tfsas)==2 and all(a['balance']>=112000 and a['contribAmt']==7000 and a['contribFreq']=='yearly' for a in tfsas)
                    salary={p['name']:p['salary'] for p in landlord['incomes']}
                    assert all(a['contribAmt']==salary[a['owner']]*.18 and a['contribFreq']=='yearly' for a in rrsps)
                    assert page.evaluate('()=>{const r=RetireEngine.simulate(PlanState.get());return r.years.length>0&&Number.isFinite(r.finalNetWorth)}')
                    page.goto(base+'/plan-properties.html');page.wait_for_selector('[data-comparison=rental]')
                    rental_tool=page.locator('[data-comparison=rental]')
                    assert rental_tool.locator('input[type=checkbox][value]').count()==11
                    rental_tool.get_by_label('Cedar Triplex',exact=True).check()
                    assert rental_tool.get_by_label('Comparison depth',exact=True).is_visible()
                    assert rental_tool.get_by_label('Comparison depth',exact=True).input_value()=='quick'
                page.evaluate('async()=>{const c=structuredClone(PlanState.get());c.assumptions.desiredMonthlyIncome=9999;await AppStorage.save(c);}')
                assert page.evaluate('()=>BrowserPlanStore.readConfig()')==saved
            # Importing while a demo is active exits demo mode and writes the personal plan directly.
            page.goto(base+'/app-config.html');page.wait_for_selector('#import-json-file',state='attached')
            page.locator('#import-json-file').set_input_files({'name':'broken.json','mimeType':'application/json','buffer':b'{bad json'})
            page.wait_for_function('document.getElementById("plan-file-status").textContent.startsWith("Import failed:")')
            assert page.evaluate('AppStorage.isDemo') is True
            page.locator('#import-json-file').set_input_files({'name':'personal.json','mimeType':'application/json','buffer':json.dumps(plain).encode()})
            page.wait_for_function('window.PlanState && PlanState.get().assumptions.desiredMonthlyIncome===5000 && !AppStorage.isDemo')
            assert page.locator('#plan-file-status').inner_text()=='Plan imported successfully and recalculated. You are now using your own plan.'
            assert page.evaluate('PlanState.get().assumptions.desiredMonthlyIncome')==5000
            assert page.locator('#demo-badge').is_hidden()
            page.goto(base+'/index.html');page.wait_for_function('window.PlanState && PlanState.get()')
            assert page.get_by_text('Your after-tax spending goal',exact=True).is_visible()
            assert page.get_by_text('Estimated spending capacity',exact=True).is_visible()
            assert page.get_by_role('tab',name='Net worth',exact=True).is_visible()
            assert page.get_by_role('tab',name='Cash flow & tax',exact=True).is_visible()
            assert page.get_by_role('tab',name='Contributions',exact=True).is_visible()
            assert page.get_by_role('tab',name='Risk',exact=True).is_hidden()
            page.get_by_role('tab',name='Net worth',exact=True).click();assert page.locator('#p-networth').is_visible()
            page.goto(base+'/action-plan.html');page.wait_for_selector('#run-master:not([disabled])')
            assert page.locator('#master-goal').is_visible()
            assert page.get_by_role('button',name='Optimize my plan',exact=True).is_visible()
            assert page.get_by_text('Compare account withdrawal orders',exact=True).is_visible()
            page.evaluate('async()=>{const c=structuredClone(PlanState.get());c.incomes.forEach(p=>{p.birthYear=new Date().getFullYear()-65;p.targetRetireAge=65;});c.assumptions.targetDeathAge=65;c.realEstate=[];await AppStorage.save(c);}')
            page.locator('#run-master').click()
            page.wait_for_selector('#action-results:not([hidden])',timeout=60000)
            assert page.locator('#action-result-title').inner_text()=='Your plan for more monthly spending'
            assert not page.locator('#withdrawal-options').evaluate('(el)=>el.open')
            assert page.locator('#action-metrics > div').count()==1
            assert page.locator('#master-sell-rentals').is_visible()
            assert 'never leaves your device' in page.locator('#privacy-notice').inner_text()
            assert not errors,errors
            context.close();print('PASS:',mode,'wizard/skip, privacy persistence, plain/encrypted exports, wrong-password recovery, demo isolation and mobile metadata.')
        browser.close()
finally:
    server.shutdown();server.server_close();thread.join(timeout=5)
