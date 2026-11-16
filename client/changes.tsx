import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal, TextInput, useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { GitAction, GitChange, GitSnapshot } from "../shared/git";
import {
  changeKey,
  useDiffQuery,
  useGitAction,
  useLastMessageQuery,
  useStashQuery,
} from "./api";
import { DiffView, type DiffMode } from "./diff-view";
import { baseName, dirName } from "./format";
import {
  Checkbox,
  EmptyState,
  IconButton,
  PagedFooter,
  SectionLabel,
  TextButton,
  usePagedList,
} from "./kit";
import { useLocale, type Strings } from "./strings";

export function ChangesTab({
  cwd,
  repo,
  snapshot,
  theme,
  strings,
  wide,
  initialView,
  initialDiffMode,
}: {
  cwd: string | null;
  repo: string;
  snapshot: GitSnapshot;
  theme: PluginTheme;
  strings: Strings;
  wide: boolean;
  initialView: "flat" | "tree";
  initialDiffMode: DiffMode;
}) {
  const zh = useLocale().toLowerCase().startsWith("zh");
  const toast = useToast();
  const [message, setMessage] = useState("");
  const [amend, setAmend] = useState(false);
  const [selected, setSelected] = useState<GitChange | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"flat" | "tree">(initialView);
  const [diffMode, setDiffMode] = useState<DiffMode>(initialDiffMode);
  const [context, setContext] = useState(3);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [diffOpen, setDiffOpen] = useState(false);
  const [confirm, setConfirm] = useState<{
    title: string;
    body: string;
    label: string;
    danger?: boolean;
    run: () => void;
  } | null>(null);
  const [stashOpen, setStashOpen] = useState(false);
  const [stashMessage, setStashMessage] = useState("");

  useEffect(() => {
    setSelected(null);
    setSelection(new Set());
    setMessage("");
    setAmend(false);
  }, [repo]);

  const lastMessage = useLastMessageQuery(cwd, repo, true);
  const stashes = useStashQuery(cwd, repo, stashOpen);
  const action = useGitAction(cwd, repo);
  const diff = useDiffQuery(
    cwd,
    repo,
    selected ? { path: selected.path, base: selected.staged ? "staged" : "worktree" } : null,
    context,
    Boolean(selected),
  );

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

  const unstaged = snapshot.changes.filter((change) => !change.staged);
  const staged = snapshot.changes.filter((change) => change.staged);
  const conflicted = snapshot.changes.filter((change) => change.status === "conflicted");

  const selectedChanges = snapshot.changes.filter((change) => selection.has(changeKey(change)));
  const selectedStaged = selectedChanges.filter((change) => change.staged);
  const selectedWorktree = selectedChanges.filter((change) => !change.staged);

  const treeRows = useMemo(
    () => (view === "tree" ? buildTreeRows(snapshot.changes, expanded) : []),
    [snapshot.changes, view, expanded],
  );

  // A repo with thousands of changed files must not mount thousands of rows at
  // once: render one page and let the user pull in the rest.
  const stagedPage = usePagedList(staged);
  const unstagedPage = usePagedList(unstaged);
  const treePage = usePagedList(treeRows);

  const canCommit =
    message.trim() !== "" && !action.isPending && (snapshot.staged > 0 || amend);

  const doCommit = () => {
    if (message.trim() === "") {
      toast.error(strings.commitEmpty);
      return;
    }
    action.mutate(
      { kind: "commit", message: message.trim(), amend: amend || undefined },
      {
        onSuccess: (result) => {
          if (!result.ok) {
            toast.error(result.error.message || strings.operationFailed);
            return;
          }
          setMessage("");
          setAmend(false);
          setSelection(new Set());
          toast.show(strings.commitDone, { variant: "success" });
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : strings.operationFailed);
        },
      },
    );
  };

  const toggleSelection = (change: GitChange) => {
    const key = changeKey(change);
    setSelection((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const openDiff = (change: GitChange) => {
    setSelected(change);
    setContext(3);
    if (!wide) setDiffOpen(true);
  };

  const diffPanel = selected ? (
    <DiffView
      theme={theme}
      strings={strings}
      text={diff.data?.ok ? diff.data.text : ""}
      mode={diffMode}
      onModeChange={setDiffMode}
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
  ) : (
    <EmptyState theme={theme} icon="FileDiff" title={strings.diff} />
  );

  const list = (
    <View style={{ flex: 1, minHeight: 0 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, padding: 6 }}>
        <View style={{ flex: 1, flexDirection: "row", gap: 6 }}>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
            {snapshot.stats.fileCount} {strings.file}
          </Text>
          <Text style={{ color: theme.colors.statusSuccess, fontSize: 11 }}>
            +{snapshot.stats.insertions}
          </Text>
          <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>
            -{snapshot.stats.deletions}
          </Text>
        </View>
        <IconButton
          theme={theme}
          icon={view === "tree" ? "ListTree" : "List"}
          label={strings.changesView}
          onPress={() => setView((value) => (value === "tree" ? "flat" : "tree"))}
        />
        <IconButton
          theme={theme}
          icon="Archive"
          label={strings.stashPush}
          onPress={() => setStashOpen(true)}
        />
      </View>

      {selection.size > 0 ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            paddingHorizontal: 6,
            paddingBottom: 5,
            borderBottomWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, flex: 1 }}>
            {selection.size} selected
          </Text>
          {selectedWorktree.length > 0 ? (
            <TextButton
              theme={theme}
              label={strings.stage}
              compact
              disabled={action.isPending}
              onPress={() =>
                runGit({
                  kind: "stage",
                  paths: selectedWorktree.map((change) => change.path),
                })
              }
            />
          ) : null}
          {selectedStaged.length > 0 ? (
            <TextButton
              theme={theme}
              label={strings.unstage}
              compact
              disabled={action.isPending}
              onPress={() =>
                runGit({
                  kind: "unstage",
                  paths: selectedStaged.map((change) => change.path),
                })
              }
            />
          ) : null}
          <IconButton
            theme={theme}
            icon="X"
            label={strings.cancel}
            onPress={() => setSelection(new Set())}
          />
        </View>
      ) : null}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
        {snapshot.changes.length === 0 ? (
          <EmptyState theme={theme} icon="CheckCircle2" title={strings.noChanges} />
        ) : view === "flat" ? (
          <>
            {staged.length > 0 ? (
              <SectionBlock
                theme={theme}
                strings={strings}
                label={`${strings.staged} ${staged.length}`}
                actions={
                  <IconButton
                    theme={theme}
                    icon="Undo2"
                    label={strings.unstageAll}
                    onPress={() => runGit({ kind: "unstageAll" })}
                  />
                }
              >
                {stagedPage.visible.map((change) => (
                  <ChangeRow
                    key={changeKey(change)}
                    theme={theme}
                    strings={strings}
                    change={change}
                    checked={selection.has(changeKey(change))}
                    selected={
                      selected?.path === change.path && selected.staged === change.staged
                    }
                    onToggle={() => toggleSelection(change)}
                    onPress={() => openDiff(change)}
                    onStage={() => runGit({ kind: "unstage", paths: [change.path] })}
                    onDiscard={() =>
                      setConfirm({
                        title: strings.discard,
                        body: strings.discardConfirm,
                        label: strings.discard,
                        danger: true,
                        run: () =>
                          runGit({
                            kind: "discard",
                            paths: [change.path],
                            staged: true,
                          }),
                      })
                    }
                  />
                ))}
                <PagedFooter
                  theme={theme}
                  label={strings.loadMore}
                  shown={stagedPage.visible.length}
                  total={stagedPage.total}
                  onPress={stagedPage.showMore}
                />
              </SectionBlock>
            ) : null}
            {unstaged.length > 0 ? (
              <SectionBlock
                theme={theme}
                strings={strings}
                label={`${strings.modified} ${unstaged.length}`}
                actions={
                  <IconButton
                    theme={theme}
                    icon="Plus"
                    label={strings.stageAll}
                    onPress={() => runGit({ kind: "stageAll" })}
                  />
                }
              >
                {unstagedPage.visible.map((change) => (
                  <ChangeRow
                    key={changeKey(change)}
                    theme={theme}
                    strings={strings}
                    change={change}
                    checked={selection.has(changeKey(change))}
                    selected={
                      selected?.path === change.path && selected.staged === change.staged
                    }
                    onToggle={() => toggleSelection(change)}
                    onPress={() => openDiff(change)}
                    onStage={() => runGit({ kind: "stage", paths: [change.path] })}
                    onDiscard={() =>
                      setConfirm({
                        title: strings.discard,
                        body: strings.discardConfirm,
                        label: strings.discard,
                        danger: true,
                        run: () =>
                          runGit({
                            kind: "discard",
                            paths: [change.path],
                            staged: false,
                          }),
                      })
                    }
                  />
                ))}
                <PagedFooter
                  theme={theme}
                  label={strings.loadMore}
                  shown={unstagedPage.visible.length}
                  total={unstagedPage.total}
                  onPress={unstagedPage.showMore}
                />
              </SectionBlock>
            ) : null}
          </>
        ) : (
          <View>
            {treePage.visible.map((row) =>
              row.kind === "dir" ? (
                <Pressable
                  key={`dir-${row.path}-${row.depth}`}
                  accessibilityRole="button"
                  accessibilityLabel={row.name}
                  onPress={() => {
                    setExpanded((previous) => {
                      const next = new Set(previous);
                      if (next.has(row.path)) next.delete(row.path);
                      else next.add(row.path);
                      return next;
                    });
                  }}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    paddingVertical: 5,
                    paddingLeft: 6 + row.depth * 12,
                    paddingRight: 8,
                    backgroundColor: pressed ? theme.colors.surface1 : "transparent",
                  })}
                >
                  <Icon
                    name={expanded.has(row.path) ? "ChevronDown" : "ChevronRight"}
                    size={12}
                    color={theme.colors.foregroundMuted}
                  />
                  <Icon name="Folder" size={13} color={theme.colors.statusWarning} />
                  <Text
                    numberOfLines={1}
                    style={{ color: theme.colors.foreground, fontSize: 12, flex: 1 }}
                  >
                    {row.name}
                  </Text>
                  <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10 }}>
                    {row.count}
                  </Text>
                </Pressable>
              ) : (
                <View key={`leaf-${changeKey(row.change)}`} style={{ paddingLeft: row.depth * 12 }}>
                  <ChangeRow
                    theme={theme}
                    strings={strings}
                    change={row.change}
                    checked={selection.has(changeKey(row.change))}
                    selected={
                      selected?.path === row.change.path &&
                      selected.staged === row.change.staged
                    }
                    onToggle={() => toggleSelection(row.change)}
                    onPress={() => openDiff(row.change)}
                    onStage={() =>
                      runGit({
                        kind: row.change.staged ? "unstage" : "stage",
                        paths: [row.change.path],
                      })
                    }
                    onDiscard={() =>
                      setConfirm({
                        title: strings.discard,
                        body: strings.discardConfirm,
                        label: strings.discard,
                        danger: true,
                        run: () =>
                          runGit({
                            kind: "discard",
                            paths: [row.change.path],
                            staged: row.change.staged,
                          }),
                      })
                    }
                  />
                </View>
              ),
            )}
            <PagedFooter
              theme={theme}
              label={strings.loadMore}
              shown={treePage.visible.length}
              total={treePage.total}
              onPress={treePage.showMore}
            />
          </View>
        )}
      </ScrollView>

      <View
        style={{
          borderTopWidth: 1,
          borderColor: theme.colors.border,
          padding: 8,
          gap: 6,
          backgroundColor: theme.colors.surface0,
        }}
      >
        {conflicted.length > 0 ? (
          <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>
            {strings.conflicted}: {conflicted.length}
          </Text>
        ) : null}
        <TextInput
          value={message}
          onChangeText={setMessage}
          multiline
          placeholder={amend ? strings.lastCommitMessage : strings.commitMessage}
          placeholderTextColor={theme.colors.foregroundMuted}
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: 7,
            paddingHorizontal: 9,
            paddingVertical: 7,
            color: theme.colors.foreground,
            backgroundColor: theme.colors.surface1,
            fontSize: 12,
            minHeight: 56,
            maxHeight: 110,
          }}
        />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Checkbox
            theme={theme}
            checked={amend}
            label={strings.amend}
            onPress={() => {
              const next = !amend;
              setAmend(next);
              if (next && message.trim() === "" && lastMessage.data?.message) {
                setMessage(lastMessage.data.message);
              }
            }}
          />
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10, flex: 1 }}>
            {snapshot.staged} {strings.staged} · {snapshot.stats.insertions}+ /{" "}
            {snapshot.stats.deletions}-
          </Text>
          <TextButton
            theme={theme}
            label={strings.commit}
            primary
            disabled={!canCommit}
            onPress={doCommit}
          />
        </View>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, minHeight: 0, flexDirection: wide ? "row" : "column" }}>
      <View
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          borderRightWidth: wide ? 1 : 0,
          borderColor: theme.colors.border,
        }}
      >
        {list}
      </View>
      {wide ? (
        <View style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", padding: 6 }}>
            <TextButton
              theme={theme}
              label={context === 3 ? strings.expandAll : strings.collapse}
              compact
              onPress={() => setContext((value) => (value === 3 ? 2000 : 3))}
              disabled={!selected || diff.isFetching}
            />
          </View>
          {diffPanel}
        </View>
      ) : null}

      <Modal
        open={diffOpen}
        onOpenChange={setDiffOpen}
        title={selected?.path ?? strings.diff}
        icon={<Icon name="FileDiff" size={18} color={theme.colors.foreground} />}
      >
        <Modal.Content scrollable={false} style={{ flex: 1 }}>
          <View style={{ flex: 1, minHeight: 0 }}>
            {diffPanel}
            <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingTop: 6 }}>
              <TextButton
                theme={theme}
                label={context === 3 ? strings.expandAll : strings.collapse}
                compact
                onPress={() => setContext((value) => (value === 3 ? 2000 : 3))}
                disabled={diff.isFetching}
              />
            </View>
          </View>
        </Modal.Content>
      </Modal>

      <Modal
        open={stashOpen}
        onOpenChange={setStashOpen}
        title={strings.stashList}
        icon={<Icon name="Archive" size={18} color={theme.colors.foreground} />}
      >
        <Modal.Content>
          <View style={{ gap: 10 }}>
            <TextInput
              value={stashMessage}
              onChangeText={setStashMessage}
              placeholder={strings.stashMessage}
              placeholderTextColor={theme.colors.foregroundMuted}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: 7,
                paddingHorizontal: 9,
                paddingVertical: 7,
                color: theme.colors.foreground,
                fontSize: 12,
              }}
            />
            <TextButton
              theme={theme}
              label={strings.stashPush}
              primary
              disabled={action.isPending || snapshot.changes.length === 0}
              onPress={() => {
                runGit({
                  kind: "stashPush",
                  message: stashMessage.trim() || undefined,
                });
                setStashMessage("");
              }}
            />
            {stashes.data?.entries.length ? (
              stashes.data.entries.map((entry) => (
                <View
                  key={`${entry.index}-${entry.sha}`}
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: 8,
                    padding: 8,
                    gap: 4,
                  }}
                >
                  <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>
                    {entry.message || `stash@{${entry.index}}`}
                  </Text>
                  <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10 }}>
                    {entry.branch ? `${entry.branch} · ` : ""}
                    {entry.relTime}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <TextButton
                      theme={theme}
                      label={strings.stashApply}
                      compact
                      disabled={action.isPending}
                      onPress={() =>
                        runGit({
                          kind: "stashApply",
                          index: entry.index,
                          sha: entry.sha,
                        })
                      }
                    />
                    <TextButton
                      theme={theme}
                      label={strings.stashPop}
                      compact
                      disabled={action.isPending}
                      onPress={() =>
                        runGit({
                          kind: "stashPop",
                          index: entry.index,
                          sha: entry.sha,
                        })
                      }
                    />
                    <TextButton
                      theme={theme}
                      label={strings.stashDrop}
                      compact
                      danger
                      disabled={action.isPending}
                      onPress={() =>
                        runGit({
                          kind: "stashDrop",
                          index: entry.index,
                          sha: entry.sha,
                        })
                      }
                    />
                  </View>
                </View>
              ))
            ) : (
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
                {strings.stashEmpty}
              </Text>
            )}
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
              <TextButton theme={theme} label={strings.cancel} onPress={() => setConfirm(null)} />
              <TextButton
                theme={theme}
                label={confirm?.label ?? strings.confirm}
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
    </View>
  );
}

