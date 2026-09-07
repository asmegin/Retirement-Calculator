"""Isolated browser checks for themes and the planning workspace."""
import functools
import http.server
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
fixture=json.loads(subprocess.check_output([os.environ.get('NODE_EXE','node'),'-e',"const E=require('./public/engine');const c=E.defaultConfig();c.onboardingComplete=true;c.incomes.forEach(p=>{p.birthYear=1961;p.targetRetireAge=65;p.hbpYears=0;});c.assumptions.targetDeathAge=71;c.assumptions.desiredMonthlyIncome=3000;console.log(JSON.stringify(c));"],cwd=ROOT))
saved=[]
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT/'public')))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
with sync_playwright() as pw:
    browser=pw.chromium.launch(channel=os.environ.get('BROWSER_CHANNEL','msedge'),headless=True)
    page=browser.new_page(viewport={'width':1512,'height':1000})
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    def api(route):
        if route.request.url.endswith('/api/config'):
            if route.request.method=='POST':
                saved.append(route.request.post_data_json)
                route.fulfill(json={'ok':True,'config':saved[-1]})
            else:route.fulfill(json=fixture)
        else:route.fulfill(json=[])
    page.route('**/api/**',api)
    page.goto(base+'/planning.html')
    page.wait_for_selector('#workspace-summary .metric-card')
    assert page.evaluate('document.documentElement.dataset.theme')=='light'
    assert page.locator('input:not([aria-describedby]),select:not([aria-describedby]),textarea:not([aria-describedby])').count()==0
    page.locator('[data-theme-toggle]').click()
    assert page.evaluate('document.documentElement.dataset.theme')=='dark'
    page.reload();page.wait_for_selector('#workspace-summary .metric-card')
    assert page.evaluate('document.documentElement.dataset.theme')=='dark'
    page.locator('[data-theme-toggle]').click()
    # Category cash flow and age windows.
    page.locator('#add-expense').click()
    page.locator('#spending-rows').get_by_label('Category',exact=True).fill('Travel')
    page.locator('#spending-rows').get_by_label('Amount',exact=True).fill('1200')
    page.locator('#spending-rows').get_by_label('Amount',exact=True).press('Tab')
    page.get_by_label('Budget method',exact=True).select_option('categories')
    page.wait_for_function("config.assumptions.desiredMonthlyIncome===1200")
    assert page.evaluate('projection.years[0].spendTarget')==14400
    # Sandbox edits must not change the workspace baseline.
    before=page.evaluate('config.incomes[0].targetRetireAge')
    page.locator('#scenario-controls').get_by_label('Jon: retire at',exact=True).fill('68')
    page.locator('#scenario-controls').get_by_label('Jon: retire at',exact=True).press('Tab')
    page.wait_for_timeout(500)
    assert page.evaluate('config.incomes[0].targetRetireAge')==before
    page.locator('#scenario-reset').click()
    # Corporate and estate input panels, solver worker and applying its result.
    page.locator('#add-corporation').click()
    assert page.locator('#corporate-rows').get_by_label('Opening CDA',exact=True).count()==1
    page.get_by_label('Include death and terminal taxes',exact=True).check()
    page.get_by_label('Jon lifespan (age)',exact=True).fill('70')
    page.get_by_label('Jon lifespan (age)',exact=True).press('Tab')
    page.wait_for_function('projection.estateEvents.length>0')
    page.locator('#optimize').click()
    page.wait_for_function("document.getElementById('optimization-status').textContent.startsWith('Evaluated ') && !document.getElementById('optimize').disabled",timeout=60000)
    assert page.locator('#optimization-result tbody tr').count()>0
    page.locator('#apply-optimized').click()
    page.locator('#save-plan').click()
    page.wait_for_function("document.getElementById('save-status').textContent==='Plan saved.'")
    assert saved[-1]['assumptions']['spendingMode']=='categories'
    assert len(saved[-1]['assumptions']['spendingCategories'])==1
    # Capture both themes and check narrow-screen overflow.
    page.evaluate('scrollTo(0,0)')
    page.screenshot(path=str(Path(tempfile.gettempdir())/'retirement-workspace-light.png'))
    page.locator('[data-theme-toggle]').click()
    page.screenshot(path=str(Path(tempfile.gettempdir())/'retirement-workspace-dark.png'))
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),page.evaluate('document.documentElement.scrollWidth')
    page.screenshot(path=str(Path(tempfile.gettempdir())/'retirement-workspace-mobile.png'))
    assert not errors,errors
    print('PASS: light default, theme persistence, all-field help, categories, isolated scenarios, corporate/estate inputs, solver worker/apply/save, responsive layout.')
    browser.close()
server.shutdown()
