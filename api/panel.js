import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const panelPassword = process.env.PANEL_PASSWORD || "etc-panel";
const ownerPassword = process.env.OWNER_PASSWORD || panelPassword;
const adminPassword = process.env.ADMIN_PASSWORD || "etc-admin";
const cookieSecret = process.env.COOKIE_SECRET || ownerPassword || panelPassword;
const maxAgeSeconds = 60 * 60 * 12;
const botApiUrl = process.env.BOT_API_URL || process.env.WISPBYTE_BOT_API_URL || (process.env.NODE_ENV !== "production" ? "http://localhost:10001" : "");
const botApiSecret = process.env.BOT_API_SECRET || process.env.PANEL_API_SECRET || "";

const fallbackConfig = {
  activityText: "EU Tuning Crew",
  statusReply: "ETC bot is online and ready.",
  pingReply: "Pong! {ping}ms",
  noPingStaffRoleId: "",
  rulesChannelId: "",
  modmailGuildId: "",
  modmailCategoryId: "",
  modmailPanelChannelId: "",
  modmailIntroText: "Welcome to ETC modmail. Press Open Modmail to start a modmail, send your message, and use =close when you are done.",
  modmailOpenedText: "Your ETC modmail is now open. Send your message here and the staff team will receive it.",
  modmailClosedText: "Your ETC modmail has been closed. If you need help again, press Open Modmail to reopen it.",
  welcomeJoinChannelId: "",
  welcomeEmbedTitle: "Welcome to ETC!",
  welcomeEmbedDescription: "Hey ${member}! Welcome to **EU Tuning Crew**.",
  welcomeEmbedColor: "0x1ff2d2",
  welcomeEmbedImageUrl: "welcome message.png",
  pvModmailEnabled: false,
  pvEmbedTitle: "PV",
  pvEmbedDescription: "${content}",
  pvEmbedColor: "0x1ff2d2",
  pvEmbedImageUrl: "",
  // Ticket System
  ticketSystemEnabled: false,
  ticketCategoryId: "",
  ticketPanelChannelId: "",
  ticketIntroText: "Click the button below to create a support ticket.",
  // Auto-Moderation
  autoModEnabled: false,
  spamFilterEnabled: false,
  spamThreshold: 5,
  capsFilterEnabled: false,
  profanityFilterEnabled: false,
  inviteFilterEnabled: false,
  // Member Tracking
  memberTrackingEnabled: false,
  memberLogChannelId: "",
  // Leveling System
  levelingEnabled: false,
  levelAnnouncementChannelId: "",
  // Message Logging
  messageLoggingEnabled: false,
  messageLogChannelId: "",
  // Reaction Roles
  reactionRolesEnabled: false,
  // Voting/Polls
  votingEnabled: false
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sign(value) {
  return createHmac("sha256", cookieSecret).update(value).digest("base64url");
}

function createSession(role) {
  const payload = `${role}.${Date.now()}.${randomBytes(12).toString("base64url")}`;
  return `${payload}.${sign(payload)}`;
}

function readSession(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)etc_panel_session=([^;]+)/);
  if (!match) return null;

  const token = decodeURIComponent(match[1]);
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) return null;

  const payload = token.slice(0, lastDot);
  const signature = token.slice(lastDot + 1);
  const expected = sign(payload);
  if (!safeCompare(signature, expected)) return null;

  const [role, createdAtRaw] = payload.split(".");
  const createdAt = Number(createdAtRaw);
  if (!["admin", "owner"].includes(role) || !Number.isFinite(createdAt)) return null;
  if (Date.now() - createdAt > maxAgeSeconds * 1000) return null;

  return { role };
}

