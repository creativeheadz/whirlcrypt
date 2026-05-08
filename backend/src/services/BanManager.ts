import { Pool } from 'pg';
import { DatabaseConnection } from '../database/connection';
import { AttackInfo } from '../middleware/attackDetection';
import logger from '../utils/logger';

export interface BanEntry {
  id: string;
  ip: string;
  banType: 'permanent' | 'temporary';
  reason: string;
  category: string;
  offendingRequest: string;
  userAgent: string;
  country?: string;
  bannedAt: Date;
  expiresAt?: Date;
  isActive: boolean;
}

export class BanManager {
  private pool: Pool;

  // Whitelist for IPs that should never be banned
  // Loopback + private networks are always whitelisted.
  // Add extra IPs via WHITELISTED_IPS env var (comma-separated).
  private readonly WHITELIST_IPS: string[] = [
    '127.0.0.1',
    '::1',
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
    ...(process.env.WHITELISTED_IPS || '')
      .split(',')
      .map(ip => ip.trim())
      .filter(Boolean)
  ];

  constructor() {
    this.pool = DatabaseConnection.getPool();
  }

  /**
   * Check if IP is whitelisted
   */
  isIPWhitelisted(ip: string): boolean {
    return this.WHITELIST_IPS.some(whitelistIP => {
      if (whitelistIP.includes('/')) {
        // CIDR notation - simplified check for private networks
        const [network] = whitelistIP.split('/');
        return ip.startsWith(network.split('.').slice(0, -1).join('.'));
      }
      return ip === whitelistIP;
    });
  }

  /**
   * Check if an IP is currently banned
   */
  async isBanned(ip: string): Promise<boolean> {
    // Never ban whitelisted IPs
    if (this.isIPWhitelisted(ip)) {
      return false;
    }

    const query = `
      SELECT 1 FROM banned_ips
      WHERE ip = $1
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > NOW())
    `;

    try {
      const result = await this.pool.query(query, [ip]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error({ err: error }, 'Error checking ban status');
      return false;
    }
  }

  /**
   * Apply permanent ban
   */
  async permanentBan(ip: string, attackInfo: AttackInfo): Promise<void> {
    // Never ban whitelisted IPs
    if (this.isIPWhitelisted(ip)) {
      logger.info(`Skipping ban for whitelisted IP: ${ip}`);
      return;
    }
    const query = `
      INSERT INTO banned_ips (
        ip, ban_type, reason, category, offending_request, 
        user_agent, country, banned_at, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (ip) DO UPDATE SET
        ban_type = 'permanent',
        reason = EXCLUDED.reason,
        category = EXCLUDED.category,
        offending_request = EXCLUDED.offending_request,
        user_agent = EXCLUDED.user_agent,
        banned_at = EXCLUDED.banned_at,
        expires_at = NULL,
        is_active = true
    `;

    const values = [
      ip,
      'permanent',
      attackInfo.reason,
      attackInfo.category,
      attackInfo.path,
      attackInfo.userAgent,
      attackInfo.country || await this.getCountryFromIP(ip),
      attackInfo.timestamp,
      true
    ];

    try {
      await this.pool.query(query, values);
      logger.info(`PERMANENT BAN: ${ip} for ${attackInfo.category} (${attackInfo.path})`);
    } catch (error) {
      logger.error({ err: error }, 'Error applying permanent ban');
    }
  }

  /**
   * Apply temporary ban
   */
  async temporaryBan(ip: string, attackInfo: AttackInfo, durationMinutes: number): Promise<void> {
    // Never ban whitelisted IPs
    if (this.isIPWhitelisted(ip)) {
      logger.info(`Skipping temporary ban for whitelisted IP: ${ip}`);
      return;
    }
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);

    const query = `
      INSERT INTO banned_ips (
        ip, ban_type, reason, category, offending_request, 
        user_agent, country, banned_at, expires_at, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (ip) DO UPDATE SET
        ban_type = CASE 
          WHEN banned_ips.ban_type = 'permanent' THEN 'permanent'
          ELSE 'temporary'
        END,
        reason = EXCLUDED.reason,
        category = EXCLUDED.category,
        offending_request = EXCLUDED.offending_request,
        user_agent = EXCLUDED.user_agent,
        banned_at = EXCLUDED.banned_at,
        expires_at = CASE 
          WHEN banned_ips.ban_type = 'permanent' THEN NULL
          ELSE EXCLUDED.expires_at
        END,
        is_active = true
    `;

    const values = [
      ip,
      'temporary',
      attackInfo.reason,
      attackInfo.category,
      attackInfo.path,
      attackInfo.userAgent,
      attackInfo.country || await this.getCountryFromIP(ip),
      attackInfo.timestamp,
      expiresAt,
      true
    ];

    try {
      await this.pool.query(query, values);
      logger.info(`TEMPORARY BAN: ${ip} for ${durationMinutes} minutes (${attackInfo.path})`);
    } catch (error) {
      logger.error({ err: error }, 'Error applying temporary ban');
    }
  }

  /**
   * Clean up expired temporary bans
   */
  async cleanupExpiredBans(): Promise<number> {
    const query = `
      UPDATE banned_ips
      SET is_active = false
      WHERE ban_type = 'temporary' 
      AND expires_at < NOW()
      AND is_active = true
    `;

    try {
      const result = await this.pool.query(query);
      const cleanedCount = result.rowCount || 0;
      
      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} expired bans`);
      }
      
      return cleanedCount;
    } catch (error) {
      logger.error({ err: error }, 'Error cleaning up expired bans');
      return 0;
    }
  }

  /**
   * Manually unban an IP (admin function)
   */
  async unbanIP(ip: string): Promise<boolean> {
    const query = `
      UPDATE banned_ips
      SET is_active = false
      WHERE ip = $1
    `;

    try {
      const result = await this.pool.query(query, [ip]);
      const unbanned = (result.rowCount || 0) > 0;
      
      if (unbanned) {
        logger.info(`Manually unbanned IP: ${ip}`);
      }
      
      return unbanned;
    } catch (error) {
      logger.error({ err: error }, 'Error unbanning IP');
      return false;
    }
  }

  /**
   * Get country from IP (placeholder)
   */
  private async getCountryFromIP(ip: string): Promise<string | null> {
    // TODO: Integrate with GeoIP service
    return null;
  }
}
