# 04: 系统 opener——在 Finder 中显示 / 用默认应用打开

**What to build:** 接通 fs-op 的 reveal/open（服务端 spawn 已在 01 落地）；新增插件设置 `allowSystemOpen`（默认开，settings 面板出现开关行）；关闭设置时菜单对应项置灰（disabled 不隐藏）；`opener-unavailable` 失败 toast 文案明示「daemon 所在机器无法打开（可能为远程环境）」。macOS 优先验证，Linux xdg-open、Windows explorer 尽力而为不阻塞合入。

**Blocked by:** 01（schema 已含 reveal/open），02（菜单项挂接）

**Status:** ready-for-agent

**测试:** 设置开关读写（先例 `tests/settings-schema.test.tsx`）；服务端 argv 构造断言已在 01 覆盖，此处补客户端置灰与失败 toast 渲染用例。

## Comments

**2026-11-17 实现完成**（本会话）：
- 系统 opener 随 567238f（服务端 spawn + 平台 argv）+ 7e1c0cc（allowSystemOpen 设置开关行）落地；opener-unavailable 映射「远程环境」提示。macOS open/open -R 真机待用户在 Paseo 内实测。
