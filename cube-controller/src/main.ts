import "./style.css";
import { MEDIA_ACTIONS, validateExecutable, type Action, type Modifier } from "../shared/actions";
import { parseImportedConfig, type Binding, type Profile, type CubeConfig } from "../shared/config";
import { requestText, setupBluetoothPicker } from "./desktop";

import {
  connectSmartCube,
  type SmartCubeConnection,
  type SmartCubeEvent,
} from "smartcube-web-bluetooth";

const isWindows = window.cubeAPI?.platform === "win32";
const MEDIA_LABELS: Record<string, string> = {
  playPause: "Play / Pause", nextTrack: "Next track", previousTrack: "Previous track",
  volumeUp: "Volume up", volumeDown: "Volume down", mute: "Mute",
};

const CONFIG_KEY = "cube-controller-config-v2";

const VALID_MOVES = new Set([
  "R",
  "R'",
  "R2",
  "L",
  "L'",
  "L2",
  "U",
  "U'",
  "U2",
  "D",
  "D'",
  "D2",
  "F",
  "F'",
  "F2",
  "B",
  "B'",
  "B2",
]);

const KEY_OPTIONS = [
  "UP",
  "DOWN",
  "LEFT",
  "RIGHT",
  "SPACE",
  "ENTER",
  "TAB",
  "ESCAPE",
  "DELETE",

  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",

  "ZERO",
  "ONE",
  "TWO",
  "THREE",
  "FOUR",
  "FIVE",
  "SIX",
  "SEVEN",
  "EIGHT",
  "NINE",
];

function makeDefaultBindings(): Binding[] {
  return [
    {
      id: crypto.randomUUID(),
      pattern: ["R"],
      label: "Right",
      action: {
        type: "key",
        key: "RIGHT",
      },
    },
    {
      id: crypto.randomUUID(),
      pattern: ["R'"],
      label: "Left",
      action: {
        type: "key",
        key: "LEFT",
      },
    },
    {
      id: crypto.randomUUID(),
      pattern: ["U"],
      label: "Up",
      action: {
        type: "key",
        key: "UP",
      },
    },
    {
      id: crypto.randomUUID(),
      pattern: ["U'"],
      label: "Down",
      action: {
        type: "key",
        key: "DOWN",
      },
    },
    {
      id: crypto.randomUUID(),
      pattern: ["F"],
      label: "Space",
      action: {
        type: "key",
        key: "SPACE",
      },
    },
    {
      id: crypto.randomUUID(),
      pattern: ["R", "U", "R'", "U'"],
      label: isWindows ? "Open Notepad" : "Open Spotify",
      action: {
        type: "app",
        app: isWindows ? "notepad.exe" : "Spotify",
      },
    },
    {
      id: crypto.randomUUID(),
      pattern: ["L", "L"],
      label: isWindows ? "Windows Search" : "Spotlight",
      action: {
        type: "shortcut",
        key: isWindows ? "S" : "SPACE",
        modifiers: ["command"],
      },
    },
    {
      id: crypto.randomUUID(),
      pattern: ["D", "D"],
      label: "Open ChatGPT",
      action: {
        type: "url",
        url: "https://chatgpt.com",
      },
    },
  ];
}

function createDefaultConfig(): CubeConfig {
  const desktopId = crypto.randomUUID();

  return {
    activeProfileId: desktopId,

    profiles: [
      {
        id: desktopId,
        name: "Desktop",
        bindings: makeDefaultBindings(),
      },
    ],
  };
}

let config = loadConfig();

let connection: SmartCubeConnection | null = null;

let sequenceBuffer: string[] = [];
let sequenceTimer: number | undefined;

const SEQUENCE_TIMEOUT = 550;

/*
 * Binding editor state
 */
