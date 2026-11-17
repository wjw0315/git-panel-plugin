import type { ComponentProps } from "react";
import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal, TextInput, copyText, useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "react-native";
import { useFsOp } from "./api";
import type { Strings } from "./strings";
import type { FsOp } from "../shared/git";

/**
 * 文件树上下文菜单（定案：原型变体 B 锚定浮层）。
 * 触发：桌面右键（宿主 DOM 透传，RN 类型无此 prop 故强转）+ 移动端长按；
 * 长按无坐标时退化为树面板内底部居中。spec: .scratch/file-tree-context-menu/spec.md。
 */

export interface MenuRow {
  path: string;
  name: string;
  isDir: boolean;
}

type PressableProps = ComponentProps<typeof Pressable>;

interface MenuAction {
  key: string;
  label: string;
  icon: string;
  group: 1 | 2 | 3;
  danger?: boolean;
  disabled?: boolean;
}

/** 上传体积上限，与服务端一致（spec 决策 16 MiB）。 */
const MAX_UPLOAD_BYTES = 16 * 1024 * 1024;

function posixDirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index <= 0 ? "" : path.slice(0, index);
}

function posixJoin(parent: string, name: string): string {
  return parent === "" ? name : `${parent}/${name}`;
}

function menuActions(row: MenuRow, strings: Strings, canSave: boolean, canUpload: boolean): MenuAction[] {
  if (row.isDir) {
    return [
      { key: "rename", label: strings.contextRename, icon: "Pencil", group: 1 },
      { key: "copy-path", label: strings.contextCopyPath, icon: "Link", group: 1 },
      { key: "reveal", label: strings.contextReveal, icon: "FolderOpen", group: 1 },
      { key: "newFile", label: strings.contextNewFile, icon: "FilePlus", group: 2 },
      { key: "newFolder", label: strings.contextNewFolder, icon: "FolderPlus", group: 2 },
      ...(canUpload
        ? [{ key: "upload", label: strings.contextUpload, icon: "Upload", group: 2 as const }]
        : []),
      { key: "delete", label: strings.delete, icon: "Trash2", group: 3, danger: true },
    ];
  }
  return [
    { key: "rename", label: strings.contextRename, icon: "Pencil", group: 1 },
    { key: "copy-path", label: strings.contextCopyPath, icon: "Link", group: 1 },
    { key: "save", label: strings.save, icon: "Save", group: 1, disabled: !canSave },
    { key: "reveal", label: strings.contextReveal, icon: "FolderOpen", group: 2 },
    { key: "open", label: strings.contextOpenWith, icon: "ExternalLink", group: 2 },
    { key: "delete", label: strings.delete, icon: "Trash2", group: 3, danger: true },
  ];
}

/** 前端先拦一层名称（服务端仍再拦）：拒绝空名、路径分隔符、. 与 .. 与 .git。 */
function assertSafeClientName(name: string): boolean {
  return (
    name !== "" &&
    name !== "." &&
    name !== ".." &&
    name !== ".git" &&
    !name.includes("/") &&
    !name.includes("\\")
  );
}

/** ArrayBuffer → base64（分块避免 String.fromCharCode 爆栈）。 */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

interface MenuState {
  row: MenuRow;
  trigger: string;
  x: number | null;
  y: number | null;
}

type DialogKind = "rename" | "newFile" | "newFolder" | "delete";

interface DialogState {
  kind: DialogKind;
  row: MenuRow;
  value: string;
}

