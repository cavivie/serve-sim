import { expect, test } from "bun:test";
import { parseAndroidPermissions } from "../android-permissions";
test("runtime permissions exclude install permissions and other users; preserve policy locks", () => {
  const source = `    install permissions:
        android.permission.INTERNET: granted=true, flags=[]
    User 0:
      runtime permissions:
        android.permission.CAMERA: granted=false, flags=[ USER_SET]
        android.permission.RECORD_AUDIO: granted=true, flags=[ POLICY_FIXED]
    User 10:
      runtime permissions:
        android.permission.CAMERA: granted=true, flags=[]`;
  expect(parseAndroidPermissions(source, 0)).toEqual([
    { name: "android.permission.CAMERA", granted: false, flags: ["USER_SET"], fixed: false },
    { name: "android.permission.RECORD_AUDIO", granted: true, flags: ["POLICY_FIXED"], fixed: true },
  ]);
});
