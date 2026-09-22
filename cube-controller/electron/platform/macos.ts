import type { Action, Modifier } from "../../shared/actions";
import type { PlatformActions } from "./types";
import { appleScriptString, expandExecutable, runFile, shellQuote } from "./process";

// Preserve the original bridge's macOS hardware key codes (including Delete = backspace).
export const keyCodes: Record<string, number> = {
  A: 0, S: 1, D: 2, F: 3, H: 4, G: 5, Z: 6, X: 7, C: 8, V: 9, B: 11,
  Q: 12, W: 13, E: 14, R: 15, Y: 16, T: 17, ONE: 18, TWO: 19, THREE: 20,
  FOUR: 21, SIX: 22, FIVE: 23, NINE: 25, SEVEN: 26, EIGHT: 28, ZERO: 29,
  O: 31, U: 32, I: 34, P: 35, L: 37, J: 38, K: 40, N: 45, M: 46,
  ENTER: 36, TAB: 48, SPACE: 49, DELETE: 51, ESCAPE: 53,
  LEFT: 123, RIGHT: 124, DOWN: 125, UP: 126,
};
const modifierMap: Record<Modifier, string> = {
  command: "command down", option: "option down", control: "control down", shift: "shift down",
};

export function macKeyScript(key: string, modifiers: Modifier[] = []): string {
  const using = modifiers.length ? ` using {${modifiers.map(m => modifierMap[m]).join(", ")}}` : "";
  return `tell application "System Events" to key code ${keyCodes[key]}${using}`;
}

export function macTerminalScript(executable: string, args: string[]): string {
  const command = [expandExecutable(executable), ...args].map(shellQuote).join(" ");
  return `tell application "Terminal"\nactivate\ndo script ${appleScriptString(command)}\nend tell`;
}

export function createMacActions(mediaHelper: string, run = runFile): PlatformActions {
  return {
    async execute(action: Action) {
      switch (action.type) {
        case "key": return run("/usr/bin/osascript", ["-e", macKeyScript(action.key)]);
        case "shortcut": return run("/usr/bin/osascript", ["-e", macKeyScript(action.key, action.modifiers)]);
        case "app": return run("/usr/bin/open", ["-a", action.app]);
        case "url": return run("/usr/bin/open", [action.url]);
        case "terminal": return run("/usr/bin/osascript", ["-e", macTerminalScript(action.executable, action.args)]);
        case "background": return run(action.executable, action.args);
        case "media": return run(mediaHelper, [action.action]);
      }
    },
  };
}
