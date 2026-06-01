import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const panelPassword = process.env.PANEL_PASSWORD || "etc-panel";
const ownerPassword = process.env.OWNER_PASSWORD || panelPassword;
const adminPassword = process.env.ADMIN_PASSWORD || "etc-admin";
const cookieSecret = process.env.COOKIE_SECRET || ownerPassword || panelPassword;
const maxAgeSeconds = 60 * 60 * 12;

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

function renderAdmin(role, message = "") {
  return page("ETC Bot Panel", `<main>
    <h1>Bot Panel</h1>
    ${message ? `<p>${escapeHtml(message)}</p>` : ""}
    <p>You are logged in as <strong>${escapeHtml(role)}</strong>.</p>
    <p>This hosted panel login is active on Vercel. Live Discord bot runtime actions still need the bot process running outside Vercel.</p>
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

      if (req.method === "POST") {
        sendHtml(res, 200, renderAdmin(session.role, "Hosted panel received the request."));
        return;
      }

      sendHtml(res, 200, renderAdmin(session.role));
      return;
    }

    sendHtml(res, 404, page("Not Found", "<main><h1>404</h1><p>Panel route not found.</p></main>"));
  } catch (error) {
    sendHtml(res, 500, page("Panel Error", `<main><h1>Panel Error</h1><p>${escapeHtml(error.message || "Unknown error")}</p></main>`));
  }
}
