import { Pool } from 'pg';
import { DatabaseConnection } from '../database/connection';
import { AttackInfo } from '../middleware/attackDetection';

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

export interface WallOfShameEntry {
  ip: string;
  maskedIP: string; // For privacy: 123.45.67.xxx
  country?: string;
  countryFlag?: string;
  banType: 'permanent' | 'temporary';
  reason: string;
  category: string;
  offendingRequest: string;
  userAgent: string;
  bannedAt: Date;
  expiresAt?: Date;
  timeLeft?: string; // For temporary bans
  sarcasticComment: string;
}

export class BanManager {
  private pool: Pool;

  // Whitelist for IPs that should never be banned
  private readonly WHITELIST_IPS = [
    '127.0.0.1',
    '::1',
    '192.168.1.100', // Your server IP
    '10.0.0.0/8',    // Private networks
    '172.16.0.0/12', // Private networks
    '192.168.0.0/16' // Private networks
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
      console.error('Error checking ban status:', error);
      return false;
    }
  }

  /**
   * Apply permanent ban
   */
  async permanentBan(ip: string, attackInfo: AttackInfo): Promise<void> {
    // Never ban whitelisted IPs
    if (this.isIPWhitelisted(ip)) {
      console.log(`🛡️ Skipping ban for whitelisted IP: ${ip}`);
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
      console.log(`🔨 PERMANENT BAN: ${ip} for ${attackInfo.category} (${attackInfo.path})`);
    } catch (error) {
      console.error('Error applying permanent ban:', error);
    }
  }

  /**
   * Apply temporary ban
   */
  async temporaryBan(ip: string, attackInfo: AttackInfo, durationMinutes: number): Promise<void> {
    // Never ban whitelisted IPs
    if (this.isIPWhitelisted(ip)) {
      console.log(`🛡️ Skipping temporary ban for whitelisted IP: ${ip}`);
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
      console.log(`⏰ TEMPORARY BAN: ${ip} for ${durationMinutes} minutes (${attackInfo.path})`);
    } catch (error) {
      console.error('Error applying temporary ban:', error);
    }
  }

  /**
   * Get Wall of Shame entries for public display
   */
  async getWallOfShame(): Promise<{
    permanentBans: WallOfShameEntry[];
    temporaryBans: WallOfShameEntry[];
  }> {
    try {
      // Get permanent bans
      const permanentQuery = `
        SELECT * FROM banned_ips
        WHERE ban_type = 'permanent' AND is_active = true
        ORDER BY banned_at DESC
        LIMIT 50
      `;

      // Get active temporary bans
      const temporaryQuery = `
        SELECT * FROM banned_ips
        WHERE ban_type = 'temporary' 
        AND is_active = true 
        AND expires_at > NOW()
        ORDER BY expires_at ASC
        LIMIT 20
      `;

      const [permanentResult, temporaryResult] = await Promise.all([
        this.pool.query(permanentQuery),
        this.pool.query(temporaryQuery)
      ]);

      const permanentBans = permanentResult.rows.map(row => this.formatWallOfShameEntry(row));
      const temporaryBans = temporaryResult.rows.map(row => this.formatWallOfShameEntry(row));

      return { permanentBans, temporaryBans };
    } catch (error) {
      console.error('Error getting Wall of Shame entries:', error);
      return { permanentBans: [], temporaryBans: [] };
    }
  }

  /**
   * Format database row for Wall of Shame display
   */
  private formatWallOfShameEntry(row: any): WallOfShameEntry {
    const maskedIP = this.maskIP(row.ip);
    const timeLeft = row.expires_at ? this.getTimeLeft(row.expires_at) : undefined;
    const sarcasticComment = this.getSarcasticComment(row.category);

    return {
      ip: row.ip,
      maskedIP,
      country: row.country,
      countryFlag: this.getCountryFlag(row.country),
      banType: row.ban_type,
      reason: row.reason,
      category: row.category,
      offendingRequest: row.offending_request,
      userAgent: row.user_agent,
      bannedAt: row.banned_at,
      expiresAt: row.expires_at,
      timeLeft,
      sarcasticComment
    };
  }

  /**
   * Mask IP address for privacy (show first 3 octets)
   */
  private maskIP(ip: string): string {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
    }
    return ip; // Return as-is if not IPv4
  }

  /**
   * Get time left for temporary bans
   */
  private getTimeLeft(expiresAt: Date): string {
    const now = new Date();
    const timeLeft = expiresAt.getTime() - now.getTime();
    
    if (timeLeft <= 0) return 'Expired';
    
    const minutes = Math.floor(timeLeft / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else {
      return `${minutes}m`;
    }
  }

  /**
   * Get country flag emoji
   */
  private getCountryFlag(country: string | null): string {
    if (!country) return '🏴‍☠️'; // Pirate flag for unknown
    
    // Map country names to flag emojis (simplified)
    const flagMap: { [key: string]: string } = {
      'Russia': '🇷🇺',
      'China': '🇨🇳',
      'United States': '🇺🇸',
      'Germany': '🇩🇪',
      'France': '🇫🇷',
      'United Kingdom': '🇬🇧',
      'Netherlands': '🇳🇱',
      'Brazil': '🇧🇷',
      'India': '🇮🇳',
      'Japan': '🇯🇵'
    };
    
    return flagMap[country] || '🌍';
  }

  /**
   * Get sarcastic comment based on attack category
   */
  private getSarcasticComment(category: string): string {
    const comments: { [key: string]: string[] } = {
      wordpress: [
        "Still looking for WordPress? Try WordPress.com! 😂",
        "This isn't your grandma's blog, script kiddie!",
        "wp-admin? More like wp-BANNED! 🔨"
      ],
      admin: [
        "Admin panel? The only admin here is the ban hammer! ⚡",
        "PHPMyAdmin? More like PHPMyBAN! 🚫",
        "Nice try, but this isn't 2005! 🕰️"
      ],
      env: [
        "Looking for secrets? Here's one: you're banned! 🤫",
        "The only .env you'll find is .env-BANNED! 📁",
        "Secrets are for friends, not script kiddies! 👥"
      ],
      scanner: [
        "Automated tools? How original! 🤖",
        "Beep boop, you're banned! 🚫",
        "Nice scanner, shame about the ban! 🔍"
      ],
      exploit: [
        "Shell access? The only shell you'll get is banned! 🐚",
        "System commands? System says NO! ❌",
        "Exploit attempt? More like exploit FAILED! 💥"
      ],
      random404: [
        "404: Your access privileges not found! 🔍",
        "Random guessing? Random banning! 🎲",
        "Keep trying, we have all day to ban you! ⏰"
      ]
    };

    const categoryComments = comments[category] || comments.random404;
    return categoryComments[Math.floor(Math.random() * categoryComments.length)];
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
        console.log(`🧹 Cleaned up ${cleanedCount} expired bans`);
      }
      
      return cleanedCount;
    } catch (error) {
      console.error('Error cleaning up expired bans:', error);
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
        console.log(`🔓 Manually unbanned IP: ${ip}`);
      }
      
      return unbanned;
    } catch (error) {
      console.error('Error unbanning IP:', error);
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
