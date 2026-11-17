# 01: 按钮悬停阴影

**What to build:** 鼠标悬停在 Git 面板的任意按钮上时出现柔和阴影，移开立即消失，让用户可以直观看出哪里可点击。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] 图标按钮、文字按钮、筛选 chip 悬停时都出现阴影
- [x] 移开鼠标阴影消失；按下态和禁用态不叠加悬停阴影
- [x] 阴影不改变按钮尺寸或周围布局（无布局位移）
- [ ] 深色和浅色主题下阴影都清晰可见

## Comments

- 2026-11-17：在按钮基元上统一接入悬停阴影，按下态与禁用态跳过。
- 回归测试 `tests/button-hover.test.tsx` 4 条通过；全量 55 条通过；`tsc --noEmit` 通过。
- 已同步到运行副本并 `paseo plugin reload git-panel`，插件 running。
- 待目视确认：深色与浅色主题下的阴影强度是否合适。
