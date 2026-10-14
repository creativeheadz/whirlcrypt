/**
 * Make an attacker-influenced string safe to interpolate into a log line.
 * Filenames arrive from multipart headers and envelope metadata, so a raw
 * `%s`-style interpolation would let an uploader forge journal lines with
 * embedded CR/LF. Control characters carry no meaning in a filename, so
 * strip them outright and cap the length.
 */
export function sanitizeForLog(value: string): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200);
}
