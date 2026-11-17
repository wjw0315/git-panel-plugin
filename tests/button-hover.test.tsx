import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Chip, IconButton, TextButton } from "../client/kit";

/**
 * 回归：按钮悬停要有阴影（ticket 01），移开消失，禁用态不叠加。
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

afterEach(cleanup);

describe("按钮悬停阴影", () => {
  it("图标按钮悬停出现阴影，移开消失", () => {
    render(<IconButton theme={THEME} icon="RefreshCw" label="刷新" onPress={() => {}} />);
    const button = screen.getByRole("button", { name: "刷新" });

    expect(button.style.boxShadow).toBe("");

    fireEvent.mouseEnter(button);
    expect(button.style.boxShadow).not.toBe("");

    fireEvent.mouseLeave(button);
    expect(button.style.boxShadow).toBe("");
  });

  it("文字按钮悬停出现阴影", () => {
    render(<TextButton theme={THEME} label="切换" onPress={() => {}} />);
    const button = screen.getByRole("button", { name: "切换" });

    expect(button.style.boxShadow).toBe("");
    fireEvent.mouseEnter(button);
    expect(button.style.boxShadow).not.toBe("");
  });

  it("可点击 Chip 悬停出现阴影", () => {
    render(<Chip theme={THEME} label="已暂存" onPress={() => {}} />);
    const chip = screen.getByRole("button", { name: "已暂存" });

    expect(chip.style.boxShadow).toBe("");
    fireEvent.mouseEnter(chip);
    expect(chip.style.boxShadow).not.toBe("");
  });

  it("禁用按钮悬停不出现阴影", () => {
    render(
      <IconButton theme={THEME} icon="RefreshCw" label="刷新" onPress={() => {}} disabled />,
    );
    const button = screen.getByRole("button", { name: "刷新" });

    fireEvent.mouseEnter(button);
    expect(button.style.boxShadow).toBe("");
  });
});
