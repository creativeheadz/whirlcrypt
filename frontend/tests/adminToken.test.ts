import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getAdminToken,
  setAdminToken,
  clearAdminToken,
  migrateAdminTokenToSession,
  type TokenStore,
} from '../src/utils/adminToken';

function fakeStore(initial: Record<string, string> = {}): TokenStore {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe('adminToken store', () => {
  it('round-trips through the given store', () => {
    const store = fakeStore();
    assert.equal(getAdminToken(store), null);
    setAdminToken('tok-1', store);
    assert.equal(getAdminToken(store), 'tok-1');
    clearAdminToken(store, fakeStore());
    assert.equal(getAdminToken(store), null);
  });

  it('moves a legacy localStorage token into the session store once', () => {
    const session = fakeStore();
    const local = fakeStore({ adminToken: 'legacy-tok' });
    migrateAdminTokenToSession(session, local);
    assert.equal(getAdminToken(session), 'legacy-tok');
    assert.equal(local.getItem('adminToken'), null);
  });

  it('drops the legacy copy even when the session already has one', () => {
    const session = fakeStore({ adminToken: 'fresh-tok' });
    const local = fakeStore({ adminToken: 'stale-tok' });
    migrateAdminTokenToSession(session, local);
    assert.equal(getAdminToken(session), 'fresh-tok');
    assert.equal(local.getItem('adminToken'), null);
  });

  it('clears both stores', () => {
    const session = fakeStore({ adminToken: 'a' });
    const local = fakeStore({ adminToken: 'b' });
    clearAdminToken(session, local);
    assert.equal(getAdminToken(session), null);
    assert.equal(getAdminToken(local), null);
  });
});
