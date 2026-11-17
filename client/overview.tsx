import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal, TextInput, copyText, useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import type { GitAction, GitCommit, GitRef, GitSnapshot } from "../shared/git";
import { useDiffQuery, useGitAction, useHistoryQuery, useMergePreviewQuery, useRefsQuery, useShowQuery } from "./api";
import { DiffView, type DiffMode } from "./diff-view";
import { formatDate, relativeTime } from "./format";
import { GRAPH_COLORS, laneCount, layoutGraph } from "./graph";
import { EmptyState, IconButton, SectionLabel, TextButton } from "./kit";
import type { PanelMode } from "./layout";
import { useLocale, type Strings } from "./strings";
import { UpdateBranchDialog } from "./update-branch";

interface ConfirmState {
  title: string;
  body: string;
  label: string;
  danger?: boolean;
  run: () => void;
}

export function OverviewTab({
  cwd,
  repo,
  snapshot,
  theme,
  strings,
  mode,
}: {
  cwd: string | null;
  repo: string;
  snapshot: GitSnapshot;
  theme: PluginTheme;
  strings: Strings;
  mode: PanelMode;
}) {
  const wide = mode === "wide";
  const zh = useLocale().toLowerCase().startsWith("zh");
  const toast = useToast();
  const [limit, setLimit] = useState(80);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchAction, setBranchAction] = useState<{ name: string; track: boolean } | null>(null);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateSelected, setUpdateSelected] = useState<string | null>(null);
  const [updateOp, setUpdateOp] = useState<"merge" | "rebase">("merge");
  const [createFrom, setCreateFrom] = useState<string | null>(null);
  const [newBranch, setNewBranch] = useState("");
  const [tagFor, setTagFor] = useState<string | null>(null);
  const [tagName, setTagName] = useState("");
  const [tagMessage, setTagMessage] = useState("");
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [diffFile, setDiffFile] = useState<{ path: string; commit: string } | null>(null);
  const [diffContext, setDiffContext] = useState(3);
  const [diffMode, setDiffMode] = useState<DiffMode>("unified");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 280);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setSelected(null);
    setLimit(80);
    setSearch("");
    setDebounced("");
  }, [repo]);

  const refs = useRefsQuery(cwd, repo, true);
  const mergePreview = useMergePreviewQuery(cwd, repo, updateOpen ? updateSelected : null, updateOpen ? updateOp : "merge");
  const history = useHistoryQuery(cwd, repo, { limit, search: debounced }, true);
  const show = useShowQuery(cwd, repo, selected);
  const action = useGitAction(cwd, repo);
  const diff = useDiffQuery(
    cwd,
    repo,
    diffFile ? { path: diffFile.path, base: "commit", commit: diffFile.commit } : null,
    diffContext,
    Boolean(diffFile),
  );

  const commits = history.data?.commits ?? [];
  const graphRows = useMemo(
    () => layoutGraph(commits.map((commit) => ({ hash: commit.hash, parents: commit.parents }))),
    [commits],
  );
  const lanes = laneCount(graphRows);

  function runGit(value: GitAction, success?: string) {
    action.mutate(value, {
      onSuccess: (result) => {
        if (!result.ok) {
          toast.error(result.error.message || strings.operationFailed);
          return;
        }
        if (success) toast.show(success, { variant: "success" });
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : strings.operationFailed);
      },
    });
  }

  async function copy(value: string) {
    try {
      await copyText(value);
      toast.show(strings.copied, { variant: "success" });
    } catch {
      toast.error(strings.operationFailed);
    }
  }

  const detailCommit = show.data?.commit ?? commits.find((c) => c.hash === selected) ?? null;

  const branchList = (
    <BranchesPane
      theme={theme}
      strings={strings}
      data={refs.data}
      current={snapshot.branch}
      onPick={(name, track) => {
        setBranchOpen(false);
        setBranchAction({ name, track: track === true });
      }}
      onCreate={() => {
        setBranchOpen(false);
        setCreateFrom("HEAD");
        setNewBranch("");
      }}
      onRefresh={() => void refs.refetch()}
      onUpdate={() => {
        setUpdateSelected(null);
        setUpdateOp("merge");
        setUpdateOpen(true);
      }}
    />
  );

  return (
    <View style={{ flex: 1, minHeight: 0, flexDirection: "row" }}>
      {wide ? (
        <View
          style={{
            width: 214,
            borderRightWidth: 1,
            borderColor: theme.colors.border,
            minHeight: 0,
          }}
        >
          {branchList}
        </View>
      ) : null}

      <View style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 6,
            borderBottomWidth: selected && !wide ? 0 : 1,
            borderColor: theme.colors.border,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          {!wide ? (
            <IconButton
              theme={theme}
              icon="GitBranch"
              label={strings.branches}
              onPress={() => setBranchOpen(true)}
            />
          ) : null}
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: 7,
              paddingHorizontal: 7,
              height: 28,
            }}
          >
            <Icon name="Search" size={12} color={theme.colors.foregroundMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={strings.searchPlaceholder}
              placeholderTextColor={theme.colors.foregroundMuted}
              style={{ flex: 1, color: theme.colors.foreground, fontSize: 12, padding: 0 }}
            />
            {search !== "" ? (
              <IconButton
                theme={theme}
                icon="X"
                label={strings.close}
                size={12}
                onPress={() => setSearch("")}
              />
            ) : null}
          </View>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
            {commits.length}
            {history.data?.hasMore ? "+" : ""}
          </Text>
        </View>

        {selected && !wide ? (
          <CommitDetail
            theme={theme}
            strings={strings}
            zh={zh}
            commit={detailCommit}
            files={show.data?.files ?? []}
            body={show.data?.body ?? ""}
            insertions={show.data?.insertions ?? 0}
            deletions={show.data?.deletions ?? 0}
            loading={selected !== null && show.isPending}
            onBack={() => setSelected(null)}
            onCopy={copy}
            onFile={(path) => {
              setDiffFile({ path, commit: selected });
              setDiffContext(3);
            }}
            onTag={(hash) => {
              setTagFor(hash);
              setTagName("");
              setTagMessage("");
            }}
            onRevert={(hash) =>
              setConfirm({
                title: strings.revert,
                body: strings.revertConfirm,
                label: strings.revert,
                run: () => runGit({ kind: "revert", commit: hash }, strings.commitDone),
              })
            }
            onReset={(hash) => setResetFor(hash)}
          />
        ) : (
          <FlatList
            data={commits}
            keyExtractor={(item) => item.hash}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 24 }}
            ListEmptyComponent={
              history.isPending ? (
                <EmptyState theme={theme} icon="Clock" title={strings.loading} />
              ) : (
                <EmptyState theme={theme} icon="GitCommitHorizontal" title={strings.noCommits} />
              )
            }
            ListFooterComponent={
              history.data?.hasMore ? (
                <View style={{ padding: 10, alignItems: "center" }}>
                  <TextButton
                    theme={theme}
                    label={history.isFetching ? strings.loading : strings.loadMore}
                    hint={strings.hintLoadMore}
                    onPress={() => setLimit((value) => value + 80)}
                    disabled={history.isFetching}
                    compact
                  />
                </View>
              ) : null
            }
            renderItem={({ item, index }) => (
              <CommitRow
                theme={theme}
                commit={item}
                row={graphRows[index]}
                lanes={lanes}
                selected={selected === item.hash}
                zh={zh}
                currentBranch={snapshot.branch}
                onPress={() => setSelected(item.hash)}
              />
            )}
          />
        )}
      </View>

      {wide ? (
        <View
          style={{
            width: 320,
            borderLeftWidth: 1,
            borderColor: theme.colors.border,
            minHeight: 0,
          }}
        >
          <CommitDetail
            theme={theme}
            strings={strings}
            zh={zh}
            commit={detailCommit}
            files={show.data?.files ?? []}
            body={show.data?.body ?? ""}
            insertions={show.data?.insertions ?? 0}
            deletions={show.data?.deletions ?? 0}
            loading={selected !== null && show.isPending}
            onCopy={copy}
            onFile={(path) => {
              if (selected) {
                setDiffFile({ path, commit: selected });
                setDiffContext(3);
              }
            }}
            onTag={(hash) => {
              setTagFor(hash);
              setTagName("");
              setTagMessage("");
            }}
            onRevert={(hash) =>
              setConfirm({
                title: strings.revert,
                body: strings.revertConfirm,
                label: strings.revert,
                run: () => runGit({ kind: "revert", commit: hash }, strings.commitDone),
              })
            }
            onReset={(hash) => setResetFor(hash)}
          />
        </View>
      ) : null}

      <Modal
        open={branchOpen}
        onOpenChange={setBranchOpen}
        title={strings.branches}
        icon={<Icon name="GitBranch" size={18} color={theme.colors.foreground} />}
      >
        <Modal.Content scrollable={false} style={{ flex: 1, minHeight: 360 }}>
          {branchList}
        </Modal.Content>
      </Modal>

      <UpdateBranchDialog
        theme={theme}
        strings={strings}
        open={updateOpen}
        current={snapshot.branch ?? ""}
        operation={updateOp}
        data={refs.data ? { local: refs.data.local, remote: refs.data.remote } : undefined}
        selected={updateSelected}
        preview={
          mergePreview.data?.ok
            ? {
                commitCount: mergePreview.data.commitCount,
                conflicts: mergePreview.data.conflicts,
                previewSupported: mergePreview.data.previewSupported,
              }
            : null
        }
        workspaceClean={mergePreview.data?.ok ? mergePreview.data.workspaceClean : null}
        branchState={snapshot.branchState}
        conflictedFiles={snapshot.changes.filter((c) => c.status === "conflicted").map((c) => c.path)}
        pending={action.isPending}
        onSelectOperation={setUpdateOp}
        onSelect={setUpdateSelected}
        onOpenChange={(next) => {
          if (!next) setUpdateOpen(false);
        }}
        onRun={() => {
          if (!updateSelected) return;
          if (updateOp === "merge") {
            runGit({ kind: "merge", branch: updateSelected }, strings.updateDone);
          } else {
            runGit({ kind: "rebase", onto: updateSelected }, strings.updateRebaseDone);
          }
          setUpdateOpen(false);
          setUpdateSelected(null);
        }}
        onAbort={() => {
          runGit({ kind: "abort" }, strings.updateAborted);
          setUpdateOpen(false);
        }}
      />

      <Modal
        open={branchAction !== null}
        onOpenChange={(open) => {
          if (!open) setBranchAction(null);
        }}
        title={branchAction?.name ?? strings.branches}
        icon={<Icon name="GitBranch" size={18} color={theme.colors.foreground} />}
      >
        <Modal.Content>
          <View style={{ gap: 10 }}>
            {branchAction?.name === snapshot.branch ? (
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
                {strings.branch}: {snapshot.branch}
              </Text>
            ) : null}
            <TextButton
              theme={theme}
              label={`${strings.checkout} ${branchAction?.name ?? ""}`}
              hint={strings.hintCheckoutBranch}
              onPress={() => {
                if (branchAction) {
                  runGit({
                    kind: "checkout",
                    name: branchAction.name,
                    track: branchAction.track || undefined,
                  });
                }
                setBranchAction(null);
              }}
              primary
              disabled={action.isPending || branchAction?.name === snapshot.branch}
            />
            <TextButton
              theme={theme}
              label={strings.createBranch}
              hint={strings.hintCreateFromBranch}
              onPress={() => {
                setCreateFrom(branchAction?.name ?? null);
                setNewBranch("");
                setBranchAction(null);
              }}
              disabled={branchAction === null}
            />
            <TextButton
              theme={theme}
              label={strings.cancel}
              hint={strings.hintCancel}
              onPress={() => setBranchAction(null)}
            />
          </View>
        </Modal.Content>
      </Modal>

      <Modal
        open={createFrom !== null}
        onOpenChange={(open) => {
          if (!open) setCreateFrom(null);
        }}
        title={strings.createBranch}
        icon={<Icon name="GitBranchPlus" size={18} color={theme.colors.foreground} />}
      >
        <Modal.Content>
          <View style={{ gap: 10 }}>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
              {strings.from} {createFrom === "HEAD" ? snapshot.branch ?? "HEAD" : createFrom}
            </Text>
            <TextInput
              value={newBranch}
              onChangeText={setNewBranch}
              autoFocus
              placeholder={strings.branchName}
              placeholderTextColor={theme.colors.foregroundMuted}
              style={inputStyle(theme)}
            />
            <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
              <TextButton
                theme={theme}
                label={strings.cancel}
                hint={strings.hintCancel}
                onPress={() => setCreateFrom(null)}
              />
              <TextButton
                theme={theme}
                label={strings.createBranch}
                hint={strings.hintCreateBranchFromName}
                primary
                disabled={newBranch.trim() === "" || action.isPending}
                onPress={() => {
                  const name = newBranch.trim();
                  if (name === "") return;
                  runGit({
                    kind: "checkout",
                    name,
                    createFrom: createFrom === "HEAD" ? undefined : (createFrom ?? undefined),
                  });
                  setCreateFrom(null);
                }}
              />
            </View>
          </View>
        </Modal.Content>
      </Modal>

      <Modal
        open={tagFor !== null}
        onOpenChange={(open) => {
          if (!open) setTagFor(null);
        }}
        title={strings.tagCreate}
        icon={<Icon name="Tag" size={18} color={theme.colors.foreground} />}
      >
        <Modal.Content>
          <View style={{ gap: 10 }}>
            <TextInput
              value={tagName}
              onChangeText={setTagName}
              autoFocus
              placeholder={strings.tagName}
              placeholderTextColor={theme.colors.foregroundMuted}
              style={inputStyle(theme)}
            />
            <TextInput
              value={tagMessage}
              onChangeText={setTagMessage}
              placeholder={strings.tagMessage}
              placeholderTextColor={theme.colors.foregroundMuted}
              style={inputStyle(theme)}
            />
            <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
              <TextButton
                theme={theme}
                label={strings.cancel}
                hint={strings.hintCancel}
                onPress={() => setTagFor(null)}
              />
              <TextButton
                theme={theme}
                label={strings.tagCreate}
                hint={strings.hintCreateTag}
                primary
                disabled={tagName.trim() === "" || tagFor === null || action.isPending}
                onPress={() => {
                  if (!tagFor) return;
                  runGit({
                    kind: "tagCreate",
                    name: tagName.trim(),
                    commit: tagFor,
                    message: tagMessage.trim() || undefined,
                  });
                  setTagFor(null);
                }}
              />
            </View>
          </View>
        </Modal.Content>
      </Modal>

      <Modal
        open={resetFor !== null}
        onOpenChange={(open) => {
          if (!open) setResetFor(null);
        }}
        title={strings.reset}
        icon={<Icon name="RotateCcw" size={18} color={theme.colors.statusDanger} />}
      >
        <Modal.Content>
          <View style={{ gap: 10 }}>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
              {strings.resetConfirm}
            </Text>
            {(["soft", "mixed", "hard"] as const).map((mode) => (
              <TextButton
                key={mode}
                theme={theme}
                label={strings[`reset${mode[0]?.toUpperCase()}${mode.slice(1)}` as "resetSoft"]}
                hint={
                  mode === "soft"
                    ? strings.hintResetSoft
                    : mode === "mixed"
                      ? strings.hintResetMixed
                      : strings.hintResetHard
                }
                danger={mode === "hard"}
                onPress={() => {
                  if (resetFor) runGit({ kind: "reset", commit: resetFor, mode });
                  setResetFor(null);
                }}
                disabled={action.isPending}
              />
            ))}
            <TextButton
              theme={theme}
              label={strings.cancel}
              hint={strings.hintCancel}
              onPress={() => setResetFor(null)}
            />
          </View>
        </Modal.Content>
      </Modal>

      <Modal
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={confirm?.title ?? strings.confirm}
        icon={<Icon name="AlertTriangle" size={18} color={theme.colors.statusWarning} />}
      >
        <Modal.Content>
          <View style={{ gap: 12 }}>
            <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>{confirm?.body}</Text>
            <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
              <TextButton
                theme={theme}
                label={strings.cancel}
                hint={strings.hintCancel}
                onPress={() => setConfirm(null)}
              />
              <TextButton
                theme={theme}
                label={confirm?.label ?? strings.confirm}
                hint={strings.hintConfirm}
                danger={confirm?.danger}
                onPress={() => {
                  confirm?.run();
                  setConfirm(null);
                }}
              />
            </View>
          </View>
        </Modal.Content>
      </Modal>

      <Modal
        open={diffFile !== null}
        onOpenChange={(open) => {
          if (!open) setDiffFile(null);
        }}
        title={diffFile?.path ?? strings.diff}
        icon={<Icon name="FileDiff" size={18} color={theme.colors.foreground} />}
      >
        <Modal.Content scrollable={false} style={{ flex: 1 }}>
          <View style={{ flex: 1, minHeight: 0 }}>
            <DiffView
              theme={theme}
              strings={strings}
              text={diff.data?.ok ? diff.data.text : ""}
              mode={diffMode}
              onModeChange={setDiffMode}
              panelMode={mode}
              binary={diff.data?.ok ? diff.data.binary : false}
              tooLarge={diff.data?.ok ? diff.data.tooLarge : false}
              loading={diff.isPending}
              error={
                diff.data && !diff.data.ok
                  ? diff.data.error.message
                  : diff.isError
                    ? strings.operationFailed
                    : null
              }
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingTop: 6 }}>
              <TextButton
                theme={theme}
                label={diffContext === 3 ? strings.expandAll : strings.collapse}
                hint={diffContext === 3 ? strings.hintExpandAll : strings.hintCollapse}
                compact
                onPress={() => setDiffContext((value) => (value === 3 ? 2000 : 3))}
                disabled={diff.isFetching}
              />
            </View>
          </View>
        </Modal.Content>
      </Modal>
    </View>
  );
}

