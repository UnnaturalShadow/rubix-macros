import { join } from "node:path";
import { shell } from "electron";
import { validateAction } from "../../shared/actions";
import type { ActionResult } from "../../shared/api";
import { createMacActions } from "../platform/macos";
import { createWindowsActions } from "../platform/windows";

export function createActionExecutor(platform: NodeJS.Platform, nativeDirectory: string) {
  const adapter = platform === "darwin" ? createMacActions(join(nativeDirectory, "cube-media"))
    : platform === "win32" ? createWindowsActions(join(nativeDirectory, "CubeInput.exe"), url => shell.openExternal(url)) : null;
  // Serialize input actions so modifier presses and fallback single moves cannot overlap.
  let inputQueue = Promise.resolve();
  return async (value: unknown): Promise<ActionResult> => {
    try {
      if (!adapter) throw new Error(`Unsupported platform: ${platform}`);
      const action = validateAction(value);
      if (["key", "shortcut", "media"].includes(action.type)) {
        const result = inputQueue.then(() => adapter.execute(action));
        inputQueue = result.catch(() => {});
        await result;
      } else {
        await adapter.execute(action);
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Action failed" };
    }
  };
}
