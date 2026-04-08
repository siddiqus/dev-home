import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "path";
import http from "http";
import { getSettings, setSettings, isConfigured } from "./store";
import { createServer } from "../server/src/index";

declare const __API_PORT__: string;

let mainWindow: BrowserWindow | null = null;
let httpServer: http.Server | null = null;

function startBackendServer() {
  // In dev mode, the server is started separately via concurrently.
  if (process.env.VITE_DEV_SERVER_URL) {
    return;
  }

  // Set env vars the server needs before creating it
  process.env.VITE_API_PORT = __API_PORT__;
  process.env.DEV_HOME_DB_PATH = path.join(app.getPath("userData"), "notes.db");

  const expressApp = createServer();
  const port = parseInt(__API_PORT__, 10);

  httpServer = expressApp.listen(port, () => {
    console.log(`[server] listening on http://localhost:${port}`);
  });

  httpServer.on("error", (err) => {
    console.error("[server] Failed to start:", err.message);
  });
}

function stopBackendServer() {
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: "#0a0a0a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const appUrl = process.env.VITE_DEV_SERVER_URL || "file://";
    if (!url.startsWith(appUrl)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // IPC handlers for settings store
  ipcMain.handle("store:getSettings", () => {
    return getSettings();
  });

  ipcMain.handle("store:setSettings", (_event, settings) => {
    setSettings(settings);
    return { success: true };
  });

  ipcMain.handle("store:isConfigured", () => {
    return isConfigured();
  });

  startBackendServer();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    stopBackendServer();
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on("before-quit", () => {
  stopBackendServer();
});
