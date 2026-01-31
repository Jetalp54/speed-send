#!/bin/bash
#
# Tracking Server Setup Script for Ubuntu 22.04
# This script installs and configures the tracking server
#
# Usage: sudo bash setup.sh YOUR_DOMAIN YOUR_DB_HOST YOUR_DB_PASSWORD

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Email Tracking Server Setup ===${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root (use sudo)${NC}"
    exit 1
fi

# Get parameters
TRACKING_DOMAIN=${1:-"track.yourdomain.com"}
DB_HOST=${2:-"your-backend-ip"}
DB_PASSWORD=${3:-"gmailsaas123"}

echo -e "${YELLOW}Domain: $TRACKING_DOMAIN${NC}"
echo -e "${YELLOW}Database Host: $DB_HOST${NC}"

# Update system
echo -e "${GREEN}[1/10] Updating system packages...${NC}"
apt-get update
apt-get upgrade -y

# Install Python 3.10+
echo -e "${GREEN}[2/10] Installing Python 3.10...${NC}"
apt-get install -y python3.10 python3.10-venv python3-pip

# Install Nginx
echo -e "${GREEN}[3/10] Installing Nginx...${NC}"
apt-get install -y nginx

# Install Redis
echo -e "${GREEN}[4/10] Installing Redis...${NC}"
apt-get install -y redis-server
systemctl enable redis-server
systemctl start redis-server

# Install Certbot for SSL
echo -e "${GREEN}[5/10] Installing Certbot...${NC}"
apt-get install -y certbot python3-certbot-nginx

# Configure firewall
echo -e "${GREEN}[6/10] Configuring firewall...${NC}"
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Create app directory
echo -e "${GREEN}[7/10] Setting up application...${NC}"
mkdir -p /opt/tracking-server
cd /opt/tracking-server

# Create virtual environment
python3.10 -m venv venv
source venv/bin/activate

# Install Python dependencies
pip install --upgrade pip
pip install fastapi uvicorn[standard] sqlalchemy asyncpg psycopg2-binary \
    pydantic pydantic-settings cryptography geoip2 user-agents redis python-multipart

# Download GeoIP database
echo -e "${GREEN}[8/10] Downloading GeoIP database...${NC}"
mkdir -p /usr/share/GeoIP
cd /usr/share/GeoIP

# Download GeoLite2 City database (requires MaxMind account for newer versions)
# Using direct download for demo (replace with your MaxMind license key in production)
wget -O GeoLite2-City.tar.gz "https://github.com/P3TERX/GeoLite.mmdb/raw/download/GeoLite2-City.mmdb"
mv GeoLite2-City.mmdb GeoLite2-City.mmdb 2>/dev/null || true
chmod 644 GeoLite2-City.mmdb

cd /opt/tracking-server

# Create environment file
echo -e "${GREEN}[9/10] Creating environment configuration...${NC}"
cat > .env <<EOL
DATABASE_URL=postgresql://gmailsaas:${DB_PASSWORD}@${DB_HOST}:5432/gmail_saas
REDIS_URL=redis://localhost:6379/1
ENCRYPTION_KEY=your-encryption-key-32-bytes-long
GEOIP_DB_PATH=/usr/share/GeoIP/GeoLite2-City.mmdb
TRACKING_DOMAIN=${TRACKING_DOMAIN}
IP_SALT=$(openssl rand -hex 16)
EOL

# Create systemd service
cat > /etc/systemd/system/tracking-server.service <<EOL
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
echo -e "${GREEN}[10/10] Configuring Nginx...${NC}"
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

echo -e "${GREEN}=== Setup Complete ===${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Point your DNS: ${TRACKING_DOMAIN} -> $(curl -s ifconfig.me)"
echo "2. Wait for DNS propagation (5-30 minutes)"
echo "3. Run: sudo certbot --nginx -d ${TRACKING_DOMAIN}"
echo "4. Test: curl http://${TRACKING_DOMAIN}/health"
echo ""
echo -e "${GREEN}Service status:${NC}"
systemctl status tracking-server --no-pager
