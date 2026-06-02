import fs from 'fs';
import path from 'path';
import http from 'http';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';

dotenv.config();

const PORT = process.env.PORT || 3001;
const BOT_API_KEY = process.env.BOT_API_KEY || 'dev_apikey';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '1h';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const DATA_FILE = process.env.DATA_FILE || path.join(process.cwd(), 'data', 'config.json');

function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { settings: {}, commands: [], status: {} };
  }
}
function saveData(data) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let store = loadData();

const app = express();
app.use(express.json());
app.use(cors({
  origin: ALLOWED_ORIGIN,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

// Auth: exchange API key for JWT (panel uses long-lived PANEL_API_KEY)
app.post('/auth', (req, res) => {
  const { apiKey } = req.body || {};
  if (!apiKey || apiKey !== BOT_API_KEY) return res.status(401).json({ error: 'invalid_api_key' });
  const token = jwt.sign({ role: 'panel' }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
  res.json({ token, expiresIn: JWT_EXPIRY });
});

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'missing_authorization' });
  const token = auth.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

app.get('/api/settings', requireAuth, (req, res) => {
  res.json({ settings: store.settings || {} });
});

app.put('/api/settings', requireAuth, (req, res) => {
  const newSettings = req.body;
  if (typeof newSettings !== 'object') return res.status(400).json({ error: 'invalid_payload' });
  store.settings = newSettings;
  saveData(store);
  broadcast({ type: 'settings:update', payload: store.settings });
  res.json({ ok: true, settings: store.settings });
});

app.get('/api/commands', requireAuth, (req, res) => {
  res.json({ commands: store.commands || [] });
});
app.post('/api/commands', requireAuth, (req, res) => {
  const cmd = req.body;
  cmd.id = Date.now().toString();
  store.commands = store.commands || [];
  store.commands.push(cmd);
  saveData(store);
  broadcast({ type: 'commands:create', payload: cmd });
  res.json({ ok: true, command: cmd });
});
app.put('/api/commands/:id', requireAuth, (req, res) => {
  const id = req.params.id;
  const idx = (store.commands || []).findIndex(c => c.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not_found' });
  store.commands[idx] = { ...store.commands[idx], ...req.body };
  saveData(store);
  broadcast({ type: 'commands:update', payload: store.commands[idx] });
  res.json({ ok: true, command: store.commands[idx] });
});
app.delete('/api/commands/:id', requireAuth, (req, res) => {
  const id = req.params.id;
  store.commands = (store.commands || []).filter(c => c.id !== id);
  saveData(store);
  broadcast({ type: 'commands:delete', payload: { id } });
  res.json({ ok: true });
});

app.post('/api/status', requireAuth, (req, res) => {
  store.status = req.body || {};
  saveData(store);
  broadcast({ type: 'status:update', payload: store.status });
  res.json({ ok: true, status: store.status });
});

app.get('/health', (req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(msg) {
  const raw = JSON.stringify(msg);
  wss.clients.forEach(c => {
    if (c.readyState === c.OPEN) c.send(raw);
  });
}

wss.on('connection', (ws, req) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    if (!token) { ws.close(4001, 'missing_token'); return; }
    const user = jwt.verify(token, JWT_SECRET);
    ws.user = user;
  } catch (err) {
    ws.close(4002, 'invalid_token'); return;
  }

  ws.send(JSON.stringify({ type: 'initial', payload: { settings: store.settings || {}, commands: store.commands || [], status: store.status || {} } }));

  ws.on('message', (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch (e) { return; }
    if (data && data.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
  });
});

server.listen(PORT, () => {
  console.log(`Bot backend listening on port ${PORT}`);
});
