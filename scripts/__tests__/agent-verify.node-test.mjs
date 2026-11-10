import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout } from 'node:timers/promises';
import { runVerification } from '../agent-verify.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'agent-verify-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const lockPath = path.join(root, 'verify.lock');
  const logPath = path.join(root, 'commands.log');
  const script = path.join(root, 'fake-command.mjs');
  writeFileSync(
    script,
    `
import { appendFileSync, existsSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
const [log, label, code, gate] = process.argv.slice(2);
appendFileSync(log, label + ':start\\n');
if (gate) while (!existsSync(gate)) await setTimeout(10);
else await setTimeout(10);
appendFileSync(log, label + ':end\\n');
if (code === 'signal') process.kill(process.pid, 'SIGTERM');
else process.exitCode = Number(code);
`,
  );
  const command = (name, code = 0, gate) => [process.execPath, script, logPath, name, String(code), ...(gate ? [gate] : [])];
  const output = [];
  const options = { cwd: root, lockPath, log: (line) => output.push(line), error: (line) => output.push(line) };
  return { root, lockPath, logPath, command, options, output };
}

async function waitForFile(file) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (existsSync(file)) return;
    await setTimeout(10);
  }
  assert.fail(`Timed out waiting for fixture: ${file}`);
}

function launchVerification(options) {
  const module = new URL('../agent-verify.mjs', import.meta.url).href;
  const child = spawn(process.execPath, [
    '--input-type=module',
    '-e',
    `import { runVerification } from ${JSON.stringify(module)}; process.exitCode = await runVerification(${JSON.stringify(options)});`,
  ]);
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  const completed = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, output }));
  });
  return { child, completed };
}

test('runs checks sequentially and leaves preexisting artifacts untouched', async (t) => {
  const { root, lockPath, logPath, command, options } = fixture(t);
  for (const directory of ['build', 'dist']) {
    mkdirSync(path.join(root, directory));
    writeFileSync(path.join(root, directory, 'contributor.txt'), 'keep me');
  }
  const code = await runVerification({ ...options, commands: ['build', 'lint', 'type-check'].map((name) => command(name)) });
  assert.equal(code, 0);
  assert.equal(readFileSync(logPath, 'utf8'), 'build:start\nbuild:end\nlint:start\nlint:end\ntype-check:start\ntype-check:end\n');
  for (const directory of ['build', 'dist']) assert.equal(readFileSync(path.join(root, directory, 'contributor.txt'), 'utf8'), 'keep me');
  assert.equal(existsSync(lockPath), false);
});

test('preserves the first failure status and reports later failures after running remaining checks', async (t) => {
  const { lockPath, logPath, command, options, output } = fixture(t);
  const code = await runVerification({ ...options, commands: [command('build', 7), command('lint', 3), command('type-check')] });
  assert.equal(code, 7);
  assert.match(output.join('\n'), /build.*exit 7/);
  assert.match(output.join('\n'), /lint.*exit 3/);
  assert.match(output.join('\n'), /2 check\(s\) failed/);
  assert.match(readFileSync(logPath, 'utf8'), /type-check:end/);
  assert.equal(existsSync(lockPath), false);
});

test('missing executables return 127, report the error, and release the lock', async (t) => {
  const { root, lockPath, options, output } = fixture(t);
  const code = await runVerification({ ...options, commands: [[path.join(root, 'missing-command')]] });
  assert.equal(code, 127);
  assert.match(output.join('\n'), /ENOENT/);
  assert.equal(existsSync(lockPath), false);
});

test('reports subprocess signals with a nonzero status', async (t) => {
  const { lockPath, command, options, output } = fixture(t);
  const code = await runVerification({ ...options, commands: [command('build', 'signal')] });
  assert.equal(code, 143);
  assert.match(output.join('\n'), /signal SIGTERM/);
  assert.equal(existsSync(lockPath), false);
});

test('separate processes and worktrees share an atomic slot and busy attempts do no work', async (t) => {
  const { root, lockPath, logPath, command, options, output } = fixture(t);
  const gate = path.join(root, 'release-command');
  const first = launchVerification({ cwd: root, lockPath, commands: [command('build', 0, gate)] });
  t.after(() => first.child.kill('SIGTERM'));
  await waitForFile(logPath);
  const otherWorktree = path.join(root, 'other-worktree');
  mkdirSync(otherWorktree);
  const code = await runVerification({ ...options, cwd: otherWorktree, commands: [command('must-not-run')] });
  assert.equal(code, 75);
  assert.match(output.join('\n'), /slot busy/);
  assert.ok(output.some((line) => line.includes(root) && line.includes(`PID ${first.child.pid}`)));
  assert.equal(readFileSync(logPath, 'utf8'), 'build:start\n');
  assert.equal(existsSync(lockPath), true);
  writeFileSync(gate, 'continue');
  assert.equal((await first.completed).code, 0);
  assert.equal(existsSync(lockPath), false);
});

