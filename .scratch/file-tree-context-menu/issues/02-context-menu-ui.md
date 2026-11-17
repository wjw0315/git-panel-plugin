# 02: 上下文菜单 UI——变体 B 锚定浮层 + 触发 + 直通项

**What to build:** FilesTab 树行挂触发（`onContextMenu` 强转透传 + `onLongPress`；**实现首验宿主是否透传右键**，不透传则桌面退化为长按并回写 spec 备注）；定案变体 B 浮层：树面板内绝对定位（非宿主 Modal），宽 220、紧凑行（图标 13 + 12px 文案）、三组分隔线、删除红色置底；有坐标锚定坐标（视口回卷），长按无坐标退化为面板内底部居中；遮罩点击/Esc 关闭。菜单项模型按原型 `menuActions`（文件夹 7 项/文件 6 项）；「复制路径」直通 `copyText`（仓库相对 POSIX 路径）；「保存」仅当前打开且脏的行可点（disabled 不隐藏），接现有 autosave flush；上传项桌面能力探测、移动端隐藏。i18n en/zh 全量。

**Blocked by:** None（可与 01 并行，先用 RPC 桩）

**Status:** ready-for-agent

**测试:** FilesTab 组件测试 + RPC 桩：分类型项集与分组、两种触发、复制路径、保存禁用态、遮罩/Esc 关闭。先例 `tests/files-tab.test.tsx`。

**参考:** 分支 `prototype/file-tree-context-menu`（形态 primary source，含 onContextMenu 强转写法）；评审稿 `prototype.html?variant=B`。

## Comments

**2026-11-17 实现完成**（本会话）：
- UI 落地：commit 7e1c0cc（client/context-menu.tsx 正式模块 + files.tsx 三处接线 + api useFsOp + strings 双语）；组件测试 commit 51964fd（9 条：项集/双触发/Esc/复制路径/禁用态/失败 toast）。⚠️ 宿主是否透传桌面右键仍需真机实测（组件测试用的是桩透传，不证明宿主行为）；长按为兜底。
