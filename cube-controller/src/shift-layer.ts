import type { Action, OSAction } from "../shared/actions";
import { PUNCTUATION_KEYS, normalizeKey } from "../shared/keys";

export type ShiftState = "off" | "locked" | "oneshot";
// Numpad keys retain their native keypad semantics and do not consume one-shot.
const SHIFTABLE_KEYS = new Set([
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", ..."0123456789",
  "ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
  ...PUNCTUATION_KEYS,
]);
export function isShiftableKey(key: string): boolean {
  return SHIFTABLE_KEYS.has(normalizeKey(key));
}

export function applyShiftLayer(state: ShiftState, action: Action): { state: ShiftState; action: OSAction | null } {
  if (action.type === "layer") {
    return { state: action.mode === "oneshot" ? "oneshot" : state === "locked" ? "off" : "locked", action: null };
  }
  if (state !== "off" && action.type === "key" && isShiftableKey(action.key)) {
    return {
      state: state === "oneshot" ? "off" : state,
      action: { type: "shortcut", key: action.key, modifiers: ["shift"] },
    };
  }
  return { state, action };
}
