---
comet_change: replace-file-editor-with-codemirror
role: technical-design
canonical_spec: openspec
---

# Design

> 正式技术设计。行为与验收以 `specs/file-editor/spec.md` 为准；本文只记录技术决策、数据流、失败路径与验证策略。2026-11-05 经用户确认：直接封装 `EditorView`、只读复用同一组件、冲突不提供强制覆盖、大文件按字符预算兜底、CM 挂载不在 jsdom 中模拟。

## Context

- 现状：`client/files.tsx` 的编辑态是裸 `TextInput`，只读态是 `client/diff.ts` 的 20 行正则 tokenizer + 4000 行截断。写盘走 `git.file-write`，客户端用 `file-content` 返回的 `sha256` 作为基线；写入成功返回新的 `sha256`（`shared/git.ts`、`server/files.ts`），天然支持「保存后刷新基线」。
- 宿主：Paseo 插件 UI 是 React Native primitives。桌面端跑 Expo Web（有 DOM），移动端是原生（无 DOM）。同机 `better-paseo` 已用 `hasDom()` 守卫实现桌面专属 DOM 功能，证明该模式可用。
- 打包：插件 client 由 daemon 用 esbuild 编译（`bundle: true`、`format: cjs`、`platform: neutral`、`target: es2020`、`async-await` 降级），external 仅 SDK/react/react-native/zod/react-query，其余 npm 依赖会被打进 client bundle；动态 `import()` 在 cjs 产物中变成惰性 init，模块顶层代码不会在原生端执行。
- 部署：仓库快照（Comet 工作区）与运行副本 `/Users/jiaweiwu/paseo-plugins/git-panel` 是两份目录，运行副本才是 Paseo 加载的插件目录。

## Goals / Non-Goals

**Goals:**

- 桌面端用一套编辑器同时服务编辑态与只读预览，交互与 Proma 的文件编辑器对齐到「行号 + 语法高亮 + 快捷键 + 自动保存」这一层。
- 编辑保存具备 Proma 式体验（1.5s 防抖自动保存），同时保留现有 sha256 冲突保护，绝不静默覆盖磁盘改动。
- 任何失败路径都可回退：无 DOM、CM 加载失败、渲染异常 → 纯文本编辑/预览，面板其余功能不受影响。

**Non-Goals:**

- 不引入 Tiptap / shiki / `@pierre/diffs`，不做 Markdown 富文本 WYSIWYG。
- 不做语言服务器、补全、诊断、多文件搜索替换、多标签编辑器。
- 不改 `git.file-*` RPC 契约、可编辑白名单与 2 MiB 上限。

## Decisions

### D1. 编辑器内核选 CodeMirror 6

- 备选：Monaco（体积与 worker 依赖过重，且移动端不可用）、ink-mde（Markdown 专用，仍带 CM，但封装层与本场景不匹配）、纯 RN 自建（编辑态无法真正语法着色，不满足需求）、Tiptap（富文本，不是代码编辑器）。
- 结论：CM6 tree-shakable、无 worker、纯 DOM 即可挂载、主题/语言可组合，与 Proma 同内核家族，行为最接近。

### D2. 能力检测 + 动态加载 + 错误边界三层降级

```
canUseDom() ── false ──▶ PlainTextEditor（现有 TextInput）
     │ true
     ▼
await import('./codemirror') ── 失败 ──▶ PlainTextEditor + toast
     │ 成功
     ▼
mount EditorView ── 抛错 ──▶ EditorErrorBoundary 捕获 → PlainTextEditor
```

- 检测条件：`typeof document !== "undefined" && typeof document.createElement === "function" && Platform.OS === "web"`。
- CM 只在 effect 内 `await import()`，不在模块顶层 import，保证原生端不执行 CM 的模块初始化（`@codemirror/view` 的浏览器探测会读 `navigator`）。
- 每次加载结果按宿主缓存，避免每个文件重复探测；失败也在会话内记住，不再重试。

### D3. 单一 `CodeEditor` 组件承载编辑与只读

- props：`value`、`readOnly`、`filePath`（语言推断）、`theme`、`onChange`、`onSave`、`onCancel`、`autoFocus`。
- 只读预览 = `readOnly: true` + 关闭编辑键位；编辑态 = 可写 + save/cancel 键位。
- 用 `Compartment` 承载 `readOnly`、语言扩展与主题，文件切换时 reconfigure 而不是重建 `EditorView`，保留撤销栈与滚动位置。

### D4. 语言支持按需映射

- `languages.ts` 维护扩展名 → 语言包的动作，语言包逐个 `await import()`（javascript/json/markdown/html/css/python/java/cpp/rust/xml/yaml/sql）。
- 未识别的扩展名不加语言扩展，仍保留行号与主题。
- 中文/英文文案与现有 `strings.ts` 一致。

### D5. 主题由 `PluginTheme` 桥接

- 用 `EditorView.theme()` 把 `theme.colors`（surface0/1/2、foreground、foregroundMuted、accent、statusSuccess、statusWarning、statusDanger、border）映射成 CM 的背景、光标、选区和行号样式；`HighlightStyle` 复用同一批颜色，保证与 diff 视图配色一致。
- 不再依赖外部主题包（避免 `theme-one-dark` 之类的额外依赖）。

### D6. 自动保存状态机

