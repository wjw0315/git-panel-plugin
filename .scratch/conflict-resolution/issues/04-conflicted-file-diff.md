# 04: 冲突文件的 diff 不再空白

**What to build:** 冲突文件点开现在什么都不显示：`git diff -- <path>` 对 unmerged 路径输出 combined diff（`@@@ -a,b -c,d +e,f @@@` 三列范围头），客户端 hunk 解析器只认单范围 `@@`，于是 hunks 为空、面板落到「无预览」。改为在 worktree 视图中对这种路径合成「工作区全文」diff，使 `<<<<<<<` / `=======` / `>>>>>>>` 冲突标记可见。

**Blocked by:** None（可独立实施）

**Status:** ready-for-agent

- [ ] 服务端在 `base === "worktree"` 时探测 unmerged 路径（`git ls-files -u -- <path>` 非空）
- [ ] 命中时改走「工作区全文」合成 diff（复用未跟踪文件的合成路径），保留 `binary` / `tooLarge` 判定
- [ ] 非 unmerged 路径、`base === "staged"`、commit 视图行为不变
- [ ] 合成 diff 中冲突标记原样可见（不吞行、不转义）
- [ ] 人工验收：/tmp 玩具仓制造内容冲突与 delete/modify 冲突两种，面板里都能看到冲突内容或明确的文件缺失提示
- [ ] typecheck 与现有测试回归通过

## Comments
