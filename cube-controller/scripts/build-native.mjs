import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

mkdirSync('native/bin', { recursive: true });
if (process.platform === 'win32') {
  const compiler = join(process.env.SystemRoot ?? 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  execFileSync(compiler, ['/nologo', '/target:winexe', '/platform:anycpu', '/optimize+', `/out:${resolve('native/bin/CubeInput.exe')}`, resolve('native/windows/CubeInput.cs')], { stdio: 'inherit' });
  execFileSync(resolve('native/bin/CubeInput.exe'), ['--self-test'], { stdio: 'inherit' });
} else if (process.platform === 'darwin') {
  execFileSync('xcrun', ['clang', '-fobjc-arc', '-arch', 'arm64', '-arch', 'x86_64', '-mmacosx-version-min=12.0',
    '-framework', 'AppKit', '-framework', 'ApplicationServices', 'native/macos/cube-media.m', '-o', 'native/bin/cube-media'], { stdio: 'inherit' });
} else {
  console.warn(`No native action support for ${process.platform}; renderer/build checks are still available.`);
}
