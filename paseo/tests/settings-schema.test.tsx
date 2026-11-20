import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, gitPanelSettings } from "../shared/git";

describe("editor settings", () => {
  it("defaults autosave and syntax highlighting on", () => {
    expect(DEFAULT_SETTINGS.autoSaveFile).toBe(true);
    expect(DEFAULT_SETTINGS.editorSyntaxHighlight).toBe(true);
    expect(DEFAULT_SETTINGS.showHeaderButton).toBe(true);
  });

  it("fills the new switches for settings stored by older versions", () => {
    const parsed = gitPanelSettings.schema.parse({
      showComposerPill: true,
      defaultDiffView: "unified",
      changesView: "flat",
      refreshIntervalMs: 5000,
      allowFileEdit: true,
      filesFollowRepo: false,
    });
    expect(parsed.autoSaveFile).toBe(true);
    expect(parsed.editorSyntaxHighlight).toBe(true);
    expect(parsed.showHeaderButton).toBe(true);
  });
});
