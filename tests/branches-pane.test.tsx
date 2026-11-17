import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BranchesPane } from "../client/overview";
import type { Strings } from "../client/strings";

/**
 * 回归：分支名里的 "/" 是名字的一部分（feat/xxx），点击本地分支不能把它截断；
 * 点击远端分支要带上完整的远端 ref，交给服务端创建跟踪分支。
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

afterEach(cleanup);

const DATA = {
  current: "main",
  defaultBranch: "main",
  local: [
    { name: "main", shortHash: "aaa" },
    { name: "feat/deep-name", shortHash: "bbb" },
  ],
  remote: [{ name: "origin/feat/remote-only", shortHash: "ccc" }],
  tags: [],
};

describe("BranchesPane 分支点击", () => {
  it("本地分支保留完整名字", () => {
    const onPick = vi.fn();
    render(
      <BranchesPane
        theme={THEME}
        strings={STRINGS}
        data={DATA}
        current={DATA.current}
        onPick={onPick}
        onCreate={() => {}}
        onRefresh={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "feat/deep-name" }));

    expect(onPick).toHaveBeenCalledWith("feat/deep-name");
  });

  it("远端分支传完整远端 ref 并标记跟踪", () => {
    const onPick = vi.fn();
    render(
      <BranchesPane
        theme={THEME}
        strings={STRINGS}
        data={DATA}
        current={DATA.current}
        onPick={onPick}
        onCreate={() => {}}
        onRefresh={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "origin/feat/remote-only" }));

    expect(onPick).toHaveBeenCalledWith("origin/feat/remote-only", true);
  });
});
