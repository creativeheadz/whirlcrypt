import { Router, Request, Response } from 'express';
import { AttackLogger } from '../services/AttackLogger';
import { BanManager } from '../services/BanManager';
import { DatabaseConnection } from '../database/connection';

const router = Router();
const attackLogger = new AttackLogger();
const banManager = new BanManager();

/**
 * Get public security dashboard statistics
 * GET /api/security/stats
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await attackLogger.getAttackStats();
    
    res.json({
      success: true,
      data: {
        totalAttacks: stats.totalAttacks,
        attacksToday: stats.attacksToday,
        uniqueIPs: stats.uniqueIPs,
        topCountries: stats.topCountries.slice(0, 10), // Limit for public display
        topCategories: stats.topCategories,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting security stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve security statistics' 
    });
  }
});

/**
 * Get Wall of Shame data for public display
 * GET /api/security/wall-of-shame
 */
router.get('/wall-of-shame', async (req: Request, res: Response) => {
  try {
    const wallOfShame = await banManager.getWallOfShame();
    
    // Add some fun statistics
    const totalPermanentBans = wallOfShame.permanentBans.length;
    const totalTemporaryBans = wallOfShame.temporaryBans.length;
    
    res.json({
      success: true,
      data: {
        permanentBans: wallOfShame.permanentBans.map(entry => ({
          maskedIP: entry.maskedIP,
          country: entry.country,
          countryFlag: entry.countryFlag,
          reason: entry.reason,
          category: entry.category,
          offendingRequest: entry.offendingRequest,
          bannedAt: entry.bannedAt,
          sarcasticComment: entry.sarcasticComment
        })),
        temporaryBans: wallOfShame.temporaryBans.map(entry => ({
          maskedIP: entry.maskedIP,
          country: entry.country,
          countryFlag: entry.countryFlag,
          reason: entry.reason,
          category: entry.category,
          offendingRequest: entry.offendingRequest,
          bannedAt: entry.bannedAt,
          expiresAt: entry.expiresAt,
          timeLeft: entry.timeLeft,
          sarcasticComment: entry.sarcasticComment
        })),
        statistics: {
          totalPermanentBans,
          totalTemporaryBans,
          totalBans: totalPermanentBans + totalTemporaryBans,
          lastUpdated: new Date().toISOString()
        }
      }
    });
  } catch (error) {
    console.error('Error getting wall of shame:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve wall of shame data' 
    });
  }
});

/**
 * Get attack trends for charts
 * GET /api/security/trends?hours=24
 */
router.get('/trends', async (req: Request, res: Response) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const maxHours = 168; // 7 days max
    const limitedHours = Math.min(hours, maxHours);
    
    const trends = await attackLogger.getAttacksByTime(limitedHours);
    
    res.json({
      success: true,
      data: {
        trends,
        period: `${limitedHours} hours`,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting attack trends:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve attack trends' 
    });
  }
});

/**
 * Get geographic attack distribution
 * GET /api/security/geography
 */
router.get('/geography', async (req: Request, res: Response) => {
  try {
    const geography = await attackLogger.getAttacksByCountry();
    
    res.json({
      success: true,
      data: {
        countries: geography.slice(0, 50), // Limit for performance
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting attack geography:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve geographic data' 
    });
  }
});

/**
 * Get live attack feed (recent attacks)
 * GET /api/security/live-feed?limit=20
 */
router.get('/live-feed', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    
    const pool = DatabaseConnection.getPool();
    const query = `
      SELECT 
        ip,
        path,
        method,
        country,
        attack_type,
        category,
        timestamp,
        response_code
      FROM attack_logs
      WHERE timestamp > NOW() - INTERVAL '1 hour'
      ORDER BY timestamp DESC
      LIMIT $1
    `;
    
    const result = await pool.query(query, [limit]);
    
    const liveFeed = result.rows.map(row => ({
      maskedIP: maskIP(row.ip),
      path: row.path,
      method: row.method,
      country: row.country,
      attackType: row.attack_type,
      category: row.category,
      timestamp: row.timestamp,
      responseCode: row.response_code
    }));
    
    res.json({
      success: true,
      data: {
        attacks: liveFeed,
        count: liveFeed.length,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting live feed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve live attack feed' 
    });
  }
});

/**
 * Get security achievements/badges
 * GET /api/security/achievements
 */
