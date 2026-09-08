"""Exercise the actual Pages artifact at the root and project subpaths, without an API."""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
import json, os, shutil, tempfile, threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]

class QuietHandler(SimpleHTTPRequestHandler):
    def copyfile(self, source, outputfile):
        try: super().copyfile(source, outputfile)
        except (ConnectionError, BrokenPipeError): pass

    def log_message(self, *args):
        pass

def loaded(page, url):
    page.goto(url)
    page.wait_for_function('window.PlanState && PlanState.get()')

with tempfile.TemporaryDirectory(prefix='retirement-static-') as directory:
    root = Path(directory)
    for destination in [root, root/'Retirement-Calculator', root/'OtherCalculator']:
        shutil.copytree(ROOT/'dist/pages', destination, dirs_exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=directory))
    thread = threading.Thread(target=server.serve_forever, daemon=True);thread.start()
    base = f'http://127.0.0.1:{server.server_port}'
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel=os.environ.get('BROWSER_CHANNEL', 'msedge'), headless=True)
            context = browser.new_context()
            requests, errors, failures, sockets = [], [], [], []
            context.on('request', lambda r: requests.append(r.url))
            context.on('response', lambda r: failures.append(r.url) if r.status >= 400 else None)
            context.on('page', lambda p: (p.on('pageerror', lambda e: errors.append(str(e))), p.on('websocket', lambda ws: sockets.append(ws.url))))
            page = context.new_page();project = base+'/Retirement-Calculator'
            loaded(page, project+'/index.html')
            assert page.evaluate('AppStorage.deployment') == 'static'
            assert page.evaluate('PlanState.get().onboardingComplete') is False
            assert page.locator('#setup-host').evaluate('(el)=>el.open')
            fixture = page.evaluate('''()=>{
              const c=RetireEngine.defaultConfig(),year=new Date().getFullYear();c.onboardingComplete=true;
              c.incomes.forEach((p,k)=>Object.assign(p,{name:'Test person '+(k+1),birthYear:year-65+k,targetRetireAge:65,cppBaseAt65:900,oasBaseAt65:700}));
              c.assumptions.targetDeathAge=70;c.assumptions.desiredMonthlyIncome=3200;c.assumptions.mcRuns=100;
              c.accounts=[{name:'Test savings',owner:c.incomes[0].name,type:'RRSP',balance:700000,growthRate:4}];return c;
            }''')
            page.locator('#import-json-file').set_input_files({'name':'plan.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()})
            page.wait_for_function('PlanState.get().assumptions.desiredMonthlyIncome===3200 && !document.getElementById("setup-host").open')
            page.locator('#m-goal').fill('3300');page.locator('#m-goal').press('Tab')
            page.evaluate('async()=>{for(let i=0;i<100;i++){if((await BrowserPlanStore.readConfig()).assumptions.desiredMonthlyIncome===3300)return;await new Promise(r=>setTimeout(r,50));}throw new Error("Save did not persist");}')
            for file in ['detailed','household','accounts','employment','properties','pensions','plan-settings','scenarios','withdrawals','app-config','action-plan','index']:
                loaded(page,project+'/'+file+'.html')
                assert page.evaluate('PlanState.get().assumptions.desiredMonthlyIncome') == 3300, (file,page.evaluate('PlanState.get().assumptions.desiredMonthlyIncome'),page.evaluate('async()=>(await BrowserPlanStore.readConfig()).assumptions.desiredMonthlyIncome'))
            # The same worker handler runs in static, server and file deployments.
            result = page.evaluate('''()=>new Promise((resolve,reject)=>{
              const worker=AppWorkers.create('comparison');worker.onerror=e=>reject(e.message);
              worker.onmessage=({data})=>{if(data.error){worker.terminate();reject(data.error);}else if(data.result){worker.terminate();resolve(data.result);}};
              worker.postMessage({id:1,config:PlanState.get(),task:'withdrawals'});
            })''')
            expected = page.evaluate('RetireEngine.compareWithdrawalOrders(PlanState.get())')
            assert result == expected
            # Scenarios and backups survive navigation and restore the intended snapshot.
            backup = page.evaluate('async()=>{await BrowserPlanStore.saveScenario("Baseline",PlanState.get());return await BrowserPlanStore.backup();}')
            page.evaluate('async()=>{const c=structuredClone(PlanState.get());c.assumptions.desiredMonthlyIncome=3500;await AppStorage.save(c);}')
            page.evaluate('async file=>{const r=await AppStorage.fetch("/api/backups/restore",{method:"POST",body:JSON.stringify({file})});if(!r.ok)throw new Error("Restore failed");}', backup)
            page.reload();page.wait_for_function('window.PlanState && PlanState.get()?.assumptions.desiredMonthlyIncome===3300')
            assert page.evaluate('async()=>(await BrowserPlanStore.listScenarios())[0].name') == 'Baseline'
            with page.expect_download() as download:page.locator('#export-json').click()
            assert json.loads(Path(download.value.path()).read_text())['data']['assumptions']['desiredMonthlyIncome'] == 3300
            # Atomic browser writes preserve the saved plan on quota failure.
            outcome = page.evaluate('''async()=>{
              const original=Storage.prototype.setItem,before=JSON.stringify(await BrowserPlanStore.readConfig());
              Storage.prototype.setItem=function(){throw new DOMException('Quota exhausted','QuotaExceededError');};
              try{const c=structuredClone(PlanState.get());c.assumptions.desiredMonthlyIncome=9999;
                try{await AppStorage.save(c);return {failed:false};}catch(error){return {failed:true,message:error.message,unchanged:before===JSON.stringify(await BrowserPlanStore.readConfig())};}
              }finally{Storage.prototype.setItem=original;}
            }''')
            assert outcome['failed'] and outcome['unchanged'], outcome
            assert 'storage' in outcome['message'].lower()
            # Different Pages projects on the same origin have separate plans.
            other = context.new_page()
            for path in ['/OtherCalculator/index.html','/index.html']:
                loaded(other,base+path)
                assert other.evaluate('PlanState.get().onboardingComplete') is False
                assert other.evaluate('PlanState.get().accounts.length') == 0
            # Two tabs serialize independent scenario writes and receive saved config updates.
            loaded(other,project+'/index.html')
            page.evaluate('window.pendingScenario=BrowserPlanStore.saveScenario("Tab A",PlanState.get());void 0')
            other.evaluate('window.pendingScenario=BrowserPlanStore.saveScenario("Tab B",PlanState.get());void 0')
            page.evaluate('()=>window.pendingScenario');other.evaluate('()=>window.pendingScenario')
            assert sorted(s['name'] for s in page.evaluate('()=>BrowserPlanStore.listScenarios()')) == ['Baseline','Tab A','Tab B']
            page.evaluate('async()=>{const c=structuredClone(PlanState.get());c.assumptions.desiredMonthlyIncome=3400;await AppStorage.save(c);}')
            other.wait_for_function('PlanState.get().assumptions.desiredMonthlyIncome===3400')
            # Imported names must remain inert in HTML-rendered details and timeline.
            page.evaluate('''async()=>{const c=structuredClone(PlanState.get());const name='<img src=x onerror="window.importExecuted=true">';c.incomes[0].name=name;c.accounts[0].owner=name;c.accounts[0].name=name;await AppStorage.save(c);showYear(sim.years[0].year);}''')
            assert page.locator('#detail-modal-content img,#timeline-list img').count() == 0
            assert not page.evaluate('window.importExecuted===true')
            # Legacy data is copied, retained for rollback, and not mixed with server cache.
            legacy = browser.new_context();legacy_page=legacy.new_page()
            legacy_page.goto(project+'/runtime-config.js')
            legacy_page.evaluate('c=>{localStorage.setItem("retirement-config-v1",JSON.stringify(c));localStorage.setItem("retirement-scenarios-v1",JSON.stringify([{name:"Legacy",config:c}]));}',fixture)
            loaded(legacy_page,project+'/index.html')
            assert legacy_page.evaluate('PlanState.get().assumptions.desiredMonthlyIncome') == 3200
            legacy_page.evaluate('()=>AppStorage.save(PlanState.get())')
            assert legacy_page.evaluate('JSON.parse(localStorage.getItem("retirement-config-v1")).assumptions.desiredMonthlyIncome') == 3200
            assert legacy_page.evaluate('async()=>(await BrowserPlanStore.listScenarios())[0].name') == 'Legacy'
            legacy.close()
            # Plans from the earlier IndexedDB build migrate into localStorage without data loss.
            migration=browser.new_context();migrating=migration.new_page();migrating.goto(project+'/runtime-config.js')
            migrating.evaluate('''async c=>{const scope='retirement-'+encodeURIComponent('/Retirement-Calculator/');await new Promise((resolve,reject)=>{const r=indexedDB.open(scope,1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('state','readwrite');tx.objectStore('state').put({schemaVersion:2,config:c,scenarios:[{name:'Database plan',config:c}],backups:[]},'plan');tx.oncomplete=()=>{db.close();resolve();};};});}''',fixture)
            loaded(migrating,project+'/index.html')
            assert migrating.evaluate('PlanState.get().assumptions.desiredMonthlyIncome')==3200
            migrating.evaluate('()=>AppStorage.save(PlanState.get())')
            assert migrating.evaluate('JSON.parse(localStorage.getItem(BrowserPlanStore.stateKey)).config.assumptions.desiredMonthlyIncome')==3200
            assert migrating.evaluate('async()=>(await BrowserPlanStore.listScenarios())[0].name')=='Database plan'
            migration.close()
            assert not errors, errors
            assert not failures, failures
            assert not sockets, sockets
            assert not [url for url in requests if urlparse(url).scheme in ['http','https','ws','wss'] and not url.startswith(base+'/')], [url for url in requests if not url.startswith(base+'/')]
            assert not [url for url in requests if '/api/' in urlparse(url).path or '/socket.io/' in urlparse(url).path], requests
            browser.close()
            print('PASS: static root/project paths, zero backend/external requests, setup, all pages, workers, import/export, backups, scenarios, quota failure, tab sync, project isolation, legacy migration and inert imported HTML.')
    finally:
        server.shutdown();server.server_close();thread.join(timeout=5)
