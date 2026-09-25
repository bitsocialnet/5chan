# 5chan native mobile: research and decision record

Research date: 2026-09-22. Source baseline: 5chan `48186638cdfc5fdb3854092efade9f10a8801460`, version `0.9.21`.

Status: proposal and verified research, not an approved final architecture or a shipped application. The requested first step is research and decision documentation. No app, store account, repository, signing identity, or live website was created or changed in this step.

## Direction and decisions

Build toward **5chan**, a modern, mobile-first native app for Android and iOS, using React Native and `@bitsocial/bitsocial-react-hooks` if the shared runtime can be made to work reliably. Target Google Play, Apple's App Store, F-Droid, and GitHub APK downloads. Store acceptance remains an external dependency.

| Topic | Status | Working direction |
| --- | --- | --- |
| Native Android and iOS, React Native, Bitsocial hooks | Requested | Prove the exact SDK/hooks stack on both platforms before expanding implementation. |
| Modern mobile UI | Requested | New native interface; the existing classic web interface remains a separate product surface. |
| Name | User preference; recommended | Keep the new app named **5chan**. |
| Shared Android/iOS UI | Recommended | Share screens and behavior; adapt platform navigation, gestures, menus, accessibility, and system integrations. |
| Fork an existing client | Research conclusion | Use KurobaEx and Chance as UX references. Neither supplies a React Native implementation. |
| Repository | Recommended; not adopted | Grow this repository incrementally, beginning with `apps/mobile/`; avoid a wholesale monorepo migration before the compatibility proof. |
| Existing Capacitor APK | Proposed | Keep available; describe it as **5chan Classic** when the native beta is useful. Preserve its package identity and update path. |
| Store publisher | Recommended; account status unknown | Prefer Bitsocial Forge Inc. and begin D-U-N-S/enrollment work in parallel with engineering. |
| Store content scope | Open product decision | Recommend an initial set of approved, moderated SFW boards. Default-hidden NSFW alone is insufficient. |
| Forge services | Recommended | Start the compatibility proof now; integrate real Forge services before depending on them in a release. |

## Which clients are worth studying?

There is no defensible public ranking of active users or a representative survey identifying the single most beloved client. Stars measure developer interest, Play download bands are cumulative, and store ratings and forum discussions are selective samples. The following is a dated shortlist, not market-share data.

