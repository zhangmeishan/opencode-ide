#!/usr/bin/env bash
set -euo pipefail

# ================= 用户配置：优先修改这里，也支持同名环境变量覆盖 =================
RUN_USER="${RUN_USER:-${SUDO_USER:-$(id -un)}}"        # 服务运行用户，禁止用 root 运行 IDE
RUN_HOME="${RUN_HOME:-$(getent passwd "$RUN_USER" | cut -d: -f6)}"
INSTALL_DIR="${INSTALL_DIR:-$RUN_HOME/opencode-ide}"   # 独立部署目录
SOURCE_DIR="${SOURCE_DIR:-$(dirname "$(dirname "$(realpath "${BASH_SOURCE[0]}")")")}" # 已构建的源码目录
BIND_HOST="${BIND_HOST:-0.0.0.0}"                     # 登录网关，供已有远程 HTTPS 代理访问
PORT="${PORT:-2030}"                                # 与已有 2020 端口隔离
WORKSPACE_DIR="${WORKSPACE_DIR:-$INSTALL_DIR/examples/python-demo}"
DATA_DIR="${DATA_DIR:-$INSTALL_DIR/data}"             # 设置、扩展、布局的持久化目录
SERVICE_NAME="${SERVICE_NAME:-opencode-ide}"
CODE_SERVER_BIN="${CODE_SERVER_BIN:-$RUN_HOME/.local/bin/code-server}"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
OPENCODE_BIN="${OPENCODE_BIN:-$RUN_HOME/.opencode/bin/opencode}"
EXTRA_PATH="${EXTRA_PATH:-$RUN_HOME/.local/bin:$RUN_HOME/.bun/bin}"
BUILD_FIRST="${BUILD_FIRST:-true}"                   # 默认构建最新源码；false：直接部署已有 VSIX
CREDENTIALS_FILE="${CREDENTIALS_FILE:-${OPENCODE_IDE_CREDENTIALS_FILE:-}}" # JSON: username/password
# ============================================================================

fail() { printf '错误：%s\n' "$*" >&2; exit 1; }
while (( $# )); do
  case "$1" in
    --credentials-file) [[ $# -ge 2 && -n "$2" ]] || fail "--credentials-file 需要文件路径"; CREDENTIALS_FILE="$2"; shift 2 ;;
    --help) printf '用法：bash scripts/deploy-service.sh [--credentials-file /path/to/login.json]\n'; exit 0 ;;
    *) fail "未知参数：$1" ;;
  esac
done
if [[ -n "$CREDENTIALS_FILE" ]]; then
  [[ -r "$CREDENTIALS_FILE" ]] || fail "无法读取登录凭据文件"
fi
[[ "$RUN_USER" != root && -n "$RUN_HOME" ]] || fail "请使用普通用户运行，或配置 RUN_USER。"
[[ "$(id -u)" != 0 && "$(id -un)" == "$RUN_USER" ]] || fail "请以 $RUN_USER 运行 bash scripts/deploy-service.sh；脚本自行调用 sudo。"
[[ "$PORT" =~ ^[0-9]+$ ]] && (( PORT > 0 && PORT < 65536 )) || fail "无效 PORT：$PORT"
[[ "$SERVICE_NAME" =~ ^[a-zA-Z0-9_-]+$ ]] || fail "SERVICE_NAME 仅允许字母、数字、横线和下划线。"
for value in "$INSTALL_DIR" "$SOURCE_DIR" "$WORKSPACE_DIR" "$DATA_DIR" "$BIND_HOST" "$EXTRA_PATH"; do
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || fail "配置项不能包含换行。"
done
INSTALL_DIR="$(realpath -m "$INSTALL_DIR")"
SOURCE_DIR="$(realpath -m "$SOURCE_DIR")"
DATA_DIR="$(realpath -m "$DATA_DIR")"
if [[ -z "$CREDENTIALS_FILE" && -e "$SOURCE_DIR/config/ide-login.json" ]]; then
  CREDENTIALS_FILE="$SOURCE_DIR/config/ide-login.json"
fi
if [[ -n "$CREDENTIALS_FILE" ]]; then
  [[ -r "$CREDENTIALS_FILE" ]] || fail "无法读取登录凭据文件"
  CREDENTIALS_FILE="$(realpath "$CREDENTIALS_FILE")"
fi
[[ "$INSTALL_DIR" != / && "$INSTALL_DIR" != "$RUN_HOME" && "$INSTALL_DIR" != "$SOURCE_DIR" ]] || fail "INSTALL_DIR 必须为独立子目录。"
case "$INSTALL_DIR/" in "$SOURCE_DIR/"*) fail "部署目录不能放在源码目录内部。";; esac
[[ -x "$CODE_SERVER_BIN" && -x "$NODE_BIN" && -x "$OPENCODE_BIN" ]] || fail "请检查 CODE_SERVER_BIN、NODE_BIN、OPENCODE_BIN 路径。"
for tool in systemctl rsync sha256sum python3; do command -v "$tool" >/dev/null || fail "缺少命令：$tool"; done
export PATH="$(dirname "$NODE_BIN"):$(dirname "$OPENCODE_BIN"):$EXTRA_PATH:/usr/local/bin:/usr/bin:/bin"
# These variables belong to an enclosing editor process, not this standalone CLI.
unset CODE_SERVER_PARENT_PID VSCODE_IPC_HOOK_CLI CODE_SERVER_SESSION_SOCKET ELECTRON_RUN_AS_NODE

