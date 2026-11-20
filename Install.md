# 安装与运维

本文以 Ubuntu 24.04 / Debian 系 Linux 为例。请用拥有 sudo 权限的普通用户操作，**不要用 `sudo bash` 运行整个部署脚本**。WSL 需要先启用 systemd。

本仓库已包含两个扩展的完整源码，无需克隆原 Enhanced UI 或 OpenCode 源码。独立项目不等于零依赖：构建仍需 Node.js/npm、Bun 和网络；运行仍需 Node.js、Python 3、code-server、OpenCode CLI。模型服务商也需自行配置。

## 1. 准备系统工具

```bash
sudo apt update
sudo apt install -y git curl ca-certificates unzip tar rsync python3 build-essential
systemctl --version
ps -p 1 -o comm=
```

PID 1 应为 `systemd`。如果不是，请先按发行版文档启用 systemd；仅开发运行可以不用系统服务。

检查服务器架构，安装器应选择对应架构的程序：

```bash
uname -m
```

## 2. 安装 Node.js 与 Bun

推荐 Node.js 24，最低 Node.js 22。已装兼容版本可以跳过安装。

下面用 nvm 安装 Node；也可使用发行版或官方二进制。以下在线脚本来自工具官方，请先下载阅读再运行：

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh -o /tmp/install-nvm.sh
less /tmp/install-nvm.sh
bash /tmp/install-nvm.sh
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm install 24
nvm use 24
node --version
npm --version

curl -fsSL https://bun.sh/install -o /tmp/install-bun.sh
less /tmp/install-bun.sh
bash /tmp/install-bun.sh bun-v1.3.14
export PATH="$HOME/.bun/bin:$PATH"
bun --version
```

Chat 锁文件在 Bun 1.3.14 验证；包中声明的 Bun 1.3.10 也属于支持范围。服务使用部署时选定的 Node 绝对路径，因此不要在部署后删除该 Node 版本。

## 3. 安装 code-server 与 OpenCode CLI

不要把 VS Code SSH 目录的 `bin/code-server` 或终端 `remote-cli/code-server` 当成本项目的 code-server；需要 Coder 的 [code-server](https://coder.com/docs/code-server/install)。

```bash
curl -fsSL https://code-server.dev/install.sh -o /tmp/install-code-server.sh
less /tmp/install-code-server.sh
bash /tmp/install-code-server.sh --method=standalone --prefix="$HOME/.local"
export PATH="$HOME/.local/bin:$PATH"
"$HOME/.local/bin/code-server" --version

curl -fsSL https://opencode.ai/install -o /tmp/install-opencode.sh
less /tmp/install-opencode.sh
bash /tmp/install-opencode.sh
export PATH="$HOME/.opencode/bin:$PATH"
opencode --version
```

已验证组合：code-server 4.145.2 / Code 1.145.2、OpenCode CLI 1.18.32 (不支持v2版本)。Workbench 要求 Code ≥1.114，且须支持 `viewsContainers.secondarySidebar`；仅版本满足不保证所有后续版本兼容。OpenCode CLI 更新后建议先在开发实例验证 SDK、配置及对话。

不需要手动运行其他 code-server 或 `opencode serve` 服务。启动器负责私有 code-server，Chat 扩展负责每个工作区的 OpenCode 服务。

## 4. 获取本项目并检查依赖

源码目录和部署目录必须分开：

```bash
mkdir -p "$HOME/src"
git clone https://github.com/zhangmeishan/opencode-ide.git "$HOME/src/opencode-ide"
cd "$HOME/src/opencode-ide"
npm ci
CODE_SERVER_BIN="$HOME/.local/bin/code-server" npm run doctor
npm run check
npm test
```

如果仓库是私有仓库，先配置 GitHub SSH key 或使用已登录的 `gh repo clone`。不要将 GitHub token 写入 remote URL 或配置文件。

`npm run doctor` 会检查 Node/npm、Bun、Python、code-server、OpenCode。`npm run build` 会用 `bun install --frozen-lockfile` 安装聊天扩展依赖，不需要分别手动安装。

## 5. 设置 WebUI 登录凭据

部署默认从源码目录 `config/ide-login.json` 读取，最低密码长度为 8 个字符。该文件被 `.gitignore` 忽略，不会提交到 GitHub；首次克隆后需要自行创建。JSON 格式如下：

```json
{
  "username": "user",
  "password": "example.passwd"
}
```

上面是格式示例，实际部署时请填写自己的用户名和密码，并设置文件权限：

```bash
chmod 600 config/ide-login.json
```

也可以交互生成 JSON，避免引号转义问题和把密码写入 shell 历史：

```bash
python3 - <<'PY'
import getpass, json, os, pathlib
p = pathlib.Path('config/ide-login.json')
username = input('WebUI 用户名: ').strip()
password = getpass.getpass('WebUI 密码（至少 8 字符）: ')
if not username or ':' in username or any(c.isspace() for c in username):
    raise SystemExit('用户名不能为空，也不能包含空格或冒号')
