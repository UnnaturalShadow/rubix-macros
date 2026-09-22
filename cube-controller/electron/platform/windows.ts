import { join } from "node:path";
import type { OSAction as Action, MediaAction, Modifier } from "../../shared/actions";
import type { PlatformActions } from "./types";
import { launchFile, runFile, terminalScript } from "./process";

export const keyCodes: Record<string, number> = {
  ...Object.fromEntries([..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map(c => [c, c.charCodeAt(0)])),
  ...Object.fromEntries(["ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE"].map((k, i) => [k, 0x30 + i])),
  ENTER: 0x0d, TAB: 0x09, SPACE: 0x20, DELETE: 0x08, ESCAPE: 0x1b,
  LEFT: 0x25, UP: 0x26, RIGHT: 0x27, DOWN: 0x28,
  PERIOD: 0xbe, COMMA: 0xbc, SLASH: 0xbf, BACKSLASH: 0xdc, SEMICOLON: 0xba, QUOTE: 0xde,
  LEFT_BRACKET: 0xdb, RIGHT_BRACKET: 0xdd, MINUS: 0xbd, EQUAL: 0xbb, GRAVE: 0xc0, INTL_BACKSLASH: 0xe2,
  FORWARD_DELETE: 0x2e, INSERT: 0x2d, HOME: 0x24, END: 0x23, PAGE_UP: 0x21, PAGE_DOWN: 0x22,
  ...Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`F${i + 1}`, 0x70 + i])),
  CAPS_LOCK: 0x14, NUM_LOCK: 0x90, SCROLL_LOCK: 0x91, PRINT_SCREEN: 0x2c, PAUSE: 0x13, CONTEXT_MENU: 0x5d, CLEAR: 0x0c,
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`NUMPAD_${i}`, 0x60 + i])),
  NUMPAD_DECIMAL: 0x6e, NUMPAD_ADD: 0x6b, NUMPAD_SUBTRACT: 0x6d, NUMPAD_MULTIPLY: 0x6a, NUMPAD_DIVIDE: 0x6f, NUMPAD_ENTER: 0x0d,
  LEFT_SHIFT: 0xa0, RIGHT_SHIFT: 0xa1, LEFT_CONTROL: 0xa2, RIGHT_CONTROL: 0xa3,
  LEFT_ALT: 0xa4, RIGHT_ALT: 0xa5, LEFT_META: 0x5b, RIGHT_META: 0x5c,
};
const modifiers: Record<Modifier, number> = { command: 0x5b, option: 0x12, control: 0x11, shift: 0x10 };
const media: Record<MediaAction, number> = {
  mute: 0xad, volumeDown: 0xae, volumeUp: 0xaf, nextTrack: 0xb0, previousTrack: 0xb1, playPause: 0xb3,
};

export function windowsInputArgs(action: Extract<Action, { type: "key" | "shortcut" | "media" }>): string[] {
  if (action.type === "media") return [String(media[action.action])];
  if (keyCodes[action.key] === undefined) throw new Error(`Key ${action.key} is not supported on Windows`);
  const key = action.key === "NUMPAD_ENTER" ? "13:e" : String(keyCodes[action.key]);
  return [...(action.type === "shortcut" ? action.modifiers.map(m => String(modifiers[m])) : []), key];
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