test('unknown or stale lock metadata is not removed automatically', async (t) => {
  const { lockPath, logPath, command, options } = fixture(t);
  mkdirSync(lockPath);
  writeFileSync(path.join(lockPath, 'owner.json'), '{unreadable');
  assert.equal(await runVerification({ ...options, commands: [command('must-not-run')] }), 75);
  assert.equal(existsSync(logPath), false);
  assert.equal(readFileSync(path.join(lockPath, 'owner.json'), 'utf8'), '{unreadable');
});

function writeOwner(lockPath, owner, command) {
  mkdirSync(lockPath);
  writeFileSync(path.join(lockPath, 'owner.json'), JSON.stringify({ cwd: '/killed-run', startedAt: '2026-01-01T00:00:00.000Z', token: 'killed-run', ...owner }));
  if (command !== undefined) writeFileSync(path.join(lockPath, 'command.pid'), command);
}

// The PID of a process that has already exited.
const exitedPid = () => spawnSync(process.execPath, ['-e', '']).pid;

test('a lock whose run and last command have exited is reclaimed', async (t) => {
  const { lockPath, logPath, command, options, output } = fixture(t);
  writeOwner(lockPath, { pid: exitedPid() }, String(exitedPid()));
  assert.equal(await runVerification({ ...options, commands: [command('build')] }), 0);
  assert.match(output.join('\n'), /Reclaimed an abandoned verification lock \(PID \d+, \/killed-run/);
  assert.equal(readFileSync(logPath, 'utf8'), 'build:start\nbuild:end\n');
  assert.equal(existsSync(lockPath), false);
});

test('a lock is kept while the command of a killed run is still running', async (t) => {
  const { lockPath, logPath, command, options } = fixture(t);
  const orphan = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
  const orphanExited = new Promise((resolve) => orphan.once('exit', resolve));
  t.after(() => orphan.kill('SIGKILL'));
  writeOwner(lockPath, { pid: exitedPid() }, String(orphan.pid));
  assert.equal(await runVerification({ ...options, commands: [command('must-not-run')] }), 75);
  assert.equal(existsSync(logPath), false);
  assert.equal(existsSync(path.join(lockPath, 'owner.json')), true);
  orphan.kill('SIGKILL');
  await orphanExited;
  assert.equal(await runVerification({ ...options, commands: [command('build')] }), 0);
  assert.equal(readFileSync(logPath, 'utf8'), 'build:start\nbuild:end\n');
});

test('a lock without command details is never reclaimed automatically', async (t) => {
  const { lockPath, logPath, command, options } = fixture(t);
  writeOwner(lockPath, { pid: exitedPid() });
  assert.equal(await runVerification({ ...options, commands: [command('must-not-run')] }), 75);
  assert.equal(existsSync(logPath), false);
  assert.equal(existsSync(path.join(lockPath, 'owner.json')), true);
});

test('a replaced lock is preserved and reported as a failure', async (t) => {
  const { root, lockPath, logPath, command, options, output } = fixture(t);
  const gate = path.join(root, 'release-command');
  const completion = runVerification({ ...options, commands: [command('build', 0, gate)] });
  await waitForFile(logPath);
  const ownerPath = path.join(lockPath, 'owner.json');
  const replacement = JSON.stringify({ token: 'another-owner' });
  writeFileSync(ownerPath, replacement);
  writeFileSync(gate, 'continue');
  assert.equal(await completion, 1);
  assert.match(output.join('\n'), /lock ownership changed/);
  assert.equal(readFileSync(ownerPath, 'utf8'), replacement);
});

for (const [signal, code] of [
  ['SIGTERM', 143],
  ['SIGHUP', 129],
]) {
  test(`${signal} forwards to the active command, stops later checks, and releases the lock`, async (t) => {
    const { root, lockPath, logPath, command } = fixture(t);
    const gate = path.join(root, 'release-command');
    const run = launchVerification({ cwd: root, lockPath, commands: [command('build', 0, gate), command('must-not-run')] });
    t.after(() => run.child.kill('SIGKILL'));
    await waitForFile(logPath);
    run.child.kill(signal);
    await once(run.child, 'exit');
    // Let a command the run failed to stop finish, so the output pipes it inherited close.
    writeFileSync(gate, 'continue');
    const result = await run.completed;
    assert.equal(result.code, code);
    assert.match(result.output, new RegExp(`signal ${signal}`));
    assert.equal(readFileSync(logPath, 'utf8'), 'build:start\n');
    assert.equal(existsSync(lockPath), false);
  });
}
