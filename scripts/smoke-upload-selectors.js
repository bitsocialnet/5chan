#!/usr/bin/env node
/**
 * Live smoke probe for imgur/postimages upload selectors.
 * Probes current DOM and reports which configured selectors still match.
 * Non-blocking: always exits 0. Intended for CI report-only and local triage.
 *
 * Output:
 * - scripts/upload-selectors-smoke-report.json
 * - scripts/upload-selectors-smoke-snapshots/ (screenshots)
 *
 * Run: yarn smoke:upload-selectors
 */
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const REPORT_PATH = join(REPO_ROOT, 'scripts', 'upload-selectors-smoke-report.json');
const SNAPSHOTS_DIR = join(REPO_ROOT, 'scripts', 'upload-selectors-smoke-snapshots');

const PROVIDERS = ['imgur', 'postimages'];

/** Selectors to probe (from recipes). Loaded dynamically to avoid circular deps. */
async function loadRecipes() {
  const mod = await import('../electron/media-upload-recipes.js');
  return mod.MEDIA_UPLOAD_RECIPES;
}

/** Check which selectors match in the page. */
async function probeSelectors(page, selectors) {
  const results = [];
  for (const sel of selectors) {
    try {
      const count = await page.locator(sel).count();
      results.push({ selector: sel, matches: count });
    } catch (e) {
      results.push({ selector: sel, matches: 0, error: String(e?.message ?? e) });
    }
  }
  return results;
}

async function run() {
  const recipes = await loadRecipes();
  const report = {
    timestamp: new Date().toISOString(),
    providers: {},
    summary: { ok: 0, warn: 0 },
  };

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    await mkdir(SNAPSHOTS_DIR, { recursive: true });

    for (const provider of PROVIDERS) {
      const recipe = recipes[provider];
      if (!recipe) continue;

      const url = recipe.uploadUrl;
      const entry = {
        url,
        fileInput: [],
        submit: [],
        success: [],
        blocked: [],
        screenshot: null,
        loadError: null,
      };

      try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.waitForTimeout(2500);

        entry.fileInput = await probeSelectors(page, recipe.fileInputSelectorCandidates);
        entry.submit = await probeSelectors(page, recipe.submitSelectorCandidates);
        entry.success = await probeSelectors(page, recipe.successExtractor.selectorCandidates);
        entry.blocked = await probeSelectors(page, recipe.blockedIndicators);

        const snapshotPath = join(SNAPSHOTS_DIR, `${provider}-${Date.now()}.png`);
        await page.screenshot({ path: snapshotPath });
        entry.screenshot = snapshotPath;

        const fileInputOk = entry.fileInput.some((r) => r.matches > 0);
        const submitOk = entry.submit.some((r) => r.matches > 0);
        const successOk = entry.success.some((r) => r.matches > 0);
        const blockedPresent = entry.blocked.some((r) => r.matches > 0);

        if (fileInputOk && submitOk && successOk && !blockedPresent) {
          report.summary.ok++;
        } else {
          report.summary.warn++;
        }

        await page.close();
      } catch (e) {
        entry.loadError = String(e?.message ?? e);
        report.summary.warn++;
      }

      report.providers[provider] = entry;
    }
  } catch (e) {
    report.error = String(e?.message ?? e);
  } finally {
    if (browser) await browser.close();
  }

  await writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`Smoke report written to ${REPORT_PATH}`);
  console.log(`Summary: ${report.summary?.ok ?? 0} OK, ${report.summary?.warn ?? 0} warn. Snapshots in ${SNAPSHOTS_DIR}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(0);
  });