router.get('/achievements', async (req: Request, res: Response) => {
  try {
    const pool = DatabaseConnection.getPool();
    
    // Get various "achievements" from attack data
    const achievements = await Promise.all([
      // Most creative 404
      pool.query(`
        SELECT path, COUNT(*) as count
        FROM attack_logs 
        WHERE response_code = 404 
        AND LENGTH(path) > 20
        GROUP BY path 
        ORDER BY count DESC, LENGTH(path) DESC 
        LIMIT 1
      `),
      
      // WordPress obsessed (most wp-* requests)
      pool.query(`
        SELECT ip, COUNT(*) as count
        FROM attack_logs 
        WHERE path ILIKE '%wp-%'
        GROUP BY ip 
        ORDER BY count DESC 
        LIMIT 1
      `),
      
      // Scanner supreme (most systematic probing)
      pool.query(`
        SELECT ip, COUNT(DISTINCT path) as unique_paths
        FROM attack_logs 
        WHERE category = 'scanner'
        GROUP BY ip 
        ORDER BY unique_paths DESC 
        LIMIT 1
      `),
      
      // Global traveler (attacks from most countries)
      pool.query(`
        SELECT COUNT(DISTINCT country) as country_count
        FROM attack_logs 
        WHERE country IS NOT NULL
      `),
      
      // Speed demon (most attacks in shortest time)
      pool.query(`
        SELECT ip, COUNT(*) as count,
               EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))) as duration_seconds
        FROM attack_logs 
        WHERE timestamp > NOW() - INTERVAL '1 hour'
        GROUP BY ip 
        HAVING COUNT(*) > 10
        ORDER BY (COUNT(*)::float / GREATEST(EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))), 1)) DESC
        LIMIT 1
      `)
    ]);
    
    const [creativeFourOhFour, wordpressObsessed, scannerSupreme, globalTraveler, speedDemon] = achievements;
    
    res.json({
      success: true,
      data: {
        achievements: [
          {
            title: "Most Creative 404",
            description: "Award for the most ridiculous non-existent endpoint",
            winner: creativeFourOhFour.rows[0]?.path || "No winner yet",
            count: creativeFourOhFour.rows[0]?.count || 0,
            icon: "🏆"
          },
          {
            title: "WordPress Obsessed",
            description: "Can't stop looking for wp-admin",
            winner: maskIP(wordpressObsessed.rows[0]?.ip || "No winner yet"),
            count: wordpressObsessed.rows[0]?.count || 0,
            icon: "🎯"
          },
          {
            title: "Scanner Supreme",
            description: "Most systematic endpoint probing",
            winner: maskIP(scannerSupreme.rows[0]?.ip || "No winner yet"),
            uniquePaths: scannerSupreme.rows[0]?.unique_paths || 0,
            icon: "🔍"
          },
          {
            title: "Global Traveler",
            description: "Attacks detected from multiple countries",
            count: globalTraveler.rows[0]?.country_count || 0,
            icon: "🌍"
          },
          {
            title: "Speed Demon",
            description: "Fastest attack rate per second",
            winner: maskIP(speedDemon.rows[0]?.ip || "No winner yet"),
            attacksPerSecond: speedDemon.rows[0] ? 
              (speedDemon.rows[0].count / Math.max(speedDemon.rows[0].duration_seconds, 1)).toFixed(2) : 0,
            icon: "⚡"
          }
        ],
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting achievements:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retrieve achievements' 
    });
  }
});

/**
 * Get system uptime and health for dashboard
 * GET /api/security/system-health
 */
router.get('/system-health', async (req: Request, res: Response) => {
  try {
    const startTime = process.hrtime();
    
    // Test database connection
    const pool = DatabaseConnection.getPool();
    await pool.query('SELECT 1');
    
    const endTime = process.hrtime(startTime);
    const dbResponseTime = (endTime[0] * 1000 + endTime[1] / 1000000).toFixed(2);
    
    const uptime = process.uptime();
    const uptimeHours = Math.floor(uptime / 3600);
    const uptimeMinutes = Math.floor((uptime % 3600) / 60);
    
    res.json({
      success: true,
      data: {
        status: 'healthy',
        uptime: {
          seconds: Math.floor(uptime),
          formatted: `${uptimeHours}h ${uptimeMinutes}m`
        },
        database: {
          status: 'connected',
          responseTime: `${dbResponseTime}ms`
        },
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
        },
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting system health:', error);
    res.status(500).json({ 
      success: false, 
      error: 'System health check failed',
      data: {
        status: 'unhealthy',
        lastUpdated: new Date().toISOString()
      }
    });
  }
});

/**
 * Utility function to mask IP addresses
 */
function maskIP(ip: string): string {
  if (!ip || ip === 'No winner yet') return ip;
  
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
  }
  return ip;
}

export default router;
