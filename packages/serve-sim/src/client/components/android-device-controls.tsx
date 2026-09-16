import { SimulatorToolbar } from "../simulator";
import type { ReactElement } from "react";

type AndroidButton =
  | "back"
  | "home"
  | "recents"
  | "volume_down"
  | "volume_up"
  | "power";

// Painted bounds (including strokes) span y=2…22: 18px high and centered.
const CONTROLS: Array<{
  button: AndroidButton;
  label: string;
  title: string;
  icon: ReactElement;
}> = [
  {
    button: "back",
    label: "Android Back",
    title: "Back",
    icon: (
      <svg width="21.6" height="18" viewBox="0 2 24 20" fill="none" aria-hidden="true">
        <path d="M18 2 6 12l12 10V2Z" fill="currentColor" />
      </svg>
    ),
  },
  {
    button: "home",
    label: "Android Home",
    title: "Home",
    icon: (
      <svg width="21.6" height="18" viewBox="0 2 24 20" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
  },
  {
    button: "recents",
    label: "Android Recents",
    title: "Recents",
    icon: (
      <svg width="21.6" height="18" viewBox="0 2 24 20" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="1.5" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
  },
  {
    button: "volume_down",
    label: "Android Volume Down",
    title: "Volume Down",
    icon: (
      <svg width="21.6" height="18" viewBox="0 2 24 20" fill="none" aria-hidden="true">
        <path d="M2 9v6h4l7 6V3L6 9H2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M17 12h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    button: "volume_up",
    label: "Android Volume Up",
    title: "Volume Up",
    icon: (
      <svg width="21.6" height="18" viewBox="0 2 24 20" fill="none" aria-hidden="true">
        <path d="M2 9v6h4l7 6V3L6 9H2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M19.5 8.5v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M16 12h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    button: "power",
    label: "Android Power",
    title: "Power",
    icon: (
      <svg width="21.6" height="18" viewBox="0 2 24 20" fill="none" aria-hidden="true">
        <path d="M12 3v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M6.6 4.8a9 9 0 1 0 10.8 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function AndroidDeviceControls({
  onButton,
  platform = "android",
}: {
  platform?: "ios" | "android";
  onButton: (button: AndroidButton) => void;
}) {
  return (
    <>
      {CONTROLS.map((control) => (
        <SimulatorToolbar.Button
          key={control.button}
          aria-label={control.label.replace("Android", platform === "ios" ? "iOS" : "Android")}
          title={platform === "ios" && control.button === "back" ? "Back (swipe from left edge)" : platform === "ios" && control.button === "power" ? "Shut down simulator" : control.title}
          onClick={() => onButton(control.button)}
        >
          {platform === "ios" && control.button === "home" ? (
            <svg width="21.6" height="18" viewBox="0 2 24 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" />
            </svg>
          ) : platform === "ios" && control.button === "back" ? (
            <svg width="21.6" height="18" viewBox="0 2 24 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 3-9 9 9 9" /></svg>
          ) : control.icon}
        </SimulatorToolbar.Button>
      ))}
    </>
  );
}
