# 验证报告：切回「文件」tab 后文件树为空

- change：`fix-files-tab-remount-empty`
- workflow：Classic / hotfix（build_mode=direct，tdd_mode=direct，review_mode=off）
- 验证模式：light（`comet state scale` 建议 full，见 §3 说明）
- 日期：2026-11-05（含 reopen 后的第二轮修复）
- 结论：**PASS**（1 项需用户在 Paseo 侧确认，见 §4）

## 1. 根因与修复

- 根因：`client/files.tsx` 的「仓库切换重置」effect 依赖 `[repo]`，但 `useEffect` 在**挂载时必然执行一次**。`panel.tsx` 用条件渲染切内部 tab，离开「文件」会卸载 `FilesTab`、切回会重新挂载；重新挂载时同一提交内先由缓存回填 `children`、再被该 effect 清空。React Query v5 默认 `structuralSharing`（`replaceEqualDeep`）会让结构相等的目录结果保留旧 `data` 引用，回填 effect 不再触发，于是文件树永久为空，只有缓存被回收（`gcTime` 默认 5 分钟）或目录内容真的变化后才恢复。
- 修复：用 `useRef` 记录已挂载的 repo，仅当 `repo` 真正变化时才重置；挂载时跳过。
- 提交：`7eebcf3 fix: 切回文件 tab 后文件树不再被清空`（基线 `5adbb4a`）。

## 2. 轻量验证 7 项

| # | 检查项 | 结果 | 证据 |
|---|---|---|---|
| 1 | tasks.md 全部 `[x]` | PASS | `comet state tasks`：6/6 完成；`comet guard build --apply` 报告 `tasks.md all tasks checked` |
| 2 | 改动文件与 tasks 描述一致 | PASS | `git show --stat 7eebcf3`：`client/files.tsx`（修复）+ `tests/`、`vitest.config.mts`、`package.json/lock`、`tsconfig.json`、`.gitignore`（测试基础），与 tasks 1.1/1.2/2.1 一一对应 |
| 3 | 编译通过 | PASS | `comet check run ... build --local -- npm run typecheck` → `exit=0; reused=true`（log `…/.comet/checks/4a8d4029…log`） |
| 4 | 相关测试通过 | PASS | `comet check run ... verify --local -- npm test` → `exit=0; reused=true`，`tests/files-tab.test.tsx` 2/2 通过（log `…/fc6c6f03…log`） |
| 5 | 无明显安全问题 | PASS | 改动只有 `useRef` 守卫与测试代码；未新增 shell 调用、路径拼接、密钥或 `unsafe` 操作；RPC 契约与权限路径未改 |
| 6 | 集成代码审查 | PASS（跳过，已记录） | `review_mode=off`：hotfix 预设默认关闭自动 code review。本次最终 diff 由实现者本人复核：改动 1 个逻辑点 + 测试基础，已用会失败的回归测试覆盖 |
| 7 | 核心场景 / 失败 / 边界 | PASS（含 1 项待用户确认） | 回归测试三条：①卸载后重新挂载且数据深度相等 → 目录树仍在（修复前 FAIL，修复后 PASS）；②切换仓库仍清空旧内容并显示新仓库内容（修复前后均 PASS，确保修复没有过度放宽）；③点击刷新 → 目录树仍在（第一轮修复后仍 FAIL，见 §2.1，修复后 PASS） |

### RED → GREEN 证据

```
# 修复前
❯ tests/files-tab.test.tsx (2 tests | 1 failed)
  × 切走再切回（重新挂载）后仍然显示文件树
  ✓ 切换仓库时仍然重置为新的仓库内容
AssertionError: expected null not to be null  (tests/files-tab.test.tsx:119)

# 修复后
✓ tests/files-tab.test.tsx (2 tests) 132ms
Test Files  1 passed (1)   Tests  2 passed (2)
```

## 2.1 复测发现的第二处同根因缺陷（reopen 后已修）

用户复测：「点击刷新后文件又不见了」。刷新按钮原本是「先 `setChildren({})` 再 `rootQuery.refetch()`」，恢复同样寄托在 `data` 引用变化上；目录内容未变时 `structuralSharing` 保留旧引用 → 回填 effect 不触发 → 点一次刷新树就没了。**第一轮修复只覆盖了挂载路径，漏了这个触发点。**

- 修复：`refreshTree()` 不再先清空，改为 `refetch()` 后用返回值显式回填 `children`（`fea481e`）。
- 新增第三条回归用例，先复现 FAIL 再转 PASS：

```
❯ 点击刷新后仍然显示文件树
AssertionError: expected null not to be null  (tests/files-tab.test.tsx:134)
```

- 流程：`archive-reopen`（phase=verify）→ `verify-fail`（回到 build，verify_failures=1）→ 修复 → 重新验证。

## 3. 验证模式说明

`comet state scale` 的指标为 `tasks=6, deltaSpecs=0, changedFiles=5`，建议 `full`。保留 hotfix 预设的 `light`：

- 逻辑改动只有 `client/files.tsx` 的 1 处 effect 守卫（+9/−1 行），其余文件是测试基础与依赖声明；
- 任务数 6 是因为把「引入测试框架 / 写失败用例」拆成了独立任务，不代表实现面变大；
- `deltaSpecs=0`（该 change 在 `.openspec.yaml` 声明 `skip_specs: true`，未改变任何 spec 级验收场景），不存在 spec 覆盖率与 Design Doc 一致性问题。

## 4. 待用户在 Paseo 侧确认

客户端改动需要 Paseo 渲染进程重载，AI 侧无法驱动 GUI：

1. 在 Paseo 按 **⌘R** 重载，打开 Git 面板 → 「文件」；
2. 切到「总览」→ 切到「变更」→ 切回「文件」；
3. 再点目录树头部的刷新按钮，期望树不消失；
4. 期望（全程）：目录树与文件预览仍在，点文件能正常加载内容。

运行源码已同步并重载：`paseo plugin reload git-panel` → `Plugin ready`（2026-11-05T03:39:58Z），`paseo plugin ls` → `git-panel running yes`。

## 5. 环境与遗留事项

- **openspec 版本**：Comet 0.4.5 的阶段守卫要求 `openspec status --json` 的 artifact 带 `requires` 依赖边；本机全局 openspec 为 1.6.0，缺该字段导致 `comet guard ... open` 直接报错（`OpenSpec must expose dependency edges for every artifact`）。已按用户确认把全局 openspec 升级到 **1.16.0**，守卫恢复正常。
- **`skip_specs`**：`.openspec.yaml` 增加 `skip_specs: true`（hotfix 不改 spec 场景），否则 `openspec validate` 会要求 delta spec。
- **上次会话的未同步改动**：仓库快照与运行目录仍有 `client/changes.tsx`、`client/kit.tsx`、`index.server.ts`、`server/repos.ts`、`server/snapshot.ts` 的差异（分页 / 大仓库性能那批工作，只在快照里）。按用户决定「原样保留」，本次只把修复落到两处 `client/files.tsx`（快照版本含分页、运行目录版本不含），未上线那批未验证的改动。
- 基线提交 `5adbb4a` 把当时快照整体纳入 git（含上述未同步改动），作为本 change 的回滚锚点。
- 修复提交：`7eebcf3`（挂载路径）+ `fea481e`（刷新路径）。

## 6. 非本次范围（另行记录）

- `FilePreview` 在文件请求失败时渲染 `null`（`!data` 分支），表现为空白而非错误提示；与本次「文件树被清空」不是同一缺陷，未在本次修改。
