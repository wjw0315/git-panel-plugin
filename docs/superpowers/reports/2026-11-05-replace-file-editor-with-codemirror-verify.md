# 编辑器替换验证记录

- Change: `replace-file-editor-with-codemirror`
- 日期：2026-11-05
- 环境：macOS / Paseo 0.15.0 / 插件 SDK 0.15.0 / Node 22 / OpenSpec 1.16.0

## 1. 自动检查

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 类型 | `npm run typecheck` | 通过（exit 0，无输出） |
| 单测 | `npm run test` | 49 passed / 49（14 个测试文件） |
| 插件 client 打包 | esbuild 0.28.2，daemon 同参数（bundle/cjs/neutral/es2020/async-await 降级 + 外部依赖白名单） | 通过，产物 1715.9 KB |
| 模块求值时机 | 无 DOM 的 Node `require` 打包产物 | 通过（CM 未在顶层求值） |
| CM 挂载 | jsdom + Range 垫片 | 通过（挂载/编辑/readOnly/销毁） |

证据文件：`docs/openspec/changes/replace-file-editor-with-codemirror/.comet/checks/`。

## 2. 部署

- `rsync -a --delete`（排除 `node_modules`/`.git`/日志/Comet 目录）到 `/Users/jiaweiwu/paseo-plugins/git-panel`
- 运行副本 `npm install`（新增 CodeMirror 6 依赖）
- `paseo plugin reload git-panel` → 日志 `Plugin ready`，RPC 方法全部注册
- 运行副本 client 入口用 daemon 同参数编译通过

## 3. 桌面手工验证（用户确认 2026-11-05，无自动化证据）

> 以下 6 项是人工在 Paseo 内操作的结论，没有对应自动化用例；回归只能靠人工复测。

| 项 | 结果 |
| --- | --- |
| 只读预览：行号 + 语法配色（TS/JS/JSON/Markdown 源码） | 通过 |
| 编辑：进入编辑、输入、`⌘S`、`Esc` 退出 | 通过 |
| 自动保存：停止输入 1.5 秒后写盘并显示「已保存」 | 通过 |
| 冲突：外部改文件后触发保存出现横幅（重新加载 / 保留草稿），磁盘未被覆盖 | 通过 |
| Markdown：默认渲染预览 + `</>` 切源码高亮 | 通过 |
| 设置页：新增「自动保存」「语法高亮」开关 | 通过 |

## 4. 自动化覆盖范围

已自动化：
- 能力检测三条路径（`editor-capability`）、语言映射（`editor-languages`）、主题/颜色解析（`editor-theme`）。
- CM 挂载、value 同步、readOnly 切换、卸载销毁、⌘S/⌘Enter/Esc 键位（`editor-codemirror`）。
- 自动保存状态机：防抖、合并、单飞排队、flush 在途竞态、冲突即停、失败保持 dirty（`editor-autosave`）。
- 文件页：打开、自动保存与缓存刷新后草稿保留、冲突横幅与草稿保留、两次点击才放弃草稿、切文件立即落盘、关闭自动保存时 ⌘S 仍写、editable=false 无入口、Markdown 预览/源码切换、超限降级（`files-editor`）。
- 设置 schema 旧配置回落默认（`settings-schema`）。

未自动化（仅人工或代码审查）：
- Paseo 内真实 CM 的视觉表现（行号、配色、滚动）、1.5s 自动保存的真实磁盘确认、冲突横幅外观。
- 真实移动端/手机原生宿主；只验证了无 DOM 的降级路径。
- 设置页 UI 的实际渲染。

## 5. 独立审查

两轮独立审查（子代理，不参与实现）：

1. 首轮 `PASS_WITH_CONCERNS`：1 CRITICAL（`autosave.flush()` 在「在途保存 + 新草稿」时提前返回）、4 IMPORTANT（测试假通过、场景覆盖不足、取消无提示丢稿、切仓库只 cancel）、7 MINOR。
2. 修复后复查 `CONDITIONAL PASS`：CRITICAL/IMPORTANT 全部闭环；复查新发现 `new TextEncoder()` 在 React Native 无该全局（会导致移动端「写盘成功却报失败」），已改为自实现 `utf8Bytes`（`client/format.ts`）并补测试。
3. 最终集成复查（Verify 阶段，HEAD=7d7e3fc）`PASS`：TextEncoder 回归彻底消除，无剩余 CRITICAL/IMPORTANT，同意归档。

