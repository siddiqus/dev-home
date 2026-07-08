import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Standalone from vite.config (which carries the Electron plugins). Component
// tests run under jsdom with React + jest-dom matchers.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}", "shared/**/*.{test,spec}.ts"],
  },
});
