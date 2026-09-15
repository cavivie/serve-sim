# Android browser preview (experimental fork)

Branch `codex/android-preview` starts from upstream PR #130 at
`854dd5f92bdf0bd337892a798bd0a153f271b5db`. That PR is closed and unmerged.
This fork restores Android helper HTTP and WebSocket routing alongside the
newer in-process iOS capture implementation.

## Run locally on macOS

Requirements: Node.js 20+, Bun, Xcode command line tools, and Android SDK with
`adb` available on PATH. Start an Android emulator first.

```sh
bun install --frozen-lockfile
bun run packages/serve-sim/build.ts
adb devices -l
node packages/serve-sim/dist/serve-sim.js --android <device-serial> --port 3400
```

Open `http://127.0.0.1:3400/?device=<device-serial>` in the Codex in-app browser.
The first build compiles native iOS dependencies and can take several minutes.

## Verified

- Android 16 emulator: live H.264 decoded into a 540 × 1200 browser canvas.
- Home toolbar button and pointer swipe to open the app drawer.
- Android helper HTTP video endpoints and WebSocket input routing.
- 35 existing Android, H.264, and middleware selection tests passed.

Audio, keyboard entry, rotation, and physical Android devices have not been
validated in this fork. This remains an experimental preview, not an upstream
Android release.
