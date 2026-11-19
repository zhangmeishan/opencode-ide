# OpenCode IDE Chat

本仓库的聊天扩展，ID：`opencode-ide.opencode-ide-chat`。源码直接由主仓库管理；不是子模块，也不从原 Enhanced UI 仓库加载代码。

提供右侧 OpenCode、Sessions、Todo、Subagents、Modified Files 五标签，常驻新会话/Settings 按钮，以及每工作区 OpenCode 服务管理。

- 配置与命令前缀：`opencode-ide-chat.*`。
- 源码：`src/core`（运行时与命令）、`src/panel`（React 聊天）、`src/sidebar`（侧栏/设置）、`src/bridge`（消息契约）。
- 构建：从主仓库运行 `npm run build`，生成 `artifacts/opencode-ide-chat.vsix`。
- 检查：此目录运行 `bun run check-types`、`bun run lint`、`bun run test`。
- 来源与版权：[ORIGIN.md](ORIGIN.md)、[LICENSE](LICENSE)。

完整安装说明见 [Install.md](../Install.md)，测试命令和已知限制见 [docs/testing.md](../docs/testing.md)。
