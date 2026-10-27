# 验收数据与发布状态

本目录保存可公开的 2026-10-27 历史验收数据，均来自原始 `tmp/20261027-racing-overhaul/`。除将机器专属绝对路径改成工程相对路径、将私网 URL 改为通用 localhost 示例外，JSON 保留原始数值与检查结果；原件在 Release 压缩包中。`core-test-summary.json` 是从原始日志提取的摘要，已明确标记，其他文件是原报告的可公开副本。

## 历史验证索引

| 证据                                                                          | 结果与边界                                                                   |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [core-test-summary.json](2026-10-27/core-test-summary.json)                   | 4 个文件、188 项测试通过；原始日志 `short-core.log` 留在压缩包中             |
| [overhaul-report.json](2026-10-27/overhaul-report.json)                       | collision / items / interactions / ui / lifecycle 五组，37 场景、93 检查通过 |
| [controls-report.json](2026-10-27/controls-report.json)                       | 43 项方向、交互、角色与布局检查通过                                          |
| [assisted-browser-report.json](2026-10-27/assisted-browser-report.json)       | 21 项自动驾驶检查及真实时间无输入 / 主动操作对照                             |
| [keyboard-race-report.json](2026-10-27/keyboard-race-report.json)             | 本轮标准难度手动键盘长跑；不是三档难度全量重跑                               |
| [repair-report.json](2026-10-27/repair-report.json)                           | 焦点、三种窄宽度与异常存档检查通过                                           |
| [browser-report.json](2026-10-27/browser-report.json)                         | 17 项旧流程检查，无浏览器错误                                                |
| [production-report.json](2026-10-27/production-report.json)                   | 历史构建版、禁止存储访问、选线 / 氮气、暂停与无外部请求检查                  |
| [delivery-overhaul-report.json](2026-10-27/delivery-overhaul-report.json)     | 最终桥面调整后的补拍、真实起落 / 碰撞、少量资源循环                          |
| [delivery-production-report.json](2026-10-27/delivery-production-report.json) | 最终构建未暴露开发测试接口，错误 / 警告数组为空                              |

完整说明、历次数据及未覆盖项目见 [game/VALIDATION.md](../../game/VALIDATION.md)。本轮完整功能与整场检查之后还有桥面显示修复，其后只重跑定向检查；不得将前述全部检查误记为最终桥面版本上的完整重跑。历史验证未覆盖 Safari / Firefox。

## 原始材料归档

完整历史材料计划以 [GitHub Release v2026.10.28](https://github.com/pifuyuini/racing-overhaul/releases/tag/v2026.10.28) 附件 `development-evidence-20261028.tar.gz` 单独保存，包括五个原 `tmp/` 任务目录内的报告、过程截图、日志、两份补拍脚本原件，以及工作区初始化原件；可重建的 Node 编译缓存与本次发布任务目录不包含在内。压缩包中的 `tmp/...` 相对路径与历史文档一致。精选交付图片仍在 [game/public/verification/](../../game/public/verification/)。

上传后的压缩包用于保存无法从 Git 完整恢复的历史证据；源码不重复收录每张过程截图与每份日志。

## 2026-10-28 发布检查

当前状态：**本次发布尚待完成**。以下项目需要由发布主流程确认并更新，历史报告不代表它们已经通过：

- [ ] 远端直接推送的公开仓库包含完整源码、锁文件、文档和精选证据。
- [x] 发布主流程已确认使用现有依赖完成 188 项测试、格式、类型检查与生产构建；未新增或升级依赖。
- [ ] GitHub Pages 的 Source 已设置为 GitHub Actions，部署工作流成功。
- [ ] 公网仓库子路径资源正常，WebGL 游戏实际启动，选线 / 氮气 / 暂停可用。
- [ ] Release 原始材料附件已上传并确认可访问。
- [ ] 以上检查完成后，按用户授权清理远端原项目。

原始历史文本已扫描常见私钥、服务令牌、URL 凭据和字面量密码：151 个文本文件未命中规则；扫描跳过 862 个二进制 / 编译缓存文件。此结果是规则扫描记录，不表示人工逐图检查或完整秘密审计。
