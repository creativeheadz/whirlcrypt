import { Request, Response, NextFunction } from 'express';
import { join } from 'path';
import { AttackLogger } from '../services/AttackLogger';
import { BanManager } from '../services/BanManager';

// Known attack patterns for permanent bans
const PERMANENT_BAN_PATTERNS = [
  // WordPress hunting
  /wp-admin/i,
  /wp-login/i,
  /wp-content/i,
  /wp-includes/i,
  /wordpress/i,
  /wp-config/i,
  
  // Admin panel hunting
  /phpmyadmin/i,
  /adminer/i,
  /cpanel/i,
  /admin\.php/i,
  /administrator/i,
  /panel/i,
  
  // Config/secret hunting
  /\.env/i,
  /config\.php/i,
  /database\.yml/i,
  /settings\.py/i,
  /\.git/i,
  /\.svn/i,
  
  // Common CMS/framework probes
  /drupal/i,
  /joomla/i,
  /magento/i,
  /prestashop/i,
  
  // Server info hunting
  /phpinfo/i,
  /server-status/i,
  /server-info/i,
  
  // Backup file hunting
  /backup/i,
  /\.sql/i,
  /\.zip/i,
  /\.tar\.gz/i,
  
  // API hunting
  /api\/v1/i,
  /api\/v2/i,
  /rest\/v1/i,
  /graphql/i,
  
  // Common exploits
  /shell/i,
  /cmd/i,
  /eval/i,
  /system/i
];

// User agents that indicate automated tools
const SUSPICIOUS_USER_AGENTS = [
  /nmap/i,
  /masscan/i,
  /zmap/i,
  /nikto/i,
  /sqlmap/i,
  /gobuster/i,
  /dirb/i,
  /dirbuster/i,
  /wpscan/i,
  /python-requests/i,
  /curl\/7\./i, // Basic curl requests
  /wget/i,
  /scanner/i,
  /bot/i,
  /crawler/i
];

export interface AttackInfo {
  ip: string;
  userAgent: string;
  path: string;
  method: string;
  timestamp: Date;
  country?: string;
  attackType: 'permanent_ban' | 'temporary_ban' | 'suspicious';
  reason: string;
  category: 'wordpress' | 'admin' | 'env' | 'scanner' | 'random404' | 'exploit';
}

export class AttackDetectionMiddleware {
  private static attackLogger = new AttackLogger();
  private static banManager = new BanManager();

