import type { Action } from "../../shared/actions";

export interface PlatformActions {
  execute(action: Action): Promise<void>;
}
