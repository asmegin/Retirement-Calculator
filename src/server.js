'use strict';
/* =============================================================================
   Lifecycle Drawdown Engine — server
   LAN access by default; optional Basic Auth covers HTTP and Socket.IO.
   Set BIND=127.0.0.1 if you want it reachable only from the host itself.
   ========================================================================== */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const ServerStore = require('./server-store');
const version = require('./package.json').version;
const path = require('path');
const crypto = require('crypto');
const Engine = require('./public/engine.js');

const PORT = parseInt(process.env.PORT, 10) || 3333;
const BIND = process.env.BIND || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || '/app/data';
const store=new ServerStore(DATA_DIR);
let ready=false;

const app = express();
const server = http.createServer(app);
function sameOrigin(req){try{return !req.headers.origin||new URL(req.headers.origin).host===req.headers.host;}catch(_){return false;}}
const io = new Server(server,{allowRequest:(req,callback)=>callback(null,sameOrigin(req))});
app.disable('x-powered-by');
app.set('query parser','simple');
app.use((req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'SAMEORIGIN'});next();});
app.get('/healthz',(req,res)=>res.status(ready?200:503).json({ok:ready}));

const authEnabled = process.env.BASIC_AUTH_ENABLED === 'true';
if (authEnabled && (!process.env.BASIC_AUTH_USER || !process.env.BASIC_AUTH_PASS)) {
  throw new Error('BASIC_AUTH_USER and BASIC_AUTH_PASS are required when Basic Auth is enabled.');
}
function equalCredential(actual, expected) {
  const digest = value => crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(digest(actual), digest(expected));
}
function basicAuth(req, res, next) {
  if (!authEnabled) return next();
  const header = req.headers.authorization || '';
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header);
  if (match) {
    const credentials = Buffer.from(match[1], 'base64').toString('utf8');
    const colon = credentials.indexOf(':');
    const userOK = equalCredential(credentials.slice(0, colon), process.env.BASIC_AUTH_USER);
    const passOK = equalCredential(credentials.slice(colon + 1), process.env.BASIC_AUTH_PASS);
    if (colon >= 0 && userOK && passOK) return next();
  }
  res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Retirement calculator", charset="UTF-8"', 'Cache-Control':'no-store' });
  res.end('Authentication required');
}
app.use(basicAuth);
io.engine.use(basicAuth);

app.use((req,res,next)=>{if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!sameOrigin(req))return res.status(403).json({error:'Cross-origin writes are not allowed.'});next();});
app.use(express.json({ limit: '2mb' }));
app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');next();});
app.get('/runtime-config.js',(req,res)=>res.set('Cache-Control','no-store').type('application/javascript').send('window.AppRuntime=Object.freeze('+JSON.stringify({mode:'server',version})+');'));
app.use(express.static(path.join(__dirname, 'public'),{setHeaders(res){res.set('Cache-Control','no-cache');}}));

// Every mutation is serialized; files are flushed then atomically renamed.
const loadConfig=()=>store.readConfig();
async function saveConfig(incoming){const c=await store.saveConfig(incoming);io.emit('config_updated',c);return c;}
const backup=()=>store.backup();
const loadScenarios=()=>store.listScenarios();

/* --------------------------------------------------------------- routes  */
app.get('/api/system',(req,res)=>res.json({mode:'server',authEnabled,authManagedByEnvironment:true,port:PORT,version}));
app.get('/api/config', async (req, res, next) => {
  try { res.json(await loadConfig()); }
  catch (err) { next(err); }
});

app.post('/api/config', async (req, res, next) => {
  try {
    const config = await saveConfig(req.body);
    res.json({ success: true, config });
  } catch (err) {
    console.error('Rejected config:', err.message);
    next(err);
  }
});

app.post('/api/backup', async (req, res, next) => {
  try {
    const file = await backup('manual');
    res.json({ ok: !!file, file });
  } catch (err) { next(err); }
});

