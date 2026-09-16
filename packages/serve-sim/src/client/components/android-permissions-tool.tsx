import { useCallback, useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { ReloadIcon } from "../icons";
import { CollapsibleSection } from "./collapsible-section";
import { simEndpoint } from "../utils/sim-endpoint";
import type { AndroidPermission } from "../../android-permissions";

const labels: Record<string, string> = { CAMERA: "Camera", RECORD_AUDIO: "Microphone", POST_NOTIFICATIONS: "Notifications", ACCESS_FINE_LOCATION: "Precise location", ACCESS_COARSE_LOCATION: "Approximate location", ACCESS_BACKGROUND_LOCATION: "Background location", READ_CONTACTS: "Read contacts", WRITE_CONTACTS: "Write contacts", READ_CALENDAR: "Read calendar", WRITE_CALENDAR: "Write calendar", READ_MEDIA_IMAGES: "Photos", READ_MEDIA_VIDEO: "Videos", READ_MEDIA_AUDIO: "Audio", READ_MEDIA_VISUAL_USER_SELECTED: "Selected photos and videos", READ_EXTERNAL_STORAGE: "Read storage", WRITE_EXTERNAL_STORAGE: "Write storage", BLUETOOTH_CONNECT: "Bluetooth connection", BLUETOOTH_SCAN: "Bluetooth scan", ACTIVITY_RECOGNITION: "Physical activity", ACCESS_MEDIA_LOCATION: "Media location" };
export function AndroidPermissionsTool({ udid, bundleId }: { udid: string; bundleId: string | null }) {
  const [open, setOpen] = useState(false);
  const [permissions, setPermissions] = useState<AndroidPermission[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const request = useCallback(async (action = "status", permission?: string) => {
    if (!bundleId) return;
    const version = generation.current;
    setBusy(true); setError(null);
    try {
      const response = await fetch(simEndpoint("android-permissions"), { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + (window.__SIM_PREVIEW__?.execToken ?? "") }, body: JSON.stringify({ device: udid, packageName: bundleId, action, permission }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Permission request failed");
      if (version === generation.current) setPermissions(data.permissions);
    } catch (e) { if (version === generation.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (version === generation.current) setBusy(false); }
  }, [udid, bundleId]);
  useEffect(() => {
    const currentGeneration = generation;
    currentGeneration.current++; setPermissions([]); setError(null); setBusy(false);
    if (open && bundleId) void request();
    return () => { currentGeneration.current++; };
  }, [bundleId, open, request]);
  return <CollapsibleSection open={open} onOpenChange={setOpen} summary={<span className="text-[11px] font-semibold text-white/50 uppercase tracking-[0.08em]">Permissions</span>}>
    <div className="text-[11px] text-white/50 break-all mb-2">{bundleId ?? "Open an app to manage its permissions."}</div>
    {error && <div role="alert" className="bg-danger/10 border border-danger/20 text-danger-soft text-[11px] px-2 py-1.5 rounded-md">{error}</div>}
    {busy && !permissions.length && <div role="status" className="text-xs text-white/50">Loading permissions…</div>}
    {!busy && bundleId && !error && !permissions.length && <div className="text-xs text-white/50">This app has no runtime permissions.</div>}
    <div className="max-h-[260px] overflow-y-auto flex flex-col gap-1 py-2">
      {permissions.map(p => { const label = (labels[p.name.replace("android.permission.", "")] ?? p.name.replace("android.permission.", "").toLowerCase().replaceAll("_", " ")).replace(/\b[a-z]/g, letter => letter.toUpperCase()); return <div key={p.name} className="flex items-center justify-between gap-2 py-1">
        <span title={p.name} className="text-[12px] text-white/90 flex-1 min-w-0">{label}</span>
        <div role="group" aria-label={label} className="flex gap-0.5 bg-white/[0.04] border border-white/8 rounded-md p-0.5">
          {(["grant", "revoke", "reset"] as const).map(action => <button key={action} disabled={busy || p.fixed} title={p.fixed ? "Managed by Android" : action === "reset" ? "Revoke and allow the app to ask again" : action === "grant" ? "Allow" : "Deny"} aria-label={`${label}: ${action}`} aria-pressed={action === "reset" ? undefined : p.granted === (action === "grant")} onClick={() => void request(action, p.name)} className="w-6 h-5.5 flex items-center justify-center rounded disabled:opacity-40" style={{ color: action === "grant" && p.granted ? "#4ade80" : action === "revoke" && !p.granted ? "#f87171" : "#aaa" }}>
            {action === "grant" ? <Check size={11} strokeWidth={3} /> : action === "revoke" ? <X size={11} strokeWidth={3} /> : <ReloadIcon size={11} strokeWidth={2.4} />}
          </button>)}
        </div>
      </div>; })}
    </div>
    <button disabled={busy || !bundleId} onClick={() => void request()} className="text-[11px] text-white/70 border border-white/12 rounded px-2 py-1">Refresh</button>
  </CollapsibleSection>;
}