if len(password) < 8:
    raise SystemExit('密码至少 8 字符')
fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'w') as f:
    json.dump({'username': username, 'password': password}, f, indent=2)
    f.write('\n')
p.chmod(0o600)
print('已写入', p)
PY
git check-ignore config/ide-login.json
```

每次部署都会读取该文件并更新运行数据中的哈希。凭据源文件已被 Git 和程序同步排除。可用 `--credentials-file /absolute/path/login.json` 覆盖；未提供文件且没有已保存账号时，部署会交互询问。无人值守部署须预先准备凭据和 sudo 权限。

WebUI 登录凭据不是 OpenCode API Key，也不是 Linux/sudo 密码。

## 6. 运行 Python 示例

默认示例只使用 Python 3 标准库，无需 pip 或额外插件：

```bash
python3 examples/python-demo/main.py
```

读取示例 CSV，在终端输出统计并生成 `examples/python-demo/output/summary.json` 和 `report.html`。JSON 可在编辑器直接打开，HTML 可下载到浏览器查看；IDE 内 HTML 预览可自行安装相应扩展。输出目录已忽略。部署只安装本项目两个扩展，不自动安装 Python 或其他语言插件。

## 7. 首次系统服务部署

按工具实际路径执行。脚本开头的同名变量也可配置：

```bash
CODE_SERVER_BIN="$HOME/.local/bin/code-server" \
OPENCODE_BIN="$HOME/.opencode/bin/opencode" \
NODE_BIN="$(command -v node)" \
  bash scripts/deploy-service.sh
```

脚本会构建 VSIX、安装到独立扩展目录、创建系统 unit 并请求 sudo 安装/重启。构建失败时不会停止正在运行的旧服务。

| 参数 | 默认值 / 含义 |
| --- | --- |
| `INSTALL_DIR` | `~/opencode-ide`，不能与源码目录相同或位于源码目录下 |
| `DATA_DIR` | `$INSTALL_DIR/data`，设置、布局、登录哈希、扩展和日志 |
| `PORT` / `BIND_HOST` | `2030` / `0.0.0.0`，公开认证网关 |
| `WORKSPACE_DIR` | `$INSTALL_DIR/examples/python-demo`；可指定已有目录或 `.code-workspace` |
| `RUN_USER` / `RUN_HOME` | 当前普通用户及其主目录 |
| `EXTRA_PATH` | 额外工具路径；自行安装的语言工具可在此补充 |
| `BUILD_FIRST` | `true`；`false` 仅使用已有 VSIX |
| `SERVICE_NAME` | `opencode-ide` |

自定义项目示例：

```bash
WORKSPACE_DIR="$HOME/projects/my-project" \
  bash scripts/deploy-service.sh
```

确认状态：

```bash
sudo systemctl status opencode-ide.service --no-pager
curl --fail http://127.0.0.1:2030/healthz
sudo journalctl -u opencode-ide.service -n 80 --no-pager
```

`ok` 仅说明网关启动。部署不改变开机自启状态；如需开机启动：

```bash
sudo systemctl enable opencode-ide.service
systemctl is-enabled opencode-ide.service
```

系统服务用 `User=<你的用户>` 运行。安装/重启 unit 需要 sudo，WebUI 内终端仍是普通用户。SSH 断开不会停止服务。已有其他端口的 code-server 服务与它独立，不应删除共享的 code-server 程序。

## 8. 配置 HTTPS 访问

远程浏览器必须使用 HTTPS，或通过 SSH 转发到本机 localhost。否则编辑器外壳可能出现，但聊天/PDF Webview 可能因 Service Worker、`crypto.subtle` 不可用而失败。

单机 nginx 示例（将域名替换为你自己的，DNS 指向服务器，开放 80/443）：

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo nano /etc/nginx/sites-available/opencode-ide
```

先写入以下 HTTP server：

