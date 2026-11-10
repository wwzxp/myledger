#!/usr/bin/env bash
# myledger 一键部署（Ubuntu / Debian）
#
#   curl -fsSL https://raw.githubusercontent.com/<你的仓库>/main/scripts/install.sh | sudo bash
#   # 或本地：sudo bash scripts/install.sh
#
# 干的事：
#   1. 装系统依赖（Python 3.11+；不够就地编译，不动系统自带的 3.10）
#   2. 建 ledger 系统账号，数据放 /var/lib/myledger（700，只有服务自己能读）
#   3. venv + pip 装应用
#   4. 写配置、systemd 单元，开机自启
#   5. 打印访问地址与初始管理员密码
#
# 所有可改项都在下面的变量里；不需要环境变量，直接改这个文件或传参。
set -Eeuo pipefail

APP_USER="${APP_USER:-myledger}"
APP_HOME="${APP_HOME:-/opt/myledger}"
DATA_DIR="${DATA_DIR:-/var/lib/myledger}"
CONF_DIR="${CONF_DIR:-/etc/myledger}"
CONF="$CONF_DIR/myledger.toml"
PORT="${PORT:-8765}"
HOST_BIND="${HOST_BIND:-127.0.0.1}"
PY_VERSION="3.11.9"
PIP_INDEX="${PIP_INDEX:-https://pypi.tuna.tsinghua.edu.cn/simple}"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m  ✗ %s\033[0m\n' "$*" >&2; exit 1; }

trap 'die "第 $LINENO 行失败，安装中止"' ERR

[ "$(id -u)" -eq 0 ] || die "请用 root 运行：sudo bash $0"

say "系统检查"
. /etc/os-release
case "$ID" in
  ubuntu|debian) ok "$PRETTY_NAME" ;;
  *) die "此脚本只覆盖 Ubuntu/Debian，当前是 $ID。可参考 docs/跨平台部署.md 手动安装。" ;;
esac
ARCH="$(uname -m)"
ok "架构 $ARCH，内存 $(free -m | awk '/^Mem:/{print $2}') MB，磁盘可用 $(df -h / | awk 'NR==2{print $4}')"

say "安装系统依赖"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends \
  build-essential zlib1g-dev libssl-dev libffi-dev \
  libbz2-dev libreadline-dev libsqlite3-dev liblzma-dev \
  curl ca-certificates libncurses-dev 2>&1 | tail -2
ok "编译工具链就绪"

# ── Python：只用独立的 3.11，不动系统的 3.10 ──────────────────
PYBIN=""
for cand in python3.13 python3.12 python3.11; do
  if command -v "$cand" >/dev/null 2>&1; then
    major_minor="$("$cand" -c 'import sys;print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
    case "$major_minor" in
      3.11|3.12|3.13) PYBIN="$(command -v "$cand")"; break ;;
    esac
  fi
done

if [ -z "$PYBIN" ]; then
  say "安装独立 Python 3.11（uv，预编译二进制，不编译）"
  if ! command -v uv >/dev/null 2>&1; then
    curl -fsSL https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/opt/uv sh >/dev/null 2>&1 \
      || die "uv 安装失败，检查网络"
  fi
  # 官方安装脚本把二进制直接放在 UV_INSTALL_DIR 下（不是 bin/）
  UVBIN="$(command -v uv || true)"
  [ -n "$UVBIN" ] || UVBIN=/opt/uv/uv
  [ -x "$UVBIN" ] || die "找不到 uv 可执行文件"
  # 装到 /opt，缓存也放 E 盘之外的系统目录；不碰系统 Python
  export UV_PYTHON_INSTALL_DIR=/opt/uv-python
  "$UVBIN" python install 3.11 --no-bin >/dev/null 2>&1 || die "uv 安装 Python 3.11 失败"
  PYBIN="$(find /opt/uv-python -name 'python3.11' -type f -perm -u+x | head -1)"
  [ -n "$PYBIN" ] || die "找不到 uv 装的 python3.11"
  ok "Python 就绪：$PYBIN（$("$PYBIN" --version)）"
else
  ok "使用已有 $PYBIN（$("$PYBIN" --version)）"
fi

say "创建服务账号"
if id -u "$APP_USER" >/dev/null 2>&1; then
  ok "账号 $APP_USER 已存在"
