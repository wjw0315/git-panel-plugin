import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginTab } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { Icon, Markdown, useToast } from "@getpaseo/plugin/client/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useDirQuery, useFileQuery, useFileWrite, useGitApi } from "./api";
import { ProtoInlineRow, useContextMenuPrototype } from "./context-menu-prototype";
import { Editor } from "./editor";
import { createAutosave, type AutosaveController, type SaveStatus } from "./editor/autosave";
import { PlainTextEditor } from "./editor/plain-text";
import { formatBytes } from "./format";
import { DEFAULT_SETTINGS, gitPanelSettings } from "../shared/git";
import { EmptyState, IconButton, PagedFooter, TextButton, usePagedList } from "./kit";
import type { PanelMode } from "./layout";
import type { Strings } from "./strings";

interface DirEntry {
  name: string;
  dir: boolean;
  size?: number;
  ignored?: boolean;
}

interface TreeRow {
  entry: DirEntry;
  path: string;
  depth: number;
}

export function FilesTab({
  cwd,
  repo,
  theme,
  strings,
  mode,
  tab,
}: {
  cwd: string | null;
  repo: string;
  theme: PluginTheme;
  strings: Strings;
  mode: PanelMode;
  tab: PluginTab;
}) {
  const wide = mode === "wide";
  const toast = useToast();
  const api = useGitApi();
  const reportEditorError = useCallback(() => {
    toast.error(strings.editorUnavailable);
  }, [toast, strings]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [children, setChildren] = useState<Record<string, DirEntry[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [sourceMode, setSourceMode] = useState(false);
  const [loadingDir, setLoadingDir] = useState<string | null>(null);
  const settings = useSettings(gitPanelSettings);
  const settingValues = settings.status === "ready" ? settings.values : DEFAULT_SETTINGS;
  const autoSaveEnabled = settingValues.autoSaveFile !== false;
  const syntaxHighlight = settingValues.editorSyntaxHighlight !== false;
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [conflictOpen, setConflictOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const autosave = useRef<AutosaveController | null>(null);
  const savedContent = useRef("");
  const draftRef = useRef("");
  const editingRef = useRef(false);
  const openedPath = useRef<string | null>(null);

  const rootQuery = useDirQuery(cwd, repo, "", true);
  const file = useFileQuery(cwd, repo, selected);
  const write = useFileWrite(cwd, repo);

  useEffect(() => {
    if (rootQuery.data) {
      setChildren({ "": rootQuery.data.entries });
    }
  }, [rootQuery.data]);

  // Reset the tree when the repository changes, but never on mount: the panel
  // unmounts this component when the user opens another tab, and the cached
  // root listing is re-applied by the effect above on the way back in. React
  // Query keeps the same `data` reference for an unchanged listing, so a reset
  // on mount would leave the tree empty for good.
  const mountedRepo = useRef(repo);
  useEffect(() => {
    if (mountedRepo.current === repo) return;
    mountedRepo.current = repo;
    const controller = autosave.current;
    autosave.current = null;
    openedPath.current = null;
    if (controller && editingRef.current && draftRef.current !== savedContent.current) {
      controller.schedule(draftRef.current);
      void controller
        .flush()
        .then(() => {
          if (controller.getStatus() === "dirty" || controller.getStatus() === "conflict") {
            const issue = controller.getError();
            toast.error(
              issue?.code === "file-changed" ? strings.fileChanged : issue?.message ?? strings.saveFailed,
            );
          }
          controller.cancel();
        })
        .catch(() => controller.cancel());
    } else {
      controller?.cancel();
    }
    setSelected(null);
    setExpanded(new Set());
    setChildren({});
    setEditing(false);
  }, [repo]);


  useEffect(() => {
    if (!file.data?.ok) return;
    const pathChanged = openedPath.current !== file.data.path;
    openedPath.current = file.data.path;
    // Invalidation (for example the refetch triggered by a failed write) must
    // not clobber an edit in progress; reloading is an explicit user action.
    if (!pathChanged && editingRef.current) return;
    autosave.current?.cancel();
    autosave.current = null;
    savedContent.current = file.data.content ?? "";
    draftRef.current = savedContent.current;
    setDraft(savedContent.current);
    setEditing(false);
    setConflictOpen(false);
    setSaveStatus("idle");
    setSourceMode(file.data.path.toLowerCase().endsWith(".md") ? false : true);
  }, [file.data]);

  // Panel unmount (tab switch) must not drop a draft the debounce has not
  // written yet; keep the controller cancel-on-demand but flush on the way out.
  useEffect(
    () => () => {
      const controller = autosave.current;
      if (controller && editingRef.current && draftRef.current !== savedContent.current) {
        controller.schedule(draftRef.current);
        void controller.flush();
      } else {
        controller?.cancel();
      }
      autosave.current = null;
    },
    [],
  );

  const dirty = Boolean(editing && file.data?.ok && draft !== savedContent.current);

  // ⚠️ 原型接线（client/context-menu-prototype.tsx）：验证完上下文菜单形态后整块移除。
  const proto = useContextMenuPrototype({ theme, openPath: selected, dirty });

  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);
  useEffect(() => {
    tab.setModified(dirty);
  }, [dirty, tab]);

  async function loadDir(path: string) {
    if (children[path]) return;
    setLoadingDir(path);
    try {
      const result = await api.dir({ cwd: cwd ?? "", repo, path });
      setChildren((previous) => ({ ...previous, [path]: result.entries }));
    } catch {
      toast.error(strings.operationFailed);
    } finally {
      setLoadingDir(null);
    }
  }

  const rows = useMemo(() => {
    const out: TreeRow[] = [];
    const walk = (path: string, depth: number) => {
      const entries = children[path];
      if (!entries) return;
      for (const entry of entries) {
        const childPath = path === "" ? entry.name : `${path}/${entry.name}`;
        out.push({ entry, path: childPath, depth });
        if (entry.dir && expanded.has(childPath)) walk(childPath, depth + 1);
      }
    };
    walk("", 0);
    return out;
  }, [children, expanded]);

  // Deep trees mount one page at a time; expanding still appends rows.
  const paged = usePagedList(rows);

  // Re-seed the rows from the refetched result instead of waiting for the
  // hydrate effect: React Query keeps the same `data` reference when the
  // listing is unchanged, so clearing `children` first would leave the tree
  // empty after a manual refresh.
  const refreshTree = () => {
    setExpanded(new Set());
    void rootQuery.refetch().then((result) => {
      if (result.data) setChildren({ "": result.data.entries });
    });
  };

  const toggleDir = (path: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        void loadDir(path);
      }
      return next;
    });
  };

  const createWriter = (path: string, baseSha: string) => {
    autosave.current?.cancel();
    const controller = createAutosave({
      save: async (content, base) => {
        try {
          const result = await write.mutateAsync({ path, content, baseSha: base });
          if (result.ok) savedContent.current = content;
          return result.ok
            ? ({ ok: true as const, sha256: result.sha256 })
            : ({ ok: false as const, error: result.error });
        } catch (error) {
          return {
            ok: false as const,
            error: {
              code: "save-failed",
              message: error instanceof Error ? error.message : strings.saveFailed,
            },
          };
        }
      },
      onStatus: (status) => {
        setSaveStatus(status);
        if (status === "conflict") setConflictOpen(true);
      },
    });
    controller.setBaseSha(baseSha);
    autosave.current = controller;
    return controller;
  };

  /** Flush a dirty draft before leaving the current file; false means stay. */
  const flushBeforeLeaving = async (): Promise<boolean> => {
    const controller = autosave.current;
    if (!editing || !controller || !file.data?.ok) return true;
    if (draft === savedContent.current) return true;
    controller.schedule(draft);
    await controller.flush();
    if (controller.getStatus() === "conflict") {
      setConflictOpen(true);
      return false;
    }
    if (controller.getStatus() === "dirty") {
      const issue = controller.getError();
      toast.error(issue?.code === "file-changed" ? strings.fileChanged : issue?.message ?? strings.saveFailed);
      return false;
    }
    return true;
  };

  const beginEdit = () => {
    if (!file.data?.ok) return;
    setConfirmDiscard(false);
    savedContent.current = file.data.content ?? "";
    draftRef.current = savedContent.current;
    setDraft(savedContent.current);
    createWriter(file.data.path, file.data.sha256);
    setSaveStatus("idle");
    setConflictOpen(false);
    setEditing(true);
  };

  const onDraftChange = (value: string) => {
    draftRef.current = value;
    setDraft(value);
    setConfirmDiscard(false);
    if (autoSaveEnabled) autosave.current?.schedule(value);
  };

  const save = async () => {
    const controller = autosave.current;
    if (!controller || !file.data?.ok) return;
    // ⌘S keeps the editor focused: only Esc/close leaves edit mode.
    if (draft === savedContent.current) return;
    controller.schedule(draft);
    await controller.flush();
    const status = controller.getStatus();
    if (status === "conflict") {
      setConflictOpen(true);
      return;
    }
    if (status === "saved") {
      setConfirmDiscard(false);
      toast.show(strings.saved, { variant: "success" });
      return;
    }
    const issue = controller.getError();
    toast.error(issue?.code === "file-changed" ? strings.fileChanged : issue?.message ?? strings.saveFailed);
  };

  const cancelEdit = () => {
    if (dirty && !confirmDiscard) {
      // Never drop a draft silently: the first press asks, the second discards.
      setConfirmDiscard(true);
      return;
    }
    setConfirmDiscard(false);
    autosave.current?.cancel();
    autosave.current = null;
    draftRef.current = savedContent.current;
    setDraft(savedContent.current);
    setConflictOpen(false);
    setSaveStatus("idle");
    setEditing(false);
  };

  const reloadFromDisk = () => {
    autosave.current?.cancel();
    autosave.current = null;
    setConflictOpen(false);
    setSaveStatus("idle");
    setEditing(false);
    savedContent.current = "";
    void file.refetch();
  };

  const openFile = async (path: string) => {
    if (!(await flushBeforeLeaving())) return;
    autosave.current?.cancel();
    autosave.current = null;
    setEditing(false);
    setSelected(path);
  };

  const closeFile = async () => {
    if (!(await flushBeforeLeaving())) return;
    autosave.current?.cancel();
    autosave.current = null;
    setEditing(false);
    setSelected(null);
  };

  const tree = (
    <View style={{ flex: 1, minHeight: 0 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          paddingHorizontal: 8,
          paddingVertical: 5,
          borderBottomWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        <Icon name="FolderTree" size={13} color={theme.colors.foregroundMuted} />
        <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 11, flex: 1 }}>
          {repo === "" ? (cwd ?? strings.workspaceRepo) : repo}
        </Text>
        <IconButton
          theme={theme}
          icon="RefreshCw"
          label={strings.refresh}
          onPress={refreshTree}
        />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
        {rows.length === 0 && rootQuery.isPending ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, padding: 12 }}>
            {strings.loading}
          </Text>
        ) : null}
        {rootQuery.isError ? (
          <Text style={{ color: theme.colors.statusDanger, fontSize: 12, padding: 12 }}>
            {rootQuery.error instanceof Error ? rootQuery.error.message : strings.operationFailed}
          </Text>
        ) : null}
        {paged.visible.map((row) => (
          <Pressable
            key={row.path}
            accessibilityRole="button"
            accessibilityLabel={row.path}
            onPress={() => {
              if (proto.isInline(row.path)) {
                proto.closeInline();
                return;
              }
              if (row.entry.dir) toggleDir(row.path);
              else void openFile(row.path);
            }}
            {...proto.rowPress({ path: row.path, name: row.entry.name, isDir: row.entry.dir })}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingVertical: 4,
              paddingRight: 8,
              paddingLeft: 6 + row.depth * 12,
              backgroundColor: pressed ? theme.colors.surface1 : "transparent",
              opacity: row.entry.ignored ? 0.55 : 1,
            })}
          >
            {proto.isInline(row.path) ? (
              <ProtoInlineRow
                theme={theme}
                row={{ path: row.path, name: row.entry.name, isDir: row.entry.dir }}
                dirtyOpen={dirty && selected === row.path}
                onPick={proto.inlinePick}
                onClose={proto.closeInline}
              />
            ) : (
              <>
            {row.entry.dir ? (
              <Icon
                name={expanded.has(row.path) ? "ChevronDown" : "ChevronRight"}
                size={11}
                color={theme.colors.foregroundMuted}
              />
            ) : (
              <View style={{ width: 11 }} />
            )}
            <Icon
              name={
                row.entry.dir
                  ? expanded.has(row.path)
                    ? "FolderOpen"
                    : "Folder"
                  : fileIcon(row.entry.name)
              }
              size={13}
              color={
                row.entry.dir
                  ? theme.colors.statusWarning
                  : selected === row.path
                    ? theme.colors.accent
                    : theme.colors.foregroundMuted
              }
            />
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                color:
                  selected === row.path ? theme.colors.foreground : theme.colors.foregroundMuted,
                fontSize: 12,
                fontWeight: selected === row.path ? "600" : "400",
              }}
            >
              {row.entry.name}
            </Text>
            {row.entry.size !== undefined ? (
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 9 }}>
                {formatBytes(row.entry.size)}
              </Text>
            ) : null}
            {loadingDir === row.path ? (
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10 }}>…</Text>
            ) : null}
              </>
            )}
          </Pressable>
        ))}
        <PagedFooter
          theme={theme}
          label={strings.loadMore}
          shown={paged.visible.length}
          total={paged.total}
          onPress={paged.showMore}
        />
      </ScrollView>
      {proto.layer}
    </View>
  );

  const preview = selected ? (
    <FilePreview
      theme={theme}
      strings={strings}
      path={selected}
      file={file}
      editing={editing}
      draft={draft}
      sourceMode={sourceMode}
      writing={write.isPending}
      highlight={syntaxHighlight}
      saveStatus={saveStatus}
      conflictOpen={conflictOpen}
      confirmDiscard={confirmDiscard}
      onError={reportEditorError}
      onDraft={onDraftChange}
      onToggleSource={() => setSourceMode((value) => !value)}
      onEdit={beginEdit}
      onCancel={cancelEdit}
      onSave={() => void save()}
      onReload={reloadFromDisk}
      onKeepDraft={() => setConflictOpen(false)}
      onClose={() => void closeFile()}
    />
  ) : (
    <EmptyState theme={theme} icon="FileSearch" title={strings.files} detail={strings.noPreview} />
  );

  if (wide) {
    return (
      <View style={{ flex: 1, minHeight: 0, flexDirection: "row" }}>
        <View
          testID="files-tree-pane"
          style={{
            width: 280,
            borderRightWidth: 1,
            borderColor: theme.colors.border,
            minHeight: 0,
          }}
        >
          {tree}
        </View>
        <View testID="files-preview-pane" style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          {preview}
        </View>
      </View>
    );
  }

  // 窄/中档单列二选一：预览时树保留挂载、整列 display:"none" 隐藏，
  // 返回时 ScrollView 不重挂载，滚动位置不丢。
  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <View
        testID="files-tree-pane"
        style={{ flex: 1, minHeight: 0, display: selected ? "none" : "flex" }}
      >
        {tree}
      </View>
      {selected ? (
        <View testID="files-preview-pane" style={{ flex: 1, minHeight: 0 }}>
          {preview}
        </View>
      ) : null}
    </View>
  );
}

