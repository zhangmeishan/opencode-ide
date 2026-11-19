# 测试与验证

以下命令从仓库根目录运行。依赖准备见 [Install.md](../Install.md)。测试不需要原 Enhanced UI 仓库或任何 Git 子模块。

## 发布整理验证结果

本次从待提交文件导出到空目录重新安装依赖，而不是复用工作目录的 node_modules 或 dist：

| 检查 | 结果 |
| --- | --- |
| `npm ci`、类型检查、VSIX 构建（含 Chat lint） | 通过，生成两个独立扩展包 |
| `npm test` | 16 通过、1 条真实 CLI 测试默认跳过 |
| 单独启用真实 CLI 同步测试 | 1 通过，临时扩展目录 |
| Chat 路由/配置定向测试（含真实 OpenCode 配置加载） | 22 通过 |
| 聊天完整套件 | 558 通过、1 跳过、7 项已知失败，详见下文 |
| 原型浏览器交互测试 | 通过，无外部网络请求和脚本错误 |
| 文档相对链接、暂存区凭据/个人路径/构建产物检查 | 通过 |

本次未重启生产服务，也未进行真实 LLM 请求或 HTTPS 证书签发；发布检查不代表这些目标环境操作已经完成。

## 基础检查

```bash
npm ci
npm run check
npm test
npm run build
```

`npm test` 使用 Node test runner，覆盖凭据文件、登录/WS 认证、Accounts 状态、布局策略、仓库独立性及扩展同步。真实 CLI 同步测试默认跳过。`npm run build` 安装 Chat 锁定依赖，执行两个扩展的类型检查及 Chat lint，生成 `artifacts/opencode-ide-chat.vsix`、`artifacts/opencode-ide-integration.vsix`。

聊天扩展完整测试：

```bash
(cd opencode-extension && bun install --frozen-lockfile && bun run test)
```

**已知失败**：聊天完整套件有 7 项旧的 reduced-motion fallback 断言失败；当前样式不包含这些媒体查询。涉及 `panel-claude-todo-scroll`、`panel-output-window`、`panel-codex-activity-animation`、`panel-shell-block`、`panel-collapsible-prompt` 和 `panel-theme`（2 项）。这不是全绿测试套件；不要跳过失败后声称全部通过。类型/lint 和本次功能定向测试应通过。

## 真实扩展 CLI 同步（隔离目录）

将环境变量指向真正的 code-server 可执行程序和 VS Code SSH 服务端 CLI，而非编辑器终端里的 remote-cli 包装器：

```bash
SYNC_TEST_WEB_CLI="$HOME/.local/bin/code-server" \
SYNC_TEST_SSH_CLI="$HOME/.vscode-server/cli/servers/Stable-<commit>/server/bin/code-server" \
  node --test ide-integration/test/extension-sync-cli.test.mjs
```

测试自行创建临时扩展目录，验证两个方向的安装、更新、卸载、删除不复活、OpenCode 排除、微软扩展资格和网络失败不修改基线。Open VSX 响应在此测试中注入，不依赖市场临时可用性。不会修改实际 SSH 扩展目录。

## 真实 OpenCode 配置加载

```bash
(cd opencode-extension && \
  SETTINGS_TEST_OPENCODE="$(command -v opencode)" bun test src/test/settings-api.test.ts)
```

该测试用临时目录启动 OpenCode CLI，验证写入的配置可加载并保留无关字段。它不调用 LLM；不能代替供应商认证、计费模型请求或工具执行验收。

## 浏览器集成

先安装 Playwright Chromium：

```bash
npx playwright install --with-deps chromium
npm run setup
npm start
```

另开终端（把凭据替换为本地开发实例使用的账号，不提交测试凭据）：

```bash
export OPENCODE_IDE_URL='http://127.0.0.1:3100/'
read -r -p '用户名: ' OPENCODE_IDE_USERNAME
read -r -s -p '密码: ' OPENCODE_IDE_PASSWORD; printf '\n'
export OPENCODE_IDE_USERNAME OPENCODE_IDE_PASSWORD
npm run test:browser
node scripts/check-tabs.mjs
unset OPENCODE_IDE_USERNAME OPENCODE_IDE_PASSWORD
```

已安装其他 Chromium 时可设置 `CHROMIUM_PATH=/absolute/path/to/chrome`。浏览器输出截图/报告在被忽略的 `test-results/`。`smoke-browser.mjs` 检查登录、单编辑组、取消结果选择、新建会话仍在右侧、文件上下文与刷新；`check-tabs.mjs` 检查 Accounts 隐藏、五标签、右侧 Quick New Session、设置齿轮和服务商列表。首次工作区需要授予 Workspace Trust。

这些检查可能创建空 OpenCode 会话；请对测试项目运行。若要同时隔离 CLI 的全局数据，可设置临时的 `XDG_CONFIG_HOME`、`XDG_DATA_HOME`、`XDG_CACHE_HOME`。默认扩展同步会访问当前用户 SSH 目录；测试实例可设置 `VSCODE_AGENT_FOLDER=/path/to/nonexistent-test-ssh` 禁用发现。

默认工作区是 `examples/python-demo`。先运行 `python3 examples/python-demo/main.py`，再设置 `OPENCODE_IDE_TEST_RESULT=1 npm run test:browser`，可额外验证生成的 `summary.json` 在当前编辑组打开。`npm test` 也会在临时目录验证示例统计和报告内容。

## 原型验收

```bash
npm run test:prototype
```

本地打开 `reference/prototype.html`，检查五标签、新会话、设置页面和按需打开/关闭结果。页面持续标注“布局演示”，不产生网络请求或真实模型响应。浏览器尺寸变窄时验证标签栏可滚动。

## 发布前检查

- 从暂存树或提交创建干净检出，重新安装依赖，执行上述基础检查；确认不存在依赖未跟踪文件的情况。
- `git ls-files --stage` 不应包含 `160000` gitlink；不得跟踪嵌套 `.git`、`node_modules`、`dist`、VSIX、`test-results`、运行数据或凭据。
- `git check-ignore config/ide-login.json` 应命中根 `.gitignore`。
- 检查 README、Install、架构和测试说明的相对链接；公开样例不得包含个人 IP、域名、绝对用户目录或密码。
- 系统服务部署、HTTPS 证书和真实 LLM 任务必须在目标环境单独确认。`/healthz` 返回 `ok` 仅说明网关存活。
