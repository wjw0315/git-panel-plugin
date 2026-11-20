import type { PluginTheme } from "@getpaseo/plugin";
import type {
  PluginAgentPanelProps,
  PluginWorkspacePanelProps,
} from "@getpaseo/plugin/client";
import { useAgent, useSettings, useTabState, useWorkspace } from "@getpaseo/plugin/client";
import { Icon, Modal, useToast } from "@getpaseo/plugin/client/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { z } from "zod";
import { DEFAULT_SETTINGS, gitPanelSettings, type GitRepoEntry } from "../shared/git";
import { useGitAction, useReposQuery, useSnapshotQuery } from "./api";
import { ChangesTab } from "./changes";
import { PanelErrorBoundary } from "./error-boundary";
import { FilesTab } from "./files";
import { CountBadge, EmptyState, IconButton, TextButton } from "./kit";
import { usePanelMode } from "./layout";
import { OverviewTab } from "./overview";
import { useStrings } from "./strings";

const tabStateSchema = z.object({
  repo: z.string().default(""),
  tab: z.enum(["overview", "changes", "files"]).default("overview"),
});

type TabState = z.output<typeof tabStateSchema>;
type TabId = TabState["tab"];

type PanelFrame = {
  theme: PluginTheme;
  layout: PluginWorkspacePanelProps["layout"];
  workspaceId: string;
  tab: PluginWorkspacePanelProps["tab"];
  /** Agent-scoped panels follow the agent's cwd instead of the workspace root. */
  cwdOverride?: string | null;
};

export function GitPanel(props: PluginWorkspacePanelProps) {
  const strings = useStrings();
  return (
    <PanelErrorBoundary surface="workspace-panel" theme={props.theme} strings={strings}>
      <GitPanelBody
        theme={props.theme}
        layout={props.layout}
        workspaceId={props.workspaceId}
        tab={props.tab}
      />
    </PanelErrorBoundary>
  );
}

export function GitAgentPanel(props: PluginAgentPanelProps) {
  const strings = useStrings();
  const agent = useAgent(props.params.agentId, (snapshot) => ({
    cwd: snapshot.cwd,
  }));
  return (
    <PanelErrorBoundary surface="agent-panel" theme={props.theme} strings={strings}>
      <GitPanelBody
        theme={props.theme}
        layout={props.layout}
        workspaceId={props.workspaceId}
        tab={props.tab}
        cwdOverride={agent?.cwd ?? null}
      />
    </PanelErrorBoundary>
  );
}

