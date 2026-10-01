import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
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

// Light-theme app background (--color-bg-app in src/styles/tokens.css).
const THEME_COLOR = "#ffffff";

/**
 * Installable PWA. The service worker precaches only the built app shell; it never caches
 * GitHub/Jira responses or anything else that could hold tokens or user data.
 * Registration happens in src/components/UpdateToast.tsx (production only).
 */
function pwa() {
  return VitePWA({
    registerType: "prompt",
    injectRegister: false,
    strategies: "generateSW",
    devOptions: { enabled: false },
    // Icons are already matched by workbox.globPatterns; avoid duplicate precache entries.
    includeManifestIcons: false,
    manifest: {
      name: "Dev Home",
      short_name: "Dev Home",
      description: pkg.description,
      display: "standalone",
      start_url: "/",
      scope: "/",
      theme_color: THEME_COLOR,
      background_color: THEME_COLOR,
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        {
          src: "/icons/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    workbox: {
      globPatterns: ["**/*.{html,js,css,png,m4a}"],
      navigateFallback: "/index.html",
      navigateFallbackDenylist: [/^\/jira-proxy\//],
      cleanupOutdatedCaches: true,
      // The main chunk is ~1.2 MB; Workbox silently skips files over its 2 MiB default,
      // which would break offline launch if the bundle grows.
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      // No runtimeCaching: API calls (GitHub, /jira-proxy) always go to the network.
      // No skipWaiting/clientsClaim: a new worker waits until the user clicks Reload.
    },
  });
}

export default defineConfig({
  plugins: [react(), jiraProxyDev(), pwa()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: { port: 3578 },
});
