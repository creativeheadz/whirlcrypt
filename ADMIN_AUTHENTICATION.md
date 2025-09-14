# 🔐 Whirlcrypt Admin Authentication System

## Overview

Whirlcrypt now includes a comprehensive admin authentication system with multi-factor authentication (MFA), JWT-based sessions, and a command-line interface for user management.

## 🚀 Quick Start

### 1. Create Initial Admin User
```bash
cd backend
npm run admin:create
```

This creates a default admin user:
- **Username**: `admin`
- **Email**: `admin@whirlcrypt.local`
- **Password**: `whirlcrypt123!`
- **MFA**: Disabled (initially)

### 2. Start the Server
```bash
npm run dev
```

### 3. Login via API
```bash
curl -X POST http://localhost:3001/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "whirlcrypt123!"}'
```

## 🔑 Authentication Flow

### Without MFA
1. **Login**: POST `/api/admin/auth/login` with username/password
2. **Response**: JWT token with 24-hour expiration
3. **Usage**: Include `Authorization: Bearer <token>` header

### With MFA
1. **Login**: POST `/api/admin/auth/login` with username/password
2. **Response**: Challenge token requiring MFA verification
3. **Verify**: POST `/api/admin/auth/mfa/verify` with challenge token and TOTP code
4. **Response**: Full JWT token with 24-hour expiration

## 🛡️ Security Features

### JWT Tokens
- **Algorithm**: HS256 with configurable secret
- **Expiration**: 24 hours (configurable)
- **Audience**: `whirlcrypt-admin`
- **Issuer**: `whirlcrypt`
- **Session Tracking**: Each token tied to database session

### Multi-Factor Authentication
- **TOTP**: Time-based One-Time Passwords (Google Authenticator compatible)
- **Backup Codes**: 10 single-use recovery codes
- **QR Codes**: Generated for easy setup
- **Secret Length**: 64 characters (Base32)

### Rate Limiting
- **Login Attempts**: 5 attempts per 15 minutes per IP
- **Account Lockout**: 30 minutes after 5 failed attempts
- **MFA Attempts**: 3 attempts per 5 minutes per IP

### Audit Logging
- **All Actions**: Login, logout, admin operations
- **Metadata**: IP address, user agent, timestamps
- **Success/Failure**: Detailed error tracking
- **Database Storage**: Persistent audit trail

## 🔧 CLI User Management

### Available Commands
```bash
# Interactive mode
npm run admin -- interactive

# Direct commands
npm run admin -- list-users
npm run admin -- add-user
npm run admin -- reset-password
npm run admin -- toggle-mfa
npm run admin -- delete-user
npm run admin -- audit-log
```

### Examples
```bash
# List all users
npm run admin -- list-users

# Enable MFA (interactive)
npm run admin -- interactive
# Select option 4, enter username

# View audit logs
npm run admin -- audit-log
```

## 🌐 API Endpoints

### Authentication
- `POST /api/admin/auth/login` - Initial login
- `POST /api/admin/auth/mfa/verify` - MFA verification
- `POST /api/admin/auth/logout` - Logout current session
- `POST /api/admin/auth/logout-all` - Logout all sessions
- `GET /api/admin/auth/me` - Current user info
- `POST /api/admin/auth/refresh` - Refresh token
- `GET /api/admin/auth/sessions` - Active sessions
- `GET /api/admin/auth/mfa/setup` - MFA setup info

### Protected Admin Endpoints
- `GET /api/admin/stats` - System statistics
- `POST /api/admin/cleanup` - Trigger file cleanup
- `GET /api/admin/config` - View configuration
- `PUT /api/admin/config` - Update configuration

## 🗄️ Database Schema

### Admin Users Table
```sql
CREATE TABLE admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    mfa_secret VARCHAR(64),
    mfa_enabled BOOLEAN DEFAULT false,
    mfa_backup_codes TEXT[],
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMPTZ,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

### Sessions Table
```sql
CREATE TABLE admin_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

### Audit Log Table
```sql
CREATE TABLE admin_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    username VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

## ⚙️ Configuration

### Environment Variables
```bash
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=24h

# Database (required for auth)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=whirlcrypt_dev
DB_USER=whirlcrypt_user
DB_PASSWORD=whirlcrypt_password
```

### Security Recommendations
1. **Change Default Password**: Immediately after first login
2. **Strong JWT Secret**: Use a cryptographically secure random string
3. **Enable MFA**: For all admin accounts
4. **Regular Audits**: Review audit logs periodically
5. **Network Security**: Use HTTPS in production
6. **Database Security**: Secure PostgreSQL installation

## 🚨 Security Warnings

### Critical Actions Required
1. **Change default admin password immediately**
2. **Set a strong JWT_SECRET in production**
3. **Enable MFA for all admin accounts**
4. **Use HTTPS in production environments**
5. **Regularly review audit logs**

### Current Status
- ✅ Admin endpoints are now protected
- ✅ JWT-based authentication implemented
- ✅ MFA support with TOTP and backup codes
- ✅ Rate limiting on authentication endpoints
- ✅ Comprehensive audit logging
- ✅ CLI user management tools
- ✅ Session management and tracking

## 🔍 Testing Authentication

### Test Login
```bash
# Login
curl -X POST http://localhost:3001/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "whirlcrypt123!"}'

# Use token for protected endpoints
curl -H "Authorization: Bearer <your-token>" \
  http://localhost:3001/api/admin/stats
```

### Test Protection
```bash
# This should fail with 401
curl http://localhost:3001/api/admin/stats
```

## 📝 Next Steps

1. **Production Deployment**: Configure HTTPS and secure environment
2. **User Interface**: Build web-based admin panel
3. **Advanced Features**: Role-based access control, API keys
4. **Monitoring**: Set up alerts for failed login attempts
5. **Backup**: Regular database backups including user data

---

**⚠️ IMPORTANT**: This system provides enterprise-grade security for your Whirlcrypt installation. All admin endpoints are now protected and require proper authentication.
