import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  actionRpc,
  diffRpc,
  dirListRpc,
  fileContentRpc,
  fileWriteRpc,
  fsOpRpc,
  gitPanelSettings,
  historyRpc,
  lastMessageRpc,
  mergePreviewRpc,
  panelErrorRpc,
  refsRpc,
  reposRpc,
  snapshotRpc,
  showRpc,
  stashListRpc,
} from "./shared/git";
import { runAction } from "./server/actions";
import { getDiff } from "./server/diff";
import { runFsOp } from "./server/fsops";
import { getFileContent, listDirectory, writeFileContent } from "./server/files";
import { getHistory, getLastMessage, getRefs, getStashList } from "./server/history";
import { getMergePreview } from "./server/merge";
import { listRepos } from "./server/repos";
import { getShow } from "./server/show";
import { buildSnapshot } from "./server/snapshot";
import type { GitSnapshot } from "./shared/git";

function failure(error: unknown): { code: string; message: string } {
  if (error && typeof error === "object") {
    const value = error as { code?: unknown; message?: unknown };
    return {
      code: typeof value.code === "string" ? value.code : "git-error",
      message: typeof value.message === "string" ? value.message : "Git command failed",
    };
  }
  return { code: "git-error", message: "Git command failed" };
}

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(gitPanelSettings);
  const snapshotJobs = new Map<string, Promise<GitSnapshot>>();
  const snapshotRecent = new Map<string, { at: number; value: GitSnapshot }>();

  async function allowFileEdit(): Promise<boolean> {
    const state = await settings.read();
    return state.status === "ready" ? state.values.allowFileEdit : true;
  }

  async function allowSystemOpen(): Promise<boolean> {
    const state = await settings.read();
    return state.status === "ready" ? state.values.allowSystemOpen : true;
  }

  server.handle(reposRpc, async ({ cwd }) => listRepos(cwd));

  server.handle(snapshotRpc, async ({ cwd, repo }) => {
    const key = `${cwd}\u0000${repo}`;
    const recent = snapshotRecent.get(key);
    if (recent && Date.now() - recent.at < 1_200) {
      return { ok: true as const, value: recent.value };
    }
    let job = snapshotJobs.get(key);
    if (!job) {
      // Feed the last snapshot back in: when the working tree did not move the
      // handler only runs `git status` instead of redoing numstat and file reads.
      job = buildSnapshot(cwd, repo, { previous: recent?.value ?? null }).finally(() =>
        snapshotJobs.delete(key),
      );
      snapshotJobs.set(key, job);
    }
    try {
      const value = await job;
      snapshotRecent.set(key, { at: Date.now(), value });
      if (snapshotRecent.size > 100) {
        const cutoff = Date.now() - 60_000;
        for (const [entryKey, entry] of snapshotRecent) {
          if (entry.at < cutoff) snapshotRecent.delete(entryKey);
        }
      }
      return { ok: true as const, value };
    } catch (error) {
      return { ok: false as const, error: failure(error) };
    }
  });

  server.handle(refsRpc, async (input) => getRefs(input));
  server.handle(historyRpc, async (input) => getHistory(input));
  server.handle(showRpc, async (input) => getShow(input));
  server.handle(stashListRpc, async (input) => getStashList(input));
  server.handle(lastMessageRpc, async (input) => getLastMessage(input));

  server.handle(diffRpc, async (input) => getDiff(input));

  server.handle(dirListRpc, async (input) => listDirectory(input));

  server.handle(fileContentRpc, async (input) => {
    try {
      return await getFileContent(input, await allowFileEdit());
    } catch (error) {
      return { ok: false as const, error: failure(error) };
    }
  });

  server.handle(fileWriteRpc, async (input) => {
    try {
      return await writeFileContent(input, await allowFileEdit());
    } catch (error) {
      return { ok: false as const, error: failure(error) };
    }
  });

  server.handle(fsOpRpc, async (input) => runFsOp(input, {
    allowEdit: await allowFileEdit(),
    allowSystemOpen: await allowSystemOpen(),
  }));

  server.handle(panelErrorRpc, async (input) => {
    // One line per crash so `paseo plugin logs git-panel` shows what the
    // renderer hit without needing DevTools on the client device.
    console.error(`[git-panel] panel error surface=${input.surface}`, JSON.stringify(input));
    return { ok: true as const };
  });

  server.handle(actionRpc, async (input) => runAction(input));

  server.handle(mergePreviewRpc, async (input) => getMergePreview(input));

  return () => {};
}
