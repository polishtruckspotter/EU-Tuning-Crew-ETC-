import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const panelPassword = process.env.PANEL_PASSWORD || "etc-panel";
const ownerPassword = process.env.OWNER_PASSWORD || panelPassword;
const adminPassword = process.env.ADMIN_PASSWORD || "etc-admin";
const cookieSecret = process.env.COOKIE_SECRET || ownerPassword || panelPassword;
const maxAgeSeconds = 60 * 60 * 12;
const botApiUrl = process.env.BOT_API_URL || process.env.WISPBYTE_BOT_API_URL || "";
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
    body { 
      background: linear-gradient(135deg, #0a0a0f 0%, #121219 50%, #0f0f17 100%); 
      color: #f7f1e8; 
      font-family: 'Manrope', sans-serif; 
      min-height: 100vh; 
      padding: 20px;
    }
    main { 
      max-width: 1200px; 
      margin: 0 auto;
      background: rgba(20, 21, 30, 0.85);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(31, 242, 210, 0.15);
      border-radius: 16px;
      padding: 40px;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(31, 242, 210, 0.1);
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 2px solid rgba(31, 242, 210, 0.2);
    }
    h1 { 
      font-size: 2.5rem; 
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      color: #1ff2d2;
      font-family: 'Rajdhani', sans-serif;
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .role-badge {
      background: rgba(31, 242, 210, 0.2);
      border: 1px solid rgba(31, 242, 210, 0.5);
      color: #1ff2d2;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 0.9rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .message { 
      padding: 16px 20px;
      border-radius: 12px;
      margin-bottom: 20px;
      font-weight: 500;
    }
    .message.success {
      background: rgba(88, 255, 135, 0.1);
      border-left: 4px solid #58ff87;
      color: #58ff87;
    }
    .message.error {
      background: rgba(255, 77, 93, 0.1);
      border-left: 4px solid #ff4d5d;
      color: #ff4d5d;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .stat-card {
      background: rgba(31, 242, 210, 0.05);
      border: 1px solid rgba(31, 242, 210, 0.2);
      border-radius: 12px;
      padding: 20px;
      text-align: center;
    }
    .stat-value {
      font-size: 1.8rem;
      font-weight: 700;
      color: #1ff2d2;
      margin-bottom: 6px;
    }
    .stat-label {
      font-size: 0.9rem;
      color: #a8a8a8;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .form-section {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(31, 242, 210, 0.1);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .form-section-title {
      font-size: 1.3rem;
      font-weight: 700;
      color: #1ff2d2;
      margin-bottom: 20px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .form-group {
      margin-bottom: 20px;
    }
    label { 
      display: block; 
      margin-bottom: 8px; 
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 0.9rem;
      color: #e8e8e8;
    }
    input, select, textarea { 
      width: 100%;
      padding: 12px 16px;
      border: 1px solid rgba(31, 242, 210, 0.2);
      border-radius: 8px;
      background: rgba(25, 26, 35, 0.8);
      color: #f7f1e8;
      font-size: 1rem;
      font-family: 'Manrope', sans-serif;
      transition: all 0.3s ease;
    }
    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: #1ff2d2;
      background: rgba(31, 242, 210, 0.05);
      box-shadow: 0 0 0 3px rgba(31, 242, 210, 0.1);
    }
    textarea {
      min-height: 100px;
      resize: vertical;
    }
    button, a.button { 
      display: inline-block;
      padding: 12px 28px;
      border: 0;
      border-radius: 8px;
      background: linear-gradient(135deg, #1ff2d2, #00d9b3);
      color: #06100f;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      text-decoration: none;
      cursor: pointer;
      font-size: 0.95rem;
      transition: all 0.3s ease;
      font-family: 'Rajdhani', sans-serif;
    }
    button:hover, a.button:hover { 
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(31, 242, 210, 0.3);
    }
    button:active, a.button:active {
      transform: translateY(0);
    }
    .button.ghost { 
      background: transparent;
      color: #f7f1e8;
      border: 1px solid rgba(31, 242, 210, 0.3);
    }
    .button.ghost:hover {
      background: rgba(31, 242, 210, 0.1);
      border-color: #1ff2d2;
    }
    .row { 
      display: flex; 
      flex-wrap: wrap; 
      gap: 16px; 
      align-items: center;
      margin-top: 24px;
    }
    @media (max-width: 768px) {
      main { padding: 24px; }
      h1 { font-size: 1.8rem; }
      header { flex-direction: column; align-items: flex-start; gap: 12px; }
      .header-right { width: 100%; justify-content: space-between; }
      .stats-grid { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function renderLogin(message = "", selectedRole = "admin") {
  const role = ["guest", "admin", "owner"].includes(selectedRole) ? selectedRole : "admin";
  return page("ETC Bot Login", `<main>
    <header>
      <div>
        <h1>🔐 ETC Login</h1>
        <p style="margin-top: 8px; color: #a8a8a8;">Access the EU Tuning Crew bot control panel</p>
      </div>
    </header>
    ${message ? `<div class="message error">${escapeHtml(message)}</div>` : ""}
    <form method="post" action="/api/panel?panelPath=/login">
      <div class="form-section">
        <div class="form-group">
          <label for="role">Select Role</label>
          <select id="role" name="role">
            <option value="admin"${role === "admin" ? " selected" : ""}>Admin Access</option>
            <option value="owner"${role === "owner" ? " selected" : ""}>Owner Access</option>
          </select>
        </div>
        <div class="form-group">
          <label for="password">Access Code</label>
          <input id="password" name="password" type="password" autocomplete="current-password" placeholder="Enter your access code" required>
        </div>
        <div class="row">
          <button type="submit">Login to Panel</button>
          <a class="button ghost" href="/?fromPanel=1">Back to Site</a>
        </div>
      </div>
    </form>
  </main>`);
}

function renderAdmin(role, message = "", state = { config: fallbackConfig, stats: {} }) {
  const config = { ...fallbackConfig, ...(state.config || {}) };
  const stats = state.stats || {};
  return page("ETC Bot Panel", `<main>
    <header>
      <div>
        <h1>⚙️ Bot Control Panel</h1>
        <p style="margin-top: 8px; color: #a8a8a8;">EU Tuning Crew Discord Bot Management</p>
      </div>
      <div class="header-right">
        <div class="role-badge">👤 ${escapeHtml(role).toUpperCase()}</div>
        <form method="post" action="/api/panel?panelPath=/logout" style="margin: 0;">
          <button class="ghost" type="submit" style="padding: 8px 16px; font-size: 0.85rem;">Logout</button>
        </form>
      </div>
    </header>

    ${message ? `<div class="message success">✓ ${escapeHtml(message)}</div>` : ""}
    ${state.error ? `<div class="message error">✗ Wispbyte API: ${escapeHtml(state.error)}</div>` : ""}

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${escapeHtml(stats.botTag || "Unknown")}</div>
        <div class="stat-label">Bot Status</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${escapeHtml(stats.guilds ?? 0)}</div>
        <div class="stat-label">Servers</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${escapeHtml(stats.openTickets ?? 0)}</div>
        <div class="stat-label">Open Modmail</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${escapeHtml(stats.discordMode || "Unknown")}</div>
        <div class="stat-label">Mode</div>
      </div>
    </div>

    <form method="post" action="/api/panel?panelPath=/admin/save-bot">
      <div class="form-section">
        <div class="form-section-title">🎮 Bot Settings</div>
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
          <input id="pingReply" name="pingReply" value="${escapeHtml(config.pingReply)}" required placeholder="Use {ping} for latency value">
        </div>
        <div class="form-group">
          <label for="noPingStaffRoleId">Staff Role ID (No-Ping Protection)</label>
          <input id="noPingStaffRoleId" name="noPingStaffRoleId" value="${escapeHtml(config.noPingStaffRoleId)}" placeholder="Discord role ID to protect">
        </div>
        <div class="form-group">
          <label for="rulesChannelId">Rules Channel ID</label>
          <input id="rulesChannelId" name="rulesChannelId" value="${escapeHtml(config.rulesChannelId)}" placeholder="Channel ID for /rules and =rules">
        </div>
        <button type="submit">💾 Save Bot Settings</button>
      </div>
    </form>

    <form method="post" action="/api/panel?panelPath=/admin/save-modmail">
      <div class="form-section">
        <div class="form-section-title">📬 Modmail Configuration</div>
        <div class="form-group">
          <label for="modmailGuildId">Modmail Server ID</label>
          <input id="modmailGuildId" name="modmailGuildId" value="${escapeHtml(config.modmailGuildId)}" placeholder="Discord server ID for modmail channels">
        </div>
        <div class="form-group">
          <label for="modmailCategoryId">Modmail Category ID</label>
          <input id="modmailCategoryId" name="modmailCategoryId" value="${escapeHtml(config.modmailCategoryId)}" placeholder="Category to create modmail channels in">
        </div>
        <div class="form-group">
          <label for="modmailPanelChannelId">Modmail Panel Channel ID</label>
          <input id="modmailPanelChannelId" name="modmailPanelChannelId" value="${escapeHtml(config.modmailPanelChannelId)}" placeholder="Channel where modmail button appears">
        </div>
        <div class="form-group">
          <label for="modmailIntroText">Modmail Intro Text</label>
          <textarea id="modmailIntroText" name="modmailIntroText" placeholder="Welcome message for modmail">${escapeHtml(config.modmailIntroText)}</textarea>
        </div>
        <div class="form-group">
          <label for="modmailOpenedText">Modmail Opened Reply</label>
          <textarea id="modmailOpenedText" name="modmailOpenedText" placeholder="Message when modmail opens">${escapeHtml(config.modmailOpenedText)}</textarea>
        </div>
        <div class="form-group">
          <label for="modmailClosedText">Modmail Closed Reply</label>
          <textarea id="modmailClosedText" name="modmailClosedText" placeholder="Message when modmail closes">${escapeHtml(config.modmailClosedText)}</textarea>
        </div>
        <button type="submit">💾 Save Modmail Settings</button>
      </div>
    </form>

    <form method="post" action="/api/panel?panelPath=/admin/save-features">
      <div class="form-section">
        <div class="form-section-title">🎫 Ticket System</div>
        <div class="form-group">
          <label>
            <input type="checkbox" name="ticketSystemEnabled" ${config.ticketSystemEnabled ? "checked" : ""} style="width: auto; margin-right: 10px;">
            Enable Ticket System
          </label>
        </div>
        <div class="form-group">
          <label for="ticketCategoryId">Ticket Category ID</label>
          <input id="ticketCategoryId" name="ticketCategoryId" value="${escapeHtml(config.ticketCategoryId)}" placeholder="Category where ticket channels are created">
        </div>
        <div class="form-group">
          <label for="ticketPanelChannelId">Ticket Panel Channel ID</label>
          <input id="ticketPanelChannelId" name="ticketPanelChannelId" value="${escapeHtml(config.ticketPanelChannelId)}" placeholder="Channel where ticket button appears">
        </div>
        <div class="form-group">
          <label for="ticketIntroText">Ticket Panel Text</label>
          <textarea id="ticketIntroText" name="ticketIntroText" placeholder="Text shown above ticket button">${escapeHtml(config.ticketIntroText)}</textarea>
        </div>
      </div>
    </form>

    <form method="post" action="/api/panel?panelPath=/admin/save-features">
      <div class="form-section">
        <div class="form-section-title">🛡️ Auto-Moderation Settings</div>
        <div class="form-group">
          <label>
            <input type="checkbox" name="autoModEnabled" ${config.autoModEnabled ? "checked" : ""} style="width: auto; margin-right: 10px;">
            Enable Auto-Moderation
          </label>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" name="spamFilterEnabled" ${config.spamFilterEnabled ? "checked" : ""} style="width: auto; margin-right: 10px;">
            Enable Spam Filter
          </label>
        </div>
        <div class="form-group">
          <label for="spamThreshold">Spam Threshold (messages per 5s)</label>
          <input id="spamThreshold" name="spamThreshold" type="number" value="${escapeHtml(config.spamThreshold)}" min="1" max="20">
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" name="capsFilterEnabled" ${config.capsFilterEnabled ? "checked" : ""} style="width: auto; margin-right: 10px;">
            Enable Caps Filter (auto-delete excessive caps)
          </label>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" name="profanityFilterEnabled" ${config.profanityFilterEnabled ? "checked" : ""} style="width: auto; margin-right: 10px;">
            Enable Profanity Filter
          </label>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" name="inviteFilterEnabled" ${config.inviteFilterEnabled ? "checked" : ""} style="width: auto; margin-right: 10px;">
            Enable Invite Filter
          </label>
        </div>
        <button type="submit">💾 Save Auto-Moderation</button>
      </div>
    </form>

    <form method="post" action="/api/panel?panelPath=/admin/save-features">
      <div class="form-section">
        <div class="form-section-title">📊 Advanced Features</div>
        
        <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid rgba(31, 242, 210, 0.1);">
          <h3 style="color: #1ff2d2; margin: 0 0 12px; font-size: 1.05rem;">👥 Member Tracking</h3>
          <div class="form-group">
            <label>
              <input type="checkbox" name="memberTrackingEnabled" ${config.memberTrackingEnabled ? "checked" : ""} style="width: auto; margin-right: 10px;">
              Enable Member Tracking (joins/leaves)
            </label>
          </div>
          <div class="form-group">
            <label for="memberLogChannelId">Member Log Channel ID</label>
            <input id="memberLogChannelId" name="memberLogChannelId" value="${escapeHtml(config.memberLogChannelId)}" placeholder="Channel for member join/leave logs">
          </div>
        </div>

        <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid rgba(31, 242, 210, 0.1);">
          <h3 style="color: #1ff2d2; margin: 0 0 12px; font-size: 1.05rem;">⭐ Leveling System</h3>
          <div class="form-group">
            <label>
              <input type="checkbox" name="levelingEnabled" ${config.levelingEnabled ? "checked" : ""} style="width: auto; margin-right: 10px;">
              Enable Leveling System
            </label>
          </div>
          <div class="form-group">
            <label for="levelAnnouncementChannelId">Level Up Announcement Channel ID</label>
            <input id="levelAnnouncementChannelId" name="levelAnnouncementChannelId" value="${escapeHtml(config.levelAnnouncementChannelId)}" placeholder="Channel for level up announcements">
          </div>
        </div>

        <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid rgba(31, 242, 210, 0.1);">
          <h3 style="color: #1ff2d2; margin: 0 0 12px; font-size: 1.05rem;">📝 Message Logging</h3>
          <div class="form-group">
            <label>
              <input type="checkbox" name="messageLoggingEnabled" ${config.messageLoggingEnabled ? "checked" : ""} style="width: auto; margin-right: 10px;">
              Enable Message Logging (edited/deleted messages)
            </label>
          </div>
          <div class="form-group">
            <label for="messageLogChannelId">Message Log Channel ID</label>
            <input id="messageLogChannelId" name="messageLogChannelId" value="${escapeHtml(config.messageLogChannelId)}" placeholder="Channel for message logs">
          </div>
        </div>

        <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid rgba(31, 242, 210, 0.1);">
          <h3 style="color: #1ff2d2; margin: 0 0 12px; font-size: 1.05rem;">🎯 Reaction Roles</h3>
          <div class="form-group">
            <label>
              <input type="checkbox" name="reactionRolesEnabled" ${config.reactionRolesEnabled ? "checked" : ""} style="width: auto; margin-right: 10px;">
              Enable Reaction Roles (auto-assign roles via emoji)
            </label>
          </div>
        </div>

        <div style="margin-bottom: 0;">
          <h3 style="color: #1ff2d2; margin: 0 0 12px; font-size: 1.05rem;">🗳️ Voting/Polls</h3>
          <div class="form-group">
            <label>
              <input type="checkbox" name="votingEnabled" ${config.votingEnabled ? "checked" : ""} style="width: auto; margin-right: 10px;">
              Enable Voting System
            </label>
          </div>
        </div>

        <button type="submit" style="margin-top: 24px;">💾 Save Advanced Features</button>
      </div>
    </form>

    ${role === "owner" ? `<form method="post" action="/api/panel?panelPath=/admin/save-access">
      <div class="form-section" style="border-color: rgba(255, 77, 93, 0.2);">
        <div class="form-section-title" style="color: #ff4d5d;">🔐 Access Control (Owner Only)</div>
        <p style="color: #a8a8a8; margin-bottom: 20px;">⚠️ Change passwords in Vercel Environment Variables, then redeploy the bot.</p>
        <div class="message error">🔒 Passwords are managed through Vercel for security. This form is for reference only.</div>
        <button type="submit" disabled style="opacity: 0.5; cursor: not-allowed;">Passwords are managed in Vercel</button>
      </div>
    </form>` : ""}

    <div class="row" style="margin-top: 32px; border-top: 1px solid rgba(31, 242, 210, 0.1); padding-top: 24px;">
      <a class="button" href="/?fromPanel=1">🌐 Back to Website</a>
      <a class="button ghost" href="https://discord.com/developers/applications" target="_blank">Discord Developer Portal</a>
    </div>
  </main>`);
}

function getPanelPath(req) {
  const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  return url.searchParams.get("panelPath") || url.pathname;
}

async function callBotApi(path, init = {}) {
  if (!botApiUrl) return null;

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
