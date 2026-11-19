# OpenCode IDE Web

在浏览器中使用 code-server 原生编辑器与右侧 OpenCode 聊天工作区。源码、构建和部署脚本均包含在本仓库，无 Git 子模块，无需克隆其他项目。

## 功能

- 中间默认单编辑区，结果文件按需打开；保留文件、搜索、Git、终端等原生工具。
- 右侧 **OpenCode / Sessions / Todo / Subagents / Modified Files** 五个标签。
- 右侧常驻新会话和设置按钮；设置页配置服务商 API Key、模型和默认 Agent。
- WebUI 独立用户名密码登录，HTTP 和 WebSocket 经过认证网关；原生 Chat 和 Accounts 入口隐藏。
- 与同一服务器、同一用户的 VS Code Remote SSH 双向同步扩展安装、更新和卸载，以 Open VSX 是否提供可下载条目判断；OpenCode 专用扩展不参与同步。
- 系统级 systemd 服务，以普通用户运行，SSH 断开后继续提供服务。

## 安装

先阅读 **[Install.md](Install.md)**：包含系统工具、Node.js、Bun、code-server、OpenCode、登录凭据、HTTPS、首次部署、更新和卸载步骤。

完成准备后，在源码目录执行：

```bash
bash scripts/deploy-service.sh
```

默认读取 `config/ide-login.json`，安装到 `~/opencode-ide`，网关监听 `2030`。部署完成后使用 HTTPS 域名访问并登录。

## 目录

| 路径 | 内容 |
| --- | --- |
| `opencode-extension/` | OpenCode IDE Chat，ID `opencode-ide.opencode-ide-chat` |
| `ide-integration/` | OpenCode IDE Workbench：布局、项目、结果和扩展同步 |
| `scripts/`、`config/` | 构建、登录、启动、部署和配置模板 |
| `examples/python-demo/` | 仅用 Python 标准库的 CSV 汇总与报告示例 |
| `reference/prototype.html` | 可独立打开的交互布局示意，不连接真实模型或执行命令 |

## 开发与验证

```bash
npm ci
npm run check
npm test
npm run build
```

构建生成两个 VSIX，位于 `artifacts/`。完整测试、浏览器验证和已知限制见 [docs/testing.md](docs/testing.md)。模块边界、认证和同步规则见 [docs/architecture.md](docs/architecture.md)。

## 许可证与来源

项目采用 [MIT License](LICENSE)。聊天组件的来源和原始版权声明见 [opencode-extension/ORIGIN.md](opencode-extension/ORIGIN.md) 与其 [LICENSE](opencode-extension/LICENSE)。本仓库独立维护，不修改或发布到原 Enhanced UI 项目。
