import { useRpc } from "@getpaseo/plugin/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { utf8Bytes } from "./format";
import {
  actionRpc,
  diffRpc,
  dirListRpc,
  fileContentRpc,
  fileWriteRpc,
  historyRpc,
  lastMessageRpc,
  panelErrorRpc,
  refsRpc,
  reposRpc,
  showRpc,
  snapshotRpc,
  stashListRpc,
  type GitAction,
  type GitChange,
} from "../shared/git";

export function useGitApi() {
  return {
    repos: useRpc(reposRpc),
    snapshot: useRpc(snapshotRpc),
    refs: useRpc(refsRpc),
    history: useRpc(historyRpc),
    show: useRpc(showRpc),
    diff: useRpc(diffRpc),
    dir: useRpc(dirListRpc),
    file: useRpc(fileContentRpc),
    write: useRpc(fileWriteRpc),
    action: useRpc(actionRpc),
    stash: useRpc(stashListRpc),
    lastMessage: useRpc(lastMessageRpc),
  };
}

/**
 * Fire-and-forget crash report: the panel already shows the error locally, and
 * the server logs one line so `paseo plugin logs git-panel` has the stack.
 */
export function useErrorReport() {
  const api = useRpc(panelErrorRpc);
  return (input: {
    surface: string;
    message: string;
    stack?: string;
    componentStack?: string;
  }) => {
    void api(input).catch(() => {});
  };
}

const KEY = "git-panel";

export function useReposQuery(cwd: string | null) {
  const api = useGitApi();
  return useQuery({
    queryKey: [KEY, "repos", cwd],
    queryFn: () => api.repos({ cwd: cwd ?? "" }),
    enabled: Boolean(cwd),
    staleTime: 10_000,
    retry: false,
  });
}

export function useSnapshotQuery(
  cwd: string | null,
  repo: string,
  intervalMs: number,
  enabled = true,
) {
  const api = useGitApi();
  return useQuery({
    queryKey: [KEY, "snapshot", cwd, repo],
    queryFn: () => api.snapshot({ cwd: cwd ?? "", repo }),
    enabled: Boolean(cwd) && enabled,
    refetchInterval: intervalMs > 0 ? intervalMs : false,
    retry: false,
  });
}

export function useRefsQuery(cwd: string | null, repo: string, enabled: boolean) {
  const api = useGitApi();
  return useQuery({
    queryKey: [KEY, "refs", cwd, repo],
    queryFn: () => api.refs({ cwd: cwd ?? "", repo }),
    enabled: Boolean(cwd) && enabled,
    staleTime: 5000,
    retry: false,
  });
}

export function useHistoryQuery(
  cwd: string | null,
  repo: string,
  params: { limit: number; search: string },
  enabled: boolean,
) {
  const api = useGitApi();
  return useQuery({
    queryKey: [KEY, "history", cwd, repo, params.limit, params.search],
    queryFn: () =>
      api.history({
        cwd: cwd ?? "",
        repo,
        limit: params.limit,
        skip: 0,
        search: params.search || undefined,
      }),
    enabled: Boolean(cwd) && enabled,
    retry: false,
    placeholderData: (previous) => previous,
  });
}

export function useShowQuery(cwd: string | null, repo: string, ref: string | null) {
  const api = useGitApi();
  return useQuery({
    queryKey: [KEY, "show", cwd, repo, ref],
    queryFn: () => api.show({ cwd: cwd ?? "", repo, ref: ref ?? "" }),
    enabled: Boolean(cwd && ref),
    retry: false,
  });
}

export function useDiffQuery(
  cwd: string | null,
  repo: string,
  file: { path: string; base: "worktree" | "staged" | "commit"; commit?: string } | null,
  context: number,
  enabled: boolean,
) {
  const api = useGitApi();
  return useQuery({
    queryKey: [
      KEY,
      "diff",
      cwd,
      repo,
      file?.path,
      file?.base,
      file?.commit,
      context,
    ],
    queryFn: () =>
      api.diff({
        cwd: cwd ?? "",
        repo,
        path: file?.path ?? "",
        base: file?.base ?? "worktree",
        commit: file?.commit,
        context,
      }),
    enabled: Boolean(cwd && file) && enabled,
    retry: false,
    staleTime: 2000,
  });
}

export function useDirQuery(cwd: string | null, repo: string, path: string, enabled: boolean) {
  const api = useGitApi();
  return useQuery({
    queryKey: [KEY, "dir", cwd, repo, path],
    queryFn: () => api.dir({ cwd: cwd ?? "", repo, path }),
    enabled: Boolean(cwd) && enabled,
    retry: false,
    staleTime: 5000,
  });
}

export function useFileQuery(cwd: string | null, repo: string, path: string | null) {
  const api = useGitApi();
  return useQuery({
    queryKey: [KEY, "file", cwd, repo, path],
    queryFn: () => api.file({ cwd: cwd ?? "", repo, path: path ?? "" }),
    enabled: Boolean(cwd && path),
    retry: false,
  });
}

export function useStashQuery(cwd: string | null, repo: string, enabled: boolean) {
  const api = useGitApi();
  return useQuery({
    queryKey: [KEY, "stash", cwd, repo],
    queryFn: () => api.stash({ cwd: cwd ?? "", repo }),
    enabled: Boolean(cwd) && enabled,
    retry: false,
  });
}

export function useLastMessageQuery(cwd: string | null, repo: string, enabled: boolean) {
  const api = useGitApi();
  return useQuery({
    queryKey: [KEY, "lastMessage", cwd, repo],
    queryFn: () => api.lastMessage({ cwd: cwd ?? "", repo }),
    enabled: Boolean(cwd) && enabled,
    retry: false,
  });
}

export function useGitAction(cwd: string | null, repo: string) {
  const api = useGitApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (action: GitAction) => api.action({ cwd: cwd ?? "", repo, action }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [KEY] });
    },
  });
}

export function useFileWrite(cwd: string | null, repo: string) {
  const api = useGitApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { path: string; content: string; baseSha: string }) =>
      api.write({ cwd: cwd ?? "", repo, ...input }),
    onSuccess: (result, input) => {
      if (!result.ok) return;
      // Patch the cached file instead of invalidating every git-panel query:
      // autosave fires every 1.5s, so a broad invalidation would refetch
      // dir/snapshot/history each time the user pauses typing.
      client.setQueryData([KEY, "file", cwd, repo, input.path], (previous: unknown) => {
        if (!previous || typeof previous !== "object") return previous;
        const file = previous as { ok?: boolean; content?: string };
        if (!file.ok) return previous;
        return {
          ...file,
          content: input.content,
          sha256: result.sha256,
          size: utf8Bytes(input.content),
        };
      });
      void client.invalidateQueries({ queryKey: [KEY, "snapshot", cwd, repo] });
    },
  });
}

export function changeKey(change: GitChange): string {
  return `${change.staged ? "s" : "w"}:${change.path}`;
}
