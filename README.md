# 萌爪海湾 · Racing Overhaul

原创海岛卡丁车游戏：四位动物车手、三圈竞速、默认自动驾驶与可选手动驾驶，包含氮气、七种道具、碰撞攻防和赛道互动。TypeScript + Three.js；模型、音乐与效果由工程生成，设置和个人纪录只保存在当前浏览器。

**正式预期地址：[开始游玩](https://pifuyuini.github.io/racing-overhaul/)**。首次部署需要在仓库 Settings → Pages 中把 Source 设为 **GitHub Actions**；以 [部署工作流](https://github.com/pifuyuini/racing-overhaul/actions) 的成功记录和公网实测为准。

建议使用支持 WebGL 2、启用硬件加速的桌面浏览器。默认自动驾驶：A / D 选线，W 回中线，空格使用氮气，E 使用道具，F 触发赛道互动，Esc 暂停。完整操作和游戏内容见 [游戏说明](game/README.md)。

## 本地开发

使用 Node.js 24 与 npm，在仓库根目录执行：

```sh
cd game
npm ci
npm run dev
```

打开终端显示的本地地址，默认是 http://localhost:5173/。工程沿用锁定的 npm 依赖；无需 Python，也不需要下载外部素材或在线字体。

```sh
npm test
npm run build
npm run preview
```

构建前执行 TypeScript 检查，静态产物生成在 `game/dist/`；预览默认使用 http://localhost:4173/。请通过 HTTP 服务访问，不能直接双击 HTML。浏览器自动化使用系统已有的 Chrome，运行方式及 `CHROME_PATH`、`QA_BASE_URL`、临时目录设置见 [游戏验证说明](game/README.md#验证脚本)。

## GitHub Pages 发布

项目保留 `game/` 工程结构。推送到默认分支后，GitHub Actions 在该目录中安装锁定依赖、运行测试与构建，并将 `game/dist/` 发布到 GitHub Pages；也可在 Actions 页面手动触发工作流。部署使用仓库子路径兼容的静态资源地址，不依赖后台服务。

`node_modules/`、`dist/`、`.venv/` 与临时验收材料不进入源码。Pages 不包含开发测试接口；依赖该接口的浏览器回归应针对开发服务器运行，生产冒烟可以通过 `QA_BASE_URL` 指向实际部署地址。

## 工程与证据

- [game/](game/)：源码、测试、浏览器检查脚本及精选交付图片。
- [game/README.md](game/README.md)：玩法、开发与验证命令。
- [game/VALIDATION.md](game/VALIDATION.md)：历次验收数据和验证边界。
- [docs/validation/](docs/validation/README.md)：可公开的原始 JSON、188 项测试摘要，以及本次发布状态。
- [docs/archive/](docs/archive/README.md)：原工作区 Python 初始化文件与一次性补拍脚本的可读存档。

2026-10-27 的历史验收包含 188 项核心测试、37 个升级场景 / 93 项检查及其他浏览器回归，不能替代本次 Pages 发布验收。完整历史临时材料计划单独发布为 [GitHub Release v2026.10.28](https://github.com/pifuyuini/racing-overhaul/releases/tag/v2026.10.28) 的 `development-evidence-20261028.tar.gz` 中；上传与发布验证状态见 [证据说明](docs/validation/README.md)。

当前版本是单赛道、本地 AI、桌面键盘游戏，未实现联网账号、手机触控或手柄；历史自动检查未覆盖 Safari / Firefox。
