# Android release handoff: 1.3.4 (21)

Prepared on 6 September 2026 for Google Play's **Internal testing** track.

- Application ID: `ch.saynode.listam`.
- Version name: **1.3.4**. Android version code: **21**, following local release
  1.3.3 (20). The iOS version remains 1.3.4 (24).
- Both Bare backend modules were rebuilt from `listam-packages` at `01f4412`.
- The committed `app.json` is the version source. `npm run android:release`
  synchronizes the generated native project, checks its release-signing
  selection, rebuilds both backend modules, and builds the release AAB.
- Existing upload-key configuration is reused. No keystore or password is
  committed, and no new signing identity is created.

## Artifact and build checks

Upload `dist/releases/listam-1.3.4-21.aab` (190,351,002 bytes, about 181.5 MiB).
Its SHA-256 sidecar and the Hermes source map are preserved alongside it.
These generated release artifacts are intentionally gitignored.

- `npm run android:release`: passed, including Gradle's release lint and
  signing tasks. Mobile CI passed all checks and 160 Node tests locally.
- Google bundletool validation passed; JAR signature verification passed and
  the certificate matches the previous 1.3.3 (20) AAB.
- Final manifest: version 1.3.4 (21), minimum API 29, target API 36,
  `debuggable=false`, `testOnly=false`. API 36 meets
  [Google Play's current target requirement](https://developer.android.com/google/play/requirements/target-sdk).
- All four ABIs are included, with 41 native libraries per ABI. All 82
  64-bit libraries have at least 16 KB ELF alignment and RELRO. The bundle
  requests `PAGE_ALIGNMENT_16K`; generated APKs pass `zipalign -P 16`.
  See [Android's 16 KB guidance](https://developer.android.com/guide/practices/page-sizes).
- The bundle includes 120 native symbol metadata files. Bundletool estimates
  a 59.09 MB download for the tested arm64 Android 16 configuration.
- Runtime smoke test passed in a fresh, isolated arm64 Android 16 emulator:
  embedded backend startup, an online edit, an airplane-mode edit,
  background/resume, and persistence of both edits after an offline cold
  restart. No Java/native fatal crash was recorded.
- Runtime testing used APK splits generated from the release AAB with local
  emulator signing. The upload AAB retains the existing upload signature.
  This emulator uses 4 KB pages and has no Play billing service, so 16 KB
  runtime behavior and Play purchases remain device/Play-track checks.

The machine-readable `.validation.json` and `.smoke.png` capture are saved
alongside the versioned AAB.

Detailed local logs: `/tmp/listam-android-release-2026-09-06.zCAnUF/`.

## Upload and promote

1. In Play Console, open Listam, then **Test and release > Testing > Internal
   testing** and create a release. Check that version code 21 has not already
   been uploaded; Play Console history was not queried during preparation.
2. Upload the AAB, add release notes, resolve any validation messages, select
   the intended tester list, and roll out to Internal testing.
3. Testers must opt in using the track's link and install/update through Play.
   Use configured license testers for billing and restore-purchase checks.
4. Review Play's pre-launch report and perform the device checks below.
5. When accepted, promote the **same tested bundle** to production. Any code
   change requires a new build with a higher version code and another test run.

Use the Internal testing **track** for this release. Artifacts uploaded through
the separate Internal app sharing facility cannot be promoted to testing or
production tracks. See Google's [testing-track guide](https://support.google.com/googleplay/android-developer/answer/9845334?hl=en)
and [Internal app sharing restrictions](https://support.google.com/googleplay/android-developer/answer/9844679?hl=en).
No Play Console upload, rollout, or production publication is performed here.

## Before production

- Update an existing installation through Play without losing lists, sharing
  membership, or subscription state. Verify purchases and restoration with
  Play-installed builds.
- Check Notes, grocery edits, shared-list joining, background/resume catch-up,
  airplane-mode edits, and relaunch persistence on physical devices.
- Verify camera scanning, document import/export, and system-bar/keyboard
  layout on Android 16, plus one older supported Android version.
- Test on a 16 KB page-size device/emulator; static library alignment alone
  does not prove runtime behavior in that environment.
- Review the existing Data safety, app-access, and privacy-policy declarations
  against the shipped features before production promotion.

The backend validation changes require coordinated desktop/headless updates
for peers sharing a base. Existing divergent views are not automatically
repaired. Headless Linux CI still has a previously observed join/restart
timeout, including the retry of [this run](https://github.com/romme86/listam-headless/actions/runs/34032439222);
all 50 headless tests passed locally during the iOS preparation. Validate real
cross-device join/restart flows before a production rollout. Further context:
the [iOS release handoff](1.3.4.md) and the workspace review in
`listam-tools/reviews/2026-09-05-follow-up.md`.

## Suggested release notes

- Adds named Notes lists.
- Improves background/resume synchronization and shared-list recovery.
- Updates dependency compatibility and reliability.
- Pauses the experimental ESP32 pairing and voice features.
