import express from 'express';
import { Request, Response } from 'express';
import { JWTManager } from '../auth/jwt';
import { authRateLimit, requireAuth, logAction, withAuth, AuthenticatedRequest } from '../auth/middleware';
import { AdminUserRepository, AdminSessionRepository, AdminAuditRepository } from '../database/models/AdminUser';
import QRCode from 'qrcode';

const router = express.Router();
const userRepo = new AdminUserRepository();
const sessionRepo = new AdminSessionRepository();
const auditRepo = new AdminAuditRepository();

// Rate limiting for auth endpoints
const loginRateLimit = authRateLimit(5, 15 * 60 * 1000); // 5 attempts per 15 minutes

/**
 * POST /api/admin/auth/login
 * Initial login - returns MFA challenge if MFA is enabled, or full token if not
 */
router.post('/login', loginRateLimit, async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      await auditRepo.logAction({
        username: username || 'unknown',
        action: 'LOGIN_ATTEMPT',
        resource: 'admin_auth',
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'],
        success: false,
        errorMessage: 'Missing credentials'
      });

      return res.status(400).json({
        error: 'Missing credentials',
        message: 'Username and password are required'
      });
    }

    // Find user
    const user = await userRepo.findByUsername(username);
    if (!user) {
      await auditRepo.logAction({
        username,
        action: 'LOGIN_ATTEMPT',
        resource: 'admin_auth',
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'],
        success: false,
        errorMessage: 'User not found'
      });

      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid username or password'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      await auditRepo.logAction({
        userId: user.id,
        username: user.username,
        action: 'LOGIN_ATTEMPT',
        resource: 'admin_auth',
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'],
        success: false,
        errorMessage: 'User inactive'
      });

      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Account is inactive'
      });
    }

    // Check if user is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await auditRepo.logAction({
        userId: user.id,
        username: user.username,
        action: 'LOGIN_ATTEMPT',
        resource: 'admin_auth',
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'],
        success: false,
        errorMessage: 'Account locked'
      });

      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Account is temporarily locked due to too many failed attempts'
      });
    }

    // Verify password
    const passwordValid = await userRepo.verifyPassword(user, password);
    if (!passwordValid) {
      // Increment failed attempts
      const newFailedAttempts = user.failedLoginAttempts + 1;
      const lockUntil = newFailedAttempts >= 5 ? 
        new Date(Date.now() + 30 * 60 * 1000) : // Lock for 30 minutes after 5 failed attempts
        undefined;

      await userRepo.updateUser(user.id, {
        failedLoginAttempts: newFailedAttempts,
        lockedUntil: lockUntil
      });

      await auditRepo.logAction({
        userId: user.id,
        username: user.username,
        action: 'LOGIN_ATTEMPT',
        resource: 'admin_auth',
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'],
        success: false,
        errorMessage: 'Invalid password',
        metadata: { failedAttempts: newFailedAttempts }
      });

      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid username or password'
      });
    }

    // Reset failed attempts on successful password verification
    await userRepo.updateUser(user.id, {
      failedLoginAttempts: 0,
      lockedUntil: undefined
    });

    // Check if MFA is enabled
    if (user.mfaEnabled) {
      // Generate MFA challenge token
      const { token: challengeToken, challengeId } = JWTManager.generateMFAChallenge(user);

      await auditRepo.logAction({
        userId: user.id,
        username: user.username,
        action: 'MFA_CHALLENGE_ISSUED',
        resource: 'admin_auth',
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'],
        success: true,
        metadata: { challengeId }
      });

      return res.json({
        requiresMFA: true,
        challengeToken,
        message: 'MFA verification required'
      });
    } else {
      // No MFA required, generate full session
      const sessionId = JWTManager.generateSessionId();
      const token = JWTManager.generateToken(user, sessionId);
      const tokenHash = JWTManager.generateTokenHash(token);
      const expiresAt = JWTManager.getTokenExpiration();

      // Create session
      await sessionRepo.createSession({
        userId: user.id,
        tokenHash,
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'],
        expiresAt
      });

      // Update last login
      await userRepo.updateUser(user.id, {
        lastLogin: new Date()
      });

      await auditRepo.logAction({
        userId: user.id,
        username: user.username,
        action: 'LOGIN_SUCCESS',
        resource: 'admin_auth',
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'],
        success: true,
        metadata: { sessionId, mfaRequired: false }
      });

      return res.json({
        token,
        expiresAt: expiresAt.toISOString(),
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          mfaEnabled: user.mfaEnabled
        }
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Authentication service unavailable'
    });
  }
});

/**
 * POST /api/admin/auth/verify-mfa
 * Verify MFA token and complete authentication
 */
