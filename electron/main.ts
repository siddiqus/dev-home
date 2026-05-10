import { app, BrowserWindow, ipcMain, shell, Menu, clipboard } from "electron";
import path from "path";
import http from "http";
import { getSettings, setSettings, isConfigured } from "./store";
import { createServer } from "../server/src/index";

declare const __API_PORT__: string;

let mainWindow: BrowserWindow | null = null;
let httpServer: http.Server | null = null;
let resolvedPort: number = parseInt(__API_PORT__, 10);

async function startBackendServer() {
  // In dev mode, load .env so the server has access to JIRA/GitHub credentials etc.
  if (process.env.VITE_DEV_SERVER_URL) {
    const dotenv = (await import("dotenv")).default;
    dotenv.config({ path: path.resolve(__dirname, "../.env") });
  } else {
    process.env.DEV_HOME_DB_PATH = path.join(app.getPath("userData"), "notes.db");
  }

  const defaultPort = parseInt(__API_PORT__, 10);
  const getPort = (await import("get-port")).default;
  resolvedPort = await getPort({ port: defaultPort });

  // Set env vars the server needs before creating it
  process.env.VITE_API_PORT = String(resolvedPort);

  const expressApp = createServer();

  httpServer = expressApp.listen(resolvedPort, () => {
    console.log(`[server] listening on http://localhost:${resolvedPort}`);
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

  // Context menu (right-click)
  mainWindow.webContents.on("context-menu", (_event, params) => {
    const menuItems: Electron.MenuItemConstructorOptions[] = [];

    if (params.linkURL) {
      menuItems.push(
        {
          label: "Open Link",
          click: () => shell.openExternal(params.linkURL),
        },
        {
          label: "Copy Link",
          click: () => clipboard.writeText(params.linkURL),
        },
        { type: "separator" },
      );
    }

    if (params.isEditable) {
      menuItems.push(
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { type: "separator" },
      );
    } else if (params.selectionText) {
      menuItems.push({ role: "copy" }, { type: "separator" });
    }

    menuItems.push(
      { role: "selectAll" },
      { type: "separator" },
      {
        label: "Reload",
        click: () => mainWindow?.webContents.reload(),
      },
    );

    if (process.env.VITE_DEV_SERVER_URL) {
      menuItems.push({ type: "separator" }, { role: "toggleDevTools" });
    }

    Menu.buildFromTemplate(menuItems).popup();
  });

  // Find-in-page: forward results from webContents back to renderer
  mainWindow.webContents.on("found-in-page", (_event, result) => {
    mainWindow?.webContents.send("find-result", {
      activeMatchOrdinal: result.activeMatchOrdinal,
      matches: result.matches,
    });
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
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

  ipcMain.handle("app:getApiPort", () => {
    return resolvedPort;
  });

  // Find-in-page IPC handlers
  ipcMain.handle(
    "find-in-page",
    (_event, text: string, forward: boolean, findNext: boolean) => {
      if (mainWindow && text) {
        mainWindow.webContents.findInPage(text, { forward, findNext });
      }
    },
  );

  ipcMain.handle("stop-find-in-page", () => {
    if (mainWindow) {
      mainWindow.webContents.stopFindInPage("clearSelection");
    }
  });

  await startBackendServer();
  createWindow();

  // Application menu
  const isMac = process.platform === "darwin";
  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
        { type: "separator" },
        {
          label: "Find",
          accelerator: "CmdOrCtrl+F",
          click: () => mainWindow?.webContents.send("toggle-find"),
        },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [
              { type: "separator" as const },
              { role: "front" as const },
            ]
          : [{ role: "close" as const }]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
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
