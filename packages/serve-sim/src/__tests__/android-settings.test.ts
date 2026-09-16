import {test, expect} from "bun:test";
import {parseAndroidSetting} from "../client/components/android-settings-tool";
test("normalizes Android values and preserves defaults and unknown modes", () => {
 expect(parseAndroidSetting("appearance", "Night mode: yes\n")).toBe("yes");
 expect(parseAndroidSetting("appearance", "Night mode: custom_schedule")).toBe("custom_schedule");
 expect(parseAndroidSetting("font", "1.0")).toBe("1");
 expect(parseAndroidSetting("animator_duration_scale", "null")).toBe("default");
 expect(parseAndroidSetting("font", "permission denied")).toBe("unknown");
});
