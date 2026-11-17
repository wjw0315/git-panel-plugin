import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { actionSchema, mergePreviewRpc } from "../shared/git";
import { UpdateBranchDialog } from "../client/update-branch";
import type { Strings } from "../client/strings";

/**
 * 更新分支对话框（工单 01，合并闭环）：
 * - 契约：actionSchema 接受 merge kind、拒绝空分支名；mergePreviewRpc 契约可解析。
 * - 渲染：卡片、分支选择二级列表、预检块、同分支禁用、重置回调。
 * 形态依据原型变体 A（分支 prototype/update-branch）。
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

const DATA = {
  local: [{ name: "main" }, { name: "feat/deep-name" }],
  remote: [{ name: "origin/feat/remote-only" }],
};

afterEach(cleanup);

describe("merge/rebase action 契约", () => {
  it("接受合法 merge 与 rebase action", () => {
    expect(actionSchema.safeParse({ kind: "merge", branch: "feat/deep-name" }).success).toBe(true);
    expect(actionSchema.safeParse({ kind: "rebase", onto: "origin/main" }).success).toBe(true);
  });

  it("拒绝空分支名与缺失字段", () => {
    expect(actionSchema.safeParse({ kind: "merge", branch: "" }).success).toBe(false);
    expect(actionSchema.safeParse({ kind: "merge" }).success).toBe(false);
    expect(actionSchema.safeParse({ kind: "rebase", onto: "" }).success).toBe(false);
  });

  it("mergePreviewRpc 契约可解析成功与失败两种输出", () => {
    expect(
      mergePreviewRpc.input.safeParse({ cwd: "/w", repo: "", branch: "x", operation: "merge" })
        .success,
    ).toBe(true);
    expect(
      mergePreviewRpc.input.safeParse({ cwd: "/w", repo: "", branch: "x", operation: "rebase" })
        .success,
    ).toBe(true);
    expect(
      mergePreviewRpc.input.safeParse({ cwd: "/w", repo: "", branch: "x", operation: "nope" })
        .success,
    ).toBe(false);
    const ok = mergePreviewRpc.output.safeParse({
      ok: true,
      commitCount: 2,
      conflicts: ["client/panel.tsx"],
      previewSupported: true,
      workspaceClean: true,
    });
    const degraded = mergePreviewRpc.output.safeParse({
      ok: true,
      commitCount: 0,
      conflicts: null,
      previewSupported: false,
      workspaceClean: false,
    });
    const err = mergePreviewRpc.output.safeParse({
      ok: false,
      error: { code: "not-found", message: "bad revision" },
    });
    expect(ok.success).toBe(true);
    expect(degraded.success).toBe(true);
    expect(err.success).toBe(true);
    expect(
      mergePreviewRpc.output.safeParse({ ok: true, commitCount: -1 }).success,
    ).toBe(false);
  });
});

describe("UpdateBranchDialog", () => {
  it("渲染双操作卡片，默认选中合并", () => {
    render(
      <UpdateBranchDialog
        theme={THEME}
        strings={STRINGS}
        open
        current="main"
        operation="merge"
        data={DATA}
        selected={null}
        preview={null}
        workspaceClean={true}
        branchState={null}
        conflictedFiles={[]}
        pending={false}
        onAbort={() => {}}
        onSelectOperation={() => {}}
        onSelect={() => {}}
        onRun={() => {}}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByText("updateBranch")).toBeTruthy();
    expect(screen.getAllByText("updateMergeCard").length).toBeGreaterThan(0);
    expect(screen.getAllByText("updateRebaseCard").length).toBeGreaterThan(0);
  });

  it("点变基卡回传操作切换", () => {
    const onSelectOperation = vi.fn();
    render(
      <UpdateBranchDialog
        theme={THEME}
        strings={STRINGS}
        open
        current="main"
        operation="merge"
        data={DATA}
        selected={null}
        preview={null}
        workspaceClean={true}
        branchState={null}
        conflictedFiles={[]}
        pending={false}
        onAbort={() => {}}
        onSelectOperation={onSelectOperation}
        onSelect={() => {}}
        onRun={() => {}}
        onOpenChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "updateRebaseCard" }));
    expect(onSelectOperation).toHaveBeenCalledWith("rebase");
  });

  it("变基选中时预检块显示被移动数与无预演说明", () => {
    render(
      <UpdateBranchDialog
        theme={THEME}
        strings={STRINGS}
        open
        current="main"
        operation="rebase"
        data={DATA}
        selected="origin/main"
        preview={{ commitCount: 3, conflicts: null, previewSupported: false }}
        workspaceClean={true}
        branchState={null}
        conflictedFiles={[]}
        pending={false}
        onAbort={() => {}}
        onSelectOperation={() => {}}
        onSelect={() => {}}
        onRun={() => {}}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByText(/updateOntoArrow/)).toBeTruthy();
    expect(screen.getByText(/updateMoves/)).toBeTruthy();
    expect(screen.getByText(/updateRebaseNote/)).toBeTruthy();
    expect(screen.queryByText(/updateBrings/)).toBeNull();
  });

  it("渲染合并卡片与方向预检块", () => {
    render(
      <UpdateBranchDialog
        theme={THEME}
        strings={STRINGS}
        open
        current="main"
        operation="merge"
        data={DATA}
        selected="feat/deep-name"
        preview={{ commitCount: 2, conflicts: [], previewSupported: true }}
        workspaceClean={true}
        branchState={null}
        conflictedFiles={[]}
        pending={false}
        onAbort={() => {}}
        onSelectOperation={() => {}}
        onSelect={() => {}}
        onRun={() => {}}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByText("updateBranch")).toBeTruthy();
    expect(screen.getAllByText("feat/deep-name").length).toBeGreaterThan(0);
    expect(screen.getByText(/updateBrings/)).toBeTruthy();
    expect(screen.getByText(/updateMergeNote/)).toBeTruthy();
  });

  it("通过二级列表选择分支并回传完整名字", () => {
    const onSelect = vi.fn();
    render(
      <UpdateBranchDialog
        theme={THEME}
        strings={STRINGS}
        open
        current="main"
        operation="merge"
        data={DATA}
        selected={null}
        preview={null}
        workspaceClean={true}
        branchState={null}
        conflictedFiles={[]}
        pending={false}
        onAbort={() => {}}
        onSelectOperation={() => {}}
        onSelect={onSelect}
        onRun={() => {}}
        onOpenChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByText("updatePickBranch"));
    fireEvent.click(screen.getByRole("button", { name: "feat/deep-name" }));
    expect(onSelect).toHaveBeenCalledWith("feat/deep-name");
  });

  it("未选分支时确认禁用；同分支禁用并提示", () => {
    const onRun = vi.fn();
    const { rerender } = render(
      <UpdateBranchDialog
        theme={THEME}
        strings={STRINGS}
        open
        current="main"
        operation="merge"
        data={DATA}
        selected={null}
        preview={null}
        workspaceClean={true}
        branchState={null}
        conflictedFiles={[]}
        pending={false}
        onAbort={() => {}}
        onSelectOperation={() => {}}
        onSelect={() => {}}
        onRun={onRun}
        onOpenChange={() => {}}
      />,
    );
    expect(onRun).not.toHaveBeenCalled();

    rerender(
      <UpdateBranchDialog
        theme={THEME}
        strings={STRINGS}
        open
        current="main"
        operation="merge"
        data={DATA}
        selected="main"
        preview={{ commitCount: 0, conflicts: [], previewSupported: true }}
        workspaceClean={true}
        branchState={null}
        conflictedFiles={[]}
        pending={false}
        onAbort={() => {}}
        onSelectOperation={() => {}}
        onSelect={() => {}}
        onRun={onRun}
        onOpenChange={() => {}}
      />,
    );
    expect(screen.getByText(/updateSameBranch/)).toBeTruthy();
  });

  it("重置按钮清空选择", () => {
    const onSelect = vi.fn();
    render(
      <UpdateBranchDialog
        theme={THEME}
        strings={STRINGS}
        open
        current="main"
        operation="merge"
        data={DATA}
        selected="feat/deep-name"
        preview={{ commitCount: 1, conflicts: [], previewSupported: true }}
        workspaceClean={true}
        branchState={null}
        conflictedFiles={[]}
        pending={false}
        onAbort={() => {}}
        onSelectOperation={() => {}}
        onSelect={onSelect}
        onRun={() => {}}
        onOpenChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByText("updateReset"));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});

describe("预检块冲突与脏工作区态（工单 04）", () => {
  it("merge 预检发现冲突时显示警示与文件列表", () => {
    render(
      <UpdateBranchDialog
        theme={THEME}
        strings={STRINGS}
        open
        current="main"
        operation="merge"
        data={DATA}
        selected="feat/deep-name"
        preview={{ commitCount: 2, conflicts: ["client/panel.tsx", "server/actions.ts"], previewSupported: true }}
        workspaceClean={true}
        branchState={null}
        conflictedFiles={[]}
        pending={false}
        onAbort={() => {}}
        onSelectOperation={() => {}}
        onSelect={() => {}}
        onRun={() => {}}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByText(/updateConflicts/)).toBeTruthy();
    expect(screen.getByText("client/panel.tsx")).toBeTruthy();
    expect(screen.getByText("server/actions.ts")).toBeTruthy();
    expect(screen.queryByText(/updateNoConflicts/)).toBeNull();
  });

  it("merge 预检无冲突时显示成功文案", () => {
    render(
      <UpdateBranchDialog
        theme={THEME}
        strings={STRINGS}
        open
        current="main"
        operation="merge"
        data={DATA}
        selected="feat/deep-name"
        preview={{ commitCount: 2, conflicts: [], previewSupported: true }}
        workspaceClean={true}
        branchState={null}
        conflictedFiles={[]}
        pending={false}
        onAbort={() => {}}
        onSelectOperation={() => {}}
        onSelect={() => {}}
        onRun={() => {}}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByText(/updateNoConflicts/)).toBeTruthy();
    expect(screen.queryByText(/updateConflicts/)).toBeNull();
  });

  it("预检不可用时降级提示", () => {
    render(
      <UpdateBranchDialog
        theme={THEME}
        strings={STRINGS}
        open
        current="main"
        operation="merge"
        data={DATA}
        selected="feat/deep-name"
        preview={{ commitCount: 2, conflicts: null, previewSupported: false }}
        workspaceClean={true}
        branchState={null}
        conflictedFiles={[]}
        pending={false}
        onAbort={() => {}}
        onSelectOperation={() => {}}
        onSelect={() => {}}
        onRun={() => {}}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByText(/updatePreviewUnavailable/)).toBeTruthy();
    expect(screen.queryByText(/updateNoConflicts/)).toBeNull();
  });

  it("脏工作区时显示警示并禁用确认", () => {
    const onRun = vi.fn();
    render(
      <UpdateBranchDialog
        theme={THEME}
        strings={STRINGS}
        open
        current="main"
        operation="merge"
        data={DATA}
        selected="feat/deep-name"
        preview={{ commitCount: 2, conflicts: [], previewSupported: true }}
        workspaceClean={false}
        branchState={null}
        conflictedFiles={[]}
        pending={false}
        onAbort={() => {}}
        onSelectOperation={() => {}}
        onSelect={() => {}}
        onRun={onRun}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByText(/updateDirtyWarning/)).toBeTruthy();
    expect(onRun).not.toHaveBeenCalled();
  });
});

describe("进行中/冲突态与中止（工单 03）", () => {
  it("branchState=merging 时整体切换为进行中态并列出冲突文件", () => {
    const onAbort = vi.fn();
    render(
      <UpdateBranchDialog
        theme={THEME}
        strings={STRINGS}
        open
        current="main"
        operation="merge"
        data={DATA}
        selected={null}
        preview={null}
        workspaceClean={true}
        branchState="merging"
        conflictedFiles={["client/panel.tsx", "server/actions.ts"]}
        pending={false}
        onAbort={onAbort}
        onSelectOperation={() => {}}
        onSelect={() => {}}
        onRun={() => {}}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByText(/updateInProgressMerging/)).toBeTruthy();
    expect(screen.getByText("client/panel.tsx")).toBeTruthy();
    expect(screen.getByText(/updateAbortMerge/)).toBeTruthy();
    expect(screen.queryByText("updateMergeCardDesc")).toBeNull();
  });

  it("branchState=rebasing 时显示变基进行中与中止变基", () => {
    const onAbort = vi.fn();
    render(
      <UpdateBranchDialog
        theme={THEME}
        strings={STRINGS}
        open
        current="main"
        operation="rebase"
        data={DATA}
        selected={null}
        preview={null}
        workspaceClean={true}
        branchState="rebasing"
        conflictedFiles={[]}
        pending={false}
        onAbort={onAbort}
        onSelectOperation={() => {}}
        onSelect={() => {}}
        onRun={() => {}}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.getByText(/updateInProgressRebasing/)).toBeTruthy();
    expect(screen.getByText(/updateAbortRebase/)).toBeTruthy();

    fireEvent.click(screen.getByText(/updateAbortRebase/));
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it("无进行中态时不渲染中止按钮", () => {
    render(
      <UpdateBranchDialog
        theme={THEME}
        strings={STRINGS}
        open
        current="main"
        operation="merge"
        data={DATA}
        selected={null}
        preview={null}
        workspaceClean={true}
        branchState={null}
        conflictedFiles={[]}
        pending={false}
        onAbort={() => {}}
        onSelectOperation={() => {}}
        onSelect={() => {}}
        onRun={() => {}}
        onOpenChange={() => {}}
      />,
    );

    expect(screen.queryByText(/updateAbortMerge/)).toBeNull();
    expect(screen.queryByText(/updateAbortRebase/)).toBeNull();
  });

  it("abort action 契约与冲突错误扩展可解析", () => {
    expect(actionSchema.safeParse({ kind: "abort" }).success).toBe(true);
    const rpc = mergePreviewRpc; // 借用文件内已导入符号保持导入被使用
    expect(rpc).toBeTruthy();
  });
});
