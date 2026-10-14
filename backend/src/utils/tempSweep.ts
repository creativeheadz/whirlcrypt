import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Remove abandoned multer temp files (`<uploadDir>/.tmp/incoming-*`).
 * The upload route unlinks its temp file on every handled failure, but a
 * crashed or killed process leaves them behind forever. Only files matching
 * the multer `incoming-` prefix and older than maxAgeHours are touched;
 * anything in flight (fresh mtime) and anything else in the dir is kept.
 * Returns the number of files removed. Never throws: a missing dir or a
 * mid-sweep disappearance just yields 0 for that entry.
 */
export async function sweepStaleTempFiles(uploadDir: string, maxAgeHours = 24): Promise<number> {
  const tmpDir = join(uploadDir, '.tmp');
  let entries: string[];
  try {
    entries = await fs.readdir(tmpDir);
  } catch {
    return 0;
  }

  const cutoff = Date.now() - maxAgeHours * 3600 * 1000;
  let removed = 0;
  for (const entry of entries) {
    if (!entry.startsWith('incoming-')) {
      continue;
    }
    try {
      const stat = await fs.stat(join(tmpDir, entry));
      if (!stat.isFile() || stat.mtimeMs >= cutoff) {
        continue;
      }
      await fs.unlink(join(tmpDir, entry));
      removed += 1;
    } catch {
      // Raced with an uploader or a parallel sweep; leave it for next time.
    }
  }
  return removed;
}
