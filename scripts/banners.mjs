import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const bannersDir = join(rootDir, 'public/assets/banners');
export const limits = Object.freeze({
  stillBytes: 64 * 1024,
  gifBytes: 128 * 1024,
  totalBytes: 5 * 1024 * 1024,
  manifestBytes: 16 * 1024,
  frames: 60,
  minDelay: 80,
  duration: 10_000,
});
export const filenamePattern = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.([a-f0-9]{12})\.(jpg|png|gif)$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const contentHash = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 12);
const requireRule = (condition, message) => {
  if (!condition) throw new Error(message);
};

function checkAnimation(metadata) {
  const frames = metadata.pages ?? 1;
  requireRule(frames >= 2 && frames <= limits.frames, `GIF must have 2–${limits.frames} frames`);
  const delays = metadata.delay ?? [];
  requireRule(delays.length === frames && delays.every((delay) => delay >= limits.minDelay), `GIF frames must last at least ${limits.minDelay} ms`);
  requireRule(
    delays.every((delay) => delay % 10 === 0),
    'GIF frame delays must use whole 10 ms ticks',
  );
  requireRule(delays.reduce((sum, delay) => sum + delay, 0) <= limits.duration, `GIF loop must be at most ${limits.duration} ms`);
}

export async function inspectBanner(filename, bytes) {
  const match = filename.match(filenamePattern);
  requireRule(match && match[1].length <= 40, 'Use a slug of at most 40 characters followed by .<12-character content hash>.<jpg|png|gif>');
  requireRule(match[2] === contentHash(bytes), 'Filename hash does not match file contents');
  const animated = match[3] === 'gif';
  requireRule(bytes.length <= (animated ? limits.gifBytes : limits.stillBytes), `Exceeds ${animated ? limits.gifBytes : limits.stillBytes} byte limit`);
  const metadata = await sharp(bytes, { animated: true }).metadata();
  requireRule(metadata.format === (match[3] === 'jpg' ? 'jpeg' : match[3]), 'Extension does not match image format');
  const height = metadata.pageHeight ?? metadata.height;
  requireRule(
    (metadata.width === 300 && height === 100) || (!animated && metadata.width === 600 && height === 200),
    'Stills must be 300×100 or 600×200; GIFs must be 300×100',
  );
  if (animated) checkAnimation(metadata);
  else requireRule((metadata.pages ?? 1) === 1, 'Stills must contain exactly one frame');
  requireRule(!metadata.exif && !metadata.xmp && !metadata.iptc && !metadata.icc, 'Strip embedded metadata with banners:add');
  // Decode all frames too: metadata alone can accept a truncated image payload.
  await sharp(bytes, { animated: true }).raw().toBuffer();
  return { filename, bytes: bytes.length, hash: match[2] };
}

export function checkBudgets(entries, { allowEmpty = false } = {}) {
  requireRule(allowEmpty || entries.length > 0, 'At least one banner is required');
  const paths = entries.map(({ filename }) => `assets/banners/${filename}`).sort();
  requireRule(new Set(entries.map(({ hash }) => hash)).size === entries.length, 'Duplicate banner contents');
  requireRule(new Set(entries.map(({ filename }) => filename.split('.')[0])).size === entries.length, 'Duplicate banner slug');
  const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  requireRule(totalBytes <= limits.totalBytes, `Banner collection exceeds ${limits.totalBytes} bytes`);
  requireRule(Buffer.byteLength(JSON.stringify(paths)) <= limits.manifestBytes, `Banner URL list exceeds ${limits.manifestBytes} bytes`);
  return { paths, totalBytes };
}

export async function inspectCollection(directory = bannersDir, { allowEmpty = false } = {}) {
  const entries = [];
  for (const filename of (await readdir(directory)).sort()) {
    try {
      entries.push(await inspectBanner(filename, await readFile(join(directory, filename))));
    } catch (error) {
      throw new Error(`${filename}: ${error.message}`, { cause: error });
    }
  }
  return { entries, ...checkBudgets(entries, { allowEmpty }) };
}

export async function checkBanners() {
  const result = await inspectCollection();
  const manifest = await readFile(join(rootDir, 'src/generated/asset-manifest.ts'), 'utf8');
  const block = manifest.match(/export const BANNERS = (\[[\s\S]*?\]) as const;/)?.[1];
  const registered = [...(block ?? '').matchAll(/'([^']+)'/g)].map((match) => match[1]);
  requireRule(JSON.stringify(registered) === JSON.stringify(result.paths), 'Stale banner manifest: run corepack yarn generate:assets');
  console.log(`Banners: ${result.paths.length} files, ${result.totalBytes} bytes; budgets and manifest OK`);
  return result;
}

export async function encodeBanner(input, slug) {
  requireRule(slugPattern.test(slug) && slug.length <= 40, 'Slug must be lowercase words separated by hyphens, at most 40 characters');
  const image = sharp(input, { animated: true }).autoOrient();
  const metadata = await image.metadata();
  requireRule(['jpeg', 'png', 'webp', 'gif'].includes(metadata.format), 'Source must be JPEG, PNG, WebP or GIF');
  const animated = (metadata.pages ?? 1) > 1;
  const sourceWidth = metadata.autoOrient.width;
  const sourceHeight = animated ? metadata.pageHeight : metadata.autoOrient.height;
  requireRule(Math.abs(sourceWidth / sourceHeight - 3) <= 0.01, 'Crop the source to a 3:1 aspect ratio before importing');
  let bytes, extension;
  if (animated) {
    checkAnimation(metadata);
    bytes = await image
      .resize(300, 100, { fit: 'cover' })
      .gif({ effort: 10, colours: 256, dither: 1, keepDuplicateFrames: true, delay: metadata.delay, loop: metadata.loop ?? 0 })
      .toBuffer();
    extension = 'gif';
  } else {
    const width = sourceWidth >= 600 ? 600 : 300;
    const resized = image.resize(width, width / 3, { fit: 'cover' });
    bytes = await resized.clone().png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    extension = 'png';
    if (!metadata.hasAlpha || (await resized.clone().stats()).isOpaque) {
      const jpeg = await resized.clone().jpeg({ quality: 82, mozjpeg: true, chromaSubsampling: '4:2:0' }).toBuffer();
      if (jpeg.length < bytes.length) {
        bytes = jpeg;
        extension = 'jpg';
      }
    }
  }
  const filename = `${slug}.${contentHash(bytes)}.${extension}`;
  await inspectBanner(filename, bytes);
  return { filename, bytes };
}

export async function addBanner(input, slug, directory = bannersDir) {
  const encoded = await encodeBanner(input, slug);
  const collection = await inspectCollection(directory, { allowEmpty: true });
  const existing = collection.entries.find((entry) => entry.hash === contentHash(encoded.bytes));
  if (existing) {
    requireRule(existing.filename === encoded.filename, `Identical banner already exists: ${existing.filename}`);
    return existing.filename;
  }
  requireRule(
    !collection.entries.some((entry) => entry.filename.startsWith(`${slug}.`)),
    `Slug already exists: ${slug}; remove its old export explicitly before replacing it`,
  );
  checkBudgets([...collection.entries, { filename: encoded.filename, hash: contentHash(encoded.bytes), bytes: encoded.bytes.length }]);
  await writeFile(join(directory, encoded.filename), encoded.bytes, { flag: 'wx' });
  return encoded.filename;
}
