import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { randomBytes } from 'crypto';
import { config } from '../config/config';

/**
 * Generate CSP nonce for inline scripts/styles
 */
export const generateCSPNonce = (): string => {
  return randomBytes(16).toString('base64');
};

/**
 * Enhanced Content Security Policy configuration - Wormhole-inspired strict CSP
 * Removes 'unsafe-inline' and implements nonce-based approach
 */
export const cspMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Generate unique nonce for this request
  const nonce = generateCSPNonce();
  res.locals.cspNonce = nonce;

  // Set strict CSP headers
  const cspDirectives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "media-src 'self' blob:",
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "block-all-mixed-content",
    "upgrade-insecure-requests"
  ].join('; ');

  res.setHeader('Content-Security-Policy', cspDirectives);

  // Also set report-only header for monitoring
  const reportOnlyDirectives = cspDirectives + "; report-uri /api/security/csp-report";
  res.setHeader('Content-Security-Policy-Report-Only', reportOnlyDirectives);

  next();
};

/**
 * CSP Violation Report Handler
 */
export const handleCSPViolation = (req: Request, res: Response) => {
  const violation = req.body;

  // Log CSP violations for security monitoring
  console.warn('🚨 CSP Violation Report:', {
    timestamp: new Date().toISOString(),
    userAgent: req.headers['user-agent'],
    ip: req.ip,
    violation: {
      documentURI: violation['document-uri'],
      referrer: violation.referrer,
      violatedDirective: violation['violated-directive'],
      effectiveDirective: violation['effective-directive'],
      originalPolicy: violation['original-policy'],
      blockedURI: violation['blocked-uri'],
      statusCode: violation['status-code'],
      sourceFile: violation['source-file'],
      lineNumber: violation['line-number'],
      columnNumber: violation['column-number']
    }
  });

  // In production, you might want to send this to a security monitoring service
  // or store in database for analysis

  res.status(204).end();
};

/**
 * Rate limiting middleware
 */
export const rateLimitMiddleware = rateLimit({
  windowMs: config.rateLimiting.windowMs,
  max: config.rateLimiting.maxRequests,
  message: {
    error: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // CRITICAL: Use IP address for rate limiting (per-IP, not global)
  keyGenerator: (req: Request) => {
    // Get real IP from proxy headers or fallback to req.ip
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] as string ||
           req.connection.remoteAddress ||
           req.ip ||
           'unknown';
  },
  // Skip rate limiting for static assets AND file downloads
  skip: (req: Request) => {
    return req.path.startsWith('/assets/') ||
           req.path.startsWith('/favicon') ||
           req.path.endsWith('.js') ||
           req.path.endsWith('.css') ||
           req.path.endsWith('.png') ||
           req.path.endsWith('.ico') ||
           (req.method === 'GET' && req.path.startsWith('/api/download/'));
  }
});

/**
 * Upload rate limiting (stricter)
 */
export const uploadRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 uploads per windowMs
  message: {
    error: 'Too many uploads, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // CRITICAL: Use IP address for rate limiting (per-IP, not global)
  keyGenerator: (req: Request) => {
    // Get real IP from proxy headers or fallback to req.ip
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] as string ||
           req.connection.remoteAddress ||
           req.ip ||
           'unknown';
  }
});

/**
 * Security headers middleware - Enhanced with Wormhole-inspired headers
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // XSS Protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // HSTS (only in production)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Cross-Origin Resource Policy - Prevent other origins from accessing data
  // Mitigates side-channel hardware vulnerabilities (Meltdown, Spectre)
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  // Cross-Origin Embedder Policy - Enable cross-origin isolation
  // Ensures browsers load Whirlcrypt in separate renderer process
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

  // Permissions Policy - Disable unnecessary browser features
  // Following Wormhole's approach to disable camera, microphone, etc.
  res.setHeader('Permissions-Policy', [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()',
    'autoplay=()',
    'encrypted-media=()',
    'fullscreen=(self)',
    'picture-in-picture=()'
  ].join(', '));

  // Cross-Origin Opener Policy - Prevent window.opener access
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

  next();
};

/**
 * File type validation
 */
export const validateFileType = (allowedTypes?: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!allowedTypes || allowedTypes.length === 0) {
      return next();
    }
    
    const file = req.file;
    if (file) {
      const fileExtension = file.originalname.split('.').pop()?.toLowerCase();
      
      if (!fileExtension || !allowedTypes.includes(fileExtension)) {
        return res.status(400).json({
          error: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`
        });
      }
    }
    
    next();
  };
};

/**
 * Input sanitization
 */
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  // Sanitize string inputs to prevent XSS
  const sanitizeString = (str: string): string => {
    return str.replace(/[<>\"'&]/g, (match) => {
      const escapeMap: { [key: string]: string } = {
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '&': '&amp;'
      };
      return escapeMap[match];
    });
  };
  
  // Recursively sanitize object properties
  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      return sanitizeString(obj);
    } else if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    } else if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeObject(value);
      }
      return sanitized;
    }
    return obj;
  };
  
  // Sanitize request body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  
  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  
  next();
};