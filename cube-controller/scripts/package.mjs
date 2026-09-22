import { build, Platform } from 'electron-builder';
const target = process.argv[2];
if ((target === 'mac' && process.platform !== 'darwin') || (target === 'win' && process.platform !== 'win32')) {
  throw new Error('Package on the target OS so its native helper can be compiled. Use the CI build matrix for both targets.');
}
if (!['mac', 'win'].includes(target)) throw new Error('Expected mac or win');
await build({ targets: (target === 'mac' ? Platform.MAC : Platform.WINDOWS).createTarget() });
