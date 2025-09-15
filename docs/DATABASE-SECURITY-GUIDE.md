# PostgreSQL Security Hardening Guide for Whirlcrypt

This comprehensive guide provides step-by-step instructions for securing your PostgreSQL database installation for the Whirlcrypt application.

## 🎯 **Security Objectives**

- **Principle of Least Privilege**: Users have only the minimum permissions required
- **Defense in Depth**: Multiple layers of security controls
- **Audit and Monitoring**: Comprehensive logging for security analysis
- **Encryption**: All connections and sensitive data encrypted
- **Access Control**: Strict authentication and authorization

## 📋 **Quick Security Checklist**

- [ ] PostgreSQL configuration hardened (`postgresql.conf`)
- [ ] Authentication security configured (`pg_hba.conf`)
- [ ] User privileges audited and minimized
- [ ] Dangerous extensions and functions disabled
- [ ] Comprehensive logging enabled
- [ ] SSL/TLS encryption configured
- [ ] Backup security implemented
- [ ] Network access restricted
- [ ] Monitoring and alerting set up

## 🔧 **Implementation Steps**

### 1. **Backup Current Configuration**

```bash
# Backup existing configuration files
sudo cp /etc/postgresql/*/main/postgresql.conf /etc/postgresql/*/main/postgresql.conf.backup
sudo cp /etc/postgresql/*/main/pg_hba.conf /etc/postgresql/*/main/pg_hba.conf.backup
```

### 2. **Apply Security Configuration**

```bash
# Copy security templates to PostgreSQL configuration directory
sudo cp docs/postgresql-security.conf /etc/postgresql/*/main/postgresql.conf
sudo cp docs/pg_hba-security.conf /etc/postgresql/*/main/pg_hba.conf

# Set proper permissions
sudo chown postgres:postgres /etc/postgresql/*/main/*.conf
sudo chmod 640 /etc/postgresql/*/main/*.conf
```

### 3. **Run Security Audit**

```bash
# Execute security audit script
sudo -u postgres psql -f docs/database-security-audit.sql > security-audit-report.txt

# Review the audit report
cat security-audit-report.txt
```

### 4. **Implement User Security**

```bash
# Create secure users with minimal privileges
sudo -u postgres psql -f docs/database-user-security.sql

# Update application configuration with new credentials
# Edit backend/.env with new database credentials
```

### 5. **Secure Extensions and Functions**

```bash
# Audit and secure extensions
sudo -u postgres psql -f docs/database-extension-security.sql
```

### 6. **Configure Logging**

```bash
# Create secure log directory
sudo mkdir -p /var/log/postgresql
sudo chown postgres:postgres /var/log/postgresql
sudo chmod 750 /var/log/postgresql

# Apply logging configuration (already in postgresql.conf)
# Restart PostgreSQL to apply changes
sudo systemctl restart postgresql
```

### 7. **Test Configuration**

```bash
# Test database connection with new credentials
PGPASSWORD='your_new_password' psql -h localhost -U whirlcrypt_user -d whirlcrypt_dev -c "SELECT version();"

# Verify SSL is working (if configured)
PGPASSWORD='your_new_password' psql "sslmode=require host=localhost user=whirlcrypt_user dbname=whirlcrypt_dev"
```

## 🔐 **Security Configuration Files**

### Core Configuration Files

| File | Purpose | Location |
|------|---------|----------|
| `postgresql-security.conf` | Main PostgreSQL security settings | `/etc/postgresql/*/main/postgresql.conf` |
| `pg_hba-security.conf` | Authentication and access control | `/etc/postgresql/*/main/pg_hba.conf` |

### Security Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `database-security-audit.sql` | Comprehensive security audit | `psql -f docs/database-security-audit.sql` |
| `database-user-security.sql` | User privilege management | `psql -f docs/database-user-security.sql` |
| `database-extension-security.sql` | Extension security audit | `psql -f docs/database-extension-security.sql` |

