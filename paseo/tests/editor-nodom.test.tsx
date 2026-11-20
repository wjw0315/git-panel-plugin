import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../client/editor/capability", () => ({
  canUseDom: () => false,
  evaluateHost: () => false,
  resetCapabilityCacheForTests: () => {},
}));

import { Editor } from "../client/editor";

const THEME = {
  colors: {
    accent: "#0af",
    accentForeground: "#000",
    border: "#333",
    foreground: "#fff",
    foregroundMuted: "#999",
    surface0: "#000",
    surface1: "#111",
    surface2: "#222",
    statusDanger: "#a00",
    statusSuccess: "#0a0",
    statusWarning: "#a80",
  },
} as never;

afterEach(cleanup);

describe("Editor on hosts without DOM", () => {
  it("renders the plain text editor directly", () => {
    render(
      <Editor value="hello" readOnly={false} filePath="notes.txt" theme={THEME} />,
    );
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("renders read-only plain text with a gutter", () => {
    render(<Editor value={"alpha\nbeta"} readOnly filePath="notes.txt" theme={THEME} />);
    expect(screen.getByText("alpha")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });
});
