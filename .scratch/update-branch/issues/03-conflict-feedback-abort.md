# 03: 冲突态反馈与一键中止

**What to build:** 合并/变基撞上冲突时，面板明确报出冲突文件清单，不再只有一句模糊报错；分支快照携带「合并中/变基中」进行中状态，使得重开面板也能看到中断的操作，并提供一键「中止」回到操作开始前的状态——用户不必去终端敲 abort。冲突文件本体在变更视图以 conflicted 状态可见（现有能力衔接，不改动）。

**Blocked by:** 01、02（中止需覆盖合并与变基两种进行中态）

**Status:** resolved

- [ ] 冲突失败的错误反馈附冲突文件清单（解析 git 输出的 CONFLICT 行），复用现有 conflict 错误码
- [ ] 分支快照新增进行中状态字段（服务端按 MERGE_HEAD 与 rebase 状态目录检测）
- [ ] 进行中态下打开对话框呈现「进行中」说明；冲突态列出冲突文件并指引到变更视图
- [ ] 「中止合并/变基」一键执行与当前状态匹配的 abort；无进行中态时中止入口不出现
- [ ] 中止后仓库回到操作前状态（无 MERGE_HEAD / 无 rebase 残留）
- [ ] 契约测试：abort kind 合法用例
- [ ] 渲染测试：进行中/冲突态呈现与中止回调
- [ ] 双语文案补齐；typecheck 与现有测试回归通过

## Comments

### 2026-11-17 实施完成（本会话）

- 快照：branchState 字段（merging/rebasing/null），服务端在 buildSnapshot 并行组探测 MERGE_HEAD / REBASE_HEAD；fingerprint 捷径把 branchState 计入比较，状态切换不会被旧快照短路。
- 契约：actionSchema 新增 abort kind（无参数）；actionRpc 错误分支扩展 conflicts 数组（normalizeError 从 git 输出 CONFLICT ... in <path> 行解析）。
- 服务端 abort：按 MERGE_HEAD → merge --abort、REBASE_HEAD → rebase --abort 分发，两者皆无时 invalid-action。
- UI：branchState 非空时对话框整体切换为进行中态（状态标题 + conflicted 文件清单（取自快照 changes，最多列 8 条）+ 终端解决指引 + 中止/关闭按钮）；中止成功 toast + 关闭对话框。
- 实测（/tmp 玩具仓全链路）：merge 冲突 → MERGE_HEAD 探测 → abort 清除；rebase 冲突 → REBASE_HEAD 探测 → abort 清除；无进行中时服务端兜底拒绝。
- 验收：npm test 25 文件 119 用例全绿；typecheck 0 错误（并行会话 untracked 原型文件除外）。兼容性跟进：并行会话 4 个测试文件的 snapshot fixture 补 branchState: null。
