import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getSettings: () => ipcRenderer.invoke("store:getSettings"),
  saveSettings: (settings: Record<string, string>) =>
    ipcRenderer.invoke("store:setSettings", settings),
  isConfigured: () => ipcRenderer.invoke("store:isConfigured"),
  getApiPort: () => ipcRenderer.invoke("app:getApiPort"),
});
