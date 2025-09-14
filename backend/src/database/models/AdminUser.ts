import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';
import { randomBytes } from 'crypto';
import { DatabaseConnection } from '../connection';

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  mfaSecret?: string;
  mfaEnabled: boolean;
  mfaBackupCodes?: string[];
  isActive: boolean;
  lastLogin?: Date;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAdminUserData {
  username: string;
  email: string;
  password: string;
  mfaEnabled?: boolean;
}

export interface UpdateAdminUserData {
  email?: string;
  password?: string;
  mfaEnabled?: boolean;
  isActive?: boolean;
  failedLoginAttempts?: number;
  lockedUntil?: Date;
  lastLogin?: Date;
}

export interface AdminSession {
  id: string;
  userId: string;
  tokenHash: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface AdminAuditLog {
  id: string;
  userId?: string;
  username?: string;
  action: string;
  resource?: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
  metadata?: any;
  createdAt: Date;
}

export class AdminUserRepository {
  private pool: Pool;

  constructor() {
    this.pool = DatabaseConnection.getPool();
  }

  async createUser(data: CreateAdminUserData): Promise<AdminUser> {
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(data.password, saltRounds);
    
    let mfaSecret: string | undefined;
    let mfaBackupCodes: string[] | undefined;
    
    if (data.mfaEnabled) {
      mfaSecret = speakeasy.generateSecret({
        name: `Whirlcrypt (${data.username})`,
        issuer: 'Whirlcrypt'
      }).base32;
      
      // Generate 10 cryptographically secure backup codes
      mfaBackupCodes = Array.from({ length: 10 }, () =>
        randomBytes(4).toString('hex').toUpperCase()
      );
    }

    const query = `
      INSERT INTO admin_users (
        username, email, password_hash, mfa_secret, mfa_enabled, mfa_backup_codes
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const values = [
      data.username,
      data.email,
      passwordHash,
      mfaSecret,
      data.mfaEnabled || false,
      mfaBackupCodes
    ];

    const result = await this.pool.query(query, values);
    return this.mapRowToAdminUser(result.rows[0]);
  }

  async findByUsername(username: string): Promise<AdminUser | null> {
    const query = 'SELECT * FROM admin_users WHERE username = $1';
    const result = await this.pool.query(query, [username]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToAdminUser(result.rows[0]);
  }

  async findById(id: string): Promise<AdminUser | null> {
    const query = 'SELECT * FROM admin_users WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToAdminUser(result.rows[0]);
  }

  async updateUser(id: string, data: UpdateAdminUserData): Promise<AdminUser | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.email !== undefined) {
      updates.push(`email = $${paramCount++}`);
      values.push(data.email);
    }

    if (data.password !== undefined) {
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(data.password, saltRounds);
      updates.push(`password_hash = $${paramCount++}`);
      values.push(passwordHash);
    }

    if (data.mfaEnabled !== undefined) {
      updates.push(`mfa_enabled = $${paramCount++}`);
      values.push(data.mfaEnabled);
    }

    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(data.isActive);
    }

    if (data.failedLoginAttempts !== undefined) {
      updates.push(`failed_login_attempts = $${paramCount++}`);
      values.push(data.failedLoginAttempts);
    }

    if (data.lockedUntil !== undefined) {
      updates.push(`locked_until = $${paramCount++}`);
      values.push(data.lockedUntil);
    }

    if (data.lastLogin !== undefined) {
      updates.push(`last_login = $${paramCount++}`);
      values.push(data.lastLogin);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const query = `
      UPDATE admin_users 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToAdminUser(result.rows[0]);
  }

  async deleteUser(id: string): Promise<boolean> {
    const query = 'DELETE FROM admin_users WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return (result.rowCount || 0) > 0;
  }

  async listUsers(): Promise<AdminUser[]> {
    const query = 'SELECT * FROM admin_users ORDER BY created_at DESC';
    const result = await this.pool.query(query);
    return result.rows.map(row => this.mapRowToAdminUser(row));
  }

  async verifyPassword(user: AdminUser, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  async verifyMfaToken(user: AdminUser, token: string): Promise<boolean> {
    if (!user.mfaEnabled || !user.mfaSecret) {
      return false;
    }

    // Check if it's a backup code
    if (user.mfaBackupCodes && user.mfaBackupCodes.includes(token.toUpperCase())) {
      // Remove used backup code
      const updatedCodes = user.mfaBackupCodes.filter(code => code !== token.toUpperCase());
      await this.pool.query(
        'UPDATE admin_users SET mfa_backup_codes = $1 WHERE id = $2',
        [updatedCodes, user.id]
      );
      return true;
    }

    // Verify TOTP token
    return speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: token,
      window: 2 // Allow 2 time steps (60 seconds) of drift
    });
  }

