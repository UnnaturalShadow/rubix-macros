export const PUNCTUATION_KEYS = [
  "PERIOD", "COMMA", "SLASH", "BACKSLASH", "SEMICOLON", "QUOTE",
  "LEFT_BRACKET", "RIGHT_BRACKET", "MINUS", "EQUAL", "GRAVE", "INTL_BACKSLASH",
] as const;

export const KEYS = [
  "UP", "DOWN", "LEFT", "RIGHT", "SPACE", "ENTER", "TAB", "ESCAPE", "DELETE",
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
  ...PUNCTUATION_KEYS,
  "FORWARD_DELETE", "INSERT", "HOME", "END", "PAGE_UP", "PAGE_DOWN",
  ...Array.from({ length: 24 }, (_, i) => `F${i + 1}`),
  "CAPS_LOCK", "NUM_LOCK", "SCROLL_LOCK", "PRINT_SCREEN", "PAUSE", "CONTEXT_MENU", "HELP", "CLEAR",
  ...Array.from({ length: 10 }, (_, i) => `NUMPAD_${i}`),
  "NUMPAD_DECIMAL", "NUMPAD_ADD", "NUMPAD_SUBTRACT", "NUMPAD_MULTIPLY", "NUMPAD_DIVIDE", "NUMPAD_ENTER", "NUMPAD_EQUAL",
  "LEFT_SHIFT", "RIGHT_SHIFT", "LEFT_CONTROL", "RIGHT_CONTROL", "LEFT_ALT", "RIGHT_ALT", "LEFT_META", "RIGHT_META",
] as const;

const WINDOWS_ONLY = new Set(["INSERT", "NUM_LOCK", "SCROLL_LOCK", "PRINT_SCREEN", "PAUSE", "CONTEXT_MENU", "F21", "F22", "F23", "F24"]);
const MAC_ONLY = new Set(["HELP", "NUMPAD_EQUAL"]);
export function isKeySupported(key: string, platform: string): boolean {
  return (KEYS as readonly string[]).includes(key) &&
    (platform === "win32" ? !MAC_ONLY.has(key) : platform === "darwin" ? !WINDOWS_ONLY.has(key) : false);
}

const ALIASES: Record<string, string> = {
  ".": "PERIOD", ",": "COMMA", "/": "SLASH", "\\": "BACKSLASH", ";": "SEMICOLON", "'": "QUOTE",
  "[": "LEFT_BRACKET", "]": "RIGHT_BRACKET", "-": "MINUS", "=": "EQUAL", "`": "GRAVE", "BACKSPACE": "DELETE",
};
export function normalizeKey(key: string): string {
  return ALIASES[key.toUpperCase()] ?? key.toUpperCase();
}

export const KEY_LABELS: Record<string, string> = {
  PERIOD: ". (Period)", COMMA: ", (Comma)", SLASH: "/ (Slash)", BACKSLASH: "\\ (Backslash)",
  SEMICOLON: "; (Semicolon)", QUOTE: "' (Quote)", LEFT_BRACKET: "[ (Left bracket)", RIGHT_BRACKET: "] (Right bracket)",
  MINUS: "- (Minus)", EQUAL: "= (Equals)", GRAVE: "` (Backtick)", INTL_BACKSLASH: "ISO extra key",
  FORWARD_DELETE: "Forward Delete", INSERT: "Insert", HOME: "Home", END: "End", PAGE_UP: "Page Up", PAGE_DOWN: "Page Down",
  CAPS_LOCK: "Caps Lock", NUM_LOCK: "Num Lock", SCROLL_LOCK: "Scroll Lock", PRINT_SCREEN: "Print Screen", PAUSE: "Pause / Break",
  CONTEXT_MENU: "Context Menu", HELP: "Help", CLEAR: "Clear",
  NUMPAD_DECIMAL: "Numpad .", NUMPAD_ADD: "Numpad +", NUMPAD_SUBTRACT: "Numpad -", NUMPAD_MULTIPLY: "Numpad *",
  NUMPAD_DIVIDE: "Numpad /", NUMPAD_ENTER: "Numpad Enter", NUMPAD_EQUAL: "Numpad =",
  LEFT_SHIFT: "Left Shift", RIGHT_SHIFT: "Right Shift", LEFT_CONTROL: "Left Control", RIGHT_CONTROL: "Right Control",
};
