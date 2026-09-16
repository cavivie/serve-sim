import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function cameraAppPid(list: string, bundleId: string): number | null {
  const prefix = `UIKitApplication:${bundleId}[`;
  for (const line of list.split("\n")) {
    const [pid, , service] = line.trim().split(/\s+/);
    if (service?.startsWith(prefix) && /^\d+$/.test(pid!) && Number(pid) > 0) return Number(pid);
  }
  return null;
}

// LLDB runs this inside its Python interpreter. Always detach, including when
// an expression or library load fails, so an unsuccessful Play leaves the app usable.
export function cameraAttachScript(config: { pid: number; dylib: string; shm: string; mirror: string }): string {
  return `import lldb, json, signal
cfg = json.loads(${JSON.stringify(JSON.stringify(config))})
def run():
    process = None
    def timeout(*args):
        raise RuntimeError("Camera attachment timed out")
    signal.signal(signal.SIGALRM, timeout)
    signal.alarm(25)
    try:
        debugger = lldb.debugger
        debugger.SetAsync(False)
        target = debugger.CreateTarget("")
        error = lldb.SBError()
        process = target.AttachToProcessWithID(debugger.GetListener(), cfg["pid"], error)
        if error.Fail():
            raise RuntimeError(str(error))
        thread = process.GetSelectedThread()
        frame = thread.GetFrameAtIndex(0)
        options = lldb.SBExpressionOptions()
        options.SetLanguage(lldb.eLanguageTypeObjC_plus_plus)
        options.SetTimeoutInMicroSeconds(5000000)
        symbols = target.FindSymbols("setenv", lldb.eSymbolTypeCode)
        if symbols.GetSize() == 0:
            raise RuntimeError("Cannot resolve setenv in target process")
        address = symbols.GetContextAtIndex(0).GetSymbol().GetStartAddress().GetLoadAddress(target)
        for key, value in [("SIMCAM_SHM_NAME", cfg["shm"]), ("SIMCAM_MIRROR_MODE", cfg["mirror"])]:
            expression = '((int(*)(const char*,const char*,int))' + hex(address) + ')(' + json.dumps(key) + ',' + json.dumps(value) + ',1)'
            result = frame.EvaluateExpression(expression, options)
            if result.GetError().Fail() or result.GetValueAsSigned(-1) != 0:
                raise RuntimeError("Cannot configure camera: " + str(result.GetError()))
        process.LoadImage(lldb.SBFileSpec(cfg["dylib"]), error)
        if error.Fail():
            raise RuntimeError("Cannot load camera library: " + str(error))
    finally:
        signal.alarm(0)
        if process and process.IsValid():
            detached = process.Detach()
            if detached.Fail():
                raise RuntimeError("Cannot detach debugger: " + str(detached))
    print("SERVE_SIM_CAMERA_ATTACHED")
run()
`;
}

export function attachIosCamera(udid: string, bundleId: string, dylib: string, shm: string, mirror: string): number {
  const list = execFileSync("xcrun", ["simctl", "spawn", udid, "launchctl", "list"], { encoding: "utf8", timeout: 10000 });
  const pid = cameraAppPid(list, bundleId);
  if (!pid) throw new Error("App is not running. Open it first, or choose Dylib launch mode.");
  const dir = mkdtempSync(join(tmpdir(), "serve-sim-camera-attach-"));
  try {
    const script = join(dir, "attach.py");
    writeFileSync(script, cameraAttachScript({ pid, dylib, shm, mirror }));
    const output = execFileSync("xcrun", ["lldb", "--batch", "-o", `command script import ${JSON.stringify(script)}`], {
      encoding: "utf8", timeout: 40000, maxBuffer: 1024 * 1024,
    });
    if (!output.includes("SERVE_SIM_CAMERA_ATTACHED")) throw new Error(output.trim());
    return pid;
  } catch (error: any) {
    const detail = error.stderr?.toString().trim() || error.message || String(error);
    throw new Error(`LLDB attachment failed. Close any existing debugger and retry, or choose Dylib launch mode (restarts the app). ${detail}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
