import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { addBanner, checkBanners, rootDir } from './banners.mjs';

try {
  const [command, input, slug, ...extra] = process.argv.slice(2);
  if (command === 'check' && !input) {
    await checkBanners();
  } else if (command === 'add' && input && slug && extra.length === 0) {
    const path = resolve(input);
    console.log(`Importing banner from ${path}`);
    const filename = await addBanner(path, slug);
    execFileSync(process.execPath, ['scripts/generate-asset-manifest.js'], { cwd: rootDir, stdio: 'inherit' });
    console.log(`Banner ready: public/assets/banners/${filename}`);
  } else {
    throw new Error('Usage: yarn banners:add <source> <descriptive-slug> | yarn banners:check');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
