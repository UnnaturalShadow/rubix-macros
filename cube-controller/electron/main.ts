import { app, BrowserWindow, ipcMain, protocol, net } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { createActionExecutor } from "./actions";
import type { PairingResponse } from "../shared/api";

protocol.registerSchemesAsPrivileged([{ scheme: "cube", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.commandLine.appendSwitch("enable-features", "WebBluetooth");
app.setName("Cube Controller");

const devUrl = !app.isPackaged ? process.env.CUBE_DEV_URL : undefined;
if (devUrl && new URL(devUrl).hostname !== "127.0.0.1") throw new Error("Development renderer must use 127.0.0.1");
const rendererUrl = devUrl ?? "cube://app/index.html";
function trustedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return devUrl ? url.origin === new URL(devUrl).origin : url.protocol === "cube:" && url.host === "app";
  } catch { return false; }
}

let window: BrowserWindow | null = null;
let selectDevice: ((id: string) => void) | undefined;
let pairing: ((response: PairingResponse) => void) | undefined;
let scanTimer: ReturnType<typeof setTimeout> | undefined;
let pairTimer: ReturnType<typeof setTimeout> | undefined;
const devices = new Map<string, { deviceId: string; deviceName: string }>();

function closeScan(id = "") {
  const callback = selectDevice;
  selectDevice = undefined;
  clearTimeout(scanTimer);
  devices.clear();
  callback?.(id);
  if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send("cube:bluetooth-closed");
}
function closePairing(response: PairingResponse = { confirmed: false }) {
  const callback = pairing;
  pairing = undefined;
  clearTimeout(pairTimer);
  callback?.(response);
  if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send("cube:bluetooth-closed");
}
function assertSender(event: IpcMainInvokeEvent) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame ||
      !trustedUrl(event.senderFrame.url)) throw new Error("Untrusted IPC sender");
}

function createWindow() {
  window = new BrowserWindow({
    width: 1100, height: 850, minWidth: 600, minHeight: 550, title: "Cube Controller", backgroundColor: "#0c0c0c",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"), nodeIntegration: false, contextIsolation: true, sandbox: true,
      backgroundThrottling: false,
    },
  });
  const contents = window.webContents;
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event, url) => { if (!trustedUrl(url)) event.preventDefault(); });
  contents.on("will-redirect", (event, url) => { if (!trustedUrl(url)) event.preventDefault(); });
  contents.on("will-attach-webview", event => event.preventDefault());
  contents.on("did-start-navigation", (_event, _url, inPlace, mainFrame) => {
    if (mainFrame && !inPlace) { closeScan(); closePairing(); }
  });
  // Web Bluetooth grants are handled by the device chooser below, not the generic
  // permission callbacks. Deny unrelated browser permissions (camera, mic, etc.).
  contents.session.setPermissionCheckHandler(() => false);
  contents.session.setPermissionRequestHandler((_sender, _permission, callback) => callback(false));
  contents.on("select-bluetooth-device", (event, list, callback) => {
    event.preventDefault();
    if (!trustedUrl(contents.getURL())) { callback(""); return; }
    if (!selectDevice) {
      selectDevice = callback;
      devices.clear();
      scanTimer = setTimeout(() => closeScan(), 30000);
    }
    for (const device of list) devices.set(device.deviceId, { deviceId: device.deviceId, deviceName: device.deviceName });
    contents.send("cube:bluetooth-devices", [...devices.values()]);
  });
  contents.session.setBluetoothPairingHandler((details, callback) => {
    closePairing();
    if (!trustedUrl(contents.getURL())) { callback({ confirmed: false }); return; }
    pairing = callback;
    pairTimer = setTimeout(() => closePairing(), 30000);
    contents.send("cube:bluetooth-pairing", { deviceId: details.deviceId, pairingKind: details.pairingKind, pin: details.pin });
  });
  window.on("closed", () => { closeScan(); closePairing(); window = null; });
  void window.loadURL(rendererUrl);
}

app.whenReady().then(() => {
  if (!devUrl) {
    const root = resolve(__dirname, "../dist");
    protocol.handle("cube", request => {
      const url = new URL(request.url);
      let file: string;
      try { file = resolve(root, `.${decodeURIComponent(url.pathname)}`); }
      catch { return new Response("Bad request", { status: 400 }); }
      if (request.method !== "GET" || url.host !== "app" || !file.startsWith(root + sep)) {
        return new Response("Forbidden", { status: 403 });
      }
      return net.fetch(pathToFileURL(file).toString()).then(response => {
        response.headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'");
        return response;
      });
    });
  }
  const nativeDirectory = app.isPackaged ? join(process.resourcesPath, "native") : join(app.getAppPath(), "native/bin");
  const executeAction = createActionExecutor(process.platform, nativeDirectory);
  ipcMain.handle("cube:action", (event, action: unknown) => { assertSender(event); return executeAction(action); });
  ipcMain.handle("cube:bluetooth-select", (event, id: unknown) => {
    assertSender(event);
    if (typeof id !== "string" || (id !== "" && !devices.has(id))) throw new Error("Unknown Bluetooth device");
    if (selectDevice) closeScan(id);
  });
  ipcMain.handle("cube:bluetooth-pair", (event, response: unknown) => {
    assertSender(event);
    const value = response as PairingResponse | null;
    if (!value || typeof value.confirmed !== "boolean" ||
        (value.pin !== undefined && (typeof value.pin !== "string" || !/^[\w -]{1,16}$/.test(value.pin)))) {
      throw new Error("Invalid pairing response");
    }
    if (pairing) closePairing({ confirmed: value.confirmed, pin: value.pin });
  });
  createWindow();
  app.on("activate", () => { if (!window) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
