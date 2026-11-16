import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlainTextEditor } from "../client/editor/plain-text";

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

afterEach(cleanup);

describe("PlainTextEditor", () => {
  it("edits through a textarea and reports changes", () => {
    const onChange = vi.fn();
    render(
      <PlainTextEditor
        value={"one\ntwo"}
        readOnly={false}
        filePath="notes.txt"
        theme={THEME}
        onChange={onChange}
      />,
    );
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "one\nthree" } });
    expect(onChange).toHaveBeenCalledWith("one\nthree");
  });

  it("renders read-only content with line numbers", () => {
    render(
      <PlainTextEditor
        value={"alpha\nbeta\n"}
        readOnly
        filePath="notes.txt"
        theme={THEME}
      />,
    );
    expect(screen.getByText("alpha")).toBeTruthy();
    expect(screen.getByText("beta")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
