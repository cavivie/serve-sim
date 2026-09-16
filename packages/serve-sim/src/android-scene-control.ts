import { findEmulator } from "./android-device";
import { emulatorRpc, findEmulatorEndpoint } from "./android-environment";

const queues = new Map<string, Promise<unknown>>();
const stops = new Map<string, ReturnType<typeof setTimeout>>();
export function sceneVector(value: unknown, limit: number): { x: number; y: number; z: number } {
  if (!value || typeof value !== "object") throw new Error("Missing scene vector.");
  const v = value as Record<string, unknown>;
  for (const key of ["x", "y", "z"]) if (typeof v[key] !== "number" || !Number.isFinite(v[key]) || Math.abs(v[key] as number) > limit) throw new Error("Invalid scene vector.");
  return v as { x: number; y: number; z: number };
}
export async function controlAndroidScene(request: { device: string; velocity?: unknown; rotation?: unknown; reset?: boolean }) {
  if (!/^emulator-\d+$/.test(request.device)) throw new Error("Scene control requires an emulator.");
  const velocity = request.velocity === undefined ? undefined : sceneVector(request.velocity, 2);
  const rotation = request.rotation === undefined ? undefined : sceneVector(request.rotation, 0.5);
  if (!velocity && !rotation && request.reset !== true) throw new Error("Missing scene operation.");
  const device = request.device;
  const operation = (queues.get(device) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const endpoint = findEmulatorEndpoint(device), emulator = findEmulator();
    if (!endpoint || !emulator) throw new Error("Start the emulator first.");
    if (!["virtualscene", "environment"].includes(endpoint.cameraBack ?? "")) throw new Error("Select Virtual Scene first.");
    if (velocity || request.reset) {
      clearTimeout(stops.get(device)); stops.delete(device);
      const v = request.reset ? { x: 0, y: 0, z: 0 } : velocity!;
      await emulatorRpc(emulator, endpoint, "setVirtualSceneCameraVelocity", v);
      if (v.x || v.y || v.z) {
        // Browser disconnects must never leave the camera drifting indefinitely.
        const timer = setTimeout(() => {
          stops.delete(device);
          void controlAndroidScene({ device, velocity: { x: 0, y: 0, z: 0 } }).catch(() => {});
        }, 700);
        timer.unref(); stops.set(device, timer);
      }
    }
    if (rotation) await emulatorRpc(emulator, endpoint, "rotateVirtualSceneCamera", rotation);
    if (request.reset) {
      for (const target of [0, 1]) await emulatorRpc(emulator, endpoint, "setPhysicalModel", { target, value: { data: [0, 0, 0] }, interpolation: 1 });
    }
    return { ok: true };
  });
  queues.set(device, operation);
  try { return await operation; } finally { if (queues.get(device) === operation) queues.delete(device); }
}
