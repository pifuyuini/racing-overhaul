# 开发工作区存档

- [workspace-bootstrap/](workspace-bootstrap/README.md)：原工作区四个 Python 初始化文件的逐字节副本，保留原始内容；不参与赛车构建或运行。
- [capture-scripts/](capture-scripts/README.md)：两份一次性补拍脚本，保留原有场景逻辑，仅改为通用地址、浏览器环境变量和相对依赖解析；不属于日常 QA。

历史 `tmp/` 中的原始报告、过程截图、日志及两份脚本的原件计划单独保存为 GitHub Release v2026.10.28 附件 `development-evidence-20261028.tar.gz`。该压缩包排除可重建的 Node 编译缓存和本次发布任务目录。上传状态与证据索引见 [validation](../validation/README.md)。
