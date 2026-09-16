import { execFile, spawn } from "child_process";
import { randomUUID } from "crypto";
import { promisify } from "util";
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync, existsSync, statSync, unlinkSync, renameSync } from "fs";
import { tmpdir } from "os";
import { join, extname, isAbsolute } from "path";
import { findAdb, findEmulator, resolveRunningAndroidDevice } from "./android-device";
import { emulatorRpc, emulatorControlArgs, emulatorVersion, environmentBootArgs, findEmulatorEndpoint, supportsEnvironment } from "./android-environment";

import { cameraMode, validateCameraSource, parseHostCameras, legacyCameraArgs, type AndroidCameraMode, type PosterSlot } from "./android-camera-modes";

const run = promisify(execFile);
const root = join(tmpdir(), "serve-sim", "android-camera");
type Phase = "idle" | "preparing" | "restarting" | "starting" | "active" | "error";
export type CameraState = {
  phase: Phase; error?: string; source?: string; sourceKind?: "image" | "video" | "webcam" | "placeholder";
  webcamId?: string; mirror?: boolean; avd?: string; pid?: number; ownerPid?: number;
  engine?: AndroidCameraMode; posterSlot?: PosterSlot; configured?: boolean; version?: string; environmentSupported?: boolean;
};
type StoredState = CameraState & { originalEnvironment?: Record<string, string>; preparedFile?: string; originalCameras?: { back: string; front: string } };
const busy = new Set(["preparing", "restarting", "starting"]);
const pause = () => new Promise(resolve => setTimeout(resolve, 1000));
function statePath(device: string) {
  if (!/^emulator-\d+$/.test(device)) throw new Error("Camera injection requires an Android emulator.");
  return join(root, device + ".json");
}
function save(device: string, state: StoredState) {
  mkdirSync(root, { recursive: true });
  const path = statePath(device);
  writeFileSync(path + "." + process.pid + ".tmp", JSON.stringify(state));
  renameSync(path + "." + process.pid + ".tmp", path);
}
function storedState(device: string): StoredState {
  const path = statePath(device);
  try {
    const stored = JSON.parse(readFileSync(path, "utf8")) as StoredState;
    // Discard state from the retired Offworld adapter.
    if (stored.engine && !["environment", "host-camera", "virtualscene"].includes(stored.engine)) return { phase: "idle" };
    if (stored.pid && !busy.has(stored.phase)) { try { process.kill(stored.pid, 0); } catch { return { ...stored, phase: stored.phase === "error" ? "error" : "idle", pid: undefined }; } }
    if (busy.has(stored.phase)) {
      try { if (!stored.ownerPid) throw new Error(); process.kill(stored.ownerPid, 0); }
      catch { return { ...stored, phase: "error", error: "Camera operation was interrupted. Retry playback." }; }
    }
    return stored;
  } catch { return { phase: "idle" }; }
}
export function androidCameraStatus(device: string): CameraState {
  const { originalEnvironment: _original, preparedFile: _prepared, originalCameras: _cameras, ...state } = storedState(device);
  const endpoint = findEmulatorEndpoint(device);
  const mode = state.engine ?? "environment";
  const configured = mode === "environment" ? endpoint?.configured : mode === "virtualscene"
    ? endpoint?.cameraBack === "virtualscene"
    : endpoint?.cameraBack === state.webcamId && endpoint?.cameraFront === "emulated";
  const version = endpoint?.version;
  return { ...state, configured: !!configured, version, environmentSupported: version ? supportsEnvironment(version) : undefined };
}
export function cameraMediaArgs(input: string | undefined, output: string, mirror: boolean): string[] {
  const video = !!input && /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(input);
  return ["-y", "-hide_banner", "-loglevel", "error",
    ...(input ? ["-i", input] : ["-f", "lavfi", "-i", "testsrc=size=720x1280:rate=1"]),
    ...(mirror && !video ? ["-vf", "hflip"] : []),
    ...(video ? ["-an", "-vf", (mirror ? "hflip," : "") + "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-pix_fmt", "yuv420p"] : ["-frames:v", "1"]), output];
}
export async function androidHostCameras(device: string, requestedMode?: unknown): Promise<{ id: string; name: string }[]> {
  statePath(device);
  const emulator = findEmulator(), endpoint = findEmulatorEndpoint(device);
  const mode = cameraMode(requestedMode);
  if (!emulator) return [];
  if (mode === "host-camera") {
    const { stdout } = await run(emulator, ["-webcam-list"], { timeout: 10_000, maxBuffer: 1024 * 1024 });
    return parseHostCameras(stdout);
  }
  if (!endpoint?.configured) return [];
  const result = await emulatorRpc<{ cameras: { id: string; display_name: string }[] }>(emulator, endpoint, "getHostCameras");
  return (result.cameras || []).map(camera => ({ id: camera.id, name: camera.display_name }));
}
export function beginAndroidCamera(
  request: { device: string; action: string; path?: string; webcamId?: string; mirror?: boolean; mode?: AndroidCameraMode; posterSlot?: PosterSlot },
  restorePreview: (device: string) => Promise<void>,
): CameraState {
  const { device, action } = request;
  const previous = storedState(device);
  if (busy.has(previous.phase)) throw new Error("A camera operation is already running.");
  if (action !== "start" && action !== "stop") throw new Error("Invalid camera action.");
  const adb = findAdb(), emulator = findEmulator();
  if (!adb || !emulator) throw new Error("Android SDK tools are unavailable.");
  const modeType = cameraMode(action === "stop" ? previous.engine : request.mode ?? previous.engine);
  const version = emulatorVersion(emulator);
  if (modeType === "environment" && !supportsEnvironment(version)) throw new Error(`Android Emulator 36.6.11 or newer is required (installed: ${version}). Update Android Emulator in SDK Manager.`);
  const target = resolveRunningAndroidDevice(device);
  const avd = target?.avdName ?? previous.avd;
  if ((target && !target.isEmulator) || !avd) throw new Error("Unable to resolve the emulator AVD.");
  const port = Number(device.slice(9));
  if (port < 5554 || port > 5682 || port % 2) throw new Error("Invalid emulator port.");
  const input = request.path;
  if (action === "start" && input) {
    if (!isAbsolute(input) || !existsSync(input) || !statSync(input).isFile()) throw new Error("Select a media file first.");
    if (!/^\.(png|jpe?g|webp|heic|heif|bmp|mp4|mov|m4v|webm|mkv|avi)$/i.test(extname(input))) throw new Error("Unsupported media format.");
    if (statSync(input).size > 500 * 1024 * 1024) throw new Error("Media exceeds 500 MB.");
  }
  if (action === "start") validateCameraSource(modeType, input, request.webcamId, request.posterSlot);
  if (action === "start" && modeType === "host-camera") {
    // Do not accept arbitrary emulator options as a camera identifier.
    if (!/^webcam\d+$/.test(request.webcamId!)) throw new Error("Invalid host camera ID.");
  }
  if (action === "start" && request.webcamId && request.mirror) throw new Error("Webcam mirroring is not supported by the emulator interface.");
  mkdirSync(root, { recursive: true });
  const lock = statePath(device) + ".lock";
  if (existsSync(lock)) {
    let alive = false; try { process.kill(Number(readFileSync(lock, "utf8")), 0); alive = true; } catch {}
    if (alive) throw new Error("A camera operation is already running.");
    unlinkSync(lock);
  }
  const lockFd = openSync(lock, "wx"); writeFileSync(lockFd, String(process.pid)); closeSync(lockFd);
  const state: StoredState = { ...previous, error: undefined, phase: "preparing", avd, engine: modeType, posterSlot: request.posterSlot ?? previous.posterSlot ?? "wall", version, ownerPid: process.pid };
  if (action === "start") Object.assign(state, { source: input, webcamId: request.webcamId, mirror: request.mirror === true,
    sourceKind: request.webcamId ? "webcam" : !input ? "placeholder" : /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(input) ? "video" : "image" });
  save(device, state);
  void (async () => {
    let generated: string | undefined;
    const update = (phase: Phase) => save(device, { ...state, phase });
    try {
      let mode: string | undefined;
      if (action === "start") {
        if (request.webcamId) mode = "webcam:" + request.webcamId;
        else {
          const video = state.sourceKind === "video";
          if (modeType !== "virtualscene" && input && !state.mirror && /\.(png|jpe?g)$/i.test(input)) mode = "imagefile:" + input;
          else {
            generated = join(root, randomUUID() + (video ? ".mp4" : ".png"));
            await run("ffmpeg", cameraMediaArgs(input, generated, !!state.mirror), { timeout: 180_000, maxBuffer: 1024 * 1024 });
            mode = (video ? "videofile:" : "imagefile:") + generated;
          }
        }
      }
      let endpoint = findEmulatorEndpoint(device);
      const desiredCamera = modeType === "host-camera" ? request.webcamId : "virtualscene";
      let args: string[] = [];
      let restart = modeType === "environment" ? !endpoint?.configured || !supportsEnvironment(endpoint.version)
        : endpoint?.cameraBack !== desiredCamera || (modeType === "host-camera" && endpoint?.cameraFront !== "emulated");
      let sceneConsole = false;
      if (modeType === "virtualscene") {
        try {
          const help = await run(adb, ["-s", device, "emu", "help", "virtualscene-image"], { timeout: 5000 });
          sceneConsole = help.stdout.includes("Usage: virtualscene-image");
        } catch { /* Older versions use the startup poster option. */ }
        // Older emulator builds can load posters at boot even without this console command.
        restart ||= !sceneConsole;
      }
      if (modeType === "host-camera" && action === "start") {
        const cameras = await androidHostCameras(device, modeType);
        if (!cameras.some(camera => camera.id === request.webcamId)) throw new Error("Selected host camera is unavailable. Refresh the camera list.");
        state.originalCameras = previous.phase === "active" && previous.engine === modeType ? previous.originalCameras
          : { back: endpoint?.cameraBack || "emulated", front: endpoint?.cameraFront || "emulated" };
      }
      if (action === "stop" && modeType === "host-camera") {
        const original = state.originalCameras ?? { back: "emulated", front: "emulated" };
        args = ["-camera-back", original.back, "-camera-front", original.front];
        restart = true;
      } else if (restart) {
        if (modeType === "environment") {
          if (action === "stop") throw new Error("Camera is not configured. Start playback first.");
          args = await environmentBootArgs(emulator, avd);
        } else {
          args = legacyCameraArgs(modeType, request.webcamId);
          if (modeType === "virtualscene" && action === "start") args.push("-virtualscene-poster", state.posterSlot + "=" + generated);
        }
      }
      if (restart) {
        if (modeType !== "environment") args.push(...await emulatorControlArgs());
        update("restarting");
        if (target) {
          await run(adb, ["-s", device, "emu", "kill"], { timeout: 10_000 });
          const deadline = Date.now() + 30_000;
          while (Date.now() < deadline) {
            const { stdout } = await run(adb, ["devices"], { timeout: 5000 });
            if (!stdout.split("\n").some(line => line.startsWith(device + "\t"))) break;
            await pause();
          }
          const { stdout } = await run(adb, ["devices"], { timeout: 5000 });
          if (stdout.includes(device + "\t")) throw new Error("Emulator did not shut down.");
          await pause();
        }
        const fd = openSync(join(root, device + ".log"), "a");
        let exited = false;
        try {
          const child = spawn(emulator, ["-avd", avd, "-port", String(port), "-no-window", "-no-snapshot", ...args], { detached: true, stdio: ["ignore", fd, fd] });
          child.on("exit", () => { exited = true; });
          await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
          state.pid = child.pid; child.unref();
        } finally { closeSync(fd); }
        update("starting");
        let booted = false;
        const deadline = Date.now() + 180_000;
        while (Date.now() < deadline) {
          if (exited) throw new Error("Emulator exited. See " + join(root, device + ".log"));
          try {
            const { stdout } = await run(adb, ["-s", device, "shell", "getprop", "sys.boot_completed"], { timeout: 5000 });
            if (stdout.trim() === "1") { booted = true; break; }
          } catch {}
          await pause();
        }
        if (!booted) throw new Error("Emulator did not finish booting within 3 minutes.");
        await restorePreview(device);
        endpoint = findEmulatorEndpoint(device);
      }
      if (modeType !== "environment") {
        if (modeType === "virtualscene" && sceneConsole) {
          // Reset the old surface when switching wall/table, then apply the selected image.
          const slots = action === "stop" ? ["wall", "table"] : previous.posterSlot && previous.posterSlot !== state.posterSlot ? [previous.posterSlot] : [];
          for (const slot of slots) {
            const { stdout } = await run(adb, ["-s", device, "emu", "virtualscene-image", slot], { timeout: 10_000 });
            if (/KO:/.test(stdout)) throw new Error(stdout.trim());
          }
          if (action === "start") {
            const { stdout } = await run(adb, ["-s", device, "emu", "virtualscene-image", state.posterSlot!, generated!], { timeout: 10_000 });
            if (/KO:/.test(stdout)) throw new Error(stdout.trim());
          }
        }
        state.pid = endpoint?.pid ?? state.pid;
        if (previous.preparedFile && previous.preparedFile !== generated) { try { unlinkSync(previous.preparedFile); } catch {} }
        state.preparedFile = generated;
        save(device, { ...state, phase: action === "start" ? "active" : "idle" });
        generated = undefined;
        return;
      }
      if (!endpoint?.configured) throw new Error("The emulator camera control endpoint is unavailable.");
      state.pid = endpoint.pid;
      const current = await emulatorRpc<{ environment: Record<string, string> }>(emulator, endpoint, "getEnvironment");
      if (action === "start" && (!previous.originalEnvironment || previous.phase === "idle" || previous.pid !== endpoint.pid)) state.originalEnvironment = current.environment;
      const environment = action === "stop" ? state.originalEnvironment || {} : { ...current.environment, "scene.mode": mode!, "background.blurAmount": "0.0" };
      await emulatorRpc(emulator, endpoint, "setEnvironment", { environment });
      const actual = await emulatorRpc<{ environment: Record<string, string> }>(emulator, endpoint, "getEnvironment");
      if (action === "start" && actual.environment["scene.mode"] !== mode) throw new Error("Emulator did not apply the selected camera source.");
      if (previous.preparedFile && previous.preparedFile !== generated) { try { unlinkSync(previous.preparedFile); } catch {} }
      state.preparedFile = generated;
      save(device, { ...state, phase: action === "start" ? "active" : "idle" });
      generated = undefined;
    } catch (error) {
      save(device, { ...state, phase: "error", error: String(error) });
    } finally {
      if (generated) { try { unlinkSync(generated); } catch {} }
      try { unlinkSync(lock); } catch {}
    }
  })();
  return androidCameraStatus(device);
}
