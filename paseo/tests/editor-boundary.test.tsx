import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../client/editor/codemirror", () => ({
  CodeMirrorEditor: () => {
    throw new Error("editor render exploded");
  },
}));

import { Editor } from "../client/editor";
import { resetCapabilityCacheForTests } from "../client/editor/capability";

const THEME = {
  colors: {
    accent: "#0af",
    accentForeground: "#000",
    border: "#333",
    foreground: "#fff",
    foregroundMuted: "#999",
    statusDanger: "#a00",
    statusSuccess: "#0a0",
    statusWarning: "#a80",
    surface0: "#000",
    surface1: "#111",
    surface2: "#222",
  },
} as never;

afterEach(() => {
  cleanup();
  resetCapabilityCacheForTests();
});

describe("Editor fallback: render failure", () => {
  it("keeps the file usable through the error boundary", async () => {
    const onError = vi.fn();
    render(
      <Editor value="notes" readOnly={false} filePath="notes.txt" theme={THEME} onError={onError} />,
    );
    expect(await screen.findByRole("textbox")).toBeTruthy();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});
