import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import http, { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import handler from "./api/trucksbook-km.js";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 3000);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

function createApiResponse(res) {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      res.writeHead(this.statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        ...this.headers
      });
      res.end(JSON.stringify(payload));
    }
  };
}

async function serveStatic(req, res, pathname) {
  const requestedPath = pathname === "/" ? (existsSync(join(rootDir, "dist")) ? "/dist/index.html" : "/index.html") : pathname;
  const safePath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(rootDir, safePath);

  if (!filePath.startsWith(rootDir) || !existsSync(filePath)) {
    return false;
  }

  const fileStats = await stat(filePath);
  if (!fileStats.isFile()) {
    return false;
  }

  const ext = extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": contentTypes[ext] || "application/octet-stream",
    "Content-Length": fileStats.size
  });
  createReadStream(filePath).pipe(res);
  return true;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/api/trucksbook-km") {
      await handler(req, createApiResponse(res));
      return;
    }

    if (url.pathname === "/api/welcome-preview") {
      const { default: welcomePreview } = await import("./api/welcome-preview.js");
      await welcomePreview(req, createApiResponse(res));
      return;
    }

    // Try serving main website files first
    const fileFound = await serveStatic(req, res, url.pathname);
    
    // 🌐 BRIDGE: If file doesn't exist on the website, safely forward the request to the Bot Panel on 10001!
    if (!fileFound) {
      const proxyReq = http.request({
        host: "localhost",
        port: 10001,
        path: req.url,
        method: req.method,
        headers: req.headers
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      });

      proxyReq.on("error", () => {
        sendJson(res, 404, { error: "Page not found on website or bot panel." });
      });

      req.pipe(proxyReq);
    }
  } catch (error) {
    sendJson(res, 500, {
      error: "Local server failed to handle the request.",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

server.listen(port, () => {
  console.log(`EU Tuning Crew local server running at http://localhost:${port}`);
});

// Set port to 10001 internally so the bot panel binds there
const port = process.env.PORT || 10001;
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});


// Start the bot backend automatically alongside the website server
import("./bot/src/index.js").catch(err => console.error("Failed to start bot:", err));
