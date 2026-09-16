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

## Camera media injection

The Android Camera panel uses the same media tile, source menu, Play/Stop, mirror,
and status components/styles as iOS. Source changes apply live while playing.
Images and videos support mirroring; webcam mirroring is unavailable. Clearing
the selection switches to a test pattern. Stop restores the previous environment.

Requires **Android Emulator 36.6.11+**. Validated with **37.1.11 / API 36 ARM64**.
Physical devices do not expose this Camera panel. FFmpeg is used only for test
patterns, mirrored/converted files, and video normalization; ordinary PNG/JPEG
files go directly to the emulator.

The adapter uses Google's official `EmulatorController` gRPC API and the protocol
schema bundled in the installed SDK (`emulator/lib/emulator_controller.proto`):

- `getEnvironment` reads the existing scene.
- `setEnvironment` updates `scene.mode` to `imagefile:`, `videofile:`, or `webcam:`.
- `getHostCameras` supplies the source menu.

New emulators started by serve-sim prepare `environment.ini` and use
`-camera-back environment -camera-front environment`, with a local gRPC port and
`-grpc-use-token`. Existing incompatible sessions are restarted once on first
Play. The adapter reads the current endpoint/token from the emulator's local
registration file; credentials are not returned to the browser. No AVD hardware
configuration rewrite, guest program, Offworld pipe, OBS, or signing is needed.

The environment source is shared by front/back cameras. Updates preserve other
environment settings and verify readback. Readback proves the source was applied;
actual image/video output is verified separately in a camera app. The gRPC API
remains marked experimental in Google's schema, so unsupported emulator versions
produce an explicit upgrade requirement.

Camera operation state/logs and transformed files live under the host temporary
directory's `serve-sim/android-camera`. Transformed files remain while in use and
are removed after replacement or Stop. Platform validation currently covers macOS;
Windows/Linux discovery and webcam capture require separate runtime validation.
