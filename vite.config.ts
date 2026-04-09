import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";
import path from "path";
import pkg from "./package.json";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const apiPort = env.VITE_API_PORT || "3571";

  return {
  plugins: [
    react(),
    electron([
      {
        entry: "electron/main.ts",
        vite: {
          define: {
            __API_PORT__: JSON.stringify(apiPort),
          },
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              external: ["electron", "better-sqlite3", "get-port"],
            },
          },
        },
      },
      {
        entry: "electron/preload.ts",
        onstart({ reload }) {
          reload();
        },
        vite: {
          build: {
            outDir: "dist-electron",
          },
        },
      },
    ]),
    renderer(),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  };
});
