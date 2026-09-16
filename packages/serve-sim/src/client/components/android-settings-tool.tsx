import { useEffect, useState } from "react";
import { execOnHost, shellEscape } from "../utils/exec";
import { CollapsibleSection } from "./collapsible-section";
import { SettingRow, SettingSelect, TextSizeSlider, I } from "./simulator-settings-tool";
import { AppWindow, ArrowRightLeft, Timer } from "lucide-react";

const scales = ["0", "0.5", "1", "1.5", "2", "5", "10"].map(value => ({ value, label: value === "0" ? "Off" : `${value}×` }));
export const ANDROID_SETTINGS = [
  { key: "appearance", label: "Appearance", read: "cmd uimode night", write: "cmd uimode night", options: [
    { value: "no", label: "Light" }, { value: "yes", label: "Dark" }, { value: "auto", label: "Auto" },
  ] },
  { key: "font", label: "Text Size", read: "settings get system font_scale", write: "settings put system font_scale", options: [
    { value: "0.85", label: "Small" }, { value: "1", label: "Default" }, { value: "1.15", label: "Large" }, { value: "1.3", label: "Largest" },
  ] },
  ...[ ["window_animation_scale", "Window Animation"], ["transition_animation_scale", "Transition Animation"], ["animator_duration_scale", "Animator Duration"] ].map(([key, label]) => ({ key: key!, label: label!, read: `settings get global ${key}`, write: `settings put global ${key}`, options: scales })),
];
export function parseAndroidSetting(key: string, raw: string): string {
  const text = raw.trim();
  if (key === "appearance") return text.match(/Night mode:\s*(\S+)/)?.[1] ?? "unknown";
  if (text === "null") return "default";
  return text !== "" && Number.isFinite(Number(text)) ? String(Number(text)) : "unknown";
}
export function AndroidSettingsTool({ udid }: { udid: string }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prefix = `adb -s ${shellEscape(udid)} shell`;
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setValues({}); setError(null);
    void Promise.all(ANDROID_SETTINGS.map(async setting => {
      const result = await execOnHost(`${prefix} ${setting.read}`);
      if (result.exitCode !== 0) throw new Error(result.stderr.trim() || "Unable to read settings");
      return [setting.key, parseAndroidSetting(setting.key, result.stdout)];
    })).then(entries => { if (!cancelled) setValues(Object.fromEntries(entries)); })
      .catch(err => { if (!cancelled) setError(String(err)); });
    return () => { cancelled = true; };
  }, [open, prefix]);
  const apply = async (setting: typeof ANDROID_SETTINGS[number], value: string) => {
    if (!setting.options.some(option => option.value === value)) return;
    setPending(true); setError(null);
    try {
      const result = await execOnHost(`${prefix} ${setting.write} ${shellEscape(value)}`);
      if (result.exitCode !== 0) throw new Error(result.stderr.trim() || "Unable to update setting");
      const check = await execOnHost(`${prefix} ${setting.read}`);
      if (check.exitCode !== 0) throw new Error(check.stderr.trim() || "Unable to verify setting");
      const actual = parseAndroidSetting(setting.key, check.stdout);
      setValues(current => ({ ...current, [setting.key]: actual }));
      if (actual !== value) throw new Error("Device did not apply the requested value");
    } catch (err) { setError(String(err)); }
    finally { setPending(false); }
  };
  return <CollapsibleSection open={open} onOpenChange={setOpen}
    summaryClassName="grid [grid-template-columns:auto_1fr_auto] items-center gap-2 text-left"
    summary={<><span className="text-[11px] font-semibold text-white/50 uppercase tracking-[0.08em] leading-none inline-flex items-center">Settings</span><span /></>}>
    {error && <div role="alert" className="text-xs text-red-300 mb-2">{error}</div>}
    <div className="flex flex-col gap-1.5 pb-1.5">
      {ANDROID_SETTINGS.map(setting => {
        const value = values[setting.key];
        const options = value && !setting.options.some(option => option.value === value)
          ? [...setting.options, { value, label: value === "default" ? "System default" : value }]
          : setting.options;
        const disabled = pending || value === undefined || value === "unknown";
        const icon = setting.key === "appearance" ? I.appearance : setting.key === "font" ? I.textSize
          : setting.key === "window_animation_scale" ? <AppWindow size={14} />
          : setting.key === "transition_animation_scale" ? <ArrowRightLeft size={14} /> : <Timer size={14} />;
        const fontOptions = value === "default" ? setting.options : options;
        return <SettingRow key={setting.key} label={setting.label} icon={icon}>
          {setting.key === "font" ? <TextSizeSlider
            categories={fontOptions.map(option => option.value)}
            value={Math.max(0, fontOptions.findIndex(option => option.value === (value === "default" ? "1" : value)))}
            disabled={disabled} onChange={index => { void apply(setting, fontOptions[index]!.value); }} />
            : <SettingSelect label={setting.label} value={value ?? ""} options={options}
              disabled={disabled} onChange={next => { void apply(setting, next); }} />}
        </SettingRow>;
      })}
    </div>
  </CollapsibleSection>;
}
