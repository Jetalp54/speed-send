#!/bin/bash

set -e

# Error recovery function
cleanup_on_error() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        print_error "Deployment failed with exit code $exit_code"
        print_info "Starting error recovery procedures..."
        
        # Stop any partially started containers
        docker compose down --remove-orphans 2>/dev/null || true
        
        # Show recent logs for debugging
        print_info "Recent container logs:"
        docker compose logs --tail=20 2>/dev/null || true
        
        print_info "Recovery completed. Please check the logs above and retry deployment."
    fi
}

# Set up error trap
trap cleanup_on_error EXIT

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m'

# --- Helper Functions ---
print_section() { echo -e "\n${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━\n${WHITE}$1${NC}\n${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; exit 1; }
command_exists() { command -v "$1" >/dev/null 2>&1; }

# --- Sudo detection ---
SUDO_CMD=""
if [ "$(id -u)" -ne 0 ]; then
    print_info "Regular user detected, will use sudo."
    if ! command_exists sudo; then
        print_error "Script requires sudo to be installed for non-root users."
    fi
    SUDO_CMD="sudo"
else
    print_info "Root user detected."
fi

# --- Command Passthrough Handling ---
# Allows running commands like: ./deploy.sh alembic upgrade head
if [ "$1" == "alembic" ]; then
    shift
    print_section "Running Alembic command: $@"
    docker compose exec backend alembic "$@"
    print_success "Alembic command finished."
    exit 0
fi

# --- Main Script ---

# Banner
clear
echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║     Gmail Bulk Sender SaaS - Automated Deployment           ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝${NC}\n"

# Install system dependencies
print_section "📦 System Dependencies"
$SUDO_CMD apt-get update -y
$SUDO_CMD apt-get upgrade -y
$SUDO_CMD apt-get install -y curl wget gnupg2 software-properties-common apt-transport-https ca-certificates lsb-release git ufw jq

# Install Nginx
print_section "🌐 Nginx Setup"
if ! command_exists nginx; then
    print_info "Installing Nginx..."
    $SUDO_CMD apt-get install -y nginx
    print_success "Nginx installed successfully."
else
    print_success "Nginx is already installed."
fi

# Install Docker if not present
print_section "🐳 Docker & Docker Compose Check"
if ! command_exists docker; then
    print_info "Installing Docker..."
    $SUDO_CMD apt-get update -y
    $SUDO_CMD apt-get install -y ca-certificates curl gnupg
    $SUDO_CMD install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | $SUDO_CMD gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    $SUDO_CMD chmod a+r /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
      $SUDO_CMD tee /etc/apt/sources.list.d/docker.list > /dev/null
    $SUDO_CMD apt-get update -y
    $SUDO_CMD apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    print_success "Docker installed successfully."
else
    print_success "Docker is already installed."
fi

# Ensure Docker service is enabled and running
print_info "Enabling and starting Docker service..."
$SUDO_CMD systemctl enable docker
$SUDO_CMD systemctl start docker

# Add current user to docker group (if running with sudo)
CURRENT_USER=${SUDO_USER:-$(whoami)}
if id -nG "$CURRENT_USER" | grep -qw docker; then
  print_success "User $CURRENT_USER is already in 'docker' group."
else
  print_info "Adding $CURRENT_USER to 'docker' group (you may need to re-login for this to take effect)."
  $SUDO_CMD usermod -aG docker "$CURRENT_USER" || true
fi

# Check for Docker Compose v2 (plugin)
if ! docker compose version >/dev/null 2>&1; then
    print_error "Docker Compose (v2 plugin) not found. Please ensure it is installed correctly."
fi
print_success "Docker Compose is available."

# Verify Docker can run without sudo (might require re-login if group just changed)
if ! docker ps >/dev/null 2>&1; then
  print_warning "Docker may require re-login for group changes to take effect. You can continue using sudo or re-login later."
fi

# Install Certbot for SSL
print_section "🔒 SSL Certificate Setup"
if ! command_exists certbot; then
    print_info "Installing Certbot for SSL certificates..."
    $SUDO_CMD apt-get install -y snapd
    $SUDO_CMD snap install core
    $SUDO_CMD snap refresh core
    $SUDO_CMD snap install --classic certbot
    $SUDO_CMD ln -sf /snap/bin/certbot /usr/bin/certbot
    print_success "Certbot installed successfully."
else
    print_success "Certbot is already installed."
fi

# Environment Configuration
print_section "🔐 Environment Configuration"
if [ ! -f .env ]; then
    print_info "Generating .env file..."
    SECRET_KEY=$(openssl rand -hex 32)
    DB_PASSWORD=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
    ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
    cat > .env << EOF
SECRET_KEY=${SECRET_KEY}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
DATABASE_URL=postgresql://gmailsaas:${DB_PASSWORD}@postgres:5432/gmailsaas
POSTGRES_USER=gmailsaas
POSTGRES_PASSWORD=${DB_PASSWORD}
POSTGRES_DB=gmailsaas
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0
NEXT_PUBLIC_API_URL=http://localhost:8000
EOF
    print_success ".env file created with secure keys."
else
    print_success ".env file already exists."
fi

# Build and Start
print_section "🚀 Build & Launch"

# --- Auto-Repair: Force Code Sync ---
print_info "Synchronizing critical files..."
find . -name "__pycache__" -type d -exec rm -rf {} +
wget -q https://raw.githubusercontent.com/Jetalp54/speed-send/main/backend/app/routers/accounts.py -O backend/app/routers/accounts.py || true
wget -q https://raw.githubusercontent.com/Jetalp54/speed-send/main/backend/app/schemas.py -O backend/app/schemas.py || true
wget -q https://raw.githubusercontent.com/Jetalp54/speed-send/main/frontend/src/app/accounts/page.tsx -O frontend/src/app/accounts/page.tsx || true
# -----------------------------------

# Verify critical files exist before building
print_info "Verifying frontend files..."
if [ ! -f "frontend/package.json" ]; then
    print_warning "frontend/package.json is missing! Creating it..."
    cat > frontend/package.json << 'EOF'
{
  "name": "speed-send-frontend",
  "version": "2.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@radix-ui/react-slot": "^1.0.2",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-dropdown-menu": "^2.0.6",
    "@radix-ui/react-label": "^2.0.2",
    "@radix-ui/react-popover": "^1.0.7",
    "@radix-ui/react-scroll-area": "^1.0.5",
    "@radix-ui/react-select": "^2.0.0",
    "@radix-ui/react-toast": "^1.1.5",
    "axios": "^1.6.2",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "date-fns": "^2.30.0",
    "lucide-react": "^0.294.0",
    "next": "14.0.4",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "tailwind-merge": "^2.0.0",
    "cmdk": "^0.2.0"
  },
  "devDependencies": {
    "@types/node": "^20.9.0",
    "@types/react": "^18.2.37",
    "@types/react-dom": "^18.2.15",
    "autoprefixer": "^10.4.16",
    "eslint": "^8.54.0",
    "eslint-config-next": "14.0.4",
    "postcss": "^8.4.31",
    "tailwindcss": "^3.3.6",
    "tailwindcss-animate": "^1.0.7",
    "typescript": "^5.2.2"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOF
    print_success "Created frontend/package.json"
fi

# Verify/Create tsconfig.json
if [ ! -f "frontend/tsconfig.json" ]; then
    print_warning "frontend/tsconfig.json is missing! Creating it..."
    cat > frontend/tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "es6"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"],
      "@/lib/*": ["./src/lib/*"],
      "@/app/*": ["./src/app/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
EOF
    print_success "Created frontend/tsconfig.json"
fi
if [ ! -d "frontend/src/lib" ]; then
    print_info "Creating frontend/src/lib directory..."
    mkdir -p frontend/src/lib
fi
if [ ! -f "frontend/src/lib/utils.ts" ]; then
    print_warning "frontend/src/lib/utils.ts is missing! Creating it..."
    cat > frontend/src/lib/utils.ts << 'EOF'
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
EOF
    print_success "Created frontend/src/lib/utils.ts"
fi

# Verify API client exists and is valid (do not auto-generate to avoid corruption)
if [ ! -f "frontend/src/lib/api.ts" ] || ! grep -q "class ApiClient" "frontend/src/lib/api.ts"; then
    print_error "frontend/src/lib/api.ts is missing or invalid. Please ensure the file exists in your repository."
    exit 1
fi

# Verify/Create asString utility
if [ ! -f "frontend/src/lib/asString.ts" ]; then
    print_warning "frontend/src/lib/asString.ts is missing! Creating it..."
    cat > frontend/src/lib/asString.ts << 'EOF'
/**
 * Utility to safely convert various types to string
 * Useful for Next.js params and search params handling
 */
export function asString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] || '';
  }
  return value || '';
}

