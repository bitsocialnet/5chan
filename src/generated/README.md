# Generated Files

This directory contains auto-generated TypeScript files. Do not edit these files manually.

## asset-manifest.ts

Auto-generated manifest of all banner and not-found images from `public/assets/`.

**To regenerate:**

```bash
corepack yarn generate:assets
```

**Auto-regenerated:**

- Before every build (`corepack yarn build`)
- Before dev server start (`corepack yarn start`)

**To add new banners:**

1. Follow the [banner contribution guide](../../docs/banners.md).
2. Run `corepack yarn banners:add /path/to/source.png descriptive-slug`. This optimizes the image, writes `public/assets/banners/<slug>.<content-hash>.{jpg,png,gif}`, and regenerates the manifest.
3. Run `corepack yarn banners:check`, preview the export, and commit it with the generated manifest. Do not add source masters or manually number banners.

**To add new not-found images:**

1. Add files to `public/assets/not-found/` following the pattern `not-found-*.{jpg,jpeg,gif,png}`
2. Run `corepack yarn generate:assets` (or it will auto-run on next build/start)
