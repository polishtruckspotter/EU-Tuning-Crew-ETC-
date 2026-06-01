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
  modmailGuildId: "",
  modmailCategoryId: "",
  modmailPanelChannelId: "",
  modmailIntroText: "Welcome to ETC modmail. Press Open Modmail to start a modmail, send your message, and use ./close modmail when you are done.",
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
  pvEmbedImageUrl: ""
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
  <style>
    body { margin: 0; min-height: 100vh; background: #07080d; color: #f7f1e8; font-family: Arial, sans-serif; display: grid; place-items: center; padding: 24px; }
    main { width: min(920px, 100%); border: 1px solid rgba(45, 232, 211, .35); border-radius: 8px; background: #101118; padding: 28px; box-shadow: 0 20px 80px rgba(0, 0, 0, .35); }
    h1 { margin: 0 0 12px; font-size: clamp(2rem, 7vw, 5rem); line-height: .95; text-transform: uppercase; }
    p { color: #c9c6c0; font-size: 1.05rem; }
    label { display: block; margin: 18px 0 8px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
    input, select { width: 100%; box-sizing: border-box; border: 1px solid #2a2b35; border-radius: 8px; padding: 16px; color: #fff; background: #15161d; font-size: 1rem; }
    button, a.button { display: inline-block; margin-top: 18px; border: 0; border-radius: 8px; background: #2df0d3; color: #06100f; padding: 14px 22px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; text-decoration: none; cursor: pointer; }
    .ghost { background: transparent; color: #f7f1e8; border: 1px solid #2a2b35; }
    .row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    .error { color: #ff6b6b; font-weight: 700; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function renderLogin(message = "", selectedRole = "admin") {
  const role = ["guest", "admin", "owner"].includes(selectedRole) ? selectedRole : "admin";
  return page("ETC Bot Login", `<main>
    <h1>ETC Login</h1>
    <p>Login as owner or admin to open the hosted bot panel.</p>
    ${message ? `<p class="error">${escapeHtml(message)}</p>` : ""}
    <form method="post" action="/api/panel?panelPath=/login">
      <label for="role">Role</label>
      <select id="role" name="role">
        <option value="admin"${role === "admin" ? " selected" : ""}>Admin</option>
        <option value="owner"${role === "owner" ? " selected" : ""}>Owner</option>
        <option value="guest"${role === "guest" ? " selected" : ""}>Guest</option>
      </select>
      <label for="password">Code</label>
      <input id="password" name="password" type="password" autocomplete="current-password">
      <div class="row">
        <button type="submit">Login</button>
        <a class="button ghost" href="/?fromPanel=1">Back to site</a>
      </div>
    </form>
  </main>`);
}

function renderAdmin(role, message = "", state = { config: fallbackConfig, stats: {} }) {
  const config = { ...fallbackConfig, ...(state.config || {}) };
  const stats = state.stats || {};
  return page("ETC Bot Panel", `<main>
    <h1>Bot Panel</h1>
    ${message ? `<p>${escapeHtml(message)}</p>` : ""}
    ${state.error ? `<p class="error">Wispbyte API: ${escapeHtml(state.error)}</p>` : ""}
    <p>You are logged in as <strong>${escapeHtml(role)}</strong>.</p>
    <p>Panel is hosted on Vercel. Bot runtime is controlled through the Wispbyte bot API.</p>
    <p><strong>Bot:</strong> ${escapeHtml(stats.botTag || "Unknown")} | <strong>Mode:</strong> ${escapeHtml(stats.discordMode || "Unknown")} | <strong>Guilds:</strong> ${escapeHtml(stats.guilds ?? 0)} | <strong>Open modmail:</strong> ${escapeHtml(stats.openTickets ?? 0)}</p>
    <form method="post" action="/api/panel?panelPath=/admin/save-bot">
      <label for="activityText">Bot activity text</label>
      <input id="activityText" name="activityText" value="${escapeHtml(config.activityText)}" required>
      <label for="statusReply">/status reply</label>
      <input id="statusReply" name="statusReply" value="${escapeHtml(config.statusReply)}" required>
      <label for="pingReply">/ping reply</label>
      <input id="pingReply" name="pingReply" value="${escapeHtml(config.pingReply)}" required>
      <label for="noPingStaffRoleId">Staff role ID for no-ping warns</label>
      <input id="noPingStaffRoleId" name="noPingStaffRoleId" value="${escapeHtml(config.noPingStaffRoleId)}">
      <button type="submit">Save bot settings</button>
    </form>
    <form method="post" action="/api/panel?panelPath=/admin/save-modmail">
      <label for="modmailGuildId">Modmail guild ID</label>
      <input id="modmailGuildId" name="modmailGuildId" value="${escapeHtml(config.modmailGuildId)}">
      <label for="modmailCategoryId">Modmail category ID</label>
      <input id="modmailCategoryId" name="modmailCategoryId" value="${escapeHtml(config.modmailCategoryId)}">
      <label for="modmailPanelChannelId">Modmail panel channel ID</label>
      <input id="modmailPanelChannelId" name="modmailPanelChannelId" value="${escapeHtml(config.modmailPanelChannelId)}">
      <label for="modmailIntroText">Modmail intro text</label>
      <input id="modmailIntroText" name="modmailIntroText" value="${escapeHtml(config.modmailIntroText)}">
      <label for="modmailOpenedText">Modmail opened reply</label>
      <input id="modmailOpenedText" name="modmailOpenedText" value="${escapeHtml(config.modmailOpenedText)}">
      <label for="modmailClosedText">Modmail closed reply</label>
      <input id="modmailClosedText" name="modmailClosedText" value="${escapeHtml(config.modmailClosedText)}">
      <button type="submit">Save modmail</button>
    </form>
    ${role === "owner" ? `<form method="post" action="/api/panel?panelPath=/admin/save-access">
      <label for="adminPassword">Admin password</label>
      <input id="adminPassword" name="adminPassword" type="password" value="${escapeHtml(adminPassword)}" required>
      <label for="ownerPassword">Owner password</label>
      <input id="ownerPassword" name="ownerPassword" type="password" value="${escapeHtml(ownerPassword)}" required>
      <button type="submit">Save access passwords</button>
    </form>` : ""}
    <div class="row">
      <a class="button" href="/?fromPanel=1">Open Website</a>
      <form method="post" action="/api/panel?panelPath=/logout"><button class="ghost" type="submit">Logout</button></form>
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
          noPingStaffRoleId: form.noPingStaffRoleId?.trim() || ""
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
