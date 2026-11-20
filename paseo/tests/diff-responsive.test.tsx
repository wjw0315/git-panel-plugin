import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { DiffView, resolveSplitCellWidth, type DiffMode } from "../client/diff-view";
import type { PanelMode } from "../client/layout";
import type { Strings } from "../client/strings";
import { fireLayout } from "./stubs/react-native";

/**
 * 回归：对照（split）差异不再写死 380/760——单元格按可用宽度对半分，
 * 超长行按需撑开（横向滚动看全，不再省略号截断）；窄/中档强制统一视图
 * 并隐藏对照开关，用户保存的差异偏好不动、面板变宽后恢复。
 */

const THEME = {
  colors: {
    accent: "#0af",
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

const STRINGS = new Proxy({}, { get: (_target, key) => String(key) }) as Strings;

const LONG_LINE = "x".repeat(300);
const SHORT_DIFF = "@@ -1,2 +1,2 @@\n-old short\n+new short\n";
const LONG_DIFF = `@@ -1,2 +1,2 @@\n-old short\n+${LONG_LINE}\n`;

afterEach(() => {
  cleanup();
});

describe("resolveSplitCellWidth（纯函数）", () => {
  it("宽面板且行短：两列对半分可用宽度", () => {
    expect(resolveSplitCellWidth(1000, 10)).toBe(500);
  });

  it("行太长时按字符估算撑开单元格（可横向滚动看全）", () => {
    expect(resolveSplitCellWidth(1000, 300)).toBe(Math.ceil(301 * 7.3) + 51);
  });

  it("未量到宽度（首帧/jsdom）：按内容估算兜底，不再退回固定 380", () => {
    expect(resolveSplitCellWidth(null, 100)).toBe(Math.ceil(101 * 7.3) + 51);
    expect(resolveSplitCellWidth(null, 5)).toBe(280);
  });

  it("可用宽度很小时保住可读下限", () => {
    expect(resolveSplitCellWidth(400, 5)).toBe(280);
  });
});

function Harness({
  panelMode,
  initialMode = "split",
  text = SHORT_DIFF,
}: {
  panelMode?: PanelMode;
  initialMode?: DiffMode;
  text?: string;
}) {
  const [mode, setMode] = useState<DiffMode>(initialMode);
  return (
    <DiffView
      theme={THEME}
      strings={STRINGS}
      text={text}
      mode={mode}
      onModeChange={setMode}
      panelMode={panelMode}
    />
  );
}

function splitCellWidths(): string[] {
  return screen
    .getAllByTestId("diff-split-cell")
    .map((el) => (el as HTMLElement).style.width)
    .filter((width) => width !== "");
}

describe("DiffView 响应式", () => {
  it("宽档 split：开关可见、对照区渲染，布局后两列等宽对半", () => {
    render(<Harness panelMode="wide" />);
    expect(screen.getByLabelText("unified")).toBeTruthy();
    expect(screen.getByLabelText("split")).toBeTruthy();
    expect(screen.getByTestId("diff-split-area")).toBeTruthy();

    act(() => {
      fireLayout(screen.getByTestId("diff-split-area"), 1000);
    });
    const widths = splitCellWidths();
    expect(widths.length).toBeGreaterThanOrEqual(2);
    for (const width of widths) expect(width).toBe("500px");
  });

  it("宽档超长行：单元格按需撑开而不是固定对半", () => {
    render(<Harness panelMode="wide" text={LONG_DIFF} />);
    act(() => {
      fireLayout(screen.getByTestId("diff-split-area"), 1000);
    });
    const expected = `${Math.ceil(301 * 7.3) + 51}px`;
    const widths = splitCellWidths();
    expect(widths.length).toBeGreaterThanOrEqual(2);
    for (const width of widths) expect(width).toBe(expected);
  });

  it("窄档强制统一视图：无对照区，切换开关隐藏", () => {
    render(<Harness panelMode="narrow" initialMode="split" />);
    expect(screen.queryByTestId("diff-split-area")).toBeNull();
    expect(screen.queryByLabelText("unified")).toBeNull();
    expect(screen.queryByLabelText("split")).toBeNull();
    // 统一视图内容正常渲染（hunk 头在）。
    expect(screen.getByText("@@ -1,2 +1,2 @@")).toBeTruthy();
  });

  it("中档同样强制统一视图", () => {
    render(<Harness panelMode="medium" initialMode="split" />);
    expect(screen.queryByTestId("diff-split-area")).toBeNull();
    expect(screen.queryByLabelText("split")).toBeNull();
  });

  it("面板变宽后恢复用户保存的对照偏好（窄档期间偏好不被改写）", () => {
    const view = render(<Harness panelMode="narrow" initialMode="split" />);
    expect(screen.queryByTestId("diff-split-area")).toBeNull();

    view.rerender(<Harness panelMode="wide" initialMode="split" />);
    expect(screen.getByTestId("diff-split-area")).toBeTruthy();
    expect(screen.getByLabelText("split")).toBeTruthy();
  });

  it("宽档点开关切回统一视图后对照区消失", () => {
    render(<Harness panelMode="wide" />);
    expect(screen.getByTestId("diff-split-area")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("unified"));
    expect(screen.queryByTestId("diff-split-area")).toBeNull();
    expect(screen.getByText("@@ -1,2 +1,2 @@")).toBeTruthy();
  });
});
