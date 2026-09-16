import { AndroidPermissionsTool } from "./android-permissions-tool";
import { AndroidCameraTool } from "./android-camera-tool";
import { AndroidSettingsTool } from "./android-settings-tool";
import { LocationEmulationTool } from "../location-emulation-tool";
import { Panel, PanelCloseButton, PanelHeader, PanelTitle } from "../Panel";
import { execOnHost } from "../utils/exec";
import { AppDetectionTool } from "./app-detection-tool";
import { AppPermissionsTool } from "./app-permissions-tool";
import { AxTreeTool } from "./ax-tree-tool";
import { CameraTool } from "./camera-tool";
import { EventLogTool } from "./event-log-tool";
import { PANEL_BACKGROUND } from "./panel-colors";
import { SimulatorSettingsTool } from "./simulator-settings-tool";
import { StreamSettingsTool, type CodecPreference } from "./stream-settings-tool";

export function ToolsPanel({
  open,
  onClose,
  udid,
  platform = "ios",
  deviceRuntime,
  currentApp,
  eventLogEventsEndpoint,
  axOverlayEnabled,
  onToggleAxOverlay,
  codecPreference,
  onCodecPreferenceChange,
  activeCodec,
  avccSupported,
  width,
}: {
  open: boolean;
  onClose: () => void;
  udid: string;
  platform?: "ios" | "android";
  deviceRuntime: string | null;
  currentApp: { bundleId: string; isReactNative: boolean; pid?: number } | null;
  eventLogEventsEndpoint?: string;
  axOverlayEnabled: boolean;
  onToggleAxOverlay: () => void;
  codecPreference: CodecPreference;
  onCodecPreferenceChange: (next: CodecPreference) => void;
  activeCodec: "h264" | "mjpeg";
  avccSupported: boolean;
  width: number;
}) {
  return (
    <Panel open={open} width={width} style={{ backgroundColor: PANEL_BACKGROUND }}>
      <PanelHeader>
        <PanelTitle>Tools</PanelTitle>
        <PanelCloseButton onClick={onClose} />
      </PanelHeader>

      {open && (
        <div className="p-3.5 overflow-y-auto flex-1 flex flex-col gap-3">
          <AppDetectionTool udid={udid} currentApp={currentApp} platform={platform} />
          <EventLogTool udid={udid} eventsEndpoint={eventLogEventsEndpoint} />
          {platform === "android" && <AndroidSettingsTool key={udid} udid={udid} />}
          {platform === "ios" && <>
          <SimulatorSettingsTool udid={udid} runtime={deviceRuntime} />
          <CameraTool udid={udid} bundleId={currentApp?.bundleId ?? null} />
          </>}
          {platform === "android" && /^emulator-\d+$/.test(udid) && <AndroidCameraTool key={udid} udid={udid} />}
          <AxTreeTool
            overlayEnabled={axOverlayEnabled}
            onToggleOverlay={onToggleAxOverlay}
          />
          {(platform === "ios" || /^emulator-\d+$/.test(udid)) && <LocationEmulationTool key={`${platform}:${udid}`} udid={udid} platform={platform} exec={execOnHost} />}
          {platform === "ios" && <AppPermissionsTool udid={udid} bundleId={currentApp?.bundleId ?? null} />}
          {platform === "android" && <AndroidPermissionsTool key={udid} udid={udid} bundleId={currentApp?.bundleId ?? null} />}
          <StreamSettingsTool
            platform={platform}
            preference={codecPreference}
            onPreferenceChange={onCodecPreferenceChange}
            activeCodec={activeCodec}
            avccSupported={avccSupported}
          />
        </div>
      )}
    </Panel>
  );
}
