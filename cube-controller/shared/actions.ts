import { KEYS, normalizeKey } from "./keys";
export { KEYS } from "./keys";
export type Modifier = "command" | "option" | "control" | "shift";
export const MEDIA_ACTIONS = ["playPause", "nextTrack", "previousTrack", "volumeUp", "volumeDown", "mute"] as const;
export type MediaAction = typeof MEDIA_ACTIONS[number];
export type OSAction =
  | { type: "key"; key: string }
  | { type: "shortcut"; key: string; modifiers: Modifier[] }
  | { type: "app"; app: string }
  | { type: "url"; url: string }
  | { type: "terminal" | "background"; executable: string; args: string[] }
  | { type: "media"; action: MediaAction };
export type LayerAction = { type: "layer"; layer: "shift"; mode: "toggle" | "oneshot" };
export type Action = OSAction | LayerAction;

function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\0\r\n]/.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

export function validateExecutable(value: unknown): string {
  const executable = text(value, "executable", 1000);
  // Paths with spaces and Windows drive letters are valid. Never evaluated as shell text.
  if (/[<>"|?*]/.test(executable)) throw new Error("Invalid executable path");
  return executable;
}

export function validateAction(value: unknown): Action {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid action");
  const action = value as Record<string, unknown>;
  const key = () => {
    const result = normalizeKey(text(action.key, "key", 20));
    if (!(KEYS as readonly string[]).includes(result)) throw new Error(`Unsupported key: ${result}`);
    return result;
  };
  switch (action.type) {
    case "layer":
      if (action.layer !== "shift" || !["toggle", "oneshot"].includes(action.mode as string)) {
        throw new Error("Invalid Shift layer action");
      }
      return { type: "layer", layer: "shift", mode: action.mode as LayerAction["mode"] };
    case "key": return { type: "key", key: key() };
    case "shortcut": {
      const modifiers = action.modifiers ?? [];
      if (!Array.isArray(modifiers) || modifiers.length > 4 ||
          !modifiers.every(m => ["command", "option", "control", "shift"].includes(m))) {
        throw new Error("Invalid shortcut modifiers");
      }
      return { type: "shortcut", key: key(), modifiers: [...new Set(modifiers)] as Modifier[] };
    }
    case "app": return { type: "app", app: text(action.app, "application", 1000) };
    case "url": {
      const url = new URL(text(action.url, "URL", 8192));
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP/HTTPS URLs are allowed");
      return { type: "url", url: url.toString() };
    }
    case "terminal":
    case "background": {
      const executable = validateExecutable(action.executable);
      const args = action.args ?? [];
      if (!Array.isArray(args) || args.length > 50 ||
          !args.every(arg => typeof arg === "string" && arg.length <= 1000 && !arg.includes("\0"))) {
        throw new Error("Invalid arguments (maximum 50 arguments, 1000 characters each)");
      }
      return { type: action.type, executable, args: [...args] };
    }
    case "media":
      if (!(MEDIA_ACTIONS as readonly unknown[]).includes(action.action)) throw new Error("Invalid media action");
      return { type: "media", action: action.action as MediaAction };
    default: throw new Error("Unsupported action type");
  }
}

export function validateOSAction(value: unknown): OSAction {
  const action = validateAction(value);
  if (action.type === "layer") throw new Error("Layer actions must be handled in the controller");
  return action;
}