let editingBindingId: string | null = null;
let recording = false;
let recordedMoves: string[] = [];

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <main>
    <header>
      <div>
        <h1>Cube Controller</h1>
        <p>Rubik's Connected → ${isWindows ? "Windows" : "macOS"}</p>
      </div>

      <div class="connection">
        <span id="indicator"></span>

        <span id="status">
          Disconnected
        </span>

        <button id="connect">
          Connect
        </button>
      </div>
    </header>

    <p id="action-status" role="status" aria-live="polite"></p>
    <section class="live">
      <div class="move-card">
        <span>LAST MOVE</span>
        <strong id="move">—</strong>
      </div>

      <div class="sequence-card">
        <span>SEQUENCE BUFFER</span>
        <strong id="sequence">—</strong>
      </div>
    </section>

    <div class="profile-bar">
      <div class="profile-select">
        <label for="profile">
          Profile
        </label>

        <select id="profile"></select>
      </div>

      <div class="profile-buttons">
        <button id="import-config" class="secondary" type="button">Import profiles</button>
        <button id="export-config" class="secondary" type="button">Export profiles</button>
        <input id="import-file" type="file" accept="application/json,.json" hidden />
        <button
          id="rename-profile"
          class="secondary"
          type="button"
        >
          Rename
        </button>

        <button
          id="duplicate-profile"
          class="secondary"
          type="button"
        >
          Duplicate
        </button>

        <button
          id="delete-profile"
          class="secondary"
          type="button"
        >
          Delete
        </button>

        <button
          id="new-profile"
          class="primary"
          type="button"
        >
          + New Profile
        </button>
      </div>
    </div>

    <section>
      <div class="section-header">
        <div>
          <h2>Bindings</h2>

          <p class="section-description">
            Click a binding to edit it.
          </p>
        </div>

        <div class="section-actions">
          <button
            id="reset"
            class="secondary"
          >
            Reset profile
          </button>

          <button
            id="add-binding"
            class="primary"
          >
            + Add Binding
          </button>
        </div>
      </div>

      <div id="bindings"></div>
    </section>

    <section>
      <h2>Move History</h2>
      <div id="history"></div>
    </section>
  </main>

  <dialog id="binding-dialog">
    <form id="binding-form">
      <div class="dialog-header">
        <div>
          <h2 id="dialog-title">
            Add Binding
          </h2>

          <p>
            Record an input on the cube, then choose
            what it should do.
          </p>
        </div>

        <button
          type="button"
          id="close-dialog"
          class="icon-button"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div class="editor-section">
        <label class="field-label">
          Cube input
        </label>

        <div
          id="record-display"
          class="record-display"
        >
          <span id="record-placeholder">
            No moves recorded
          </span>

          <div id="recorded-moves"></div>
        </div>

        <div class="record-controls">
          <button
            type="button"
            id="record"
            class="record-button"
          >
            ● Record
          </button>

          <button
            type="button"
            id="clear-recording"
            class="secondary"
          >
            Clear
          </button>
        </div>

        <label for="pattern">
          Sequence
        </label>

        <input
          id="pattern"
          name="pattern"
          type="text"
          placeholder="R U R' U'"
          autocomplete="off"
        />

        <p class="field-help">
          Record this using the cube or type it manually.
        </p>
      </div>

      <div class="editor-section">
        <label for="binding-label">
          Name
        </label>

        <input
          id="binding-label"
          name="binding-label"
          type="text"
          placeholder="Open Spotify"
          autocomplete="off"
        />
      </div>

      <div class="editor-section">
        <label for="action-type">
          Action
        </label>

        <select id="action-type">
          <option value="media">Media Control</option>
          <option value="key">
            Press key
          </option>

          <option value="shortcut">
            Keyboard shortcut
          </option>

          <option value="app">
            Launch application
          </option>

          <option value="url">
            Open website
          </option>

          <option value="terminal">
            Terminal command
          </option>

          <option value="background">
            Background command
          </option>
        </select>

        <div id="action-editor"></div>
      </div>

      <div
        id="editor-error"
        class="editor-error"
        role="alert"
      ></div>

      <div class="dialog-footer">
        <button
          type="button"
          id="delete-binding"
          class="danger"
        >
          Delete
        </button>

        <div class="footer-right">
          <button
            type="button"
            id="cancel-binding"
            class="secondary"
          >
            Cancel
          </button>

          <button
            type="submit"
            class="primary"
          >
            Save Binding
          </button>
        </div>
      </div>
    </form>
  </dialog>
