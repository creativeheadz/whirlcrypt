import { Pool } from 'pg';
import { DatabaseConnection } from '../connection';
import { FileMetadata } from '../../types';

export interface CreateFileData {
  filename: string;
  originalSize: number;
  encryptedSize: number;
  contentType: string;
  storagePath: string;
  storageProvider: string;
  expiresAt: Date;
  maxDownloads?: number;
}

export interface UpdateFileData {
  downloadCount?: number;
  isActive?: boolean;
  maxDownloads?: number;
}

export interface DownloadLogData {
  fileId: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
}

export class FileRepository {
  private pool: Pool;

  constructor() {
    this.pool = DatabaseConnection.getPool();
  }

  async create(data: CreateFileData): Promise<FileMetadata> {
    const query = `
      INSERT INTO files (
        filename, original_size, encrypted_size, content_type, 
        storage_path, storage_provider, expires_at, max_downloads
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      data.filename,
      data.originalSize,
      data.encryptedSize,
      data.contentType,
      data.storagePath,
      data.storageProvider,
      data.expiresAt,
      data.maxDownloads
    ];

    const result = await this.pool.query(query, values);
    return this.mapRowToFileMetadata(result.rows[0]);
  }

  async findById(id: string): Promise<FileMetadata | null> {
    const query = 'SELECT * FROM files WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToFileMetadata(result.rows[0]);
  }

  async findActiveById(id: string): Promise<FileMetadata | null> {
    const query = 'SELECT * FROM active_files WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToFileMetadata(result.rows[0]);
  }

  async isFileAvailable(id: string): Promise<boolean> {
    const query = `
      SELECT 1 FROM active_files 
      WHERE id = $1 AND is_expired = FALSE
      AND (max_downloads IS NULL OR download_count < max_downloads)
    `;
    
    const result = await this.pool.query(query, [id]);
    return result.rows.length > 0;
  }

  async update(id: string, data: UpdateFileData): Promise<FileMetadata | null> {
    const setParts: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.downloadCount !== undefined) {
      setParts.push(`download_count = $${paramIndex}`);
      values.push(data.downloadCount);
      paramIndex++;
    }

    if (data.isActive !== undefined) {
      setParts.push(`is_active = $${paramIndex}`);
      values.push(data.isActive);
      paramIndex++;
    }

    if (data.maxDownloads !== undefined) {
      setParts.push(`max_downloads = $${paramIndex}`);
      values.push(data.maxDownloads);
      paramIndex++;
    }

    if (setParts.length === 0) {
      return this.findById(id);
    }

    const query = `
      UPDATE files 
      SET ${setParts.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    values.push(id);

    const result = await this.pool.query(query, values);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToFileMetadata(result.rows[0]);
  }

  async incrementDownloadCount(id: string): Promise<FileMetadata | null> {
    const query = `
      UPDATE files 
      SET download_count = download_count + 1
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToFileMetadata(result.rows[0]);
  }

  async logDownload(data: DownloadLogData): Promise<void> {
    const query = `
      INSERT INTO download_logs (file_id, ip_address, user_agent, success, error_message)
      VALUES ($1, $2, $3, $4, $5)
    `;

    await this.pool.query(query, [
      data.fileId,
      data.ipAddress,
      data.userAgent,
      data.success,
      data.errorMessage
    ]);
  }

  async cleanupExpiredFiles(): Promise<number> {
    const result = await this.pool.query('SELECT cleanup_expired_files()');
    return result.rows[0].cleanup_expired_files;
  }

  async getStats(): Promise<{
    totalFiles: number;
    activeFiles: number;
    expiredFiles: number;
    totalSize: number;
    totalDownloads: number;
  }> {
    const query = `
      SELECT 
        COUNT(*) as total_files,
        COUNT(*) FILTER (WHERE is_active = TRUE) as active_files,
        COUNT(*) FILTER (WHERE is_active = FALSE) as expired_files,
        COALESCE(SUM(encrypted_size) FILTER (WHERE is_active = TRUE), 0) as total_size,
        COALESCE(SUM(download_count), 0) as total_downloads
      FROM files
    `;

    const result = await this.pool.query(query);
    const row = result.rows[0];

    return {
      totalFiles: parseInt(row.total_files),
      activeFiles: parseInt(row.active_files),
      expiredFiles: parseInt(row.expired_files),
      totalSize: parseInt(row.total_size),
      totalDownloads: parseInt(row.total_downloads)
    };
  }

  async findFilesByStorageProvider(provider: string): Promise<FileMetadata[]> {
    const query = 'SELECT * FROM files WHERE storage_provider = $1 AND is_active = TRUE';
    const result = await this.pool.query(query, [provider]);
    
    return result.rows.map((row: any) => this.mapRowToFileMetadata(row));
  }

  async findExpiringSoon(hours: number = 1): Promise<FileMetadata[]> {
    const query = `
      SELECT * FROM active_files 
      WHERE expires_at BETWEEN NOW() AND NOW() + INTERVAL '${hours} hours'
      AND is_expired = FALSE
    `;
    
    const result = await this.pool.query(query);
    return result.rows.map((row: any) => this.mapRowToFileMetadata(row));
  }

  private mapRowToFileMetadata(row: any): FileMetadata {
    return {
      id: row.id,
      filename: row.filename,
      size: parseInt(row.original_size),
      contentType: row.content_type,
      uploadDate: row.upload_date,
      expiresAt: row.expires_at,
      downloadCount: row.download_count,
      maxDownloads: row.max_downloads,
      // Additional fields for internal use
      encryptedSize: parseInt(row.encrypted_size),
      storagePath: row.storage_path,
      storageProvider: row.storage_provider,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}