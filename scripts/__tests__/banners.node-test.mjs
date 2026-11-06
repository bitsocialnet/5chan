import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { addBanner, checkBudgets, contentHash, encodeBanner, inspectBanner, inspectCollection, limits, rootDir } from '../banners.mjs';

const still = (width = 600, height = 200) =>
  sharp({ create: { width, height, channels: 3, background: '#335577' } })
    .png()
    .toBuffer();
const gif = (delays = [100, 200], loop = 2) =>
  sharp(Buffer.alloc(300 * 100 * delays.length * 3, 128), { raw: { width: 300, height: 100 * delays.length, channels: 3, pageHeight: 100 } })
    .gif({ delay: delays, loop, keepDuplicateFrames: true })
    .toBuffer();
const name = (bytes, ext = 'png', slug = 'example') => `${slug}.${contentHash(bytes)}.${ext}`;

test('repeatable import strips metadata, preserves dimensions, and produces content-addressed filenames', async () => {
  const source = await sharp(await still())
    .withMetadata()
    .png()
    .toBuffer();
  const a = await encodeBanner(source, 'example');
  const b = await encodeBanner(source, 'example');
  assert.equal(a.filename, b.filename);
  assert.deepEqual(a.bytes, b.bytes);
  const metadata = await sharp(a.bytes).metadata();
  assert.equal(metadata.width, 600);
  assert.equal(metadata.height, 200);
  assert.equal(metadata.exif, undefined);
  await inspectBanner(a.filename, a.bytes);
  const transparent = await sharp({ create: { width: 300, height: 100, channels: 4, background: '#00000000' } })
    .png()
    .toBuffer();
  assert.match((await encodeBanner(transparent, 'transparent')).filename, /\.png$/);
});

test('animation survives with its frame count, delays, loop setting and repeatable bytes', async () => {
  const source = await gif();
  const result = await encodeBanner(source, 'animated');
  const meta = await sharp(result.bytes, { animated: true }).metadata();
  assert.equal(meta.pages, 2);
  assert.equal(meta.pageHeight, 100);
  assert.deepEqual(meta.delay, [100, 200]);
  assert.equal(meta.loop, 2);
  assert.deepEqual(result, await encodeBanner(source, 'animated'));
});

test('applies EXIF rotation before sizing and stripping metadata', async () => {
  for (const orientation of [3, 6]) {
    const width = orientation === 6 ? 200 : 600;
    const height = orientation === 6 ? 600 : 200;
    const pixels = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const firstHalf = orientation === 6 ? y < height / 2 : x < width / 2;
        pixels[(y * width + x) * 3 + (firstHalf ? 0 : 2)] = 255;
      }
    }
    const source = await sharp(pixels, { raw: { width, height, channels: 3 } })
      .withMetadata({ orientation })
      .jpeg()
      .toBuffer();
    const { bytes } = await encodeBanner(source, 'oriented');
    const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 600);
    assert.equal(info.height, 200);
    assert.ok(data[2] > 200 && data[0] < 30, 'Blue half must move to the left');
    assert.equal((await sharp(bytes).metadata()).orientation, undefined);
  }
});

test('rejects expensive animations and sources needing an explicit crop', async () => {
  await assert.rejects(encodeBanner(await gif([20, 100]), 'fast'), /at least 80 ms/);
  await assert.rejects(encodeBanner(await gif(Array(61).fill(100)), 'many'), /2–60 frames/);
  await assert.rejects(encodeBanner(await gif([6000, 6000]), 'long'), /at most 10000 ms/);
  const frames = Buffer.alloc(300 * 200 * 3, 128);
  frames.fill(32, 300 * 100 * 3);
  const webp = await sharp(frames, { raw: { width: 300, height: 200, channels: 3, pageHeight: 100 } })
    .webp({ delay: [81, 99] })
    .toBuffer();
  await assert.rejects(encodeBanner(webp, 'fractional-ticks'), /whole 10 ms ticks/);
  await assert.rejects(encodeBanner(await still(300, 300), 'square'), /3:1/);
  await assert.rejects(encodeBanner(await still(), '../invalid'), /Slug/);
});

test('rejects invalid names, changed bytes, wrong dimensions, mislabeled and oversized files', async () => {
  const png = await still();
  await assert.rejects(inspectBanner('banner-1.png', png), /content hash/);
  await assert.rejects(inspectBanner('example.000000000000.png', png), /does not match/);
  await assert.rejects(inspectBanner(name(png, 'jpg'), png), /Extension/);
  const square = await still(300, 300);
  await assert.rejects(inspectBanner(name(square), square), /300×100/);
  const big = Buffer.alloc(limits.stillBytes + 1);
  await assert.rejects(inspectBanner(name(big), big), /byte limit/);
  const bigGif = Buffer.alloc(limits.gifBytes + 1);
  await assert.rejects(inspectBanner(name(bigGif, 'gif'), bigGif), /byte limit/);
  const broken = png.subarray(0, 80);
  await assert.rejects(inspectBanner(name(broken), broken));
});

test('collection enforces total bytes, URL bytes, duplicate content and stable ordering', () => {
  const entries = [
    { filename: 'z', hash: '1', bytes: 1 },
    { filename: 'a', hash: '2', bytes: 2 },
  ];
  assert.deepEqual(checkBudgets(entries).paths, ['assets/banners/a', 'assets/banners/z']);
  assert.throws(() => checkBudgets([]), /At least one/);
  assert.throws(() => checkBudgets([...entries, entries[0]]), /Duplicate/);
  assert.throws(
    () =>
      checkBudgets([
        { filename: 'same.1.jpg', hash: '1', bytes: 1 },
        { filename: 'same.2.jpg', hash: '2', bytes: 1 },
      ]),
    /Duplicate banner slug/,
  );
  assert.throws(() => checkBudgets([{ ...entries[0], bytes: limits.totalBytes + 1 }]), /collection exceeds/);
  assert.throws(() => checkBudgets([{ ...entries[0], filename: 'x'.repeat(limits.manifestBytes) }]), /URL list exceeds/);
});

test('reimport is idempotent; duplicate artwork and reused slugs cannot silently overwrite assets', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), '5chan-banners-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = await still();
  const original = await encodeBanner(source, 'example');
  await assert.rejects(inspectCollection(directory), /At least one/);
  assert.equal(await addBanner(source, 'example', directory), original.filename);
  assert.equal(await addBanner(source, 'example', directory), original.filename);
  await assert.rejects(addBanner(source, 'duplicate', directory), /Identical banner/);
  await assert.rejects(addBanner(await still(300, 100), 'example', directory), /Slug already exists/);
  assert.deepEqual(await readdir(directory), [original.filename]);
  assert.equal((await inspectCollection(directory)).totalBytes, original.bytes.length);
  await writeFile(join(directory, 'ignored.txt'), 'should fail');
  await assert.rejects(inspectCollection(directory), /ignored.txt/);
});

test('immutable CDN rule matches hashed assets and excludes mutable legacy filenames', async () => {
  const config = JSON.parse(await readFile(join(rootDir, 'vercel.json'), 'utf8'));
  const source = config.headers.find((rule) => rule.source.startsWith('/assets/banners/')).source;
  const rule = new RegExp(`^${source}$`); // Also used as regex by the release deploy converter.
  for (const ext of ['jpg', 'png', 'gif']) assert.ok(rule.test(`/assets/banners/example.123456abcdef.${ext}`));
  assert.equal(rule.test('/assets/banners/banner-1.jpg'), false);
});
