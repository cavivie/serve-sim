import { execFile } from "child_process";
import { findAdb } from "./android-device";
import type { AxSnapshot } from "./ax-shared";

const decode = (value: string) => value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
  if (entity.startsWith("#")) { const n = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)); return n <= 0x10ffff ? String.fromCodePoint(n) : ""; }
  return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string,string>)[entity] ?? "";
});
export function parseAndroidAx(xml: string, width: number, height: number): AxSnapshot {
  if (!xml.includes("<hierarchy")) throw new Error("Android accessibility data unavailable");
  const rotation = Number(xml.match(/<hierarchy[^>]*rotation="(\d+)"/)?.[1] ?? 0);
  if (rotation === 1 || rotation === 3) [width, height] = [height, width];
  const elements: AxSnapshot["elements"] = [];
  for (const match of xml.matchAll(/<node\b([^>]+)>/g)) {
    const a = Object.fromEntries([...match[1]!.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1]!, decode(m[2]!)]));
    const bounds = a.bounds?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
    if (!bounds) continue;
    const [x,y,right,bottom] = bounds.slice(1).map(Number) as [number,number,number,number];
    if (right <= x || bottom <= y) continue;
    if (!a.text && !a["content-desc"] && a.clickable !== "true" && a.focusable !== "true") continue;
    const path = String(elements.length);
    elements.push({ id: `${a["resource-id"] || a.class}:${path}`, path,
      label: a.password === "true" ? "Password" : a["content-desc"] || a.text || a["resource-id"] || "",
      value: a.checkable === "true" ? a.checked || "false" : "",
      role: a.class || "element", type: a.class || "element", enabled: a.enabled !== "false",
      frame: {x,y,width:right-x,height:bottom-y} });
    if (elements.length >= 500) break;
  }
  return {screen:{width,height}, elements};
}
const inflight = new Map<string, Promise<AxSnapshot>>();
export function androidAxSnapshot(serial: string): Promise<AxSnapshot> {
  const existing = inflight.get(serial); if (existing) return existing;
  const run = (args: string[]) => new Promise<string>((resolve,reject) => {
    execFile(findAdb() ?? "adb", ["-s",serial,...args], {encoding:"utf8",timeout:12000,maxBuffer:4*1024*1024}, (err,out) => err ? reject(err) : resolve(out));
  });
  const result = (async () => {
    const size = await run(["shell","wm","size"]);
    const match = [...size.matchAll(/(?:Physical|Override) size:\s*(\d+)x(\d+)/g)].pop();
    if (!match) throw new Error("Android screen dimensions unavailable");
    return parseAndroidAx(await run(["exec-out","uiautomator","dump","/dev/tty"]), Number(match[1]), Number(match[2]));
  })().finally(() => inflight.delete(serial));
  inflight.set(serial,result); return result;
}