## 6. 已知代价

- 插件 client bundle 从约 90 KB 增至 1711.7 KB（CodeMirror 核心 + 12 个语言包，均未压缩；daemon 不 minify）。桌面加载无感，移动端需观察首屏耗时；若明显劣化，按计划裁剪语言包。
- Markdown 未做 Proma 的 Tiptap 富文本，仅预览 + 源码两种模式。

## 7. 完整验证清单（verify_mode: full）

| # | 检查项 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | tasks.md 全部完成 | PASS | 20/20 `[x]`（`comet state tasks`） |
| 2 | 实现符合 design.md 决策 | PASS | D1–D10 逐项对应：CM6 单组件、能力检测+动态加载+边界、语言映射、主题桥接、自动保存状态机、字符预算、设置项（见第 4 节） |
| 3 | 实现符合 Design Doc | PASS | `docs/openspec/changes/replace-file-editor-with-codemirror/design.md` 即 Design Doc（frontmatter `role: technical-design`） |
| 4 | 能力规格场景全部通过 | PASS | 15/15 场景有实现与测试/人工证据（见第 8 节） |
| 5 | proposal 目标满足 | PASS | 编辑态/只读预览均替换、1.5s 自动保存、冲突保护、移动端降级、设置项、文档均已交付 |
| 6 | delta spec 与 design 无矛盾 | PASS | Build 阶段未修改 delta spec；设计决策与验收条款一致 |
| 7 | Design Doc 可定位 | PASS | 路径登记在 `.comet.yaml` `design_doc` |

## 8. 规格场景覆盖

| 场景 | 自动化 | 人工 |
| --- | --- | --- |
| 打开代码文件（行号+着色） | `files-editor` 只读渲染；`editor-codemirror` 挂载 | 桌面视觉确认 |
| 打开大文件 | `files-editor` 超限降级 | — |
| 打开 Markdown | `files-editor` 预览/源码切换 | 桌面视觉确认 |
| 进入编辑态 | `files-editor` 进入编辑 | 桌面确认 |
| 常用快捷键 | `editor-codemirror` ⌘S/⌘Enter/Esc | 桌面确认 |
| 退出编辑态 | `files-editor` 两次点击放弃草稿 | 桌面 Esc |
| 手动保存 | `files-editor` 关闭自动保存后 ⌘S 仍写 | 桌面确认 |
| 自动保存 | `editor-autosave` 防抖/合并/单飞；`files-editor` 落盘 | 桌面 1.5s 确认 |
| 磁盘冲突 | `files-editor` 冲突横幅+草稿保留+磁盘未被覆盖 | 桌面确认 |
| 自动保存关闭 | `files-editor` autoSaveFile=false 不写 | 设置页存在开关 |
| 编辑未启用 | `files-editor` editable=false 无入口 | — |
| 移动端编辑 | `editor-nodom` 无 DOM 走纯文本 | 真实手机未验证（仅代码路径） |
| 只读预览降级 | `editor-fallback` / `editor-boundary` | — |
| 设置项生效 | `settings-schema`；`files-editor` 读取设置 | 设置页人工确认 |
| 设置默认值 | `settings-schema` | — |

## 9. 接受的非关键偏差

- SUGGESTION（未修复）：`SaveIndicator` 文字已按 `saving > dirty > saved` 取，但颜色仍按 `status` 取，`saved && dirty` 时文字「未保存」配绿色、`idle && dirty` 配灰色。纯视觉不一致，不影响保存语义与数据安全；记录为后续打磨项。
- SUGGESTION（未修复）：`utf8Bytes` 对孤立高代理按 4 字节计（TextEncoder 计 3），仅影响畸形 UTF-16 的展示 size，不影响写盘与哈希。
