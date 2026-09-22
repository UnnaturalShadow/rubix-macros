# Cube Controller

An Electron desktop utility for using a Bluetooth Rubik’s Connected cube to trigger keys, shortcuts, applications, websites, interactive terminal commands, background processes, and system media controls. The renderer retains the existing UI, profiles, recording/editor, and 550 ms sequence matching behavior.

## Development

Install Node.js 22.12+ (24 LTS recommended), then run from this directory:

```sh
npm ci
npm run dev
```

`dev` builds the current OS helper and Electron entry points, starts Vite on `127.0.0.1:5173`, and opens the desktop app. Renderer edits hot reload; restart `dev` after editing Electron or native code. There is no port 3001 or Express bridge. Development needs only the OS you are using.

`npm ci` downloads Electron and builds the original Bluetooth library source. The library is pinned to the same commit as the original lockfile (`44f1f091c6e980d9cc31e6d2863c4437eca3ab3c`). Its source is fetched over HTTPS and built with a local cross-platform script because the upstream prepare script uses `rm -rf`. No Bluetooth protocol implementation is changed. Do not use `--ignore-scripts`; if needed, run `npm run postinstall` afterward.

`npm run dev:web` opens the renderer in a browser for UI work or exporting an old browser profile. Browser mode does not execute computer actions. `npm run preview` likewise previews only the built UI.

### macOS

- macOS 12+; install Xcode Command Line Tools with `xcode-select --install` for building the small system-media helper. It builds for both Apple Silicon and Intel.
- Allow Bluetooth access when prompted. If connecting fails, check System Settings → Privacy & Security → Bluetooth.
- Allow Accessibility access for Cube Controller (Electron during development) to send global keys and system media events. If macOS lists the media helper separately, grant it access as well.
- Allow Automation requests for System Events and Terminal. Keyboard actions preserve the old `osascript`/System Events behavior; application and URL actions still use `open`, and terminal actions still use Terminal.app.
- Media actions post system media-key events rather than targeting Spotify specifically. The OS decides which media application receives playback commands.

### Windows

- Windows 10/11 with a Bluetooth adapter.
- The build uses the .NET Framework C# compiler at `%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe`. This is supplied by the Windows .NET Framework installation; no .NET SDK or NuGet package is needed. A missing compiler requires enabling/installing .NET Framework 4.x.
- `native/windows/CubeInput.cs` builds as a small AnyCPU GUI executable. It calls Win32 `SendInput` with correctly sized native structures and sends modifier/key down/up events in one batch. It has no console window.
- The packaged app includes the helper; end users do not need the compiler. Standard Windows .NET Framework 4.x is required.
- Shortcut labels are **Win**, **Alt**, **Control**, and **Shift**. Stored `command` maps to Win; stored `option` maps to Alt. `DELETE` remains backspace, matching the original Mac Delete key.
- Application actions accept an executable on PATH or a full executable path, including spaces. They do not resolve arbitrary Start menu display names; use the executable path for apps such as Spotify. Store app identifiers and `.lnk` files are not supported by this action.
- Interactive commands launch Windows Terminal if available, with visible PowerShell as a fallback. The executable and arguments are individually quoted and passed as an encoded PowerShell invocation. Background actions call `execFile` directly and never invoke a shell. Use a real executable/interpreter for `.cmd`, `.bat`, or `.ps1` scripts (for example, `powershell.exe` with `-File` and the script path).
- Windows blocks SendInput into higher-integrity/elevated applications from a normal app. The utility does not automatically elevate itself.

## Using the cube

Click **Connect**, wake the cube by turning a face, and select it in the device picker. Scanning and pairing prompts time out after 30 seconds and can be cancelled. The existing library continues decoding Bluetooth data into MOVE events. A disconnect enables Connect again.

A complete multi-move match executes immediately. A possible sequence waits 550 ms after the latest move; on timeout, its individual bound moves execute. An exact shorter sequence still takes precedence over a longer sequence sharing that prefix, as in the original implementation. Recording captures moves without executing macros and cancels any pending sequence. Other than recording, actions remain active while the window is open, including when minimized. Closing the window disconnects the cube; there is no tray, login startup, or background service.

Keys act on the foreground application. Focus the target application after configuring the binding. **Terminal** commands intentionally open a visible interactive session (for example `ssh jeff`); **Background** commands run directly without changing focus. Media Control is an additional action type in the existing binding editor.

