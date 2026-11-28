import { spawn } from 'node:child_process';

const children = [];

function start(name, args) {
  const child = spawn(process.execPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  children.push(child);
  const prefix = `[${name}] `;
  child.stdout.on('data', (chunk) => process.stdout.write(prefix + chunk.toString()));
  child.stderr.on('data', (chunk) => process.stderr.write(prefix + chunk.toString()));
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) console.error(`${prefix}beendet mit Code ${code}`);
  });
  return child;
}

start('api', ['server.mjs']);
start('web', ['node_modules/vite/bin/vite.js']);

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});
process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});
