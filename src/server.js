'use strict';
/* =============================================================================
   Lifecycle Drawdown Engine — server
   LAN access by default; optional Basic Auth covers HTTP and Socket.IO.
   Set BIND=127.0.0.1 if you want it reachable only from the host itself.
   ========================================================================== */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const Engine = require('./public/engine.js');

const PORT = parseInt(process.env.PORT, 10) || 3333;
const BIND = process.env.BIND || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || '/app/data';
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const SCENARIOS_FILE = path.join(DATA_DIR, 'scenarios.json');
const KEEP_BACKUPS = 30;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ------------------------------------------------------------- storage   */
async function ensureDirs() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
}

async function loadConfig() {
  await ensureDirs();
  try {
    const raw = JSON.parse(await fsp.readFile(CONFIG_FILE, 'utf8'));
    const normalized = Engine.normalizeConfig(raw);
    /* Persist the migration so old files are repaired on disk exactly once. */
    if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
      await backup('migrate');
      await fsp.writeFile(CONFIG_FILE, JSON.stringify(normalized, null, 2));
      console.log('Configuration migrated to the current schema.');
    }
    return normalized;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    const fresh = Engine.normalizeConfig(Engine.defaultConfig());
    fresh.onboardingComplete = false;
    await fsp.writeFile(CONFIG_FILE, JSON.stringify(fresh, null, 2));
    console.log('No usable config found — wrote defaults to', CONFIG_FILE);
    return fresh;
  }
}

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

async function backup(tag) {
  await ensureDirs();
  if (!fs.existsSync(CONFIG_FILE)) return null;
  const name = `config-${stamp()}${tag ? '-' + tag : ''}.json`;
  await fsp.copyFile(CONFIG_FILE, path.join(BACKUP_DIR, name));
  await prune();
  return name;
}

async function prune() {
  const files = (await fsp.readdir(BACKUP_DIR)).filter(f => f.endsWith('.json')).sort();
  const excess = files.length - KEEP_BACKUPS;
  for (let i = 0; i < excess; i++) {
    await fsp.unlink(path.join(BACKUP_DIR, files[i])).catch(() => {});
  }
}

async function saveConfig(incoming) {
  await ensureDirs();
  const normalized = Engine.normalizeConfig(incoming);
  normalized.onboardingComplete = true;
  /* Reject anything the engine cannot actually run, before it hits disk. */
  if(!Engine.simulate(normalized).years.length)throw new Error('Choose a planning age that extends into the current year.');
  await backup(null);
  await fsp.writeFile(CONFIG_FILE, JSON.stringify(normalized, null, 2));
  io.emit('config_updated', normalized);
  return normalized;
}

async function loadScenarios() {
  try { return JSON.parse(await fsp.readFile(SCENARIOS_FILE, 'utf8')); }
  catch { return []; }
}
async function writeScenarios(list) {
  await ensureDirs();
  await fsp.writeFile(SCENARIOS_FILE, JSON.stringify(list, null, 2));
}

/* --------------------------------------------------------------- routes  */
app.get('/api/system',(req,res)=>res.json({mode:'server',authEnabled,authManagedByEnvironment:true,port:PORT}));
app.get('/api/config', async (req, res) => {
  try { res.json(await loadConfig()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/config', async (req, res) => {
  try {
    const config = await saveConfig(req.body);
    res.json({ success: true, config });
  } catch (err) {
    console.error('Rejected config:', err.message);
    res.status(400).json({ success: false, error: 'Configuration is not valid: ' + err.message });
  }
});

app.post('/api/backup', async (req, res) => {
  try {
    const file = await backup('manual');
    res.json({ ok: !!file, file });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.get('/api/backups', async (req, res) => {
  try {
    await ensureDirs();
    const files = (await fsp.readdir(BACKUP_DIR)).filter(f => f.endsWith('.json')).sort().reverse();
    const out = [];
    for (const f of files) {
      const st = await fsp.stat(path.join(BACKUP_DIR, f));
      out.push({ file: f, size: st.size, modified: st.mtime });
    }
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/backups/restore', async (req, res) => {
  try {
    const file = path.basename(String(req.body.file || ''));   // no path traversal
    const full = path.join(BACKUP_DIR, file);
    if (!file.endsWith('.json') || !fs.existsSync(full)) {
      return res.status(404).json({ ok: false, error: 'That backup no longer exists.' });
    }
    const config = await saveConfig(JSON.parse(await fsp.readFile(full, 'utf8')));
    res.json({ ok: true, config });
  } catch (err) { res.status(400).json({ ok: false, error: err.message }); }
});

app.get('/api/scenarios', async (req, res) => res.json(await loadScenarios()));

app.post('/api/scenarios', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim().slice(0, 60);
    if (!name) return res.status(400).json({ ok: false, error: 'Name a scenario before saving it.' });
    const config = Engine.normalizeConfig(req.body.config);
    const list = (await loadScenarios()).filter(s => s.name !== name);
    list.push({ name, savedAt: new Date().toISOString(), config });
    await writeScenarios(list);
    res.json({ ok: true, scenarios: list });
  } catch (err) { res.status(400).json({ ok: false, error: err.message }); }
});

app.delete('/api/scenarios/:name', async (req, res) => {
  const list = (await loadScenarios()).filter(s => s.name !== req.params.name);
  await writeScenarios(list);
  res.json({ ok: true, scenarios: list });
});

/* Server-side projection, handy for scripting or a future export job. */
app.get('/api/projection', async (req, res) => {
  try {
    const config = await loadConfig();
    if (req.query.strategy) config.assumptions.withdrawalStrategy = req.query.strategy;
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/config', (req, res) => res.sendFile(path.join(__dirname, 'public', 'config.html')));
app.get('/planning', (req, res) => res.sendFile(path.join(__dirname, 'public', 'planning.html')));
['household','employment','properties','pensions','detailed','scenarios','withdrawals','app-config'].forEach(page=>app.get('/'+page,(req,res)=>res.sendFile(path.join(__dirname,'public',page+'.html'))));

io.on('connection', async socket => {
  try { socket.emit('config_updated', await loadConfig()); }
  catch (err) { console.error('Could not send config to client:', err.message); }
});

server.listen(PORT, BIND, () => {
  console.log(`Lifecycle Drawdown Engine listening on ${BIND}:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});
