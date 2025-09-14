# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Whirlcrypt is a secure file sharing application with end-to-end encryption using RFC 8188 standard. The app consists of a React frontend, Express.js backend, and shared TypeScript types, organized as a monorepo with workspaces.

## Development Commands

### Quick Start
- `./scripts/setup.sh --dev` - Full development setup (first time)
- `./scripts/setup.sh` - Interactive setup menu
- `npm run dev` - Start development servers (after setup)

### Core Development Commands
- `npm run dev` - Start both frontend and backend in development mode
- `npm run dev:backend` - Start only backend server on port 3001
- `npm run dev:frontend` - Start only frontend dev server on port 5173
- `npm run build` - Build both frontend and backend for production
- `npm run start` - Start production server (backend only)

### Backend Commands (cd backend)
- `npm run build` - Compile TypeScript to dist/
- `npm run dev` - Build and run in development mode
- `npm start` - Run compiled production build

### Frontend Commands (cd frontend)  
- `npm run build` - Build production bundle with Vite
- `npm run dev` - Start Vite dev server with HMR
- `npm run preview` - Preview production build locally

### Docker Commands
- `docker-compose -f docker-compose.dev.yml up -d` - Start development services
- `docker-compose up --build` - Start production environment
- `./scripts/setup.sh` - Interactive Docker setup

## Architecture

### Encryption Model
The application uses **client-side encryption** with the following flow:
1. **Upload**: Files are encrypted in browser using RFC 8188, then uploaded as encrypted blobs
2. **Storage**: Server stores encrypted data without access to decryption keys
3. **Download**: Server serves encrypted data, browser decrypts using keys from URL fragment
4. **Key Management**: Encryption keys never reach the server - embedded in URL fragments only

### Project Structure
```
├── backend/           # Express.js API server
│   ├── src/
│   │   ├── routes/    # API endpoints (/upload, /download, /admin)
│   │   ├── encryption/ # RFC 8188 crypto utilities (server-side, unused)
│   │   ├── storage/   # File storage management (FileManager)
│   │   ├── middleware/ # Security, rate limiting, CORS
│   │   └── config/    # Environment configuration
├── frontend/          # React + Vite SPA
│   ├── src/
│   │   ├── components/ # React components (Upload, Download, Admin)
│   │   ├── crypto/    # RFC 8188 client-side encryption
│   │   └── utils/     # Helper functions
└── shared/           # Shared TypeScript types and constants
```

### Key Components

**Frontend Encryption (`frontend/src/crypto/rfc8188.ts`)**:
- `ClientCrypto.encryptFile()` - Encrypts files in browser using Web Crypto API
- `ClientCrypto.decryptData()` - Decrypts downloaded files in browser
- `ClientCrypto.generateKeys()` - Creates AES keys and salts
- Keys embedded in URL fragments, never transmitted to server

**Backend File Management (`backend/src/storage/fileManager.ts`)**:
- Handles encrypted file storage and metadata
- Automatic cleanup of expired files
- File availability checking and download counting

**API Endpoints**:
- `POST /api/upload` - Accept encrypted file uploads
- `GET /api/download/:id` - Serve encrypted files for client-side decryption
- `GET /api/download/:id/info` - File metadata without downloading
- `/api/admin/*` - Admin panel endpoints for stats and cleanup

### Database & Storage Architecture (v2.0)
The application now uses a robust database and configurable storage system:

**Database Layer (PostgreSQL)**:
- File metadata stored in PostgreSQL with full ACID compliance
- Automatic schema initialization and migration support
- Connection pooling and health monitoring
- Download logging and analytics

**Storage Layer (Configurable)**:
- Pluggable storage providers (Local, S3, GCS, Azure planned)
- Currently supports local filesystem with subdirectory organization
- Configurable via environment variables
- Built-in health checks and integrity verification

**File Management (`FileManagerV2`)**:
- Database-backed metadata with storage abstraction
- Automatic cleanup of expired files from both database and storage
- Download tracking and rate limiting support
- Comprehensive error handling and logging

## Security Architecture

### Rate Limiting
- Upload endpoints: 10 requests per 15 minutes per IP
- Other endpoints: 100 requests per 15 minutes per IP
- Configurable via `RATE_LIMIT_*` environment variables

### File Retention  
- Default: 24 hours (configurable)
- Maximum: 168 hours (7 days, configurable)
- Automatic cleanup via cron job every 60 minutes
- Manual cleanup via admin panel

### Security Headers
- Comprehensive CSP policy
- X-Frame-Options: DENY  
- X-Content-Type-Options: nosniff
- Helmet.js security middleware

## Environment Configuration

### Backend (.env in backend directory)
Copy `backend/.env.example` to `backend/.env` and configure:

```bash
# Server Configuration
NODE_ENV=development
PORT=3001

# Database Configuration  
DB_HOST=localhost
DB_PORT=5433
DB_NAME=whirlcrypt_dev
DB_USER=your_db_username
DB_PASSWORD=your_secure_password

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

### Development vs Production
- Development: Uses Vite proxy for API calls (`/api/*` → `http://localhost:3001`)
- Production: Serves frontend static files from backend
- CORS origins must be configured for production domains

## Common Development Tasks

### Adding New File Types
1. Update `allowedExtensions` in backend config
2. Consider MIME type handling in `frontend/src/components/Upload.tsx`
3. Test upload/download flow with new file types

### Modifying Retention Policies
1. Update environment variables for default/max retention
2. Consider impact on storage cleanup logic
3. Update admin panel if displaying retention info

### Testing Encryption
1. Upload a file and verify it's encrypted on disk (`backend/uploads/`)
2. Check that server logs don't contain decryption keys
3. Verify download/decrypt flow works in different browsers
4. Test URL sharing (keys in fragment, not sent to server)

## Docker Deployment

### Development Environment
```bash
# Start development services (PostgreSQL + Redis + Adminer)
docker-compose -f docker-compose.dev.yml up -d

# Access points:
# - Database Admin: http://localhost:8080 (Adminer)
# - Redis Insight: http://localhost:8001
# - PostgreSQL: localhost:5433
# - Redis: localhost:6380
```

### Production Environment
```bash
# Build and start production environment
docker-compose up --build -d

# Includes: App + PostgreSQL + Redis + Nginx
# Access: http://localhost (via Nginx)
```

### Setup Script
```bash
# Interactive setup
./scripts/setup.sh

# Automated development setup
./scripts/setup.sh --dev

# Production deployment
./scripts/setup.sh --prod
```

## Known Issues & Improvements Needed

### Storage Provider Expansion
- S3 storage provider (planned)
- Google Cloud Storage provider (planned)  
- Azure Storage provider (planned)
- Multi-provider failover support

### Production Readiness
- Add proper logging (structured logging, log levels)
- Implement health checks and monitoring
- Add backup strategies for critical data
- Configure rate limiting based on production load
- Add user authentication for admin endpoints

### Performance Optimizations
- Implement file chunked uploads for large files
- Add compression for non-encrypted data (metadata)
- Consider CDN for frontend assets
- Optimize cleanup processes for large file counts