function fileIcon(name: string): string {
  const lower = name.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)$/.test(lower)) return "FileImage";
  if (/\.(json|jsonc|lock)$/.test(lower)) return "FileJson";
  if (/\.(ya?ml|toml|ini|conf|cfg|properties|env)$/.test(lower)) return "FileCog";
  if (
    /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|hpp|cs|php|sh|bash|zsh|css|scss|html|vue|svelte)$/.test(
      lower,
    )
  ) {
    return "FileCode";
  }
  if (/\.(md|markdown|txt|log|rst)$/.test(lower)) return "FileText";
  return "File";
}

/** Above this size the CodeMirror view is skipped; the text stays readable. */
const PREVIEW_CHAR_LIMIT = 400_000;

function SaveIndicator({
  theme,
  strings,
  status,
  dirty,
}: {
  theme: PluginTheme;
  strings: Strings;
  status: SaveStatus;
  dirty: boolean;
}) {
  if (status === "conflict") return null;
  if (status === "idle" && !dirty) return null;
  const label =
    status === "saving" ? strings.saving : dirty ? strings.unsaved : strings.saved;
  const color =
    status === "saved"
      ? theme.colors.statusSuccess
      : status === "dirty"
        ? theme.colors.statusWarning
        : theme.colors.foregroundMuted;
  return <Text style={{ color, fontSize: 10 }}>{label}</Text>;
}

