import { execFile, spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

export function expandExecutable(executable: string): string {
  return /^~[/\\]/.test(executable) ? join(homedir(), executable.slice(2)) : executable;
}

export function runFile(executable: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(expandExecutable(executable), args, { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, error => {
      if (error) reject(new Error(`Could not run ${executable}: ${error.message}`));
      else resolve();
    });
  });
}

export function launchFile(executable: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(expandExecutable(executable), args, { detached: true, stdio: "ignore", windowsHide: false });
    child.once("error", reject);
    child.once("spawn", () => { child.unref(); resolve(); });
  });
}

export const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
export const appleScriptString = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n")}"`;
export const powerShellQuote = (value: string) => `'${value.replace(/'/g, "''")}'`;

export function terminalScript(executable: string, args: string[]): string {
  return `& ${[expandExecutable(executable), ...args].map(powerShellQuote).join(" ")}`;
}
