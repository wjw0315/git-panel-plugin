# 01: 面板按自身宽度决定布局（基础 + 概览页）

**What to build:** Git 面板不再用窗口宽度判断宽/窄，而是量自己容器的宽度。把面板拖窄、或在分屏里只给面板一小块时，概览页自动变成单栏：分支列表收进弹层，提交详情改成点开后退回的页面；面板够宽时保持现在的三栏（分支 214 / 列表 / 详情 320）。

背景（根因）：当前判定读的是窗口宽度加 860 阈值，窗口很宽但面板很窄时仍然强制三栏，两个固定宽度侧栏把中间的提交列表挤到不可见。

这一张同时打下所有页签共用的基础：统一的宽度测量与三档判定（窄 < 560、中 560–859、宽 ≥ 860，宽阈值沿用现有 860），后续四张只消费它。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] 面板根容器用 onLayout 测量自身宽度；尚未量到时回退到窗口宽度，不闪空白
- [x] 宿主给的 `layout.compact` 恒为窄档，不受测量宽度影响
- [x] 面板宽度 500px（窗口 1440px）时概览页为单栏：无内联分支栏、无内联详情栏
- [x] 面板宽度 ≥ 860px 时恢复三栏，与当前行为一致
- [x] 拖宽/拖窄面板（窗口不变）时布局实时切换，无需重开面板
- [x] 三档判定抽成纯函数并单测覆盖边界（559/560、859/860、compact）
- [x] 测试用的 react-native stub 支持 onLayout，可模拟容器宽度
- [x] 组件测试：窄档只渲染列表 + 分支按钮，不渲染分支栏

## Comments

- 2026-11-17：新增 `client/layout.ts`：`resolvePanelMode(width, compact)` 三档（<560 窄、560–859 中、≥860 宽，`compact` 恒窄）+ `usePanelMode(compact)` 用 `onLayout` 量容器宽度、未量到时回退窗口宽度、宽度未变不重渲染。
- 面板根容器挂 `onLayout`，`GitPanelBody` 把档位以 `mode` 传给三个页签；概览 / 变更 / 文件页签由 `wide: boolean` 改为 `mode: PanelMode` 并在内部取 `wide = mode === "wide"`，后续工单直接在 `mode` 上细分。
- 测试：`tests/panel-layout.test.tsx` 10 条（档位边界 3、容器实测切换 3、概览三档渲染 3、面板级「窗口 1024 但容器 500 → 单栏，拖回 900 → 三栏」1）。RN stub 新增 `onLayout`/`fireLayout`/`FlatList`，plugin 桩补齐 `useWorkspace`/`useAgent`/`useTabState`，plugin UI 桩补齐 `Modal`/`copyText`。
- 全量 73 条通过，`tsc --noEmit` 通过；已同步运行副本并 reload，插件 running。
- 变更页与文件页现在也拿到正确档位（窄档即单栏），但各自的弹层/返回细节仍按 02、03 验收。
- 待目视确认：真实面板里拖动侧栏宽度时三栏 ↔ 单栏的切换时机与手感。