function FilePreview({
  theme,
  strings,
  path,
  file,
  editing,
  draft,
  sourceMode,
  writing,
  highlight,
  saveStatus,
  conflictOpen,
  confirmDiscard,
  onError,
  onDraft,
  onToggleSource,
  onEdit,
  onCancel,
  onSave,
  onReload,
  onKeepDraft,
  onClose,
}: {
  theme: PluginTheme;
  strings: Strings;
  path: string;
  file: ReturnType<typeof useFileQuery>;
  editing: boolean;
  draft: string;
  sourceMode: boolean;
  writing: boolean;
  highlight: boolean;
  saveStatus: SaveStatus;
  conflictOpen: boolean;
  confirmDiscard: boolean;
  onError: () => void;
  onDraft: (value: string) => void;
  onToggleSource: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onReload: () => void;
  onKeepDraft: () => void;
  onClose: () => void;
}) {
  const isMarkdown = path.toLowerCase().endsWith(".md") || path.toLowerCase().endsWith(".markdown");
  const data = file.data;
  const content = data?.ok ? (data.content ?? "") : "";
  const dirty = editing && draft !== content;
  const overPreviewLimit = content.length > PREVIEW_CHAR_LIMIT;

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
        <IconButton theme={theme} icon="ChevronLeft" label={strings.back} onPress={onClose} />
        <Icon name={fileIcon(path)} size={13} color={theme.colors.foregroundMuted} />
        <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontSize: 11, flex: 1 }}>
          {path}
        </Text>
        {editing ? (
          <SaveIndicator theme={theme} strings={strings} status={saveStatus} dirty={dirty} />
        ) : null}
        {data?.ok ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 9 }}>
            {formatBytes(data.size)}
          </Text>
        ) : null}
        {isMarkdown && data?.ok ? (
          <IconButton
            theme={theme}
            icon={sourceMode ? "Eye" : "Code"}
            label={sourceMode ? strings.file : strings.diff}
            onPress={onToggleSource}
          />
        ) : null}
        {data?.ok && data.editable && !editing ? (
          <IconButton theme={theme} icon="Pencil" label={strings.editFile} onPress={onEdit} />
        ) : null}
        {editing ? (
          <>
            {confirmDiscard ? (
              <TextButton
                theme={theme}
                label={strings.discardDraft}
                hint={strings.hintDiscardDraft}
                onPress={onCancel}
                danger
                compact
              />
            ) : (
              <IconButton theme={theme} icon="X" label={strings.cancel} onPress={onCancel} />
            )}
            <IconButton
              theme={theme}
              icon="Save"
              label={writing ? strings.saving : strings.save}
              onPress={onSave}
              disabled={writing}
            />
          </>
        ) : null}
      </View>

      {conflictOpen ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 10,
            paddingVertical: 6,
            backgroundColor: theme.colors.surface1,
            borderBottomWidth: 1,
            borderColor: theme.colors.statusWarning,
          }}
        >
          <Icon name="AlertTriangle" size={13} color={theme.colors.statusWarning} />
          <Text style={{ color: theme.colors.foreground, fontSize: 11, flex: 1 }}>
            {strings.fileChanged}
          </Text>
          <TextButton
            theme={theme}
            label={strings.reload}
            hint={strings.hintReloadFile}
            onPress={onReload}
            compact
          />
          <TextButton
            theme={theme}
            label={strings.keepDraft}
            hint={strings.hintKeepDraft}
            onPress={onKeepDraft}
            compact
          />
        </View>
      ) : null}

      {file.isPending ? (
        <View style={{ padding: 16 }}>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{strings.loading}</Text>
        </View>
      ) : !data ? null : !data.ok ? (
        <View style={{ padding: 16 }}>
          <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>
            {data.error.message}
          </Text>
        </View>
      ) : editing ? (
        <Editor
          value={draft}
          readOnly={false}
          filePath={path}
          theme={theme}
          highlight={highlight}
          onChange={onDraft}
          onSave={onSave}
          onCancel={onCancel}
          onError={onError}
        />
      ) : data.variant === "image" && data.dataUrl ? (
        <ScrollView contentContainerStyle={{ padding: 12 }}>
          <Image
            source={{ uri: data.dataUrl }}
            resizeMode="contain"
            style={{ width: "100%", height: 360 }}
          />
        </ScrollView>
      ) : data.variant === "binary" ? (
        <View style={{ padding: 16 }}>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
            {strings.binaryFile}
          </Text>
        </View>
      ) : data.tooLarge ? (
        <View style={{ padding: 16 }}>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
            {strings.fileTooLarge}
          </Text>
        </View>
      ) : overPreviewLimit ? (
        <View style={{ flex: 1, minHeight: 0 }}>
          <Text
            style={{
              color: theme.colors.statusWarning,
              fontSize: 11,
              paddingHorizontal: 10,
              paddingVertical: 5,
            }}
          >
            {strings.fileTooLarge}
          </Text>
          <PlainTextEditor
            value={content.slice(0, PREVIEW_CHAR_LIMIT)}
            readOnly
            filePath={path}
            theme={theme}
          />
        </View>
      ) : isMarkdown && !sourceMode ? (
        <ScrollView contentContainerStyle={{ padding: 14 }}>
          <Markdown>{content}</Markdown>
        </ScrollView>
      ) : (
        <Editor
          value={content}
          readOnly
          filePath={path}
          theme={theme}
          highlight={highlight}
          onError={onError}
        />
      )}
    </View>
  );
}
