import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electron from 'electron';

const server = await createServer();
await server.listen();
const url = server.resolvedUrls.local[0];
const env = { ...process.env, CUBE_DEV_URL: url };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['.'], { stdio: 'inherit', env });
const close = async () => { await server.close(); };
child.once('exit', async code => { await close(); process.exit(code ?? 0); });
child.once('error', async error => { console.error(error); await close(); process.exit(1); });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill());
