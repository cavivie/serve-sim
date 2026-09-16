import { useCallback, useEffect, useRef, useState } from "react";
import { simEndpoint } from "../utils/sim-endpoint";

export function AndroidSceneControls({ device }: { device: string }) {
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState("");
  const keys = useRef(new Set<string>());
  const rotation = useRef({ x: 0, y: 0, z: 0 });
  const inFlight = useRef(false);
  const buttonClass = "rounded-md border border-white/15 bg-white/5 text-white/85 text-[11px] px-2 py-2 cursor-pointer hover:bg-white/10 touch-none select-none";
  const send = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch(simEndpoint("android-camera"), {
      method: "POST", keepalive: true,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + (window.__SIM_PREVIEW__?.execToken ?? "") },
      body: JSON.stringify({ device, action: "scene", ...body }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Scene control failed");
  }, [device]);
  const stop = useCallback(() => {
    keys.current.clear(); rotation.current = { x: 0, y: 0, z: 0 };
    void send({ velocity: { x: 0, y: 0, z: 0 } }).catch(() => {});
  }, [send]);
  useEffect(() => {
    if (!enabled) return;
    setError("");
    let disposed = false;
    const tick = async () => {
      if (inFlight.current) return;
      const k = keys.current;
      const v = { x: Number(k.has("KeyD")) - Number(k.has("KeyA")), y: Number(k.has("KeyE")) - Number(k.has("KeyQ")), z: Number(k.has("KeyS")) - Number(k.has("KeyW")) };
      const r = rotation.current; rotation.current = { x: 0, y: 0, z: 0 };
      if (!v.x && !v.y && !v.z && !r.x && !r.y) return;
      inFlight.current = true;
      try { await send({ velocity: v, rotation: r }); }
      catch (e) { if (!disposed) { setError(String(e)); setEnabled(false); } }
      finally { inFlight.current = false; }
    };
    const editable = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest("input,select,textarea,[contenteditable=true]");
    const down = (event: KeyboardEvent) => {
      if (!event.shiftKey || editable(event.target) || !["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"].includes(event.code)) return;
      event.preventDefault(); event.stopImmediatePropagation(); keys.current.add(event.code); void tick();
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === "Shift") stop();
      else if (keys.current.delete(event.code)) { event.preventDefault(); event.stopImmediatePropagation(); if (!keys.current.size) stop(); else void tick(); }
    };
    const move = (event: MouseEvent) => {
      if (!event.shiftKey || editable(event.target)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      rotation.current.x = Math.max(-0.4, Math.min(0.4, rotation.current.x - event.movementY * 0.003));
      rotation.current.y = Math.max(-0.4, Math.min(0.4, rotation.current.y - event.movementX * 0.003));
    };
    const hide = () => { if (document.hidden) stop(); };
    const timer = setInterval(() => void tick(), 150);
    window.addEventListener("keydown", down, true); window.addEventListener("keyup", up, true);
    window.addEventListener("mousemove", move, true); window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", hide);
    return () => {
      disposed = true; clearInterval(timer); stop();
      window.removeEventListener("keydown", down, true); window.removeEventListener("keyup", up, true);
      window.removeEventListener("mousemove", move, true); window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [enabled, send, stop]);
  return <div className="flex flex-col gap-2 border-t border-white/10 pt-2.5">
    <label className="flex justify-between items-center text-[12px] text-white/85">Scene controls
      <input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />
    </label>
    {enabled && <>
      <p className="m-0 text-[10px] leading-[1.5] text-white/45">Open the rear camera in your app. Hold Shift + W/A/S/D to move, Q/E to descend/ascend; Shift + mouse to look around. Or hold the buttons below.</p>
      <div className="grid grid-cols-3 gap-1">
        {[["Up", "KeyE"], ["Forward", "KeyW"], ["Down", "KeyQ"], ["Left", "KeyA"], ["Back", "KeyS"], ["Right", "KeyD"]].map(([label, code]) => <button key={code} className={buttonClass}
          onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); keys.current.add(code!); }}
          onPointerUp={() => stop()} onPointerCancel={() => stop()} onLostPointerCapture={() => stop()}>{label}</button>)}
      </div>
      <div className="grid grid-cols-4 gap-1">
        {[["Look left", 0, 0.2], ["Look right", 0, -0.2], ["Look up", 0.2, 0], ["Look down", -0.2, 0]].map(([label, x, y]) => <button key={label} className={buttonClass}
          onClick={() => { rotation.current = { x: Number(x), y: Number(y), z: 0 }; }}>{label}</button>)}
      </div>
      <button className={buttonClass} onClick={() => { stop(); void send({ reset: true }).catch(e => setError(String(e))); }}>Reset view</button>
    </>}
    {error && <p role="alert" className="m-0 text-[11px] text-red-400">{error}</p>}
  </div>;
}
