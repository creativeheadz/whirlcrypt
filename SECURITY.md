# Security Policy

## 🛡️ Security Architecture

### End-to-End Encryption Model

Whirlcrypt implements a **zero-knowledge** security model where the server never has access to decryption keys or plaintext files.

#### Encryption Flow

1. **Key Generation** (Client-side)
   - 128-bit AES-GCM key generated using Web Crypto API
   - 16-byte salt generated with crypto-secure randomness
   - Keys never transmitted to or stored on server

2. **File Encryption** (Client-side)
   - Files encrypted using RFC 8188 standard
   - AES-128-GCM with 4KB record size
   - Each record has unique nonce derived from record sequence
   - Encrypted data structure: `salt + encrypted_records`

3. **Key Distribution**
   - Encryption keys embedded in URL fragment (`#key=...&salt=...`)
   - URL fragments not sent to server (browser security)
   - Keys Base64-encoded for URL safety

4. **Server Storage**
   - Only encrypted blobs stored on server
   - Server cannot decrypt files without keys
   - Metadata stored separately (filename, size, expiration)

#### Cryptographic Details

```
Encryption: AES-128-GCM
Key Size: 128 bits (16 bytes)
Salt Size: 128 bits (16 bytes)
Record Size: 4096 bytes
Nonce Generation: RFC 8188 compliant
Key Derivation: HKDF-SHA256
```

### Server-Side Security

#### Content Security Policy

```http
default-src 'self';
style-src 'self' 'unsafe-inline';
script-src 'self';
img-src 'self' data: blob:;
connect-src 'self';
font-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self';
```

#### Security Headers

- `X-Frame-Options: DENY` - Prevents clickjacking
- `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
- `X-XSS-Protection: 1; mode=block` - XSS protection
- `Referrer-Policy: strict-origin-when-cross-origin` - Referrer control
- `Strict-Transport-Security` - HTTPS enforcement (production)

#### Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|---------|
| `/api/upload` | 10 requests | 15 minutes |
| Other endpoints | 100 requests | 15 minutes |

**Rate limiting by IP address with sliding window algorithm.**

#### Input Validation

- File size limits: Max 100MB (configurable)
- File type validation via MIME type checking
- Filename sanitization and length limits
- Request payload size limits via Express middleware

#### Database Security

- **PostgreSQL with prepared statements** - SQL injection prevention
- **Connection pooling** - Resource management and DoS protection
- **Environment variable configuration** - Credentials not hardcoded
- **Graceful degradation** - Falls back to filesystem if DB unavailable

### Data Protection

#### Data at Rest

- **Files**: Encrypted with client keys, server cannot decrypt
- **Database**: File metadata only (no sensitive content)
- **Logs**: No encryption keys or sensitive data logged

#### Data in Transit

- **HTTPS enforced** in production
- **Client-side encryption** before network transmission
- **No sensitive data in HTTP headers** (keys in URL fragments only)

#### Data Retention

- **Automatic expiration**: Files deleted after retention period
- **Configurable retention**: 1 hour to 7 days maximum
- **Secure deletion**: Files removed from both database and storage
- **No data recovery**: Once expired, files cannot be recovered

### Authentication & Authorization

#### Current State (Development)
- **No user authentication** required
- **Admin endpoints** have no authentication ⚠️
- **Rate limiting** as primary protection mechanism

#### Production Recommendations

1. **Admin Authentication**
   ```bash
   # Add to .env
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=secure_random_password
   ADMIN_SESSION_SECRET=another_secure_secret
   ```

2. **JWT-based API keys** for programmatic access
3. **Optional user accounts** for file management
4. **IP whitelisting** for admin endpoints

### Infrastructure Security

#### Docker Security

- **Multi-stage builds** - Minimal production images
- **Non-root user** - Application runs as non-privileged user
- **Secrets management** - Environment variables for sensitive data
- **Network isolation** - Services communicate via Docker networks

#### Database Security

```yaml
# Production PostgreSQL configuration
PostgreSQL:
  - SSL connections required
  - Database user with minimal privileges
  - Regular security updates
  - Backup encryption
  - Connection limits
