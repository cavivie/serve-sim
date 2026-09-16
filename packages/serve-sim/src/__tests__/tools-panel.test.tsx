import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AxSelectionContext } from "../client/hooks/use-ax-snapshot";
import { ToolsPanel } from "../client/components/tools-panel";

const noop = () => {};

describe("ToolsPanel", () => {
  test("uses the shared panel background variable", () => {
    const html = renderToStaticMarkup(
      <ToolsPanel
        open={false}
        onClose={noop}
        udid="one"
        deviceRuntime="iOS-27-0"
        currentApp={null}
        axOverlayEnabled={false}
        onToggleAxOverlay={noop}
        codecPreference="auto"
        onCodecPreferenceChange={noop}
        activeCodec="h264"
        avccSupported
        width={320}
      />,
    );

    expect(html).toContain("background-color:var(--serve-sim-panel-bg)");
  });
});

 test("Android tools omit iOS-only controls", () => {
  const html = renderToStaticMarkup(<AxSelectionContext.Provider value={{ highlightedKey: null, selectedKey: null, setHighlightedKey: noop, setSelectedKey: noop }}><ToolsPanel open onClose={noop}
    eventLogEventsEndpoint="/events" platform="android" udid="emulator-5556" deviceRuntime={null}
    currentApp={null} axOverlayEnabled={false} onToggleAxOverlay={noop}
    codecPreference="auto" onCodecPreferenceChange={noop}
    activeCodec="h264" avccSupported width={320} /></AxSelectionContext.Provider>);
  expect(html).toContain("Location");
  expect(html).toContain("Permissions");
  expect(html).not.toContain("not yet supported on Android");
  expect(html).not.toContain("Add to Photos");
  expect(html).not.toContain("SIMULATOR SETTINGS");
 });

 test("Android physical devices hide unsupported location", () => {
  const html = renderToStaticMarkup(<AxSelectionContext.Provider value={{ highlightedKey: null, selectedKey: null, setHighlightedKey: noop, setSelectedKey: noop }}><ToolsPanel open onClose={noop}
    eventLogEventsEndpoint="/events" platform="android" udid="physical-serial" deviceRuntime={null}
    currentApp={null} axOverlayEnabled={false} onToggleAxOverlay={noop}
    codecPreference="auto" onCodecPreferenceChange={noop}
    activeCodec="h264" avccSupported width={320} /></AxSelectionContext.Provider>);
  expect(html).not.toContain("Location");
  expect(html).toContain("Permissions");
  expect(html).not.toContain("not yet supported on Android");
  expect(html).not.toContain("Add to Photos");
  expect(html).not.toContain("SIMULATOR SETTINGS");
 });
