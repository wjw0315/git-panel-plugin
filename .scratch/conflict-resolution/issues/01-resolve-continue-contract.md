# 01: 解决与继续的契约与服务端闭环

**What to build:** 面板能通过 `git.action` 把冲突文件标记为已解决（保留工作区现状 / 保留我方 / 保留对方），并在冲突全部清空后继续完成合并或变基。冲突未清空时继续被拒并回报冲突清单，编辑器不会被拉起卡住命令。规格见 `.scratch/conflict-resolution/spec.md`。

**Blocked by:** None（可立即开始）

**Status:** ready-for-agent

- [ ] `actionSchema` 新增 `resolve`（`paths` 至少一项，`strategy` 可选 `ours`/`theirs`）与 `continue`（无参）
- [ ] `resolve` 无 strategy = `git add -A -- <paths>`（保留工作区已合并内容）
- [ ] `resolve` 带 strategy = `checkout --ours|--theirs -- <path>` 后 `git add`；某一侧不存在时回退 `git rm -f -- <path>`
- [ ] 批量路径逐条执行，失败按现有错误分类上抛，不静默跳过；路径沿用 `assertSafeRelative` 约束
- [ ] `continue` 前置探测 `git diff --name-only --diff-filter=U`，非空时返回 `conflict` 错误码并附 `error.conflicts`
- [ ] `continue` 按 `MERGE_HEAD` / rebase 状态分派，带 `-c core.editor=true` 防止编辑器阻塞；两者皆无时 `invalid-action`
- [ ] 成功后复用现有行为：重建快照 + 输出截断，不自动 push
- [ ] 契约测试：带/不带 strategy 接受、空 paths 与未知 strategy 拒绝、continue 无参接受
- [ ] typecheck 与现有测试回归通过

## Comments