/**
 * Convert value to number, with fallback
 */
export function asNumber(value: string | string[] | undefined, fallback: number = 0): number {
  const str = asString(value);
  const num = parseInt(str, 10);
  return isNaN(num) ? fallback : num;
}

/**
 * Convert value to boolean
 */
export function asBoolean(value: string | string[] | undefined): boolean {
  const str = asString(value).toLowerCase();
  return str === 'true' || str === '1' || str === 'yes';
}

export default asString;
EOF
    print_success "Created frontend/src/lib/asString.ts"
fi

# Fix any remaining direct axios imports in components
print_info "Fixing direct axios imports in frontend files..."
if grep -r "import axios from 'axios'" frontend/src/ 2>/dev/null; then
    find frontend/src/ -name "*.tsx" -exec sed -i "s/import axios from 'axios';/\/\/ Using apiClient from @\/lib\/api instead of direct axios/g" {} \;
    print_success "Fixed direct axios imports."
else
    print_success "No direct axios imports found."
fi

# Display frontend directory contents for debugging
print_info "Frontend directory contents:"
ls -la frontend/
print_info "Sanity check: first lines of frontend/src/lib/api.ts (should start with 'const API_BASE_URL')"
if [ -f "frontend/src/lib/api.ts" ]; then
  head -n 5 frontend/src/lib/api.ts || true
  if head -n 1 frontend/src/lib/api.ts | grep -q "^mkdir -p"; then
    print_error "frontend/src/lib/api.ts appears to be corrupted (contains shell commands). Aborting."
    exit 1
  fi
