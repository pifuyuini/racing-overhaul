# 一次性补拍脚本

`delivery-retake.mjs` 与 `delivery-contact-tail.mjs` 用于 2026-10-27 的交付补拍：真实起落、道具命中、侧碰、桥面与少量资源循环。它们不是常规 QA，不加入 npm 脚本，也不替代 `game/scripts/` 中的回归检查。

这里保留原有场景与断言逻辑，仅将地址改成 `QA_BASE_URL`（默认 `http://localhost:5173/`），通过 `CHROME_PATH` 或系统 Chrome channel 选择已有浏览器，并从相对的 `game/package.json` 解析已安装的 Playwright Core。两份完全未修改的原件位于 Release 原始证据包的 `tmp/20261027-racing-overhaul/`。

脚本依赖开发服务器的 `__PAWPRINT_TEST__` 接口与根路径 `/src/track.ts`，只支持当前开发工程的根路径服务，不适用于生产包或 GitHub Pages。`delivery-contact-tail.mjs` 还会读取同目录之前的 `delivery-overhaul-report.json`，应先运行 retake，再运行 contact-tail。运行结果会写入同一报告，应使用专属的新临时目录；原始报告留在发布存档中。

从仓库根目录准备带 `.codex-tmp` 标记的临时目录，将其绝对路径同时传给 `QA_ARTIFACT_DIR` 和 `TMPDIR`。在开发服务器运行时执行：

```sh
QA_ARTIFACT_DIR="$qa_dir" TMPDIR="$qa_dir" \
QA_BASE_URL=http://localhost:5173/ \
node docs/archive/capture-scripts/delivery-retake.mjs

QA_ARTIFACT_DIR="$qa_dir" TMPDIR="$qa_dir" \
QA_BASE_URL=http://localhost:5173/ \
node docs/archive/capture-scripts/delivery-contact-tail.mjs
```

整理期间只做语法与依赖解析检查，未重新运行这些历史补拍场景。
