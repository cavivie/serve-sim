import { expect, test } from "bun:test";
import { cameraAppPid } from "../ios-camera-attach";

test("resolves the exact running app, ignoring extensions and stopped services", () => {
  const list = "11\t0\tUIKitApplication:com.demo.app.extension[a]\n-\t0\tUIKitApplication:com.demo.app[b]\n42\t0\tUIKitApplication:com.demo.app[c][rb-legacy]";
  expect(cameraAppPid(list, "com.demo.app")).toBe(42);
  expect(cameraAppPid(list, "com.demo")).toBeNull();
});
test("does not attach to stale or unrelated services", () => {
  expect(cameraAppPid("0 0 UIKitApplication:com.demo.app[a]\n99 0 other-service", "com.demo.app")).toBeNull();
});
