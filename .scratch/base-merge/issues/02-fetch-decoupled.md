# 02 拉取基准分支：fetch 失败不再挡住合并

Status: done (2026-11-21)
Blocked by: #01

来源：同一份报错的真正阻塞点。现在 `git.mergeBase` 是 `fetch --prune <remote>` 之后才 `merge <ref>`，
只要 fetch 因权限/网络/代理失败，**本地明明已经有 `origin/<base>` 也用不了**——用户想做的只是「把基准合进来」。

## What to build

把「获取」与「合并」拆成两件事，并让合并不再依赖网络：

1. 面板「基准」页给两个动作：
   - `获取并合并`（现状语义：先 `fetch --prune`，成功再 `merge`）
   - `仅合并本地基准`（跳过 fetch，直接 `merge` 本地已有的 remote-tracking ref）
2. `获取并合并` 在 fetch 失败时**不再直接报错中断**：降级为「用本地已有的 ref 合并」，完成后在结果里
   标明 `未能获取最新，使用的是本地缓存的 origin/<base>`（一条可关闭的提示行，不是错误）。
   fetch 确实拿不到任何 ref（本地也没有）时才失败，并给出 #01 的分类错误。
3. 合并完成后基准领先数、提交清单照常刷新；fetch 失败这件事不影响合并结果的正确性判定。

## Acceptance criteria

- [ ] 两个动作都可独立触发，请求参数区分「是否先 fetch」。
- [ ] 测试：远端不可达（remote 指向不存在的本地路径）时，
       - `获取并合并` 仍能用本地 ref 完成合并，并返回「降级」标记；
       - `仅合并本地基准` 完全不产生 fetch 调用（用调用记录断言）。
- [ ] 远端不可达且本地也没有该 ref 时，返回 #01 的分类错误，文案指引改用「仅合并本地基准」或先修好远端权限。
- [ ] 面板断言：降级时出现一行提示（不是红色错误），且基准领先数在合并后归零。
- [ ] `tsc -p .` 无错，`orca plugin test` 全绿，`orca plugin check` 场景 issues 与 warnings 全空。

## Blocked by

- #01（错误分类与就地展示的通道由它提供）

## Result

owner: orca/git-panel。落地：`git.mergeBase` 入参 `{base?, fetch?}`；fetch 失败但本地有 ref → 降级合并并回 `degraded`；面板两个动作「获取并合并 / 仅合并本地基准」，降级时一行灰字「已用本地缓存完成合并」。测试：worker 远端不可达仍合并成功（degraded != null）+ 面板降级提示。