  /**
   * Main attack detection middleware
   */
  static detect() {
    return async (req: Request, res: Response, next: NextFunction) => {
      const ip = this.getClientIP(req);
      const userAgent = req.get('User-Agent') || 'Unknown';
      const path = req.path;
      const method = req.method;

      // Always allow security dashboard API calls
      if (path.startsWith('/api/security/')) {
        return next();
      }

      // Check if IP is already banned
      if (await this.banManager.isBanned(ip)) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'Your IP has been banned for suspicious activity'
        });
      }

      // Detect attack patterns
      const attackInfo = this.analyzeRequest(ip, userAgent, path, method);
      
      if (attackInfo) {
        // Log the attack
        await this.attackLogger.logAttack(attackInfo);

        // Apply appropriate ban
        if (attackInfo.attackType === 'permanent_ban') {
          await this.banManager.permanentBan(ip, attackInfo);
          return res.status(403).json({ 
            error: 'Permanently banned',
            message: 'Nice try, script kiddie! 😂'
          });
        } else if (attackInfo.attackType === 'temporary_ban') {
          await this.banManager.temporaryBan(ip, attackInfo, 15); // 15 minutes
          return res.status(403).json({ 
            error: 'Temporarily banned',
            message: 'Take a 15-minute timeout to think about what you did! ⏰'
          });
        }
      }

      next();
    };
  }

  /**
   * 404 handler with attack detection
   */
  static handle404() {
    return async (req: Request, res: Response) => {
      const ip = this.getClientIP(req);
      const userAgent = req.get('User-Agent') || 'Unknown';
      const path = req.path;
      const method = req.method;

      // Check for permanent ban patterns in 404s
      const isPermanentBanPattern = PERMANENT_BAN_PATTERNS.some(pattern => 
        pattern.test(path)
      );

      if (isPermanentBanPattern) {
        const attackInfo: AttackInfo = {
          ip,
          userAgent,
          path,
          method,
          timestamp: new Date(),
          attackType: 'permanent_ban',
          reason: `Probing for non-existent endpoint: ${path}`,
          category: this.categorizeAttack(path)
        };

        await this.attackLogger.logAttack(attackInfo);
        await this.banManager.permanentBan(ip, attackInfo);

        return res.status(403).json({
          error: 'Permanently banned',
          message: this.getSarcasticMessage(attackInfo.category)
        });
      }

      // Regular 404 - temporary ban after multiple attempts
      const recentAttempts = await this.attackLogger.getRecentAttempts(ip, 5); // 5 minutes
      
      if (recentAttempts >= 3) {
        const attackInfo: AttackInfo = {
          ip,
          userAgent,
          path,
          method,
          timestamp: new Date(),
          attackType: 'temporary_ban',
          reason: `Multiple 404 attempts: ${recentAttempts} in 5 minutes`,
          category: 'random404'
        };

        await this.attackLogger.logAttack(attackInfo);
        await this.banManager.temporaryBan(ip, attackInfo, 30); // 30 minutes

        return res.status(403).json({
          error: 'Temporarily banned',
          message: 'Too many 404s! Take a break and read the documentation! 📚'
        });
      }

      // Log regular 404
      await this.attackLogger.log404(ip, userAgent, path, method);

      // Check if request accepts HTML
      if (req.accepts('html')) {
        return res.status(404).sendFile(join(__dirname, '../../public/404.html'));
      }

      res.status(404).json({
        error: 'Not found',
        message: 'The endpoint you are looking for does not exist'
      });
    };
  }

  /**
   * Analyze request for attack patterns
   */
  private static analyzeRequest(ip: string, userAgent: string, path: string, method: string): AttackInfo | null {
    // Check for permanent ban patterns
    const isPermanentBanPattern = PERMANENT_BAN_PATTERNS.some(pattern => 
      pattern.test(path)
    );

    if (isPermanentBanPattern) {
      return {
        ip,
        userAgent,
        path,
        method,
        timestamp: new Date(),
        attackType: 'permanent_ban',
        reason: `Malicious endpoint probe: ${path}`,
        category: this.categorizeAttack(path)
      };
    }

    // Check for suspicious user agents
    const isSuspiciousUA = SUSPICIOUS_USER_AGENTS.some(pattern => 
      pattern.test(userAgent)
    );

    if (isSuspiciousUA) {
      return {
        ip,
        userAgent,
        path,
        method,
        timestamp: new Date(),
        attackType: 'permanent_ban',
        reason: `Suspicious user agent: ${userAgent}`,
        category: 'scanner'
      };
    }

    return null;
  }

  /**
   * Categorize attack type for better organization
   */
  private static categorizeAttack(path: string): AttackInfo['category'] {
    if (/wp-|wordpress/i.test(path)) return 'wordpress';
    if (/admin|phpmyadmin|cpanel/i.test(path)) return 'admin';
    if (/\.env|config|settings/i.test(path)) return 'env';
    if (/shell|cmd|eval|system/i.test(path)) return 'exploit';
    return 'random404';
  }

  /**
   * Get sarcastic message based on attack category
   */
  private static getSarcasticMessage(category: AttackInfo['category']): string {
    const messages = {
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

    const categoryMessages = messages[category];
    return categoryMessages[Math.floor(Math.random() * categoryMessages.length)];
  }

  /**
   * Get client IP address (handles proxies)
   */
  private static getClientIP(req: Request): string {
    return (
      req.get('CF-Connecting-IP') ||
      req.get('X-Forwarded-For')?.split(',')[0] ||
      req.get('X-Real-IP') ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      'unknown'
    ).trim();
  }
}