function SectionBlock({
  theme,
  label,
  actions,
  children,
}: {
  theme: PluginTheme;
  strings: Strings;
  label: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 6,
          paddingVertical: 4,
          backgroundColor: theme.colors.surface1,
        }}
      >
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10, fontWeight: "600" }}>
          {label}
        </Text>
        {actions}
      </View>
      {children}
    </View>
  );
}

function ChangeRow({
  theme,
  strings,
  change,
  checked,
  selected,
  onToggle,
  onPress,
  onStage,
  onDiscard,
}: {
  theme: PluginTheme;
  strings: Strings;
  change: GitChange;
  checked: boolean;
  selected: boolean;
  onToggle: () => void;
  onPress: () => void;
  onStage: () => void;
  onDiscard: () => void;
}) {
  const name = baseName(change.path);
  const directory = dirName(change.path);
  const color =
    change.status === "added"
      ? theme.colors.statusSuccess
      : change.status === "deleted"
        ? theme.colors.statusDanger
        : change.status === "conflicted"
          ? theme.colors.statusDanger
          : theme.colors.statusWarning;
  const letter =
    change.status === "added"
      ? "A"
      : change.status === "deleted"
        ? "D"
        : change.status === "renamed"
          ? "R"
          : change.status === "untracked"
            ? "U"
            : change.status === "conflicted"
              ? "!"
              : "M";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={change.path}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingLeft: 6,
        paddingRight: 6,
        paddingVertical: 4,
        backgroundColor: selected
          ? theme.colors.surface2
          : pressed
            ? theme.colors.surface1
            : "transparent",
      })}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={change.path}
        onPress={onToggle}
        hitSlop={4}
      >
        <View
          style={{
            width: 14,
            height: 14,
            borderRadius: 4,
            borderWidth: 1,
            borderColor: checked ? theme.colors.accent : theme.colors.border,
            backgroundColor: checked ? theme.colors.accent : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {checked ? <Icon name="Check" size={10} color={theme.colors.accentForeground} /> : null}
        </View>
      </Pressable>
      <Text style={{ color, fontSize: 10, width: 12 }}>{letter}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontSize: 12 }}>
          {name}
        </Text>
        {directory !== "" ? (
          <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 9 }}>
            {directory}
          </Text>
        ) : null}
      </View>
      {change.insertions !== undefined || change.deletions !== undefined ? (
        <View style={{ flexDirection: "row", gap: 3 }}>
          <Text style={{ color: theme.colors.statusSuccess, fontSize: 9 }}>
            +{change.insertions ?? 0}
          </Text>
          <Text style={{ color: theme.colors.statusDanger, fontSize: 9 }}>
            -{change.deletions ?? 0}
          </Text>
        </View>
      ) : null}
      <IconButton
        theme={theme}
        icon={change.staged ? "Undo2" : "Plus"}
        label={change.staged ? strings.unstage : strings.stage}
        size={12}
        onPress={onStage}
      />
      {change.staged ? null : (
        <IconButton
          theme={theme}
          icon="Trash2"
          label={strings.discard}
          size={12}
          onPress={onDiscard}
        />
      )}
    </Pressable>
  );
}

