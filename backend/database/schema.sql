-- Whirlcrypt Database Schema
-- This file contains the database schema for the Whirlcrypt application

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Files table
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename VARCHAR(255) NOT NULL,
    original_size BIGINT NOT NULL,
    encrypted_size BIGINT NOT NULL,
    content_type VARCHAR(255) NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    storage_provider VARCHAR(50) NOT NULL DEFAULT 'local',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    max_downloads INTEGER DEFAULT NULL,
    download_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    encrypted_metadata TEXT, -- Base64 encoded encrypted metadata (Wormhole-inspired)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Download logs table
CREATE TABLE IF NOT EXISTS download_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    downloaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_files_expires_at ON files(expires_at);
CREATE INDEX IF NOT EXISTS idx_files_is_active ON files(is_active);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at);
CREATE INDEX IF NOT EXISTS idx_download_logs_file_id ON download_logs(file_id);
CREATE INDEX IF NOT EXISTS idx_download_logs_downloaded_at ON download_logs(downloaded_at);
CREATE INDEX IF NOT EXISTS idx_download_logs_ip_address ON download_logs(ip_address);

-- Active files view for easier querying
CREATE OR REPLACE VIEW active_files AS
SELECT
    *,
    (expires_at < CURRENT_TIMESTAMP) AS is_expired
FROM files
WHERE is_active = true;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_files_updated_at ON files;
CREATE TRIGGER update_files_updated_at
    BEFORE UPDATE ON files
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up expired files
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

-- Security and Attack Logging Tables
-- Attack logs table - stores all suspicious requests and attacks
CREATE TABLE IF NOT EXISTS attack_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip INET NOT NULL,
    user_agent TEXT,
    path TEXT NOT NULL,
    method VARCHAR(10) NOT NULL,
    country VARCHAR(100),
    attack_type VARCHAR(20) NOT NULL CHECK (attack_type IN ('permanent_ban', 'temporary_ban', 'suspicious', '404')),
    reason TEXT NOT NULL,
    category VARCHAR(20) NOT NULL CHECK (category IN ('wordpress', 'admin', 'env', 'scanner', 'random404', 'exploit')),
    response_code INTEGER NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for attack_logs
CREATE INDEX IF NOT EXISTS idx_attack_logs_ip ON attack_logs (ip);
CREATE INDEX IF NOT EXISTS idx_attack_logs_timestamp ON attack_logs (timestamp);
CREATE INDEX IF NOT EXISTS idx_attack_logs_category ON attack_logs (category);
CREATE INDEX IF NOT EXISTS idx_attack_logs_attack_type ON attack_logs (attack_type);

-- Banned IPs table - stores current bans
CREATE TABLE IF NOT EXISTS banned_ips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip INET NOT NULL UNIQUE,
    ban_type VARCHAR(10) NOT NULL CHECK (ban_type IN ('permanent', 'temporary')),
    reason TEXT NOT NULL,
    category VARCHAR(20) NOT NULL,
    offending_request TEXT NOT NULL,
    user_agent TEXT,
    country VARCHAR(100),
    banned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,

    -- Constraints
    CONSTRAINT check_temporary_ban_expiry CHECK (
        ban_type = 'permanent' OR (ban_type = 'temporary' AND expires_at IS NOT NULL)
    )
);

-- Create indexes for banned_ips
CREATE INDEX IF NOT EXISTS idx_banned_ips_ip ON banned_ips (ip);
CREATE INDEX IF NOT EXISTS idx_banned_ips_active ON banned_ips (is_active);
CREATE INDEX IF NOT EXISTS idx_banned_ips_expires ON banned_ips (expires_at);
CREATE INDEX IF NOT EXISTS idx_banned_ips_type ON banned_ips (ban_type);

-- Admin users table for authentication
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    mfa_secret VARCHAR(64),
    mfa_enabled BOOLEAN DEFAULT false,
    mfa_backup_codes TEXT[], -- Array of backup codes
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP WITH TIME ZONE,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Admin sessions table for JWT token management
CREATE TABLE IF NOT EXISTS admin_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Admin audit log for security tracking
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    username VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100),
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for admin tables
CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_is_active ON admin_users(is_active);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_id ON admin_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_user_id ON admin_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON admin_audit_log(action);

-- Trigger for admin_users updated_at
DROP TRIGGER IF EXISTS update_admin_users_updated_at ON admin_users;
CREATE TRIGGER update_admin_users_updated_at
    BEFORE UPDATE ON admin_users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to cleanup expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM admin_sessions WHERE expires_at < CURRENT_TIMESTAMP;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ language 'plpgsql';

-- Grant permissions to whirlcrypt_user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO whirlcrypt_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO whirlcrypt_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO whirlcrypt_user;
