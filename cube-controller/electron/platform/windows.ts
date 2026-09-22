import { join } from "node:path";
import type { Action, MediaAction, Modifier } from "../../shared/actions";
import type { PlatformActions } from "./types";
import { launchFile, runFile, terminalScript } from "./process";

export const keyCodes: Record<string, number> = {
  ...Object.fromEntries([..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map(c => [c, c.charCodeAt(0)])),
  ...Object.fromEntries(["ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE"].map((k, i) => [k, 0x30 + i])),
  ENTER: 0x0d, TAB: 0x09, SPACE: 0x20, DELETE: 0x08, ESCAPE: 0x1b,
  LEFT: 0x25, UP: 0x26, RIGHT: 0x27, DOWN: 0x28,
};
const modifiers: Record<Modifier, number> = { command: 0x5b, option: 0x12, control: 0x11, shift: 0x10 };
const media: Record<MediaAction, number> = {
  mute: 0xad, volumeDown: 0xae, volumeUp: 0xaf, nextTrack: 0xb0, previousTrack: 0xb1, playPause: 0xb3,
};

export function windowsInputArgs(action: Extract<Action, { type: "key" | "shortcut" | "media" }>): string[] {
  if (action.type === "media") return [String(media[action.action])];
  return [...(action.type === "shortcut" ? action.modifiers.map(m => modifiers[m]) : []), keyCodes[action.key]].map(String);
}

export function createWindowsActions(inputHelper: string, openUrl: (url: string) => Promise<void>, run = runFile, launch = launchFile): PlatformActions {
  return {
    async execute(action) {
      switch (action.type) {
        case "key": case "shortcut": case "media": return run(inputHelper, windowsInputArgs(action));
        case "url": return openUrl(action.url);
        case "app": return launch(action.app, []);
        case "background": return run(action.executable, action.args);
        case "terminal": {
          // A literal-quoted invocation, encoded to avoid wt.exe's semicolon parsing.
          // Only this intentionally interactive action uses a shell.
          const encoded = Buffer.from(terminalScript(action.executable, action.args), "utf16le").toString("base64");
          const powershell = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
          const args = ["-NoLogo", "-NoProfile", "-NoExit", "-EncodedCommand", encoded];
          try {
            await run("wt.exe", ["-w", "new", "new-tab", powershell, ...args]);
          } catch {
            await launch(powershell, args);
          }
          return;
        }
      }
    },
  };
}
