-- PostgreSQL Security Audit Script
-- Run this script to assess current database security configuration
-- Execute as superuser (postgres) for complete audit

-- =============================================================================
-- SECURITY AUDIT QUERIES
-- =============================================================================

\echo '=== PostgreSQL Security Audit Report ==='
\echo 'Generated on:' `date`
\echo ''

-- Database version and basic info
\echo '1. DATABASE VERSION AND CONFIGURATION'
SELECT version();
SELECT current_database(), current_user, session_user;
\echo ''

-- Connection and authentication settings
\echo '2. CONNECTION AND AUTHENTICATION SETTINGS'
SELECT name, setting, unit, context 
FROM pg_settings 
WHERE name IN (
    'max_connections',
    'ssl',
    'password_encryption',
    'log_connections',
    'log_disconnections',
    'statement_timeout',
    'idle_in_transaction_session_timeout'
)
ORDER BY name;
\echo ''

-- Logging configuration
\echo '3. LOGGING CONFIGURATION'
SELECT name, setting, unit, context 
FROM pg_settings 
WHERE name IN (
    'logging_collector',
    'log_statement',
    'log_min_duration_statement',
    'log_checkpoints',
    'log_lock_waits',
    'log_temp_files'
)
ORDER BY name;
\echo ''

-- SSL/TLS configuration
\echo '4. SSL/TLS CONFIGURATION'
SELECT name, setting, unit, context 
FROM pg_settings 
WHERE name LIKE 'ssl%'
ORDER BY name;
\echo ''

-- User accounts and privileges
\echo '5. USER ACCOUNTS AND PRIVILEGES'
SELECT 
    rolname as username,
    rolsuper as is_superuser,
    rolcreaterole as can_create_roles,
    rolcreatedb as can_create_databases,
    rolcanlogin as can_login,
    rolreplication as replication_user,
    rolconnlimit as connection_limit,
    rolvaliduntil as password_expiry
FROM pg_roles 
WHERE rolname NOT LIKE 'pg_%'
ORDER BY rolname;
\echo ''

-- Database permissions
\echo '6. DATABASE PERMISSIONS'
SELECT 
    datname as database_name,
    datacl as permissions
FROM pg_database 
WHERE datname NOT IN ('template0', 'template1')
ORDER BY datname;
\echo ''

-- Installed extensions (security risk assessment)
\echo '7. INSTALLED EXTENSIONS'
SELECT 
    extname as extension_name,
    extversion as version,
    nspname as schema
FROM pg_extension e
JOIN pg_namespace n ON e.extnamespace = n.oid
ORDER BY extname;
\echo ''

-- Dangerous functions that should be restricted
\echo '8. POTENTIALLY DANGEROUS FUNCTIONS'
SELECT 
    proname as function_name,
    nspname as schema,
    prolang as language_oid,
    proacl as permissions
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE proname IN (
    'lo_import', 'lo_export', 'lo_unlink',
    'pg_read_file', 'pg_write_file', 'pg_ls_dir',
    'copy_from_program', 'copy_to_program'
)
ORDER BY proname;
\echo ''

-- Active connections
\echo '9. CURRENT ACTIVE CONNECTIONS'
SELECT 
    pid,
    usename as username,
    application_name,
    client_addr,
    client_port,
    backend_start,
    state,
    query_start
FROM pg_stat_activity 
WHERE state = 'active'
ORDER BY backend_start;
\echo ''

-- Failed authentication attempts (if log_statement includes auth failures)
\echo '10. RECENT CONNECTION STATISTICS'
SELECT 
    datname as database,
    numbackends as active_connections,
    xact_commit as committed_transactions,
    xact_rollback as rolled_back_transactions,
    blks_read as blocks_read,
    blks_hit as blocks_hit_cache,
    tup_returned as tuples_returned,
    tup_fetched as tuples_fetched,
    tup_inserted as tuples_inserted,
    tup_updated as tuples_updated,
    tup_deleted as tuples_deleted
FROM pg_stat_database 
WHERE datname NOT IN ('template0', 'template1')
ORDER BY datname;
\echo ''

-- Table-level permissions audit
\echo '11. TABLE PERMISSIONS AUDIT'
SELECT 
    schemaname,
    tablename,
    tableowner,
    hasindexes,
    hasrules,
    hastriggers
FROM pg_tables 
WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
ORDER BY schemaname, tablename;
\echo ''

-- Security-related configuration parameters
\echo '12. SECURITY CONFIGURATION PARAMETERS'
SELECT name, setting, unit, context, short_desc
FROM pg_settings 
WHERE name IN (
    'shared_preload_libraries',
    'track_functions',
    'track_activities',
    'archive_mode',
    'wal_level',
    'hot_standby'
)
ORDER BY name;
\echo ''

\echo '=== END OF SECURITY AUDIT REPORT ==='
\echo 'Review the above output for security vulnerabilities and misconfigurations.'
\echo 'Compare settings with the recommended security configuration files.'
