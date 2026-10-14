/**
 * Copy text with a fallback for contexts where the async Clipboard API is
 * unavailable (plain-http LAN access, denied permissions, old engines).
 * Returns true when either path reports success. Dependencies are
 * injectable so the branching stays testable outside a browser.
 */
export interface ClipboardDeps {
  clipboard?: { writeText(text: string): Promise<void> } | undefined;
  fallback?: (text: string) => boolean;
}

function defaultClipboard(): ClipboardDeps['clipboard'] {
  try {
    return typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  } catch {
    return undefined;
  }
}

function execCommandFallback(text: string): boolean {
  try {
    if (typeof document === 'undefined') {
      return false;
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export async function copyTextToClipboard(text: string, deps: ClipboardDeps = {}): Promise<boolean> {
  const clipboard = deps.clipboard !== undefined ? deps.clipboard : defaultClipboard();
  if (clipboard) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand below.
    }
  }
  const fallback = deps.fallback ?? execCommandFallback;
  try {
    return fallback(text);
  } catch {
    return false;
  }
}
