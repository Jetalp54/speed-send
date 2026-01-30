#!/bin/bash

# ==========================================
# 🚀 SPEED SEND - TRACKING SERVER SETUP
# ==========================================
# Run this on your SECOND Ubuntu Server (Server B)
# It will configure this machine to handle tracking links ONLY.

set -e

echo "📦 Installing Dependencies..."
apt-get update && apt-get install -y git curl

# 1. Install Docker if missing
if ! command -v docker &> /dev/null
then
    echo "🐳 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    echo "✅ Docker Installed"
else
    echo "✅ Docker already installed"
fi

# 2. Setup Directory
INSTALL_DIR="/opt/speed-send-tracking"
mkdir -p $INSTALL_DIR
cd $INSTALL_DIR

# 3. Clone/Update Code
if [ -d ".git" ]; then
    echo "🔄 Updating Code..."
    git pull origin main
else
    echo "📥 Cloning Repository..."
    git clone https://github.com/Jetalp54/speed-send.git .
fi

# 4. Configuration
echo ""
echo "=========================================="
echo "🔧 CONFIGURATION (Check Main Server .env)"
echo "=========================================="

if [ ! -f .env ]; then
    echo "We need to connect to your MAIN application database."
    read -p "Main Server IP (Where DB is): " MAIN_IP
    read -p "DB Password (POSTGRES_PASSWORD): " DB_PASS
    
    cat <<EOF > .env
# Database Connection to Main Server
DATABASE_URL=postgresql://gmailsaas:${DB_PASS}@${MAIN_IP}:5432/gmail_saas

# Security Keys (Must match Main Server)
SECRET_KEY=change_me_to_match_main_server
ENCRYPTION_KEY=change_me_to_match_main_server

# Environment
ENVIRONMENT=production
EOF
    echo "✅ .env file created!"
    echo "⚠️  IMPORTANT: Please manually verify SECRET_KEY matches your main server if you use signed tokens!"
else
    echo "✅ .env file already exists. Skipping config."
fi

# 5. Launch
echo ""
echo "🚀 Launching Tracking Node..."
docker compose -f docker-compose.tracking.yml up -d --build --force-recreate

echo ""
echo "=========================================="
echo "✅ SETUP COMPLETE!"
echo "=========================================="
echo "Next Steps:"
echo "1. Ensure MAIN SERVER firewall allows port 5432 from this IP."
echo "2. Point your domain (track.equityflow.cv) to THIS server's IP."
echo "3. Test a link!"
