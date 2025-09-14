# Whirlcrypt v2.0 Deployment Guide

## 🎉 Installation Complete!

Your Whirlcrypt secure file sharing application v2.0 has been successfully installed and configured on your dedicated server with **full database support** and enhanced security features.

## 🌐 Access Information

### Development Mode (Currently Running)
- **Frontend**: http://192.168.1.100:5173
- **Backend API**: http://192.168.1.100:3001
- **API Documentation**: http://192.168.1.100:3001/api/docs
- **Health Check**: http://192.168.1.100:3001/api/health
- **Admin Stats**: http://192.168.1.100:3001/api/admin/stats

### Internal Network Access
The application is configured to be accessible from your internal network at IP address `192.168.1.100`.

## 🗄️ Database Configuration

### PostgreSQL Setup ✅
- **Database**: PostgreSQL 16.10
- **Database Name**: whirlcrypt_dev
- **User**: whirlcrypt_user
- **Status**: Connected and operational
- **Schema**: Automatically initialized with tables for files and download logs

## 🚀 Running the Application

### Development Mode (Current)
The application is currently running in development mode with hot reload:
```bash
npm run dev
```

### Production Mode
To run in production mode:
```bash
# Stop development servers first (Ctrl+C)
./start-production.sh
```

### As a System Service
To run as a background service that starts automatically on boot:
```bash
# Setup the service (one-time)
./setup-service.sh

# Start the service
sudo systemctl start whirlcrypt

# Check status
sudo systemctl status whirlcrypt

# View logs
sudo journalctl -u whirlcrypt -f
```

## 📁 Project Structure

```
/home/andrei/whirlcrypt/
├── backend/           # Express.js API server
├── frontend/          # React frontend application
├── shared/            # Shared types and utilities
├── docs/              # API documentation
├── *.sh               # Helper scripts
├── *.service          # Systemd service file
└── nginx-*.conf       # Nginx configuration
```

## 🔧 Configuration Files

### Backend Environment (.env)
Located at `backend/.env` with the following settings:
- Port: 3001
- CORS origins include internal network access
- File retention: 24 hours default, 7 days maximum
- Max file size: 100MB
- Cleanup runs every 60 minutes

### Frontend Configuration
- Configured to be accessible from internal network
- Proxies API requests to backend
- Built with Vite for optimal performance

## 🌐 Optional: Nginx Setup

For production deployment with nginx:

1. Install nginx:
   ```bash
   sudo apt install nginx
   ```

2. Copy configuration:
   ```bash
   sudo cp nginx-whirlcrypt.conf /etc/nginx/sites-available/whirlcrypt
   sudo ln -s /etc/nginx/sites-available/whirlcrypt /etc/nginx/sites-enabled/
   ```

3. Test and restart nginx:
   ```bash
   sudo nginx -t
   sudo systemctl restart nginx
   ```

4. Build frontend for production:
   ```bash
   npm run build:frontend
   ```

## 🔒 Enhanced Security Features v2.0

### Core Security
- **End-to-end encryption** using RFC 8188 standard
- **Zero-knowledge architecture** - Server never sees decryption keys
- **AES-128-GCM encryption** with 4KB record size
- **Client-side key generation** using Web Crypto API
- **URL fragment key distribution** (keys never sent to server)

### Server Protection
- **PostgreSQL with prepared statements** - SQL injection prevention
- **Rate limiting** - 10 uploads/15min, 100 API calls/15min per IP
- **Security headers** - CSP, X-Frame-Options, XSS protection
- **Input validation** - File size, type, and content validation
- **Connection pooling** - DoS protection and resource management

### Data Protection
- **Automatic expiration** - Files deleted after retention period
- **Secure deletion** - Removed from both database and storage
- **No data recovery** - Once expired, files cannot be recovered
- **Metadata separation** - Only non-sensitive data in database
- **Graceful degradation** - Falls back to filesystem if DB unavailable

## 📊 Monitoring

### Check Service Status
```bash
sudo systemctl status whirlcrypt
```

### View Logs
```bash
sudo journalctl -u whirlcrypt -f
```

### API Health Check
```bash
curl http://192.168.1.100:3001/api/health
```

## 🛠️ Maintenance

### Update Application
```bash
cd /home/andrei/whirlcrypt
git pull
npm install
npm run build
sudo systemctl restart whirlcrypt
```

### Manual Cleanup
```bash
curl -X POST http://192.168.1.100:3001/api/admin/cleanup
```

### View Storage Stats
```bash
curl http://192.168.1.100:3001/api/admin/stats
```

## 🔥 Firewall Configuration

Currently, the firewall is inactive. If you enable it, make sure to allow the required ports:
```bash
sudo ufw allow 3001  # Backend API
sudo ufw allow 5173  # Frontend (development)
sudo ufw allow 80    # HTTP (if using nginx)
```

## 📞 Support

For issues or questions:
- Check the logs: `sudo journalctl -u whirlcrypt -f`
- Review the API documentation: http://192.168.1.100:3001/api/docs
- Check the original repository: https://github.com/creativeheadz/whirlcrypt

## 🎯 Next Steps

1. Test the application by accessing http://192.168.1.100:5173
2. Upload a test file to verify encryption/decryption works
3. Consider setting up nginx for production deployment
4. Set up the systemd service for automatic startup
5. Configure any additional security measures as needed