```
idle ── 输入 ──▶ dirty ──(1.5s)──▶ saving ──成功──▶ saved ──(1.5s)──▶ idle
                    │                  │
                    │                  └── sha 冲突 ──▶ conflict
                    └── ⌘S/⌘Enter ──────▶ saving
```

- 单一在途请求：`saving` 期间继续输入只更新草稿，不叠加请求；请求返回后若草稿比已保存内容新，再排一次 1.5s 定时器。
- 保存成功用返回的 `sha256` 更新基线，`savedContent` 同步为本次写入内容，避免第二次自动保存误判冲突。
- `conflict`：停止自动保存，编辑器保留草稿，显示「磁盘已变更」提示，提供「重新加载（丢弃草稿）」与「保持草稿」两个动作；不做自动重试。
- 切文件/关闭面板：清除定时器并立即 flush 一次；冲突或不安全状态时保留当前文件并提示，不静默丢草稿。
- 现有 `tab.setModified(dirty)` 继续由草稿差异驱动。

### D7. 只读预览不再截断 4000 行，改为字符预算

- 大文件判定沿用服务端 `tooLarge`（> 2 MiB）与服务端二进制判定；客户端再设 `PREVIEW_CHAR_LIMIT`（约 40 万字符）用于不加载编辑器的纯文本兜底，超限提示「已降级」。
- 只读 CM 关闭搜索面板以外的交互扩展，减少大文件开销。

### D8. 设置项

- 新增 `autoSaveFile`（默认 `true`）与 `editorSyntaxHighlight`（默认 `true`）。
- `editorSyntaxHighlight=false` 时不加载语言扩展，仅保留行号与主题，用于超大文件或用户偏好。
- 设置 schema 在 `shared/git.ts`，UI 在 `client/settings.tsx`，文案在 `client/strings.ts`。

### D9. 测试与验证

- 单元测试（vitest + jsdom）：语言映射、能力检测（无 document → 降级）、自动保存状态机（fake timers：防抖、单飞、冲突后停止）、保存成功刷新基线、Markdown 源码/预览切换。
- CM 在 jsdom 里只做挂载/生命周期/键位冒烟，不断言布局（jsdom 无真实布局）；视觉与真实交互由 Paseo 桌面端手工验证 + 插件日志确认。
- 现有 `tests/files-tab.test.tsx` 需扩展，不删除既有断言。

### D10. 已确认的取舍（2026-11-05 用户确认）

- **只读复用同一 CM 组件**：不保留第二套静态高亮实现；降级时直接纯文本，避免两套渲染漂移。
- **冲突不提供强制覆盖**：只给「重新加载（丢弃草稿）」与「保持草稿」，宁可多一步操作也不静默覆盖磁盘改动。
- **不引入 `@uiw/react-codemirror`、ink-mde**：前者只是封装层，后者是 Markdown 专用；直接封装 `EditorView` 依赖最少、控制最精确。

## Risks / Trade-offs

- **esbuild 在 `platform: neutral` 下打包 CM** → 已按 daemon 同参数实测（esbuild 0.28.2，`bundle/cjs/neutral/es2020/async-await 降级`）：编译通过；产物在无 DOM 的 Node 中 `require` 不触发 CM 初始化；在 jsdom（补 `MutationObserver`/`ResizeObserver`）中可完成挂载、编辑、readOnly 切换与销毁。**体积实测**：核心 + 3 语言（js/json/md）≈ 1110 KB；核心 + 7 语言（+html/css/python/yaml）≈ 1282 KB；完整 12 语言集 ≈ 1589 KB（均未压缩，daemon 不做 minify）。结论：采用完整语言集，把体积作为已知代价记录在 Verify；若移动端实测加载明显劣化，再裁剪语言包（属小规模增量）。
- **CM 在 RN Web 容器中的尺寸测量**（父容器 flex 高度）→ 宿主 div 显式 `height: 100%`，CM 主题给 `&` 与 `.cm-scroller` 明确 `height/overflow`；加载后调用 `requestMeasure()`。
- **移动端 bundle 体积**：即使不执行，CM 源码仍会进入 client bundle（动态 import 被打包内联）。→ 已量化到 1.59 MB；`paseo plugin reload` 后记录加载耗时，若明显劣化则退化为「只保留核心 + 常用语言」或「只读静态高亮 + TextInput 编辑」。
- **自动保存与外部修改竞态** → 单飞 + 基线刷新 + 冲突即停；冲突状态下禁止自动重试。
- **宿主快捷键冲突**（⌘K 等）→ 只在 CM 内用 `Prec.highest` 绑定 save/cancel，不注册全局热键。
- **两份目录漂移** → 部署步骤固定为「仓库验证 → rsync 到运行副本 → 运行副本 `npm install` → `paseo plugin reload`」，并在文档中记录。

## Migration Plan

1. 在仓库内完成实现与 typecheck/test。
2. `rsync -a --delete --exclude node_modules --exclude .git` 同步到 `/Users/jiaweiwu/paseo-plugins/git-panel`。
3. 在运行副本执行 `npm install`（新增 CodeMirror 依赖），再 `paseo plugin reload git-panel`，Paseo 内 ⌘R 重载 client。
4. 回滚：`git revert` 或恢复上一个提交 → 同样 rsync + reload；CM 相关失败由错误边界就地降级，不需要回滚即可继续使用面板。

## Open Questions

- 无阻塞项。语言包清单与主题色值可在实现中微调，不影响 spec、方案与任务拆分。