function safeCompare(input, expected) {
  const a = Buffer.from(input || "", "utf8");
  const b = Buffer.from(expected || "", "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function sendHtml(res, statusCode, html, headers = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(html);
}

function redirect(res, location, headers = {}) {
  res.writeHead(302, {
    Location: location,
    "Cache-Control": "no-store",
    ...headers
  });
  res.end();
}

function parseFormBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 1_000_000) {
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => resolve(Object.fromEntries(new URLSearchParams(body))));
    req.on("error", reject);
  });
}

function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body { 
      background: radial-gradient(circle at top, rgba(31, 242, 210, 0.12), transparent 25%),
                  radial-gradient(circle at bottom right, rgba(36, 134, 255, 0.08), transparent 20%),
                  #07080f;
      color: #e8eef2;
      font-family: 'Manrope', sans-serif;
      min-height: 100vh;
      padding: 24px;
    }
    main { 
      max-width: 1360px;
      margin: 0 auto;
      min-height: calc(100vh - 48px);
    }
    .panel-shell {
      display: grid;
      grid-template-columns: 320px minmax(0, 1fr);
      gap: 24px;
    }
    .sidebar {
      position: sticky;
      top: 24px;
      align-self: start;
      background: rgba(14, 18, 33, 0.92);
      border: 1px solid rgba(31, 242, 210, 0.12);
      border-radius: 28px;
      padding: 28px 22px;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
    }
    .brand-short {
      color: #7bf8e1;
      text-transform: uppercase;
      letter-spacing: 0.25em;
      font-size: 0.8rem;
      font-weight: 800;
      margin-bottom: 14px;
    }
    .brand-title {
      font-size: 2rem;
      font-weight: 800;
      line-height: 1.05;
      margin-bottom: 14px;
      letter-spacing: 0.05em;
      color: #e8fff7;
    }
    .brand-copy {
      color: #aacbce;
      line-height: 1.75;
      font-size: 0.95rem;
      margin-bottom: 26px;
    }
    .nav-list {
      display: grid;
      gap: 12px;
      margin-bottom: 26px;
    }
    .nav-item {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      padding: 16px 18px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 18px;
      color: #c1dce1;
      text-decoration: none;
      transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
      font-weight: 600;
    }
    .nav-item:hover {
      transform: translateX(4px);
      border-color: rgba(31, 242, 210, 0.25);
      background: rgba(31, 242, 210, 0.06);
    }
    .nav-item.active {
      border-color: #1ff2d2;
      background: rgba(31, 242, 210, 0.14);
      color: #ffffff;
    }
    .logout-row {
      display: flex;
      justify-content: center;
      margin-top: 14px;
    }
    .logout-row button {
      width: 100%;
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.14);
      color: #e8eef2;
      padding: 14px 0;
      border-radius: 16px;
      font-weight: 700;
      cursor: pointer;
    }
    .panel-main {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .hero-panel {
      background: rgba(11, 16, 28, 0.94);
      border: 1px solid rgba(31, 242, 210, 0.14);
      border-radius: 28px;
      padding: 32px;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
    }
    .hero-top {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      align-items: flex-start;
      margin-bottom: 20px;
    }
    .hero-copy h1 {
      font-size: clamp(2.2rem, 1.8vw, 3rem);
      margin-bottom: 14px;
      line-height: 1.05;
      letter-spacing: 0.06em;
      color: #c9fff4;
    }
    .hero-copy p {
      color: #a6c9cf;
      line-height: 1.8;
      max-width: 760px;
      font-size: 1rem;
    }
    .hero-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 20px;
    }
    .hero-actions a button {
      min-width: 180px;
      padding: 14px 18px;
      border-radius: 16px;
      border: none;
      background: linear-gradient(135deg, #1ff2d2, #12b6a9);
      color: #06100f;
    }
    .hero-actions a button.outline {
      background: transparent;
      border: 1px solid rgba(255,255,255,0.14);
      color: #e8eef2;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
      margin-top: 22px;
    }
    .stat-card {
      padding: 20px;
      background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(31, 242, 210, 0.04));
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 20px;
      min-height: 126px;
    }
    .stat-card strong {
      display: block;
      font-size: 0.85rem;
      color: #bccdd2;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      margin-bottom: 12px;
    }
    .stat-card .stat-value {
      font-size: 1.7rem;
      color: #e9fff6;
      font-weight: 800;
      line-height: 1.1;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      background: rgba(31, 242, 210, 0.14);
      border-radius: 999px;
      border: 1px solid rgba(31, 242, 210, 0.22);
      color: #c8fff3;
      font-size: 0.9rem;
      font-weight: 700;
    }
    .status-dot {
      width: 10px;
      height: 10px;
      background: #1ff2d2;
      border-radius: 50%;
      box-shadow: 0 0 0 8px rgba(31, 242, 210, 0.12);
    }
    .section-panel {
      background: rgba(12, 16, 28, 0.94);
      border: 1px solid rgba(31, 242, 210, 0.1);
      border-radius: 24px;
      padding: 28px;
    }
    .section-panel h2 {
      font-size: 1.35rem;
      font-weight: 800;
      margin-bottom: 10px;
      color: #d8ffef;
    }
    .section-panel p {
      color: #97b1b7;
      line-height: 1.8;
      margin-bottom: 22px;
    }
    .section-panel .section-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }
    .form-section {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(31, 242, 210, 0.08);
      border-radius: 20px;
      padding: 24px;
      margin-bottom: 20px;
    }
    .form-section-title {
      font-size: 1.1rem;
      font-weight: 700;
      color: #a9fff0;
      margin-bottom: 20px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .form-group { margin-bottom: 18px; }
    label {
      display: block;
      margin-bottom: 8px;
      color: #c7d9df;
      font-size: 0.95rem;
      letter-spacing: 0.04em;
      font-weight: 600;
    }
    input, select, textarea {
      width: 100%;
      padding: 14px 16px;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(8, 12, 22, 0.95);
      color: #ebf8fa;
      font-size: 1rem;
    }
    textarea { min-height: 110px; resize: vertical; }
    .hint {
      color: #7ea8af;
      font-size: 0.92rem;
    }
    .buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 20px;
    }
    .buttons button { min-width: 160px; }
    .message { margin-bottom: 20px; }
    @media (max-width: 1080px) {
      .panel-shell { grid-template-columns: 1fr; }
      .sidebar { position: relative; top: 0; }
      .stats-grid, .section-panel .section-grid { grid-template-columns: 1fr; }
      .hero-top { flex-direction: column; }
      .hero-actions { justify-content: stretch; }
    }
    @media (max-width: 720px) {
      body { padding: 16px; }
      .sidebar { padding: 24px; }
      .hero-panel, .section-panel { padding: 24px; }
    }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function renderLogin(message = "", selectedRole = "admin") {
  const role = ["guest", "admin", "owner"].includes(selectedRole) ? selectedRole : "admin";
  return page("ETC Bot Login", `<main>
    <div class="panel-shell">
      <aside class="sidebar">
        <div class="brand-short">ETC Bot Panel</div>
        <div class="brand-title">StartIT Login</div>
        <div class="brand-copy">Sign in to manage the EU Tuning Crew bot, or continue as a guest to view the public website.</div>
      </aside>
      <section class="panel-main">
        <div class="hero-panel">
          <div class="hero-copy">
            <h1>Welcome back</h1>
            <p>Use Admin or Owner access to open the control center and configure bot replies, modmail, tickets, and features.</p>
          </div>
          ${message ? `<div class="message error">${escapeHtml(message)}</div>` : ""}
          <form method="post" action="/api/panel?panelPath=/login">
            <div class="form-section">
              <div class="form-group">
                <label for="role">Login Mode</label>
                <select id="role" name="role">
                  <option value="admin"${role === "admin" ? " selected" : ""}>Admin Access</option>
                  <option value="owner"${role === "owner" ? " selected" : ""}>Owner Access</option>
                  <option value="guest"${role === "guest" ? " selected" : ""}>Guest Mode</option>
                </select>
              </div>
              <div class="form-group">
                <label for="password">Access Code</label>
                <input id="password" name="password" type="password" autocomplete="current-password" placeholder="Enter your access code" ${role === "guest" ? "" : "required"}>
                <div class="hint">${role === "owner" ? "Owner access allows full panel control." : role === "admin" ? "Admin access allows bot settings and features." : "Guest mode opens the public site view."}</div>
              </div>
              <div class="buttons">
                <button type="submit">${role === "guest" ? "Continue as guest" : `Login as ${role}`}</button>
                <a class="button ghost" href="/?fromPanel=1">Back to site</a>
              </div>
            </div>
          </form>
        </div>
      </section>
    </div>
  </main>`);
}

