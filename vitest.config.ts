import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify("test") },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // vite-plugin-pwa's virtual module only exists in the Vite build; tests vi.mock it.
      "virtual:pwa-register/react": path.resolve(__dirname, "./src/test/pwaRegisterStub.ts"),
    },
  },
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: "web",
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          include: ["src/**/*.{test,spec}.{ts,tsx}", "shared/**/*.{test,spec}.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "proxy",
          environment: "node",
          include: ["proxy/**/*.{test,spec}.ts"],
        },
      },
    ],
  },
});
