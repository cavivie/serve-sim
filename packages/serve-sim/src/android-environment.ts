import { execFileSync } from "child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { dirname, join } from "path";
import { createServer } from "net";
import * as grpc from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";

// Use the official EmulatorController schema shipped with the installed SDK.
// https://android.googlesource.com/platform/tools/base/+/refs/heads/mirror-goog-studio-main/emulator/proto/emulator_controller.proto
export function parseIni(contents: string): Record<string, string> {
  return Object.fromEntries(contents.split(/\r?\n/).filter(line => line.includes("=") && !/^\s*[#;]/.test(line))
    .map(line => { const i = line.indexOf("="); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; }));
}
export function supportsEnvironment(version: string): boolean {
  const [major = 0, minor = 0, patch = 0] = version.split(".").map(Number);
  return major > 36 || (major === 36 && (minor > 6 || (minor === 6 && patch >= 11)));
}
export function emulatorVersion(emulator: string): string {
  const output = execFileSync(emulator, ["-version"], { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] });
  return /version\s+([\d.]+)/.exec(output)?.[1] || "0";
}
export function avdDirectory(avd: string): string {
  if (!/^[\w.-]+$/.test(avd)) throw new Error("Invalid AVD name.");
  const home = process.env.ANDROID_AVD_HOME || join(process.env.ANDROID_USER_HOME || join(homedir(), ".android"), "avd");
  const ini = parseIni(readFileSync(join(home, avd + ".ini"), "utf8"));
  return ini.path || join(home, avd + ".avd");
}
export async function environmentBootArgs(emulator: string, avd: string): Promise<string[]> {
  if (!supportsEnvironment(emulatorVersion(emulator))) return [];
  // The official reload RPC requires this file to have existed at boot.
  const path = join(avdDirectory(avd), "environment.ini");
  if (!existsSync(path)) {
    try { writeFileSync(path, "version=1\nscene.mode=mesh3d:Toren1BD.obj\nbackground.enabled=true\nbackground.blurAmount=0.0\n", { flag: "wx" }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  }
  return ["-camera-back", "environment", "-camera-front", "environment", ...await emulatorControlArgs()];
}
export async function emulatorControlArgs(): Promise<string[]> {
  const port = await new Promise<number>((resolve, reject) => {
    const server = createServer(); server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { const address = server.address(); const port = typeof address === "object" && address ? address.port : 0; server.close(error => error ? reject(error) : resolve(port)); });
  });
  return ["-grpc", String(port), "-grpc-use-token"];
}
export type EmulatorEndpoint = { pid: number; port: number; token: string; avd: string; directory: string; version: string; configured: boolean; cameraBack?: string; cameraFront?: string };
export function findEmulatorEndpoint(device: string): EmulatorEndpoint | undefined {
  if (!/^emulator-\d+$/.test(device)) return undefined;
  const roots = [join(homedir(), "Library/Caches/TemporaryItems/avd/running"), join(tmpdir(), "avd/running"),
    ...(process.env.XDG_RUNTIME_DIR ? [join(process.env.XDG_RUNTIME_DIR, "avd/running")] : [])];
  for (const root of new Set(roots)) {
    let entries: string[]; try { entries = readdirSync(root); } catch { continue; }
    for (const entry of entries) {
      const match = /^pid_(\d+)\.ini$/.exec(entry); if (!match) continue;
      try {
        const pid = Number(match[1]); process.kill(pid, 0);
        const values = parseIni(readFileSync(join(root, entry), "utf8"));
        if (values["port.serial"] !== device.slice(9)) continue;
        const port = Number(values["grpc.port"] || "0");
        if (!Number.isInteger(port) || port < 0 || port > 65535) continue;
        const directory = values["avd.dir"]!;
        const hardware = parseIni(readFileSync(join(directory, "hardware-qemu.ini"), "utf8"));
        return { pid, port, token: values["grpc.token"] || "", avd: values["avd.id"]!, directory,
          cameraBack: hardware["hw.camera.back"], cameraFront: hardware["hw.camera.front"],
          version: values["emulator.version"] || "0", configured: hardware["hw.camera.back"] === "environment" && hardware["hw.camera.front"] === "environment"
            && existsSync(join(directory, "environment.ini")) && !!values["grpc.token"] };
      } catch { continue; }
    }
  }
  return undefined;
}
let schema: grpc.GrpcObject | undefined;
function createClient(emulator: string, endpoint: EmulatorEndpoint): grpc.Client {
  if (!endpoint.token) throw new Error("Restart this emulator from serve-sim to enable authenticated camera control.");
  schema ??= grpc.loadPackageDefinition(loadSync(join(dirname(emulator), "lib/emulator_controller.proto"), { keepCase: true, defaults: true }));
  const android = schema.android as grpc.GrpcObject;
  const emulation = android.emulation as grpc.GrpcObject;
  const control = emulation.control as grpc.GrpcObject;
  const Client = control.EmulatorController as grpc.ServiceClientConstructor;
  return new Client("127.0.0.1:" + endpoint.port, grpc.credentials.createInsecure());
}
export async function emulatorRpc<T>(emulator: string, endpoint: EmulatorEndpoint, method: "setGps" | "getEnvironment" | "setEnvironment" | "getHostCameras" | "rotateVirtualSceneCamera" | "setVirtualSceneCameraVelocity" | "getPhysicalModel" | "setPhysicalModel", request: object = {}): Promise<T> {
  const client = createClient(emulator, endpoint);
  const metadata = new grpc.Metadata(); metadata.set("authorization", "Bearer " + endpoint.token);
  try {
    return await new Promise<T>((resolve, reject) => {
      const call = (client as unknown as Record<string, Function>)[method]!;
      call.call(client, request, metadata, { deadline: Date.now() + 10_000 }, (error: grpc.ServiceError | null, value: T) => {
        if (error) reject(new Error(`Emulator ${method} failed (${error.code}): ${error.details.replaceAll(endpoint.token, "[redacted]")}`));
        else resolve(value);
      });
    });
  } finally { client.close(); }
}
