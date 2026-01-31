# Email Tracking Server

High-performance standalone tracking server for email campaigns. Handles open/click tracking, unsubscribes, and analytics collection with GeoIP and device detection.

## Features

- **Open Tracking**: 1x1 transparent pixel tracking
- **Click Tracking**: URL redirect with event logging
- **Unsubscribe Handler**: GDPR-compliant unsubscribe management
- **GeoIP Detection**: Country, city, region resolution
- **Device Detection**: Browser, OS, device type parsing
- **Privacy-First**: IP hashing, no PII in URLs
- **High Performance**: Async database, Redis caching

## Architecture

```
Client Request → Nginx (SSL) → FastAPI App → PostgreSQL
                                    ↓
                              GeoIP + UA Parser
```

## Installation

### Requirements
- Ubuntu 22.04 LTS
- Root access
- Domain name pointing to server IP
- Database connection to main backend

### Quick Setup

```bash
# 1. Copy tracking-server folder to Ubuntu server
scp -r tracking-server/ user@your-server:/tmp/

# 2. SSH into server
ssh user@your-server

# 3. Run setup script
cd /tmp/tracking-server/deployment
sudo bash setup.sh track.yourdomain.com backend-db-ip db-password

# 4. Wait for DNS propagation, then setup SSL
sudo certbot --nginx -d track.yourdomain.com

# 5. Verify installation
curl https://track.yourdomain.com/health
```

## Configuration

Edit `/opt/tracking-server/.env`:

```env
DATABASE_URL=postgresql://user:pass@host:5432/dbname
REDIS_URL=redis://localhost:6379/1
ENCRYPTION_KEY=your-32-byte-encryption-key
GEOIP_DB_PATH=/usr/share/GeoIP/GeoLite2-City.mmdb
TRACKING_DOMAIN=track.yourdomain.com
IP_SALT=random-salt-for-hashing
```

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/t/o/{token}.png` | Open tracking pixel |
| GET | `/t/c/{token}` | Click redirect |
| GET | `/u/{token}` | Unsubscribe page |

## Management

```bash
# Start service
sudo systemctl start tracking-server

# Stop service
sudo systemctl stop tracking-server

# Restart service
sudo systemctl restart tracking-server

# View logs
sudo journalctl -u tracking-server -f

# Check status
sudo systemctl status tracking-server
```

## Testing

```bash
# Test health endpoint
curl https://track.yourdomain.com/health

# Test pixel (should return 1x1 PNG)
curl -I https://track.yourdomain.com/t/o/test123.png

# View Nginx logs
sudo tail -f /var/log/nginx/tracking-access.log
```

## Troubleshooting

### Service won't start
```bash
# Check logs
sudo journalctl -u tracking-server -n 50

# Test configuration
cd /opt/tracking-server
source venv/bin/activate
python -m app.main
```

### Database connection issues
```bash
# Test database connectivity
psql "postgresql://user:pass@host:5432/dbname" -c "SELECT 1"

# Check firewall on database server
# Ensure port 5432 is open for tracking server IP
```

### GeoIP not working
```bash
# Verify database exists
ls -lh /usr/share/GeoIP/GeoLite2-City.mmdb

# Re-download if needed
cd /usr/share/GeoIP
wget https://github.com/P3TERX/GeoLite.mmdb/raw/download/GeoLite2-City.mmdb
```

## Performance Tuning

### For high-traffic deployments:

1. **Increase workers** in `/etc/systemd/system/tracking-server.service`:
   ```
   ExecStart=.../uvicorn app.main:app --workers 8
   ```

2. **Enable Redis caching** (TODO: implement caching layer)

3. **Use connection pooling** (already implemented in database.py)

## Security

- All IPs are hashed before storage (SHA-256 + salt)
- No PII in tracking URLs
- SSL/TLS encryption enforced
- Firewall configured (UFW)
- Systemd service runs as www-data user

## License

Proprietary - Part of Gmail SaaS Platform
