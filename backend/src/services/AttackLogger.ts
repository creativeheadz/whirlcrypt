import { Pool } from 'pg';
import { DatabaseConnection } from '../database/connection';
import { AttackInfo } from '../middleware/attackDetection';

export interface AttackLogEntry {
  id: string;
  ip: string;
  userAgent: string;
  path: string;
  method: string;
  timestamp: Date;
  country?: string;
  attackType: 'permanent_ban' | 'temporary_ban' | 'suspicious' | '404';
  reason: string;
  category: string;
  responseCode: number;
}

export interface AttackStats {
  totalAttacks: number;
  attacksToday: number;
  uniqueIPs: number;
  topCountries: Array<{ country: string; count: number }>;
  topCategories: Array<{ category: string; count: number }>;
  recentAttacks: AttackLogEntry[];
}

export class AttackLogger {
  private pool: Pool;

  constructor() {
    this.pool = DatabaseConnection.getPool();
  }

  /**
   * Log an attack attempt
   */
  async logAttack(attackInfo: AttackInfo): Promise<void> {
    const query = `
      INSERT INTO attack_logs (
        ip, user_agent, path, method, country, attack_type, 
        reason, category, response_code, timestamp
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;

    const values = [
      attackInfo.ip,
      attackInfo.userAgent,
      attackInfo.path,
      attackInfo.method,
      attackInfo.country || await this.getCountryFromIP(attackInfo.ip),
      attackInfo.attackType,
      attackInfo.reason,
      attackInfo.category,
      attackInfo.attackType === 'permanent_ban' ? 403 : 
      attackInfo.attackType === 'temporary_ban' ? 403 : 200,
      attackInfo.timestamp
    ];

    try {
      await this.pool.query(query, values);
      console.log(`🚨 Attack logged: ${attackInfo.ip} -> ${attackInfo.path} (${attackInfo.category})`);
    } catch (error) {
      console.error('Error logging attack:', error);
    }
  }

  /**
   * Log a regular 404 attempt
   */
  async log404(ip: string, userAgent: string, path: string, method: string): Promise<void> {
    const query = `
      INSERT INTO attack_logs (
        ip, user_agent, path, method, country, attack_type, 
        reason, category, response_code, timestamp
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;

    const values = [
      ip,
      userAgent,
      path,
      method,
      await this.getCountryFromIP(ip),
      '404',
      `404 Not Found: ${path}`,
      'random404',
      404,
      new Date()
    ];

    try {
      await this.pool.query(query, values);
    } catch (error) {
      console.error('Error logging 404:', error);
    }
  }

  /**
   * Get recent attack attempts from an IP
   */
  async getRecentAttempts(ip: string, minutesBack: number = 5): Promise<number> {
    const query = `
      SELECT COUNT(*) as count
      FROM attack_logs
      WHERE ip = $1 
      AND timestamp > NOW() - INTERVAL '${minutesBack} minutes'
      AND response_code = 404
    `;

    try {
      const result = await this.pool.query(query, [ip]);
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Error getting recent attempts:', error);
      return 0;
    }
  }

  /**
   * Get comprehensive attack statistics
   */
  async getAttackStats(): Promise<AttackStats> {
    try {
      // Total attacks
      const totalResult = await this.pool.query(
        'SELECT COUNT(*) as count FROM attack_logs'
      );

      // Attacks today
      const todayResult = await this.pool.query(`
        SELECT COUNT(*) as count FROM attack_logs
        WHERE DATE(timestamp) = CURRENT_DATE
      `);

      // Unique IPs
      const uniqueIPsResult = await this.pool.query(
        'SELECT COUNT(DISTINCT ip) as count FROM attack_logs'
      );

      // Top countries
      const topCountriesResult = await this.pool.query(`
        SELECT country, COUNT(*) as count
        FROM attack_logs
        WHERE country IS NOT NULL
        GROUP BY country
        ORDER BY count DESC
        LIMIT 10
      `);

      // Top categories
      const topCategoriesResult = await this.pool.query(`
        SELECT category, COUNT(*) as count
        FROM attack_logs
        GROUP BY category
        ORDER BY count DESC
        LIMIT 10
      `);

      // Recent attacks (last 24 hours)
      const recentAttacksResult = await this.pool.query(`
        SELECT * FROM attack_logs
        WHERE timestamp > NOW() - INTERVAL '24 hours'
        ORDER BY timestamp DESC
        LIMIT 50
      `);

      return {
        totalAttacks: parseInt(totalResult.rows[0].count),
        attacksToday: parseInt(todayResult.rows[0].count),
        uniqueIPs: parseInt(uniqueIPsResult.rows[0].count),
        topCountries: topCountriesResult.rows,
        topCategories: topCategoriesResult.rows,
        recentAttacks: recentAttacksResult.rows.map(row => ({
          id: row.id,
          ip: row.ip,
          userAgent: row.user_agent,
          path: row.path,
          method: row.method,
          timestamp: row.timestamp,
          country: row.country,
          attackType: row.attack_type,
          reason: row.reason,
          category: row.category,
          responseCode: row.response_code
        }))
      };
    } catch (error) {
      console.error('Error getting attack stats:', error);
      return {
        totalAttacks: 0,
        attacksToday: 0,
        uniqueIPs: 0,
        topCountries: [],
        topCategories: [],
        recentAttacks: []
      };
    }
  }

  /**
   * Get attacks by time period for charts
   */
  async getAttacksByTime(hours: number = 24): Promise<Array<{ hour: string; count: number }>> {
    const query = `
      SELECT 
        DATE_TRUNC('hour', timestamp) as hour,
        COUNT(*) as count
      FROM attack_logs
      WHERE timestamp > NOW() - INTERVAL '${hours} hours'
      GROUP BY DATE_TRUNC('hour', timestamp)
      ORDER BY hour
    `;

    try {
      const result = await this.pool.query(query);
      return result.rows.map(row => ({
        hour: row.hour.toISOString(),
        count: parseInt(row.count)
      }));
    } catch (error) {
      console.error('Error getting attacks by time:', error);
      return [];
    }
  }

  /**
   * Get geographic attack distribution
   */
  async getAttacksByCountry(): Promise<Array<{ country: string; count: number; lat?: number; lng?: number }>> {
    const query = `
      SELECT country, COUNT(*) as count
      FROM attack_logs
      WHERE country IS NOT NULL
      GROUP BY country
      ORDER BY count DESC
    `;

    try {
      const result = await this.pool.query(query);
      return result.rows.map(row => ({
        country: row.country,
        count: parseInt(row.count)
      }));
    } catch (error) {
      console.error('Error getting attacks by country:', error);
      return [];
    }
  }

  /**
   * Get country from IP address (placeholder - integrate with GeoIP service)
   */
  private async getCountryFromIP(ip: string): Promise<string | null> {
    // TODO: Integrate with a GeoIP service like MaxMind or ipapi.co
    // For now, return null - we'll add this in the next iteration
    
    // Example integration with ipapi.co (free tier):
    /*
    try {
      const response = await fetch(`http://ipapi.co/${ip}/country_name/`);
      if (response.ok) {
        const country = await response.text();
        return country.trim();
      }
    } catch (error) {
      console.error('Error getting country for IP:', error);
    }
    */
    
    return null;
  }

  /**
   * Clean up old attack logs (keep last 30 days)
   */
  async cleanupOldLogs(): Promise<number> {
    const query = `
      DELETE FROM attack_logs
      WHERE timestamp < NOW() - INTERVAL '30 days'
    `;

    try {
      const result = await this.pool.query(query);
      const deletedCount = result.rowCount || 0;
      
      if (deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deletedCount} old attack logs`);
      }
      
      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up old logs:', error);
      return 0;
    }
  }
}
