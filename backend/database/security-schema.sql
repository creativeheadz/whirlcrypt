-- Security and Attack Logging Schema
-- This extends the main database schema with security features

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

-- Create indexes for attack_logs
CREATE INDEX IF NOT EXISTS idx_attack_logs_ip ON attack_logs (ip);
CREATE INDEX IF NOT EXISTS idx_attack_logs_timestamp ON attack_logs (timestamp);
CREATE INDEX IF NOT EXISTS idx_attack_logs_category ON attack_logs (category);
CREATE INDEX IF NOT EXISTS idx_attack_logs_attack_type ON attack_logs (attack_type);

-- Create indexes for banned_ips
CREATE INDEX IF NOT EXISTS idx_banned_ips_ip ON banned_ips (ip);
CREATE INDEX IF NOT EXISTS idx_banned_ips_active ON banned_ips (is_active);
CREATE INDEX IF NOT EXISTS idx_banned_ips_expires ON banned_ips (expires_at);
CREATE INDEX IF NOT EXISTS idx_banned_ips_type ON banned_ips (ban_type);

-- Security statistics view for dashboard
CREATE OR REPLACE VIEW security_stats AS
SELECT 
    -- Total counts
    (SELECT COUNT(*) FROM attack_logs) as total_attacks,
    (SELECT COUNT(*) FROM attack_logs WHERE DATE(timestamp) = CURRENT_DATE) as attacks_today,
    (SELECT COUNT(DISTINCT ip) FROM attack_logs) as unique_attacking_ips,
    (SELECT COUNT(*) FROM banned_ips WHERE is_active = true) as total_banned_ips,
    (SELECT COUNT(*) FROM banned_ips WHERE ban_type = 'permanent' AND is_active = true) as permanent_bans,
    (SELECT COUNT(*) FROM banned_ips WHERE ban_type = 'temporary' AND is_active = true AND expires_at > NOW()) as active_temporary_bans,
    
    -- Recent activity
    (SELECT COUNT(*) FROM attack_logs WHERE timestamp > NOW() - INTERVAL '1 hour') as attacks_last_hour,
    (SELECT COUNT(*) FROM attack_logs WHERE timestamp > NOW() - INTERVAL '24 hours') as attacks_last_24h;

-- Wall of Shame view for public display
CREATE OR REPLACE VIEW wall_of_shame AS
SELECT 
    ip,
    ban_type,
    reason,
    category,
    offending_request,
    user_agent,
    country,
    banned_at,
    expires_at,
    CASE 
        WHEN ban_type = 'temporary' AND expires_at > NOW() THEN
            EXTRACT(EPOCH FROM (expires_at - NOW()))::INTEGER
        ELSE NULL
    END as seconds_left
FROM banned_ips
WHERE is_active = true
AND (ban_type = 'permanent' OR (ban_type = 'temporary' AND expires_at > NOW()))
ORDER BY 
    CASE WHEN ban_type = 'permanent' THEN 0 ELSE 1 END,
    banned_at DESC;

-- Attack trends view for charts
CREATE OR REPLACE VIEW attack_trends AS
SELECT 
    DATE_TRUNC('hour', timestamp) as hour,
    COUNT(*) as attack_count,
    COUNT(DISTINCT ip) as unique_ips,
    array_agg(DISTINCT category) as categories
FROM attack_logs
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', timestamp)
ORDER BY hour;

-- Geographic attack distribution
CREATE OR REPLACE VIEW attack_geography AS
SELECT 
    country,
    COUNT(*) as attack_count,
    COUNT(DISTINCT ip) as unique_ips,
    array_agg(DISTINCT category) as attack_categories,
    MAX(timestamp) as last_attack
FROM attack_logs
WHERE country IS NOT NULL
GROUP BY country
ORDER BY attack_count DESC;

-- Top attackers view
CREATE OR REPLACE VIEW top_attackers AS
SELECT 
    ip,
    country,
    COUNT(*) as attack_count,
    array_agg(DISTINCT category) as categories,
    array_agg(DISTINCT path) as paths_attempted,
    MIN(timestamp) as first_seen,
    MAX(timestamp) as last_seen,
    CASE 
        WHEN EXISTS (SELECT 1 FROM banned_ips WHERE banned_ips.ip = attack_logs.ip AND is_active = true) 
        THEN true 
        ELSE false 
    END as is_banned
FROM attack_logs
GROUP BY ip, country
HAVING COUNT(*) > 1
ORDER BY attack_count DESC
LIMIT 100;

