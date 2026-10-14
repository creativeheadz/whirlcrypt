/**
 * Honest transfer feedback. The download gauge is scaled against the
 * server's Content-Length (null when the edge strips it, in which case the
 * UI shows bytes instead of a fake percentage), and upload failures
 * surface the server's message with plain-word fallbacks for 429/413.
 */

/** 0-99 while in flight (completion sets 100 explicitly), or null if unknown. */
export function downloadProgressPercent(receivedBytes: number, totalBytes: number | null): number | null {
  if (totalBytes === null || !Number.isFinite(totalBytes) || totalBytes <= 0) {
    return null;
  }
  if (receivedBytes <= 0) {
    return 0;
  }
  return Math.min(99, Math.floor((receivedBytes / totalBytes) * 100));
}

export function mapUploadError(status: number, serverMessage: string | null): string {
  if (status === 429) {
    return 'Too many uploads from your address. Wait a few minutes and try again.';
  }
  if (status === 413) {
    return 'File too large for the server. Try a smaller file or a shorter retention.';
  }
  if (serverMessage && serverMessage.trim()) {
    return serverMessage;
  }
  return `Upload failed (HTTP ${status}).`;
}

/** Best-effort read of a JSON { error } body from a failed fetch. */
export async function readErrorMessage(response: Response): Promise<string | null> {
  try {
    const data = (await response.json()) as { error?: unknown };
    return typeof data?.error === 'string' ? data.error : null;
  } catch {
    return null;
  }
}

/** Best-effort read of a byte total from response headers. */
export function readContentLength(response: Response): number | null {
  const raw = response.headers.get('Content-Length');
  if (!raw) {
    return null;
  }
  const total = parseInt(raw, 10);
  return Number.isFinite(total) && total > 0 ? total : null;
}
