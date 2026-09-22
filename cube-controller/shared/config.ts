import { validateAction, type Action } from "./actions";
export type Binding = { id: string; pattern: string[]; label: string; action: Action };
export type Profile = { id: string; name: string; bindings: Binding[] };
export type CubeConfig = { activeProfileId: string; profiles: Profile[] };

// Import validation is separate from legacy localStorage loading: never silently reset stored profiles.
export function parseImportedConfig(value: unknown): CubeConfig {
  if (!value || typeof value !== "object") throw new Error("Invalid configuration");
  const input = value as CubeConfig;
  if (!Array.isArray(input.profiles) || !input.profiles.length || input.profiles.length > 100) throw new Error("Invalid profiles");
  const ids = new Set<string>();
  const profiles = input.profiles.map(profile => {
    if (!profile || typeof profile.id !== "string" || !profile.id || ids.has(profile.id) ||
        typeof profile.name !== "string" || !profile.name.trim() || !Array.isArray(profile.bindings) || profile.bindings.length > 1000) {
      throw new Error("Invalid profile");
    }
    ids.add(profile.id);
    const bindings = profile.bindings.map(binding => {
      if (!binding || typeof binding.id !== "string" || typeof binding.label !== "string" ||
          !Array.isArray(binding.pattern) || !binding.pattern.length || binding.pattern.length > 1000 ||
          !binding.pattern.every(move => typeof move === "string" && /^[RLUDFB](?:'|2)?$/.test(move))) {
        throw new Error("Invalid binding");
      }
      return { id: binding.id, label: binding.label, pattern: [...binding.pattern], action: validateAction(binding.action) };
    });
    return { id: profile.id, name: profile.name, bindings };
  });
  if (!ids.has(input.activeProfileId)) throw new Error("Active profile is missing");
  return { activeProfileId: input.activeProfileId, profiles };
}