app.get('/api/backups',async(req,res,next)=>{try{res.json(await store.listBackups());}catch(e){next(e);}});
app.post('/api/backups/restore',async(req,res,next)=>{try{const config=await store.restore(req.body.file);io.emit('config_updated',config);res.json({ok:true,config});}catch(e){next(e);}});
app.get('/api/scenarios',async(req,res,next)=>{try{res.json(await loadScenarios());}catch(e){next(e);}});
app.post('/api/scenarios',async(req,res,next)=>{try{res.json({ok:true,scenarios:await store.saveScenario(req.body.name,req.body.config)});}catch(e){next(e);}});
app.delete('/api/scenarios/:name',async(req,res,next)=>{try{res.json({ok:true,scenarios:await store.deleteScenario(req.params.name)});}catch(e){next(e);}});

/* Server-side projection, handy for scripting or a future export job. */
app.get('/api/projection', async (req, res, next) => {
  try {
    const config = await loadConfig();
    if (req.query.strategy) {if(typeof req.query.strategy!=='string'||!['tfsa-first','rrsp-first','taxable-first','min-tax','oas-smart'].includes(req.query.strategy))return res.status(400).json({error:'Unknown withdrawal strategy.'});config.assumptions.withdrawalStrategy = req.query.strategy;delete config.assumptions.withdrawalPlan;}
    const sim = Engine.simulate(config);
    res.json({
      depletedYear: sim.depletedYear,
      lifetimeTax: Math.round(sim.lifetimeTax),
      finalNetWorth: Math.round(sim.finalNetWorth),
      maxSustainableMonthlySpend: Math.round(Engine.maxSustainableSpend(config)),
      timeline: Engine.buildTimeline(config, sim),
      years: sim.years.map(r => ({
        year: r.year, ages: r.ages, employment: Math.round(r.employment),
        cpp: Math.round(r.cpp), oas: Math.round(r.oas), pension: Math.round(r.pension),
        gis: Math.round(r.gis), dividends: Math.round(r.dividends), payrollCPP: Math.round(r.payrollCPP),
        fhsaQualifyingWithdrawal: Math.round(r.fhsaQualifyingWithdrawal), rentals: r.rentals,
        rentalCash: Math.round(r.rentCash), rrifMinimum: Math.round(r.rrifForced),
        portfolioDraw: Math.round(r.discretionaryDraw), tax: Math.round(r.totalTax),
        afterTaxCash: Math.round(r.netCash), spendingGoal: Math.round(r.spendTarget),
        shortfall: Math.round(r.unfunded), portfolio: Math.round(r.portfolio),
        netWorth: Math.round(r.netWorth)
      }))
    });
  } catch (err) { next(err); }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/config', (req, res) => res.sendFile(path.join(__dirname, 'public', 'config.html')));
app.get('/planning', (req, res) => res.sendFile(path.join(__dirname, 'public', 'planning.html')));
['household','accounts','plan-settings','employment','properties','pensions','detailed','action-plan','scenarios','withdrawals','app-config'].forEach(page=>app.get('/'+page,(req,res)=>res.sendFile(path.join(__dirname,'public',page+'.html'))));

io.on('connection', async socket => {
  try { socket.emit('config_updated', await loadConfig()); }
  catch (err) { console.error('Could not send config to client:', err.message); }
});

app.use('/api',(req,res)=>res.status(404).json({error:'Unknown API endpoint.'}));
app.use((error,req,res,next)=>{
  if(res.headersSent)return next(error);
  const status=error.status===413?413:error.code==='PLAN_VALIDATION'||error.type==='entity.parse.failed'?400:500;
  console.error('Request failed:',error.message);
  res.status(status).json({ok:false,error:status===413?'Request exceeds the 2 MB limit.':status===400?(error.code==='PLAN_VALIDATION'?error.message:'Invalid JSON request.'):'Server storage could not complete the request. Check server logs.'});
});
store.init().then(()=>{ready=true;server.listen(PORT,BIND,()=>console.log(`Retirement Calculator ${version} listening on ${BIND}:${PORT}`));}).catch(error=>{console.error('Startup failed:',error.message);process.exitCode=1;});
let stopping=false;
async function shutdown(){
  if(stopping)return;stopping=true;ready=false;
  const deadline=setTimeout(()=>process.exit(1),10000);deadline.unref();
  await new Promise(resolve=>io.close(resolve));await store.queue;clearTimeout(deadline);
}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
