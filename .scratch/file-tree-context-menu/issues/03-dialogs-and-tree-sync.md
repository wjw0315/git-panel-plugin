# 03: 对话框与树联动——rename/create/delete/upload 闭环

**What to build:** 宿主 Modal + TextInput 对话框（changes.tsx 先例）：重命名预填全选、新建输入名称（前端先拦 `/`、`..`、`.git`，服务端再拦）、删除确认写明路径（文件夹注明含全部内容、未跟踪文件不可恢复）；接通 01 的 fs-op RPC：rename 目标为当前打开文件时先 `flushBeforeLeaving`（冲突停在冲突横幅）、成功后预览指向新路径；delete 当前打开文件先 flush 再关预览；mutation 成功后按受影响目录重建 children（不折叠展开态）；失败 toast 具体原因；错误码文案 i18n。

**Blocked by:** 01, 02

**Status:** ready-for-agent

**测试:** 组件测试覆盖对话框流转与 RPC 入参、成功刷新（展开态保持）、失败 toast、脏草稿保护路径。先例 `tests/files-tab.test.tsx`（modal 断言）、`tests/files-responsive.test.tsx`（树状态）。

## Comments

**2026-11-17 实现完成**（本会话）：
- 对话框与树联动随 7e1c0cc 落地：Modal+TextInput、当前打开文件 flush 保护、rename 预览跟随（组件测试覆盖）、useFsOp 成功后失效 dir/snapshot 缓存（展开态在组件 state，不受影响）。
