import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { AdminUser } from '../database/models/AdminUser';

export interface JWTPayload {
  userId: string;
  username: string;
  email: string;
  mfaVerified: boolean;
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface MFAChallenge {
  userId: string;
  username: string;
  email: string;
  challengeId: string;
  expiresAt: Date;
}

export class JWTManager {
  private static readonly JWT_SECRET = process.env.JWT_SECRET || 'whirlcrypt-jwt-secret-change-in-production';
  private static readonly JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
  private static readonly MFA_CHALLENGE_EXPIRES_IN = '5m'; // 5 minutes for MFA challenge

  /**
   * Generate a JWT token for authenticated user (after MFA if enabled)
   */
  static generateToken(user: AdminUser, sessionId: string): string {
    const payload: JWTPayload = {
      userId: user.id,
      username: user.username,
      email: user.email,
      mfaVerified: true,
      sessionId
    };

    return jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: this.JWT_EXPIRES_IN,
      issuer: 'whirlcrypt',
      audience: 'whirlcrypt-admin'
    } as jwt.SignOptions);
  }

  /**
   * Generate a temporary MFA challenge token (before MFA verification)
   */
  static generateMFAChallenge(user: AdminUser): { token: string; challengeId: string } {
    const challengeId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const payload: MFAChallenge = {
      userId: user.id,
      username: user.username,
      email: user.email,
      challengeId,
      expiresAt
    };

    const token = jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: this.MFA_CHALLENGE_EXPIRES_IN,
      issuer: 'whirlcrypt',
      audience: 'whirlcrypt-mfa-challenge'
    });

    return { token, challengeId };
  }

  /**
   * Verify and decode a JWT token
   */
  static verifyToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET, {
        issuer: 'whirlcrypt',
        audience: 'whirlcrypt-admin'
      }) as JWTPayload;

      return decoded;
    } catch (error) {
      return null;
    }
  }

  /**
   * Verify and decode an MFA challenge token
   */
  static verifyMFAChallenge(token: string): MFAChallenge | null {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET, {
        issuer: 'whirlcrypt',
        audience: 'whirlcrypt-mfa-challenge'
      }) as MFAChallenge;

      return decoded;
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate a secure token hash for session storage
   */
  static generateTokenHash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Generate a secure session ID
   */
  static generateSessionId(): string {
    return crypto.randomUUID();
  }

  /**
   * Extract token from Authorization header
   */
  static extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }

  /**
   * Check if token is expired
   */
  static isTokenExpired(payload: JWTPayload): boolean {
    if (!payload.exp) {
      return true;
    }
    return Date.now() >= payload.exp * 1000;
  }

  /**
   * Get token expiration date
   */
  static getTokenExpiration(expiresIn: string = this.JWT_EXPIRES_IN): Date {
    const now = new Date();
    
    // Parse expiration string (e.g., "24h", "7d", "30m")
    const match = expiresIn.match(/^(\d+)([hdm])$/);
    if (!match) {
      // Default to 24 hours if parsing fails
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }

    const [, amount, unit] = match;
    const value = parseInt(amount, 10);

    switch (unit) {
      case 'h':
        return new Date(now.getTime() + value * 60 * 60 * 1000);
      case 'd':
        return new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
      case 'm':
        return new Date(now.getTime() + value * 60 * 1000);
      default:
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  /**
   * Refresh token if it's close to expiration
   */
  static shouldRefreshToken(payload: JWTPayload): boolean {
    if (!payload.exp) {
      return true;
    }
    
    const expirationTime = payload.exp * 1000;
    const currentTime = Date.now();
    const timeUntilExpiration = expirationTime - currentTime;
    
    // Refresh if less than 1 hour remaining
    return timeUntilExpiration < 60 * 60 * 1000;
  }

  /**
   * Generate backup codes for MFA
   */
  static generateBackupCodes(count: number = 10): string[] {
    return Array.from({ length: count }, () => 
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );
  }

  /**
   * Validate JWT configuration
   */
  static validateConfiguration(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.JWT_SECRET === 'whirlcrypt-jwt-secret-change-in-production') {
      errors.push('JWT_SECRET is using default value - change in production');
    }

    if (this.JWT_SECRET.length < 32) {
      errors.push('JWT_SECRET should be at least 32 characters long');
    }

    const expiresInPattern = /^(\d+)([hdm])$/;
    if (!expiresInPattern.test(this.JWT_EXPIRES_IN)) {
      errors.push('JWT_EXPIRES_IN should be in format like "24h", "7d", or "30m"');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Validate configuration on module load
const configValidation = JWTManager.validateConfiguration();
if (!configValidation.valid) {
  const criticalErrors = configValidation.errors.filter(error =>
    error.includes('default value') || error.includes('32 characters')
  );

  if (criticalErrors.length > 0) {
    console.error('🔴 CRITICAL JWT Configuration Errors:');
    criticalErrors.forEach(error => {
      console.error(`   - ${error}`);
    });
    console.error('🔴 Application startup FAILED. Fix JWT configuration and restart.');
    process.exit(1);
  } else {
    console.warn('⚠️  JWT Configuration Issues:');
    configValidation.errors.forEach(error => {
      console.warn(`   - ${error}`);
    });
  }
}