-- Function to clean up old attack logs (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_attack_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM attack_logs 
    WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Also clean up expired temporary bans
    UPDATE banned_ips 
    SET is_active = false 
    WHERE ban_type = 'temporary' 
    AND expires_at < CURRENT_TIMESTAMP 
    AND is_active = true;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get attack statistics for dashboard
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'totalAttacks', (SELECT COUNT(*) FROM attack_logs),
        'attacksToday', (SELECT COUNT(*) FROM attack_logs WHERE DATE(timestamp) = CURRENT_DATE),
        'uniqueIPs', (SELECT COUNT(DISTINCT ip) FROM attack_logs),
        'bannedIPs', (SELECT COUNT(*) FROM banned_ips WHERE is_active = true),
        'permanentBans', (SELECT COUNT(*) FROM banned_ips WHERE ban_type = 'permanent' AND is_active = true),
        'temporaryBans', (SELECT COUNT(*) FROM banned_ips WHERE ban_type = 'temporary' AND is_active = true AND expires_at > NOW()),
        'attacksLastHour', (SELECT COUNT(*) FROM attack_logs WHERE timestamp > NOW() - INTERVAL '1 hour'),
        'topCountries', (
            SELECT json_agg(json_build_object('country', country, 'count', attack_count))
            FROM (
                SELECT country, COUNT(*) as attack_count
                FROM attack_logs 
                WHERE country IS NOT NULL
                GROUP BY country 
                ORDER BY attack_count DESC 
                LIMIT 10
            ) t
        ),
        'topCategories', (
            SELECT json_agg(json_build_object('category', category, 'count', attack_count))
            FROM (
                SELECT category, COUNT(*) as attack_count
                FROM attack_logs 
                GROUP BY category 
                ORDER BY attack_count DESC 
                LIMIT 10
            ) t
        )
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to get Wall of Shame data
CREATE OR REPLACE FUNCTION get_wall_of_shame()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'permanentBans', (
            SELECT json_agg(
                json_build_object(
                    'ip', ip,
                    'country', country,
                    'reason', reason,
                    'category', category,
                    'offendingRequest', offending_request,
                    'userAgent', user_agent,
                    'bannedAt', banned_at
                )
            )
            FROM banned_ips 
            WHERE ban_type = 'permanent' AND is_active = true
            ORDER BY banned_at DESC
            LIMIT 50
        ),
        'temporaryBans', (
            SELECT json_agg(
                json_build_object(
                    'ip', ip,
                    'country', country,
                    'reason', reason,
                    'category', category,
                    'offendingRequest', offending_request,
                    'userAgent', user_agent,
                    'bannedAt', banned_at,
                    'expiresAt', expires_at,
                    'secondsLeft', EXTRACT(EPOCH FROM (expires_at - NOW()))::INTEGER
                )
            )
            FROM banned_ips 
            WHERE ban_type = 'temporary' 
            AND is_active = true 
            AND expires_at > NOW()
            ORDER BY expires_at ASC
            LIMIT 20
        )
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically deactivate expired temporary bans
CREATE OR REPLACE FUNCTION deactivate_expired_bans()
RETURNS TRIGGER AS $$
BEGIN
    -- This trigger runs on SELECT to the banned_ips table
    -- It automatically deactivates expired temporary bans
    UPDATE banned_ips 
    SET is_active = false 
    WHERE ban_type = 'temporary' 
    AND expires_at < NOW() 
    AND is_active = true;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (optional - can also be handled by cleanup job)
-- CREATE TRIGGER trigger_deactivate_expired_bans
--     BEFORE SELECT ON banned_ips
--     FOR EACH STATEMENT
--     EXECUTE FUNCTION deactivate_expired_bans();

-- Comments for documentation
COMMENT ON TABLE attack_logs IS 'Logs all suspicious requests and attack attempts';
COMMENT ON TABLE banned_ips IS 'Stores currently banned IP addresses with ban details';
COMMENT ON VIEW security_stats IS 'Real-time security statistics for dashboard';
COMMENT ON VIEW wall_of_shame IS 'Public wall of shame showing banned IPs and their crimes';
COMMENT ON FUNCTION cleanup_old_attack_logs() IS 'Cleans up attack logs older than 30 days';
COMMENT ON FUNCTION get_dashboard_stats() IS 'Returns comprehensive dashboard statistics as JSON';
COMMENT ON FUNCTION get_wall_of_shame() IS 'Returns wall of shame data formatted for public display';
