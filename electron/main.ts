import { app, BrowserWindow, ipcMain, shell } from "electron";
import { fork, ChildProcess } from "child_process";
import path from "path";
import { getSettings, setSettings, isConfigured } from "./store";

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;

function startBackendServer() {
  // In dev mode, the server is started separately via concurrently.
  // In production (packaged app), fork the server process.
  if (process.env.VITE_DEV_SERVER_URL) {
    return;
  }

  const serverEntry = path.join(__dirname, "../server/dist/index.js");
  serverProcess = fork(serverEntry, [], {
    env: { ...process.env },
    silent: true,
  });

  serverProcess.stdout?.on("data", (data) => {
    console.log(`[server] ${data.toString().trim()}`);
  });

  serverProcess.stderr?.on("data", (data) => {
    console.error(`[server] ${data.toString().trim()}`);
  });

  serverProcess.on("error", (err) => {
    console.error("[server] Failed to start:", err.message);
  });
}

function stopBackendServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
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
