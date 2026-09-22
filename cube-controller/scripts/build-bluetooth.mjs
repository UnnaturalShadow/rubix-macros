import { build } from 'esbuild';
import ts from 'typescript';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Build the original pinned library source without its Unix-only `rm -rf` prepare script.
// No protocol source is patched or replaced.
const root = resolve('node_modules/smartcube-web-bluetooth');
const pkg = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'));
const entry = `${root}/src/index.ts`;
for (const [format, output] of [['esm', pkg.module], ['cjs', pkg.main]]) {
  await build({ entryPoints: [entry], bundle: true, format, platform: 'browser',
    external: Object.keys(pkg.dependencies), outfile: resolve(root, output) });
}
const sources = readdirSync(`${root}/src`, { recursive: true })
  .filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts') && !/(^|[/\\])test[/\\]/.test(file))
  .map(file => resolve(root, 'src', file));
const program = ts.createProgram(sources, {
  target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
  declaration: true, emitDeclarationOnly: true, rootDir: `${root}/src`, outDir: `${root}/dist/types`,
  strict: true, skipLibCheck: true, types: ['web-bluetooth', 'node'],
});
const emitted = program.emit();
const diagnostics = [...ts.getPreEmitDiagnostics(program), ...emitted.diagnostics];
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: p => p, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n',
  }));
  process.exit(1);
}
