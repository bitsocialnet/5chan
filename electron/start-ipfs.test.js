import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Runs after every pending nextTick and promise job, so a whole fake start attempt settles.
const flush = () => new Promise((resolve) => setImmediate(resolve));

// Like Node's spawn when the binary cannot be executed: 'error' then 'close', never 'exit'.
const failToSpawn = (child, command) => {
  child.emit('error', Object.assign(new Error(`spawn ${command} EACCES`), { code: 'EACCES' }));
  child.emit('close', -13, null);
};
const exitCleanly = (child) => {
  child.emit('exit', 0, null);
  child.emit('close', 0, null);
};

let exitListenersBefore = [];

const loadStartIpfs = async ({ isDev = false, behavior }) => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  let nextPid = 1000;
  const spawn = vi.fn((command, args) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    const act = behavior(args);
    child.pid = act === failToSpawn ? undefined : (nextPid += 10);
    process.nextTick(() => act(child, command));
    return child;
  });
  // The first check reports the port as taken, so nothing starts until the test has set onError.
  const check = vi.fn(async () => true);
  const kill = vi.fn();
  const proxyStart = vi.fn();

  vi.doMock('electron-is-dev', () => ({ default: isDev }));
  vi.doMock('tcp-port-used', () => ({ default: { check } }));
  vi.doMock('child_process', () => ({ spawn }));
  vi.doMock('node:process', () => ({ default: { kill } }));
  vi.doMock('fs-extra', () => ({ default: { existsSync: () => true, ensureDirSync: () => {} } }));
  vi.doMock('./proxy-server.js', () => ({ default: { start: proxyStart } }));
  vi.doMock('./kubo-paths.js', () => ({
    getBundledKuboPath: () => '/fake/ipfs',
    getIpfsBinaryName: () => 'ipfs',
    getPackagedKuboPaths: () => ['/fake/ipfs'],
  }));
  vi.doMock('./pkc-paths.js', () => ({ getPkcDataPath: () => '/fake/data' }));

  exitListenersBefore = process.listeners('exit');
  const { default: startIpfs } = await import('./start-ipfs.js');
  await flush();
  startIpfs.onError = vi.fn();
  check.mockImplementation(async () => false);

  const tick = async () => {
    vi.advanceTimersByTime(1000);
    await flush();
  };
  const addedExitListeners = () => process.listeners('exit').filter((listener) => !exitListenersBefore.includes(listener));

  return { startIpfs, spawn, check, kill, proxyStart, tick, addedExitListeners };
};

const daemonArgs = (args) => args[0] === 'daemon';

afterEach(() => {
  // Never leave a kill-on-exit listener behind in the test worker.
  for (const listener of process.listeners('exit')) {
    if (!exitListenersBefore.includes(listener)) {
      process.removeListener('exit', listener);
    }
  }
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('start-ipfs auto restart', () => {
  it('reports a kubo binary that cannot be spawned and keeps retrying', async () => {
    const { startIpfs, check, tick } = await loadStartIpfs({ behavior: () => failToSpawn });

    await tick();
    expect(startIpfs.onError).toHaveBeenCalledTimes(1);
    expect(startIpfs.onError.mock.calls[0][0].message).toMatch(/EACCES/);

    // The failed attempt released the start gate, so the next tick checks the port again.
    await tick();
    expect(check).toHaveBeenCalledTimes(3);
  });

  it('reports a daemon that cannot be spawned', async () => {
    const { startIpfs, check, tick } = await loadStartIpfs({
      behavior: (args) => (daemonArgs(args) ? failToSpawn : exitCleanly),
    });

    await tick();
    expect(startIpfs.onError).toHaveBeenCalledTimes(1);
    expect(startIpfs.onError.mock.calls[0][0].message).toMatch(/EACCES/);

    await tick();
    expect(check).toHaveBeenCalledTimes(3);
  });
});
