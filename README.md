<div align="center">
  <img src="https://raw.githubusercontent.com/creativeheadz/whirlcrypt/refs/heads/main/whirlcrypt-high-resolution-logo-transparent.png" alt="Whirlcrypt Logo" width="200" />
 
### Secure File Sharing with RFC 8188 Encryption
  
  A secure file sharing application inspired by wormhole.app, built with end-to-end encryption using RFC 8188 standard.
  
  [![Live Demo](https://img.shields.io/badge/Live_Demo-https://whirlcrypt.co.uk-orange)](https://whirlcrypt.co.uk/)
  [![API Docs](https://img.shields.io/badge/API_Docs-Interactive-blue)](https://creativeheadz.github.io/whirlcrypt/api.html)
  [![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
</div>

## Features

- **End-to-end encryption**: Files are encrypted in the browser before upload
- **RFC 8188 compliance**: Uses industry-standard Encrypted Content-Encoding for HTTP
- **Zero server access**: Encryption keys never leave your browser
- **Automatic expiration**: Files are automatically deleted after retention period
- **IP-restricted downloads**: Optionally limit each upload to specific IPs or CIDR ranges
- **No tracking**: No ads, analytics, or user tracking
- **Modern UI**: Beautiful glassmorphism design with animated geometric background
- **Mobile friendly**: Works seamlessly on all devices
- **Fast & lightweight**: Built with React + Vite for optimal performance
- **Database-backed**: PostgreSQL integration with graceful filesystem fallback
- **Docker support**: Complete containerized development environment
- **Configurable storage**: Pluggable storage providers (Local, S3, GCS, Azure planned)

## Screenshots

<div align="center">
  <img src="screenshots/2025-09-15 13_28_54-.png" alt="Upload Interface - Secure file sharing with glassmorphism design" width="30%" />
  <img src="screenshots/2025-09-15 13_30_55-.png" alt="File Upload Progress - Encryption and upload in progress" width="30%" />
  <img src="screenshots/2025-09-15 13_31_15-.png" alt="Share Link Generated - Secure download link with embedded encryption keys" width="30%" />
</div>

*Beautiful white glassmorphism design with animated geometric background*

## Quick Start

### Prerequisites

- Node.js 20+ (22 recommended, matches the Docker image)
- npm or yarn
- PostgreSQL (optional - will fallback to filesystem)
- Docker & Docker Compose (optional - for full development environment)

### Option 1: Quick Development Setup (Recommended)

```bash
# Clone the repository
git clone https://github.com/creativeheadz/whirlcrypt.git
cd whirlcrypt

# Run automated setup script
./scripts/setup.sh --dev

# Start development servers
npm run dev
```

### Option 2: Manual Setup

1. **Install dependencies:**
   ```bash
   npm install
   cd backend && npm install
   cd ../frontend && npm install
   cd ..
   ```

2. **Configure environment:**
   ```bash
   cp backend/.env.example backend/.env
   # Edit backend/.env with your settings
   ```

3. **Start development servers:**
   ```bash
   npm run dev
   ```

   This starts:
   - Backend API on http://localhost:3001
   - Frontend on http://localhost:5173

4. **Open your browser:**
   - Go to http://localhost:5173
   - Upload files securely!

### Option 3: Full Docker Environment

```bash
# Start PostgreSQL, Redis, and admin tools
docker-compose -f docker-compose.dev.yml up -d

# Then run the application
npm run dev

# Or run everything in containers
docker-compose up --build
```

**Access Points:**
- **App**: http://localhost:5173
- **API**: http://localhost:3001
- **Database Admin**: http://localhost:8080 (Adminer)
- **Redis Insight**: http://localhost:8001

## Project Structure

```
fileshare/
├── backend/                 # Express.js API server (v2.0)
│   ├── src/
│   │   ├── database/        # PostgreSQL models and connections
│   │   ├── routes/          # API endpoints (/upload, /download, /admin)
│   │   ├── middleware/      # Security middleware & rate limiting
│   │   ├── storage/         # Pluggable storage providers & management
│   │   ├── services/        # Business logic & shared services
│   │   └── config/          # Environment configuration
│   ├── .env.example         # Environment template
│   └── uploads/             # Local file storage (if using filesystem)
├── frontend/                # React + Vite frontend
│   ├── src/
│   │   ├── components/      # React components (with animated background)
│   │   ├── contexts/        # React contexts (Upload state management)
│   │   ├── crypto/          # Client-side RFC 8188 encryption
│   │   └── utils/           # Utility functions
├── scripts/                 # Development & deployment scripts
│   └── setup.sh            # Automated environment setup
├── docker-compose.dev.yml   # Development services (PostgreSQL, Redis)
├── docker-compose.yml       # Production deployment
├── Dockerfile              # Multi-stage production build
└── nginx.conf              # Nginx reverse proxy configuration
```

## Configuration

### Environment Variables

Copy `backend/.env.example` to `backend/.env` and configure:

```bash
# Server Configuration
NODE_ENV=development
PORT=3001

# Database Configuration (PostgreSQL)
DB_HOST=localhost
DB_PORT=5433
DB_NAME=whirlcrypt_dev
DB_USER=whirlcrypt_user
DB_PASSWORD=whirlcrypt_password

# Storage Configuration
STORAGE_PROVIDER=local
UPLOAD_DIR=./uploads

# CORS Configuration
CORS_ORIGIN=http://localhost:5173

# File Configuration
DEFAULT_RETENTION_HOURS=24
MAX_RETENTION_HOURS=168
MAX_FILE_SIZE=104857600

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### Storage Providers

**Local Storage (Default):**
```bash
STORAGE_PROVIDER=local
UPLOAD_DIR=./uploads
```

**Amazon S3 (Planned):**
```bash
STORAGE_PROVIDER=s3
S3_BUCKET=your-bucket-name
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
```

### Production Deployment

1. **Build the application:**
   ```bash
   npm run build
   ```

2. **Set environment variables:**
   - Configure CORS origins for your domain
   - Set appropriate file size limits
   - Configure retention policies

3. **Start production server:**
   ```bash
   npm start
   ```

## API Documentation

### **Live Documentation**
Beautiful, interactive API documentation with glassmorphism design:

- **[Complete API Reference](https://creativeheadz.github.io/whirlcrypt/api.html)** - Full documentation with examples
- **[OpenAPI Specification](https://creativeheadz.github.io/whirlcrypt/openapi.yaml)** - YAML spec for integration  
- **[Interactive Explorer](https://editor.swagger.io/?url=https://creativeheadz.github.io/whirlcrypt/openapi.yaml)** - Try the API live

### **Development**
- **Local API Docs**: http://localhost:3001/api/docs (Swagger UI)
- **Production**: https://your-domain.com/api/docs

### **Quick Reference**
See [docs/API.md](docs/API.md) for detailed markdown documentation.

### **Quick API Overview**

**Upload**
- `POST /api/upload` - Upload encrypted file with metadata
- Rate limited: 10 uploads per 15 minutes per IP

**Download**  
- `GET /api/download/:id` - Download encrypted file (requires encryption key)
- `GET /api/download/:id/info` - Get file metadata without downloading

**Admin** (JWT + optional MFA; see ADMIN_AUTHENTICATION.md)
- `GET /api/admin/stats` - Storage statistics and configuration
- `POST /api/admin/cleanup` - Manual cleanup of expired files
- `GET /api/admin/config` - Current server configuration
- `PUT /api/admin/config` - Temporary validated override (resets to environment values on restart)

**Config**
- `GET /api/config` - Public upload limits (max file size, retention) so the uploader can check before encrypting

**Health**
- `GET /api/health` - Service health check and version info

### **Authentication**
- Most endpoints are public but rate-limited
- Download endpoints need no header: the decryption key travels in the URL fragment, which browsers never send to the server (it is scrubbed from the address bar after parsing)
- Admin endpoints require JWT authentication with optional TOTP MFA

### **Rate Limits** (per IP, per 15 minutes)
- Upload: 10 requests
- Full-file downloads: 30 requests (metadata checks fall under the general bucket)
- Other endpoints: 100 requests

## Security Implementation

### Encryption Process

1. **Key Generation**: 128-bit AES key + 16-byte salt generated in browser
2. **File Encryption**: RFC 8188 AES-128-GCM encryption with 4KB records
3. **Key Transmission**: Keys embedded in URL fragment (not sent to server)
4. **Server Storage**: Only encrypted data stored, server cannot decrypt

### Security Headers

- Content Security Policy (CSP)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Rate limiting on uploads and API calls

## Admin Panel

Access the admin panel at `/admin` to:
- View storage statistics
- Configure retention policies
- Manually trigger cleanup
- Monitor system health

## How It Works

1. **Upload Process:**
   - Generate encryption keys in browser
   - Encrypt file using RFC 8188 standard
   - Upload encrypted data to server
   - Return shareable URL with embedded keys

2. **Download Process:**
   - Extract keys from URL fragment
   - Download encrypted file from server
   - Decrypt file in browser
   - Trigger download to user's device

3. **Security Model:**
   - Server never sees decryption keys
   - Files automatically expire
   - All encryption/decryption happens client-side

## Development

### Running Tests
```bash
# Backend tests (node:test via tsx, no database needed)
cd backend && npm test

# Frontend tests
cd frontend && npm test
```

### Typechecking
```bash
# Backend
./node_modules/.bin/tsc --noEmit -p backend/tsconfig.json

# Frontend
./node_modules/.bin/tsc --noEmit -p frontend/tsconfig.json
```
No linter or formatter is configured yet.

## Architecture & Deployment

### Architecture v2.0

**Database Layer:**
- PostgreSQL for file metadata with ACID compliance
- Connection pooling and health monitoring
- Graceful fallback to filesystem if database unavailable

**Storage Layer:**
- Pluggable storage providers (Local, S3, GCS, Azure planned)
- Storage abstraction with health checks
- Configurable via environment variables

**Security:**
- Content Security Policy with no external dependencies
- Rate limiting with configurable thresholds
- Helmet.js security middleware

### Production Deployment

**Docker (Recommended):**
```bash
# Production build with all services
docker-compose up --build -d

# Includes: App + PostgreSQL + Redis + Nginx
# Access: http://localhost
```

**Manual Deployment:**
```bash
# 1. Setup PostgreSQL database
# 2. Configure environment variables
# 3. Build and start application
npm run build
npm start
```

### Production Considerations

1. **Database**: PostgreSQL recommended for production (included in Docker setup)
2. **Storage**: Local disk works; S3/GCS providers are planned for larger scale
3. **Monitoring**: Add structured logging and health monitoring
4. **Security**: Set strong `JWT_SECRET`, `METADATA_ENCRYPTION_KEY`, and `DB_PASSWORD` (production refuses to boot on the dev defaults); put the app behind TLS
5. **Backup**: Implement database and file backup strategies
6. **CDN**: Use CDN for frontend assets and large file downloads

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Inspired by [wormhole.app](https://wormhole.app)
- Based on [RFC 8188](https://tools.ietf.org/html/rfc8188) - Encrypted Content-Encoding for HTTP
- Built with security best practices from OWASP guidelines
