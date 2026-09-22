import type { OSAction as Action } from "../../shared/actions";

export interface PlatformActions {
  execute(action: Action): Promise<void>;
}
