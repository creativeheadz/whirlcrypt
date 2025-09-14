import { Request, Response, NextFunction, RequestHandler } from 'express';
import { JWTManager, JWTPayload } from './jwt';
import { AdminUserRepository, AdminSessionRepository, AdminAuditRepository } from '../database/models/AdminUser';

// Extend Express Request interface to include admin user info
declare global {
  namespace Express {
    interface Request {
      admin?: {
        user: JWTPayload;
        sessionId: string;
      };
    }
  }
}

export interface AuthenticatedRequest extends Request {
  admin: {
    user: JWTPayload;
    sessionId: string;
  };
}

// Type for authenticated request handlers
export type AuthenticatedRequestHandler = (
  req: AuthenticatedRequest,
  res: Response,
  next?: NextFunction
) => Promise<any> | any;

// Type guard to check if request is authenticated
export function isAuthenticatedRequest(req: Request): req is AuthenticatedRequest {
  return req.admin !== undefined;
}

export class AuthMiddleware {
  private static userRepo = new AdminUserRepository();
  private static sessionRepo = new AdminSessionRepository();
  private static auditRepo = new AdminAuditRepository();

  /**
   * Middleware to require admin authentication
   */
  static requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = JWTManager.extractTokenFromHeader(req.headers.authorization);
      
      if (!token) {
        await AuthMiddleware.logFailedAuth(req, 'No token provided');
        res.status(401).json({
          error: 'Authentication required',
          message: 'No authentication token provided'
        });
        return;
      }

      // Verify JWT token
      const payload = JWTManager.verifyToken(token);
      if (!payload) {
        await AuthMiddleware.logFailedAuth(req, 'Invalid token');
        res.status(401).json({
          error: 'Authentication failed',
          message: 'Invalid or expired token'
        });
        return;
      }

      // Check if token is expired
      if (JWTManager.isTokenExpired(payload)) {
        await AuthMiddleware.logFailedAuth(req, 'Token expired', payload.username);
        res.status(401).json({
          error: 'Authentication failed',
          message: 'Token has expired'
        });
        return;
      }

      // Verify session exists and is valid
      const tokenHash = JWTManager.generateTokenHash(token);
      const session = await AuthMiddleware.sessionRepo.findByTokenHash(tokenHash);
      
      if (!session) {
        await AuthMiddleware.logFailedAuth(req, 'Session not found', payload.username);
        res.status(401).json({
          error: 'Authentication failed',
          message: 'Session not found or expired'
        });
        return;
      }

      // Verify user still exists and is active
      const user = await AuthMiddleware.userRepo.findById(payload.userId);
      if (!user || !user.isActive) {
        await AuthMiddleware.logFailedAuth(req, 'User inactive or not found', payload.username);
        res.status(401).json({
          error: 'Authentication failed',
          message: 'User account is inactive'
        });
        return;
      }

