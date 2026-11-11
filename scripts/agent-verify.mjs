#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import spawn from 'cross-spawn';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { constants, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Every checkout uses the same slot; this is deliberately outside the repo.
export const verificationLockPath = path.join(tmpdir(), '5chan-agent-verify.lock');
// perf:startup-bytes reads build/, so it runs right after build, as in CI's Build + Smoke job.
const defaultCommands = ['build', 'perf:startup-bytes', 'lint', 'type-check', 'doctor:check', 'perf:check'].map((name) => ['corepack', 'yarn', name]);
const signalExitCode = (signal) => 128 + (constants.signals[signal] || 1);
const reclaimMutexTimeoutMs = 10_000;

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}

// A force-killed run cannot release its lock, and its detached commands outlive it.
// command.pid holds the process group of the run's latest command ('' before the first,
// 'starting' while one is being started); the lock is abandoned only when the run and that
// group have both exited. Unreadable or missing details keep the lock.
function isAbandoned(lockPath, details) {
  if (!Number.isInteger(details?.pid) || typeof details.token !== 'string' || processExists(details.pid)) return false;
  let command;
  try {
    command = readFileSync(path.join(lockPath, 'command.pid'), 'utf8').trim();
  } catch {
    return false;
  }
  if (!command) return true;
  const pid = Number(command);
  return Number.isInteger(pid) && pid > 0 && !processExists(process.platform === 'win32' ? pid : -pid);
}

function readOwner(lockPath) {
  try {
    return JSON.parse(readFileSync(path.join(lockPath, 'owner.json'), 'utf8'));
  } catch {
    // A concurrent owner may still be writing its metadata. Do not steal it.
    return undefined;
  }
}

function takeReclaimMutex(mutexPath) {
  try {
    mkdirSync(mutexPath);
    return true;
  } catch (error) {
    if (error.code !== 'EEXIST') return false;
  }
  // A reclaim holds the mutex for milliseconds; one left by a killed run is broken once it is old.
  try {
    if (Date.now() - statSync(mutexPath).mtimeMs < reclaimMutexTimeoutMs) return false;
    rmdirSync(mutexPath);
    mkdirSync(mutexPath);
    return true;
  } catch {
    return false;
  }
}

// The verdict can be out of date by the time it is acted on: another run may have reclaimed the
// lock and taken the slot since. Reclaims take turns through a mutex, and each one removes the lock
// only if it is still the abandoned one, so a lock another run has just taken is never touched.
// A mutex held by another run means that run is reclaiming, so this one reports busy.
function reclaimAbandonedLock(lockPath, token) {
  const mutexPath = `${lockPath}.reclaim`;
  if (!takeReclaimMutex(mutexPath)) return false;
  try {
    const details = readOwner(lockPath);
    if (details?.token !== token || !isAbandoned(lockPath, details)) return false;
    rmSync(lockPath, { recursive: true, force: true });
    return true;
  } finally {
    try {
      rmdirSync(mutexPath);
    } catch {
      // Already broken by another run.
    }
  }
}

