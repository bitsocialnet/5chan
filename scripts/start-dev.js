import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const usePortless = process.env.PORTLESS !== '0' && !isWindows;
const binDir = join(process.cwd(), 'node_modules', '.bin');
const executableSuffix = isWindows ? '.cmd' : '';
const portlessBin = join(binDir, `portless${executableSuffix}`);
const viteBin = join(binDir, `vite${executableSuffix}`);

const command = usePortless && existsSync(portlessBin) ? portlessBin : viteBin;
const args =
  command === portlessBin
    ? ['5chan', 'vite']
    : ['--host', '5chan.localhost', '--port', '1355', '--strictPort'];

if (command !== portlessBin && process.env.PORTLESS !== '0') {
  console.warn('portless unavailable on this platform, using vite directly on http://5chan.localhost:1355');
}

const child = spawn(command, args, {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

