# Whirlcrypt backup and restore

Files live in two places that are useless without each other: PostgreSQL
holds the metadata rows (ids, expiry, storage paths), and the upload
directory holds the encrypted blobs. Back up both together, plus the
backend `.env` (secrets cannot be reconstructed).

## What to back up

| Item | Default location | How |
|---|---|---|
| Database | `whirlcrypt_dev` on localhost | `pg_dump` (below) |
| Encrypted blobs | `backend/uploads/` (see `UPLOAD_DIR`) | filesystem copy / snapshot |
| Secrets | `backend/.env` | copy to encrypted storage, never the repo |

Blobs without their DB rows are unaddressable (the id-to-path mapping is
in `files.storage_path`); rows without blobs serve 404s. A backup is only
valid if the dump and the blob copy are from the same window.

## Backup

```bash
STAMP=$(date +%Y%m%d-%H%M)
BACKUP_DIR=/var/backups/whirlcrypt
mkdir -p "$BACKUP_DIR/$STAMP"

# 1. Database (custom format: compressed, restorable with pg_restore)
pg_dump -h localhost -U whirlcrypt_user -d whirlcrypt_dev \
  -F c -f "$BACKUP_DIR/$STAMP/db.dump"

# 2. Blobs (encrypted at rest already; no extra step needed)
cp -a /path/to/whirlcrypt/backend/uploads "$BACKUP_DIR/$STAMP/uploads"

# 3. Secrets (encrypt: this file boots a copy of your service)
gpg --symmetric --cipher-algo AES256 \
  --output "$BACKUP_DIR/$STAMP/env.gpg" /path/to/whirlcrypt/backend/.env

# 4. Verify the dump reads back
pg_restore --list "$BACKUP_DIR/$STAMP/db.dump" > /dev/null && echo BACKUP-OK
```

Suggested schedule: nightly via cron, keep 7 days. Files expire by design
(default 24h), so point-in-time granularity beyond a day rarely matters.

## Restore

```bash
STAMP=20260114-0300
BACKUP_DIR=/var/backups/whirlcrypt

# 1. Stop the service
systemctl --user stop whirlcrypt   # or: systemctl stop whirlcrypt

# 2. Database (destructive: drops and recreates)
pg_restore -h localhost -U whirlcrypt_user -d postgres -C \
  "$BACKUP_DIR/$STAMP/db.dump"

# 3. Blobs
rm -rf /path/to/whirlcrypt/backend/uploads
cp -a "$BACKUP_DIR/$STAMP/uploads" /path/to/whirlcrypt/backend/uploads

# 4. Secrets, then start and verify
cp "$BACKUP_DIR/$STAMP/.env" /path/to/whirlcrypt/backend/.env  # decrypt first if .gpg
systemctl --user start whirlcrypt
curl -sf http://localhost:3001/api/health
```

Notes:

- Restore into the same major PostgreSQL version that took the dump.
- `uploads/.tmp/` holds in-flight multer parts; it is safe to exclude it
  from backups (the server sweeps abandoned temps at boot and hourly).
- Expired rows stay in the database as inactive; a restore brings them
  back, but downloads still 404 on expiry. Run the admin cleanup after a
  restore to converge.
- Test restores on a scratch machine quarterly. An untested backup is a
  rumor.