## Existing profiles and persistence

### Keyboard keys

Both **Press key** and **Keyboard shortcut** now include punctuation (`. , / \\ ; ' [ ] - =` and backtick), F1–F20, Home/End/Page Up/Page Down, forward Delete, Caps Lock, the numeric keypad (including its own Enter), and left/right Shift, Control, Alt/Option, and Windows/Command keys. Windows also includes F21–F24, Insert, Num Lock, Scroll Lock, Print Screen, Pause/Break, and Context Menu. macOS includes Help and keypad Equals. An extra ISO keyboard key is available on both platforms.

The picker lists keys supported on the current OS. Imported bindings for another platform retain their key and show “unavailable on this OS” when edited; executing them reports an error rather than substituting another key. Existing `DELETE` bindings remain Backspace/Mac Delete; choose **Forward Delete** for deleting the next character.

These are key presses, not layout-independent text insertion. Punctuation labels use US keyboard conventions; the active OS keyboard layout determines the resulting characters, and numpad behavior follows OS/app handling and Num Lock. Use a Shift shortcut or Shift Layer for symbols such as `?`, `:`, `+`, and braces. Standalone modifiers are tapped and released; use a shortcut binding to hold a modifier with another key. Hardware-only Fn/Globe, power, and vendor-specific keys are not included. Playback and volume remain in **Media Control**. Windows mappings follow [Microsoft's virtual-key definitions](https://learn.microsoft.com/en-us/windows/win32/inputdev/virtual-key-codes).

### Shift Layer

Add a binding, choose **Shift Layer**, then select **Toggle Shift** or **One-shot Shift**. The small Shift indicator shows **Off**, **Locked**, or **One-shot**. Toggle switches Off → Locked → Off (and One-shot → Locked). One-shot shifts the next letter or number key, then returns to Off. Locked continues shifting eligible keys until toggled off.

This is a virtual typing layer, independent of OS Caps Lock. It transforms only plain `key` actions for A–Z, the existing ZERO–NINE key names, and punctuation into normal Shift shortcuts. Existing shortcut bindings, media/app/URL/command actions, Space, numpad keys, and navigation/control keys are unchanged and do not consume one-shot.

Layer bindings use the usual cube sequence matcher. Recording neither activates nor consumes Shift. Switching profiles or disconnecting resets Shift to Off, and restarting always begins Off. Only the binding definition is saved; runtime Shift state is not persisted. One-shot is consumed when an eligible action is dispatched, even if the OS later reports that it failed. Layer actions stay in the renderer and are rejected as executable IPC actions.

### Transferring profiles

The storage key remains `cube-controller-config-v2`, and the structure remains `{ activeProfileId, profiles }`, with each binding holding `{ id, pattern, label, action }`. Existing action definitions remain valid. The original `cube-bindings` single-profile migration remains supported. Media and Shift layer actions are additive and do not reset or bump the stored format.

Electron and your browser have separate storage. Profiles from an existing browser installation cannot appear in Electron automatically. To transfer them:

1. Open the old app at its original browser origin (same host and port).
2. If it has the new **Export profiles** button, use it. Otherwise, in that page's browser developer console run:

   ```js
   copy(localStorage.getItem('cube-controller-config-v2'))
   ```

   Save the copied JSON as `cube-controller-profiles.json`. For the older single-profile key, use:

   ```js
   copy(JSON.stringify({
     activeProfileId: 'imported',
     profiles: [{ id: 'imported', name: 'Desktop', bindings: JSON.parse(localStorage.getItem('cube-bindings')) }]
   }))
   ```

3. In Electron choose **Import profiles**. Imports are validated and added with fresh IDs, preserving all current profiles. The imported active profile is selected.

Imported macros can run local programs: review the bindings before using the cube. Imported Mac shortcuts keep their original modifier semantics on Windows; the importer does not silently convert Command to Control or rewrite app names and command paths.

Packaged renderer storage uses the stable `cube://app` origin in Electron's user-data directory. Vite development uses a separate origin; use export/import when moving from development to a packaged app, or between computers. Export files are ordinary JSON backups. No cloud service or database is involved.

## Build, test, package

```sh
npm run typecheck
npm test
npm run build
npm run test:smoke
```

The unit/regression tests cover validation, original Mac action routing, Windows key/media mapping, terminal quoting, configuration compatibility, and the actual renderer's sequence/recording/editor behavior using simulated cube events. The Electron smoke test starts a separate temporary profile and checks the real preload/IPC, secure renderer, profile dialogs, persistence, media editor, and a simulated device chooser. It executes only a harmless background helper self-test, not global keyboard or media actions.

Package on the target OS:

```sh
# On macOS: .app in the output directory, plus .dmg and .zip
npm run package:mac

# On Windows: NSIS installer and portable .exe
npm run package:win
```

Outputs are under `release/`. Both use the same renderer and codebase. The helper must be built on its target OS, so packaging scripts reject a mismatched host. Default Electron architecture follows the host; the macOS helper itself is universal. The repository's GitHub Actions matrix builds on both OSes without requiring them on one development machine. The workflow also runs the smoke test on each OS and uploads unsigned packages; publishing/signing is not automatic.

For distributing trusted production builds, configure electron-builder's code signing and macOS notarization credentials in your build environment. Local builds without credentials are unsigned and are not notarized. macOS usage descriptions and hardened-runtime entitlements are included, and the media helper is listed for signing with the application.

## Structure and trust boundary

```text
src/main.ts                 Existing renderer, profiles, editor, sequence engine
src/desktop.ts              Small text-entry and Bluetooth dialogs
src/shift-layer.ts          Platform-independent runtime Shift transformation
shared/actions.ts           Action schema and runtime validation
shared/config.ts            Compatible profile types and import validation
electron/main.ts            Window, secure app protocol, Bluetooth, validated IPC
electron/preload.ts         Narrow cubeAPI; no Node modules exposed
electron/actions/index.ts   Runtime OS selection and ordered input execution
electron/platform/         Isolated macOS / Windows action implementations
native/                    Native media/SendInput helper source
scripts/                   Development, builds, packaging, smoke checks
```

The renderer has `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`. Main-process IPC validates both sender identity/origin and action data. Navigation/popups are blocked outside the app. The packaged renderer has a restrictive CSP and a secure custom protocol. There is no generic shell-text IPC or exposed `exec`, `fs`, or `ipcRenderer` API. Executables and argument arrays remain separate; background processes never use `shell: true`. Input actions are serialized to avoid overlapping modifier presses. Process failures are returned to the renderer and shown above the move display.

Electron device plumbing follows [Electron's device-access documentation](https://www.electronjs.org/docs/latest/tutorial/devices); the sandbox and preload boundary follow [Electron's security guidance](https://www.electronjs.org/docs/latest/tutorial/security). The native input mechanism and elevation limitation are documented by [Microsoft's SendInput reference](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput).

## Hardware acceptance checks

Verified in the Windows development workspace: renderer and Electron TypeScript checks, production build, native helper compilation/layout/extended-key self-test, all 34 regression tests (including expanded keyboard and Shift Layer behavior with both platform configurations), Electron smoke checks, Windows NSIS/portable packaging, and smoke checks against the packaged Windows app. The generated executables are unsigned. macOS compilation/packaging and real Bluetooth/global input/media behavior have not been verified on hardware in this workspace.

Automated checks cannot establish real cube or macOS permission behavior on a Windows machine. Before releasing, verify on **each OS**, with the actual cube:

1. Start the app, connect through the picker, and verify MOVE/history events; cancel and retry, disconnect and reconnect.
2. Import a real existing profile, restart, and verify active profile and all bindings persist.
3. Record an algorithm, save it, switch focus to a target app, and execute it once without stray constituent keys.
4. Test keys/modifiers, app launching, an HTTPS URL, and all six media controls.
5. Run an interactive terminal command (SSH or a shell program that waits for input) and a background command; verify visible-vs-silent behavior and error reporting.
6. Repeat with the packaged build and macOS Bluetooth/Accessibility/Automation permissions. Check minimization, playback routing, and volume controls on the actual OS.
7. Bind Toggle Shift and One-shot Shift, then type letters/numbers into a text editor. Check the indicator, one-shot survival across navigation/media actions, and reset on profile switch/disconnect.

The macOS end-to-end milestone remains a required hardware acceptance step; passing Windows builds or mocked Mac adapter tests does not replace it.