interface TreeDirRow {
  kind: "dir";
  name: string;
  path: string;
  depth: number;
  count: number;
}
interface TreeLeafRow {
  kind: "leaf";
  change: GitChange;
  depth: number;
}
type TreeRow = TreeDirRow | TreeLeafRow;

function buildTreeRows(changes: readonly GitChange[], expanded: Set<string>): TreeRow[] {
  interface Dir {
    name: string;
    path: string;
    dirs: Map<string, Dir>;
    leaves: GitChange[];
  }
  const root: Dir = { name: "", path: "", dirs: new Map(), leaves: [] };
  for (const change of changes) {
    const segments = change.path.split("/");
    let current = root;
    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index] ?? "";
      const path = segments.slice(0, index + 1).join("/");
      let next = current.dirs.get(segment);
      if (!next) {
        next = { name: segment, path, dirs: new Map(), leaves: [] };
        current.dirs.set(segment, next);
      }
      current = next;
    }
    current.leaves.push(change);
  }

  const rows: TreeRow[] = [];
  const countOf = (dir: Dir): number => {
    let count = dir.leaves.length;
    for (const child of dir.dirs.values()) count += countOf(child);
    return count;
  };
  const walk = (dir: Dir, depth: number) => {
    const childDirs = [...dir.dirs.values()].sort((a, b) => a.name.localeCompare(b.name));
    for (const child of childDirs) {
      rows.push({ kind: "dir", name: child.name, path: child.path, depth, count: countOf(child) });
      if (expanded.has(child.path)) walk(child, depth + 1);
    }
    for (const change of dir.leaves) {
      rows.push({ kind: "leaf", change, depth });
    }
  };
  walk(root, 0);
  return rows;
}
