-- PostgreSQL Extension and Function Security Audit
-- This script audits and secures database extensions and functions
-- Execute as superuser (postgres)

-- =============================================================================
-- EXTENSION SECURITY AUDIT
-- =============================================================================

\echo '=== PostgreSQL Extension Security Audit ==='
\echo 'Auditing installed extensions and potentially dangerous functions'
\echo ''

-- List all installed extensions
\echo '1. CURRENTLY INSTALLED EXTENSIONS'
SELECT 
    e.extname as extension_name,
    e.extversion as version,
    n.nspname as schema,
    e.extrelocatable as relocatable,
    CASE 
        WHEN e.extname IN ('plpgsql', 'pg_stat_statements') THEN 'SAFE'
        WHEN e.extname IN ('dblink', 'file_fdw', 'postgres_fdw', 'adminpack') THEN 'HIGH RISK'
        WHEN e.extname IN ('pg_crypto', 'uuid-ossp', 'ltree', 'hstore') THEN 'MEDIUM RISK'
        ELSE 'REVIEW REQUIRED'
    END as risk_level,
    CASE 
        WHEN e.extname = 'plpgsql' THEN 'Core procedural language - required'
        WHEN e.extname = 'pg_stat_statements' THEN 'Query statistics - useful for monitoring'
        WHEN e.extname = 'dblink' THEN 'Remote database connections - potential security risk'
        WHEN e.extname = 'file_fdw' THEN 'File system access - high security risk'
        WHEN e.extname = 'postgres_fdw' THEN 'Remote PostgreSQL access - potential risk'
        WHEN e.extname = 'adminpack' THEN 'Administrative functions - high risk'
        ELSE 'Review documentation for security implications'
    END as security_notes
FROM pg_extension e
JOIN pg_namespace n ON e.extnamespace = n.oid
ORDER BY 
    CASE 
        WHEN e.extname IN ('dblink', 'file_fdw', 'postgres_fdw', 'adminpack') THEN 1
        WHEN e.extname IN ('pg_crypto', 'uuid-ossp', 'ltree', 'hstore') THEN 2
        ELSE 3
    END,
    e.extname;
\echo ''

-- Audit dangerous functions that might be available
\echo '2. POTENTIALLY DANGEROUS FUNCTIONS AUDIT'
SELECT 
    p.proname as function_name,
    n.nspname as schema,
    p.prolang as language_oid,
    l.lanname as language_name,
    CASE 
        WHEN p.proname IN ('lo_import', 'lo_export', 'lo_unlink') THEN 'FILE SYSTEM ACCESS'
        WHEN p.proname IN ('pg_read_file', 'pg_write_file', 'pg_ls_dir') THEN 'FILE SYSTEM ACCESS'
        WHEN p.proname IN ('pg_read_binary_file', 'pg_stat_file') THEN 'FILE SYSTEM ACCESS'
        WHEN p.proname LIKE 'dblink%' THEN 'REMOTE DATABASE ACCESS'
        WHEN p.proname LIKE 'pg_copy%' THEN 'FILE OPERATIONS'
        ELSE 'OTHER RISK'
    END as risk_category,
    p.proacl as current_permissions
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
JOIN pg_language l ON p.prolang = l.oid
WHERE p.proname IN (
    -- File system access functions
    'lo_import', 'lo_export', 'lo_unlink',
    'pg_read_file', 'pg_write_file', 'pg_ls_dir',
    'pg_read_binary_file', 'pg_stat_file',
    -- Copy functions
    'copy_from_program', 'copy_to_program',
    -- Database link functions
    'dblink', 'dblink_exec', 'dblink_connect', 'dblink_disconnect'
)
ORDER BY risk_category, function_name;
\echo ''

-- =============================================================================
-- SECURITY HARDENING ACTIONS
-- =============================================================================

\echo '3. IMPLEMENTING SECURITY HARDENING...'

-- Remove high-risk extensions if they exist and are not needed
\echo 'Checking for high-risk extensions to remove...'

DO $$
DECLARE
    ext_name text;
    high_risk_extensions text[] := ARRAY['adminpack', 'file_fdw'];
BEGIN
    FOREACH ext_name IN ARRAY high_risk_extensions
    LOOP
        IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = ext_name) THEN
            RAISE NOTICE 'WARNING: High-risk extension % is installed. Consider removing with: DROP EXTENSION % CASCADE;', ext_name, ext_name;
        END IF;
    END LOOP;
END
$$;

-- Revoke dangerous function permissions from public and application users
\echo 'Revoking permissions on dangerous functions...'

DO $$
DECLARE
    func_name text;
    dangerous_functions text[] := ARRAY[
        'lo_import', 'lo_export', 'lo_unlink',
        'pg_read_file', 'pg_write_file', 'pg_ls_dir',
        'pg_read_binary_file', 'pg_stat_file',
        'copy_from_program', 'copy_to_program'
    ];