  async generateMfaSecret(userId: string, username: string): Promise<{ secret: string; qrCode: string }> {
    const secret = speakeasy.generateSecret({
      name: `Whirlcrypt (${username})`,
      issuer: 'Whirlcrypt'
    });

    // Update user with new secret
    await this.pool.query(
      'UPDATE admin_users SET mfa_secret = $1 WHERE id = $2',
      [secret.base32, userId]
    );

    return {
      secret: secret.base32,
      qrCode: secret.otpauth_url || ''
    };
  }

  private mapRowToAdminUser(row: any): AdminUser {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      passwordHash: row.password_hash,
      mfaSecret: row.mfa_secret,
      mfaEnabled: row.mfa_enabled,
      mfaBackupCodes: row.mfa_backup_codes,
      isActive: row.is_active,
      lastLogin: row.last_login,
      failedLoginAttempts: row.failed_login_attempts,
      lockedUntil: row.locked_until,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

export class AdminSessionRepository {
  private pool: Pool;

  constructor() {
    this.pool = DatabaseConnection.getPool();
  }

  async createSession(data: {
    userId: string;
    tokenHash: string;
    ipAddress?: string;
    userAgent?: string;
    expiresAt: Date;
  }): Promise<AdminSession> {
    const query = `
      INSERT INTO admin_sessions (user_id, token_hash, ip_address, user_agent, expires_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const values = [data.userId, data.tokenHash, data.ipAddress, data.userAgent, data.expiresAt];
    const result = await this.pool.query(query, values);
    return this.mapRowToSession(result.rows[0]);
  }

  async findByTokenHash(tokenHash: string): Promise<AdminSession | null> {
    const query = 'SELECT * FROM admin_sessions WHERE token_hash = $1 AND expires_at > NOW()';
    const result = await this.pool.query(query, [tokenHash]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToSession(result.rows[0]);
  }

  async deleteSession(tokenHash: string): Promise<boolean> {
    const query = 'DELETE FROM admin_sessions WHERE token_hash = $1';
    const result = await this.pool.query(query, [tokenHash]);
    return (result.rowCount || 0) > 0;
  }

  async deleteUserSessions(userId: string): Promise<number> {
    const query = 'DELETE FROM admin_sessions WHERE user_id = $1';
    const result = await this.pool.query(query, [userId]);
    return result.rowCount || 0;
  }

  async cleanupExpiredSessions(): Promise<number> {
    const query = 'DELETE FROM admin_sessions WHERE expires_at < NOW()';
    const result = await this.pool.query(query);
    return result.rowCount || 0;
  }

  private mapRowToSession(row: any): AdminSession {
    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      expiresAt: row.expires_at,
      createdAt: row.created_at
    };
  }
}

export class AdminAuditRepository {
  private pool: Pool;

  constructor() {
    this.pool = DatabaseConnection.getPool();
  }

  async logAction(data: {
    userId?: string;
    username?: string;
    action: string;
    resource?: string;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
    errorMessage?: string;
    metadata?: any;
  }): Promise<AdminAuditLog> {
    const query = `
      INSERT INTO admin_audit_log (
        user_id, username, action, resource, ip_address, user_agent,
        success, error_message, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      data.userId,
      data.username,
      data.action,
      data.resource,
      data.ipAddress,
      data.userAgent,
      data.success,
      data.errorMessage,
      data.metadata ? JSON.stringify(data.metadata) : null
    ];

    const result = await this.pool.query(query, values);
    return this.mapRowToAuditLog(result.rows[0]);
  }

  async getAuditLogs(options: {
    userId?: string;
    action?: string;
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<AdminAuditLog[]> {
    let query = 'SELECT * FROM admin_audit_log WHERE 1=1';
    const values: any[] = [];
    let paramCount = 1;

    if (options.userId) {
      query += ` AND user_id = $${paramCount++}`;
      values.push(options.userId);
    }

    if (options.action) {
      query += ` AND action = $${paramCount++}`;
      values.push(options.action);
    }

    if (options.startDate) {
      query += ` AND created_at >= $${paramCount++}`;
      values.push(options.startDate);
    }

    if (options.endDate) {
      query += ` AND created_at <= $${paramCount++}`;
      values.push(options.endDate);
    }

    query += ' ORDER BY created_at DESC';

    if (options.limit) {
      query += ` LIMIT $${paramCount++}`;
      values.push(options.limit);
    }

    if (options.offset) {
      query += ` OFFSET $${paramCount++}`;
      values.push(options.offset);
    }

    const result = await this.pool.query(query, values);
    return result.rows.map(row => this.mapRowToAuditLog(row));
  }

  private mapRowToAuditLog(row: any): AdminAuditLog {
    return {
      id: row.id,
      userId: row.user_id,
      username: row.username,
      action: row.action,
      resource: row.resource,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      success: row.success,
      errorMessage: row.error_message,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
      createdAt: row.created_at
    };
  }
}