else
  print_error "frontend/src/lib/api.ts is missing. Aborting."
  exit 1
fi
print_info "Frontend package.json size: $(stat -c%s frontend/package.json 2>/dev/null || stat -f%z frontend/package.json 2>/dev/null || echo 'unknown')"
print_success "All frontend files verified."

# Ensure required frontend dependency and generate lockfile via Dockerized Node
print_info "Ensuring frontend dependencies are present and lockfile is generated..."
docker run --rm -v "$PWD/frontend:/app" -w /app node:18-bullseye bash -lc '
  set -e
  node -e "const p=require(\"./package.json\"); process.exit(p.dependencies && p.dependencies[\"@radix-ui/react-progress\"] ? 0 : 1)" || npm pkg set dependencies.@radix-ui/react-progress=^1.0.3
  npm install --no-audit --no-fund
  npm ls @radix-ui/react-progress || true
'
print_success "Frontend dependencies ensured and package-lock.json generated."

# Build frontend first to catch errors early
print_info "Cleaning Docker caches to avoid stale files..."

# Check available disk space before building
AVAILABLE_SPACE=$(df / | tail -1 | awk '{print $4}')
REQUIRED_SPACE=2097152  # 2GB in KB
if [ "$AVAILABLE_SPACE" -lt "$REQUIRED_SPACE" ]; then
    print_error "Insufficient disk space. Required: 2GB, Available: $((AVAILABLE_SPACE/1024/1024))GB"
    exit 1