function GitPanelBody({
  theme,
  layout,
  workspaceId,
  tab,
  cwdOverride,
}: PanelFrame) {
  const strings = useStrings();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { mode, onLayout } = usePanelMode(layout.compact);
  const workspace = useWorkspace(workspaceId, (snapshot) => ({
    directory: snapshot.directory,
    projectRootPath: snapshot.projectRootPath,
    name: snapshot.name,
    projectKind: snapshot.projectKind,
  }));
  const settings = useSettings(gitPanelSettings);
  const values = settings.status === "ready" ? settings.values : DEFAULT_SETTINGS;
  const [state, setState] = useTabState<TabState>(tab, tabStateSchema, {
    repo: "",
    tab: "overview",
  });
  const [repoOpen, setRepoOpen] = useState(false);
  const [workspaceTimedOut, setWorkspaceTimedOut] = useState(false);
  const cwd =
    cwdOverride?.trim() ||
    workspace?.directory?.trim() ||
    workspace?.projectRootPath?.trim() ||
    null;

  useEffect(() => {
    if (cwd) {
      setWorkspaceTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setWorkspaceTimedOut(true), 5_000);
    return () => clearTimeout(timer);
  }, [cwd]);

  const repos = useReposQuery(cwd);
  const repoEntries = repos.data?.repos ?? [];
  // Do not silently select the first nested repository: a workspace folder that
  // is not itself a Git repository must keep its files rooted at the workspace.
  const selectedRepo =
    repoEntries.find((entry) => entry.path === state.repo) ??
    repoEntries.find((entry) => entry.path === "") ??
    null;
  const repo = selectedRepo?.path ?? "";
  const hasRepo = selectedRepo !== null;
  const repoOptions = useMemo(() => {
    const entries: GitRepoEntry[] = [...repoEntries];
    if (cwd && !entries.some((entry) => entry.path === "")) {
      entries.unshift({
        path: "",
        root: cwd,
        name: workspace?.name ?? strings.workspaceRepo,
        kind: "workspace",
        branch: null,
      });
    }
    return entries;
  }, [cwd, repoEntries, strings.workspaceRepo, workspace?.name]);

  const snapshot = useSnapshotQuery(cwd, repo, values.refreshIntervalMs, hasRepo);
  const action = useGitAction(cwd, repo);
  const snapshotValue = snapshot.data?.ok ? snapshot.data.value : null;
  const snapshotError = snapshot.data && !snapshot.data.ok ? snapshot.data.error : null;

  const selectTab = (next: TabId) => setState({ ...state, tab: next });
  const selectRepo = (entry: GitRepoEntry) => {
    setState({ ...state, repo: entry.path });
    setRepoOpen(false);
    void queryClient.invalidateQueries({ queryKey: ["git-panel"] });
  };

  const statusLabel = useMemo(() => {
    if (!snapshotValue) return "";
    return `${snapshotValue.branch ?? "HEAD"}${snapshotValue.dirty ? " *" : ""}`;
  }, [snapshotValue]);

  const onRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["git-panel"] });
  };

  const onFetch = () => {
    action.mutate(
      { kind: "fetch" },
      {
        onSuccess: (result) => {
          if (!result.ok) toast.error(result.error.message);
          else toast.show(strings.fetch, { variant: "success" });
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : strings.operationFailed),
      },
    );
  };

  const header = (
    <View
      style={{
        paddingHorizontal: layout.compact ? 8 : 10,
        paddingTop: layout.compact ? 6 : 8,
        gap: 6,
        borderBottomWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <Icon name="GitBranch" size={15} color={theme.colors.foreground} />
        <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "600" }}>
          {strings.git}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.selectRepo}
          disabled={!hasRepo}
          onPress={() => setRepoOpen(true)}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 7,
              paddingVertical: 3,
              borderRadius: 6,
              backgroundColor: theme.colors.surface1,
              borderWidth: 1,
              borderColor: theme.colors.border,
              maxWidth: 220,
            }}
          >
            <Text
              numberOfLines={1}
              style={{ color: theme.colors.foreground, fontSize: 11, maxWidth: 140 }}
            >
              {selectedRepo?.name ?? workspace?.name ?? strings.git}
            </Text>
            {repoEntries.length > 1 ? (
              <Icon name="ChevronDown" size={11} color={theme.colors.foregroundMuted} />
            ) : null}
          </View>
        </Pressable>
        {snapshotValue ? (
          <Text
            numberOfLines={1}
            style={{
              color: theme.colors.foregroundMuted,
              fontFamily: "Menlo",
              fontSize: 11,
              flexShrink: 1,
              minWidth: 0,
            }}
          >
            ({statusLabel})
          </Text>
        ) : null}
        {snapshotValue?.ahead ? (
          <Text style={{ color: theme.colors.statusWarning, fontSize: 10 }}>
            ↑{snapshotValue.ahead}
          </Text>
        ) : null}
        {snapshotValue?.behind ? (
          <Text style={{ color: theme.colors.statusWarning, fontSize: 10 }}>
            ↓{snapshotValue.behind}
          </Text>
        ) : null}
        <View style={{ flex: 1 }} />
        {hasRepo ? (
          <IconButton
            theme={theme}
            icon="DownloadCloud"
            label={strings.fetch}
            onPress={onFetch}
            disabled={action.isPending}
          />
        ) : null}
        {snapshotValue?.hasUpstream ? (
          <>
            <IconButton
              theme={theme}
              icon="ArrowDown"
              label={strings.pull}
              onPress={() =>
                action.mutate(
                  { kind: "pull" },
                  {
                    onSuccess: (result) =>
                      result.ok
                        ? toast.show(strings.pull, { variant: "success" })
                        : toast.error(result.error.message),
                  },
                )
              }
              disabled={action.isPending}
            />
            <IconButton
              theme={theme}
              icon="ArrowUp"
              label={strings.push}
              onPress={() =>
                action.mutate(
                  { kind: "push" },
                  {
                    onSuccess: (result) =>
                      result.ok
                        ? toast.show(strings.push, { variant: "success" })
                        : toast.error(result.error.message),
                  },
                )
              }
              disabled={action.isPending}
            />
          </>
        ) : snapshotValue?.remote ? (
          <IconButton
            theme={theme}
            icon="UploadCloud"
            label={strings.publish}
            onPress={() =>
              action.mutate(
                { kind: "publish", remote: snapshotValue.remote?.name ?? "origin" },
                {
                  onSuccess: (result) =>
                    result.ok
                      ? toast.show(strings.publish, { variant: "success" })
                      : toast.error(result.error.message),
                },
              )
            }
            disabled={action.isPending}
          />
        ) : null}
        <IconButton
          theme={theme}
          icon="RefreshCw"
          label={strings.refresh}
          onPress={onRefresh}
        />
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 2,
          marginTop: 2,
          flexWrap: "wrap",
        }}
      >
        <TabButton
          theme={theme}
          label={strings.overview}
          icon="GitCommitHorizontal"
          active={state.tab === "overview"}
          disabled={!hasRepo}
          compact={mode === "narrow"}
          onPress={() => selectTab("overview")}
        />
        <TabButton
          theme={theme}
          label={strings.changes}
          icon="FileDiff"
          active={state.tab === "changes"}
          disabled={!hasRepo}
          count={snapshotValue?.stats.fileCount ?? 0}
          compact={mode === "narrow"}
          onPress={() => selectTab("changes")}
        />
        <TabButton
          theme={theme}
          label={strings.files}
          icon="FolderTree"
          active={state.tab === "files"}
          compact={mode === "narrow"}
          onPress={() => selectTab("files")}
        />
      </View>
    </View>
  );

  let body: ReactNode;
  if (!cwd) {
    body = workspaceTimedOut ? (
      <EmptyState
        theme={theme}
        icon="PlugZap"
        title={strings.workspaceUnavailable}
        detail={strings.workspaceUnavailableHint}
      />
    ) : (
      <EmptyState theme={theme} icon="Loader" title={strings.loading} />
    );
  } else if (state.tab === "files") {
    body = (
      <FilesTab
        cwd={cwd}
        repo={values.filesFollowRepo ? repo : ""}
        theme={theme}
        strings={strings}
        mode={mode}
        tab={tab}
      />
    );
  } else if (!hasRepo && repos.isPending) {
    body = <EmptyState theme={theme} icon="Loader" title={strings.loading} />;
  } else if (!hasRepo) {
    body = (
      <EmptyState
        theme={theme}
        icon="FolderGit2"
        title={strings.notGitRepo}
        detail={
          repos.isError
            ? repos.error instanceof Error
              ? repos.error.message
              : strings.operationFailed
            : strings.noRepos
        }
      >
        <TextButton
          theme={theme}
          label={strings.files}
          hint={strings.hintFilesTab}
          onPress={() => selectTab("files")}
          compact
        />
      </EmptyState>
    );
  } else if (snapshot.isPending) {
    body = <EmptyState theme={theme} icon="Loader" title={strings.loading} />;
  } else if (snapshotError || snapshot.isError) {
    body = (
      <View style={{ flex: 1, padding: 16, gap: 8 }}>
        <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>
          {snapshotError?.message ??
            (snapshot.error instanceof Error ? snapshot.error.message : strings.operationFailed)}
        </Text>
        <TextButton
          theme={theme}
          label={strings.retry}
          hint={strings.hintRetry}
          onPress={onRefresh}
          compact
        />
      </View>
    );
  } else if (snapshotValue && state.tab === "overview") {
    body = (
      <OverviewTab
        cwd={cwd}
        repo={repo}
        snapshot={snapshotValue}
        theme={theme}
        strings={strings}
        mode={mode}
      />
    );
  } else if (snapshotValue && state.tab === "changes") {
    body = (
      <ChangesTab
        cwd={cwd}
        repo={repo}
        snapshot={snapshotValue}
        theme={theme}
        strings={strings}
        mode={mode}
        initialView={values.changesView}
        initialDiffMode={values.defaultDiffView}
      />
    );
  } else {
    body = <EmptyState theme={theme} icon="GitBranch" title={strings.loading} />;
  }

  return (
    <View
      testID="git-panel"
      style={{ flex: 1, minHeight: 0, backgroundColor: theme.colors.surface0 }}
      onLayout={onLayout}
    >
      {header}
      <View style={{ flex: 1, minHeight: 0 }}>{body}</View>

      <Modal
        open={repoOpen}
        onOpenChange={setRepoOpen}
        title={strings.selectRepo}
        icon={<Icon name="FolderGit2" size={18} color={theme.colors.foreground} />}
      >
        <Modal.Content>
          {/* 列表直接交给弹层正文滚动：内嵌固定 maxHeight 的 ScrollView 在手机上
              会被sheet手势吃掉滚动，超出部分既看不到也滚不动（11 个仓库只显示 9 个）。 */}
          <View style={{ gap: 4 }}>
            {repoOptions.map((entry) => {
              const active = entry.path === repo;
              return (
                <Pressable
                  key={entry.path === "" ? "__workspace__" : entry.path}
                  accessibilityRole="button"
                  accessibilityLabel={entry.root}
                  onPress={() => selectRepo(entry)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                    borderRadius: 8,
                    backgroundColor: active
                      ? theme.colors.surface2
                      : pressed
                        ? theme.colors.surface1
                        : "transparent",
                  })}
                >
                  <Icon
                    name={entry.kind === "workspace" ? "Home" : "FolderGit2"}
                    size={15}
                    color={active ? theme.colors.accent : theme.colors.foregroundMuted}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{ color: theme.colors.foreground, fontSize: 13 }}
                    >
                      {entry.name}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{ color: theme.colors.foregroundMuted, fontSize: 10 }}
                    >
                      {entry.path === ""
                        ? strings.workspaceRepo
                        : entry.path}
                      {entry.branch ? ` · ${entry.branch}` : ""}
                      {entry.path === "" && !hasRepo ? ` · ${strings.files}` : ""}
                    </Text>
                  </View>
                  {active ? (
                    <Icon name="Check" size={14} color={theme.colors.accent} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </Modal.Content>
      </Modal>
    </View>
  );
}

function TabButton({
  theme,
  label,
  icon,
  active,
  disabled,
  count,
  compact,
  onPress,
}: {
  theme: PluginTheme;
  label: string;
  icon: string;
  active: boolean;
  disabled?: boolean;
  count?: number;
  /** 极窄档收成图标：文字隐藏，无障碍标签与计数保留。 */
  compact?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 9,
        paddingVertical: 7,
        borderBottomWidth: 2,
        borderColor: active ? theme.colors.accent : "transparent",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Icon
        name={icon}
        size={12}
        color={active ? theme.colors.foreground : theme.colors.foregroundMuted}
      />
      {compact ? null : (
        <Text
          style={{
            color: active ? theme.colors.foreground : theme.colors.foregroundMuted,
            fontSize: 12,
            fontWeight: active ? "600" : "400",
          }}
        >
          {label}
        </Text>
      )}
      <CountBadge theme={theme} value={count ?? 0} />
    </Pressable>
  );
}
