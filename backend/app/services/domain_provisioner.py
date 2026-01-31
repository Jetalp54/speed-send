import paramiko
import time
import logging
from app.config import settings
from app.models import TrackingDomain, AccountStatus
from sqlalchemy.orm import Session
import io
import asyncio
import socket

logger = logging.getLogger(__name__)

class DomainProvisioner:
    """
    Provisions a remote Ubuntu server to act as a custom tracking domain.
    Installs Nginx, Certbot, and configures reverse proxy to Main App.
    """
    
    def __init__(self, db: Session, domain_id: int):
        self.db = db
        self.domain_id = domain_id
        
    def log(self, message: str):
        """Append log to database for frontend visibility"""
        try:
            domain = self.db.query(TrackingDomain).filter(TrackingDomain.id == self.domain_id).first()
            if domain:
                new_log = f"[{time.strftime('%H:%M:%S')}] {message}\n"
                domain.provisioning_log = (domain.provisioning_log or "") + new_log
                self.db.commit()
            logger.info(f"Domain {self.domain_id}: {message}")
        except Exception as e:
            logger.error(f"Failed to write provision log: {e}")

    def get_main_server_ip(self):
        """Attempts to find the public IP of the main server to proxy back to."""
        try:
            # First try configured URL
            if settings.API_BASE_URL and "localhost" not in settings.API_BASE_URL:
                 return settings.API_BASE_URL
            
            # Fallback: Detect external IP
            import urllib.request
            return urllib.request.urlopen('https://api.ipify.org').read().decode('utf8')
        except:
             return None

    def generate_setup_script(self, domain_name: str, target_upstream: str) -> str:
        """
        Generates the bash script to run on the remote server.
        target_upstream: The Main App URL/IP
        """
        # Ensure protocol
        if not target_upstream.startswith('http'):
            # If IP only, assume HTTP or port 8000
            if ":" not in target_upstream:
                 target_upstream = f"http://{target_upstream}:8000"
            else:
                 target_upstream = f"http://{target_upstream}"

        script = f"""#!/bin/bash
# 🚀 PROVISIONER v6 (Smart & Safe)

# Trap errors
trap 'echo "❌ ERROR on line $LINENO (Exit Code: $?)"' ERR
set -e

echo "Started provisioning for {domain_name}..."

# ------------------------------------------------
# 0. PRE-FLIGHT CHECKS & LOCK CLEANUP
# ------------------------------------------------
echo "🧹 Cleaning locks..."
killall apt apt-get 2>/dev/null || true
rm -f /var/lib/apt/lists/lock
rm -f /var/cache/apt/archives/lock
rm -f /var/lib/dpkg/lock*
dpkg --configure -a || true 

echo "🌐 Checking Connectivity..."
# Check if we have internet at all
if ! ping -c 1 8.8.8.8 >/dev/null 2>&1; then
    echo "⚠️ Ping 8.8.8.8 failed. Checking default gateway..."
    ip route show | grep default
else
    echo "✅ Internet Connection: OK"
fi

# ------------------------------------------------
# 1. DNS CONFIGURATION (Safe Mode)
# ------------------------------------------------
echo "🔧 Configuring DNS..."
chattr -i /etc/resolv.conf 2>/dev/null || true

# Test if we can resolve google.com BEFORE changing anything
if ! host google.com >/dev/null 2>&1; then
    echo "⚠️ DNS resolution failed. Forcing Google DNS."
    cat > /etc/resolv.conf <<EOF
nameserver 8.8.8.8
nameserver 1.1.1.1
EOF
else
    echo "✅ Existing DNS works. Appending Google DNS as fallback."
    if ! grep -q "8.8.8.8" /etc/resolv.conf; then
        echo "nameserver 8.8.8.8" >> /etc/resolv.conf
    fi
fi

# Force IPv4 to prevent IPv6 timeouts
echo 'Acquire::ForceIPv4 "true";' > /etc/apt/apt.conf.d/99force-ipv4
echo 'Acquire::Retries "3";' >> /etc/apt/apt.conf.d/99force-ipv4
echo 'Acquire::http::Timeout "30";' >> /etc/apt/apt.conf.d/99force-ipv4

# ------------------------------------------------
# 2. PACKAGE SOURCES (Adaptive Strategy)
# ------------------------------------------------
echo "📦 Configuring Repositories..."

# Function to try updating
try_update() {{
    echo "🔄 Running apt-get update..."
    rm -rf /var/lib/apt/lists/*
    if apt-get -o Acquire::ForceIPv4=true update; then
        return 0
    fi
    return 1
}}

# A. Try DEFAULT sources first (maybe the provider requires them)
echo "▶️ Strategy A: Trying current/default mirrors..."
if try_update; then
    echo "✅ Default mirrors work!"
else
    echo "⚠️ Default mirrors failed. Backing up and switching to Main Ubuntu Mirrors..."
    cp /etc/apt/sources.list /etc/apt/sources.list.backup_$(date +%s) 2>/dev/null || true
    
    # B. Try MAIN Ubuntu sources
    echo "▶️ Strategy B: Switch to Archive.ubuntu.com..."
    cat > /etc/apt/sources.list <<EOF
deb http://archive.ubuntu.com/ubuntu jammy main restricted universe multiverse
deb http://archive.ubuntu.com/ubuntu jammy-updates main restricted universe multiverse
deb http://archive.ubuntu.com/ubuntu jammy-security main restricted universe multiverse
EOF
    
    if try_update; then
        echo "✅ Main mirrors work!"
    else
        echo "⚠️ Main mirrors failed. Switching to US Mirrors..."
        
        # C. Try US Mirrors (often more reliable globally)
        echo "▶️ Strategy C: Switch to US.archive.ubuntu.com..."
        sed -i 's/archive.ubuntu.com/us.archive.ubuntu.com/g' /etc/apt/sources.list
        
        if try_update; then
            echo "✅ US mirrors work!"
        else
            echo "❌ CRITICAL FAILURE: No repositories are reachable."
            echo "🔎 Diagnostics:"
            ping -c 3 archive.ubuntu.com || true
            exit 100
        fi
    fi
fi

# ------------------------------------------------
# 3. INSTALLATION
# ------------------------------------------------
echo "⬇️ Installing Packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get -o Acquire::ForceIPv4=true install -y nginx certbot python3-certbot-nginx dnsutils ufw

# ------------------------------------------------
# 4. CONFIGURATION
# ------------------------------------------------
echo "🛡️ Configuring Firewall..."
ufw --force disable
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 'Nginx Full'
echo "y" | ufw enable

echo "⚙️ Configuring Nginx..."
cat > /etc/nginx/sites-available/{domain_name} <<EOF
server {{
    listen 80;
    server_name {domain_name};
    
    location / {{
        proxy_pass {target_upstream};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Tracking-Domain {domain_name};
    }}
}}
EOF

# Link and Reload
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/{domain_name} /etc/nginx/sites-enabled/
nginx -t || echo "⚠️ Nginx syntax check warning"
systemctl reload nginx || systemctl restart nginx

# ------------------------------------------------
# 5. SSL SETUP
# ------------------------------------------------
echo "🔒 Requesting SSL..."
if certbot --nginx -d {domain_name} --non-interactive --agree-tos --email admin@{domain_name} --redirect; then
    echo "✅ DONE: SSL Installed."
else
    echo "⚠️ WARNING: SSL Failed (DNS propagation?). HTTP will still work."
fi

exit 0
"""
        return script

    def provision(self, ip: str, password: str, domain_name: str):
        """
        Main entry point to provision the server.
        """
        self.log(f"Starting provisioning for {domain_name} on {ip}...")
        
        # Determine where to proxy TO (The Main Server)
        upstream_ip = self.get_main_server_ip()
        if not upstream_ip:
             self.log("❌ Could not determine Main Server IP. Using requester IP logic fallback.")
             upstream_ip = "136.244.100.244" # Ideally detected dynamically or from config
        
        self.log(f"Configuring Proxy -> {upstream_ip}")

        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        try:
            self.log("Connecting via SSH...")
            ssh.connect(ip, username='root', password=password, timeout=30)
            self.log("✅ SSH Connected")
            
            script_content = self.generate_setup_script(domain_name, upstream_ip)
            
            # Upload and Execute
            ftp = ssh.open_sftp()
            f = ftp.file('/root/setup_tracking.sh', "w", -1)
            f.write(script_content)
            f.flush()
            ftp.close()
            
            ssh.exec_command("chmod +x /root/setup_tracking.sh")
            
            self.log("Executing setup script on remote server...")
            stdin, stdout, stderr = ssh.exec_command("/root/setup_tracking.sh")
            
            # Stream logs
            while not stdout.channel.exit_status_ready():
                 if stdout.channel.recv_ready():
                     line = stdout.channel.recv(1024).decode('utf-8')
                     self.log(f"REMOTE: {line.strip()}")
            
            exit_code = stdout.channel.recv_exit_status()
            
            if exit_code == 0:
                self.log("✅ Server Configured Successfully!")
                self.update_status('active', ssl=True)
            else:
                self.log(f"❌ Setup failed with code {exit_code}")
                self.update_status('failed')

        except Exception as e:
            self.log(f"❌ Error: {str(e)}")
            self.update_status('failed')
        finally:
            ssh.close()
            
    def update_status(self, status, ssl=False):
        domain = self.db.query(TrackingDomain).filter(TrackingDomain.id == self.domain_id).first()
        if domain:
            domain.status = status
            domain.ssl_active = ssl
            domain.last_checked_at = time.strftime('%Y-%m-%d %H:%M:%S')
            self.db.commit()