### Configuration Templates

| Template | Purpose | Usage |
|----------|---------|-------|
| `database-logging-security.conf` | Logging configuration | Merge into `postgresql.conf` |

## 🚨 **Critical Security Settings**

### Connection Security
- **Max Connections**: Limited to 50 (adjust based on needs)
- **SSL Required**: All connections must use SSL/TLS
- **Connection Timeouts**: Prevent resource exhaustion
- **IP Restrictions**: Limit connections to specific IPs

### Authentication Security
- **Password Encryption**: SCRAM-SHA-256 (strongest available)
- **No Trust Authentication**: All connections require authentication
- **Connection Limits**: Per-user connection limits enforced

### Logging Security
- **Comprehensive Logging**: All connections, statements, and errors logged
- **Secure Log Files**: Proper permissions and rotation
- **Audit Trail**: Complete forensic capability

## 📊 **Monitoring and Maintenance**

### Daily Monitoring
```sql
-- Check for failed authentication attempts
SELECT * FROM security_extension_monitor ORDER BY risk_level DESC;

-- Monitor active connections
SELECT pid, usename, client_addr, state, query_start 
FROM pg_stat_activity WHERE state = 'active';
```

### Weekly Reviews
- Review security audit reports
- Check log files for suspicious activity
- Verify user privileges haven't changed
- Update passwords if required

### Monthly Tasks
- Run complete security audit
- Review and update access controls
- Test backup and recovery procedures
- Update security documentation

## 🔄 **Backup and Recovery Security**

### Secure Backup Procedures
```bash
# Create encrypted backup
pg_dump -h localhost -U whirlcrypt_backup whirlcrypt_dev | \
gpg --cipher-algo AES256 --compress-algo 1 --symmetric \
--output backup-$(date +%Y%m%d).sql.gpg

# Verify backup integrity
gpg --decrypt backup-$(date +%Y%m%d).sql.gpg | head -20
```

### Recovery Testing
- Test backup restoration monthly
- Verify data integrity after restoration
- Document recovery procedures
- Train team on recovery processes

## 🚀 **Production Deployment**

### Pre-Deployment Checklist
- [ ] All security configurations tested in staging
- [ ] SSL certificates installed and configured
- [ ] Firewall rules configured
- [ ] Monitoring and alerting set up
- [ ] Backup procedures tested
- [ ] Team trained on security procedures

### Post-Deployment Verification
- [ ] Security audit passed
- [ ] All connections using SSL
- [ ] Logging working correctly
- [ ] Monitoring alerts functional
- [ ] Backup procedures working

## 📞 **Support and Troubleshooting**

### Common Issues

**Connection Refused**
- Check `pg_hba.conf` for correct IP/user combinations
- Verify SSL certificates if using SSL
- Check firewall rules

**Authentication Failed**
- Verify password encryption method matches
- Check user exists and has login privileges
- Review authentication logs

**Performance Issues**
- Review slow query logs
- Check connection limits
- Monitor resource usage

### Getting Help
- Review PostgreSQL security documentation
- Check application logs for specific errors
- Use security audit scripts to identify issues
- Consult PostgreSQL community resources

## 🔗 **Additional Resources**

- [PostgreSQL Security Documentation](https://www.postgresql.org/docs/current/security.html)
- [PostgreSQL SSL Configuration](https://www.postgresql.org/docs/current/ssl-tcp.html)
- [Database Security Best Practices](https://www.postgresql.org/docs/current/security-best-practices.html)

## 🛠️ **Automated Deployment Script**

Use the provided deployment script for automated security hardening:

```bash
# Make script executable
chmod +x scripts/deploy-database-security.sh

# Run security hardening (with prompts)
./scripts/deploy-database-security.sh

# Run in automated mode (no prompts - use with caution)
./scripts/deploy-database-security.sh --auto
```

---

**⚠️ Important**: Always test security configurations in a development environment before applying to production. Keep backups of original configuration files.
