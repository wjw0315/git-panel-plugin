import type { PluginClientContext, PluginNewWorkspaceItemProps } from "@getpaseo/plugin/client";
import { useNewWorkspace } from "@getpaseo/plugin/client";
import { Action } from "@getpaseo/plugin/client/ui";
import { useEffect, useState } from "react";
import { isChinese, useLocale } from "./strings";

/**
 * Git entry on Paseo's "New workspace" screen.
 *
 * That route has no workspace yet — no workspaceId, no agent — so neither a
 * composer pill nor a header button can exist there. `addNewWorkspaceItem` is
 * the surface Paseo draws on that screen: it shows which ref the workspace
 * starts from, and pressing it opens the Git panel of the workspace that
 * already belongs to the chosen project (same directory, same repository).
 */

interface SetupLike {
  project: { id: string; name: string } | null;
  isolation: "local" | "worktree";
  baseRef: { type: "branch"; name: string } | { type: "change-request"; number: number } | null;
  branch: string | null;
}

interface WorkspaceEntry {
  id?: string;
  projectId?: string;
  archivingAt?: string | null;
  internal?: boolean;
  activityAt?: string | null;
}

const copy = {
  en: {
    baseBranch: (ref: string) => `from ${ref}`,
    baseChangeRequest: (number: number) => `from #${number}`,
    newBranch: (branch: string) => `new branch ${branch}`,
    autoBranch: "auto branch",
    open: "Open the Git panel",
    noWorkspace: "No workspace in this project yet — the panel opens once one exists.",
  },
  zh: {
    baseBranch: (ref: string) => `基于 ${ref}`,
    baseChangeRequest: (number: number) => `基于 #${number}`,
    newBranch: (branch: string) => `新分支 ${branch}`,
    autoBranch: "自动新建分支",
    open: "打开 Git 面板",
    noWorkspace: "该项目还没有工作区，创建后即可打开面板。",
  },
};

/** `refs/remotes/origin/main` → `origin/main`; a bare branch name is left alone. */
export function shortenRef(name: string): string {
  return name.replace(/^refs\/remotes\//, "").replace(/^refs\/heads\//, "");
}

/** One line of git context for the New workspace screen; "" when there is nothing to say. */
export function describeNewWorkspace(setup: SetupLike, chinese: boolean): string {
  const text = chinese ? copy.zh : copy.en;
  const parts: string[] = [];
  if (setup.baseRef?.type === "branch") {
    parts.push(text.baseBranch(shortenRef(setup.baseRef.name)));
  } else if (setup.baseRef?.type === "change-request") {
    parts.push(text.baseChangeRequest(setup.baseRef.number));
  }
  // "Local" is already the neighbouring control on that row; only a worktree
  // adds something the row cannot say on its own.
  if (setup.isolation === "worktree") {
    parts.push(setup.branch ? text.newBranch(setup.branch) : text.autoBranch);
  }
  return parts.join(" · ");
}

/**
 * The workspace the panel should open: the project's most recently active one.
 * Archived and internal workspaces are skipped — they are not what the user
 * means by "this project".
 */
export function pickWorkspaceForProject(
  entries: readonly WorkspaceEntry[] | undefined,
  projectId: string | null | undefined,
): string | null {
  if (!projectId) return null;
  const candidates = (entries ?? []).filter(
    (entry) => entry?.id && entry.projectId === projectId && !entry.archivingAt && !entry.internal,
  );
  if (candidates.length === 0) return null;
  candidates.sort((left, right) => (right.activityAt ?? "").localeCompare(left.activityAt ?? ""));
  return candidates[0]?.id ?? null;
}

interface ProjectsToWorkspaces {
  map: Record<string, string>;
}

const CACHE_MS = 30_000;
let cache: { at: number; value: Record<string, string> } | null = null;

async function readProjectWorkspaces(client: PluginClientContext): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const result = (await client.paseo.workspaces.list({})) as {
    entries?: WorkspaceEntry[];
  };
  const map: Record<string, string> = {};
  for (const entry of result?.entries ?? []) {
    const projectId = entry?.projectId;
    if (!projectId) continue;
    const picked = pickWorkspaceForProject(result.entries, projectId);
    if (picked) map[projectId] = picked;
  }
  cache = { at: Date.now(), value: map };
  return map;
}

export function GitNewWorkspaceItem({
  client,
  theme,
}: PluginNewWorkspaceItemProps & { client: PluginClientContext }) {
  const setup = useNewWorkspace();
  const locale = useLocale();
  const chinese = isChinese(locale);
  const text = chinese ? copy.zh : copy.en;
  const [workspaces, setWorkspaces] = useState<ProjectsToWorkspaces>({
    map: cache?.value ?? {},
  });

  useEffect(() => {
    let cancelled = false;
    void readProjectWorkspaces(client)
      .then((map) => {
        if (!cancelled) setWorkspaces({ map });
      })
      .catch(() => {
        // A host without the workspace list keeps the line informational only.
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (!setup.project) return null;
  const detail = describeNewWorkspace(setup, chinese);
  const workspaceId = workspaces.map[setup.project.id] ?? null;
  const base = detail ? `${setup.project.name} · ${detail}` : setup.project.name;
  // The control carries its own label; a disabled one has to say why.
  const title = workspaceId ? base : `${base} — ${text.noWorkspace}`;

  return (
    <Action
      icon="GitBranch"
      title={title}
      disabled={!workspaceId}
      onPress={() => {
        if (!workspaceId) return;
        client.openPanel("git-panel", { workspaceId });
      }}
    />
  );
}
