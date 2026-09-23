# 5chan Android procedures

Verify these facts against current `capacitor.config.json`, `package.json`, and `android/app/build.gradle` before choosing commands:

- App ID/namespace: `fivechan.android`; web output: `build`.
- Distribution flavors: `github` and `fdroid`. Choose the flavor being tested; there is no single unflavored debug output to assume.
- For GitHub debug, the normal build task is `assembleGithubDebug`, with output `android/app/build/outputs/apk/github/debug/app-github-debug.apk`. Confirm the current task and produced path.

Rebuild only when the installed APK does not represent the code under test or the request requires a build. From the repository root, build web assets and sync Capacitor; then build the selected variant from `android/`:

```bash
corepack yarn build
corepack yarn exec cap sync android
# From android/, for the verified GitHub debug variant:
./gradlew assembleGithubDebug
# From the repository root, after verifying the output:
adb -s SERIAL install -r android/app/build/outputs/apk/github/debug/app-github-debug.apk
adb -s SERIAL shell am start -n fivechan.android/.MainActivity
```

Do not blindly run old scripts using `connectedDebugAndroidTest`: this checkout has flavors. Verify the task for the chosen variant (normally `connectedGithubDebugAndroidTest` for GitHub debug), select `ANDROID_SERIAL`, and filter to the requested class when using instrumentation. Inspect test annotations and results; a class filter does not override `@Ignore`.

## Upload diagnostics

Read only the provider/test implementation relevant to the requested flow:

| Current source | Use |
|---|---|
| `android/app/src/main/java/fivechan/android/MediaUploadAutomationRunner.java` | WebView upload stages and result handling |
| `android/app/src/main/java/fivechan/android/MediaUploadRecipes.java` | Provider selectors and scripts |
| `android/app/src/main/java/fivechan/android/FileUploaderPlugin.java` | Capacitor upload entry point |
| `android/app/src/androidTest/java/fivechan/android/MediaUploadAutomationRunnerTest.java` | HTML fixture diagnostics; currently class-level `@Ignore` |
| `android/app/src/androidTest/java/fivechan/android/ImgurLiveUploadTest.java` | Live Imgur diagnostic; test currently `@Ignore` |
| `android/app/src/androidTest/java/fivechan/android/ImgbbLiveUploadTest.java` | Live Imgbb upload test |
| `android/app/src/androidTest/java/fivechan/android/CatboxLiveUploadTest.java` | Live Catbox upload test |
| `android/app/src/main/assets/fixtures/` | Controlled provider page fixtures |

Live tests upload data to third-party providers. Run them only when that external upload is part of the requested test, using task-owned fixtures. Avoid an unfiltered connected suite when it would include unrequested live uploads. Do not submit a board post unless publication is authorized; upload testing and posting are separate effects.

Capture `MediaUploadAutomation` in addition to `FileUploaderPlugin` and WebView logs. Interpret stages against the runner's current source: page loading, selector/file chooser handling, submit, URL extraction, blocking, and timeouts. Report unavailable/ignored tests accurately rather than substituting stale Postimages commands or claiming a skipped suite passed.
