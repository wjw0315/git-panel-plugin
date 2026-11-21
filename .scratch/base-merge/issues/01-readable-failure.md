# 01 拉取基准分支：把失败原因说人话

Status: done (2026-11-21)
Blocked by: —

来源：2026-11-21 用户在「基准」页点「拉取基准分支」后，面板只抛出 git 的原始错误尾巴
`Please make sure you have the correct access rights and the repository exists.`，既看不出是哪一步
（fetch 还是 merge）失败，也不知道下一步该做什么。

## What to build

`git.mergeBase` 目前把三步串成一句 `git merge <ref> 失败：<stderr 第一行>`：`fetch` → `merge` 任何一步
出错都只是原始 stderr。改成**结构化失败**并在面板就地展示：

1. worker 侧新增失败分类：把 git 的 stderr 归到有限几种原因——`auth`（无权限/仓库不存在/认证失败）、
   `network`（连不上/超时/代理）、`ref-missing`（`not something we can merge`）、
   `untracked-overwrite`（`would be overwritten by merge`）、`identity`（`Please tell me who you are`）、
   `conflict`（`CONFLICT`）、`other`。分类结果随错误一起返回（错误码 + 一句话中文原因 + 原始 stderr 全文）。
2. 分类要指明**哪一步**失败：`fetch failed` 与 `merge failed` 分开。
3. 面板：基准页就地一行红字（`tone="danger"` 的 `Text`），文案是「原因 + 下一步」，例如
   `获取失败：这个远端没有访问权限（git@…）。可以只用本地已有的基准继续合并。`；
   右侧一个 `查看原始输出` 切换，展开显示完整 stderr（只读 `CodeView` 或 `Code`）。不弹窗、不清空页面上已有内容。
4. 下一次成功操作或切换基准时清掉这条错误。

## Acceptance criteria

- [ ] `git.mergeBase` 失败时返回可分类的错误码，且区分 fetch / merge 两个阶段。
- [ ] 用本地可控的失败场景各有一条测试：把 remote 指向不存在的路径（auth/network 类）、
   merge 一个不存在的 ref（ref-missing）、未跟踪文件会被覆盖（untracked-overwrite）。
- [ ] 面板断言：失败后基准页出现一行中文原因；点「查看原始输出」能看到 git stderr；
     成功操作后该行消失。
- [ ] 错误文案不含未翻译的英文整句（原始 stderr 只出现在「原始输出」里）。
- [ ] `tsc -p .` 无错，`orca plugin test` 全绿，`orca plugin check` 场景 issues 与 warnings 全空。

## Blocked by

None - can start immediately

## Result

owner: orca/git-panel。落地：`src/git-failure.ts`（classifyFailure → auth/network/ref-missing/untracked-overwrite/identity/conflict/other）；`git.mergeBase` 返回结构化 `MergeBaseOutcome`（ok:false 带 stage/reason/detail + 快照）；基准页一行红字 + `查看原始输出`（Code 块）。测试：git-failure.test.ts 7 条 stderr + panel 失败/展开/收起 2 条。
