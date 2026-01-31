#!/bin/bash
#
# CORRECTED Tracking Server Setup Script for Ubuntu 22.04
# Fixes DNS issues and uses reliable package sources
#
# Usage: sudo bash setup-fixed.sh YOUR_DOMAIN YOUR_DB_HOST YOUR_DB_PASSWORD

set -e  # Exit on error

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Fixed Tracking Server Setup ===${NC}"

# Check root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (use sudo)"
    exit 1
fi

# Parameters
TRACKING_DOMAIN=${1:-"track.yourdomain.com"}
DB_HOST=${2:-"your-backend-ip"}
DB_PASSWORD=${3:-"gmailsaas123"}

echo -e "${YELLOW}Domain: $TRACKING_DOMAIN${NC}"
echo -e "${YELLOW}Database: $DB_HOST${NC}"

# FIX DNS FIRST (Critical step)
echo -e "${GREEN}[1/11] Fixing DNS configuration...${NC}"
cat > /etc/resolv.conf <<EOF
nameserver 8.8.8.8
nameserver 8.8.4.4
nameserver 1.1.1.1
EOF

# Make DNS persistent
chattr +i /etc/resolv.conf 2>/dev/null || true

# Test DNS
echo "Testing DNS..."
ping -c 2 google.com || echo "Warning: DNS might still have issues"

# Fix package sources to use main Ubuntu mirrors
echo -e "${GREEN}[2/11] Configuring package sources...${NC}"
cp /etc/apt/sources.list /etc/apt/sources.list.backup 2>/dev/null || true
cat > /etc/apt/sources.list <<EOF
deb http://archive.ubuntu.com/ubuntu jammy main restricted universe multiverse
deb http://archive.ubuntu.com/ubuntu jammy-updates main restricted universe multiverse
deb http://archive.ubuntu.com/ubuntu jammy-security main restricted universe multiverse
deb http://archive.ubuntu.com/ubuntu jammy-backports main restricted universe multiverse
EOF

# Update with timeout protection
echo -e "${GREEN}[3/11] Updating package lists...${NC}"
export DEBIAN_FRONTEND=noninteractive
timeout 300 apt-get update || {
    echo "Timeout or error - trying alternative mirror..."
    cat > /etc/apt/sources.list <<EOF
deb http://us.archive.ubuntu.com/ubuntu jammy main restricted universe multiverse
deb http://us.archive.ubuntu.com/ubuntu jammy-updates main restricted universe multiverse
deb http://security.ubuntu.com/ubuntu jammy-security main restricted universe multiverse
EOF
    timeout 300 apt-get update
}

# Upgrade system
echo -e "${GREEN}[4/11] Upgrading system packages...${NC}"
apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"

# Install Python
echo -e "${GREEN}[5/11] Installing Python 3.10...${NC}"
apt-get install -y python3.10 python3.10-venv python3-pip software-properties-common

# Install Nginx
echo -e "${GREEN}[6/11] Installing Nginx...${NC}"
apt-get install -y nginx

# Install Redis
echo -e "${GREEN}[7/11] Installing Redis...${NC}"
apt-get install -y redis-server
systemctl enable redis-server
systemctl start redis-server

# Install Certbot
echo -e "${GREEN}[8/11] Installing Certbot for SSL...${NC}"
apt-get install -y certbot python3-certbot-nginx

# Configure firewall
echo -e "${GREEN}[9/11] Configuring firewall...${NC}"
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Setup application directory
echo -e "${GREEN}[10/11] Setting up application...${NC}"
mkdir -p /opt/tracking-server/app
cd /opt/tracking-server

# Copy tracking-server files if they exist in /tmp
if [ -d "/tmp/tracking-server" ]; then
    cp -r /tmp/tracking-server/* /opt/tracking-server/ 2>/dev/null || true
fi

# Create virtual environment
python3.10 -m venv venv
source venv/bin/activate

# Install Python packages
pip install --upgrade pip --no-cache-dir
pip install --no-cache-dir fastapi==0.109.0 uvicorn[standard]==0.27.0 \
    sqlalchemy==2.0.25 asyncpg==0.29.0 psycopg2-binary==2.9.9 \
    pydantic==2.5.3 pydantic-settings==2.1.0 cryptography==42.0.0 \
    geoip2==4.7.0 user-agents==2.2.0 redis==5.0.1 python-multipart==0.0.6

# Download GeoIP database
echo -e "${GREEN}[11/11] Downloading GeoIP database...${NC}"
mkdir -p /usr/share/GeoIP
cd /usr/share/GeoIP
wget -q -O GeoLite2-City.mmdb https://github.com/P3TERX/GeoLite.mmdb/raw/download/GeoLite2-City.mmdb || \
    curl -sL -o GeoLite2-City.mmdb https://github.com/P3TERX/GeoLite.mmdb/raw/download/GeoLite2-City.mmdb
chmod 644 GeoLite2-City.mmdb

cd /opt/tracking-server

# Create environment file
cat > .env <<EOL
DATABASE_URL=postgresql://gmailsaas:${DB_PASSWORD}@${DB_HOST}:5432/gmail_saas
REDIS_URL=redis://localhost:6379/1
ENCRYPTION_KEY=your-encryption-key-32-bytes-long
GEOIP_DB_PATH=/usr/share/GeoIP/GeoLite2-City.mmdb
TRACKING_DOMAIN=${TRACKING_DOMAIN}
IP_SALT=$(openssl rand -hex 16)
EOL

# Create systemd service
cat > /etc/systemd/system/tracking-server.service <<'EOL'
[Unit]
Description=Email Tracking Server
After=network.target redis-server.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/tracking-server
Environment="PATH=/opt/tracking-server/venv/bin"
ExecStart=/opt/tracking-server/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8001 --workers 4
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOL

# Configure Nginx
cat > /etc/nginx/sites-available/tracking <<EOL
server {
    listen 80;
    server_name ${TRACKING_DOMAIN};
    
    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOL

ln -sf /etc/nginx/sites-available/tracking /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx

# Start tracking server
systemctl daemon-reload
systemctl enable tracking-server
systemctl start tracking-server

echo -e "${GREEN}=== Setup Complete! ===${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Ensure DNS: ${TRACKING_DOMAIN} -> $(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_SERVER_IP')"
echo "2. Wait 5-30 minutes for DNS propagation"
echo "3. Run: sudo certbot --nginx -d ${TRACKING_DOMAIN}"
echo "4. Test: curl http://${TRACKING_DOMAIN}/health"
echo ""
echo -e "${GREEN}Service Status:${NC}"
systemctl status tracking-server --no-pager || true