if [[ -e "$INSTALL_DIR" && ! -f "$INSTALL_DIR/.opencode-ide-installation" ]]; then
  [[ -z "$(ls -A "$INSTALL_DIR")" ]] || fail "部署目录已有其它文件：$INSTALL_DIR。请选择空目录。"
fi
mkdir -p "$INSTALL_DIR" "$DATA_DIR" "$DATA_DIR/user-data/User" "$DATA_DIR/extensions"
chmod 700 "$DATA_DIR"
touch "$INSTALL_DIR/.opencode-ide-installation"
printf '部署目录：%s\n监听地址：%s:%s\n系统服务，运行用户：%s（需要 WebUI 登录，不设置开机自启）\n' "$INSTALL_DIR" "$BIND_HOST" "$PORT" "$RUN_USER"

if [[ "$BUILD_FIRST" == true ]]; then
  # 按源码内容判断是否需要构建；无变更时直接同步并重启。
  source_hash="$(python3 - "$SOURCE_DIR" <<'PY'
import hashlib, os, pathlib, sys
root = pathlib.Path(sys.argv[1])
files = [root / name for name in ['package.json', 'package-lock.json', 'scripts/build.mjs']]
for directory in ['scripts', 'ide-integration', 'opencode-extension']:
    base = root / directory
    for directory_path, directories, names in os.walk(base, followlinks=False):
        directories[:] = [name for name in directories if name not in {'node_modules', 'dist', '.git', '.memory', 'opencode'}]
        files += [pathlib.Path(directory_path) / name for name in names if (pathlib.Path(directory_path) / name).is_file() and not (pathlib.Path(directory_path) / name).is_symlink()]
digest = hashlib.sha256()
for file in sorted(set(files)):
    digest.update(str(file.relative_to(root)).encode())
    digest.update(file.read_bytes())
print(digest.hexdigest())
PY
)"
  previous_hash=""
  [[ ! -f "$DATA_DIR/build-source.sha256" ]] || read -r previous_hash < "$DATA_DIR/build-source.sha256"
  if [[ "$source_hash" != "$previous_hash" || ! -f "$SOURCE_DIR/artifacts/opencode-ide-chat.vsix" || ! -f "$SOURCE_DIR/artifacts/opencode-ide-integration.vsix" ]]; then
    lock_hash="$(sha256sum "$SOURCE_DIR/package-lock.json" | cut -d' ' -f1)"
    installed_lock=""
    [[ ! -f "$SOURCE_DIR/node_modules/.opencode-ide-lock" ]] || read -r installed_lock < "$SOURCE_DIR/node_modules/.opencode-ide-lock"
    if [[ "$lock_hash" != "$installed_lock" ]]; then
      ( cd "$SOURCE_DIR"; npm ci )
      printf '%s\n' "$lock_hash" > "$SOURCE_DIR/node_modules/.opencode-ide-lock"
    fi
    ( cd "$SOURCE_DIR"; npm run build )
    printf '%s\n' "$source_hash" > "$DATA_DIR/build-source.sha256"
  else
    printf '源码未变化，跳过构建。\n'
  fi
fi
OPENCODE_IDE_DATA_DIR="$DATA_DIR" OPENCODE_IDE_CREDENTIALS_FILE="$CREDENTIALS_FILE" OPENCODE_IDE_USERNAME="${OPENCODE_IDE_USERNAME:-}" OPENCODE_IDE_PASSWORD="${OPENCODE_IDE_PASSWORD:-}" "$NODE_BIN" "$SOURCE_DIR/scripts/configure-auth.mjs"
for artifact in opencode-ide-chat opencode-ide-integration; do
  [[ -f "$SOURCE_DIR/artifacts/$artifact.vsix" ]] || fail "缺少 $artifact.vsix；设置 BUILD_FIRST=true。"
done

