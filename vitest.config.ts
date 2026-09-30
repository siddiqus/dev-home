import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
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
          name: "server",
          environment: "node",
          include: ["server/src/**/*.{test,spec}.ts"],
        },
      },
    ],
  },
});
