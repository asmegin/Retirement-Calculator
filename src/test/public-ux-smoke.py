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
            # Discreet mode masks figures, disables numeric editing and hides chart pixels.
            page.locator('#privacy-toggle').click();page.wait_for_function('AppPrivacy.active')
            assert page.locator('#m-max .private-original').is_hidden()
            assert page.locator('#m-max .private-mask').inner_text()=='••••••'
            assert page.locator('#m-goal').is_hidden()
            assert page.evaluate('()=>BrowserPlanStore.readConfig()')==saved
            page.reload();page.wait_for_function('window.PlanState && PlanState.get() && AppPrivacy.active')
            assert page.locator('#m-max .private-original').is_hidden()
            page.locator('#privacy-toggle').click();page.wait_for_function('!AppPrivacy.active')
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
            page.locator('#import-json-file').set_input_files({'name':'encrypted.json','mimeType':'application/json','buffer':encrypted})
            page.locator('#backup-password').fill('wrong password');page.locator('#backup-submit').click()
            page.wait_for_function('document.getElementById("backup-error").textContent==="Incorrect password"')
            assert page.evaluate('async()=>(await BrowserPlanStore.readConfig()).assumptions.desiredMonthlyIncome')==5100
            page.locator('#backup-password').fill('Maple test phrase');page.locator('#backup-submit').click()
            page.wait_for_function('!document.getElementById("backup-dialog").open && PlanState.get().assumptions.desiredMonthlyIncome===5000')
            assert page.locator('#backup-password').input_value()==''
            # Demonstrations never replace the personal plan, including edits made in demo mode.
            for profile in ['couple','investor']:
                with page.expect_navigation(wait_until='load'):page.locator('#demo-profile').select_option(profile)
                page.wait_for_function('window.PlanState && PlanState.get()?.demoProfile && AppStorage.isDemo')
                assert page.locator('#demo-badge').is_visible()
                assert page.evaluate('()=>BrowserPlanStore.readConfig()')==saved
                if profile=='investor':assert page.evaluate('PlanState.get().realEstate[0].ccaEnabled') is True
                page.evaluate('async()=>{const c=structuredClone(PlanState.get());c.assumptions.desiredMonthlyIncome=9999;await AppStorage.save(c);}')
                assert page.evaluate('()=>BrowserPlanStore.readConfig()')==saved
            with page.expect_navigation(wait_until='load'):page.locator('#start-own-plan').click()
            page.wait_for_function('window.PlanState && PlanState.get() && !AppStorage.isDemo')
            assert page.evaluate('PlanState.get().assumptions.desiredMonthlyIncome')==5000
            assert page.locator('#demo-badge').is_hidden()
            assert 'never leaves your device' in page.locator('#privacy-notice').inner_text()
            assert not errors,errors
            context.close();print('PASS:',mode,'wizard/skip, privacy persistence, plain/encrypted exports, wrong-password recovery, demo isolation and mobile metadata.')
        browser.close()
finally:
    server.shutdown();server.server_close();thread.join(timeout=5)
