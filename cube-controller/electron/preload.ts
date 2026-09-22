import { contextBridge, ipcRenderer } from "electron";
import type { CubeAPI } from "../shared/api";

const api: CubeAPI = {
  platform: process.platform === "darwin" || process.platform === "win32" ? process.platform : "unsupported",
  executeAction: action => ipcRenderer.invoke("cube:action", action),
  selectBluetoothDevice: deviceId => ipcRenderer.invoke("cube:bluetooth-select", deviceId),
  respondToPairing: response => ipcRenderer.invoke("cube:bluetooth-pair", response),
  onBluetoothDevices(callback) {
    const listener = (_event: Electron.IpcRendererEvent, devices: Parameters<typeof callback>[0]) => callback(devices);
    ipcRenderer.on("cube:bluetooth-devices", listener);
    return () => ipcRenderer.removeListener("cube:bluetooth-devices", listener);
  },
  onBluetoothClosed(callback) {
    const listener = () => callback();
    ipcRenderer.on("cube:bluetooth-closed", listener);
    return () => ipcRenderer.removeListener("cube:bluetooth-closed", listener);
  },
  onPairingRequest(callback) {
    const listener = (_event: Electron.IpcRendererEvent, details: Parameters<typeof callback>[0]) => callback(details);
    ipcRenderer.on("cube:bluetooth-pairing", listener);
    return () => ipcRenderer.removeListener("cube:bluetooth-pairing", listener);
  },
};
contextBridge.exposeInMainWorld("cubeAPI", Object.freeze(api));
