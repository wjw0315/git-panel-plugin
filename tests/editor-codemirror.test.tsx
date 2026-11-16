import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeMirrorEditor } from "../client/editor/codemirror";

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

describe("CodeMirrorEditor", () => {
  it("mounts an editor view and reflects the value", async () => {
    const { container, rerender } = render(
      <CodeMirrorEditor value="const a = 1;" readOnly={false} filePath="a.ts" theme={THEME} />,
    );
    await waitFor(() => expect(container.querySelector(".cm-editor")).toBeTruthy());
    expect(container.querySelector(".cm-content")?.textContent).toContain("const a = 1;");

    rerender(<CodeMirrorEditor value="const b = 2;" readOnly={false} filePath="a.ts" theme={THEME} />);
    await waitFor(() =>
      expect(container.querySelector(".cm-content")?.textContent).toContain("const b = 2;"),
    );
  });

  it("toggles read-only mode without remounting", async () => {
    const { container, rerender } = render(
      <CodeMirrorEditor value="hello" readOnly={false} filePath="a.txt" theme={THEME} />,
    );
    await waitFor(() => expect(container.querySelector(".cm-editor")).toBeTruthy());
    const view = container.querySelector(".cm-editor");
    expect(container.querySelector(".cm-content")?.getAttribute("contenteditable")).toBe("true");

    rerender(<CodeMirrorEditor value="hello" readOnly filePath="a.txt" theme={THEME} />);
    await waitFor(() =>
      expect(container.querySelector(".cm-content")?.getAttribute("contenteditable")).toBe("false"),
    );
    expect(container.querySelector(".cm-editor")).toBe(view);
  });

  it("routes save and cancel shortcuts to the callbacks", async () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    const { container } = render(
      <CodeMirrorEditor
        value="hello"
        readOnly={false}
        filePath="a.txt"
        theme={THEME}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    await waitFor(() => expect(container.querySelector(".cm-content")).toBeTruthy());
    const content = container.querySelector(".cm-content") as HTMLElement;

    // jsdom reports a non-mac platform, so CodeMirror binds "Mod" to Control.
    fireEvent.keyDown(content, { key: "s", ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(content, { key: "Enter", ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(content, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("destroys the view on unmount", async () => {
    const { container, unmount } = render(
      <CodeMirrorEditor value="x" readOnly filePath="a.txt" theme={THEME} />,
    );
    await waitFor(() => expect(container.querySelector(".cm-editor")).toBeTruthy());
    act(() => unmount());
    expect(document.querySelector(".cm-editor")).toBeNull();
  });
});