BEGIN
    FOREACH func_name IN ARRAY dangerous_functions
    LOOP
        BEGIN
            -- Revoke from PUBLIC
            EXECUTE format('REVOKE ALL ON FUNCTION %I FROM PUBLIC', func_name);
            RAISE NOTICE 'Revoked permissions on function % from PUBLIC', func_name;
            
            -- Revoke from application user if exists
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'whirlcrypt_user') THEN
                EXECUTE format('REVOKE ALL ON FUNCTION %I FROM whirlcrypt_user', func_name);
                RAISE NOTICE 'Revoked permissions on function % from whirlcrypt_user', func_name;
            END IF;
        EXCEPTION
            WHEN undefined_function THEN
                RAISE NOTICE 'Function % does not exist - skipping', func_name;
            WHEN OTHERS THEN
                RAISE NOTICE 'Error revoking permissions on function %: %', func_name, SQLERRM;
        END;
    END LOOP;
END
$$;

-- =============================================================================
-- RECOMMENDED EXTENSIONS FOR SECURITY
-- =============================================================================

\echo '4. RECOMMENDED SECURITY EXTENSIONS'
\echo 'Consider installing these extensions for enhanced security:'

-- Check if pg_stat_statements is installed (recommended for monitoring)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') THEN
        RAISE NOTICE 'RECOMMENDATION: Install pg_stat_statements for query monitoring';
        RAISE NOTICE 'Add to postgresql.conf: shared_preload_libraries = ''pg_stat_statements''';
        RAISE NOTICE 'Then restart PostgreSQL and run: CREATE EXTENSION pg_stat_statements;';
    ELSE
        RAISE NOTICE 'pg_stat_statements is already installed - GOOD';
    END IF;
END
$$;

-- =============================================================================
-- EXTENSION REMOVAL COMMANDS (MANUAL EXECUTION REQUIRED)
-- =============================================================================

\echo '5. EXTENSION REMOVAL COMMANDS (if needed)'
\echo 'Execute these commands manually if you want to remove high-risk extensions:'
\echo ''
\echo '-- Remove adminpack (administrative functions)'
\echo '-- DROP EXTENSION IF EXISTS adminpack CASCADE;'
\echo ''
\echo '-- Remove file_fdw (file system access)'
\echo '-- DROP EXTENSION IF EXISTS file_fdw CASCADE;'
\echo ''
\echo '-- Remove dblink (if not needed for your application)'
\echo '-- DROP EXTENSION IF EXISTS dblink CASCADE;'
\echo ''
\echo '-- Remove postgres_fdw (if not using foreign servers)'
\echo '-- DROP EXTENSION IF EXISTS postgres_fdw CASCADE;'
\echo ''

-- =============================================================================
-- SECURITY MONITORING SETUP
-- =============================================================================

\echo '6. SETTING UP SECURITY MONITORING'

-- Create a view for monitoring extension usage
CREATE OR REPLACE VIEW security_extension_monitor AS
SELECT 
    e.extname as extension_name,
    e.extversion as version,
    n.nspname as schema,
    CASE 
        WHEN e.extname IN ('dblink', 'file_fdw', 'postgres_fdw', 'adminpack') THEN 'HIGH'
        WHEN e.extname IN ('pg_crypto', 'uuid-ossp', 'ltree', 'hstore') THEN 'MEDIUM'
        ELSE 'LOW'
    END as risk_level,
    current_timestamp as last_checked
FROM pg_extension e
JOIN pg_namespace n ON e.extnamespace = n.oid;

COMMENT ON VIEW security_extension_monitor IS 'Monitor installed extensions for security risks';

\echo 'Created security_extension_monitor view for ongoing monitoring'
\echo ''

-- =============================================================================
-- FINAL RECOMMENDATIONS
-- =============================================================================

\echo '=== EXTENSION SECURITY RECOMMENDATIONS ==='
\echo '1. Regularly audit installed extensions'
\echo '2. Remove unused extensions to reduce attack surface'
\echo '3. Monitor extension usage and access patterns'
\echo '4. Keep extensions updated to latest versions'
\echo '5. Review extension documentation for security implications'
\echo '6. Use principle of least privilege for extension access'
\echo '7. Consider using extension whitelisting in production'
\echo ''
\echo '=== MONITORING QUERIES ==='
\echo 'Use these queries for ongoing security monitoring:'
\echo ''
\echo '-- Check current extensions and risk levels'
\echo 'SELECT * FROM security_extension_monitor ORDER BY risk_level DESC;'
\echo ''
\echo '-- Monitor function usage (requires pg_stat_statements)'
\echo 'SELECT calls, query FROM pg_stat_statements WHERE query LIKE ''%lo_import%'' OR query LIKE ''%pg_read_file%'';'
