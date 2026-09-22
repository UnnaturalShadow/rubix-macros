import type { OSAction as Action, Modifier } from "../../shared/actions";
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
  PERIOD: 47, COMMA: 43, SLASH: 44, BACKSLASH: 42, SEMICOLON: 41, QUOTE: 39,
  LEFT_BRACKET: 33, RIGHT_BRACKET: 30, MINUS: 27, EQUAL: 24, GRAVE: 50, INTL_BACKSLASH: 10,
  FORWARD_DELETE: 117, HOME: 115, END: 119, PAGE_UP: 116, PAGE_DOWN: 121,
  F1: 122, F2: 120, F3: 99, F4: 118, F5: 96, F6: 97, F7: 98, F8: 100,
  F9: 101, F10: 109, F11: 103, F12: 111, F13: 105, F14: 107, F15: 113,
  F16: 106, F17: 64, F18: 79, F19: 80, F20: 90,
  CAPS_LOCK: 57, HELP: 114, CLEAR: 71,
  NUMPAD_0: 82, NUMPAD_1: 83, NUMPAD_2: 84, NUMPAD_3: 85, NUMPAD_4: 86,
  NUMPAD_5: 87, NUMPAD_6: 88, NUMPAD_7: 89, NUMPAD_8: 91, NUMPAD_9: 92,
  NUMPAD_DECIMAL: 65, NUMPAD_ADD: 69, NUMPAD_SUBTRACT: 78, NUMPAD_MULTIPLY: 67, NUMPAD_DIVIDE: 75, NUMPAD_ENTER: 76, NUMPAD_EQUAL: 81,
  LEFT_SHIFT: 56, RIGHT_SHIFT: 60, LEFT_CONTROL: 59, RIGHT_CONTROL: 62,
  LEFT_ALT: 58, RIGHT_ALT: 61, LEFT_META: 55, RIGHT_META: 54,
};
const modifierMap: Record<Modifier, string> = {
  command: "command down", option: "option down", control: "control down", shift: "shift down",
};

export function macKeyScript(key: string, modifiers: Modifier[] = []): string {
  if (keyCodes[key] === undefined) throw new Error(`Key ${key} is not supported on macOS`);
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
