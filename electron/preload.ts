import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getSettings: () => ipcRenderer.invoke("store:getSettings"),
  saveSettings: (settings: Record<string, string>) =>
    ipcRenderer.invoke("store:setSettings", settings),
  isConfigured: () => ipcRenderer.invoke("store:isConfigured"),
  getApiPort: () => ipcRenderer.invoke("app:getApiPort"),

  // Find-in-page
  findInPage: (text: string, forward: boolean, findNext: boolean) =>
    ipcRenderer.invoke("find-in-page", text, forward, findNext),
  stopFindInPage: () => ipcRenderer.invoke("stop-find-in-page"),
  onToggleFind: (callback: () => void) => {
    ipcRenderer.on("toggle-find", callback);
    return () => ipcRenderer.removeListener("toggle-find", callback);
  },
  onFindResult: (
    callback: (result: { activeMatchOrdinal: number; matches: number }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      result: { activeMatchOrdinal: number; matches: number },
    ) => callback(result);
    ipcRenderer.on("find-result", handler);
    return () => ipcRenderer.removeListener("find-result", handler);
  },
});