# 只更新程序与文档；不复制源码 .runtime、凭据、node_modules，也不覆盖部署项目。
for folder in scripts config docs; do
  mkdir -p "$INSTALL_DIR/$folder"
  excludes=(--exclude='.*' --exclude='login.json' --exclude='ide-login.json' --exclude='credentials.json')
  case "$CREDENTIALS_FILE" in "$SOURCE_DIR/$folder/"*) excludes+=(--exclude="/${CREDENTIALS_FILE#"$SOURCE_DIR/$folder/"}");; esac
  rsync -a "${excludes[@]}" "$SOURCE_DIR/$folder/" "$INSTALL_DIR/$folder/"
done
rsync -a "$SOURCE_DIR/README.md" "$SOURCE_DIR/Install.md" "$SOURCE_DIR/LICENSE" "$INSTALL_DIR/"
mkdir -p "$INSTALL_DIR/artifacts" "$INSTALL_DIR/examples/python-demo/.vscode"
rsync -a "$SOURCE_DIR/artifacts/opencode-ide-chat.vsix" "$SOURCE_DIR/artifacts/opencode-ide-integration.vsix" "$INSTALL_DIR/artifacts/"
for file in main.py data.csv README.md .vscode/tasks.json; do
  [[ -e "$INSTALL_DIR/examples/python-demo/$file" ]] || cp "$SOURCE_DIR/examples/python-demo/$file" "$INSTALL_DIR/examples/python-demo/$file"
done
[[ -d "$WORKSPACE_DIR" || -f "$WORKSPACE_DIR" ]] || fail "工作区不存在：$WORKSPACE_DIR"

# Public gateway enforces the WebUI account; the private workbench is bound to loopback.
export DATA_DIR BIND_HOST PORT OPENCODE_BIN INSTALL_DIR
python3 - <<'PY'
import json, os, pathlib
data = pathlib.Path(os.environ['DATA_DIR'])
config = data / 'code-server.yaml'
settings = {'bind-addr': f"{os.environ['BIND_HOST']}:{os.environ['PORT']}", 'auth': 'none', 'cert': False}
# Preserve a manually configured exact origin allowlist across deployments.
# Reverse proxies should forward Host with its original port ($http_host).
existing = config.read_text() if config.exists() else ''
import re
trusted = re.search(r'^trusted-origins: (\[[^\n]*\])$', existing, re.M)
if trusted:
    settings['trusted-origins'] = json.loads(trusted.group(1))
config.write_text(''.join(f'{key}: {json.dumps(value)}\n' for key, value in settings.items()))
config.chmod(0o600)
user_settings = data / 'user-data/User/settings.json'
defaults = json.loads((pathlib.Path(os.environ['INSTALL_DIR']) / 'config/settings.json').read_text())
current = json.loads(user_settings.read_text()) if user_settings.exists() else {}
for key, value in defaults.items():
    current.setdefault(key, value)
current.update({'opencode-ide.initializeLayout': True, 'chat.disableAIFeatures': True,
    'workbench.view.alwaysShowHeaderActions': True})
current.setdefault('opencode-ide-chat.opencodePath', os.environ['OPENCODE_BIN'])
user_settings.write_text(json.dumps(current, indent=2) + '\n')
user_settings.chmod(0o600)
PY

for artifact in opencode-ide-chat opencode-ide-integration; do
  artifact_hash="$(sha256sum "$INSTALL_DIR/artifacts/$artifact.vsix" | cut -d' ' -f1)"
  installed_hash=""
  [[ ! -f "$DATA_DIR/$artifact.sha256" ]] || read -r installed_hash < "$DATA_DIR/$artifact.sha256"
  if [[ "$artifact_hash" != "$installed_hash" ]]; then
    "$CODE_SERVER_BIN" --user-data-dir "$DATA_DIR/user-data" --extensions-dir "$DATA_DIR/extensions" --install-extension "$INSTALL_DIR/artifacts/$artifact.vsix" --force
    printf '%s\n' "$artifact_hash" > "$DATA_DIR/$artifact.sha256"
  else
    printf '%s 未变化，跳过安装。\n' "$artifact"
  fi
done
"$NODE_BIN" "$INSTALL_DIR/scripts/remove-legacy-chat.mjs" "$CODE_SERVER_BIN" "$DATA_DIR/user-data" "$DATA_DIR/extensions"

# 生成独立启动器和 systemd unit，路径中的空格、引号及 % 均正确转义。
export RUN_USER RUN_HOME NODE_BIN CODE_SERVER_BIN WORKSPACE_DIR SERVICE_NAME EXTRA_PATH
python3 - <<'PY'
import json, os, pathlib, shlex
install = pathlib.Path(os.environ['INSTALL_DIR'])
def q(value):
    return json.dumps(value).replace('%', '%%')
