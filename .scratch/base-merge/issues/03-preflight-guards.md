# 03 拉取基准分支：合并前把两类硬失败挡住

Status: done (2026-11-21)
Blocked by: #01

来源：合并在两类情况下会**中途失败并留下半截状态**，而面板目前是「点下去才知道」。
两类都已用真 git 复现：
`error: The following untracked working tree files would be overwritten by merge: … Aborting` 与
`merge: origin/xxx - not something we can merge`。

## What to build

在按下「拉取基准分支」之前（或按下后立刻、在真正 merge 之前）把这两类情形变成可读的前置检查：

1. **未跟踪文件会被覆盖**：合并前用一个只读探测（`git merge-tree` / `git diff --name-only <ref>` 与
   未跟踪清单求交）算出「合入会覆盖的未跟踪文件」，在基准页列出这些文件名（最多 10 个 + 其余计数），
   并禁用合并按钮，提示「先移走或删除这些文件」；文件被处理后自动恢复可用。
2. **选中的基准 ref 失效**（远端删了分支、或者没 fetch 过）：下拉里不再提供这个选项，选择回退到
   远端默认分支，并给一行提示「origin/xxx 已不存在，已回退到 origin/main」。回退行为要显式，不能静默。
3. 两种情况都不触发真正的 `merge`，因此不会留下 `index.lock` 或半合并状态。

## Acceptance criteria

- [ ] 测试（本地裸仓库 + 临时工作区）：
       - 基准分支含一个与本地未跟踪文件同路径的文件时，返回「会被覆盖」清单，且不执行 merge（用 git 状态断言 HEAD 未动）；
       - 移走该文件后动作恢复可用并成功合并；
       - 选中的 ref 在远端被删除后再刷新，选择回退到默认分支且返回「已回退」标记。
- [ ] 面板断言：被挡住时按钮 disabled 并列出文件名；回退后有提示行；两种情况页面都不出现红色 crash。
- [ ] 只读探测不得修改工作区或索引（测试里用 `git status --porcelain` 前后对比）。
- [ ] `tsc -p .` 无错，`orca plugin test` 全绿，`orca plugin check` 场景 issues 与 warnings 全空。

## Blocked by

- #01（失败分类与就地提示通道）

## Result

owner: orca/git-panel。

- 覆盖清单：`BaseStatus` 增加 `overwritten {files,total}`；`readOverwritten()` 用只读 `git diff --name-only -z HEAD..<ref>` 与本地未跟踪清单求交（最多列 10 个）。面板在基准页列出文件名并禁用两个拉取按钮；`mergeBase` 在真正 merge 前再次检查 `overwritten.total > 0` 直接返回 `reason: untracked-overwrite`，HEAD 不动（测试断言 rev-parse 前后一致）。
- 语义修正：未跟踪文件本身不再一律挡住合并（git 只在路径冲突时拒绝），`mergeBase` 的守卫改为只挡 staged/modified；面板同理。
- 失效回退：`readBase()` 在选中的 ref 不存在时回退远端默认，并在 `BaseStatus.fellBackTo` 明确标出；`applySnapshot()` 统一收口，回退时清掉该仓库记住的失效选择，面板显示「原来选的基准已不存在，已回退到 origin/main」。
- 测试：worker 两条（冲突未跟踪挡住 + 移走后成功合并且 HEAD 未动；`origin/gone` 回退到 `origin/main` 且 `fellBackTo` 正确），全量 48 测试通过。
