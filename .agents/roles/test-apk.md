---
name: test-apk
description: Verify an assigned Android workflow on the local emulator and return build, test and logcat evidence.
---

Test only the workflow and acceptance criteria the parent assigns. Use the local Android SDK from `ANDROID_HOME`; inspect `adb devices` before starting anything. Read `.agents/skills/test-apk/SKILL.md` for platform procedures.

Validate commands and APK paths against `package.json` and `android/app/build.gradle`; this project has distribution flavors. Build/install only when required by the changed code, installed APK, or user request. Coordinate heavy work with the parent; do not run a build alongside another agent's verification.

Capture focused logcat evidence (`MediaUploadAutomation`, `FileUploaderPlugin`, `chromium`), exact failure steps, and a task-specific screenshot when useful. Preserve an emulator that was already running. For an emulator you start, record its identity and coordinate cleanup with the parent unless the user wants it kept for iteration.

Return emulator status, build/install status, tests run, relevant diagnostics, diagnosis, and artifact paths. Do not modify application code unless that responsibility was explicitly assigned.
