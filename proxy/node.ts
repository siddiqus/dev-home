import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { handle, PROXY_PREFIX, type ProxyEnv } from "./core";
import { sendWebResponse, toWebRequest } from "./nodeAdapter";
import { SECURITY_HEADERS } from "./securityHeaders";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".m4a": "audio/mp4",
  ".webmanifest": "application/manifest+json",
};

/** Root files that must revalidate on every load: the app entry, PWA service worker and manifest. */
function isNoCacheFile(distDir: string, filePath: string): boolean {
  const name = path.basename(filePath);
  if (name === "index.html") return true;
  if (path.dirname(filePath) !== distDir) return false;
  return (
    name === "sw.js" ||
    name === "registerSW.js" ||
    name === "manifest.webmanifest" ||
    /^workbox-[\w-]+\.js$/.test(name)
  );
}

function setSecurityHeaders(res: http.ServerResponse): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
}

function sendText(res: http.ServerResponse, status: number, body: string): void {
  res.statusCode = status;
  setSecurityHeaders(res);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(body);
}

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/** Resolve a URL pathname to a file inside distDir, or null if missing or outside it. */
function resolveStatic(distDir: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const filePath = path.resolve(distDir, `.${decoded}`);
  if (filePath !== distDir && !filePath.startsWith(distDir + path.sep)) return null;
  if (isFile(filePath)) return filePath;
  const index = path.join(filePath, "index.html");
  return isFile(index) ? index : null;
}

function serveStatic(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  distDir: string,
  pathname: string,
): void {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendText(res, 405, "Method not allowed");
    return;
  }
  let filePath = resolveStatic(distDir, pathname);
  if (!filePath && path.extname(pathname) === "" && !pathname.startsWith("/assets/")) {
    // SPA fallback: client-side routes render index.html.
    const index = path.join(distDir, "index.html");
    if (isFile(index)) filePath = index;
  }
  if (!filePath) {
    sendText(res, 404, "Not found");
    return;
  }

  res.statusCode = 200;
  setSecurityHeaders(res);
  res.setHeader(
    "Content-Type",
    CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
  );
  if (filePath.startsWith(path.join(distDir, "assets") + path.sep)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  } else if (isNoCacheFile(distDir, filePath)) {
    res.setHeader("Cache-Control", "no-cache");
  }
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(filePath)
    .on("error", () => {
      if (!res.headersSent) sendText(res, 500, "Internal error");
      else res.destroy();
    })
    .pipe(res);
}

/** Static app plus the Jira passthrough proxy, for self-hosting with Node. */
export function createServer(opts: { distDir: string; env: ProxyEnv }): http.Server {
  const distDir = path.resolve(opts.distDir);
  return http.createServer(async (req, res) => {
    let pathname: string;
    try {
      pathname = new URL(req.url || "/", "http://localhost").pathname;
    } catch {
      sendText(res, 400, "Bad request");
      return;
    }

    if (pathname.startsWith(`${PROXY_PREFIX}/`)) {
      // Defaults only: sendWebResponse sets the proxy's own headers afterwards, so they win.
      setSecurityHeaders(res);
      try {
        const response = await handle(toWebRequest(req, `http://${req.headers.host}`), opts.env);
        await sendWebResponse(res, response);
      } catch {
        if (res.headersSent) {
          res.destroy();
          return;
        }
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Internal error" }));
      }
      return;
    }

    serveStatic(req, res, distDir, pathname);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 3000;
  const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
  createServer({
    distDir,
    env: {
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
      JIRA_ALLOWED_HOSTS: process.env.JIRA_ALLOWED_HOSTS,
    },
  }).listen(port, () => {
    console.log(`Dev Home listening on http://localhost:${port}`);
  });
}
