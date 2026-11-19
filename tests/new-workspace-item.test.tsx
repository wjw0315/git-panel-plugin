import { describe, expect, it } from "vitest";
import {
  describeNewWorkspace,
  pickWorkspaceForProject,
  shortenRef,
} from "../client/new-workspace-item";

const project = { id: "p1", name: "git-panel-plugin" };

describe("New workspace git summary", () => {
  it("names the base branch and the branch a worktree will cut", () => {
    expect(
      describeNewWorkspace(
        {
          project,
          isolation: "worktree",
          baseRef: { type: "branch", name: "refs/remotes/origin/main" },
          branch: "paseo/tidy-panda",
        },
        false,
      ),
    ).toBe("from origin/main · new branch paseo/tidy-panda");
  });

  it("says the branch is picked automatically when the setup left it open", () => {
    expect(
      describeNewWorkspace(
        {
          project,
          isolation: "worktree",
          baseRef: { type: "branch", name: "main" },
          branch: null,
        },
        true,
      ),
    ).toBe("基于 main · 自动新建分支");
  });

  it("keeps a local workspace to the base branch only", () => {
    expect(
      describeNewWorkspace(
        { project, isolation: "local", baseRef: { type: "branch", name: "refs/heads/main" }, branch: null },
        true,
      ),
    ).toBe("基于 main");
  });

  it("describes a change-request base", () => {
    expect(
      describeNewWorkspace(
        { project, isolation: "worktree", baseRef: { type: "change-request", number: 412 }, branch: null },
        false,
      ),
    ).toBe("from #412 · auto branch");
  });

  it("leaves the row alone when a local workspace has no base picked yet", () => {
    expect(
      describeNewWorkspace({ project, isolation: "local", baseRef: null, branch: null }, true),
    ).toBe("");
  });

  it("strips ref prefixes but leaves bare names alone", () => {
    expect(shortenRef("refs/remotes/origin/feat/x")).toBe("origin/feat/x");
    expect(shortenRef("refs/heads/feat/x")).toBe("feat/x");
    expect(shortenRef("feat/x")).toBe("feat/x");
  });

  describe("which workspace the panel opens", () => {
    const entries = [
      { id: "old", projectId: "p1", activityAt: "2026-11-01T00:00:00Z" },
      { id: "newest", projectId: "p1", activityAt: "2026-11-19T00:00:00Z" },
      { id: "other", projectId: "p2", activityAt: "2026-11-20T00:00:00Z" },
      { id: "archiving", projectId: "p1", activityAt: "2026-11-21T00:00:00Z", archivingAt: "x" },
      { id: "internal", projectId: "p1", activityAt: "2026-11-22T00:00:00Z", internal: true },
    ];

    it("picks the project's most recently active workspace", () => {
      expect(pickWorkspaceForProject(entries, "p1")).toBe("newest");
    });

    it("skips archived, internal and foreign workspaces", () => {
      expect(pickWorkspaceForProject(entries, "p2")).toBe("other");
      expect(pickWorkspaceForProject(entries.slice(3), "p1")).toBeNull();
    });

    it("returns null with no project or no workspace list", () => {
      expect(pickWorkspaceForProject(entries, null)).toBeNull();
      expect(pickWorkspaceForProject(undefined, "p1")).toBeNull();
    });
  });
});
