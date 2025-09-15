-- PostgreSQL User Security and Privilege Management
-- This script implements the principle of least privilege for database users
-- Execute as superuser (postgres)

-- =============================================================================
-- USER PRIVILEGE AUDIT AND HARDENING
-- =============================================================================

\echo '=== Database User Security Implementation ==='
\echo 'This script will create secure user accounts with minimal privileges'
\echo ''

-- Create dedicated users with specific roles
\echo '1. Creating secure database users...'

-- Application user (minimal privileges)
DO $$
BEGIN
    -- Create application user if not exists
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'whirlcrypt_user') THEN
        CREATE ROLE whirlcrypt_user LOGIN
        PASSWORD 'CHANGE_THIS_PASSWORD'
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
        CONNECTION LIMIT 10;
        
        COMMENT ON ROLE whirlcrypt_user IS 'Application user for Whirlcrypt - minimal privileges';
    END IF;
    
    -- Create admin user for database administration
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'whirlcrypt_admin') THEN
        CREATE ROLE whirlcrypt_admin LOGIN
        PASSWORD 'CHANGE_THIS_ADMIN_PASSWORD'
        NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION
        CONNECTION LIMIT 5;
        
        COMMENT ON ROLE whirlcrypt_admin IS 'Administrative user for Whirlcrypt database management';
    END IF;
    
    -- Create backup user (read-only access)
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'whirlcrypt_backup') THEN
        CREATE ROLE whirlcrypt_backup LOGIN
        PASSWORD 'CHANGE_THIS_BACKUP_PASSWORD'
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
        CONNECTION LIMIT 2;
        
        COMMENT ON ROLE whirlcrypt_backup IS 'Backup user for Whirlcrypt - read-only access';
    END IF;
END
$$;

-- Grant minimal required privileges to application user
\echo '2. Granting minimal privileges to application user...'

-- Connect to the application database
\c whirlcrypt_dev

-- Grant database connection
GRANT CONNECT ON DATABASE whirlcrypt_dev TO whirlcrypt_user;

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO whirlcrypt_user;

-- Grant table privileges (only what's needed)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE files TO whirlcrypt_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admin_users TO whirlcrypt_user;

-- Grant sequence privileges for auto-increment columns
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO whirlcrypt_user;

-- Grant privileges for future tables (if schema changes)
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO whirlcrypt_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
GRANT USAGE, SELECT ON SEQUENCES TO whirlcrypt_user;

-- Admin user privileges
\echo '3. Granting administrative privileges...'

GRANT CONNECT ON DATABASE whirlcrypt_dev TO whirlcrypt_admin;
GRANT ALL PRIVILEGES ON SCHEMA public TO whirlcrypt_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO whirlcrypt_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO whirlcrypt_admin;

-- Future privileges for admin
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
GRANT ALL PRIVILEGES ON TABLES TO whirlcrypt_admin;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
GRANT ALL PRIVILEGES ON SEQUENCES TO whirlcrypt_admin;

-- Backup user privileges (read-only)
\echo '4. Granting backup user privileges...'

GRANT CONNECT ON DATABASE whirlcrypt_dev TO whirlcrypt_backup;
GRANT USAGE ON SCHEMA public TO whirlcrypt_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO whirlcrypt_backup;

-- Future read privileges for backup user
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
GRANT SELECT ON TABLES TO whirlcrypt_backup;

-- =============================================================================
-- SECURITY HARDENING MEASURES
-- =============================================================================

\echo '5. Implementing security hardening measures...'

-- Revoke public schema privileges from public role
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE whirlcrypt_dev FROM PUBLIC;

-- Remove dangerous functions access (if they exist)
-- These functions can be used for privilege escalation
DO $$
DECLARE
    func_name text;
    dangerous_functions text[] := ARRAY[
        'lo_import', 'lo_export', 'lo_unlink',
        'pg_read_file', 'pg_write_file', 'pg_ls_dir',
        'pg_read_binary_file', 'pg_stat_file'
    ];
BEGIN
    FOREACH func_name IN ARRAY dangerous_functions
    LOOP
        BEGIN
            EXECUTE format('REVOKE ALL ON FUNCTION %I FROM PUBLIC', func_name);
            EXECUTE format('REVOKE ALL ON FUNCTION %I FROM whirlcrypt_user', func_name);
        EXCEPTION
            WHEN undefined_function THEN
                -- Function doesn't exist, skip
                NULL;
        END;
    END LOOP;
END
$$;

-- =============================================================================
-- PASSWORD POLICY ENFORCEMENT
-- =============================================================================

\echo '6. Setting up password policies...'

-- Set password expiration (optional - adjust as needed)
-- ALTER ROLE whirlcrypt_user VALID UNTIL '2025-12-31';
-- ALTER ROLE whirlcrypt_admin VALID UNTIL '2025-12-31';
-- ALTER ROLE whirlcrypt_backup VALID UNTIL '2025-12-31';

-- =============================================================================
-- AUDIT AND VERIFICATION
-- =============================================================================

\echo '7. Verifying user privileges...'

-- Show created users and their privileges
SELECT 
    rolname as username,
    rolsuper as is_superuser,
    rolcreaterole as can_create_roles,
    rolcreatedb as can_create_databases,
    rolcanlogin as can_login,
    rolconnlimit as connection_limit,
    rolvaliduntil as password_expiry
FROM pg_roles 
WHERE rolname LIKE 'whirlcrypt_%'
ORDER BY rolname;

-- Show table privileges
SELECT 
    grantee,
    table_name,
    privilege_type
FROM information_schema.table_privileges 
WHERE grantee LIKE 'whirlcrypt_%'
ORDER BY grantee, table_name, privilege_type;

\echo ''
\echo '=== IMPORTANT SECURITY NOTES ==='
\echo '1. Change all default passwords immediately'
\echo '2. Use strong, unique passwords for each user'
\echo '3. Consider using certificate-based authentication'
\echo '4. Regularly audit user privileges'
\echo '5. Monitor authentication logs for suspicious activity'
\echo '6. Implement password rotation policies'
\echo '7. Remove unused user accounts'
\echo ''
\echo '=== NEXT STEPS ==='
\echo '1. Update application configuration with new user credentials'
\echo '2. Test application functionality with new user'
\echo '3. Update backup scripts to use backup user'
\echo '4. Configure monitoring for the admin user'
\echo '5. Document user roles and responsibilities'
