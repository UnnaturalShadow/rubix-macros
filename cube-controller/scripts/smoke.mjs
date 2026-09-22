import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

// Uses a separate Chromium profile. No keystrokes/media commands are sent to the OS.
const profile = mkdtempSync(join(tmpdir(), 'cube-controller-smoke-'));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.CUBE_DEV_URL;
const runtime = await electron.launch({
  ...(process.env.CUBE_SMOKE_EXECUTABLE ? { executablePath: process.env.CUBE_SMOKE_EXECUTABLE } : {}),
  args: [...(process.env.CUBE_SMOKE_EXECUTABLE ? [] : ['.']), `--user-data-dir=${profile}`], env,
});
try {
  const page = await runtime.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await runtime.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
  await page.waitForSelector('#connect');
  assert.equal(await page.title(), 'Cube Controller');
  assert.equal(await page.locator('.binding').count(), 8);
  assert.deepEqual(await page.evaluate(() => ({ node: typeof window.require, secure: isSecureContext, bluetooth: !!navigator.bluetooth })),
    { node: 'undefined', secure: true, bluetooth: true });
  const preferences = await runtime.evaluate(({ BrowserWindow }) => {
    const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { sandbox: p.sandbox, contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration };
  });
  assert.deepEqual(preferences, { sandbox: true, contextIsolation: true, nodeIntegration: false });
  const rejected = await page.evaluate(() => window.cubeAPI.executeAction({ type: 'key', key: 'INVALID' }));
  assert.equal(rejected.ok, false);
  const rejectedLayer = await page.evaluate(() => window.cubeAPI.executeAction({ type: 'layer', layer: 'shift', mode: 'toggle' }));
  assert.equal(rejectedLayer.ok, false);
  assert.match(rejectedLayer.error, /handled in the controller/);
  assert.equal(await page.locator('#shift-status').textContent(), 'Shift: Off');
  // Exercise real IPC -> adapter -> child process without producing input or changing settings.
  if (process.platform === 'win32') {
    const helper = process.env.CUBE_SMOKE_EXECUTABLE
      ? join(resolve(process.env.CUBE_SMOKE_EXECUTABLE, '..'), 'resources', 'native', 'CubeInput.exe')
      : resolve('native/bin/CubeInput.exe');
    assert.deepEqual(await page.evaluate(executable => window.cubeAPI.executeAction({ type: 'background', executable, args: ['--self-test'] }), helper), { ok: true });
  } else {
    assert.deepEqual(await page.evaluate(() => window.cubeAPI.executeAction({ type: 'background', executable: '/usr/bin/true', args: [] })), { ok: true });
  }
  await page.locator('#new-profile').click();
  await page.locator('.utility-dialog input').fill('Smoke profile');
  await page.locator('.utility-dialog button[type=submit]').click();
  await page.locator('#profile option:checked').filter({ hasText: 'Smoke profile' }).waitFor({ state: 'attached' });
  assert.equal(await page.locator('#profile option:checked').textContent(), 'Smoke profile');
  await page.locator('#rename-profile').click();
  await page.locator('.utility-dialog input').fill('Renamed profile');
  await page.locator('.utility-dialog button[type=submit]').click();
  await page.locator('#profile option:checked').filter({ hasText: 'Renamed profile' }).waitFor({ state: 'attached' });
  await page.locator('#add-binding').click();
  await page.locator('#pattern').fill('B');
  await page.locator('#binding-label').fill('Music');
  await page.locator('#action-type').selectOption('media');
  await page.locator('#media-action').selectOption('nextTrack');
  await page.locator('#binding-form button[type=submit]').click();
  assert.equal(await page.locator('.binding .action').textContent(), 'Next track');
  await page.reload();
  await page.waitForSelector('.binding');
  assert.equal(await page.locator('#profile option:checked').textContent(), 'Renamed profile');
  assert.equal(await page.locator('.binding .action').textContent(), 'Next track');

  await page.locator('#add-binding').click();
  await page.locator('#pattern').fill('F');
  await page.locator('#binding-label').fill('Shift once');
  await page.locator('#action-type').selectOption('layer');
  await page.locator('#shift-mode').selectOption('oneshot');
  await page.locator('#binding-form button[type=submit]').click();
  await page.reload();
  await page.locator('.binding').filter({ hasText: 'Shift once' }).click();
  assert.equal(await page.locator('#action-type').inputValue(), 'layer');
  assert.equal(await page.locator('#shift-mode').inputValue(), 'oneshot');
  await page.locator('#cancel-binding').click();
  assert.equal(await page.locator('#shift-status').textContent(), 'Shift: Off');

  await page.locator('#add-binding').click();
  await page.locator('#pattern').fill('U');
  await page.locator('#binding-label').fill('Slash key');
  await page.locator('#key-select').selectOption('SLASH');
  await page.locator('#binding-form button[type=submit]').click();
  await page.reload();
  await page.locator('.binding').filter({ hasText: 'Slash key' }).click();
  assert.equal(await page.locator('#key-select').inputValue(), 'SLASH');
  assert.equal(await page.locator('#key-select option[value="NUMPAD_ENTER"]').count(), 1);
  assert.equal(await page.locator('#key-select option[value="F12"]').count(), 1);
  await page.locator('#cancel-binding').click();

  await runtime.evaluate(({ BrowserWindow }) => {
    globalThis.smokeSelectedDevice = null;
    BrowserWindow.getAllWindows()[0].webContents.emit('select-bluetooth-device', { preventDefault() {} },
      [{ deviceId: 'test-cube', deviceName: 'Rubiks Connected (simulated)' }], id => { globalThis.smokeSelectedDevice = id; });
  });
  await page.getByRole('button', { name: 'Rubiks Connected (simulated)' }).click();
  assert.equal(await runtime.evaluate(() => globalThis.smokeSelectedDevice), 'test-cube');

  const untrusted = await runtime.evaluate(async ({ BrowserWindow }, preload) => {
    const other = new BrowserWindow({ show: false, webPreferences: { preload, sandbox: true, contextIsolation: true } });
    try {
      await other.loadURL('data:text/html,<h1>Untrusted test document</h1>');
      return await other.webContents.executeJavaScript(`Promise.resolve().then(() => window.cubeAPI.executeAction({type:'key',key:'A'})).then(() => 'allowed', e => e.message)`);
    } finally { other.destroy(); }
  }, resolve('dist-electron/preload.cjs'));
  assert.match(untrusted, /Untrusted IPC sender/);
  assert.deepEqual(errors, []);
  console.log('Electron smoke checks passed: secure renderer, IPC validation/execution, profiles, expanded key/media/Shift editors, persistence, local-only layers, device chooser, rejected foreign sender.');
} finally {
  await runtime.close();
}
