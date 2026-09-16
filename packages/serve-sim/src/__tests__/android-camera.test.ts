import { describe, expect, test } from "bun:test";
import { cameraMediaArgs, androidCameraStatus, beginAndroidCamera } from "../android-camera";
import { parseIni, supportsEnvironment, findEmulatorEndpoint } from "../android-environment";
import { cameraMode, validateCameraSource, parseHostCameras, legacyCameraArgs } from "../android-camera-modes";
import { mkdirSync, existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Android camera modes", () => {
  test("a stopped old process does not erase an ongoing restart or its failure", () => {
    const dir = join(tmpdir(), "serve-sim", "android-camera");
    const file = join(dir, "emulator-5682.json");
    mkdirSync(dir, { recursive: true });
    const original = existsSync(file) ? readFileSync(file) : undefined;
    try {
      writeFileSync(file, JSON.stringify({ phase: "restarting", pid: 2147483647, ownerPid: process.pid, avd: "Test" }));
      expect(androidCameraStatus("emulator-5682").phase).toBe("restarting");
      writeFileSync(file, JSON.stringify({ phase: "error", pid: 2147483647, error: "Boot failed", avd: "Test" }));
      expect(androidCameraStatus("emulator-5682").phase).toBe("error");
      expect(androidCameraStatus("emulator-5682").error).toBe("Boot failed");
    } finally { if (original) writeFileSync(file, original); else unlinkSync(file); }
  });
  test("defaults to Environment and rejects unknown backends", () => {
    expect(cameraMode(undefined)).toBe("environment");
    expect(() => cameraMode("offworld")).toThrow();
  });
  test("legacy modes use supported facing configurations without requiring Environment", () => {
    expect(legacyCameraArgs("host-camera", "webcam2")).toEqual(["-camera-back", "webcam2", "-camera-front", "emulated"]);
    expect(legacyCameraArgs("virtualscene")).toEqual(["-camera-back", "virtualscene", "-camera-front", "emulated"]);
  });
  test("host input is selected from webcam IDs and cannot carry media or options", () => {
    expect(() => validateCameraSource("host-camera")).toThrow();
    expect(() => validateCameraSource("host-camera", undefined, "-wipe-data")).toThrow();
    expect(() => validateCameraSource("host-camera", "/tmp/a.png", "webcam0")).toThrow();
    expect(() => validateCameraSource("host-camera", undefined, "webcam0")).not.toThrow();
  });
  test("scene accepts images and restricts surface and source kind", () => {
    expect(() => validateCameraSource("virtualscene", "/tmp/a.PNG", undefined, "table")).not.toThrow();
    expect(() => validateCameraSource("virtualscene", "/tmp/a.MP4")).toThrow();
    expect(() => validateCameraSource("virtualscene", undefined, "webcam0")).toThrow();
    expect(() => validateCameraSource("virtualscene", undefined, undefined, "floor")).toThrow();
  });
  test("host camera enumeration supports old and new emulator output", () => {
    expect(parseHostCameras(" Camera 'USB Camera' is connected to device 'webcam1' on channel 0 using pixel format 'UYVY'\n Camera 'MacBook Pro相机' can be specified by label as 'webcam0' or by id as 'uuid'"))
      .toEqual([{ id: "webcam1", name: "USB Camera" }, { id: "webcam0", name: "MacBook Pro相机" }]);
  });
});

describe("Android environment camera", () => {
  test("requires the release that introduced the environment backend", () => {
    for (const version of ["36.1.9", "36.6.10", "35.9.99", "0"]) expect(supportsEnvironment(version)).toBe(false);
    for (const version of ["36.6.11", "36.6.12.0", "37.1.11.0"]) expect(supportsEnvironment(version)).toBe(true);
  });
  test("registration values may contain equals signs and spaces", () => {
    expect(parseIni("# comment=ignored\r\ngrpc.token=a=b==\r\navd.name=Pixel 8a\n")).toEqual({ "grpc.token": "a=b==", "avd.name": "Pixel 8a" });
  });
  test("rejects physical devices before any host command", () => {
    expect(() => androidCameraStatus("2B161B55CD4BB2")).toThrow("requires an Android emulator");
    expect(() => beginAndroidCamera({ device: "../../state", action: "start" }, async () => {})).toThrow();
    expect(findEmulatorEndpoint("2B161B55CD4BB2")).toBeUndefined();
  });
  test("images remain single images and no longer become rotated video clips", () => {
    const args = cameraMediaArgs("/tmp/test.PNG", "/tmp/output.png", false);
    expect(args).not.toContain("-loop");
    expect(args).not.toContain("-t");
    expect(args).not.toContain("-vf");
    expect(args.slice(args.indexOf("-frames:v"), args.indexOf("-frames:v") + 2)).toEqual(["-frames:v", "1"]);
  });
  test("mirror is an explicit file transform, never a sensor rotation", () => {
    const args = cameraMediaArgs("/tmp/a.png", "/tmp/b.png", true);
    expect(args[args.indexOf("-vf") + 1]).toBe("hflip");
    const video = cameraMediaArgs("/tmp/a.mov", "/tmp/b.mp4", true);
    expect(video.filter(arg => arg === "-vf")).toHaveLength(1);
    expect(video.join(" ")).not.toContain("transpose");
  });
  test("special paths remain arguments and placeholder uses a still test pattern", () => {
    const input = "/tmp/movie ' with spaces.mp4";
    const args = cameraMediaArgs(input, "/tmp/output.mp4", false);
    expect(args[args.indexOf("-i") + 1]).toBe(input);
    expect(cameraMediaArgs(undefined, "/tmp/pattern.png", false)).toContain("testsrc=size=720x1280:rate=1");
  });
});
