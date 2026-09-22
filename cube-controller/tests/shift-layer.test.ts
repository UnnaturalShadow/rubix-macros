import { test } from "node:test";
import assert from "node:assert/strict";
import { applyShiftLayer, isShiftableKey } from "../src/shift-layer";
import { validateAction, validateOSAction, type Action } from "../shared/actions";
import { parseImportedConfig } from "../shared/config";
import { PUNCTUATION_KEYS } from "../shared/keys";

const toggle: Action = { type: "layer", layer: "shift", mode: "toggle" };
const oneshot: Action = { type: "layer", layer: "shift", mode: "oneshot" };
test("Shift toggle transitions off -> locked -> off and oneshot -> locked locally", () => {
  assert.deepEqual(applyShiftLayer("off", toggle), { state: "locked", action: null });
  assert.deepEqual(applyShiftLayer("locked", toggle), { state: "off", action: null });
  assert.deepEqual(applyShiftLayer("oneshot", toggle), { state: "locked", action: null });
  for (const state of ["off", "locked", "oneshot"] as const) {
    assert.deepEqual(applyShiftLayer(state, oneshot), { state: "oneshot", action: null });
  }
});

test("one-shot shifts exactly one eligible key; locked Shift remains active", () => {
  const key: Action = { type: "key", key: "A" };
  const shifted = { type: "shortcut", key: "A", modifiers: ["shift"] };
  assert.deepEqual(applyShiftLayer("oneshot", key), { state: "off", action: shifted });
  assert.deepEqual(applyShiftLayer("locked", key), { state: "locked", action: shifted });
  assert.deepEqual(applyShiftLayer("off", key), { state: "off", action: key });
  assert.deepEqual(key, { type: "key", key: "A" });
});

test("shiftable keys include punctuation, excluding navigation/control and numpad keys", () => {
  for (const key of [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,/;", ...PUNCTUATION_KEYS, "ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE"]) {
    assert.equal(isShiftableKey(key), true, key);
  }
  for (const key of ["LEFT", "RIGHT", "UP", "DOWN", "ENTER", "ESCAPE", "TAB", "DELETE", "BACKSPACE", "SPACE", "CAPS_LOCK", "F1", "PLAY", "NUMPAD_1", "NUMPAD_ENTER", "NUMPAD_DECIMAL", "LEFT_SHIFT", "HOME", "FORWARD_DELETE"]) {
    assert.equal(isShiftableKey(key), false, key);
    const action: Action = { type: "key", key };
    assert.deepEqual(applyShiftLayer("oneshot", action), { state: "oneshot", action });
    assert.deepEqual(applyShiftLayer("locked", action), { state: "locked", action });
  }
});

test("one-shot transforms punctuation via the existing Shift shortcut pipeline", () => {
  for (const key of PUNCTUATION_KEYS) {
    assert.deepEqual(applyShiftLayer("oneshot", { type: "key", key }), {
      state: "off", action: { type: "shortcut", key, modifiers: ["shift"] },
    });
  }
});

test("one-shot survives every non-key OS action, including existing shortcuts", () => {
  const actions: Action[] = [
    { type: "media", action: "playPause" }, { type: "app", app: "Spotify" },
    { type: "url", url: "https://example.com" }, { type: "terminal", executable: "ssh", args: ["jeff"] },
    { type: "background", executable: "tool", args: [] },
    { type: "shortcut", key: "A", modifiers: ["command"] },
    { type: "shortcut", key: "A", modifiers: ["shift"] },
  ];
  for (const action of actions) {
    assert.deepEqual(applyShiftLayer("oneshot", action), { state: "oneshot", action });
    assert.deepEqual(applyShiftLayer("locked", action), { state: "locked", action });
  }
});

test("configuration accepts additive layer actions; executable IPC validation rejects them", () => {
  for (const action of [toggle, oneshot]) {
    assert.deepEqual(validateAction(action), action);
    assert.throws(() => validateOSAction(action), /handled in the controller/);
    const config = { activeProfileId: "p", profiles: [{ id: "p", name: "Typing", bindings: [
      { id: "b", label: "Shift", pattern: ["R"], action },
    ] }] };
    assert.deepEqual(parseImportedConfig(config), config);
  }
  for (const action of [{ type: "layer", layer: "capslock", mode: "toggle" },
    { type: "layer", layer: "shift", mode: "hold" }, { type: "layer", mode: "oneshot" }]) {
    assert.throws(() => validateAction(action));
  }
});
