# Banner contributions

Banners are decorative artwork displayed at **300 × 100 CSS pixels** in desktop board headers. They are omitted below the 640px mobile breakpoint. Keep text readable at that displayed size and check the artwork against the site's light and dark themes. Animated GIF artwork is welcome within the limits below; this does not change the restrictions on UI animations in [DESIGN.md](../DESIGN.md).

## Add or replace a banner

Keep the original outside `public/`, crop it to a 3:1 aspect ratio, then run:

```sh
corepack yarn banners:add /path/to/source.png retro-terminal
corepack yarn banners:check
```

The import command accepts JPEG, PNG, WebP or GIF sources, optimizes the image, writes an export such as `public/assets/banners/retro-terminal.a1b2c3d4e5f6.jpg`, and regenerates `src/generated/asset-manifest.ts`. Use a descriptive lowercase slug with hyphens, at most 40 characters. Numbers and a `banner-` prefix are unnecessary. The 12-character suffix is the beginning of the exported file's SHA-256 hash: different bytes get a different URL.

Commit the optimized export and generated manifest. To replace a banner, remove its old export first, then run `banners:add` with the revised original and the same slug, followed by `banners:check`. The importer rejects a reused slug with different artwork; if the import fails, restore the old export from Git. To remove a banner without replacing it, delete the export and run `corepack yarn generate:assets` and `corepack yarn banners:check`. Do not overwrite bytes under an existing hashed filename or manually edit the manifest. Existing banners follow the same rules as new contributions.

In the pull request, attach or link the original, credit the creator/source, and record the license or permission to include it. The original/master need not be committed. Preview the export at 300 × 100, including a full animation cycle for GIFs. Keep source masters, previews and unused alternatives out of `public/`: everything there is distributed.

## Enforced budgets

Limits use binary units: 1 KiB = 1,024 bytes; 1 MiB = 1,048,576 bytes.

| Asset             | Dimensions                                         | Maximum encoded size | Other limits                                                                                                     |
| ----------------- | -------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Still JPEG or PNG | 600 × 200; 300 × 100 allowed for smaller originals | 64 KiB               | Exactly one frame                                                                                                |
| Animated GIF      | 300 × 100                                          | 128 KiB              | 2–60 frames; every frame lasts at least 80 ms in whole 10 ms ticks; one animation cycle lasts at most 10 seconds |
| Whole collection  | —                                                  | 5 MiB                | Serialized banner URL list at most 16 KiB                                                                        |

There is no fixed banner count limit. Per-file budgets limit a selected banner's download cost; collection and URL-list budgets bound installation size and manifest growth. These are project budgets, not browser limits. Raise them only with a measured reason and maintainer review. GIF dimensions, frame count and timing also constrain decoding work; compressed bytes alone do not describe animation cost. Avoid flashing or rapidly changing artwork.

The importer rejects malformed inputs, aspect ratios outside `abs(width / height - 3) <= 0.01`, excessive animation and exports that exceed the budgets. Crop or simplify the original when it fails; the command does not keep lowering quality until a file passes.

`corepack yarn banners:check` checks filenames, content hashes, dimensions, encoded bytes, animation limits, duplicate exports, collection budgets and manifest freshness. Every Vite application build validates the collection before bundling, including direct builds and platform variants.

## Optimization and determinism

The importer applies image orientation and strips embedded metadata. Opaque stills are exported as both JPEG at quality 82 with mozjpeg and lossless PNG; the smaller result is kept. Stills with transparency use PNG. GIFs are resized to 300 × 100 while preserving their frame timings and loop setting. The fixed encoder options are defined in the import script; [Sharp's output documentation](https://sharp.pixelplumbing.com/api-output/) explains the encoding options.

The same source bytes, slug and locked toolchain produce the same export and filename. The manifest is sorted deterministically. Encoder upgrades or different native encoder builds across operating systems can change bytes, so cross-version or cross-platform byte identity is not promised. Review changed exports when upgrading the encoder.

Optimization happens when importing a banner. Builds validate and copy the checked-in exports; they do not repeatedly re-encode lossy files. Always use the original when revising artwork. JPEG, PNG and GIF preserve compatibility with the project's declared browser targets without requiring alternate image fallbacks.

## Loading, caching and deployment

The app loads only its selected banner. It does not preload the collection or embed image bytes in JavaScript. Banner URLs contribute a small amount to the generated manifest and static shell. A desktop header is above the fold, so the image loads eagerly with explicit 300 × 100 dimensions and asynchronous decoding; [web.dev recommends against lazy-loading initially visible images](https://web.dev/articles/browser-level-image-lazy-loading). The static board shell and first React header share the selection to avoid downloading two different banners during startup.

Rerendering a header retains its banner. Navigating to another board or special view can select another one and trigger another request. Being a single-page app does not make later image downloads free.

The production service worker uses a dedicated CacheFirst cache for requested hashed banner URLs, bounded to 40 entries and 30 days. It does not precache the collection. Browsers may evict stored assets, and unvisited banners are not guaranteed to be available offline. Other application assets retain their existing caching behavior.

The Vercel configuration gives hashed banner files `Cache-Control: public, max-age=31536000, immutable`. The filename must change whenever the bytes change. Vercel deployments already include [CDN delivery](https://vercel.com/docs/cdn), so a separate banner CDN or external image service is unnecessary. Static mirrors can configure the same header for hashed files or rely on normal browser caching. Keep URLs relative so static subdirectory hosting, Electron and Android continue to work.

All exports still ship in the HTML ZIP, Electron and Android packages, including banners omitted by the mobile layout. Collection size therefore affects release downloads and installations even though a web page requests only the selected image. Repository configuration describes the behavior of builds deployed from it; changing these files does not update an existing deployment by itself.
