# Whirlcrypt 🌀 - Encrypted File Sharing

A secure file sharing application inspired by wormhole.app, built with end-to-end encryption using RFC 8188 standard.

## 🔒 Security Features

- **End-to-end encryption**: Files are encrypted in the browser before upload
- **RFC 8188 compliance**: Uses industry-standard Encrypted Content-Encoding for HTTP
- **Zero server access**: Encryption keys never leave your browser
- **Automatic expiration**: Files are automatically deleted after retention period
- **No tracking**: No ads, analytics, or user tracking

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. **Clone and install dependencies:**
   ```bash
   cd Fileshare
   npm install
   cd backend && npm install
   cd ../frontend && npm install
   cd ..
   ```

2. **Start development servers:**
   ```bash
   npm run dev
   ```

   This starts:
   - Backend API on http://localhost:3001
   - Frontend on http://localhost:5173

3. **Open your browser:**
   - Go to http://localhost:5173
   - Upload files securely!

## 📁 Project Structure

```
fileshare/
├── backend/                 # Express.js API server
│   ├── src/
│   │   ├── encryption/      # RFC 8188 implementation
│   │   ├── routes/          # API endpoints
│   │   ├── middleware/      # Security middleware
│   │   ├── storage/         # File storage management
│   │   └── config/          # Configuration
│   └── uploads/             # File storage directory
├── frontend/                # React + Vite frontend  
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── crypto/          # Client-side encryption
│   │   └── utils/           # Utility functions
└── shared/                  # Shared types and utilities
```

## 🛠️ Configuration

### Environment Variables

Create `.env` files in the backend directory:

```bash
# Backend (.env)
PORT=3001
CORS_ORIGIN=http://localhost:5173
UPLOAD_DIR=./uploads
DEFAULT_RETENTION_HOURS=24
MAX_RETENTION_HOURS=168
MAX_FILE_SIZE=104857600
CLEANUP_INTERVAL_MINUTES=60
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
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

## 🔧 API Documentation

### 📚 **Interactive API Docs**
Access the full interactive Swagger/OpenAPI documentation:

**🌐 Online Documentation**: https://creativeheadz.github.io/whirlcrypt/

**🔧 Development**: http://localhost:3001/api/docs

**🚀 Production**: https://your-domain.com/api/docs

### 📖 **Complete API Reference** 
See [docs/API.md](docs/API.md) for detailed documentation with examples.

### 🚀 **Quick API Overview**

**Upload**
- `POST /api/upload` - Upload encrypted file with metadata
- Rate limited: 10 uploads per 15 minutes per IP

**Download**  
- `GET /api/download/:id` - Download encrypted file (requires encryption key)
- `GET /api/download/:id/info` - Get file metadata without downloading

**Admin**
- `GET /api/admin/stats` - Storage statistics and configuration
- `POST /api/admin/cleanup` - Manual cleanup of expired files  
- `GET /api/admin/config` - Current server configuration
- `PUT /api/admin/config` - Update configuration (runtime only)

**Health**
- `GET /api/health` - Service health check and version info

### 🔐 **Authentication**
- Most endpoints are public but rate-limited
- Download endpoints require encryption key (header: `x-encryption-key`)
- Admin endpoints have no authentication (add auth for production!)

### 📊 **Rate Limits**
- Upload: 10 requests per 15 minutes per IP
- Other endpoints: 100 requests per 15 minutes per IP

## 🛡️ Security Implementation

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

## 📊 Admin Panel

Access the admin panel at `/admin` to:
- View storage statistics
- Configure retention policies
- Manually trigger cleanup
- Monitor system health

## 🔍 How It Works

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

## 🧪 Development

### Running Tests
```bash
# Backend tests
cd backend && npm test

# Frontend tests  
cd frontend && npm test
```

### Code Style
```bash
# Lint code
npm run lint

# Format code
npm run format
```

## 📦 Production Considerations

1. **File Storage**: Consider using cloud storage (S3, etc.) for production
2. **Database**: Add PostgreSQL/MySQL for metadata storage
3. **Monitoring**: Add logging and monitoring (Prometheus, etc.)
4. **Backup**: Implement backup strategies for critical data
5. **Rate Limiting**: Configure appropriate limits based on usage
6. **CDN**: Use CDN for frontend assets in production

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Inspired by [wormhole.app](https://wormhole.app)
- Based on [RFC 8188](https://tools.ietf.org/html/rfc8188) - Encrypted Content-Encoding for HTTP
- Built with security best practices from OWASP guidelines