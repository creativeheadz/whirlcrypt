# Whirlcrypt API Documentation

Complete API reference for Whirlcrypt secure file sharing platform.

> **Latest Update**: Fixed GitHub Pages deployment workflow

## Base URL

```
http://localhost:3001/api  # Development
https://your-domain.com/api  # Production
```

## Authentication

Most endpoints are public, but some require encryption keys or are rate-limited:
- **Upload endpoints**: Rate limited (10 uploads per 15 min per IP)
- **Download endpoints**: Require encryption key in header or query
- **Admin endpoints**: No authentication (add auth for production!)

---

## Upload Endpoints

### Upload File

**`POST /upload`**

Upload an encrypted file with metadata.

**Headers:**
```
Content-Type: multipart/form-data
```

**Body (FormData):**
```javascript
{
  file: File,                    // The file to upload
  key: string,                   // Hex-encoded encryption key
  salt: string,                  // Hex-encoded salt
  retentionHours?: number        // Optional, defaults to 24
}
```

**Response (201):**
```json
{
  "id": "uuid-string",
  "downloadUrl": "/api/download/uuid-string", 
  "expiresAt": "2025-09-13T10:00:00.000Z"
}
```

**Error Responses:**
- `400` - Missing file, invalid retention period, or missing encryption params
- `413` - File too large (>100MB default)
- `429` - Rate limit exceeded
- `500` - Upload failed

**Example:**
```javascript
const formData = new FormData();
formData.append('file', fileBlob);
formData.append('key', 'a1b2c3d4e5f6...'); // 32-char hex
formData.append('salt', '1234567890ab...'); // 32-char hex  
formData.append('retentionHours', '48');

const response = await fetch('/api/upload', {
  method: 'POST',
  body: formData
});
```

---

## Download Endpoints

### Download File

**`GET /api/download/:id`**

Download the encrypted file bytes. No key is sent: the decryption key and salt
travel in the share URL's fragment (`/download/:id#v=2&k=...&s=...`), which
browsers never transmit, and the client decrypts locally after downloading.

**Response (200):**
- **Content-Type**: `application/octet-stream` (always; the payload is ciphertext)
- **Content-Disposition**: `attachment` (filename is inside the encrypted envelope)
- **Body**: Binary file data (still encrypted; decrypt client-side per RFC 8188)

**Error Responses:**
- `404` - File not found or expired
- `429` - Too many downloads (30 per 15 minutes per IP)
- `500` - Download failed

**Example:**
```javascript
const response = await fetch(`/api/download/${fileId}`);
// No headers needed. Decrypt response bytes in the browser using the key
// and salt parsed from the share URL fragment.

if (response.ok) {
  const blob = await response.blob();
  // Decrypt, then trigger download or process file
}
```

### Get File Info

**`GET /download/:id/info`**

Get file metadata without downloading the actual file.

**Response (200):**
```json
{
  "filename": "document.pdf",
  "size": 1048576,
  "contentType": "application/pdf",
  "uploadDate": "2025-09-12T10:00:00.000Z",
  "expiresAt": "2025-09-13T10:00:00.000Z", 
  "downloadCount": 3
}
```

**Error Responses:**
- `404` - File not found or expired

---

## Admin Endpoints

### Get Storage Statistics

**`GET /admin/stats`**

Retrieve current storage statistics and configuration.

**Response (200):**
```json
{
  "totalFiles": 150,
  "totalSize": 524288000,
  "expiredFiles": 12,
  "config": {
    "maxFileSize": 104857600,
    "defaultRetentionHours": 24,
    "maxRetentionHours": 168,
    "allowedExtensions": null
  }
}
```

### Manual Cleanup

**`POST /admin/cleanup`**

Manually trigger cleanup of expired files.

**Response (200):**
```json
{
  "message": "Cleaned up 12 expired files",
  "cleanedCount": 12
}
```

### Get Configuration

**`GET /admin/config`**

Get current server configuration.

**Response (200):**
```json
{
  "retention": {
    "defaultRetentionHours": 24,
    "maxRetentionHours": 168, 
    "cleanupIntervalMinutes": 60,
    "maxFileSize": 104857600,
    "allowedExtensions": null
  },
  "rateLimiting": {
    "windowMs": 900000,
    "maxRequests": 100
  },
  "maxFileSize": 104857600
}
```

