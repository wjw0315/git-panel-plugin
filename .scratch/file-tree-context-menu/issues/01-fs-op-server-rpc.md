# 01: fs-op 服务端 RPC——文件变更操作与安全防护

**What to build:** shared 新增 `git.fs-op` RPC（zod union：createFile/createDir/rename/delete/upload/reveal/open，输出统一 `{ok} | {ok, error:{code,message}}`）；server 新建 fs-op 模块：路径安全复用 `assertSafeRelative`/`realInside`（`.git`、`..`、绝对路径、符号链接逃逸全拒）；createFile/createDir/rename/upload 受 `allowFileEdit` 闸；rename 仅同目录且目标已存在返回 `already-exists`；delete 递归并做嵌套仓库探测（`nested-repo` 拒绝）；upload base64 上限 16 MiB、目标已存在拒绝；reveal/open 按平台 argv 数组 spawn 系统打开器（macOS `open -R`/`open`，Linux `xdg-open`，Windows `explorer`），受新设置 `allowSystemOpen`（默认开）闸，失败返回 `opener-unavailable`。reveal/open 的实现与设置开关可后置到工单 04，但 schema 一次定全。

**Blocked by:** None（可立即开始）

**Status:** ready-for-agent

**测试:** 本仓首批服务端测试接缝——fs-op 模块对真实临时目录直测（逃逸/.git/已存在/嵌套仓库/上限/跨目录 rename 拒绝；reveal/open 断言平台 argv 构造 + spawn 打桩）。测试文件 `.test.tsx` 命名套现有 vitest include。

**参考:** 分支 `prototype/file-tree-context-menu` 的 `client/context-menu-prototype.tsx`（动作语义打桩面）；`server/files.ts`（原子写先例）、`server/actions.ts`（错误归一化 + 嵌套仓库探测先例）。

## Comments

**2026-11-17 实现完成**（本会话）：
- 服务端落地：commit 567238f（fsOpSchema + server/fsops.ts + index.server.ts 注册 + allowSystemOpen 设置）；服务端测试接缝 tests/fsops.test.tsx 19 用例（临时目录直测 + 平台 argv 断言）。