function inputStyle(theme: PluginTheme) {
  return {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: theme.colors.foreground,
    backgroundColor: theme.colors.surface1,
    fontSize: 13,
  };
}

export function BranchesPane({
  theme,
  strings,
  data,
  current,
  onPick,
  onCreate,
  onRefresh,
  onUpdate,
}: {
  theme: PluginTheme;
  strings: Strings;
  data:
    | {
        current: string | null;
        defaultBranch: string | null;
        local: Array<{ name: string; shortHash: string | null; ahead?: number; behind?: number }>;
        remote: Array<{ name: string; shortHash: string | null }>;
        tags: Array<{ name: string; shortHash: string | null }>;
      }
    | undefined;
  current: string | null;
  onPick: (name: string, track?: boolean) => void;
  onCreate: () => void;
  onRefresh: () => void;
  onUpdate: () => void;
}) {
  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 8,
          paddingVertical: 6,
        }}
      >
        <SectionLabel theme={theme}>{strings.branches}</SectionLabel>
        <View style={{ flexDirection: "row", gap: 2 }}>
          <IconButton
            theme={theme}
            icon="GitMerge"
            label={strings.updateBranch}
            hint={strings.hintUpdateBranch}
            onPress={onUpdate}
          />
          <IconButton
            theme={theme}
            icon="Plus"
            label={strings.createBranch}
            hint={strings.hintNewBranch}
            onPress={onCreate}
          />
          <IconButton
            theme={theme}
            icon="RefreshCw"
            label={strings.refresh}
            hint={strings.hintRefreshBranches}
            onPress={onRefresh}
          />
        </View>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
        {data?.local.length ? (
          data.local.map((branch) => {
            const active = branch.name === current;
            return (
              <Pressable
                key={branch.name}
                accessibilityRole="button"
                accessibilityLabel={branch.name}
                onPress={() => onPick(branch.name)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  paddingHorizontal: 8,
                  paddingVertical: 5,
                  backgroundColor: pressed ? theme.colors.surface1 : "transparent",
                })}
              >
                <Icon
                  name={active ? "Check" : "GitBranch"}
                  size={12}
                  color={active ? theme.colors.statusSuccess : theme.colors.foregroundMuted}
                />
                <Text
                  numberOfLines={1}
                  style={{
                    flex: 1,
                    color: active ? theme.colors.foreground : theme.colors.foregroundMuted,
                    fontSize: 12,
                  }}
                >
                  {branch.name}
                </Text>
                {branch.ahead ? (
                  <Text style={{ color: theme.colors.statusWarning, fontSize: 10 }}>
                    ↑{branch.ahead}
                  </Text>
                ) : null}
                {branch.behind ? (
                  <Text style={{ color: theme.colors.statusWarning, fontSize: 10 }}>
                    ↓{branch.behind}
                  </Text>
                ) : null}
              </Pressable>
            );
          })
        ) : (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, padding: 10 }}>
            {strings.noBranches}
          </Text>
        )}
        {data?.remote.length ? (
          <View style={{ marginTop: 8 }}>
            <View style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
              <SectionLabel theme={theme}>{strings.remote}</SectionLabel>
            </View>
            {data.remote.slice(0, 12).map((branch) => (
              <Pressable
                key={branch.name}
                accessibilityRole="button"
                accessibilityLabel={branch.name}
                onPress={() => onPick(branch.name, true)}
                style={({ pressed }) => ({
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                  backgroundColor: pressed ? theme.colors.surface1 : "transparent",
                })}
              >
                <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
                  {branch.name}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {data?.tags.length ? (
          <View style={{ marginTop: 8 }}>
            <View style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
              <SectionLabel theme={theme}>{strings.tags}</SectionLabel>
            </View>
            {data.tags.slice(0, 20).map((tag) => (
              <View
                key={tag.name}
                style={{ paddingHorizontal: 12, paddingVertical: 4, flexDirection: "row", gap: 5 }}
              >
                <Icon name="Tag" size={11} color={theme.colors.statusWarning} />
                <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
                  {tag.name}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function CommitRow({
  theme,
  commit,
  row,
  lanes,
  selected,
  currentBranch,
  zh,
  onPress,
}: {
  theme: PluginTheme;
  commit: GitCommit & { parents: string[]; refs: GitRef[] };
  row: ReturnType<typeof layoutGraph>[number] | undefined;
  lanes: number;
  selected: boolean;
  currentBranch: string | null;
  zh: boolean;
  onPress: () => void;
}) {
  const width = lanes * 10 + 8;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${commit.shortHash} ${commit.subject}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingRight: 8,
        height: 38,
        backgroundColor: selected
          ? theme.colors.surface2
          : pressed
            ? theme.colors.surface1
            : "transparent",
      })}
    >
      <View style={{ width, height: 38 }}>
        {row
          ? row.before.map((hash, lane) =>
              hash ? (
                <View
                  key={`b-${lane}`}
                  style={{
                    position: "absolute",
                    left: lane * 10 + 3,
                    top: 0,
                    width: 2,
                    height: 19,
                    backgroundColor: GRAPH_COLORS[lane % GRAPH_COLORS.length],
                  }}
                />
              ) : null,
            )
          : null}
        {row
          ? row.after.map((hash, lane) =>
              hash ? (
                <View
                  key={`a-${lane}`}
                  style={{
                    position: "absolute",
                    left: lane * 10 + 3,
                    top: 19,
                    width: 2,
                    height: 19,
                    backgroundColor: GRAPH_COLORS[lane % GRAPH_COLORS.length],
                  }}
                />
              ) : null,
            )
          : null}
        {row
          ? row.parentLanes
              .filter((lane) => lane !== row.lane)
              .map((lane) => (
                <View
                  key={`p-${lane}`}
                  style={{
                    position: "absolute",
                    top: 18,
                    left: Math.min(lane, row.lane) * 10 + 3,
                    width: Math.abs(lane - row.lane) * 10 + 2,
                    height: 2,
                    backgroundColor: GRAPH_COLORS[lane % GRAPH_COLORS.length],
                    opacity: 0.8,
                  }}
                />
              ))
          : null}
        {row ? (
          <View
            style={{
              position: "absolute",
              left: row.lane * 10,
              top: 14,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: GRAPH_COLORS[row.color % GRAPH_COLORS.length],
            }}
          />
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontSize: 12, flexShrink: 1 }}>
            {commit.subject || "(no message)"}
          </Text>
          {commit.refs.slice(0, 3).map((ref) => (
            <View
              key={`${ref.kind}-${ref.name}`}
              style={{
                paddingHorizontal: 4,
                paddingVertical: 1,
                borderRadius: 4,
                backgroundColor:
                  ref.kind === "tag"
                    ? "rgba(210,153,34,0.16)"
                    : ref.kind === "remote"
                      ? theme.colors.surface1
                      : "rgba(76,154,255,0.16)",
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  color:
                    ref.kind === "tag"
                      ? theme.colors.statusWarning
                      : ref.kind === "remote"
                        ? theme.colors.foregroundMuted
                        : theme.colors.accent,
                  fontSize: 9,
                  maxWidth: 100,
                }}
              >
                {ref.name}
              </Text>
            </View>
          ))}
          {commit.refs.some((ref) => ref.head) && currentBranch ? null : null}
        </View>
        <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 10 }}>
          {commit.shortHash} · {commit.author} · {relativeTime(commit.dateIso, zh)}
        </Text>
      </View>
    </Pressable>
  );
}

function CommitDetail({
  theme,
  strings,
  zh,
  commit,
  body,
  files,
  insertions,
  deletions,
  loading,
  onBack,
  onCopy,
  onFile,
  onTag,
  onRevert,
  onReset,
}: {
  theme: PluginTheme;
  strings: Strings;
  zh: boolean;
  commit: GitCommit | null;
  body: string;
  files: Array<{ path: string; status: string }>;
  insertions: number;
  deletions: number;
  loading: boolean;
  onBack?: () => void;
  onCopy: (value: string) => void;
  onFile: (path: string) => void;
  onTag: (hash: string) => void;
  onRevert: (hash: string) => void;
  onReset: (hash: string) => void;
}) {
  if (!commit) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
        <Icon name="GitCommitHorizontal" size={22} color={theme.colors.foregroundMuted} />
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, marginTop: 6 }}>
          {loading ? strings.loading : strings.commitDetail}
        </Text>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          paddingHorizontal: 8,
          paddingVertical: 5,
          borderBottomWidth: 1,
          borderColor: theme.colors.border,
          flexWrap: "wrap",
        }}
      >
        {onBack ? (
          <IconButton theme={theme} icon="ChevronLeft" label={strings.back} onPress={onBack} />
        ) : null}
        <Text style={{ color: theme.colors.foregroundMuted, fontFamily: "Menlo", fontSize: 11 }}>
          {commit.shortHash}
        </Text>
        <View style={{ flex: 1 }} />
        <IconButton
          theme={theme}
          icon="Copy"
          label={strings.copyHash}
          onPress={() => onCopy(commit.hash)}
        />
        <IconButton theme={theme} icon="Tag" label={strings.tagCreate} onPress={() => onTag(commit.hash)} />
        <IconButton
          theme={theme}
          icon="RotateCcw"
          label={strings.revert}
          onPress={() => onRevert(commit.hash)}
        />
        <IconButton
          theme={theme}
          icon="History"
          label={strings.reset}
          onPress={() => onReset(commit.hash)}
        />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10, gap: 8 }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 14, fontWeight: "600" }}>
          {commit.subject}
        </Text>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
          {commit.author} · {formatDate(commit.dateIso)}
        </Text>
        {body.trim() !== "" ? (
          <Text style={{ color: theme.colors.foreground, fontSize: 12, lineHeight: 18 }}>
            {body}
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Text style={{ color: theme.colors.statusSuccess, fontSize: 11 }}>+{insertions}</Text>
          <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>-{deletions}</Text>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
            {files.length} {strings.file}
          </Text>
        </View>
        <SectionLabel theme={theme}>{strings.changedFiles}</SectionLabel>
        {files.map((file) => (
          <Pressable
            key={`${file.status}-${file.path}`}
            accessibilityRole="button"
            accessibilityLabel={file.path}
            onPress={() => onFile(file.path)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingVertical: 4,
              paddingHorizontal: 4,
              borderRadius: 5,
              backgroundColor: pressed ? theme.colors.surface1 : "transparent",
            })}
          >
            <Text
              style={{
                color:
                  file.status === "added"
                    ? theme.colors.statusSuccess
                    : file.status === "deleted"
                      ? theme.colors.statusDanger
                      : theme.colors.statusWarning,
                fontSize: 10,
                width: 12,
              }}
            >
              {file.status[0]?.toUpperCase()}
            </Text>
            <Text
              numberOfLines={1}
              style={{ color: theme.colors.foreground, fontSize: 12, flex: 1 }}
            >
              {file.path}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
