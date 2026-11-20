import { describe, expect, it } from "vitest";
import { createEditorTheme, editorPalette } from "../client/editor/theme";

const THEME = {
  colors: {
    accent: "#00aaff",
    accentForeground: "#000000",
    border: "#333333",
    foreground: "#ffffff",
    foregroundMuted: "#999999",
    statusDanger: "#aa0000",
    statusSuccess: "#00aa00",
    statusWarning: "#aa8800",
    surface0: "#000000",
    surface1: "#111111",
    surface2: "#222222",
  },
} as never;

const LIGHT_THEME = {
  colors: {
    accent: "#0066cc",
    accentForeground: "#ffffff",
    border: "#dddddd",
    foreground: "#111111",
    foregroundMuted: "#666666",
    statusDanger: "#cc0000",
    statusSuccess: "#008800",
    statusWarning: "#886600",
    surface0: "#ffffff",
    surface1: "#f5f5f5",
    surface2: "#ebebeb",
  },
} as never;

describe("editorPalette", () => {
  it("maps theme colors onto editor tokens", () => {
    const palette = editorPalette(THEME);
    expect(palette.background).toBe("#000000");
    expect(palette.foreground).toBe("#ffffff");
    expect(palette.gutterText).toBe("#999999");
    expect(palette.accent).toBe("#00aaff");
    expect(palette.string).toBe("#00aa00");
    expect(palette.keyword).toBe("#00aaff");
    expect(palette.number).toBe("#aa8800");
    expect(palette.comment).toBe("#999999");
    expect(palette.border).toBe("#333333");
  });

  it("understands 8-digit hex and rgb() colors", () => {
    const eight = editorPalette({
      colors: { ...(LIGHT_THEME as { colors: Record<string, string> }).colors, surface0: "#ffffffcc" },
    } as never);
    expect(eight.isDark).toBe(false);
    expect(eight.background).toBe("#ffffffcc");

    const rgb = editorPalette({
      colors: { ...(THEME as { colors: Record<string, string> }).colors, surface0: "rgb(20, 20, 20)" },
    } as never);
    expect(rgb.isDark).toBe(true);
    expect(rgb.selection).toBe("rgba(0, 170, 255, 0.25)");
  });

  it("detects a light surface", () => {
    expect(editorPalette(THEME).isDark).toBe(true);
    expect(editorPalette(LIGHT_THEME).isDark).toBe(false);
  });
});

describe("createEditorTheme", () => {
  it("returns a usable CodeMirror extension", () => {
    const extension = createEditorTheme(THEME);
    expect(extension).toBeTruthy();
    expect(Array.isArray(extension) ? extension.length : 1).toBeGreaterThan(0);
  });
});