function acquireLock(lockPath, cwd, log, reclaim = true) {
  try {
    mkdirSync(lockPath, { mode: 0o700 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const details = readOwner(lockPath);
    const owner = details ? `PID ${details.pid}, ${details.cwd}, started ${details.startedAt}` : 'owner details unavailable';
    if (reclaim && isAbandoned(lockPath, details) && reclaimAbandonedLock(lockPath, details.token)) {
      log(`[agent verify] Reclaimed an abandoned verification lock (${owner}); that run and its last command have exited.`);
      return acquireLock(lockPath, cwd, log, false);
    }
    throw Object.assign(new Error(`Verification slot busy (${owner}). Lock: ${lockPath}. Retry after that run finishes; inspect stale locks before removing them.`), {
      code: 'LOCK_BUSY',
    });
  }

  const ownerPath = path.join(lockPath, 'owner.json');
  const commandPath = path.join(lockPath, 'command.pid');
  const token = randomUUID();
  try {
    writeFileSync(ownerPath, JSON.stringify({ pid: process.pid, cwd, startedAt: new Date().toISOString(), token }), { flag: 'wx' });
  } catch (error) {
    rmdirSync(lockPath);
    throw error;
  }
  const recordCommand = (pid) => {
    try {
      writeFileSync(commandPath, String(pid ?? ''));
    } catch {
      // Without command details the lock is never reclaimed automatically; release reports a lost lock.
    }
  };
  recordCommand();
  return {
    recordCommand,
    release: () => {
      // Never remove a lock that has been replaced by another invocation.
      if (JSON.parse(readFileSync(ownerPath, 'utf8')).token !== token) throw new Error(`Verification lock ownership changed: ${lockPath}`);
      rmSync(commandPath, { force: true });
      unlinkSync(ownerPath);
      rmdirSync(lockPath);
    },
  };
}

export async function runVerification({ cwd = repoRoot, lockPath = verificationLockPath, commands = defaultCommands, log = console.log, error = console.error } = {}) {
  let release;
  let recordCommand;
  try {
    ({ release, recordCommand } = acquireLock(lockPath, cwd, log));
  } catch (failure) {
    error(`[agent verify] ${failure.message}`);
    return failure.code === 'LOCK_BUSY' ? 75 : 1;
  }

  let child;
  let interrupted;
  let exitCode = 0;
  const failures = [];
  const forwardSignal = (signal) => {
    interrupted = signal;
    if (!child?.pid) return;
    try {
      if (process.platform === 'win32') {
        const result = spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        if (result.error || result.status !== 0) error(`[agent verify] Could not terminate command tree for PID ${child.pid}`);
      } else process.kill(-child.pid, signal);
    } catch (failure) {
      if (failure.code !== 'ESRCH') error(`[agent verify] Could not forward ${signal}: ${failure.message}`);
    }
  };
  const onInterrupt = () => forwardSignal('SIGINT');
  const onTerminate = () => forwardSignal('SIGTERM');
  // A closed terminal sends SIGHUP; detached commands would not receive it.
  const onHangup = () => forwardSignal('SIGHUP');
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onTerminate);
  process.on('SIGHUP', onHangup);

  try {
    for (const command of commands) {
      if (interrupted) break;
      const label = command.join(' ');
      log(`[agent verify] ${label} (${cwd})`);
      const result = await new Promise((resolve) => {
        // Until the new group is recorded, a run killed here must not look abandoned.
        recordCommand('starting');
        child = spawn(command[0], command.slice(1), { cwd, stdio: 'inherit', detached: process.platform !== 'win32' });
        recordCommand(child.pid);
        child.on('error', (failure) => resolve({ code: failure.code === 'ENOENT' ? 127 : 1, detail: failure.message }));
        child.on('close', (code, signal) => resolve({ code: signal ? signalExitCode(signal) : (code ?? 1), detail: signal ? `signal ${signal}` : `exit ${code}` }));
      });
      child = undefined;
      if (result.code !== 0) {
        exitCode ||= result.code;
        failures.push(`${label}: ${result.detail}`);
        error(`[agent verify] Failed: ${failures.at(-1)}`);
      }
    }
  } catch (failure) {
    error(`[agent verify] ${failure.message}`);
    exitCode ||= 1;
  } finally {
    process.off('SIGINT', onInterrupt);
    process.off('SIGTERM', onTerminate);
    process.off('SIGHUP', onHangup);
    try {
      release();
    } catch (failure) {
      error(`[agent verify] Could not release lock: ${failure.message}`);
      exitCode ||= 1;
    }
  }

  if (interrupted) return signalExitCode(interrupted);
  if (failures.length) error(`[agent verify] ${failures.length} check(s) failed; returning exit ${exitCode}.`);
  else if (exitCode === 0) log('[agent verify] Build, startup asset ceiling, lint, type-check, Doctor diagnostics, and runtime performance checks passed.');
  return exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runVerification();
}
