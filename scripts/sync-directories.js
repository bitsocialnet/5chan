// Best-effort sync of 5chan-directories.json from GitHub
// Updates the vendored fallback in src/data/ so production builds ship a fresh snapshot.
// Never fails the build — if the fetch fails (offline, rate-limited, etc.), the existing file is kept.

import { writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GITHUB_URL = 'https://raw.githubusercontent.com/bitsocialhq/lists/master/5chan-directories.json';
const OUTPUT_PATH = join(__dirname, '..', 'src', 'data', '5chan-directories.json');
const TIMEOUT_MS = 5000;

const sync = async () => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(GITHUB_URL, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    // Basic sanity check — must have a communities array
    if (!Array.isArray(data?.communities) || data.communities.length === 0) {
      throw new Error('Invalid data: missing or empty communities array');
    }

    const formatted = JSON.stringify(data, null, 2) + '\n';

    // Only write if content actually changed
    let existing = '';
    try {
      existing = readFileSync(OUTPUT_PATH, 'utf8');
    } catch {
      // file doesn't exist yet
    }

    if (formatted === existing) {
      console.log('✅ Vendored directories already up to date');
      return;
    }

    writeFileSync(OUTPUT_PATH, formatted, 'utf8');
    console.log(`✅ Synced vendored directories (${data.communities.length} communities)`);
  } catch (e) {
    console.warn(`⚠️  Could not sync directories from GitHub (keeping existing file): ${e.message}`);
  }
};

sync();
