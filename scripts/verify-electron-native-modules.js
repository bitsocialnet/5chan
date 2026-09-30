import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electronBinary = require('electron');

if (typeof electronBinary !== 'string' || electronBinary.length === 0) {
  throw new Error('Failed to resolve the Electron executable for native-module verification');
}

// Each check loads the module's native binary: better-sqlite3 only loads it when a database opens.
const nativeModuleChecks = {
  'better-sqlite3': "new (require('better-sqlite3'))(':memory:').prepare('select sqlite_version() as version').get().version",
};
const verificationScript = `
console.log('electron modules', process.versions.modules);
${Object.entries(nativeModuleChecks)
  .map(
    ([moduleName, check]) => `
try {
  console.log('native-ok', ${JSON.stringify(moduleName)}, ${check});
} catch (error) {
  console.error('native-fail', ${JSON.stringify(moduleName)});
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}`,
  )
  .join('\n')}
`;

const result = spawnSync(electronBinary, ['-e', verificationScript], {
  encoding: 'utf8',
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
  },
});

if (result.stdout) {
  process.stdout.write(result.stdout);
}

if (result.stderr) {
  process.stderr.write(result.stderr);
}

if (result.status !== 0) {
  throw new Error(`Electron native-module verification failed with exit code ${result.status ?? 'unknown'}`);
}