router.post('/verify-mfa', loginRateLimit, async (req: Request, res: Response) => {
  try {
    const { challengeToken, mfaToken } = req.body;

    if (!challengeToken || !mfaToken) {
      return res.status(400).json({
        error: 'Missing parameters',
        message: 'Challenge token and MFA token are required'
      });
    }

    // Verify challenge token
    const challenge = JWTManager.verifyMFAChallenge(challengeToken);
    if (!challenge) {
      await auditRepo.logAction({
        username: 'unknown',
        action: 'MFA_VERIFICATION_ATTEMPT',
        resource: 'admin_auth',
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'],
        success: false,
        errorMessage: 'Invalid challenge token'
      });

      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid or expired challenge token'
      });
    }

    // Get user
    const user = await userRepo.findById(challenge.userId);
    if (!user || !user.isActive) {
      await auditRepo.logAction({
        userId: challenge.userId,
        username: challenge.username,
        action: 'MFA_VERIFICATION_ATTEMPT',
        resource: 'admin_auth',
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'],
        success: false,
        errorMessage: 'User not found or inactive'
      });

      return res.status(401).json({
        error: 'Authentication failed',
        message: 'User account not found or inactive'
      });
    }

    // Verify MFA token
    const mfaValid = await userRepo.verifyMfaToken(user, mfaToken);
    if (!mfaValid) {
      await auditRepo.logAction({
        userId: user.id,
        username: user.username,
        action: 'MFA_VERIFICATION_ATTEMPT',
        resource: 'admin_auth',
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'],
        success: false,
        errorMessage: 'Invalid MFA token'
      });

      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid MFA token'
      });
    }

    // Generate full session
    const sessionId = JWTManager.generateSessionId();
    const token = JWTManager.generateToken(user, sessionId);
    const tokenHash = JWTManager.generateTokenHash(token);
    const expiresAt = JWTManager.getTokenExpiration();

    // Create session
    await sessionRepo.createSession({
      userId: user.id,
      tokenHash,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      expiresAt
    });

    // Update last login
    await userRepo.updateUser(user.id, {
      lastLogin: new Date()
    });

    await auditRepo.logAction({
      userId: user.id,
      username: user.username,
      action: 'LOGIN_SUCCESS',
      resource: 'admin_auth',
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      success: true,
      metadata: { sessionId, mfaRequired: true, challengeId: challenge.challengeId }
    });

    return res.json({
      token,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        mfaEnabled: user.mfaEnabled
      }
    });
  } catch (error) {
    console.error('MFA verification error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'MFA verification service unavailable'
    });
  }
});

/**
 * POST /api/admin/auth/logout
 * Logout and invalidate session
 */
router.post('/logout', requireAuth, logAction('LOGOUT'), withAuth(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const token = JWTManager.extractTokenFromHeader(req.headers.authorization);
    if (token) {
      const tokenHash = JWTManager.generateTokenHash(token);
      await sessionRepo.deleteSession(tokenHash);
    }

    return res.json({
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Logout service unavailable'
    });
  }
}));

/**
 * POST /api/admin/auth/logout-all
 * Logout from all sessions
 */
router.post('/logout-all', requireAuth, logAction('LOGOUT_ALL'), withAuth(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deletedCount = await sessionRepo.deleteUserSessions(req.admin.user.userId);

    return res.json({
      message: 'Logged out from all sessions successfully',
      sessionsTerminated: deletedCount
    });
  } catch (error) {
    console.error('Logout all error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Logout service unavailable'
    });
  }
}));

/**
 * GET /api/admin/auth/me
 * Get current user info
 */
router.get('/me', requireAuth, withAuth(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await userRepo.findById(req.admin.user.userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User account no longer exists'
      });
    }

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        mfaEnabled: user.mfaEnabled,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Get user info error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'User service unavailable'
    });
  }
}));

/**
 * POST /api/admin/auth/refresh
 * Refresh authentication token
 */
router.post('/refresh', requireAuth, withAuth(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await userRepo.findById(req.admin.user.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'User account not found or inactive'
      });
    }

    // Generate new token
    const newToken = JWTManager.generateToken(user, req.admin.sessionId);
    const expiresAt = JWTManager.getTokenExpiration();

    return res.json({
      token: newToken,
      expiresAt: expiresAt.toISOString()
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Token refresh service unavailable'
    });
  }
}));

/**
 * GET /api/admin/auth/sessions
 * Get active sessions for current user
 */
router.get('/sessions', requireAuth, withAuth(async (req: AuthenticatedRequest, res: Response) => {
  try {
    // This would require extending the session repository to get user sessions
    // For now, return basic info
    return res.json({
      currentSession: {
        id: req.admin.sessionId,
        current: true
      },
      message: 'Session management coming soon'
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Session service unavailable'
    });
  }
}));

/**
 * GET /api/admin/auth/mfa/setup
 * Get MFA setup information (QR code, backup codes)
 */
router.get('/mfa/setup', requireAuth, withAuth(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await userRepo.findById(req.admin.user.userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User account no longer exists'
      });
    }

    if (!user.mfaEnabled || !user.mfaSecret) {
      return res.status(400).json({
        error: 'MFA not enabled',
        message: 'MFA is not enabled for this account'
      });
    }

    // Generate QR code
    const otpauthUrl = `otpauth://totp/Whirlcrypt%20(${encodeURIComponent(user.username)})?secret=${user.mfaSecret}&issuer=Whirlcrypt`;
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    return res.json({
      qrCode: qrCodeDataUrl,
      secret: user.mfaSecret,
      backupCodes: user.mfaBackupCodes || [],
      otpauthUrl
    });
  } catch (error) {
    console.error('MFA setup error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'MFA setup service unavailable'
    });
  }
}));

function getClientIP(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         'unknown';
}

export default router;