`;

/*
 * Main UI elements
 */

const connectButton =
  document.querySelector<HTMLButtonElement>("#connect")!;

const status =
  document.querySelector<HTMLSpanElement>("#status")!;

const indicator =
  document.querySelector<HTMLSpanElement>("#indicator")!;

const moveDisplay =
  document.querySelector<HTMLElement>("#move")!;

const sequenceDisplay =
  document.querySelector<HTMLElement>("#sequence")!;

const history =
  document.querySelector<HTMLDivElement>("#history")!;

const bindingsContainer =
  document.querySelector<HTMLDivElement>("#bindings")!;

const resetButton =
  document.querySelector<HTMLButtonElement>("#reset")!;

const addBindingButton =
  document.querySelector<HTMLButtonElement>("#add-binding")!;

/*
 * Profile UI
 */

const profileSelect =
  document.querySelector<HTMLSelectElement>("#profile")!;

const newProfileButton =
  document.querySelector<HTMLButtonElement>("#new-profile")!;

const renameProfileButton =
  document.querySelector<HTMLButtonElement>("#rename-profile")!;

const duplicateProfileButton =
  document.querySelector<HTMLButtonElement>("#duplicate-profile")!;

const deleteProfileButton =
  document.querySelector<HTMLButtonElement>("#delete-profile")!;

/*
 * Editor elements
 */

const dialog =
  document.querySelector<HTMLDialogElement>("#binding-dialog")!;

const bindingForm =
  document.querySelector<HTMLFormElement>("#binding-form")!;

const dialogTitle =
  document.querySelector<HTMLHeadingElement>("#dialog-title")!;

const closeDialogButton =
  document.querySelector<HTMLButtonElement>("#close-dialog")!;

const cancelBindingButton =
  document.querySelector<HTMLButtonElement>("#cancel-binding")!;

const deleteBindingButton =
  document.querySelector<HTMLButtonElement>("#delete-binding")!;

const recordButton =
  document.querySelector<HTMLButtonElement>("#record")!;

const clearRecordingButton =
  document.querySelector<HTMLButtonElement>("#clear-recording")!;

const recordedMovesContainer =
  document.querySelector<HTMLDivElement>("#recorded-moves")!;

const recordPlaceholder =
  document.querySelector<HTMLSpanElement>("#record-placeholder")!;

const patternInput =
  document.querySelector<HTMLInputElement>("#pattern")!;

const labelInput =
  document.querySelector<HTMLInputElement>("#binding-label")!;

const actionTypeSelect =
  document.querySelector<HTMLSelectElement>("#action-type")!;

const actionEditor =
  document.querySelector<HTMLDivElement>("#action-editor")!;

const editorError =
  document.querySelector<HTMLDivElement>("#editor-error")!;

/*
 * Main event listeners
 */

connectButton.addEventListener(
  "click",
  connectCube,
);

addBindingButton.addEventListener(
  "click",
  () => {
    openEditor();
  },
);

resetButton.addEventListener(
  "click",
  () => {
    const profile = getActiveProfile();

    const confirmed = confirm(
      `Reset "${profile.name}" to the default bindings?`,
    );

    if (!confirmed) {
      return;
    }

    profile.bindings =
      makeDefaultBindings();

    resetSequence();

    saveConfig();
    renderBindings();
  },
);

/*
 * Profile listeners
 */

profileSelect.addEventListener(
  "change",
  () => {
    config.activeProfileId =
      profileSelect.value;

    resetSequence();

    saveConfig();
    renderBindings();
  },
);

newProfileButton.addEventListener(
  "click",
  async () => {
    const name = await requestText(
      "Profile name:",
      "New Profile",
    );

    if (!name?.trim()) {
      return;
    }

    const id = crypto.randomUUID();

    config.profiles.push({
      id,
      name: name.trim(),
      bindings: [],
    });

    config.activeProfileId = id;

    resetSequence();

    saveConfig();
    renderProfiles();
    renderBindings();
  },
);

duplicateProfileButton.addEventListener(
  "click",
  async () => {
    const current =
      getActiveProfile();

    const name = await requestText(
      "Name for duplicated profile:",
      `${current.name} Copy`,
    );

    if (!name?.trim()) {
      return;
    }

    const id = crypto.randomUUID();

    const copiedBindings =
      structuredClone(
        current.bindings,
      ).map((binding) => ({
        ...binding,
        id: crypto.randomUUID(),
      }));

    config.profiles.push({
      id,
      name: name.trim(),
      bindings: copiedBindings,
    });

    config.activeProfileId = id;

    resetSequence();

    saveConfig();
    renderProfiles();
    renderBindings();
  },
);

renameProfileButton.addEventListener(
  "click",
  async () => {
    const profile =
      getActiveProfile();

    const name = await requestText(
      "Profile name:",
      profile.name,
    );

    if (!name?.trim()) {
      return;
    }

    profile.name = name.trim();

    saveConfig();
    renderProfiles();
  },
);

deleteProfileButton.addEventListener(
  "click",
  () => {
    if (
      config.profiles.length <= 1
    ) {
      return;
    }

    const profile =
      getActiveProfile();

    const confirmed = confirm(
      `Delete profile "${profile.name}"?`,
    );

    if (!confirmed) {
      return;
    }

    config.profiles =
      config.profiles.filter(
        (item) =>
          item.id !== profile.id,
      );

    config.activeProfileId =
      config.profiles[0].id;

    resetSequence();

    saveConfig();
    renderProfiles();
    renderBindings();
  },
);

/*
 * Binding editor listeners
 */

closeDialogButton.addEventListener(
  "click",
  closeEditor,
);

cancelBindingButton.addEventListener(
  "click",
  closeEditor,
);

recordButton.addEventListener(
  "click",
  () => {
    recording
      ? stopRecording()
      : startRecording();
  },
);

clearRecordingButton.addEventListener(
  "click",
  () => {
    recordedMoves = [];
    patternInput.value = "";
    renderRecordedMoves();
  },
);

patternInput.addEventListener(
  "input",
  () => {
    recordedMoves =
      parsePattern(
        patternInput.value,
      );

    renderRecordedMoves();
  },
);

actionTypeSelect.addEventListener(
  "change",
  () => {
    renderActionEditor(
      actionTypeSelect.value as Action["type"],
    );
  },
);

deleteBindingButton.addEventListener(
  "click",
  deleteCurrentBinding,
);

bindingForm.addEventListener(
  "submit",
  (event) => {
    event.preventDefault();

    saveEditorBinding();
  },
);

/*
 * Bluetooth
 */

async function connectCube() {
  connectButton.disabled = true;
  try {
    status.textContent =
      "Connecting...";

    connection =
      await connectSmartCube();

    status.textContent =
      "Connected";

    indicator.classList.add(
      "connected",
    );

    connectButton.disabled = true;

    connection.events$.subscribe(
      (event: SmartCubeEvent) => {
        if (event.type === "DISCONNECT") {
          connection = null;
          stopRecording();
          resetSequence();
          connectButton.disabled = false;
          status.textContent = "Disconnected";
          indicator.classList.remove("connected");
          return;
        }
        if (event.type !== "MOVE") {
          return;
        }

        receiveMove(event.move);
      },
    );
  } catch (error) {
    console.error(error);
    connectButton.disabled = false;

    status.textContent =
      "Connection failed";
  }
}

function receiveMove(move: string) {
  moveDisplay.textContent = move;

  addHistory(move);

  /*
   * While recording a new binding,
   * don't execute any computer actions.
   */
  if (recording) {
    recordedMoves.push(move);

    patternInput.value =
      recordedMoves.join(" ");

    renderRecordedMoves();

    return;
  }

  sequenceBuffer.push(move);

  updateSequenceDisplay();

  resolveSequenceBuffer();
}

/*
 * Sequence engine
 */

function resolveSequenceBuffer() {
  if (
    sequenceTimer !== undefined
  ) {
    clearTimeout(sequenceTimer);
  }

  const bindings =
    getActiveProfile().bindings;

  const sequenceBindings =
    bindings.filter(
      (binding) =>
        binding.pattern.length > 1,
    );

  const exactMatch =
    sequenceBindings.find(
      (binding) =>
        arraysEqual(
          binding.pattern,
          sequenceBuffer,
        ),
    );

  if (exactMatch) {
    executeAction(
      exactMatch.action,
    );

    flashBinding(
      exactMatch.id,
    );

    sequenceBuffer = [];

    updateSequenceDisplay();

    return;
  }

  const stillPossible =
    sequenceBindings.some(
      (binding) =>
        beginsWith(
          binding.pattern,
          sequenceBuffer,
        ),
    );

  if (stillPossible) {
    sequenceTimer =
      window.setTimeout(
        flushSequenceBuffer,
        SEQUENCE_TIMEOUT,
      );

    return;
  }

  const firstMove =
    sequenceBuffer.shift();

  if (firstMove) {
    executeSingleMove(
      firstMove,
    );
  }

  if (
    sequenceBuffer.length > 0
  ) {
    resolveSequenceBuffer();
  } else {
    updateSequenceDisplay();
  }
}

function flushSequenceBuffer() {
  const pending =
    [...sequenceBuffer];

  sequenceBuffer = [];

  updateSequenceDisplay();

  for (const move of pending) {
    executeSingleMove(move);
  }
}

function resetSequence() {
  if (
    sequenceTimer !== undefined
  ) {
    clearTimeout(sequenceTimer);
    sequenceTimer = undefined;
  }

  sequenceBuffer = [];

  updateSequenceDisplay();
}

function executeSingleMove(
  move: string,
) {
  const binding =
    getActiveProfile()
      .bindings.find(
        (binding) =>
          binding.pattern.length === 1 &&
          binding.pattern[0] === move,
      );

  if (!binding) {
    return;
  }

  executeAction(
    binding.action,
  );

  flashBinding(
    binding.id,
  );
}

async function executeAction(
  action: Action,
) {
  const feedback = document.querySelector<HTMLElement>("#action-status")!;
  try {
    if (!window.cubeAPI) throw new Error("Open Cube Controller in the desktop app to run actions.");
    const response = await window.cubeAPI.executeAction(action);
    if (!response.ok) throw new Error(response.error);
    feedback.textContent = "";
  } catch (error) {
    feedback.textContent = error instanceof Error ? error.message : "Action failed";
    console.error("Action failed:", error);
  }
}

/*
 * Binding editor
 */

function openEditor(
  binding?: Binding,
) {
  stopRecording();

  editorError.textContent = "";

  if (binding) {
    editingBindingId =
      binding.id;

    dialogTitle.textContent =
      "Edit Binding";

    deleteBindingButton.hidden =
      false;

    recordedMoves =
      [...binding.pattern];

    patternInput.value =
      binding.pattern.join(" ");

    labelInput.value =
      binding.label;

    actionTypeSelect.value =
      binding.action.type;

    renderActionEditor(
      binding.action.type,
      binding.action,
    );
  } else {
    editingBindingId = null;

    dialogTitle.textContent =
      "Add Binding";

    deleteBindingButton.hidden =
      true;

    recordedMoves = [];

    patternInput.value = "";
    labelInput.value = "";

    actionTypeSelect.value =
      "key";

    renderActionEditor(
      "key",
    );
  }

  renderRecordedMoves();

  dialog.showModal();
}

function closeEditor() {
  stopRecording();

  editorError.textContent = "";

  dialog.close();
}

function startRecording() {
  if (!connection) {
    showEditorError(
      "Connect the cube before recording.",
    );

    return;
  }

  editorError.textContent = "";

  recordedMoves = [];

  patternInput.value = "";

  recording = true;
  resetSequence();

  recordButton.textContent =
    "■ Stop Recording";

  recordButton.classList.add(
    "recording",
  );

  renderRecordedMoves();
}

function stopRecording() {
  recording = false;

  recordButton.textContent =
    "● Record";

  recordButton.classList.remove(
    "recording",
  );
}

function renderRecordedMoves() {
  recordedMovesContainer.innerHTML =
    "";

  recordPlaceholder.hidden =
    recordedMoves.length > 0;

  for (
    const move of recordedMoves
  ) {
    const chip =
      document.createElement(
        "span",
      );

    chip.className =
      "move-chip";

    chip.textContent = move;

    recordedMovesContainer.append(
      chip,
    );
  }
}

function renderActionEditor(
  type: Action["type"],
  existing?: Action,
) {
  actionEditor.innerHTML = "";

  switch (type) {
    case "media": {
      const selected = existing?.type === "media" ? existing.action : "playPause";
      actionEditor.innerHTML = `<div class="action-fields"><label for="media-action">Media control</label>
        <select id="media-action">${MEDIA_ACTIONS.map(action =>
          `<option value="${action}" ${action === selected ? "selected" : ""}>${MEDIA_LABELS[action]}</option>`).join("")}</select></div>`;
      break;
    }
    case "key":
      renderKeyEditor(
        existing,
      );
      break;

    case "shortcut":
      renderShortcutEditor(
        existing,
      );
      break;

    case "app":
      renderAppEditor(
        existing,
      );
      break;

    case "url":
      renderUrlEditor(
        existing,
      );
      break;

    case "terminal":
      renderCommandEditor(
        "terminal",
        existing,
      );
      break;

    case "background":
      renderCommandEditor(
        "background",
        existing,
      );
      break;
  }
}

function renderKeyEditor(
  existing?: Action,
) {
  const selectedKey =
    existing?.type === "key"
      ? existing.key
      : "SPACE";

  actionEditor.innerHTML = `
    <div class="action-fields">
      <label for="key-select">
        Key
      </label>

      <select id="key-select">
        ${keyOptionsHtml(
          selectedKey,
        )}
      </select>
    </div>
  `;
}

function renderShortcutEditor(
  existing?: Action,
) {
  const selectedKey =
    existing?.type ===
    "shortcut"
      ? existing.key
      : "SPACE";

  const modifiers: Modifier[] =
    existing?.type ===
    "shortcut"
      ? existing.modifiers
      : ["command"];

  actionEditor.innerHTML = `
    <div class="action-fields">
      <label for="shortcut-key">
        Key
      </label>

      <select id="shortcut-key">
        ${keyOptionsHtml(
          selectedKey,
        )}
      </select>

      <fieldset>
        <legend>
          Modifiers
        </legend>

        <div class="modifier-grid">
          ${modifierCheckbox(
            "command",
            isWindows ? "Win" : "⌘ Command",
            modifiers.includes(
              "command",
            ),
          )}

          ${modifierCheckbox(
            "option",
            isWindows ? "Alt" : "⌥ Option",
            modifiers.includes(
              "option",
            ),
          )}

          ${modifierCheckbox(
            "control",
            "⌃ Control",
            modifiers.includes(
              "control",
            ),
          )}

          ${modifierCheckbox(
            "shift",
            "⇧ Shift",
            modifiers.includes(
              "shift",
            ),
          )}
        </div>
      </fieldset>
    </div>
  `;
}

function renderAppEditor(
  existing?: Action,
) {
  const value =
    existing?.type === "app"
      ? existing.app
      : "";

  actionEditor.innerHTML = `
    <div class="action-fields">
      <label for="app-name">
        ${isWindows ? "Executable name or path" : "Application name"}
      </label>

      <input
        id="app-name"
        type="text"
        placeholder="${isWindows ? "notepad.exe" : "Spotify"}"
        autocomplete="off"
      />

      <p class="field-help">
        ${isWindows ? "Use an executable on PATH or its full path, including spaces. Example: notepad.exe." : "Examples: Spotify, Terminal, Safari, Visual Studio Code."}
      </p>
    </div>
  `;

  const input =
    document.querySelector<HTMLInputElement>(
      "#app-name",
    )!;

  input.value = value;
}

function renderUrlEditor(
  existing?: Action,
) {
  const value =
    existing?.type === "url"
      ? existing.url
      : "https://";

  actionEditor.innerHTML = `
    <div class="action-fields">
      <label for="url-value">
        Website
      </label>

      <input
        id="url-value"
        type="url"
        placeholder="https://example.com"
        autocomplete="off"
      />
    </div>
  `;

  const input =
    document.querySelector<HTMLInputElement>(
      "#url-value",
    )!;

  input.value = value;
}

function renderCommandEditor(
  mode: "terminal" | "background",
  existing?: Action,
) {
  const matchingExisting =
    existing?.type === mode
      ? existing
      : undefined;

  const executable =
    matchingExisting
      ? matchingExisting.executable
      : "";

  const args =
    matchingExisting
      ? matchingExisting.args
          .map(
            formatArgument,
          )
          .join(" ")
      : "";

  const isBackground =
    mode === "background";

  actionEditor.innerHTML = `
    <div class="action-fields">
      <label for="command-executable">
        Executable
      </label>

      <input
        id="command-executable"
        type="text"
        placeholder="${
          isBackground
            ? (isWindows ? "hostname.exe" : "osascript")
            : "ssh"
        }"
        autocomplete="off"
      />

      <label for="command-args">
        Arguments
      </label>

      <input
        id="command-args"
        type="text"
        placeholder="${
          isBackground
            ? (isWindows ? "" : '-e &quot;tell application \\&quot;Spotify\\&quot; to next track&quot;')
            : "jeff"
        }"
        autocomplete="off"
      />

      <div class="terminal-example">
        <span>Example</span>

        <code>
          ${
            isBackground
              ? (isWindows ? "hostname.exe" : 'osascript -e \'tell application "Spotify" to next track\'')
              : "ssh jeff"
          }
        </code>

        <p>
          ${
            isBackground
              ? "Runs directly in the background with no Terminal window and no focus change."
              : `Opens ${isWindows ? "Windows Terminal or PowerShell" : "Terminal"} and runs the command there. Best for interactive commands such as SSH.`
          }
        </p>
      </div>

      <p class="field-help">
        Executable and arguments are stored separately.
      </p>
    </div>
  `;

  document.querySelector<HTMLInputElement>(
    "#command-executable",
  )!.value = executable;

  document.querySelector<HTMLInputElement>(
    "#command-args",
  )!.value = args;
}

function readActionFromEditor():
  | Action
  | null {
  const type =
    actionTypeSelect.value as
      Action["type"];

  switch (type) {
    case "media": {
      const action = document.querySelector<HTMLSelectElement>("#media-action")!.value;
      if (!(MEDIA_ACTIONS as readonly string[]).includes(action)) return null;
      return { type: "media", action: action as typeof MEDIA_ACTIONS[number] };
    }
    case "key": {
      const key =
        document.querySelector<HTMLSelectElement>(
          "#key-select",
        )?.value;

      if (!key) {
        showEditorError(
          "Choose a key.",
        );

        return null;
      }

      return {
        type: "key",
        key,
      };
    }

    case "shortcut": {
      const key =
        document.querySelector<HTMLSelectElement>(
          "#shortcut-key",
        )?.value;

      if (!key) {
        showEditorError(
          "Choose a shortcut key.",
        );

        return null;
      }

      const modifiers =
        Array.from(
          document.querySelectorAll<HTMLInputElement>(
            'input[name="modifier"]:checked',
          ),
        ).map(
          (checkbox) =>
            checkbox.value as Modifier,
        );

      if (
        modifiers.length === 0
      ) {
        showEditorError(
          "Choose at least one modifier.",
        );

        return null;
      }

      return {
        type: "shortcut",
        key,
        modifiers,
      };
    }

    case "app": {
      const app =
        document.querySelector<HTMLInputElement>(
          "#app-name",
        )?.value.trim();

      if (!app) {
        showEditorError(
          "Enter an application name.",
        );

        return null;
      }

      return {
        type: "app",
        app,
      };
    }

    case "url": {
      const value =
        document.querySelector<HTMLInputElement>(
          "#url-value",
        )?.value.trim();

      if (!value) {
        showEditorError(
          "Enter a URL.",
        );

        return null;
      }

      try {
        const url =
          new URL(value);

        if (
          url.protocol !==
            "http:" &&
          url.protocol !==
            "https:"
        ) {
          throw new Error();
        }

        return {
          type: "url",
          url: url.toString(),
        };
      } catch {
        showEditorError(
          "Enter a valid HTTP or HTTPS URL.",
        );

        return null;
      }
    }

    case "terminal":
    case "background": {
      const executable =
        document
          .querySelector<HTMLInputElement>(
            "#command-executable",
          )
          ?.value.trim();

      const rawArgs =
        document
          .querySelector<HTMLInputElement>(
            "#command-args",
          )
          ?.value.trim() ?? "";

      if (!executable) {
        showEditorError(
          "Enter an executable.",
        );

        return null;
      }

      try {
        validateExecutable(executable);
      } catch {
        showEditorError("Enter a valid executable name or path.");
        return null;
      }

      const args =
        parseArguments(rawArgs);

      if (args === null) {
        return null;
      }

      if (type === "terminal") {
        return {
          type: "terminal",
          executable,
          args,
        };
      }

      return {
        type: "background",
        executable,
        args,
      };
    }
  }
}

function saveEditorBinding() {
  editorError.textContent = "";

  const pattern =
    parsePattern(
      patternInput.value,
    );

  if (
    pattern.length === 0
  ) {
    showEditorError(
      "Record or enter at least one cube move.",
    );

    return;
  }

  const invalidMove =
    pattern.find(
      (move) =>
        !VALID_MOVES.has(move),
    );

  if (invalidMove) {
    showEditorError(
      `"${invalidMove}" is not a recognized cube move.`,
    );

    return;
  }

  const label =
    labelInput.value.trim();

  if (!label) {
    showEditorError(
      "Give the binding a name.",
    );

    return;
  }

  const bindings =
    getActiveProfile().bindings;

  const duplicate =
    bindings.find(
      (binding) =>
        binding.id !==
          editingBindingId &&
        arraysEqual(
          binding.pattern,
          pattern,
        ),
    );

  if (duplicate) {
    showEditorError(
      `That cube input is already bound to "${duplicate.label}".`,
    );

    return;
  }

  const action =
    readActionFromEditor();

  if (!action) {
    return;
  }

  if (editingBindingId) {
    const index =
      bindings.findIndex(
        (binding) =>
          binding.id ===
          editingBindingId,
      );

    if (index === -1) {
      showEditorError(
        "Could not find that binding.",
      );

      return;
    }

    bindings[index] = {
      id: editingBindingId,
      pattern,
      label,
      action,
    };
  } else {
    bindings.push({
      id: crypto.randomUUID(),
      pattern,
      label,
      action,
    });
  }

  saveConfig();
  renderBindings();
  closeEditor();
}

function deleteCurrentBinding() {
  if (
    !editingBindingId
  ) {
    return;
  }

  const profile =
    getActiveProfile();

  profile.bindings =
    profile.bindings.filter(
      (binding) =>
        binding.id !==
        editingBindingId,
    );

  saveConfig();
  renderBindings();
  closeEditor();
}

function showEditorError(
  message: string,
) {
  editorError.textContent =
    message;
}

/*
 * Profile helpers
 */

function getActiveProfile():
  Profile {
  let profile =
    config.profiles.find(
      (profile) =>
        profile.id ===
        config.activeProfileId,
    );

  if (!profile) {
    profile =
      config.profiles[0];

    if (!profile) {
      const fallback =
        createDefaultConfig();

      config = fallback;

      profile =
        fallback.profiles[0];
    }

    config.activeProfileId =
      profile.id;

    saveConfig();
  }

  return profile;
}

function renderProfiles() {
  profileSelect.innerHTML = "";

  for (
    const profile of
      config.profiles
  ) {
    const option =
      document.createElement(
        "option",
      );

    option.value =
      profile.id;

    option.textContent =
      profile.name;

    option.selected =
      profile.id ===
      config.activeProfileId;

    profileSelect.append(
      option,
    );
  }

  deleteProfileButton.disabled =
    config.profiles.length <= 1;
}

/*
 * Main bindings UI
 */

function renderBindings() {
  const bindings =
    getActiveProfile().bindings;

  bindingsContainer.innerHTML =
    "";

  if (
    bindings.length === 0
  ) {
    const empty =
      document.createElement(
        "div",
      );

    empty.className =
      "empty-state";

    empty.textContent =
      "No bindings in this profile yet. Add one to get started.";

    bindingsContainer.append(
      empty,
    );

    return;
  }

  for (
    const binding of bindings
  ) {
    const row =
      document.createElement(
        "button",
      );

    row.type = "button";

    row.className =
      "binding";

    row.dataset.binding =
      binding.id;

    const pattern =
      document.createElement(
        "div",
      );

    pattern.className =
      "pattern";

    pattern.textContent =
      binding.pattern.join(" ");

    const name =
      document.createElement(
        "div",
      );

    name.className =
      "binding-name";

    name.textContent =
      binding.label;

    const action =
      document.createElement(
        "div",
      );

    action.className =
      "action";

    action.textContent =
      describeAction(
        binding.action,
      );

    row.append(
      pattern,
      name,
      action,
    );

    row.addEventListener(
      "click",
      () =>
        openEditor(binding),
    );

    bindingsContainer.append(
      row,
    );
  }
}

function describeAction(
  action: Action,
) {
  switch (action.type) {
    case "media":
      return MEDIA_LABELS[action.action];
    case "key":
      return displayKey(
        action.key,
      );

    case "shortcut":
      return [
        ...action.modifiers.map(
          displayModifier,
        ),
        displayKey(
          action.key,
        ),
      ].join(" ");

    case "app":
      return `Open ${action.app}`;

    case "url":
      try {
        return `Open ${
          new URL(
            action.url,
          ).hostname
        }`;
      } catch {
        return "Open URL";
      }

    case "terminal":
      return `Terminal: ${[
        action.executable,
        ...action.args.map(
          formatArgument,
        ),
      ].join(" ")}`;

    case "background":
      return `Background: ${[
        action.executable,
        ...action.args.map(
          formatArgument,
        ),
      ].join(" ")}`;
  }
}

function displayModifier(
  modifier: Modifier,
) {
  switch (modifier) {
    case "command":
      return isWindows ? "Win" : "⌘";

    case "option":
      return isWindows ? "Alt" : "⌥";

    case "control":
      return "⌃";

    case "shift":
      return "⇧";
  }
}

function displayKey(
  key: string,
) {
  const names:
    Record<string, string> = {
      UP: "↑",
      DOWN: "↓",
      LEFT: "←",
      RIGHT: "→",
      SPACE: "Space",
      ENTER: isWindows ? "Enter" : "Return",
      ESCAPE: "Esc",
      DELETE: isWindows ? "Backspace" : "Delete",
      TAB: "Tab",
    };

  return names[key] ?? key;
}

function flashBinding(
  id: string,
) {
  const element =
    document.querySelector(
      `[data-binding="${id}"]`,
    );

  element?.classList.add(
    "active",
  );

  setTimeout(() => {
    element?.classList.remove(
      "active",
    );
  }, 250);
}

function addHistory(
  move: string,
) {
  const item =
    document.createElement(
      "span",
    );

  item.textContent = move;

  history.prepend(item);

  while (
    history.children.length > 30
  ) {
    history.lastElementChild?.remove();
  }
}

function updateSequenceDisplay() {
  sequenceDisplay.textContent =
    sequenceBuffer.length > 0
      ? sequenceBuffer.join(" ")
      : "—";
}

/*
 * Cube pattern helpers
 */

function parsePattern(
  value: string,
) {
  if (!value.trim()) {
    return [];
  }

  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(normalizeMove);
}

function normalizeMove(
  move: string,
) {
  return move
    .trim()
    .replace(/’/g, "'")
    .toUpperCase();
}

function arraysEqual(
  a: string[],
  b: string[],
) {
  return (
    a.length === b.length &&
    a.every(
      (value, index) =>
        value === b[index],
    )
  );
}

function beginsWith(
  pattern: string[],
  prefix: string[],
) {
  if (
    prefix.length >
    pattern.length
  ) {
    return false;
  }

  return prefix.every(
    (value, index) =>
      pattern[index] === value,
  );
}

/*
 * Action editor helpers
 */

function keyOptionsHtml(
  selected: string,
) {
  return KEY_OPTIONS
    .map(
      (key) => `
        <option
          value="${key}"
          ${
            key === selected
              ? "selected"
              : ""
          }
        >
          ${displayKey(key)}
        </option>
      `,
    )
    .join("");
}

function modifierCheckbox(
  value: Modifier,
  label: string,
  checked: boolean,
) {
  return `
    <label class="modifier">
      <input
        type="checkbox"
        name="modifier"
        value="${value}"
        ${
          checked
            ? "checked"
            : ""
        }
      />

      <span>${label}</span>
    </label>
  `;
}

function parseArguments(
  input: string,
): string[] | null {
  if (!input.trim()) {
    return [];
  }

  const args: string[] = [];

  let current = "";
  let quote:
    | "'"
    | '"'
    | null = null;

  let escaped = false;
  let argumentStarted = false;

  for (
    let i = 0;
    i < input.length;
    i++
  ) {
    const char = input[i];

    if (escaped) {
      current += char;
      escaped = false;
      argumentStarted = true;
      continue;
    }

    if (
      char === "\\" &&
      quote !== "'" &&
      (!isWindows || input[i + 1] === "\\" || input[i + 1] === '"' || input[i + 1] === "'" || /\s/.test(input[i + 1] ?? ""))
    ) {
      escaped = true;
      argumentStarted = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }

      argumentStarted = true;
      continue;
    }

    if (
      char === '"' ||
      char === "'"
    ) {
      quote = char;
      argumentStarted = true;
      continue;
    }

    if (
      /\s/.test(char)
    ) {
      if (argumentStarted) {
        args.push(current);
        current = "";
        argumentStarted = false;
      }

      continue;
    }

    current += char;
    argumentStarted = true;
  }

  if (escaped) {
    current += "\\";
  }

  if (quote) {
    showEditorError(
      "An argument has an unclosed quote.",
    );

    return null;
  }

  if (argumentStarted) {
    args.push(current);
  }

  return args;
}

function formatArgument(
  arg: string,
) {
  if (
    arg === "" ||
    /[\s"'\\]/.test(arg)
  ) {
    return `'${arg.replace(/'/g, `'\\''`)}'`;
  }

  return arg;
}

