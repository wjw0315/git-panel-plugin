import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IconButton, TextButton, computeHintPosition } from "../client/kit";

/**
 * 回归：按钮悬停提示（ticket 02）。延迟出现、移开消失、无 hint 不出现，
 * 浮层在视口边缘翻转或夹紧。
 */

const THEME = {
  colors: {
    accent: "#0af",
    accentForeground: "#fff",
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
  vi.useRealTimers();
  cleanup();
});

describe("按钮悬停提示", () => {
  it("悬停延迟后出现提示，移开消失", async () => {
    vi.useFakeTimers();
    render(
      <IconButton
        theme={THEME}
        icon="Plus"
        label="新建分支"
        hint="基于当前提交创建新分支"
        onPress={() => {}}
      />,
    );
    const button = screen.getByRole("button", { name: "新建分支" });

    fireEvent.mouseEnter(button);
    expect(screen.queryByTestId("button-hint")).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByTestId("button-hint").textContent).toContain("基于当前提交创建新分支");

    fireEvent.mouseLeave(button);
    expect(screen.queryByTestId("button-hint")).toBeNull();
  });

  it("未到延迟就移开时不出现提示", async () => {
    vi.useFakeTimers();
    render(
      <TextButton theme={THEME} label="切换" hint="把工作区切换到该分支" onPress={() => {}} />,
    );
    const button = screen.getByRole("button", { name: "切换" });

    fireEvent.mouseEnter(button);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.mouseLeave(button);
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.queryByTestId("button-hint")).toBeNull();
  });

  it("文字按钮没有 hint 时不显示提示", async () => {
    vi.useFakeTimers();
    render(<TextButton theme={THEME} label="关闭" onPress={() => {}} />);
    const button = screen.getByRole("button", { name: "关闭" });

    fireEvent.mouseEnter(button);
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(screen.queryByTestId("button-hint")).toBeNull();
  });

  it("图标按钮没有显式 hint 时用 label 兜底", async () => {
    vi.useFakeTimers();
    render(<IconButton theme={THEME} icon="RefreshCw" label="刷新" onPress={() => {}} />);
    const button = screen.getByRole("button", { name: "刷新" });

    fireEvent.mouseEnter(button);
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.getByTestId("button-hint").textContent).toContain("刷新");
  });
});

describe("提示浮层定位", () => {
  const viewport = { width: 1000, height: 700 };

  it("下方空间足够时显示在按钮下方", () => {
    const position = computeHintPosition(
      { x: 200, y: 100, width: 24, height: 24 },
      { width: 160, height: 30 },
      viewport,
    );

    expect(position).toEqual({ left: 132, top: 130 });
  });

  it("底部放不下时翻到按钮上方", () => {
    const position = computeHintPosition(
      { x: 200, y: 680, width: 24, height: 24 },
      { width: 160, height: 30 },
      viewport,
    );

    expect(position.top).toBe(644);
  });

  it("右侧溢出时夹在视口内", () => {
    const position = computeHintPosition(
      { x: 990, y: 100, width: 24, height: 24 },
      { width: 160, height: 30 },
      viewport,
    );

    expect(position.left).toBe(836);
  });
});