fi

docker builder prune -af || true
docker system prune -af || true
print_info "Building frontend image..."

# Create backup of current running containers before rebuilding
BACKUP_TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
print_info "Creating backup snapshot before rebuild..."
docker compose ps --format json > "/tmp/speedsend_backup_${BACKUP_TIMESTAMP}.json" 2>/dev/null || true

# Force complete rebuild to clear npm cache
docker compose build frontend --no-cache --pull
if [ $? -ne 0 ]; then
    print_error "Frontend build failed! Check the logs above."
    print_info "Attempting to clean Docker cache and retry..."
    docker system prune -f
    docker compose build frontend --no-cache --pull
    if [ $? -ne 0 ]; then
        print_error "Frontend build failed after cache cleanup! Please check dependencies."
        
        # Try to restore previous containers if they exist
        if [ -f "/tmp/speedsend_backup_${BACKUP_TIMESTAMP}.json" ] && [ -s "/tmp/speedsend_backup_${BACKUP_TIMESTAMP}.json" ]; then
            print_info "Attempting to restore previous state..."
            docker compose up -d 2>/dev/null || true
        fi
        exit 1
    fi
fi
print_success "Frontend build completed."

print_info "Building remaining services and starting..."

# Attempt graceful service start with retry logic
START_ATTEMPTS=0
MAX_START_ATTEMPTS=3

while [ $START_ATTEMPTS -lt $MAX_START_ATTEMPTS ]; do
    if docker compose build --no-cache && docker compose up -d; then
        print_success "All services started successfully."
        break
    else
        START_ATTEMPTS=$((START_ATTEMPTS + 1))
        if [ $START_ATTEMPTS -lt $MAX_START_ATTEMPTS ]; then
            print_warning "Service start failed (attempt $START_ATTEMPTS/$MAX_START_ATTEMPTS). Retrying in 10 seconds..."
            sleep 10
            
            # Clean up any failed containers before retry
            docker compose down --remove-orphans 2>/dev/null || true
        else
            print_error "Failed to start services after $MAX_START_ATTEMPTS attempts!"
            print_info "Showing service logs for debugging:"
            docker compose logs --tail=50 2>/dev/null || true
            
            # Try to restore from backup
            if [ -f "/tmp/speedsend_backup_${BACKUP_TIMESTAMP}.json" ] && [ -s "/tmp/speedsend_backup_${BACKUP_TIMESTAMP}.json" ]; then
                print_info "Attempting to restore previous state..."
                docker compose up -d 2>/dev/null || true
            fi
            exit 1
        fi
    fi
done

# Configure Nginx
print_section "🌐 Nginx Configuration"
SERVER_IP=$(hostname -I | awk '{print $1}')
DOMAIN_NAME=${DOMAIN_NAME:-$SERVER_IP}

print_info "Configuring Nginx for domain: $DOMAIN_NAME"
$SUDO_CMD tee /etc/nginx/sites-available/speed-send << EOF
server {
    listen 80;
    server_name $DOMAIN_NAME;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # Frontend (Next.js)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }

    # Backend API
    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }

    # API Documentation
    location /docs {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # File upload size limit
    client_max_body_size 50M;
}
EOF

# Enable the site
$SUDO_CMD ln -sf /etc/nginx/sites-available/speed-send /etc/nginx/sites-enabled/
$SUDO_CMD rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
$SUDO_CMD nginx -t
if [ $? -eq 0 ]; then
    print_success "Nginx configuration is valid."
    $SUDO_CMD systemctl reload nginx
    $SUDO_CMD systemctl enable nginx
    print_success "Nginx reloaded and enabled."
else
    print_error "Nginx configuration is invalid!"
fi

