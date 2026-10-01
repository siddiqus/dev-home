import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import pkg from "./package.json";
import { handle, PROXY_PREFIX } from "./proxy/core";
import { sendWebResponse, toWebRequest } from "./proxy/nodeAdapter";

/** Serve the Jira passthrough proxy from the Vite dev server. */
function jiraProxyDev(): Plugin {
  return {
    name: "jira-proxy-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith(`${PROXY_PREFIX}/`)) return next();
        try {
          const response = await handle(toWebRequest(req, `http://${req.headers.host}`), {
            ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
            JIRA_ALLOWED_HOSTS: process.env.JIRA_ALLOWED_HOSTS,
          });
          await sendWebResponse(res, response);
        } catch (err) {
          if (res.headersSent) return next(err);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Proxy error" }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), jiraProxyDev()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: { port: 3000 },
});