env = {
    'HOME': os.environ['RUN_HOME'],
    'PATH': os.environ['PATH'],
    'CODE_SERVER_BIN': os.environ['CODE_SERVER_BIN'],
    'OPENCODE_IDE_DATA_DIR': os.environ['DATA_DIR'],
    'OPENCODE_IDE_EXTENSIONS_DIR': str(pathlib.Path(os.environ['DATA_DIR']) / 'extensions'),
    'OPENCODE_IDE_USER_DATA_DIR': str(pathlib.Path(os.environ['DATA_DIR']) / 'user-data'),
    'OPENCODE_IDE_CODE_CLI': os.environ['CODE_SERVER_BIN'],
    'VSCODE_AGENT_FOLDER': str(pathlib.Path(os.environ['RUN_HOME']) / '.vscode-server'),
    'OPENCODE_IDE_BIND': f"{os.environ['BIND_HOST']}:{os.environ['PORT']}",
}
launcher = '#!/usr/bin/env bash\nset -euo pipefail\n'
launcher += 'unset PASSWORD HASHED_PASSWORD\n'
launcher += '\n'.join(f'export {key}={shlex.quote(value)}' for key, value in env.items()) + '\n'
launcher += f'exec {shlex.quote(os.environ["NODE_BIN"])} {shlex.quote(str(install / "scripts/start.mjs"))} {shlex.quote(os.environ["WORKSPACE_DIR"])}\n'
start = install / 'start-service.sh'
start.write_text(launcher)
start.chmod(0o755)
unit = '[Unit]\nDescription=OpenCode IDE Web\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=simple\n'
unit += f'User={os.environ["RUN_USER"]}\n'
unit += f'WorkingDirectory={str(install).replace("%", "%%")}\nExecStart={q(str(start))}\n'
unit += 'Restart=on-failure\nRestartSec=5\nTimeoutStopSec=30\nKillMode=control-group\nUMask=0077\n'
unit += '\n[Install]\nWantedBy=multi-user.target\n'
(install / (os.environ['SERVICE_NAME'] + '.service')).write_text(unit)
metadata = {key: os.environ[key] for key in ['INSTALL_DIR','DATA_DIR','WORKSPACE_DIR','PORT','BIND_HOST','SERVICE_NAME','RUN_USER']}
metadata.update(service_type='system', auth='cookie-session', enable_on_boot='managed by systemctl enable/disable')
(install / 'deployment.json').write_text(json.dumps(metadata, indent=2) + '\n')
PY

unit_file="$INSTALL_DIR/$SERVICE_NAME.service"
if ! sudo -n true 2>/dev/null; then
  if [[ -t 0 ]]; then sudo -v
  else fail "部署文件已准备完成；安装/重启系统服务需要 sudo 密码，请在终端执行 bash scripts/deploy-service.sh。"; fi
fi
sudo install -m 644 "$unit_file" "/etc/systemd/system/$SERVICE_NAME.service"
sudo systemctl daemon-reload
# 迁移旧版脚本生成的用户服务，避免两个实例占用同一端口。
if [[ -f "$RUN_HOME/.config/systemd/user/$SERVICE_NAME.service" ]]; then
  # SSH / IDE terminals may not inherit the user manager's D-Bus environment.
  service_user_runtime="/run/user/$(id -u "$RUN_USER")"
  [[ -S "$service_user_runtime/bus" ]] || fail "找不到 $RUN_USER 的用户总线：$service_user_runtime/bus。请通过该用户的登录会话执行部署，以便安全停止旧用户服务。"
  env XDG_RUNTIME_DIR="$service_user_runtime" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=$service_user_runtime/bus" \
    systemctl --user disable --now "$SERVICE_NAME.service"
fi
sudo systemctl restart "$SERVICE_NAME.service"
sudo systemctl is-active --quiet "$SERVICE_NAME.service"
status_command="sudo systemctl"
python3 - "$PORT" <<'PY'
import sys, time, urllib.request
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
url = f'http://127.0.0.1:{sys.argv[1]}/healthz'
for attempt in range(20):
    try:
        with opener.open(url, timeout=2) as response:
            if response.status == 200:
                print('服务 HTTP 健康检查通过')
                break
    except Exception:
        time.sleep(1)
else:
    raise SystemExit('服务未通过健康检查，请检查 systemd 日志和端口占用。')
PY
printf '\n部署完成，登录认证已启用，HTTP 监听 %s:%s\n其它机器访问：http://服务器IP:%s/\n状态：%s status %s\n重启：%s restart %s\n' "$BIND_HOST" "$PORT" "$PORT" "$status_command" "$SERVICE_NAME" "$status_command" "$SERVICE_NAME"