```

#### Storage Security

- **Local**: File permissions 600 (owner read/write only)
- **S3**: Server-side encryption at rest
- **Access logging** for audit trails

### Threat Model

#### Protected Against

✅ **Man-in-the-middle attacks** - End-to-end encryption
✅ **Server-side data breaches** - Zero-knowledge architecture
✅ **SQL injection** - Prepared statements and parameterized queries
✅ **XSS attacks** - CSP and input sanitization
✅ **CSRF attacks** - SameSite cookies and CSRF tokens
✅ **DoS attacks** - Rate limiting and connection limits
✅ **Clickjacking** - X-Frame-Options header
✅ **MIME sniffing** - X-Content-Type-Options header

#### Current Limitations

⚠️ **Admin interface** - No authentication (development only)
⚠️ **Brute force attacks** - Limited rate limiting protection
⚠️ **Advanced persistent threats** - No behavioral analysis
⚠️ **Physical server access** - Standard OS-level protections only
⚠️ **Key management** - Users responsible for sharing URLs securely

### Secure Development Practices

#### Code Security

- **Dependency scanning** - Regular npm audit
- **Static code analysis** - ESLint security rules
- **No secrets in code** - Environment variables only
- **Input sanitization** - All user inputs validated
- **Error handling** - No sensitive information in error messages

#### Deployment Security

```bash
# Security checklist for production
□ Change all default passwords
□ Enable HTTPS with valid certificates
□ Configure firewall rules
□ Set up automated backups
□ Enable audit logging
□ Configure monitoring and alerts
□ Regular security updates
□ Penetration testing
```

## 🚨 Security Reporting

### Responsible Disclosure

If you discover a security vulnerability, please report it responsibly:

1. **DO NOT** create a public GitHub issue
2. **Email**: security@example.com (replace with actual contact)
3. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
   - Suggested fix (if available)

### Response Timeline

- **Initial response**: Within 24 hours
- **Vulnerability assessment**: Within 48 hours
- **Fix development**: Within 7 days for critical issues
- **Public disclosure**: After fix is deployed (coordinated disclosure)

### Scope

**In Scope:**
- Server-side vulnerabilities
- Client-side security issues
- Cryptographic implementation flaws
- Authentication/authorization bypasses
- Data exposure vulnerabilities

**Out of Scope:**
- Social engineering attacks
- Physical access attacks
- DoS attacks (unless critical)
- Third-party dependency issues (report upstream)

## 🏆 Security Best Practices

### For Users

1. **Share URLs securely** - Encryption keys are in the URL
2. **Use HTTPS** - Ensure encrypted transmission
3. **Verify file integrity** - Check file after download
4. **Don't share URLs publicly** - Anyone with URL can download
5. **Use appropriate retention** - Shorter retention = better security

### For Administrators

1. **Enable authentication** - Secure admin endpoints
2. **Use HTTPS** - SSL/TLS certificates required
3. **Regular updates** - Keep dependencies current
4. **Monitor logs** - Watch for suspicious activity
5. **Backup strategy** - Secure, encrypted backups
6. **Network security** - Firewall and VPN access

### For Developers

1. **Security code reviews** - All PRs reviewed for security
2. **Dependency audits** - Regular `npm audit` checks
3. **Environment separation** - Dev/staging/prod isolation
4. **Secrets management** - Never commit credentials
5. **Regular penetration testing** - Third-party security audits

## 📋 Security Compliance

### Standards Compliance

- **RFC 8188** - Encrypted Content-Encoding for HTTP
- **OWASP Top 10** - Protection against common vulnerabilities
- **NIST Cybersecurity Framework** - Security controls implementation

### Audit Logs

The application maintains logs for:
- File upload events (IP, timestamp, file size)
- Download attempts (successful and failed)
- Admin actions (configuration changes)
- Security events (rate limit hits, validation failures)

**Note**: Encryption keys are never logged.

### Data Privacy

- **No user tracking** - No analytics or tracking cookies
- **Minimal metadata** - Only necessary file information stored
- **Automatic deletion** - No permanent data retention
- **No data sharing** - Files not shared with third parties

---

**Security Version**: v2.0
**Last Updated**: 2024
**Next Review**: Every 6 months or after major changes