export function useContextMenu({
  theme,
  strings,
  cwd,
  repo,
  openPath,
  dirty,
  onFlush,
  onOpenPath,
  onSave,
}: {
  theme: PluginTheme;
  strings: Strings;
  cwd: string | null;
  repo: string;
  openPath: string | null;
  dirty: boolean;
  onFlush: () => Promise<boolean>;
  onOpenPath: (path: string | null) => void;
  onSave: () => void;
}) {
  const toast = useToast();
  const fsop = useFsOp(cwd, repo);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [uploading, setUploading] = useState(false);
  const layerRef = useRef<View>(null);
  const paneOrigin = useRef({ x: 0, y: 0 });
  const uploadingRef = useRef(false);

  const canUpload = typeof document !== "undefined" && typeof btoa === "function";

  const closeAll = () => {
    setMenu(null);
    setDialog(null);
  };

  const report = (result: { ok: boolean; error?: { code: string; message: string } }) => {
    if (result.ok) return true;
    const message =
      result.error?.code === "opener-unavailable"
        ? strings.openerUnavailable
        : result.error?.message ?? strings.operationFailed;
    toast.error(message);
    return false;
  };

  const runOp = async (op: FsOp, successMessage: string) => {
    try {
      const result = await fsop.mutateAsync(op);
      if (report(result)) {
        toast.show(successMessage, { variant: "success" });
        return true;
      }
      return false;
    } catch {
      toast.error(strings.operationFailed);
      return false;
    }
  };

  const openMenu = (row: MenuRow, trigger: string, x?: number, y?: number) => {
    setMenu({ row, trigger, x: x ?? null, y: y ?? null });
    // 变体 B 需要树面板的窗口原点换算锚点；下一帧测量等布局稳定。
    setTimeout(() => {
      layerRef.current?.measureInWindow?.((px, py) => {
        paneOrigin.current = { x: px, y: py };
      });
    }, 0);
  };

  const pick = async (action: MenuAction, row: MenuRow) => {
    if (action.disabled) return;
    if (action.key === "copy-path") {
      try {
        await copyText(row.path);
        toast.show(strings.copied, { variant: "success" });
      } catch {
        toast.error(strings.operationFailed);
      }
      setMenu(null);
      return;
    }
    if (action.key === "save") {
      onSave();
      setMenu(null);
      return;
    }
    if (action.key === "reveal" || action.key === "open") {
      const kind = action.key === "reveal" ? "reveal" : "open";
      const result = await fsop.mutateAsync({ kind, path: row.path });
      if (report(result)) setMenu(null);
      return;
    }
    if (action.key === "upload") {
      setMenu(null);
      setUploading(true);
      uploadingRef.current = true;
      const picker = document.createElement("input");
      picker.type = "file";
      picker.style.display = "none";
      picker.addEventListener("change", () => {
        const file = picker.files?.[0];
        picker.remove();
        uploadingRef.current = false;
        setUploading(false);
        if (!file) return;
        if (file.size > MAX_UPLOAD_BYTES) {
          toast.error(strings.fileTooLarge);
          return;
        }
        void file.arrayBuffer().then((buffer) => {
          setUploading(true);
          uploadingRef.current = true;
          void runOp(
            { kind: "upload", parentPath: row.path, name: file.name, contentBase64: toBase64(buffer) },
            `${file.name}`,
          ).then((ok) => {
            uploadingRef.current = false;
            setUploading(false);
            if (ok) toast.show(strings.saved, { variant: "success" });
          });
        });
      });
      document.body.append(picker);
      picker.click();
      return;
    }
    // rename / newFile / newFolder / delete → 先弹对话框
    setDialog({
      kind: action.key as DialogKind,
      row,
      value: action.key === "rename" ? row.name : "",
    });
  };

  const confirmDialog = async () => {
    const state = dialog;
    if (!state) return;
    if (state.kind !== "delete" && !assertSafeClientName(state.value)) {
      toast.error(strings.operationFailed);
      return;
    }
    const flushFor = async (): Promise<boolean> => {
      if (state.row.path !== openPath) return true;
      return onFlush();
    };
    if (state.kind === "rename") {
      const parent = posixDirname(state.row.path);
      const nextPath = posixJoin(parent, state.value);
      if (!(await flushFor())) return;
      if (
        await runOp({ kind: "rename", path: state.row.path, newName: state.value }, strings.renamed)
      ) {
        if (state.row.path === openPath) onOpenPath(nextPath);
        closeAll();
      }
      return;
    }
    if (state.kind === "delete") {
      if (!(await flushFor())) return;
      if (await runOp({ kind: "delete", path: state.row.path }, strings.delete)) {
        if (state.row.path === openPath) onOpenPath(null);
        closeAll();
      }
      return;
    }
    const kind = state.kind === "newFile" ? "createFile" : "createDir";
    if (await runOp({ kind, parentPath: state.row.path, name: state.value }, state.value)) {
      closeAll();
    }
  };

  // Esc 关闭（输入框聚焦时不抢键；移动端无键盘自然无效）。
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "Escape") closeAll();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const actions = useMemo(
    () =>
      menu
        ? menuActions(
            menu.row,
            strings,
            dirty && openPath !== null && menu.row.path === openPath,
            canUpload,
          )
        : [],
    [menu, strings, dirty, openPath, canUpload],
  );

  const rowPress = (row: MenuRow): PressableProps => {
    return {
      onLongPress: () => openMenu(row, "longpress"),
      // 宿主若不透传右键，此 prop 静默无效，长按仍可用（spec 触发决策）。
      ...( {
        onContextMenu: (event: unknown) => {
          const native = (
            event as { nativeEvent?: { clientX?: number; clientY?: number; preventDefault?: () => void } }
          ).nativeEvent;
          native?.preventDefault?.();
          openMenu(row, "contextmenu", native?.clientX, native?.clientY);
        },
      } as unknown as PressableProps),
    };
  };

  const menuLeft =
    menu?.x != null && menu?.y != null
      ? Math.max(4, Math.min(menu.x - paneOrigin.current.x - 8, 4000))
      : undefined;
  const menuTop =
    menu?.x != null && menu?.y != null
      ? Math.max(4, menu.y - paneOrigin.current.y + 6)
      : undefined;

  const layer = (
    <View
      ref={layerRef}
      style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 30 }}
      pointerEvents="box-none"
    >
      {menu ? (
        <>
          <Pressable
            style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
            onPress={closeAll}
            accessibilityLabel={strings.close}
          />
          <View
            style={{
              position: "absolute",
              ...(menuLeft != null && menuTop != null ? { left: menuLeft, top: menuTop } : { left: 40, right: 40, bottom: 60 }),
              width: menuLeft != null ? 220 : undefined,
              backgroundColor: theme.colors.surface0,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: 9,
              overflow: "hidden",
              shadowColor: "#000",
              shadowOpacity: 0.4,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 3 },
            }}
          >
            <View
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: 1, borderColor: theme.colors.border }}
            >
              <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 10 }}>
                {menu.row.path}
              </Text>
            </View>
            {actions.map((action, index) => {
              const previous = index > 0 ? actions[index - 1] : null;
              return (
                <View key={action.key}>
                  {previous && previous.group !== action.group ? (
                    <View style={{ height: 1, backgroundColor: theme.colors.border }} />
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={action.label}
                    disabled={action.disabled}
                    onPress={() => void pick(action, menu.row)}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 9,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      backgroundColor: pressed ? theme.colors.surface1 : "transparent",
                      opacity: action.disabled ? 0.4 : 1,
                    })}
                  >
                    <Icon
                      name={action.icon}
                      size={13}
                      color={action.danger ? theme.colors.statusDanger : theme.colors.foreground}
                    />
                    <Text
                      style={{
                        color: action.danger ? theme.colors.statusDanger : theme.colors.foreground,
                        fontSize: 12,
                      }}
                    >
                      {uploading && action.key === "upload" ? strings.uploading : action.label}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      <Modal
        open={dialog !== null}
        onOpenChange={(value) => {
          if (!value) setDialog(null);
        }}
        title={
          dialog?.kind === "rename"
            ? `${strings.contextRename}: ${dialog.row.name}`
            : dialog?.kind === "delete"
              ? `${strings.delete}: ${dialog.row.path}`
              : dialog?.kind === "newFile"
                ? strings.contextNewFile
                : dialog?.kind === "newFolder"
                  ? strings.contextNewFolder
                  : ""
        }
      >
        <Modal.Content>
          <View style={{ gap: 10 }}>
            {dialog?.kind === "delete" ? (
              <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>
                {dialog.row.isDir ? strings.deleteFolderDetail : strings.deleteFileDetail}
              </Text>
            ) : (
              <TextInput
                value={dialog?.value ?? ""}
                onChangeText={(value) =>
                  setDialog((current) => (current ? { ...current, value } : current))
                }
                placeholder={dialog?.kind === "rename" ? dialog.row.name : strings.namePlaceholder}
                autoFocus
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
            )}
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <Pressable onPress={closeAll} accessibilityRole="button">
                <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, padding: 6 }}>
                  {strings.cancel}
                </Text>
              </Pressable>
              <Pressable onPress={() => void confirmDialog()} accessibilityRole="button">
                <Text
                  style={{
                    color: dialog?.kind === "delete" ? theme.colors.statusDanger : theme.colors.accent,
                    fontSize: 12,
                    fontWeight: "600",
                    padding: 6,
                  }}
                >
                  {dialog?.kind === "delete" ? strings.delete : strings.confirm}
                </Text>
              </Pressable>
            </View>
          </View>
        </Modal.Content>
      </Modal>
    </View>
  );

  return { rowPress, layer };
}
