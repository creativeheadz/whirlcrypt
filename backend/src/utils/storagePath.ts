import { resolve, sep } from 'path';

/**
 * Resolve a provider-relative storage path against the store root.
 * storagePath values come from database rows, so a poisoned or legacy row
 * must not turn a retrieve/delete into a read/write outside the store.
 * Returns the absolute path, or null when the input escapes the base
 * (parent segments, absolute paths, empties). Lexical only: it does not
 * resolve symlinks inside the store, matching the legacy FileManager
 * guarantee.
 */
export function resolveWithinBase(basePath: string, storagePath: string): string | null {
  if (typeof storagePath !== 'string' || storagePath.length === 0) {
    return null;
  }
  const base = resolve(basePath);
  const full = resolve(base, storagePath);
  if (full !== base && !full.startsWith(base + sep)) {
    return null;
  }
  return full;
}
