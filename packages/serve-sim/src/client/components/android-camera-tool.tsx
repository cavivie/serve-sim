import { AndroidSceneControls } from "./android-scene-controls";
import { CameraInjectionMode } from "./camera-injection-mode";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FlipHorizontal2, Images, X } from "lucide-react";
import { PlayGlyph, StopGlyph, ReloadIcon } from "../icons";
import { CollapsibleSection } from "./collapsible-section";
import { CameraInlineBanner, CameraMediaPreview, CameraStatusPill, CameraTestPatternHint, type CamWebcam } from "./camera-tool";
import { execOnHost } from "../utils/exec";
import { uploadFileToTmp, fileExtension } from "../utils/drop";
import { simEndpoint } from "../utils/sim-endpoint";
import type { AndroidCameraMode, PosterSlot } from "../../android-camera-modes";
import type { CameraState } from "../../android-camera";

async function requestCamera<T = CameraState>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(simEndpoint("android-camera"), {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + (window.__SIM_PREVIEW__?.execToken ?? "") },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Camera request failed");
  return data;
}
const phaseLabels = { idle: "Ready", preparing: "Preparing media…", restarting: "Restarting emulator…", starting: "Restoring preview…", active: "Active", error: "Failed" };
type Selection = { path?: string; webcamId?: string; name?: string; kind: "image" | "video" | "webcam" | "placeholder" };
export function AndroidCameraTool({ udid }: { udid: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<CameraState>({ phase: "idle" });
  const [selectedMode, setSelectedMode] = useState<AndroidCameraMode | null>(null);
  const [selectedSlot, setPosterSlot] = useState<PosterSlot | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [mirror, setMirror] = useState<boolean | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(false);
  const [cameras, setCameras] = useState<CamWebcam[]>([]);
  const [loadingCameras, setLoadingCameras] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const busy = uploading || submitting || ["preparing", "restarting", "starting"].includes(state.phase);
  const mode = selectedMode ?? state.engine ?? "environment";
  const posterSlot = selectedSlot ?? state.posterSlot ?? "wall";
  const active = state.phase === "active" && mode === (state.engine ?? "environment")
    && !(mode === "virtualscene" && posterSlot !== (state.posterSlot ?? "wall"))
    && !(mode === "host-camera" && selection && selection.webcamId !== state.webcamId);
  const environmentUnavailable = mode === "environment" && state.environmentSupported === false;
  const chosen = selection ?? { path: state.source, webcamId: state.webcamId, kind: state.sourceKind ?? "placeholder", name: state.source?.split("/").pop() };
  const mirrored = mirror ?? state.mirror ?? false;
  useEffect(() => {
    let cancelled = false; let timer: ReturnType<typeof setTimeout>;
    setSelection(null); setSelectedMode(null); setPosterSlot(null); setMirror(null); setError("");
    const poll = async () => {
      try { const result = await requestCamera({ device: udid, action: "status" }); if (!cancelled) setState(result); }
      catch (e) { if (!cancelled) setError(String(e)); }
      if (!cancelled) timer = setTimeout(poll, 2000);
    };
    void poll(); return () => { cancelled = true; clearTimeout(timer); };
  }, [udid]);
  useLayoutEffect(() => {
    if (!menu) return;
    const update = () => {
      const rect = trigger.current?.getBoundingClientRect(); if (!rect) return;
      const height = popup.current?.offsetHeight ?? 180;
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 228)), top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - height - 8)) });
    };
    update(); window.addEventListener("resize", update); window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [menu, cameras, loadingCameras]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) => { if (!popup.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setMenu(false); };
    window.addEventListener("mousedown", close); return () => window.removeEventListener("mousedown", close);
  }, [menu]);
  const refreshCameras = async () => {
    setLoadingCameras(true);
    try { setCameras(await requestCamera<CamWebcam[]>({ device: udid, action: "cameras", mode })); }
    catch (e) { setError(String(e)); } finally { setLoadingCameras(false); }
  };
  const apply = async (action: "start" | "stop", source = chosen, flip = mirrored) => {
    setSubmitting(true); setError("");
    try { setState(await requestCamera({ device: udid, action, mode, posterSlot, path: source.path, webcamId: source.webcamId, mirror: flip })); }
    catch (e) { setError(String(e)); } finally { setSubmitting(false); }
  };
  const choose = async (source: Selection) => {
    setSelection(source); setMenu(false);
    const flip = source.kind === "webcam" ? false : mirrored;
    if (source.kind === "webcam") setMirror(false);
    if (active && mode !== "host-camera") await apply("start", source, flip);
  };
  const upload = async (file?: File) => {
    if (!file || busy || mode === "host-camera") return;
    if (mode === "virtualscene" && (file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(file.name))) { setError("Virtual Scene supports images only."); return; }
    setUploading(true); setError("");
    try {
      const path = await uploadFileToTmp(file, "serve-sim-android-camera", fileExtension(file), execOnHost);
      await choose({ path, name: file.name, kind: file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(file.name) ? "video" : "image" });
    } catch (e) { setError(String(e)); } finally { setUploading(false); }
  };
  return <CollapsibleSection open={open} onOpenChange={setOpen} bodyClassName="pt-2.5"
    summaryClassName="grid [grid-template-columns:auto_1fr_auto] items-center gap-2 text-left"
    summary={<><span className="text-[11px] font-semibold text-white/50 uppercase tracking-[0.08em] leading-none inline-flex items-center">Camera</span>
      <CameraStatusPill state={active ? "active" : state.phase === "error" ? "disconnected" : "ready"} /></>}>
    <div className="flex flex-col gap-2.5" onDragOver={event => event.preventDefault()}
      onDrop={event => { event.preventDefault(); void upload(event.dataTransfer.files[0]); }}>
      <CameraInjectionMode value={mode} disabled={busy} onChange={value => {
        setSelectedMode(value as AndroidCameraMode); setSelection({ kind: "placeholder" }); setMenu(false); setCameras([]); setError(""); setMirror(false);
      }} description={mode === "environment"
        ? "Hot-swap images, videos and cameras. Requires Emulator 36.6.11+. First setup may restart the emulator."
        : mode === "host-camera" ? "Use a host camera as the rear camera; the front camera stays emulated. Applying, changing or stopping the camera restarts the emulator."
        : "Place an image on a wall or table in the rear camera’s 3D scene. Entering this mode restarts the emulator; older versions may also restart when changing images."}>
        <option value="environment">Environment</option>
        <option value="host-camera">Host Camera</option>
        <option value="virtualscene">Virtual Scene</option>
      </CameraInjectionMode>
      {mode === "virtualscene" && <label className="flex items-center justify-between text-[12px] text-white/85">Surface
        <select aria-label="Scene surface" disabled={busy} value={posterSlot} onChange={event => { setPosterSlot(event.target.value as PosterSlot); }} className="bg-panel border border-white/12 rounded-[7px] px-2 py-1.5">
          <option value="wall">Wall</option><option value="table">Table</option>
        </select>
      </label>}
      <input ref={input} type="file" accept={mode === "virtualscene" ? "image/*" : "image/*,video/*"} className="hidden"
        onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void upload(file); }} />
      <div onClick={() => { if (!busy && chosen.kind === "placeholder") { if (mode === "host-camera") { setMenu(true); void refreshCameras(); } else input.current?.click(); } }}
        className={`relative min-h-[44px] flex flex-row items-center justify-center gap-2.5 px-3.5 py-2.5 rounded-[7px] text-center bg-white/[0.04] ${chosen.kind === "placeholder" ? "border border-dashed border-white/12 cursor-pointer" : "border border-white/8"}`}>
        {mode === "host-camera" && chosen.kind === "placeholder" ? <span className="text-[12px] text-white/50">Choose a host camera</span> : <CameraMediaPreview mode={uploading ? "uploading" : chosen.kind === "placeholder" ? "placeholder" : chosen.kind === "webcam" ? "webcam" : "file"}
          fileName={chosen.name ?? null} webcamName={chosen.name ?? cameras.find(camera => camera.id === chosen.webcamId)?.name ?? "Camera"} sourceKind={chosen.kind} />}
        {chosen.kind !== "placeholder" && !uploading && <button disabled={busy} aria-label="Clear source" title={mode === "host-camera" ? "Clear source" : "Clear → test pattern"}
          onClick={event => { event.stopPropagation(); void choose({ kind: "placeholder" }); }}
          className="shrink-0 w-5 h-5 flex items-center justify-center bg-transparent border-none text-white/55 hover:text-white/90 cursor-pointer p-0"><X size={14} /></button>}
      </div>
      {chosen.kind === "placeholder" && !uploading && mode !== "host-camera" && <CameraTestPatternHint />}
      <div className="flex items-stretch gap-1.5">
        <button ref={trigger} disabled={busy} onClick={() => { setMenu(!menu); if (!menu && mode !== "virtualscene") void refreshCameras(); }} aria-label="Choose camera source" aria-haspopup="menu" aria-expanded={menu}
          className="min-h-[36px] w-10 flex items-center justify-center bg-transparent border border-white/12 text-white/85 rounded-[7px] cursor-pointer p-0 hover:bg-white/[0.06] hover:border-white/20 hover:text-white"><Images size={20} strokeWidth={2} /></button>
        <button disabled={busy || environmentUnavailable || (mode === "host-camera" && chosen.kind !== "webcam")} onClick={() => void apply(active ? "stop" : "start")} aria-label={active ? "Stop" : "Play"} aria-pressed={active}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 border-none rounded-[7px] text-[12px] font-semibold cursor-pointer disabled:opacity-50 min-h-[36px] ${active ? "bg-white/[0.16] text-white enabled:hover:bg-white/[0.22]" : "bg-success-emerald text-[#062018] enabled:hover:brightness-[1.08]"}`}>
          {active ? <StopGlyph /> : <PlayGlyph />}<span>{busy ? uploading ? "Uploading…" : phaseLabels[state.phase] : active ? "Stop" : "Play"}</span>
        </button>
        <button disabled={busy || mode === "host-camera" || chosen.kind === "webcam"} aria-label={`Mirror: ${mirrored ? "on" : "off"} — tap to toggle`} aria-pressed={mirrored}
          title={chosen.kind === "webcam" ? "Mirror is available for images and videos" : "Mirror camera source"}
          onClick={() => { setMirror(!mirrored); if (active) void apply("start", chosen, !mirrored); }}
          className={`flex items-center justify-center w-10 min-h-[36px] border rounded-[7px] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${mirrored ? "bg-white border-white text-[#0a0a0c]" : "bg-white/[0.04] border-white/8 text-white/85 hover:bg-white/[0.09]"}`}><FlipHorizontal2 size={20} strokeWidth={2} /></button>
      </div>
      {mode === "virtualscene" && active && <AndroidSceneControls device={udid} />}
      {environmentUnavailable && <CameraInlineBanner kind="error" message="Update Android Emulator to 36.6.11+ or choose Host Camera / Virtual Scene." />}
      {(error || state.error) && <CameraInlineBanner kind="error" message={error || state.error!} />}
    </div>
    {menu && createPortal(<div ref={popup} role="menu" style={position} onKeyDown={event => { if (event.key === "Escape") setMenu(false); }}
      className="fixed z-50 max-h-[calc(100vh-16px)] overflow-y-auto min-w-[220px] flex flex-col gap-px p-1 bg-panel border border-white/8 rounded-[7px] shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
      {mode !== "host-camera" && <button role="menuitem" onClick={() => { setMenu(false); input.current?.click(); }} className="text-left bg-transparent border-none text-white/85 text-[12px] px-2.5 py-[7px] rounded-md cursor-pointer hover:bg-white/[0.06]">{mode === "virtualscene" ? "Browse image…" : "Browse media…"}</button>}
      {mode !== "virtualscene" && <>
      <div className="h-px bg-white/8 my-1" />
      <div className="flex items-center justify-between pl-2.5 pr-2 pt-1 pb-[2px]">
        <span className="text-[10px] text-white/45 uppercase tracking-[0.08em]">{loadingCameras ? "Cameras (loading…)" : mode === "environment" && !state.configured ? "Play to enable cameras" : cameras.length ? "Cameras" : "No cameras"}</span>
        <button disabled={loadingCameras} onClick={() => void refreshCameras()} aria-label="Refresh cameras" className="flex items-center justify-center w-[22px] h-[22px] bg-transparent border-none rounded-[5px] text-white/55 cursor-pointer p-0"><ReloadIcon size={13} /></button>
      </div>
      {cameras.map(camera => <button key={camera.id} role="menuitem" onClick={() => void choose({ kind: "webcam", webcamId: camera.id, name: camera.name })}
        className="text-left bg-transparent border-none text-white/85 text-[12px] px-2.5 py-[7px] rounded-md cursor-pointer hover:bg-white/[0.06]">{camera.name}</button>)}
      </>}
    </div>, document.body)}
  </CollapsibleSection>;
}
export function AndroidCameraProgress({ udid, streaming }: { udid: string; streaming: boolean }) {
  const [state, setState] = useState<CameraState>({ phase: "idle" });
  useEffect(() => {
    let cancelled = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const value = await requestCamera({ device: udid, action: "status" }); if (!cancelled) setState(value); } catch {}
      if (!cancelled) timer = setTimeout(poll, 1500);
    };
    void poll(); return () => { cancelled = true; clearTimeout(timer); };
  }, [udid]);
  const busy = ["restarting", "starting"].includes(state.phase);
  if (!busy && (streaming || state.phase !== "error")) return null;
  return <div role="status" className="fixed inset-0 z-40 bg-black/80 flex items-center justify-center text-white">
    <div className="max-w-sm rounded-xl bg-panel border border-white/15 p-6 text-center">
      <p className="m-0 font-semibold">{phaseLabels[state.phase]}</p>
      <p className="text-xs text-white/70 leading-relaxed">{state.error || "Enabling camera control. Preview will reconnect automatically."}</p>
      {!busy && <button className="rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white cursor-pointer"
        onClick={() => { void requestCamera({ device: udid, action: "start", mode: state.engine, posterSlot: state.posterSlot, path: state.source, webcamId: state.webcamId, mirror: state.mirror }).then(setState).catch(error => setState({ ...state, error: String(error) })); }}>Retry</button>}
    </div>
  </div>;
}
