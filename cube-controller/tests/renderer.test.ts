import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Window } from "happy-dom";

const bundle = await build({
  entryPoints: ["src/main.ts"], bundle: true, write: false, format: "iife",
  plugins: [{ name: "test-cube", setup(builder) {
    builder.onResolve({ filter: /^smartcube-web-bluetooth$/ }, () => ({ path: "cube", namespace: "mock" }));
    builder.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents:
      `export async function connectSmartCube() { return { events$: { subscribe(callback) { globalThis.cubeEvent = callback; } } }; }` }));
    builder.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" }));
  } }],
});

async function renderer(platform = "darwin", config?: object, storageKey = "cube-controller-config-v2") {
  // Only our own bundled renderer is evaluated in this test environment.
  const window = new Window({ url: "http://127.0.0.1:5173", settings: {
    enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true,
  } });
  const actions: unknown[] = [];
  Object.assign(window, { cubeAPI: { platform,
    executeAction: async (action: unknown) => { actions.push(JSON.parse(JSON.stringify(action))); return { ok: true }; },
    onBluetoothDevices() {}, onBluetoothClosed() {}, onPairingRequest() {},
  } });
  if (config) window.localStorage.setItem(storageKey, JSON.stringify(config));
  window.document.body.innerHTML = '<div id="app"></div>';
  window.eval(bundle.outputFiles[0].text);
  window.document.querySelector<HTMLButtonElement>("#connect")!.click();
  await new Promise(resolve => setImmediate(resolve));
  const move = (move: string) => window.eval(`cubeEvent(${JSON.stringify({ type: "MOVE", move })})`);
  return { window, actions, move, close: () => window.happyDOM.close() };
}

test("original macOS algorithm triggers once without constituent single-key actions", async () => {
  const app = await renderer();
  try {
    for (const move of ["R", "U", "R'", "U'"]) app.move(move);
    assert.deepEqual(app.actions, [{ type: "app", app: "Spotify" }]);
    assert.equal(app.window.document.querySelector("#sequence")!.textContent, "—");
    assert.equal(app.window.document.querySelectorAll(".binding").length, 8);
  } finally { await app.close(); }
});

test("sequence timeout retains the original 550 ms fallback behavior", async () => {
  const app = await renderer();
  try {
    app.move("R");
    assert.equal(app.actions.length, 0);
    await new Promise(resolve => setTimeout(resolve, 600));
    assert.deepEqual(app.actions, [{ type: "key", key: "RIGHT" }]);
  } finally { await app.close(); }
});

test("mismatched sequences fall back to single moves in order", async () => {
  const app = await renderer();
  try {
    app.move("R"); app.move("F");
    assert.deepEqual(app.actions, [{ type: "key", key: "RIGHT" }, { type: "key", key: "SPACE" }]);
  } finally { await app.close(); }
});

test("recording clears pending macros and captures moves without executing actions", async () => {
  const app = await renderer();
  try {
    app.move("R");
    app.window.document.querySelector<HTMLButtonElement>("#add-binding")!.click();
    app.window.document.querySelector<HTMLButtonElement>("#record")!.click();
    app.move("F");
    await new Promise(resolve => setTimeout(resolve, 600));
    assert.deepEqual(app.actions, []);
    assert.equal(app.window.document.querySelector<HTMLInputElement>("#pattern")!.value, "F");
  } finally { await app.close(); }
});

test("saved macOS profiles retain names, actions, and active selection on Windows", async () => {
  const config = { activeProfileId: "old", profiles: [{ id: "old", name: "My Mac", bindings: [
    { id: "b", label: "Spotlight", pattern: ["L", "L"], action: { type: "shortcut", key: "SPACE", modifiers: ["command"] } },
  ] }] };
  const app = await renderer("win32", config);
  try {
    app.move("L"); app.move("L");
    assert.deepEqual(app.actions, [config.profiles[0].bindings[0].action]);
    assert.equal(app.window.document.querySelector<HTMLSelectElement>("#profile")!.value, "old");
    assert.deepEqual(JSON.parse(app.window.localStorage.getItem("cube-controller-config-v2")!), config);
  } finally { await app.close(); }
});

test("media binding editor saves and executes a media action", async () => {
  const app = await renderer();
  try {
    const doc = app.window.document;
    doc.querySelector<HTMLButtonElement>("#add-binding")!.click();
    doc.querySelector<HTMLInputElement>("#pattern")!.value = "B";
    doc.querySelector<HTMLInputElement>("#binding-label")!.value = "Play music";
    const type = doc.querySelector<HTMLSelectElement>("#action-type")!;
    type.value = "media";
    type.dispatchEvent(new app.window.Event("change"));
    doc.querySelector("#binding-form")!.dispatchEvent(new app.window.Event("submit", { cancelable: true }));
    app.move("B");
    assert.deepEqual(app.actions, [{ type: "media", action: "playPause" }]);
  } finally { await app.close(); }
});

test("legacy single-profile storage still migrates without losing bindings", async () => {
  const bindings = [{ id: "legacy", label: "Tab", pattern: ["B"], action: { type: "key", key: "TAB" } }];
  const app = await renderer("darwin", bindings, "cube-bindings");
  try {
    app.move("B");
    assert.deepEqual(app.actions, [bindings[0].action]);
    assert.equal(app.window.document.querySelectorAll(".binding").length, 1);
    assert.equal(app.window.document.querySelector(".binding-name")!.textContent, "Tab");
  } finally { await app.close(); }
});

test("editing a Windows command round-trips paths, quotes, and empty arguments", async () => {
  const action = { type: "background", executable: "C:\\Program Files\\tool.exe",
    args: ["C:\\Users\\name", "a b", "a'b", 'say "hello"', "", "$(literal);&"] };
  const config = { activeProfileId: "p", profiles: [{ id: "p", name: "Paths", bindings: [
    { id: "binding", label: "Run", pattern: ["B"], action },
  ] }] };
  const app = await renderer("win32", config);
  try {
    const doc = app.window.document;
    doc.querySelector<HTMLButtonElement>(".binding")!.click();
    doc.querySelector("#binding-form")!.dispatchEvent(new app.window.Event("submit", { cancelable: true }));
    app.move("B");
    assert.deepEqual(app.actions, [action]);
  } finally { await app.close(); }
});

test("cube disconnect resets buffered actions and allows reconnecting", async () => {
  const app = await renderer();
  try {
    app.move("R");
    app.window.eval("cubeEvent({ type: 'DISCONNECT' })");
    assert.equal(app.window.document.querySelector<HTMLButtonElement>("#connect")!.disabled, false);
    assert.equal(app.window.document.querySelector("#status")!.textContent, "Disconnected");
    await new Promise(resolve => setTimeout(resolve, 600));
    assert.deepEqual(app.actions, []);
  } finally { await app.close(); }
});
