import { expect, test } from "bun:test";
import { sceneVector, controlAndroidScene } from "../android-scene-control";

test("scene commands reject invalid vectors before sending device commands", () => {
  for (const v of [undefined, {}, { x: NaN, y: 0, z: 0 }, { x: Infinity, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, { x: "1", y: 0, z: 0 }]) {
    expect(() => sceneVector(v, 2)).toThrow();
  }
  expect(sceneVector({ x: -1, y: 0, z: 1 }, 2)).toEqual({ x: -1, y: 0, z: 1 });
  expect(() => sceneVector({ x: 1, y: 0, z: 0 }, 0.5)).toThrow();
});
test("scene commands cannot target physical devices", async () => {
  await expect(controlAndroidScene({ device: "physical", velocity: { x: 0, y: 0, z: 0 } })).rejects.toThrow("requires an emulator");
});