function renderAdmin(role, message = "", state = { config: fallbackConfig, stats: {} }) {
  const config = { ...fallbackConfig, ...(state.config || {}) };
  const stats = state.stats || {};
  const isOwnerRole = role === "owner";

  return page("ETC Bot Panel", `<main>
    <div class="panel-shell">
      <aside class="sidebar">
        <div class="brand-short">ETC Bot Panel</div>
        <div class="brand-title">StartIT Style Panel</div>
        <div class="brand-copy">A clean, menu-driven view for bot analytics, settings, modmail, and advanced controls.</div>

        <nav class="nav-list">
          <a class="nav-item active" href="#overview">Overview<span>01</span></a>
          <a class="nav-item" href="#bot-settings">Bot Settings<span>02</span></a>
          <a class="nav-item" href="#modmail">Modmail<span>03</span></a>
          <a class="nav-item" href="#features">Features<span>04</span></a>
          ${isOwnerRole ? `<a class="nav-item" href="#access">Access<span>05</span></a>` : ""}
          <a class="nav-item" href="/?fromPanel=1">Website<span>WEB</span></a>
        </nav>

        <div class="logout-row">
          <form method="post" action="/api/panel?panelPath=/logout" style="width:100%;">
            <button type="submit">Log out</button>
          </form>
        </div>
      </aside>

      <section class="panel-main">
        <div class="hero-panel">
          <div class="hero-top">
            <div class="hero-copy">
              <h1>ETC Bot Control Panel</h1>
              <p>Manage bot behavior and server integrations from one place. If the bot status shows an error, check the BOT_API_URL or local panel connection.</p>
            </div>
            <div class="status-pill"><span class="status-dot"></span> ${escapeHtml(stats.discordMode || "Waiting")}</div>
          </div>
          ${message ? `<div class="message success">✓ ${escapeHtml(message)}</div>` : ""}
          ${state.error ? `<div class="message error">✗ ${escapeHtml(state.error)}</div>` : ""}
          <div class="hero-actions">
            <a href="#bot-settings"><button type="button">Open Bot Settings</button></a>
            <a href="#modmail"><button class="outline" type="button">Open Modmail</button></a>
            <a href="#features"><button class="ghost" type="button">Open Features</button></a>
          </div>

          <div class="stats-grid">
            <div class="stat-card"><strong>Bot Tag</strong><div class="stat-value">${escapeHtml(stats.botTag || "Unknown")}</div></div>
            <div class="stat-card"><strong>Guilds</strong><div class="stat-value">${escapeHtml(stats.guilds ?? 0)}</div></div>
            <div class="stat-card"><strong>Open Modmail</strong><div class="stat-value">${escapeHtml(stats.openTickets ?? 0)}</div></div>
            <div class="stat-card"><strong>Mode</strong><div class="stat-value">${escapeHtml(stats.discordMode || "Unknown")}</div></div>
          </div>
        </div>

        <section id="overview" class="section-panel">
          <h2>Overview</h2>
          <p>Use this panel to view bot connectivity and push settings directly to the Wispbyte bot API. Local development automatically tries localhost:10001 when no BOT_API_URL is configured.</p>
        </section>

        <section id="bot-settings" class="section-panel">
          <h2>Bot Settings</h2>
          <form method="post" action="/api/panel?panelPath=/admin/save-bot">
            <div class="form-section">
              <div class="form-section-title">Basic Bot Configuration</div>
              <div class="form-group">
                <label for="activityText">Bot Activity Text</label>
                <input id="activityText" name="activityText" value="${escapeHtml(config.activityText)}" required placeholder="What the bot shows as activity">
              </div>
              <div class="form-group">
                <label for="statusReply">/status Command Reply</label>
                <input id="statusReply" name="statusReply" value="${escapeHtml(config.statusReply)}" required placeholder="Response to /status command">
              </div>
              <div class="form-group">
                <label for="pingReply">/ping Command Reply</label>
                <input id="pingReply" name="pingReply" value="${escapeHtml(config.pingReply)}" required placeholder="Response to /ping command">
              </div>
              <div class="form-group">
                <label for="noPingStaffRoleId">No-Ping Staff Role ID</label>
                <input id="noPingStaffRoleId" name="noPingStaffRoleId" value="${escapeHtml(config.noPingStaffRoleId)}" placeholder="Optional role ID">
              </div>
              <div class="form-group">
                <label for="rulesChannelId">Rules Channel ID</label>
                <input id="rulesChannelId" name="rulesChannelId" value="${escapeHtml(config.rulesChannelId)}" placeholder="Optional rules channel ID">
              </div>
              <div class="buttons"><button type="submit">Save Bot Settings</button></div>
            </div>
          </form>
        </section>

        <section id="modmail" class="section-panel">
          <h2>Modmail</h2>
          <form method="post" action="/api/panel?panelPath=/admin/save-modmail">
            <div class="form-section">
              <div class="form-section-title">Modmail Configuration</div>
              <div class="form-group">
                <label for="modmailGuildId">Modmail Guild ID</label>
                <input id="modmailGuildId" name="modmailGuildId" value="${escapeHtml(config.modmailGuildId)}" placeholder="Guild ID for modmail">
              </div>
              <div class="form-group">
                <label for="modmailCategoryId">Modmail Category ID</label>
                <input id="modmailCategoryId" name="modmailCategoryId" value="${escapeHtml(config.modmailCategoryId)}" placeholder="Optional channel category ID">
              </div>
              <div class="form-group">
                <label for="modmailPanelChannelId">Modmail Panel Channel ID</label>
                <input id="modmailPanelChannelId" name="modmailPanelChannelId" value="${escapeHtml(config.modmailPanelChannelId)}" placeholder="Optional panel channel ID">
              </div>
              <div class="form-group">
                <label for="modmailIntroText">Modmail Intro Text</label>
                <textarea id="modmailIntroText" name="modmailIntroText" placeholder="Intro text for modmail">${escapeHtml(config.modmailIntroText)}</textarea>
              </div>
              <div class="buttons"><button type="submit">Save Modmail Settings</button></div>
            </div>
          </form>
        </section>

        <section id="features" class="section-panel">
          <h2>Advanced Features</h2>
          <form method="post" action="/api/panel?panelPath=/admin/save-features">
            <div class="form-section">
              <div class="form-section-title">Feature Toggles</div>
              <div class="form-group">
                <label><input type="checkbox" name="ticketSystemEnabled"${config.ticketSystemEnabled ? " checked" : ""}> Ticket System Enabled</label>
              </div>
              <div class="form-group">
                <label><input type="checkbox" name="autoModEnabled"${config.autoModEnabled ? " checked" : ""}> Auto-Moderation Enabled</label>
              </div>
              <div class="form-group">
                <label><input type="checkbox" name="memberTrackingEnabled"${config.memberTrackingEnabled ? " checked" : ""}> Member Tracking Enabled</label>
              </div>
              <div class="form-group">
                <label><input type="checkbox" name="levelingEnabled"${config.levelingEnabled ? " checked" : ""}> Leveling Enabled</label>
              </div>
              <div class="form-group">
                <label><input type="checkbox" name="messageLoggingEnabled"${config.messageLoggingEnabled ? " checked" : ""}> Message Logging Enabled</label>
              </div>
              <div class="form-group">
                <label><input type="checkbox" name="reactionRolesEnabled"${config.reactionRolesEnabled ? " checked" : ""}> Reaction Roles Enabled</label>
              </div>
              <div class="form-group">
                <label><input type="checkbox" name="votingEnabled"${config.votingEnabled ? " checked" : ""}> Voting Enabled</label>
              </div>
              <div class="buttons"><button type="submit">Save Feature Settings</button></div>
            </div>
          </form>
        </section>

        ${isOwnerRole ? `<section id="access" class="section-panel"><h2>Access</h2><p>Owner-only controls for panel access and security tuning are managed through environment variables. Update Vercel variables and redeploy when needed.</p></section>` : ""}
      </section>
    </div>
  </main>`);
}

