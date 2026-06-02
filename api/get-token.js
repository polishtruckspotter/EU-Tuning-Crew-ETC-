import { createHmac, timingSafeEqual } from 'node:crypto';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

const panelPassword = process.env.PANEL_PASSWORD || 'etc-panel';
const ownerPassword = process.env.OWNER_PASSWORD || panelPassword;
const adminPassword = process.env.ADMIN_PASSWORD || 'etc-admin';
const cookieSecret = process.env.COOKIE_SECRET || ownerPassword || panelPassword;

function sign(value) {
  return createHmac('sha256', cookieSecret).update(value).digest('base64url');
}

function safeCompare(input, expected) {
  const a = Buffer.from(input || '', 'utf8');
  const b = Buffer.from(expected || '', 'utf8');
  try {
    return a.length === b.length && timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

function readSession(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)etc_panel_session=([^;]+)/);
  if (!match) return null;

  const token = decodeURIComponent(match[1]);
  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) return null;

  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  const expected = sign(payload);
  if (!safeCompare(signature, expected)) return null;

  const [role, createdAtRaw] = payload.split('.');
  const createdAt = Number(createdAtRaw);
  if (!['admin', 'owner'].includes(role) || !Number.isFinite(createdAt)) return null;
  const maxAgeSeconds = 60 * 60 * 12;
  if (Date.now() - createdAt > maxAgeSeconds * 1000) return null;
  return { role };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405; res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }

  const session = readSession(req);
  if (!session) {
    res.statusCode = 401; res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }

  const botApiUrl = (process.env.BOT_API_URL || process.env.WISPBYTE_BOT_API_URL || process.env.VERCEL_BOT_API_URL || process.env.BOT_URL || '').replace(/\/+$/, '');
  const botApiSecret = process.env.BOT_API_SECRET || process.env.PANEL_API_SECRET || '';

  if (!botApiUrl || !botApiSecret) {
    res.statusCode = 500; res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'bot_api_not_configured' }));
    return;
  }

  try {
    const target = new URL('/auth', botApiUrl).toString();
    const r = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: botApiSecret })
    });
    const payload = await r.json().catch(() => ({}));
    res.statusCode = r.status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  } catch (err) {
    res.statusCode = 500; res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: String(err) }));
  }
}
