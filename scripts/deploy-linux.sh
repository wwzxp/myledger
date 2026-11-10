#!/usr/bin/env bash
# myledger Linux 部署脚本
#
# 用法（在源码目录执行，会先打包上传）：
#   bash scripts/deploy-linux.sh <host> [domain]
#
# 不带 domain 时只绑回环地址，供 SSH 端口转发验证；
# 带 domain 时额外配置 nginx + Let's Encrypt 证书。
set -euo pipefail

HOST="${1:?用法: deploy-linux.sh <host> [domain]}"
DOMAIN="${2:-}"
APP_USER="ledger"
APP_HOME="/opt/myledger"
DATA_DIR="/var/lib/myledger"
CONF="/etc/myledger/myledger.toml"
PY="python3"

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

say "系统信息"
$PY --version || { echo "需要 Python 3.11+"; exit 1; }
. /etc/os-release && echo "$PRETTY_NAME"

say "创建服务账号 $APP_USER"
id -u "$APP_USER" >/dev/null 2>&1 || \
  useradd --system --home "$APP_HOME" --shell /usr/sbin/nologin "$APP_USER"

say "目录与权限"
install -d -m 755 -o root -g root "$APP_HOME"
install -d -m 700 -o "$APP_USER" -g "$APP_USER" "$DATA_DIR"
install -d -m 750 -o root -g "$APP_USER" "$(dirname "$CONF")"

say "安装依赖"
if [ ! -x "$APP_HOME/venv/bin/python" ]; then
  $PY -m venv "$APP_HOME/venv"
fi
"$APP_HOME/venv/bin/pip" install --upgrade pip --quiet
"$APP_HOME/venv/bin/pip" install "$APP_HOME/src" --quiet
echo "已安装: $("$APP_HOME/venv/bin/myledger" --version 2>/dev/null || echo ok)"

say "配置文件"
if [ ! -f "$CONF" ]; then
  SECRET=$("$APP_HOME/venv/bin/python" -c 'import secrets;print(secrets.token_urlsafe(32))')
  cat > "$CONF" <<EOF
# myledger 配置。数据库与备份都在 $DATA_DIR，该目录只有 $APP_USER 可读。
[database]
path = "$DATA_DIR/ledger.db"

[backup]
enabled = true
directory = "$DATA_DIR/backups"
keep = 14
interval_minutes = 60

[mail]
secret_key = "$SECRET"
enabled = false
EOF
  chown root:"$APP_USER" "$CONF"
  chmod 640 "$CONF"
  echo "已生成 $CONF（含新生成的 mail.secret_key）"
else
  echo "已存在 $CONF，保留不覆盖"
fi

say "systemd 单元"
cat > /etc/systemd/system/myledger.service <<EOF
[Unit]
Description=AI Ledger
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$DATA_DIR
ExecStart=$APP_HOME/venv/bin/myledger --config $CONF
Restart=always
RestartSec=3
# 数据库、备份、邮件附件都按 0077 建，只有本进程可读
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
systemctl enable --now myledger
sleep 3
systemctl is-active --quiet myledger && echo "服务已启动" || {
  echo "服务启动失败，最近日志："
  journalctl -u myledger -n 40 --no-pager
  exit 1
}

say "本机自检"
curl -fsS -o /dev/null -w 'GET /login -> %{http_code}\n' http://127.0.0.1:8765/login

if [ -n "$DOMAIN" ]; then
  say "nginx + TLS"
  . /etc/os-release
  case "$ID" in
    ubuntu|debian) apt-get update -qq && apt-get install -y -qq nginx certbot python3-certbot-nginx ;;
    centos|rocky|almalinux|opencloudos|tencentos) dnf install -y -q nginx certbot python3-certbot-nginx ;;
    *) echo "未知发行版 $ID，请手动安装 nginx 与 certbot"; exit 1 ;;
  esac

  cat > /etc/nginx/conf.d/myledger.conf <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    # 导入大账本时单次请求可能较久
    client_max_body_size 64m;

    location / {
        proxy_pass http://127.0.0.1:8765;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
EOF
  nginx -t && systemctl enable --now nginx && systemctl reload nginx
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
    --register-unsafely-without-email --redirect || \
    echo "证书申请失败（域名未解析到本机？）。HTTP 仍可用。"
fi

say "完成"
echo "服务: systemctl status myledger"
echo "日志: journalctl -u myledger -f"
echo "数据: $DATA_DIR（权限 700，仅 $APP_USER 可读）"
[ -n "$DOMAIN" ] && echo "访问: https://$DOMAIN" || echo "访问: 仅本机，用 ssh -L 8765:127.0.0.1:8765 <host> 转发"
