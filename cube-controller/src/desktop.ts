// Electron has no window.prompt(). Keep name/PIN entry inside the existing UI.
export function requestText(label: string, initial = ""): Promise<string | null> {
  return new Promise(resolve => {
    const dialog = document.createElement("dialog");
    const form = document.createElement("form");
    form.className = "utility-dialog";
    const heading = document.createElement("label");
    heading.textContent = label;
    const input = document.createElement("input");
    input.value = initial;
    input.autofocus = true;
    heading.append(input);
    const buttons = document.createElement("div");
    buttons.className = "dialog-footer";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    const save = document.createElement("button");
    save.type = "submit";
    save.textContent = "OK";
    let value: string | null = null;
    form.onsubmit = event => { event.preventDefault(); value = input.value; dialog.close(); };
    cancel.onclick = () => dialog.close();
    dialog.onclose = () => { dialog.remove(); resolve(value); };
    buttons.append(cancel, save);
    form.append(heading, buttons);
    dialog.append(form);
    document.body.append(dialog);
    dialog.showModal();
    input.select();
  });
}

export function setupBluetoothPicker() {
  const api = window.cubeAPI;
  if (!api) return;
  const dialog = document.createElement("dialog");
  dialog.className = "utility-dialog";
  const title = document.createElement("h2");
  title.textContent = "Choose your cube";
  const hint = document.createElement("p");
  hint.textContent = "Turn a face to wake the cube. Scanning stops after 30 seconds.";
  const list = document.createElement("div");
  list.className = "device-list";
  const cancel = document.createElement("button");
  cancel.textContent = "Cancel";
  cancel.onclick = () => { void api.selectBluetoothDevice(""); dialog.close(); };
  dialog.oncancel = () => { void api.selectBluetoothDevice(""); };
  dialog.append(title, hint, list, cancel);
  document.body.append(dialog);

  const pairDialog = document.createElement("dialog");
  pairDialog.className = "utility-dialog";
  document.body.append(pairDialog);
  pairDialog.oncancel = () => { void api.respondToPairing({ confirmed: false }); };
  api.onBluetoothDevices(devices => {
    list.replaceChildren();
    for (const device of devices) {
      const button = document.createElement("button");
      button.textContent = device.deviceName || `Cube (${device.deviceId})`;
      button.onclick = () => { void api.selectBluetoothDevice(device.deviceId); dialog.close(); };
      list.append(button);
    }
    if (!dialog.open) dialog.showModal();
  });
  api.onBluetoothClosed(() => { dialog.close(); pairDialog.close(); });
  api.onPairingRequest(request => {
    pairDialog.replaceChildren();
    const form = document.createElement("form");
    const label = document.createElement("p");
    label.textContent = request.pairingKind === "confirmPin" ? `Confirm that the cube shows PIN ${request.pin}.`
      : request.pairingKind === "providePin" ? "Enter the cube's pairing PIN." : "Pair with the selected cube?";
    const pin = document.createElement("input");
    pin.maxLength = 16;
    pin.hidden = request.pairingKind !== "providePin";
    pin.setAttribute("aria-label", "Pairing PIN");
    const accept = document.createElement("button");
    accept.type = "submit";
    accept.textContent = "Pair";
    const reject = document.createElement("button");
    reject.type = "button";
    reject.textContent = "Cancel";
    reject.onclick = () => { void api.respondToPairing({ confirmed: false }); pairDialog.close(); };
    form.onsubmit = event => {
      event.preventDefault();
      if (!pin.hidden && !pin.value.trim()) return;
      void api.respondToPairing({ confirmed: true, ...(!pin.hidden ? { pin: pin.value.trim() } : {}) });
      pairDialog.close();
    };
    form.append(label, pin, accept, reject);
    pairDialog.append(form);
    pairDialog.showModal();
  });
}
