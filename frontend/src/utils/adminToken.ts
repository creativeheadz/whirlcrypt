/**
 * Admin JWT storage. The token lives in sessionStorage (tab-scoped) rather
 * than localStorage so it dies with the tab instead of persisting across
 * browser restarts: a smaller window for XSS exfiltration and no stale
 * tokens lying around on shared machines. The stores are injectable so
 * this module stays testable outside a browser.
 */
export interface TokenStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY = 'adminToken';

function sessionStore(): TokenStore | undefined {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
}

function localStore(): TokenStore | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function getAdminToken(store: TokenStore | undefined = sessionStore()): string | null {
  return store?.getItem(KEY) ?? null;
}

export function setAdminToken(token: string, store: TokenStore | undefined = sessionStore()): void {
  store?.setItem(KEY, token);
}

export function clearAdminToken(
  session: TokenStore | undefined = sessionStore(),
  local: TokenStore | undefined = localStore(),
): void {
  session?.removeItem(KEY);
  local?.removeItem(KEY);
}

/**
 * One-time upgrade: move a token stored by older builds (localStorage)
 * into the session store so admins are not logged out by the deploy, then
 * delete the persistent copy. Always removes the local copy, even when the
 * session already holds a (fresher) token.
 */
export function migrateAdminTokenToSession(
  session: TokenStore | undefined = sessionStore(),
  local: TokenStore | undefined = localStore(),
): void {
  if (!session || !local) return;
  if (!session.getItem(KEY)) {
    const legacy = local.getItem(KEY);
    if (legacy) {
      session.setItem(KEY, legacy);
    }
  }
  local.removeItem(KEY);
}