### Update Configuration  

**`PUT /admin/config`**

Update server configuration (runtime only).

**Body:**
```json
{
  "defaultRetentionHours": 48,
  "maxRetentionHours": 336,
  "maxFileSize": 209715200
}
```

**Response (200):**
```json
{
  "message": "Configuration updated",
  "retention": {
    "defaultRetentionHours": 48,
    "maxRetentionHours": 336,
    "maxFileSize": 209715200
  }
}
```

---

## Health Check

### Service Health

**`GET /health`**

Check service status and version.

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2025-09-12T10:00:00.000Z",
  "version": "1.0.0"
}
```

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /upload` | 10 requests | 15 minutes |
| All other endpoints | 100 requests | 15 minutes |
| Download endpoints | No limit | - |

**Rate Limit Headers:**
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7  
X-RateLimit-Reset: 1694523600
```

---

## Security Features

### Request Security
- **CORS**: Configurable origins
- **CSP**: Strict content security policy
- **Rate Limiting**: Prevents abuse
- **Input Sanitization**: XSS protection
- **Security Headers**: HSTS, X-Frame-Options, etc.

### File Security  
- **End-to-end encryption**: Server never sees decryption keys
- **RFC 8188 compliance**: Industry standard encryption
- **Automatic expiration**: Files auto-delete
- **No metadata leaks**: Filenames encrypted

---

## Error Handling

All error responses follow this format:

```json
{
  "error": "Human-readable error message"
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `201` - Created (upload success)
- `400` - Bad Request (invalid input)
- `404` - Not Found (file expired/missing)
- `413` - File Too Large
- `429` - Rate Limit Exceeded
- `500` - Internal Server Error

---

## Development Examples

### Complete Upload/Download Flow

```javascript
// 1. Generate encryption keys (client-side)
const key = crypto.getRandomValues(new Uint8Array(16));
const salt = crypto.getRandomValues(new Uint8Array(16)); 

// 2. Encrypt file (using RFC 8188 implementation)
const encryptedFile = await encryptFile(originalFile, key, salt);

// 3. Upload encrypted file
const formData = new FormData();
formData.append('file', encryptedFile);
formData.append('key', arrayToHex(key));
formData.append('salt', arrayToHex(salt));
formData.append('retentionHours', '72');

const uploadResponse = await fetch('/api/upload', {
  method: 'POST',
  body: formData
});

const { id, downloadUrl, expiresAt } = await uploadResponse.json();

// 4. Create shareable URL with embedded keys (v2 fragment format; the
// fragment is never sent to the server)
const shareUrl = `${window.location.origin}/download/${id}#v=2&k=${toBase64Url(key)}&s=${toBase64Url(salt)}`;

// 5. Download file (when accessed via share URL) - no key header; parse the
// key and salt from the fragment, download the ciphertext, decrypt locally
const downloadResponse = await fetch(`/api/download/${id}`);

const encryptedBytes = await downloadResponse.blob();
// ... decrypt with the fragment key/salt, then use the plaintext ...
```

### Admin Dashboard Data

```javascript
// Get storage stats
const stats = await fetch('/api/admin/stats').then(r => r.json());

// Manual cleanup
const cleanup = await fetch('/api/admin/cleanup', { 
  method: 'POST' 
}).then(r => r.json());

// Update configuration
const newConfig = await fetch('/api/admin/config', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    defaultRetentionHours: 48,
    maxFileSize: 209715200  // 200MB
  })
}).then(r => r.json());
```

---

## Production Considerations

1. **Authentication**: Add API keys or JWT for admin endpoints
2. **HTTPS**: Always use TLS in production
3. **Database**: Consider PostgreSQL for metadata storage
4. **Cloud Storage**: Use S3/GCS for file storage at scale
5. **Monitoring**: Add logging and metrics collection
6. **Backup**: Implement backup strategies
7. **CDN**: Use CDN for static assets

---

## Client SDKs

Consider implementing client libraries for:
- **JavaScript/TypeScript** - Web and Node.js
- **Python** - CLI and automation tools  
- **Go** - High-performance integrations
- **Rust** - Systems integration

---

## Contributing

See our [Contributing Guide](CONTRIBUTING.md) for API development guidelines.

---

**Built with using RFC 8188 encryption standards**