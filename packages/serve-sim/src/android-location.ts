import { findEmulator } from "./android-device";
import { emulatorRpc, findEmulatorEndpoint } from "./android-environment";

export async function setAndroidLocation(request: { device: string; lat: number; lng: number; altitude: number; speed: number; bearing: number }) {
  if (!/^emulator-\d+$/.test(request.device)) throw new Error("Location requires an Android emulator.");
  for (const key of ["lat", "lng", "altitude", "speed", "bearing"] as const) {
    if (typeof request[key] !== "number" || !Number.isFinite(request[key])) throw new Error(`Invalid ${key}.`);
  }
  if (Math.abs(request.lat) > 90 || Math.abs(request.lng) > 180 || request.speed < 0 || request.bearing < 0 || request.bearing >= 360) throw new Error("Invalid location range.");
  const endpoint = findEmulatorEndpoint(request.device), emulator = findEmulator();
  if (!endpoint?.token || !emulator) throw new Error("Start this emulator from serve-sim to enable location control.");
  // The emulator GPS transport consumes knots despite the proto comment saying m/s.
  // Verified against Android Location.getSpeed: 1.4 raw becomes 0.7202 m/s.
  await emulatorRpc(emulator, endpoint, "setGps", { latitude: request.lat, longitude: request.lng, altitude: request.altitude, speed: request.speed * 3600 / 1852, bearing: request.bearing, satellites: 8, passiveUpdate: false });
  return { ok: true };
}