# Health Check
print_section "⏳ Waiting for Services"
print_info "Waiting for backend to be healthy..."
max_attempts=30
attempt=0
until curl -s http://localhost:8000/health > /dev/null; do
    if [ $attempt -ge $max_attempts ]; then
        print_error "Backend failed to start. Check logs with: docker compose logs backend"
    fi
    echo -n "."
    sleep 2
    ((attempt++))
done
echo ""
print_success "Backend is healthy!"

# SSL Certificate Setup (Optional)
if [ -n "$DOMAIN_NAME" ] && [ "$DOMAIN_NAME" != "$SERVER_IP" ]; then
    print_section "🔒 SSL Certificate Generation"
    print_info "Setting up SSL certificate for domain: $DOMAIN_NAME"
    echo -e "${YELLOW}To enable HTTPS, run the following command manually after deployment:${NC}"
    echo -e "${CYAN}sudo certbot --nginx -d $DOMAIN_NAME${NC}"
    echo -e "${YELLOW}This will automatically configure SSL and redirect HTTP to HTTPS.${NC}\n"
fi

# Firewall Setup
print_section "🛡️ Firewall Configuration"
if command_exists ufw; then
    print_info "Configuring UFW firewall..."
    $SUDO_CMD ufw --force enable
    $SUDO_CMD ufw allow 22/tcp
    $SUDO_CMD ufw allow 80/tcp
    $SUDO_CMD ufw allow 443/tcp
    print_success "Firewall configured (SSH, HTTP, HTTPS allowed)."
else
    print_warning "UFW not installed. Consider installing it for security."
fi

# Final Info
print_section "✅ Speed-Send Deployment Complete"
echo -e "${GREEN}🎉 Your Speed-Send Email Marketing Platform is now running!${NC}\n"

if [ -n "$DOMAIN_NAME" ] && [ "$DOMAIN_NAME" != "$SERVER_IP" ]; then
    echo -e "   🌐 Website:     ${WHITE}http://$DOMAIN_NAME${NC}"
    echo -e "   📊 Dashboard:   ${WHITE}http://$DOMAIN_NAME/dashboard${NC}"
    echo -e "   📧 Campaigns:   ${WHITE}http://$DOMAIN_NAME/campaigns${NC}"
    echo -e "   📋 API Docs:    ${WHITE}http://$DOMAIN_NAME/docs${NC}"
else
    echo -e "   🌐 Website:     ${WHITE}http://$SERVER_IP${NC}"
    echo -e "   📊 Dashboard:   ${WHITE}http://$SERVER_IP/dashboard${NC}"
    echo -e "   📧 Campaigns:   ${WHITE}http://$SERVER_IP/campaigns${NC}"
    echo -e "   📋 API Docs:    ${WHITE}http://$SERVER_IP/docs${NC}"
fi

echo -e "\n${CYAN}🔧 Management Commands:${NC}"
echo -e "   View logs:      ${WHITE}docker compose logs -f${NC}"
echo -e "   Stop services:  ${WHITE}docker compose stop${NC}"
echo -e "   Start services: ${WHITE}docker compose start${NC}"
echo -e "   Restart:        ${WHITE}docker compose restart${NC}"
echo -e "   Update:         ${WHITE}./deploy.sh${NC}"

echo -e "\n${CYAN}🔒 Security Notes:${NC}"
echo -e "   • Change default passwords in .env file"
echo -e "   • Set up SSL certificate for production use"
echo -e "   • Configure email sending providers in the admin panel"
echo -e "   • Review firewall settings for your security requirements"

if [ -n "$DOMAIN_NAME" ] && [ "$DOMAIN_NAME" != "$SERVER_IP" ]; then
    echo -e "\n${YELLOW}📝 Next Steps:${NC}"
    echo -e "   1. Run: ${WHITE}sudo certbot --nginx -d $DOMAIN_NAME${NC}"
    echo -e "   2. Configure your email providers in the admin panel"
    echo -e "   3. Start creating campaigns and sending emails!"
fi
