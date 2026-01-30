import paramiko
import time
import logging
from app.config import settings
from app.models import TrackingDomain, AccountStatus
from sqlalchemy.orm import Session
import io
import asyncio

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
                # self.db.refresh(domain) # Avoid refresh loop issues
            logger.info(f"Domain {self.domain_id}: {message}")
        except Exception as e:
            logger.error(f"Failed to write provision log: {e}")

    def generate_setup_script(self, domain_name: str, target_upstream: str) -> str:
        """
        Generates the bash script to run on the remote server.
        target_upstream: The Main App URL (e.g. https://api.speedsend.com)
        """
        # Ensure upstream has protocol
        if not target_upstream.startswith('http'):
            target_upstream = f"https://{target_upstream}"
            
        script = f"""#!/bin/bash
set -e

# Wait for apt lock to be released (handles unattended-upgrades)
echo "Waiting for apt lock to be released..."
while sudo fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1; do
    echo "Waiting for other package managers to finish..."
    sleep 5
done

# Also wait for dpkg lock
while sudo fuser /var/lib/dpkg/lock >/dev/null 2>&1; do
    echo "Waiting for dpkg lock..."
    sleep 5
done

echo "Locks released, proceeding with installation..."

# 1. Install Dependencies
echo "Installing Nginx and Certbot..."
apt-get update
apt-get install -y nginx certbot python3-certbot-nginx

# 2. Configure Nginx
echo "Configuring Nginx for {domain_name}..."

cat > /etc/nginx/sites-available/{domain_name} <<EOF
server {{
    server_name {domain_name};
    
    location / {{
        proxy_pass {target_upstream};
        proxy_set_header Host \\$host;
        proxy_set_header X-Real-IP \\$remote_addr;
        proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\$scheme;
        
        # Tracking Pixel/Links specific headers if needed
        proxy_set_header X-Tracking-Domain {domain_name};
    }}
}}
EOF

# 3. Enable Site
ln -sf /etc/nginx/sites-available/{domain_name} /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# 4. Test & Reload
nginx -t
systemctl reload nginx

# 5. SSL with Certbot
# Only run if not already valid to avoid limits? 
# For now, we assume fresh or force renewal
echo "Requesting SSL Certificate..."
certbot --nginx -d {domain_name} --non-interactive --agree-tos --email admin@{domain_name} --redirect

echo "Provisioning Complete!"
"""
        return script

    def provision(self, ip: str, password: str, domain_name: str):
        """
        Main entry point to provision the server.
        Executed in background task.
        """
        self.log(f"Starting provisioning for {domain_name} on {ip}...")
        
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        try:
            self.log("Connecting via SSH...")
            ssh.connect(ip, username='root', password=password, timeout=30)
            self.log("SSH Connected.")
            
            # Generate script
            target_url = settings.API_BASE_URL or "http://localhost:8000"
            # If running locally, this might be loopback, but user said "external server"
            # We assume API_BASE_URL is reachable from the internet.
            
            script_content = self.generate_setup_script(domain_name, target_url)
            
            # Write script to remote file
            self.log("Uploading setup script...")
            # Use SFTP or simpler echo
            ftp = ssh.open_sftp()
            file = ftp.file('/root/setup_tracking.sh', "w", -1)
            file.write(script_content)
            file.flush()
            ftp.close()
            
            ssh.exec_command("chmod +x /root/setup_tracking.sh")
            
            self.log("Executing setup script (this may take a minute)...")
            stdin, stdout, stderr = ssh.exec_command("/root/setup_tracking.sh")
            
            # Streaming output
            while not stdout.channel.exit_status_ready():
                 if stdout.channel.recv_ready():
                     line = stdout.channel.recv(1024).decode('utf-8')
                     self.log(f"REMOTE: {line.strip()}")
            
            exit_status = stdout.channel.recv_exit_status()
            
            if exit_status == 0:
                self.log("Provisioning successful!")
                self.update_status('active', ssl=True)
            else:
                error_msg = stderr.read().decode()
                self.log(f"Provisioning failed with status {exit_status}: {error_msg}")
                self.update_status('failed')
                
        except Exception as e:
            self.log(f"Provisioning Error: {str(e)}")
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
