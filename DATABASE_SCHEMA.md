# Whirlcrypt Database Schema Documentation

## 📊 Overview

Whirlcrypt v2.0 uses PostgreSQL to store **metadata only** - no sensitive file content or encryption keys are ever stored in the database. The database serves as a tracking and management layer for encrypted files stored on the filesystem.

## 🔒 Security Model

### What IS Stored
- ✅ File metadata (filename, size, content type)
- ✅ Storage location paths
- ✅ Expiration timestamps
- ✅ Download statistics
- ✅ Access logs (IP addresses, timestamps)

### What is NOT Stored
- ❌ **Encryption keys** (stored in URL fragments only)
- ❌ **File content** (stored encrypted on filesystem)
- ❌ **User data** (no user accounts)
- ❌ **Sensitive information** (zero-knowledge architecture)

## 📋 Database Schema

### Database Information
- **Engine**: PostgreSQL 16.10
- **Database Name**: `whirlcrypt_dev`
- **User**: `whirlcrypt_user`
- **Extensions**: `uuid-ossp` (for UUID generation)

## 📁 Tables

### 1. `files` Table

Primary table for tracking uploaded files and their metadata.

```sql
CREATE TABLE files (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename         VARCHAR(255) NOT NULL,
    original_size    BIGINT NOT NULL,
    encrypted_size   BIGINT NOT NULL,
    content_type     VARCHAR(255) NOT NULL,
    storage_path     VARCHAR(500) NOT NULL,
    storage_provider VARCHAR(50) NOT NULL DEFAULT 'local',
    expires_at       TIMESTAMP WITH TIME ZONE NOT NULL,
    max_downloads    INTEGER DEFAULT NULL,
    download_count   INTEGER DEFAULT 0,
    is_active        BOOLEAN DEFAULT true,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### Column Details

| Column | Type | Description | Security Notes |
|--------|------|-------------|----------------|
| `id` | UUID | Unique file identifier | Used in download URLs |
| `filename` | VARCHAR(255) | Original filename | Sanitized, no path traversal |
| `original_size` | BIGINT | Size before encryption | For client validation |
| `encrypted_size` | BIGINT | Size after encryption | Actual storage size |
| `content_type` | VARCHAR(255) | MIME type | Validated against allowed types |
| `storage_path` | VARCHAR(500) | File location on disk | Relative path only |
| `storage_provider` | VARCHAR(50) | Storage backend | 'local', 's3', etc. |
| `expires_at` | TIMESTAMP | Expiration time | Automatic cleanup |
| `max_downloads` | INTEGER | Download limit | NULL = unlimited |
| `download_count` | INTEGER | Current downloads | Incremented on access |
| `is_active` | BOOLEAN | File availability | Soft delete flag |
| `created_at` | TIMESTAMP | Upload time | Audit trail |
| `updated_at` | TIMESTAMP | Last modification | Auto-updated |

#### Indexes
- `files_pkey` (PRIMARY KEY on `id`)
- `idx_files_expires_at` (for cleanup queries)
- `idx_files_is_active` (for active file queries)
- `idx_files_created_at` (for chronological queries)

### 2. `download_logs` Table

Audit log for all download attempts (successful and failed).

```sql
CREATE TABLE download_logs (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_id       UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    ip_address    INET,
    user_agent    TEXT,
    success       BOOLEAN NOT NULL,
    error_message TEXT,
    downloaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### Column Details

| Column | Type | Description | Security Notes |
|--------|------|-------------|----------------|
| `id` | UUID | Unique log entry ID | Primary key |
| `file_id` | UUID | Reference to files table | CASCADE delete |
| `ip_address` | INET | Client IP address | For rate limiting/analysis |
| `user_agent` | TEXT | Browser/client info | For security analysis |
| `success` | BOOLEAN | Download success status | Audit trail |
| `error_message` | TEXT | Error details if failed | Debugging info |
| `downloaded_at` | TIMESTAMP | Access time | Audit trail |

#### Indexes
- `download_logs_pkey` (PRIMARY KEY on `id`)
- `idx_download_logs_file_id` (for file-specific logs)
- `idx_download_logs_downloaded_at` (for time-based queries)
- `idx_download_logs_ip_address` (for IP-based analysis)

## ⚙️ Functions & Triggers

### 1. `update_updated_at_column()` Function

Automatically updates the `updated_at` timestamp when a record is modified.

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';
```

**Trigger**: `update_files_updated_at` on `files` table

### 2. `cleanup_expired_files()` Function

Removes expired files and files that have exceeded download limits.

```sql
CREATE OR REPLACE FUNCTION cleanup_expired_files()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM files 
    WHERE expires_at < CURRENT_TIMESTAMP 
    OR (max_downloads IS NOT NULL AND download_count >= max_downloads);
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ language 'plpgsql';
```

**Usage**: Called by cron job every 60 minutes (configurable)

## 🔐 Security Considerations

### Data Protection
1. **No Encryption Keys**: Keys never touch the database
2. **Metadata Only**: File content stored separately, encrypted
3. **Audit Trail**: All access attempts logged
4. **Automatic Cleanup**: Expired data automatically removed

### Access Control
1. **Database User**: Limited privileges (`whirlcrypt_user`)
2. **Prepared Statements**: SQL injection prevention
3. **Connection Pooling**: DoS protection
4. **Input Validation**: All data sanitized before storage

### Privacy
1. **IP Logging**: For security analysis only
2. **No User Tracking**: No persistent user identification
3. **Retention Limits**: Data automatically expires
4. **Secure Deletion**: No data recovery after expiration

## 📈 Performance Optimizations

### Indexing Strategy
- **Primary Keys**: UUID with B-tree indexes
- **Time-based Queries**: Indexes on timestamp columns
- **Status Queries**: Index on `is_active` for fast filtering
- **Foreign Keys**: Automatic indexes for referential integrity

### Query Patterns
- **File Lookup**: By UUID (primary key)
- **Cleanup**: By expiration time and download count
- **Statistics**: Aggregated queries with proper indexes
- **Audit**: Time-range queries on download logs

## 🛠️ Maintenance

### Regular Tasks
1. **Cleanup**: Automated via cron job
2. **Statistics**: Available via `/api/admin/stats`
3. **Health Check**: Database connectivity via `/api/health`
4. **Backup**: Standard PostgreSQL backup procedures

### Monitoring Queries

```sql
-- Active files count
SELECT COUNT(*) FROM files WHERE is_active = true AND expires_at > NOW();

-- Storage usage
SELECT SUM(encrypted_size) as total_storage FROM files WHERE is_active = true;

-- Download statistics
SELECT COUNT(*) as total_downloads FROM download_logs WHERE success = true;

-- Recent activity
SELECT COUNT(*) as recent_uploads 
FROM files 
WHERE created_at > NOW() - INTERVAL '24 hours';
```

## ⚠️ Current Security Gaps

### Admin Interface
- **No Authentication**: Admin endpoints unprotected
- **Full Access**: Anyone can view statistics and trigger cleanup
- **Recommendation**: Implement admin authentication before production

### Potential Improvements
1. **Admin Authentication**: Username/password or API keys
2. **Rate Limiting**: Per-IP limits in database
3. **User Sessions**: Optional user accounts for file management
4. **Encryption at Rest**: Database-level encryption for metadata
5. **Audit Enhancements**: More detailed logging and alerting

## 📊 Current Statistics

Based on the current deployment:
- **Total Files**: 0
- **Active Files**: 0
- **Total Downloads**: 0
- **Storage Used**: 0 bytes

The database is ready and operational for secure file sharing operations.
