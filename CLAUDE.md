# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Whirlcrypt is a secure file sharing application with end-to-end encryption using RFC 8188 standard. The app consists of a React frontend, Express.js backend, and shared TypeScript types, organized as a monorepo with workspaces.

## Development Commands

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

### Current Storage Limitations
The app currently uses filesystem-based storage which is not production-ready:
- File metadata stored in memory/JSON files
- No database persistence
- No horizontal scaling support
- Consider adding PostgreSQL/MySQL for metadata and cloud storage (S3) for files

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
```bash
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

## Known Issues & Improvements Needed

### Database Integration
Current in-memory storage needs database:
- Add PostgreSQL/MySQL for file metadata persistence
- Consider cloud storage (AWS S3, Google Cloud) for encrypted files
- Update FileManager to use database queries instead of memory

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