      // Check if user is locked
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        await AuthMiddleware.logFailedAuth(req, 'User account locked', payload.username);
        res.status(401).json({
          error: 'Authentication failed',
          message: 'User account is temporarily locked'
        });
        return;
      }

      // Verify MFA if enabled
      if (user.mfaEnabled && !payload.mfaVerified) {
        await AuthMiddleware.logFailedAuth(req, 'MFA not verified', payload.username);
        res.status(401).json({
          error: 'Authentication failed',
          message: 'MFA verification required'
        });
        return;
      }

      // Attach admin info to request
      req.admin = {
        user: payload,
        sessionId: session.id
      };

      // Refresh token if needed
      if (JWTManager.shouldRefreshToken(payload)) {
        const newToken = JWTManager.generateToken(user, session.id);
        res.setHeader('X-New-Token', newToken);
      }

      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      await AuthMiddleware.logFailedAuth(req, `Internal error: ${(error as Error).message}`);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Authentication service unavailable'
      });
    }
  };

  /**
   * Middleware to require specific admin permissions (future extension)
   */
  static requirePermission = (permission: string) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      // For now, all authenticated admins have all permissions
      // This can be extended later with role-based access control
      next();
    };
  };

  /**
   * Middleware to log admin actions
   */
  static logAction = (action: string, resource?: string): RequestHandler => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      try {
        const originalSend = res.send;
        let responseBody: any;

        // Capture response for logging
        res.send = function(body: any) {
          responseBody = body;
          return originalSend.call(this, body);
        };

        // Continue with the request
        next();

        // Log after response is sent
        res.on('finish', async () => {
          try {
            const success = res.statusCode < 400;
            const errorMessage = success ? undefined : 
              (typeof responseBody === 'string' ? responseBody : 
               responseBody?.message || `HTTP ${res.statusCode}`);

            await AuthMiddleware.auditRepo.logAction({
              userId: authReq.admin.user.userId,
              username: authReq.admin.user.username,
              action,
              resource,
              ipAddress: AuthMiddleware.getClientIP(req),
              userAgent: req.headers['user-agent'],
              success,
              errorMessage,
              metadata: {
                method: req.method,
                path: req.path,
                statusCode: res.statusCode,
                sessionId: authReq.admin.sessionId
              }
            });
          } catch (auditError) {
            console.error('Failed to log admin action:', auditError);
          }
        });
      } catch (error) {
        console.error('Action logging middleware error:', error);
        next();
      }
    };
  };

  /**
   * Optional authentication - sets admin info if token is valid, but doesn't require it
   */
  static optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = JWTManager.extractTokenFromHeader(req.headers.authorization);
      
      if (token) {
        const payload = JWTManager.verifyToken(token);
        if (payload && !JWTManager.isTokenExpired(payload)) {
          const tokenHash = JWTManager.generateTokenHash(token);
          const session = await AuthMiddleware.sessionRepo.findByTokenHash(tokenHash);
          
          if (session) {
            const user = await AuthMiddleware.userRepo.findById(payload.userId);
            if (user && user.isActive && (!user.lockedUntil || user.lockedUntil <= new Date())) {
              req.admin = {
                user: payload,
                sessionId: session.id
              };
            }
          }
        }
      }
      
      next();
    } catch (error) {
      // Silently continue without authentication
      next();
    }
  };

  /**
   * Rate limiting for authentication endpoints
   */
  static authRateLimit = (maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000) => {
    const attempts = new Map<string, { count: number; resetTime: number }>();

    return (req: Request, res: Response, next: NextFunction): void => {
      const clientIP = AuthMiddleware.getClientIP(req);
      const now = Date.now();
      
      // Clean up expired entries
      for (const [ip, data] of attempts.entries()) {
        if (now > data.resetTime) {
          attempts.delete(ip);
        }
      }

      const clientAttempts = attempts.get(clientIP);
      
      if (clientAttempts && clientAttempts.count >= maxAttempts) {
        res.status(429).json({
          error: 'Too many attempts',
          message: 'Too many authentication attempts. Please try again later.',
          retryAfter: Math.ceil((clientAttempts.resetTime - now) / 1000)
        });
        return;
      }

      // Track this attempt
      if (clientAttempts) {
        clientAttempts.count++;
      } else {
        attempts.set(clientIP, {
          count: 1,
          resetTime: now + windowMs
        });
      }

      next();
    };
  };

  /**
   * Helper to get client IP address
   */
  private static getClientIP(req: Request): string {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
           req.connection.remoteAddress ||
           req.socket.remoteAddress ||
           'unknown';
  }

  /**
   * Helper to log failed authentication attempts
   */
  private static async logFailedAuth(req: Request, reason: string, username?: string): Promise<void> {
    try {
      await AuthMiddleware.auditRepo.logAction({
        username: username || 'unknown',
        action: 'FAILED_AUTH',
        resource: 'admin_auth',
        ipAddress: AuthMiddleware.getClientIP(req),
        userAgent: req.headers['user-agent'],
        success: false,
        errorMessage: reason,
        metadata: {
          method: req.method,
          path: req.path,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Failed to log authentication failure:', error);
    }
  }
}

// Helper function to wrap authenticated route handlers with proper typing
export function withAuth(handler: AuthenticatedRequestHandler): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!isAuthenticatedRequest(req)) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'This endpoint requires authentication'
      });
      return;
    }

    try {
      await handler(req, res, next);
    } catch (error) {
      console.error('Authenticated route handler error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Request processing failed'
      });
    }
  };
}

// Export commonly used middleware combinations
export const requireAuth = AuthMiddleware.requireAuth;
export const optionalAuth = AuthMiddleware.optionalAuth;
export const logAction = AuthMiddleware.logAction;
export const authRateLimit = AuthMiddleware.authRateLimit;
