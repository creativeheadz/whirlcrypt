import { Pool, Client, PoolConfig } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

export class DatabaseConnection {
  private static pool: Pool | null = null;

  private static getConfig(): PoolConfig {
    return {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'whirlcrypt',
      user: process.env.DB_USER || 'whirlcrypt_user',
      password: process.env.DB_PASSWORD || 'whirlcrypt_password',
      max: parseInt(process.env.DB_POOL_MAX || '20'),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'),
      ssl: process.env.DB_SSL === 'true' ? {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
      } : false
    };
  }

  static getPool(): Pool {
    if (!this.pool) {
      this.pool = new Pool(this.getConfig());
      
      // Handle pool errors
      this.pool.on('error', (err: Error) => {
        console.error('Unexpected error on idle database client:', err);
      });

      // Log pool events in development
      if (process.env.NODE_ENV === 'development') {
        this.pool.on('connect', () => {
          console.log('📦 New database client connected');
        });
        
        this.pool.on('remove', () => {
          console.log('📦 Database client removed');
        });
      }
    }
    
    return this.pool;
  }

  static async testConnection(): Promise<boolean> {
    try {
      const pool = this.getPool();
      const client = await pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      return true;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  }

  static async initializeSchema(): Promise<void> {
    try {
      const schemaPath = join(__dirname, '../../database/schema.sql');
      const schema = readFileSync(schemaPath, 'utf8');
      
      const pool = this.getPool();
      const client = await pool.connect();
      
      try {
        await client.query(schema);
        console.log('✅ Database schema initialized successfully');
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('❌ Failed to initialize database schema:', error);
      throw error;
    }
  }

  static async createDatabase(): Promise<void> {
    const config = this.getConfig();
    const dbName = config.database;
    
    // Connect to postgres database to create our database
    const adminClient = new Client({
      ...config,
      database: 'postgres'
    });

    try {
      await adminClient.connect();
      
      // Check if database exists
      const result = await adminClient.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        [dbName]
      );

      if (result.rows.length === 0) {
        // Create database
        await adminClient.query(`CREATE DATABASE "${dbName}"`);
        console.log(`✅ Database "${dbName}" created successfully`);
        
        // Create user if not exists
        try {
          await adminClient.query(
            `CREATE USER "${config.user}" WITH PASSWORD '${config.password}'`
          );
          console.log(`✅ User "${config.user}" created successfully`);
        } catch (userError: any) {
          if (userError.code === '42710') { // User already exists
            console.log(`ℹ️ User "${config.user}" already exists`);
          } else {
            throw userError;
          }
        }

        // Grant privileges
        await adminClient.query(`GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${config.user}"`);
        console.log(`✅ Privileges granted to "${config.user}"`);
      } else {
        console.log(`ℹ️ Database "${dbName}" already exists`);
      }
    } finally {
      await adminClient.end();
    }
  }

  static async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      console.log('📦 Database pool closed');
    }
  }

  // Health check query
  static async healthCheck(): Promise<{ status: string; timestamp: string; version?: string }> {
    try {
      const pool = this.getPool();
      const result = await pool.query('SELECT NOW() as timestamp, version() as version');
      
      return {
        status: 'healthy',
        timestamp: result.rows[0].timestamp,
        version: result.rows[0].version
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString()
      };
    }
  }
}