/*
 * Persistence
 */

function loadConfig(): CubeConfig {
  const stored =
    localStorage.getItem(
      CONFIG_KEY,
    );

  if (stored) {
    try {
      const parsed =
        JSON.parse(
          stored,
        ) as CubeConfig;

      if (
        Array.isArray(
          parsed.profiles,
        ) &&
        parsed.profiles.length > 0
      ) {
        return parsed;
      }
    } catch {
      // Fall through to migration/defaults.
    }
  }

  /*
   * Migration from the original
   * single-profile version.
   */
  const oldBindings =
    localStorage.getItem(
      "cube-bindings",
    );

  if (oldBindings) {
    try {
      const bindings =
        JSON.parse(
          oldBindings,
        ) as Binding[];

      if (
        Array.isArray(bindings)
      ) {
        const id =
          crypto.randomUUID();

        return {
          activeProfileId: id,

          profiles: [
            {
              id,
              name: "Desktop",
              bindings,
            },
          ],
        };
      }
    } catch {
      // Ignore bad legacy config.
    }
  }

  return createDefaultConfig();
}

function saveConfig() {
  localStorage.setItem(
    CONFIG_KEY,
    JSON.stringify(config),
  );
}

/*
 * Initial render
 */

renderProfiles();
renderBindings();
renderActionEditor("key");
setupBluetoothPicker();

dialog.addEventListener("cancel", stopRecording);
dialog.addEventListener("close", stopRecording);

document.querySelector("#export-config")!.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "cube-controller-profiles.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});
const importFile = document.querySelector<HTMLInputElement>("#import-file")!;
document.querySelector("#import-config")!.addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error("Configuration file is too large (maximum 5 MB).");
    const imported = parseImportedConfig(JSON.parse(await file.text()));
    // Merge with fresh IDs so existing profiles are never overwritten.
    for (const profile of imported.profiles) {
      const id = crypto.randomUUID();
      config.profiles.push({ ...profile, id, bindings: profile.bindings.map(binding => ({ ...binding, id: crypto.randomUUID() })) });
      if (profile.id === imported.activeProfileId) config.activeProfileId = id;
    }
    resetSequence();
    saveConfig();
    renderProfiles();
    renderBindings();
  } catch (error) {
    document.querySelector("#action-status")!.textContent = error instanceof Error ? error.message : "Import failed";
  } finally { importFile.value = ""; }
});
