import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, delimiter } from 'node:path';

const env = { ...process.env };
const cargoHome = resolve('.tools/cargo');
let cargo = 'cargo';
if (existsSync(resolve(cargoHome, 'bin/cargo'))) {
  env.CARGO_HOME = cargoHome;
  env.RUSTUP_HOME = resolve('.tools/rustup');
  env.PATH = `${resolve(cargoHome, 'bin')}${delimiter}${env.PATH ?? ''}`;
  cargo = resolve(cargoHome, 'bin/cargo');
}
const child = spawn(cargo, process.argv.slice(2), { env, stdio: 'inherit' });
child.on('error', () => { process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
