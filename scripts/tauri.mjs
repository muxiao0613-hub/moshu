import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, delimiter } from 'node:path';

// A project-local toolchain is optional; a normal rustup installation also works.
const localCargo = resolve('.tools/cargo');
const env = { ...process.env };
if (existsSync(resolve(localCargo, 'bin/cargo'))) {
  env.CARGO_HOME = localCargo;
  env.RUSTUP_HOME = resolve('.tools/rustup');
  env.PATH = `${resolve(localCargo, 'bin')}${delimiter}${env.PATH ?? ''}`;
}
const child = spawn(process.execPath, [resolve('node_modules/@tauri-apps/cli/tauri.js'), ...process.argv.slice(2)], {
  env, stdio: 'inherit',
});
child.on('error', () => { process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
