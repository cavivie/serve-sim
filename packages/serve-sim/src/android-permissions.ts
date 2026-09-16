import { adb } from "./android-device";
export interface AndroidPermission { name: string; granted: boolean; fixed: boolean; flags: string[] }
export function parseAndroidPermissions(text: string, user: number): AndroidPermission[] {
  let currentUser = -1, runtime = false;
  const result = new Map<string, AndroidPermission>();
  for (const line of text.split("\n")) {
    const matchUser = /^\s*User (\d+):/.exec(line);
    if (matchUser) { currentUser = Number(matchUser[1]); runtime = false; }
    if (line.trim() === "runtime permissions:") { runtime = currentUser === user; continue; }
    if (!runtime) continue;
    const match = /^\s+([\w.]+): granted=(true|false), flags=\[([^\]]*)\]/.exec(line);
    if (match) {
      const flags = match[3]!.split("|").map(s => s.trim()).filter(Boolean);
      result.set(match[1]!, { name: match[1]!, granted: match[2] === "true", flags, fixed: flags.includes("SYSTEM_FIXED") || flags.includes("POLICY_FIXED") });
    } else if (line.trim() && !/^\s{8,}/.test(line)) runtime = false;
  }
  return [...result.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export function androidPermissions(request: { device: string; packageName: string; action?: string; permission?: string }) {
  const { device, packageName, action = "status", permission } = request;
  if (!/^[\w.:-]+$/.test(device) || !/^[\w]+(?:\.[\w]+)+$/.test(packageName)) throw new Error("Invalid device or application.");
  const user = Number(adb(["-s", device, "shell", "am", "get-current-user"]).trim());
  if (!Number.isInteger(user) || user < 0) throw new Error("Cannot determine Android user.");
  const read = () => parseAndroidPermissions(adb(["-s", device, "shell", "dumpsys", "package", packageName]), user);
  const permissions = read();
  if (action === "status") return { permissions };
  if (!["grant", "revoke", "reset"].includes(action)) throw new Error("Invalid permission action.");
  const entry = permissions.find(p => p.name === permission);
  if (!entry || entry.fixed) throw new Error("Permission is unavailable or managed by the system.");
  const pm = (args: string[]) => adb(["-s", device, "shell", "pm", ...args, "--user", String(user), packageName, entry.name]);
  pm([action === "grant" ? "grant" : "revoke"]);
  if (action === "reset") adb(["-s", device, "shell", "pm", "clear-permission-flags", "--user", String(user), packageName, entry.name, "user-set", "user-fixed"]);
  const updated = read();
  const actual = updated.find(p => p.name === permission);
  if (!actual || actual.granted !== (action === "grant")) throw new Error("Android did not apply this permission. Check application and OS restrictions.");
  return { permissions: updated };
}