function getPanelPath(req) {
  const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  return url.searchParams.get("panelPath") || url.pathname;
}

async function callBotApi(path, init = {}) {
  if (!botApiUrl) {
    throw new Error("BOT_API_URL is not configured.");
  }

  const response = await fetch(new URL(path, botApiUrl), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(botApiSecret ? { Authorization: `Bearer ${botApiSecret}` } : {}),
      ...(init.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Bot API returned HTTP ${response.status}`);
  }
  return payload;
}

async function loadPanelState() {
  const state = await callBotApi("/api/panel-state").catch((error) => ({
    error: error.message
  }));

  return {
    config: { ...fallbackConfig, ...(state?.config || {}) },
    stats: {
      botTag: "Wispbyte bot",
      discordMode: botApiUrl ? "Connected to Wispbyte API" : "BOT_API_URL missing",
      guilds: 0,
      openTickets: 0,
      activeWarns: 0,
      modmailReady: "Unknown",
      ...(state?.stats || {})
    },
    error: state?.error || ""
  };
}

async function saveRemoteConfig(configPatch) {
  if (!botApiUrl) {
    throw new Error("BOT_API_URL is not set in Vercel.");
  }

  await callBotApi("/api/panel-config", {
    method: "POST",
    body: JSON.stringify({ config: configPatch })
  });
}

export default async function handler(req, res) {
  try {
    const path = getPanelPath(req);

    if (req.method === "GET" && path === "/login") {
      sendHtml(res, 200, renderLogin("", "admin"));
      return;
    }

    if (req.method === "POST" && path === "/login") {
      const form = await parseFormBody(req);
      const role = form.role === "owner" ? "owner" : (form.role === "admin" ? "admin" : "guest");
      if (role === "guest") {
        redirect(res, "/?fromPanel=1");
        return;
      }

      const expectedPassword = role === "owner" ? ownerPassword : adminPassword;
      if (!safeCompare(form.password, expectedPassword)) {
        sendHtml(res, 401, renderLogin(`Wrong ${role} code.`, role));
        return;
      }

      redirect(res, "/api/panel?panelPath=/admin", {
        "Set-Cookie": `etc_panel_session=${encodeURIComponent(createSession(role))}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`
      });
      return;
    }

    if (req.method === "POST" && path === "/logout") {
      redirect(res, "/api/panel?panelPath=/login", {
        "Set-Cookie": "etc_panel_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
      });
      return;
    }

    if (path === "/site") {
      redirect(res, "/?fromPanel=1");
      return;
    }

    if (path === "/admin" || path.startsWith("/admin/")) {
      const session = readSession(req);
      if (!session) {
        redirect(res, "/api/panel?panelPath=/login");
        return;
      }

      if (req.method === "POST" && path === "/admin/save-bot") {
        const form = await parseFormBody(req);
        await saveRemoteConfig({
          activityText: form.activityText?.trim() || fallbackConfig.activityText,
          statusReply: form.statusReply?.trim() || fallbackConfig.statusReply,
          pingReply: form.pingReply?.trim() || fallbackConfig.pingReply,
          noPingStaffRoleId: form.noPingStaffRoleId?.trim() || "",
          rulesChannelId: form.rulesChannelId?.trim() || ""
        });
        sendHtml(res, 200, renderAdmin(session.role, "Bot settings saved to the Wispbyte bot.", await loadPanelState()));
        return;
      }

      if (req.method === "POST" && path === "/admin/save-modmail") {
        const form = await parseFormBody(req);
        await saveRemoteConfig({
          modmailGuildId: form.modmailGuildId?.trim() || "",
          modmailCategoryId: form.modmailCategoryId?.trim() || "",
          modmailPanelChannelId: form.modmailPanelChannelId?.trim() || "",
          modmailIntroText: form.modmailIntroText?.trim() || fallbackConfig.modmailIntroText,
          modmailOpenedText: form.modmailOpenedText?.trim() || fallbackConfig.modmailOpenedText,
          modmailClosedText: form.modmailClosedText?.trim() || fallbackConfig.modmailClosedText
        });
        sendHtml(res, 200, renderAdmin(session.role, "Modmail settings saved to the Wispbyte bot.", await loadPanelState()));
        return;
      }

      if (req.method === "POST" && path === "/admin/save-features") {
        const form = await parseFormBody(req);
        await saveRemoteConfig({
          // Ticket System
          ticketSystemEnabled: form.ticketSystemEnabled === "on",
          ticketCategoryId: form.ticketCategoryId?.trim() || "",
          ticketPanelChannelId: form.ticketPanelChannelId?.trim() || "",
          ticketIntroText: form.ticketIntroText?.trim() || fallbackConfig.ticketIntroText,
          // Auto-Moderation
          autoModEnabled: form.autoModEnabled === "on",
          spamFilterEnabled: form.spamFilterEnabled === "on",
          spamThreshold: parseInt(form.spamThreshold) || 5,
          capsFilterEnabled: form.capsFilterEnabled === "on",
          profanityFilterEnabled: form.profanityFilterEnabled === "on",
          inviteFilterEnabled: form.inviteFilterEnabled === "on",
          // Member Tracking
          memberTrackingEnabled: form.memberTrackingEnabled === "on",
          memberLogChannelId: form.memberLogChannelId?.trim() || "",
          // Leveling System
          levelingEnabled: form.levelingEnabled === "on",
          levelAnnouncementChannelId: form.levelAnnouncementChannelId?.trim() || "",
          // Message Logging
          messageLoggingEnabled: form.messageLoggingEnabled === "on",
          messageLogChannelId: form.messageLogChannelId?.trim() || "",
          // Reaction Roles
          reactionRolesEnabled: form.reactionRolesEnabled === "on",
          // Voting/Polls
          votingEnabled: form.votingEnabled === "on"
        });
        sendHtml(res, 200, renderAdmin(session.role, "Advanced features saved successfully!", await loadPanelState()));
        return;
      }

      if (req.method === "POST" && path === "/admin/save-access") {
        sendHtml(res, 403, renderAdmin(session.role, "Change panel passwords in Vercel Environment Variables, then redeploy.", await loadPanelState()));
        return;
      }

      sendHtml(res, 200, renderAdmin(session.role, "", await loadPanelState()));
      return;
    }

    sendHtml(res, 404, page("Not Found", "<main><h1>404</h1><p>Panel route not found.</p></main>"));
  } catch (error) {
    sendHtml(res, 500, page("Panel Error", `<main><h1>Panel Error</h1><p>${escapeHtml(error.message || "Unknown error")}</p></main>`));
  }
}
