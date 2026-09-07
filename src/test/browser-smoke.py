"""Browser integration checks using an isolated API fixture (no personal data).
Install Python playwright and a Chromium browser; set NODE_EXE if needed.
Run from repository root: python src/test/browser-smoke.py
"""
import functools
import http.server
import json
import os
from pathlib import Path
import subprocess
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
node = os.environ.get('NODE_EXE', 'node')
fixture = json.loads(subprocess.check_output([node, '-e',
    "const E=require('./public/engine');const c=E.defaultConfig();c.onboardingComplete=true;c.incomes[1].hooppStartAge=55;console.log(JSON.stringify(c));"], cwd=ROOT))
saved = []

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT/'public')))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel=os.environ.get('BROWSER_CHANNEL', 'msedge'), headless=True)
    page = browser.new_page(viewport={'width':1440, 'height':1000})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    def api(route):
        if route.request.url.endswith('/api/config'):
            if route.request.method == 'POST':
                saved.append(route.request.post_data_json)
                route.fulfill(json={'ok':True, 'config':saved[-1]})
            else:
                route.fulfill(json=fixture)
        else:
            route.fulfill(json=[])
    page.route('**/api/**', api)
    page.route('**/socket.io/socket.io.js', lambda route: route.fulfill(content_type='text/javascript', body='window.io=()=>({on(){}});'))
    page.goto(base+'/config.html')
    page.wait_for_selector('#pensions')
    assert page.locator('#pensions input').first.input_value() == 'HOOPP'
    assert not page.get_by_text('HOOPP pension tiers', exact=True).count()
    assert page.locator('#editor input:not([aria-describedby]), #editor select:not([aria-describedby])').count() == 0
    page.locator('#pensions').get_by_role('button', name='Add pension', exact=True).click()
    assert page.evaluate('config.dbPensions.length') == 2
    page.get_by_role('button', name='Save changes', exact=True).click()
    page.wait_for_function("document.getElementById('toast').classList.contains('show')")
    assert len(saved[-1]['dbPensions']) == 2
    assert saved[-1]['incomes'][1]['hooppStartAge'] is None
    # Keyboard and touch help.
    help_button = page.locator('#pensions .help-button').first
    help_button.focus()
    assert page.locator('#pensions .help-tip').first.is_visible()
    help_button.press('Escape')
    assert not page.locator('#pensions .help-tip').first.is_visible()
    page.set_viewport_size({'width':390, 'height':844})
    help_button.click()
    assert page.locator('#pensions .help-tip').first.is_visible()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    # Wizard fields use the same complete help coverage.
    page.get_by_role('button', name='Setup Wizard', exact=True).click()
    for _ in range(5):
        page.locator('#wizard-next').click()
    assert page.locator('#wizard-body').get_by_role('heading', name='Pensions (optional)').is_visible()
    assert page.locator('#wizard-body input:not([aria-describedby]), #wizard-body select:not([aria-describedby])').count() == 0
    page.locator('#wizard-cancel').click()
    # Desktop dashboard and worker integration with real engine and Chart.js.
    page.set_viewport_size({'width':1440, 'height':1000})
    page.goto(base+'/index.html')
    page.wait_for_function("document.getElementById('planner-status').textContent.startsWith('To fund')", timeout=60000)
    assert page.locator('input:not([aria-describedby]), select:not([aria-describedby])').count() == 0
    page.locator('#m-goal').fill('12000')
    page.locator('#m-goal').press('Tab')
    page.wait_for_function("document.getElementById('planner-status').textContent.startsWith('To fund $12,000')", timeout=60000)
    page.locator('#p1-slider').evaluate("el=>{el.value='60';el.dispatchEvent(new Event('input',{bubbles:true}));}")
    page.wait_for_function("document.getElementById('planner-status').textContent.includes('Jon can retire at 60')", timeout=60000)
    page.locator('#p2-slider').evaluate("el=>{el.value='60';el.dispatchEvent(new Event('input',{bubbles:true}));}")
    page.wait_for_function("document.getElementById('planner-status').textContent.includes('Kristen can retire at 60')", timeout=60000)
    page.locator('#planner-both').click()
    page.wait_for_function("document.getElementById('planner-status').textContent.startsWith('To fund')", timeout=60000)
    if page.locator('#planner-apply').is_visible():
        recommended=page.evaluate('plannerResult.ages')
        page.locator('#planner-apply').click()
        assert page.evaluate('config.incomes.map(p=>p.targetRetireAge)') == recommended
    # Rapid edits cancel old searches; a stale result must not replace the new goal.
    for goal in ['1000000', '11000', '10000']:
        page.locator('#m-goal').fill(goal)
        page.locator('#m-goal').press('Tab')
    page.wait_for_function("document.getElementById('planner-status').textContent.startsWith('To fund $10,000')", timeout=60000)
    page.evaluate("config.assumptions.householdType='single';syncControls();run();")
    page.wait_for_function("!document.getElementById('planner-status').textContent.includes('Checking')", timeout=60000)
    assert not page.locator('#p2-slider').is_visible()
    assert not page.locator('#planner-both').is_visible()
    page.set_viewport_size({'width':390,'height':844})
    assert page.locator('#planner-status').is_visible()
    assert not errors, errors
    print('PASS: pension migration/edit/save, all settings have help, keyboard/touch, wizard, worker, both fixed ages, apply, stale search cancellation, single household.')
    browser.close()
server.shutdown()
