#!/bin/bash
# First boot: Node 22, Caddy, the app from GitHub, two systemd services.
# Rendered by Terraform templatefile(); $${...} escapes shell variables.
set -euxo pipefail

# Downloads retry: a reset connection on the first boot left the instance half built.
fetch() { curl -fsSL --retry 6 --retry-delay 5 --retry-all-errors "$@"; }

# Node 22 from the official tarball (the distro package lags behind).
NODE_DIR=/opt/node
mkdir -p "$NODE_DIR"
NODE_TAR=$(fetch https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | awk '/linux-x64.tar.xz$/ {print $2}')
fetch -o /var/tmp/node.tar.xz "https://nodejs.org/dist/latest-v22.x/$${NODE_TAR}"
tar -xJf /var/tmp/node.tar.xz -C "$NODE_DIR" --strip-components=1

# Caddy single binary from the official download endpoint.
fetch -o /usr/local/bin/caddy "https://caddyserver.com/api/download?os=linux&arch=amd64"
chmod 755 /usr/local/bin/caddy
# Caddy faces the internet, so it runs as its own user, never root.
useradd --system --home /var/lib/caddy --shell /sbin/nologin caddy || true

dnf install -y git
useradd --system --home /opt/acompana --shell /sbin/nologin acompana || true
[ -d /opt/acompana/app/.git ] || git clone --depth 1 ${repo_url} /opt/acompana/app
chown -R acompana:acompana /opt/acompana

# The key is read at every start, so setting or rotating it only needs a restart.
cat > /opt/acompana/run.sh <<'RUN'
#!/bin/bash
set -euo pipefail
KEY=$(aws ssm get-parameter --region ${region} --name ${key_parameter} --with-decryption --query Parameter.Value --output text 2>/dev/null || true)
if [ -n "$KEY" ] && [ "$KEY" != "None" ]; then export OLLAMA_API_KEY="$KEY"; fi
# Shared app key: with it set, every API call except /api/health needs X-App-Key.
APP=$(aws ssm get-parameter --region ${region} --name ${app_key_parameter} --with-decryption --query Parameter.Value --output text 2>/dev/null || true)
if [ -n "$APP" ] && [ "$APP" != "None" ]; then export APP_KEY="$APP"; fi
export PORT=8787 HOST=127.0.0.1
# Abuse limits: 100 model calls a day in total, 50 per client IP, and only the app may call from a browser.
export AI_DAILY_LIMIT=100 AI_DAILY_PER_IP=50
export ALLOWED_ORIGINS="https://localhost,capacitor://localhost"
exec /opt/node/bin/node /opt/acompana/app/server/server.js
RUN
chmod 750 /opt/acompana/run.sh
chown acompana:acompana /opt/acompana/run.sh

cat > /etc/systemd/system/acompana.service <<'UNIT'
[Unit]
Description=Acompana API
After=network-online.target
Wants=network-online.target

[Service]
User=acompana
WorkingDirectory=/opt/acompana/app
ExecStart=/opt/acompana/run.sh
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
UNIT

mkdir -p /etc/caddy
cat > /etc/caddy/Caddyfile <<CADDY
${domain} {
  encode gzip
  reverse_proxy 127.0.0.1:8787
}
CADDY

cat > /etc/systemd/system/caddy.service <<'UNIT'
[Unit]
Description=Caddy
After=network-online.target
Wants=network-online.target

[Service]
User=caddy
Group=caddy
ExecStart=/usr/local/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
Restart=always
Environment=HOME=/var/lib/caddy
StateDirectory=caddy
# Only the right to bind ports 80 and 443, nothing else from root.
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now acompana.service caddy.service