else
  useradd --system --home "$APP_HOME" --shell /usr/sbin/nologin "$APP_USER"
  ok "已创建系统账号 $APP_USER"
fi

say "目录与权限"
install -d -m 755 -o root -g root "$APP_HOME"
install -d -m 700 -o "$APP_USER" -g "$APP_USER" "$DATA_DIR"
install -d -m 750 -o root -g "$APP_USER" "$CONF_DIR"
ok "$DATA_DIR 权限 700（只有 $APP_USER 可读）"

say "安装应用"
rm -rf "$APP_HOME/src"
mkdir -p "$APP_HOME/src"
# 排除虚拟环境、数据目录、.git —— 只拷源码
tar -C "$SRC_DIR" -cf - \
  --exclude=.venv --exclude=node_modules --exclude=data --exclude=.git \
  --exclude=__pycache__ --exclude='*.pyc' --exclude=.deploy \
  . 2>/dev/null | tar -C "$APP_HOME/src" -xf -
[ -f "$APP_HOME/src/pyproject.toml" ] || die "源码目录不对：$SRC_DIR 里没有 pyproject.toml"

if [ ! -x "$APP_HOME/venv/bin/python" ]; then
  "$PYBIN" -m venv "$APP_HOME/venv"
fi
"$APP_HOME/venv/bin/pip" install --upgrade pip -q -i "$PIP_INDEX" 2>&1 | tail -1
"$APP_HOME/venv/bin/pip" install -q -i "$PIP_INDEX" "$APP_HOME/src" 2>&1 | tail -2
chown -R root:"$APP_USER" "$APP_HOME/venv" "$APP_HOME/src"
ok "应用已安装"

say "写入配置"
if [ ! -f "$CONF" ]; then
  SECRET="$("$APP_HOME/venv/bin/python" -c 'import secrets;print(secrets.token_urlsafe(32))')"
  cat > "$CONF" <<EOF
# myledger 配置。改完执行：systemctl restart myledger
[database]
path = "$DATA_DIR/ledger.db"

[backup]
enabled = true
directory = "$DATA_DIR/backups"
keep = 14
interval_minutes = 60

[mail]
# 加密邮箱授权码的主密钥；丢了这个密钥，已保存的授权码就解不开了
secret_key = "$SECRET"
enabled = false
EOF
  chown root:"$APP_USER" "$CONF"
  chmod 640 "$CONF"
  ok "已生成 $CONF"
else
  ok "配置已存在，保留不覆盖：$CONF"
fi

say "systemd 服务"
cat > /etc/systemd/system/myledger.service <<EOF
[Unit]
Description=AI Ledger
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$DATA_DIR
ExecStart=$APP_HOME/venv/bin/myledger --config $CONF dashboard --host $HOST_BIND --port $PORT
Restart=always
RestartSec=3
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA_DIR

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable myledger >/dev/null 2>&1
systemctl restart myledger
sleep 4
systemctl is-active --quiet myledger || {
  journalctl -u myledger -n 40 --no-pager
  die "服务没起来，日志见上"
}
ok "服务已启动并设为开机自启"

say "自检"
for i in $(seq 1 15); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/login" || true)"
  [ "$CODE" = "200" ] && break
  sleep 1
done
[ "$CODE" = "200" ] || die "自检失败：/login 返回 $CODE"
ok "GET /login -> 200"

ADMIN_PW="$(journalctl -u myledger --no-pager -n 200 | grep -oE '初始密码[:：][[:space:]]*\S+' | tail -1 | sed 's/.*[:：][[:space:]]*//' || true)"

IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"

cat <<EOF

────────────────────────────────────────────────────────
 部署完成
────────────────────────────────────────────────────────
 访问地址   http://$IP:$PORT
 用户名     admin
 初始密码   ${ADMIN_PW:-（见日志：journalctl -u myledger | grep 初始密码）}

 常用命令
   systemctl status myledger     查看状态
   systemctl restart myledger    重启
   journalctl -u myledger -f     看日志

 数据位置   $DATA_DIR（权限 700，只有 $APP_USER 能读）
 配置文件   $CONF

 ⚠ 当前是 HTTP 明文且监听 $HOST_BIND。
   公网访问请配 nginx + TLS，见 docs/跨平台部署.md。
────────────────────────────────────────────────────────
EOF
