import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FileRepository } from '../src/database/models/File';
import { FileManagerV2 } from '../src/storage/FileManagerV2';

function expiredRow() {
  return {
    id: 'file-1',
    filename: 'encrypted_file-1',
    original_size: '100',
    encrypted_size: '132',
    content_type: 'application/octet-stream',
    storage_path: 'deadbeef/blob',
    storage_provider: 'local',
    created_at: new Date('2026-01-01T00:00:00Z'),
    expires_at: new Date('2026-01-02T00:00:00Z'),
    download_count: 0,
    max_downloads: null,
    is_active: true,
    updated_at: new Date('2026-01-01T00:00:00Z'),
    encrypted_metadata: null,
  };
}

describe('FileRepository expiry queries', () => {
  it('findExpired selects already-expired rows (never an empty BETWEEN range)', async () => {
    const repo = new FileRepository();
    const seen: { sql: string; params: unknown[] | undefined }[] = [];
    (repo as any).pool = {
      query: async (sql: string, params?: unknown[]) => {
        seen.push({ sql, params });
        return { rows: [expiredRow()] };
      },
    };

    const rows = await repo.findExpired();

    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'file-1');
    assert.equal(rows[0].storagePath, 'deadbeef/blob');
    const sql = seen[0].sql;
    assert.match(sql, /expires_at\s*<\s*(NOW\(\)|CURRENT_TIMESTAMP)/i);
    assert.doesNotMatch(sql, /BETWEEN/i);
  });

  it('findExpiringSoon binds hours as a parameter instead of interpolating', async () => {
    const repo = new FileRepository();
    const seen: { sql: string; params: unknown[] | undefined }[] = [];
    (repo as any).pool = {
      query: async (sql: string, params?: unknown[]) => {
        seen.push({ sql, params });
        return { rows: [] };
      },
    };

    await repo.findExpiringSoon(7);

    assert.deepEqual(seen[0].params, [7]);
    assert.match(seen[0].sql, /\$1/);
    assert.doesNotMatch(seen[0].sql, /'7 hours'/);
  });
});

describe('FileManagerV2.cleanupExpiredFiles', () => {
  it('deletes expired files from storage using findExpired, then cleans the database', async () => {
    const fm = new FileManagerV2();
    const deleted: string[] = [];
    const calls: string[] = [];
    (fm as any).storageManager = {
      delete: async (path: string) => {
        deleted.push(path);
      },
    };
    (fm as any).fileRepository = {
      findExpired: async () => {
        calls.push('findExpired');
        return [{ id: 'file-1', filename: 'encrypted_file-1', storagePath: 'deadbeef/blob' }];
      },
      findExpiringSoon: async () => {
        calls.push('findExpiringSoon');
        return [];
      },
      cleanupExpiredFiles: async () => {
        calls.push('cleanupExpiredFiles');
        return 1;
      },
    };

    const count = await fm.cleanupExpiredFiles();

    assert.equal(count, 1);
    assert.deepEqual(deleted, ['deadbeef/blob']);
    assert.deepEqual(calls, ['findExpired', 'cleanupExpiredFiles']);
  });
});
