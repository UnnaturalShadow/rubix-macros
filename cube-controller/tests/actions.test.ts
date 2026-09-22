import { test } from "node:test";
import assert from "node:assert/strict";
import { KEYS, MEDIA_ACTIONS, validateAction } from "../shared/actions";
import { parseImportedConfig } from "../shared/config";
import { createMacActions, keyCodes as macKeys, macKeyScript, macTerminalScript } from "../electron/platform/macos";
import { createWindowsActions, keyCodes as windowsKeys, windowsInputArgs } from "../electron/platform/windows";
import { powerShellQuote, shellQuote, terminalScript } from "../electron/platform/process";

test("all original keys map on both platforms; Delete preserves backspace semantics", () => {
  for (const key of KEYS) {
    assert.equal(typeof macKeys[key], "number");
    assert.equal(typeof windowsKeys[key], "number");
  }
  assert.equal(macKeys.DELETE, 51);
  assert.equal(windowsKeys.DELETE, 8);
  assert.equal(macKeyScript("SPACE", ["command"]), 'tell application "System Events" to key code 49 using {command down}');
  assert.deepEqual(windowsInputArgs({ type: "shortcut", key: "SPACE", modifiers: ["command", "option"] }), ["91", "18", "32"]);
});

test("main-process action validation rejects malformed or injected action fields", () => {
  const invalid = [null, [], {}, { type: "exec", command: "echo test" },
    { type: "key", key: "F99" }, { type: "shortcut", key: "A", modifiers: ['command down}\nend tell'] },
    { type: "app", app: "App\nName" }, { type: "url", url: "file:///etc/passwd" },
    { type: "url", url: "javascript:alert(1)" }, { type: "media", action: "shutdown" },
    { type: "background", executable: "x", args: [1] }, { type: "terminal", executable: "x\0", args: [] },
    { type: "background", executable: "x", args: Array(51).fill("a") }];
  for (const action of invalid) assert.throws(() => validateAction(action), JSON.stringify(action));
  assert.deepEqual(validateAction({ type: "key", key: "a", extra: "ignored" }), { type: "key", key: "A" });
  assert.deepEqual(validateAction({ type: "background", executable: "C:\\Program Files\\tool.exe" }),
    { type: "background", executable: "C:\\Program Files\\tool.exe", args: [] });
});

test("macOS retains original action routes and passes background argv literally", async () => {
  const calls: [string, string[]][] = [];
  const adapter = createMacActions("/native/cube-media", async (file, args) => { calls.push([file, args]); });
  await adapter.execute({ type: "key", key: "RIGHT" });
  await adapter.execute({ type: "app", app: "Visual Studio Code" });
  await adapter.execute({ type: "url", url: "https://example.com/" });
  await adapter.execute({ type: "terminal", executable: "ssh", args: ["jeff"] });
  await adapter.execute({ type: "background", executable: "osascript", args: ["-e", 'tell application "Spotify" to next track'] });
  await adapter.execute({ type: "media", action: "nextTrack" });
  assert.deepEqual(calls[0], ["/usr/bin/osascript", ["-e", 'tell application "System Events" to key code 124']]);
  assert.deepEqual(calls[1], ["/usr/bin/open", ["-a", "Visual Studio Code"]]);
  assert.deepEqual(calls[2], ["/usr/bin/open", ["https://example.com/"]]);
  assert.equal(calls[3][1][1], 'tell application "Terminal"\nactivate\ndo script "\'ssh\' \'jeff\'"\nend tell');
  assert.deepEqual(calls[4], ["osascript", ["-e", 'tell application "Spotify" to next track']]);
  assert.deepEqual(calls[5], ["/native/cube-media", ["nextTrack"]]);
});

test("terminal quoting separates hostile-looking literal arguments from command syntax", () => {
  assert.equal(shellQuote("a'b"), "'a'\\''b'");
  assert.equal(powerShellQuote("a'b"), "'a''b'");
  const args = ["", "a b", "a'b", '$(echo bad); & "test"', "C:\\Users\\name"];
  const script = terminalScript("C:\\Program Files\\tool.exe", args);
  assert.ok(script.startsWith("& 'C:\\Program Files\\tool.exe' '' 'a b' 'a''b'"));
  assert.ok(script.includes("'$(echo bad); & \"test\"'"));
  assert.ok(macTerminalScript("ssh", args).includes("do script"));
});

test("Windows media uses the system virtual keys", () => {
  assert.deepEqual(MEDIA_ACTIONS.map(action => windowsInputArgs({ type: "media", action })[0]),
    ["179", "176", "177", "175", "174", "173"]);
});

test("Windows terminal falls back to visible PowerShell; background bypasses it", async () => {
  const calls: [string, string[]][] = [];
  const launched: [string, string[]][] = [];
  const adapter = createWindowsActions("helper.exe", async url => { calls.push(["url", [url]]); },
    async (file, args) => { calls.push([file, args]); if (file === "wt.exe") throw new Error("not installed"); },
    async (file, args) => { launched.push([file, args]); });
  await adapter.execute({ type: "terminal", executable: "ssh", args: ["jeff", "a'b; Write-Host bad"] });
  assert.equal(calls[0][0], "wt.exe");
  assert.match(launched[0][0], /powershell.exe$/);
  assert.equal(Buffer.from(launched[0][1].at(-1)!, "base64").toString("utf16le"), "& 'ssh' 'jeff' 'a''b; Write-Host bad'");
  await adapter.execute({ type: "background", executable: "tool.exe", args: ["& whoami"] });
  assert.deepEqual(calls[1], ["tool.exe", ["& whoami"]]);
  await adapter.execute({ type: "app", app: "C:\\Program Files\\tool.exe" });
  assert.deepEqual(launched[1], ["C:\\Program Files\\tool.exe", []]);
});

test("configuration imports preserve the existing schema, including old actions", () => {
  const config = { activeProfileId: "desktop", profiles: [{ id: "desktop", name: "Desktop", bindings: [
    { id: "one", label: "Spotlight", pattern: ["L", "L"], action: { type: "shortcut", key: "SPACE", modifiers: ["command"] } },
  ] }] };
  assert.deepEqual(parseImportedConfig(config), config);
  assert.throws(() => parseImportedConfig({ ...config, activeProfileId: "missing" }));
  assert.throws(() => parseImportedConfig({ ...config, profiles: [{ ...config.profiles[0], bindings: [{ pattern: ["BAD"] }] }] }));
});
