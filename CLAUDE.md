# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Whirlcrypt is a secure file sharing application with end-to-end encryption using the RFC 8188 standard. Files are encrypted entirely in the browser before upload; the server never sees decryption keys. Built as a monorepo with three workspaces: `backend/` (Express.js + TypeScript), `frontend/` (React + Vite + TypeScript), and `shared/` (shared TypeScript types).

## Development Commands

### Running the App
```bash
npm run dev              # Start both frontend (port 5173) and backend (port 3001)
npm run dev:backend      # Backend only
npm run dev:frontend     # Frontend only
npm run build            # Production build (both)
npm start                # Start production server
```

### Tests (Backend Only)
Tests use Vitest. There are no frontend tests configured.
```bash
cd backend && npm test                   # Run all tests once
cd backend && npm run test:watch         # Watch mode
cd backend && npm run test:coverage      # Coverage report (v8 provider)
cd backend && npx vitest run tests/attackDetection.test.ts  # Single test file
```

Test files live in `backend/tests/` and `backend/src/**/*.test.ts`. Config: `backend/vitest.config.ts`.

### Docker (Development Services)
```bash
docker-compose -f docker-compose.dev.yml up -d   # PostgreSQL (5433), Redis (6380), Adminer (8080)
```

### Admin CLI (from backend/)
```bash
npm run admin:create     # Create admin user
npm run admin:list       # List admin users
npm run admin            # Interactive admin CLI menu
```

### Security Audits
```bash
npm run security:audit   # npm audit for both workspaces
npm run security:full    # Audit + license check
```

### Notes
- No ESLint or Prettier is configured. No `lint` or `format` scripts exist.
- Backend builds with `tsc` (CommonJS output). Frontend builds with Vite.
- Environment config: copy `backend/.env.example` to `backend/.env`. Key settings: database (PostgreSQL, port 5433 in dev), storage provider, CORS origin, metadata encryption key.

## Architecture

### Encryption Model (Core Concept)
This is the most important architectural concept: the server is intentionally unable to decrypt files.
1. Browser generates AES key + salt → encrypts file using RFC 8188 (AES-128-GCM, HKDF key derivation)
2. Encrypted blob is uploaded to the server
3. Key and salt are embedded in the URL fragment (`#key=...&salt=...`), which browsers never send to servers
4. Recipient's browser extracts keys from fragment, downloads encrypted blob, decrypts client-side

Frontend encryption: `frontend/src/crypto/rfc8188.ts` (`ClientCrypto` class)
Chunked upload for large files: `frontend/src/utils/chunkedUpload.ts` (10MB chunks, constant ~30MB memory)

### Backend
- **Entry point**: `backend/src/index.ts` — Express server with middleware chain: security headers → attack detection → rate limiting → routes
- **Routes** (`backend/src/routes/`): `upload.ts` (legacy single-file), `upload-chunked.ts` (large files via init/chunk/finalize), `download.ts`, `admin.ts`, `admin-auth.ts`, `security.ts`
- **Storage abstraction** (`backend/src/storage/`): `StorageManager` with pluggable providers. Currently only `LocalStorageProvider`. `FileManagerV2` (database-backed, primary) and `FileManager` (filesystem-only, fallback) are selected automatically based on database availability.
- **Services** (`backend/src/services/`): `ChunkedUploadManager` (temp chunk assembly), `MetadataEncryption` (AES-256-GCM server-side encryption of filenames/IPs), `AttackLogger`, `BanManager`, `CertificateTransparencyMonitor`
- **Auth** (`backend/src/auth/`): JWT with HTTP-only cookies, TOTP MFA via speakeasy
- **Database**: PostgreSQL via `pg` library. Schema in `backend/database/schema.sql`. Models in `backend/src/database/`. Falls back to filesystem JSON files if database unavailable.

### Frontend
- **Entry**: `frontend/src/main.tsx` → React Router v6 with routes: `/` (upload), `/download/:id`, `/admin`, `/security`
- **Key components**: `Upload.tsx`, `Download.tsx`, `Admin.tsx`, `AdminLogin.tsx`, `SecurityDashboard.tsx`
- **State management**: React Context (`UploadContext.tsx`, `ToastContext.tsx`)
- **Styling**: Tailwind CSS with custom glassmorphism theme
- **Dev proxy**: Vite proxies `/api/*` to `http://localhost:3001` in development

### Chunked Upload Flow (Large Files)
Frontend: `chunkedUpload()` → Backend: `POST /api/upload/chunked/init` → `POST .../chunk/:uploadId` (repeated) → `POST .../finalize/:uploadId`. The `ChunkedUploadManager` service handles temp storage and assembly. Stale uploads are cleaned up after 2 hours.

### Dual File Manager System
`FileManagerV2` uses PostgreSQL for metadata + storage provider for file data. `FileManager` uses filesystem with JSON metadata files. The server checks database connectivity at startup and picks accordingly. Both expose similar interfaces but `FileManagerV2` adds metadata encryption and audit trails.

### Attack Detection
Middleware in `backend/src/middleware/` detects common attack patterns (WordPress probes, config file access, shell injection) and auto-bans IPs. Bans stored in `backend/data/ip-bans.json`. Logs in `backend/data/attack-log.json`.