| Client | Evidence checked on 2026-09-22 | Platform/implementation | Use for 5chan |
| --- | --- | --- | --- |
| [KurobaEx](https://github.com/K1rakishou/Kuroba-Experimental) | 798 GitHub stars; latest repository commit September 19, 2026 | Android, Kotlin; GPLv3 family | Main Android reference for dense browsing, thread tracking, filters, and media workflows. Direct fork conflicts with React Native. |
| [Chance](https://github.com/moffatman/chan) | 526 stars; latest repository commit September 21, 2026 | iOS and Android, Flutter/Dart; GPLv3 | Main cross-platform/iOS interaction reference. Its README offers TestFlight and APK distribution, not an App Store release. |
| [Clover](https://github.com/chandevel/Clover) | 802 stars, but archived since 2021 | Android, Java; GPLv3 | Historical reference; its star count does not establish current leadership. |
| [Read Chan](https://play.google.com/store/apps/details?hl=en&id=com.deezus.pchan) | 500K+ downloads and 8.02K headline reviews; updated September 21, 2026 | Android; implementation/reusable source not established | Strong consumer-reach signal among the reviewed clients. Study navigation and ease of use; do not presume permission to fork. |
| [Overboard](https://apps.apple.com/us/app/overboard-community-browser/id6756696356) | Live US App Store listing, 33 ratings | Apple platforms | Useful current store-distribution and mobile UX reference; the small rating sample establishes neither leadership nor likely approval for 5chan. |

KurobaEx's GitHub activity does not establish current F-Droid availability: F-Droid [archived its package in October 2024](https://f-droid.org/en/2024/10/17/twif.html). Chance's TestFlight availability likewise does not prove App Store approval. These distinctions matter when choosing a release precedent.

The small discussion sample favors testing both KurobaEx and Chance: a [March 2025 AndroidApps thread](https://www.reddit.com/r/androidapps/comments/1j41u4b/) recommends Chance and Read Chan; a [June 2025 alternatives thread](https://www.reddit.com/r/androidapps/comments/1l5w68i/kurobaex_alternatives/) recommends Chance but also records posting/bug complaints. Older claims that KurobaEx was abandoned conflict with its current repository activity. This is useful qualitative input, not a representative vote. Reliability of posting, challenges and updates deserves as much attention as screenshots.

Recommendation: borrow interaction ideas, not a codebase. A Kotlin fork would leave iOS and React Native to rewrite; a Chance fork would mean adopting Flutter. Replacing a 4chan client's transport also requires replacing its posting, identity, challenge, persistence, and moderation assumptions with Bitsocial behavior. Copying code or assets brings their licensing obligations along.

## Shared UI and initial product scope

React Native can share the same React screen components across both OSs. It renders native platform components, not this app's existing HTML and CSS. It supports small `Platform` branches and `.ios.tsx` / `.android.tsx` components for genuine differences. Share the board catalog, thread reader, reply composer, saved threads, filters, and data logic; keep platform-specific code near navigation, media picking, sharing, permissions, keyboard behavior, and back gestures. [React Native platform-specific code](https://reactnative.dev/docs/platform-specific-code), [native components](https://reactnative.dev/docs/intro-react-native-components).

Proposed first release: board discovery and favorites; catalog/list browsing; readable threads, quotes and backlinks; image/video viewing; compose/reply with upload and challenges; saved threads, unread positions and drafts; reporting/blocking; identity backup/import; theme and text-size preferences. Prioritize one-handed navigation, responsive scrolling, accessible touch targets, screen readers, and recovering reading position.

Do not promise background thread watching as continuous P2P operation. Mobile suspension, push delivery, provider support, privacy, and F-Droid dependency constraints require a separate design. Foreground refresh is a reasonable initial boundary. Defer board creation, paid plans, pass purchasing, elaborate theme editors, and advanced moderation administration until the core loop works.

The user's request authorizes a modern native design. Existing [DESIGN.md](../DESIGN.md) deliberately preserves the classic web imageboard. Before implementing native screens, write guidance scoped to `apps/mobile/`; preserve recognizable board names, quotes, greentext, media density, and optional familiar palettes without mechanically copying desktop controls. Do not globally rewrite the existing design rules as a side effect.

## Compatibility is the first engineering gate

The installed dependencies, rather than sibling repository checkouts, were inspected: hooks `0.1.46`, SDK `0.0.101`. Both expose browser/Node-oriented code and no dedicated React Native export. React Native normally uses Hermes; a JavaScript engine does not itself provide browser storage, DOM APIs, or Node native modules. [React Native runtime documentation](https://reactnative.dev/docs/javascript-environment).

The current stack needs explicit work in these areas:

| Boundary | Current evidence | Required proof/adaptation |
| --- | --- | --- |
| Persistence | SDK and hooks independently use `localforage` | Native persistent storage with compatible behavior, migrations and restart tests; protect signing secrets with platform-backed secure storage. |
| Environment | Browser globals, `window`, online-state checks | Native bootstrap and lifecycle/network adapters; a dummy `window` is not a complete port. |
| Media | Hooks use DOM image/video/audio metadata paths | Native file selection, metadata, upload progress/cancellation, and supported codecs on both OSs. |
| Crypto and identity | Client signing remains part of the SDK | Cryptographically secure randomness, required crypto APIs, preserved identity, successful verification and challenge completion. |
| Transport | RPC and browser/P2P initialization share code | A deliberate native entry/runtime, Metro resolution, reconnect/subscription recovery, and foreground/background transitions. |
| Dependency resolution | SDK has eager imports plus lazy Helia/Kubo paths | Ensure the native bundle excludes unsupported paths; changing a runtime setting does not necessarily remove modules from Metro's dependency graph. |

**Forge RPC does not automatically solve React Native compatibility.** `PKCWithRpcClient` extends the base client and runs its initialization; storage and signing remain relevant. Hooks have their own storage/environment assumptions. Their default account configuration enables libp2p, so a deliberate RPC configuration must override that. The SDK's `./rpc` export is the Node RPC server, not a slim native RPC client.

Neither Forge integration was found in the audited 5chan source. The current upload registry contains Catbox, Imgur and ImgBB; configurable RPC support already exists, but is not Forge account provisioning or service integration. A controlled compatible RPC and test upload endpoint can support the early proof while those services develop.

Prefer native adapters and upstream package support over a full protocol rewrite. Select the React Native/React pair together and pin it for the experiment; do not assume the web app's React version must match it. Expo development builds may be useful, but Expo Go is not the acceptance target for custom native modules. Keep a reproducible local Gradle/Xcode build path; choose Expo tooling versus a bare project after the required native modules are known.

The spike must run in release-like builds on a physical Android device and iPhone, with simulators useful for earlier iteration:

1. Import the real hooks and SDK, initialize storage and identity, and render native components without a browser UI shell.
2. Load a real board, paginate a thread, observe updates, and navigate away/back without duplicated subscriptions.
3. Select media and publish a test thread/reply with signing and a real challenge against a designated test board; prove acceptance before retrying after a timeout.
4. Kill/relaunch, suspend/resume, lose connectivity, and switch networks. Preserve identity, drafts and saved state; restore subscriptions without duplicate publication.
5. Exercise reporting/blocking and the proposed store content boundary, including direct links and imported data.
6. Produce a release Android build without proprietary dependencies for the F-Droid path and a working iOS build. Record unresolved modules and their licenses.

This research did not run that spike. Compatibility remains unproven; there is no honest full-app delivery estimate until its result is known.

## App Store licensing needs an explicit resolution

The app, installed hooks, and installed SDK all declare **GPL-3.0-or-later**. No App Store distribution exception was found in the audited installed package licenses or metadata. Rewriting only the UI does not remove the hooks/SDK licensing question.

GPLv3 section 10 prohibits additional restrictions, while Apple's current developer agreement requires compliance with FOSS licenses and specifies App Store usage/EULA terms. This warrants a rights review for the actual bundle; it is not evidence that Apple rejects every open-source or GPL app. Before committing to iOS distribution, establish a documented compatible path, such as appropriate additional permission or dual licensing from the relevant rights holders, and audit transitive dependencies. Repository ownership, company KYC, and changing `package.json` cannot substitute for those rights. [GPL text in this repository](../LICENSE), [Apple Developer Program License Agreement](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/).

Keep the Android/F-Droid source available under compliant free-software terms. An additional Apple distribution permission, if properly granted, need not remove that availability. No license changes or permission requests were made here.

## Content policy: default-hidden NSFW is only one condition

Apple guideline 1.2 requires filtering, reporting with timely responses, blocking abusive users, and contact information. Its incidental mature-content allowance requires default hiding and activation through the website. It also warns about services primarily used for pornography or random/anonymous chat. An anonymous imageboard therefore has review risk beyond an NSFW switch; neither an adult rating nor a different publisher guarantees approval. [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/#user-generated-content).

Google explicitly applies UGC rules to clients for other platforms. It requires terms, ongoing moderation, reporting and blocking. Incidental sexual content must not be the primary purpose or actively promoted; default filters require at least two actions to disable, with child-access restrictions and accurate ratings. [Google Play UGC policy](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en).

Recommended MVP policy, **pending Tommaso's decision**: approved, actively moderated SFW boards in store builds, no NSFW opt-in in the initial release, and an identifiable operator for app-level reports. Board approval must govern access, not just homepage visibility: test direct addresses, links, favorites/imports, search, quotes, previews, cached content, and later board-content changes. This is a proposed restriction on the official store client, not a change to the open protocol or classic web client.

The current web client deliberately permits arbitrary board addresses. Directory votes or an `nsfw: false` label cannot establish moderation compliance. Design who receives reports, how board moderators and the app publisher respond, and how disallowed content/users/boards stop appearing in the official client. Local hiding is useful but does not establish service-level enforcement; rotating anonymous identities make blocking an explicit protocol/product question.

Forge Images moderation can address uploads through that provider, but does not cover externally hosted media, text, or other boards. Forge RPC is transport unless moderation capabilities are actually implemented. Neither service should be advertised as solving the full policy boundary.

Google's child-safety standards cover Social/Dating and anonymous/random-chat apps even when they exclude children: published standards, in-app feedback, CSAM handling, legal reporting processes, and a safety contact must be addressed. [Google child-safety requirements](https://support.google.com/googleplay/android-developer/answer/14747720?hl=en).

Before submission, also complete truthful privacy/data-safety declarations, age-rating questionnaires, support/privacy URLs, and any applicable account-deletion flow. Explain the decentralized architecture and limitations accurately to reviewers. Existing approved clients are precedents to study, not permission to hide functionality during review or relax controls afterward.

## Repository, naming, and the current APK

Recommendation: stay in `bitsocialnet/5chan`. Begin with a bounded `apps/mobile/` experiment and an independent mobile manifest/toolchain. After compatibility passes, introduce Yarn workspaces deliberately, testing Metro, native autolinking, dependency isolation and root install behavior. Extract only proven shared non-DOM logic; keep hooks/runtime fixes in their owning packages where possible.

A possible later layout is `apps/mobile/`, `packages/shared/`, and eventually `apps/web/`. Do not move today's `src/`, `android/`, `electron/`, or release scripts now: current scripts assume the web project is at the root, and today's `android/` belongs to Capacitor. A separate `bitsocialnet/5chan-mobile` remains reasonable if release ownership or tooling isolation becomes materially easier, but creating it is not necessary for this proof. A monorepo does not itself make DOM components reusable in native UI.

Use **5chan** for the native product and **5chan Classic** as a proposed label for the existing web-based APK once both are offered. Keep web and desktop named 5chan; publish clear platform choices on `5chan.app` and `bitsocial.net/projects/5chan` only when actual downloads/betas exist. The repository name does not need to become the app name.

Current Android application ID is `fivechan.android`; `github` and `fdroid` are already build flavors. Preserve that identity for Classic. Give the new native app a distinct stable ID, for example `net.bitsocial.fivechan` if domain ownership and store availability are verified, so users can install both. Exact IDs are undecided.

Plan explicit account/settings export and import between apps. A new package ID has a different storage sandbox; React Native cannot automatically read the old app's browser storage. Never overwrite the old APK or change its signing lineage as an incidental rename. Its existing F-Droid metadata is a draft with an unresolved commit placeholder, not evidence of an accepted store listing.

## Publishing identity and release channels

Prefer **Bitsocial Forge Inc.** if it will operate the official app. Tommaso can be its authorized account holder and verify his own identity while the company is the publisher. Personal enrollment is possible, but it is a different publisher relationship, not merely a choice of signing-certificate label.

| Route | Practical consequence |
| --- | --- |
| Apple individual | The seller is Tommaso's legal name. Apple lists USD 99/year, with regional pricing. |
| Apple organization | Company legal name as seller; D-U-N-S, legal authority, organization contact/domain and verification required. |
| Google Play personal | Public developer name may differ, but legal identity information is disclosed. New accounts created after November 13, 2023 need at least 12 continuously opted-in testers for 14 days before applying for production access. |
| Google Play organization | Verified company/D-U-N-S details; the specific new-personal-account test gate does not apply, but review and verification still do. Play registration is USD 25 once. |

Sources: [Apple enrollment](https://developer.apple.com/programs/enroll/), [Google account information](https://support.google.com/googleplay/android-developer/answer/13628312?hl=en), [Google testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en), [Play registration](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en-AU).

Check whether the company already has a D-U-N-S number before requesting one. Apple's free process advises up to five business days plus up to two for data propagation; Google's guidance allows up to 30 days. These are published estimates, not a deadline promise. Start now while engineering proceeds. [Apple D-U-N-S](https://developer.apple.com/help/account/membership/D-U-N-S), [Google requirements](https://support.google.com/googleplay/android-developer/answer/13628312?hl=en).

Apple supports requesting individual-to-organization conversion; Google documents its own conversion process. Conversion is possible but should not be the default launch dependency. For EU distribution, Apple requires trader self-assessment and displays traders' contact details; using a personal account does not inherently avoid those disclosures. [Apple conversion](https://developer.apple.com/help/account/membership/updating-your-account-information/), [Google conversion](https://support.google.com/googleplay/android-developer/answer/13634888?hl=en), [Apple EU trader requirements](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements).

Distribution engineering:

- **Google Play:** produce a signed AAB and configure Play App Signing. Separate the upload key from the app-signing key. Decide cross-channel signing before the first public native release. [Android signing](https://developer.android.com/studio/publish/app-signing).
- **GitHub:** publish installable signed APKs with checksums, source tag and release notes. A matching package ID alone does not guarantee upgrade compatibility; signatures/signing lineage and version codes matter.
- **F-Droid:** supply public source and a working build recipe; inclusion is reviewed, not an APK upload. Keep proprietary SDKs out of this artifact. React Native is viable in principle; current inclusion policy permits official Hermes prebuilts, but dependency/build auditing remains necessary. [Inclusion policy](https://f-droid.org/en/docs/Inclusion_Policy/), [React Native precedent](https://f-droid.org/en/2020/10/14/adding-react-native-app-to-f-droid.html).
- **F-Droid signing:** normal F-Droid signing differs from upstream signing; reproducible builds can support upstream signatures. Decide whether to pursue matching signatures or distinct install variants and documented export/reinstall. Do not promise interchangeable Play/GitHub/F-Droid updates before proving them. [Developer FAQ](https://f-droid.org/docs/FAQ_-_App_Developers/), [reproducible builds](https://f-droid.org/docs/Reproducible_Builds/).
- **iOS:** development builds, then TestFlight, then App Store review. TestFlight is beta distribution, not the completed public-store objective.

Also track Android's developer-verification rollout: Google's current guidance sets September 30, 2026 requirements for Play package registration and describes a staged regional rollout for other distribution. Verify the exact package/signing-key registration requirements for every channel at release time; GitHub distribution should not be assumed exempt from evolving device-install rules. [Play package registration](https://support.google.com/googleplay/android-developer/answer/16984799?hl=en), [Android developer verification](https://support.google.com/android-developer-console/answer/16561738?hl=en).

## Sequence and exit criteria

| Stage | Work | Exit criterion |
| --- | --- | --- |
| 0: decisions in parallel | Publisher/D-U-N-S, licensing path, store moderation/access model | Named owner and documented feasible path for each; exact account status confirmed. |
| 1: runtime proof | Minimal React Native app using actual hooks/SDK on both OSs | Core read/publish/challenge/persistence/recovery flow proven on devices; adaptation list bounded. |
| 2: native core loop | Shared UI plus platform behavior, account import/export, reports/blocks | Usable Android/iOS release-like builds with accessible navigation and stable long-thread/media behavior. |
| 3: service integration | Real Forge Images and Forge RPC plus failure handling | Verified authentication, upload/moderation/reporting, errors, cancellation, timeouts, and RPC reconnection; no mocked launch dependency. |
| 4: distribution | GitHub beta, store testing, F-Droid recipe and reproducibility work | Correct signing/source artifacts; policy/privacy materials; channel-specific tests complete. |
| 5: launch | Submit/release each channel when ready; update official download pages | Actual listings/downloads verified, identity migration documented, support/moderation operational. |

Stages overlap where independent. Do not wait for every Forge web integration to begin stage 1, and do not hold an Android beta until Apple review finishes. Do not promise simultaneous availability across review queues. If a required store route proves infeasible, record that as an unmet requirement and revisit scope explicitly.

Remaining choices: initial SFW-only store scope and moderation operator; existing developer-account status; final publisher; App Store license permissions; native package IDs and cross-channel signing; the compatibility spike's toolchain; eventual workspace extraction; when to introduce the Classic label. These are not silently adopted decisions.

## Verification of this research

Evidence consists of current source/installed-package inspection, official platform documentation, repository metadata, public store listings, and a limited client-discussion sample. No device prototype, moderation audit, legal clearance, F-Droid build, store enrollment, or submission was performed. Research and source snapshot dates must accompany later reuse of this document.

Document checks: local Markdown links resolve, the whitespace check reports no errors, and independent review found no actionable issues. `corepack yarn llms:generate` could not run in the dependency-free documentation worktree because Yarn's install state is missing. Running its exact script with Node 22.12.0 (`node scripts/generate-llms-files.mjs`) succeeded; generated files were unchanged because this new research document is outside the generator's curated corpus. No application build was needed for this prose-only change.

Reproduction pointers, relative to the audited repository:

- `package.json`: current versions and application license; `capacitor.config.json:2-4`, `android/app/build.gradle:29-51`: existing app identity/flavors; `.github/workflows/release.yml:307-347`: GitHub APK build/signing.
- `src/lib/media-hosting/providers.ts:14-35`, `src/hooks/use-file-upload.ts:228-269`: current upload providers and Capacitor boundary; `docs/fdroid/fivechan.android.yml:18-20`: unfinished metadata.
- `node_modules/@pkcprotocol/pkc-js/package.json:44-69`: SDK exports; `dist/browser/index.js:4-14`, `dist/browser/pkc/pkc-with-rpc-client.js:12-18`, `dist/browser/pkc/pkc.js:254-264`, `dist/browser/runtime/browser/storage.js:1-17` inside that package: import, inheritance and storage chain.
- `node_modules/@bitsocial/bitsocial-react-hooks/dist/stores/accounts/accounts-database.js:14-29`, `accounts-store.js:104-138`, `account-generator.js:93-129` in the same directory: persistence, import-time initialization, transport defaults and identity; `utils.js:268-367`: DOM media metadata.
- `node_modules/@bitsocial/bitsocial-react-hooks/dist/lib/pkc-js/index.js:37-70`: `setPkcJs()` provides an SDK injection seam, but does not adapt the hooks' own storage or environment assumptions.
- Installed hooks `package.json:13` and SDK `package.json:207`, plus their `LICENSE` files: license findings. Installed artifacts are not committed; pin the recorded versions when reproducing this audit.