```nginx
server {
    listen 80;
    server_name ide.example.com;
    location / {
        proxy_pass http://127.0.0.1:2030;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-Host $http_host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/opencode-ide /etc/nginx/sites-enabled/opencode-ide
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d ide.example.com
```

已有 HTTPS server 时，可复制 [config/nginx-location.conf](config/nginx-location.conf) 的 location 内容。代理在另一台机器时，将 `proxy_pass` 改成 IDE 服务器的可达内网地址；同机代理可部署时设 `BIND_HOST=127.0.0.1`。保留 `$http_host`，特别是 HTTPS 使用非标准端口时，不能用丢失端口的 `$host`。认证网关仅接受公开 Host 与 Origin 一致的请求。

临时用 SSH 转发也可：

```bash
# 在自己的电脑上运行
ssh -L 3100:127.0.0.1:2030 user@your-server
```

浏览器打开 `http://127.0.0.1:3100/`，仍需 WebUI 登录。

## 9. 第一次使用

1. 登录 WebUI；按需要信任工作区。
2. 右侧 OpenCode 齿轮打开 Settings，填写 API Key、模型及默认 Agent。设置保存后，在没有执行中任务时点击“重启服务”。
3. Settings 配置当前工作区的 `opencode.json[c]`；API Key 存入 OpenCode 全局凭据。可用原生 `OpenCode: Ask About Current File` 带文件上下文发起任务。
4. 结果默认关闭；通过 `OpenCode IDE: Open in Result Group` 选择结果文件打开。
5. 如有同用户 VS Code Remote SSH，扩展会自动双向同步安装、更新与卸载。按钮为状态栏 Extensions。Open VSX 未收录、缺依赖、不兼容或查询失败会跳过。详细规则见架构文档。

## 10. 更新、修改密码与备份

```bash
cd "$HOME/src/opencode-ide"
git pull --ff-only
bash scripts/deploy-service.sh
```

更新保留部署项目与用户数据，安装新包后刷新网页。若修改源码中的 `config/ide-login.json`，下次部署会使用新密码。也可直接修改部署凭据：

```bash
OPENCODE_IDE_DATA_DIR="$HOME/opencode-ide/data" \
  node "$HOME/opencode-ide/scripts/configure-auth.mjs" --reset
sudo systemctl restart opencode-ide.service
```

备份 `data/`、实际项目目录和 OpenCode CLI 全局数据时，请按凭据处理备份文件。完整备份前停止服务可避免数据库写入冲突。恢复后保持原用户拥有文件权限。`data/` 不包含所有 OpenCode CLI 会话和供应商凭据。

## 11. 停止与卸载系统服务

```bash
sudo systemctl disable --now opencode-ide.service
sudo rm /etc/systemd/system/opencode-ide.service
sudo systemctl daemon-reload
```

这只卸载服务，不删除项目、登录凭据或会话数据。确认备份后可自行删除部署目录。旧用户级同名 unit 的一次性迁移逻辑仍在脚本中，仅当旧文件存在时执行；新安装只创建系统级 unit。

## 开发运行

```bash
cd "$HOME/src/opencode-ide"
npm ci
npm run build
CODE_SERVER_BIN="$HOME/.local/bin/code-server" npm run setup
CODE_SERVER_BIN="$HOME/.local/bin/code-server" npm start
```

开发实例默认 `.runtime/` 和 `127.0.0.1:3100`，setup 首次交互创建账号。开发服务器在当前终端前台运行；生产使用上面的系统服务。测试命令及已知失败见 [docs/testing.md](docs/testing.md)。

## 常见问题

- **`not spawned with IPC`**：使用了 remote-cli 或继承了 IDE 终端变量。指定真正的 `CODE_SERVER_BIN`；部署脚本会清理相关变量。
- **sudo 需要密码**：在交互终端重新运行部署，不要将密码写入脚本或凭据文件。
- **WS 403 / 1006**：检查 nginx 的 Host、端口和 WebSocket Upgrade 转发。
- **空白聊天/PDF**：检查 HTTPS/localhost、安全上下文、Workspace Trust 和浏览器控制台。
- **启动缺少工具**：运行 `npm run doctor`；核对 unit 使用的绝对路径和 `EXTRA_PATH`。
- **同步跳过**：查看 OpenCode IDE Output。按 Open VSX 扩展 ID 收录情况判断，现有安装版本不一定与市场版本完全相同；缺依赖项不会强行安装。
