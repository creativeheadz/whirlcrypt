import { describe, it, expect } from 'vitest';

// Test attack detection patterns directly (same patterns from attackDetection.ts)
const PERMANENT_BAN_PATTERNS = [
  /wp-admin/i, /wp-login/i, /wp-content/i, /wp-includes/i, /wordpress/i, /wp-config/i,
  /phpmyadmin/i, /adminer/i, /cpanel/i, /admin\.php/i, /administrator/i, /panel/i,
  /\.env/i, /config\.php/i, /database\.yml/i, /settings\.py/i, /\.git/i, /\.svn/i,
  /drupal/i, /joomla/i, /magento/i, /prestashop/i,
  /phpinfo/i, /server-status/i, /server-info/i,
  /backup/i, /\.sql/i, /\.zip/i, /\.tar\.gz/i,
  /api\/v1/i, /api\/v2/i, /rest\/v1/i, /graphql/i,
  /shell/i, /cmd/i, /eval/i, /system/i
];

const SUSPICIOUS_USER_AGENTS = [
  /nmap/i, /masscan/i, /zmap/i, /nikto/i, /sqlmap/i,
  /gobuster/i, /dirb/i, /dirbuster/i, /wpscan/i,
  /python-requests/i, /curl\/7\./i, /wget/i,
  /scanner/i, /bot/i, /crawler/i
];

function matchesAttackPattern(path: string): boolean {
  return PERMANENT_BAN_PATTERNS.some(pattern => pattern.test(path));
}

function isSuspiciousUA(ua: string): boolean {
  return SUSPICIOUS_USER_AGENTS.some(pattern => pattern.test(ua));
}

describe('Attack Detection Patterns', () => {
  describe('should detect WordPress probes', () => {
    const wpPaths = ['/wp-admin', '/wp-login.php', '/wp-content/uploads', '/wp-includes/js', '/wp-config.php'];
    wpPaths.forEach(path => {
      it(`detects ${path}`, () => {
        expect(matchesAttackPattern(path)).toBe(true);
      });
    });
  });

  describe('should detect admin panel probes', () => {
    const adminPaths = ['/phpmyadmin', '/adminer.php', '/cpanel', '/admin.php', '/administrator/index.php'];
    adminPaths.forEach(path => {
      it(`detects ${path}`, () => {
        expect(matchesAttackPattern(path)).toBe(true);
      });
    });
  });

  describe('should detect config file hunting', () => {
    const configPaths = ['/.env', '/config.php', '/database.yml', '/settings.py', '/.git/HEAD', '/.svn/entries'];
    configPaths.forEach(path => {
      it(`detects ${path}`, () => {
        expect(matchesAttackPattern(path)).toBe(true);
      });
    });
  });

  describe('should NOT flag legitimate paths', () => {
    const legitimatePaths = ['/api/upload', '/api/download/abc-123', '/api/health', '/'];
    legitimatePaths.forEach(path => {
      it(`allows ${path}`, () => {
        expect(matchesAttackPattern(path)).toBe(false);
      });
    });
  });

  describe('should detect suspicious user agents', () => {
    const suspiciousUAs = [
      'Nmap Scripting Engine',
      'sqlmap/1.7',
      'python-requests/2.31.0',
      'curl/7.88.1',
      'Wget/1.21',
      'Nikto/2.1.6',
      'gobuster/3.5'
    ];
    suspiciousUAs.forEach(ua => {
      it(`flags ${ua}`, () => {
        expect(isSuspiciousUA(ua)).toBe(true);
      });
    });
  });

  describe('should NOT flag legitimate user agents', () => {
    const legitimateUAs = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/118.0'
    ];
    legitimateUAs.forEach(ua => {
      it(`allows ${ua}`, () => {
        expect(isSuspiciousUA(ua)).toBe(false);
      });
    });
  });
});
