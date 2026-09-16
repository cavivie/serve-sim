export type AndroidCameraMode = "environment" | "host-camera" | "virtualscene";
export type PosterSlot = "wall" | "table";

export function cameraMode(value: unknown): AndroidCameraMode {
  if (value === undefined) return "environment";
  if (value === "environment" || value === "host-camera" || value === "virtualscene") return value;
  throw new Error("Invalid camera mode.");
}

export function validateCameraSource(mode: AndroidCameraMode, input?: string, webcamId?: string, slot: string = "wall") {
  if (input && webcamId) throw new Error("Choose one camera source.");
  if (mode === "host-camera" && (!webcamId || input)) throw new Error("Select a host camera first.");
  if (mode === "host-camera" && !/^webcam\d+$/.test(webcamId!)) throw new Error("Invalid host camera ID. Refresh the camera list.");
  if (mode === "virtualscene" && (webcamId || (input && /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(input)))) throw new Error("Virtual Scene supports images only.");
  if (slot !== "wall" && slot !== "table") throw new Error("Invalid virtual scene surface.");
}

export function parseHostCameras(output: string): { id: string; name: string }[] {
  return [...output.matchAll(/Camera\s+'(.+?)'[^\r\n]*?'(webcam\d+)'/g)].map(match => ({ id: match[2]!, name: match[1]! }));
}

export function legacyCameraArgs(mode: "host-camera" | "virtualscene", webcamId?: string): string[] {
  const source = mode === "virtualscene" ? "virtualscene" : webcamId!;
  validateCameraSource(mode, undefined, webcamId);
  return ["-camera-back", source, "-camera-front", "emulated"];
}
