import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isIpAllowed, parseAllowedIps, MAX_ALLOWED_IPS } from '../src/utils/ipAllowlist';

describe('parseAllowedIps', () => {
  it('accepts comma/newline-separated IPs and CIDRs, canonicalized', () => {
    assert.deepEqual(parseAllowedIps('203.0.113.7, 10.0.0.0/8\n2001:db8::1'), {
      ok: true,
      ips: ['203.0.113.7', '10.0.0.0/8', '2001:db8::1'],
    });
  });

  it('dedupes, drops empties, and treats empty input as unrestricted', () => {
    assert.deepEqual(parseAllowedIps(' 1.1.1.1 ,, 1.1.1.1 '), { ok: true, ips: ['1.1.1.1'] });
    assert.deepEqual(parseAllowedIps(''), { ok: true, ips: [] });
    assert.deepEqual(parseAllowedIps('  '), { ok: true, ips: [] });
    assert.deepEqual(parseAllowedIps([]), { ok: true, ips: [] });
  });

  it('rejects garbage with a caller-facing message', () => {
    for (const raw of ['999.1.1.1', '10.0.0.0/33', '1.2.3.4/abc', 'example.com', '1.2.3.4/-1', '::gg']) {
      const result = parseAllowedIps(raw);
      assert.equal(result.ok, false, raw);
      assert.match((result as { error: string }).error, /Invalid IP address or CIDR/);
    }
    assert.deepEqual(parseAllowedIps(42).ok, false);
  });

  it(`caps the list at ${MAX_ALLOWED_IPS}`, () => {
    const many = Array.from({ length: MAX_ALLOWED_IPS + 1 }, (_, i) => `10.0.0.${i + 1}`).join(',');
    const result = parseAllowedIps(many);
    assert.equal(result.ok, false);
  });
});

describe('isIpAllowed', () => {
  it('treats a missing or empty list as unrestricted', () => {
    assert.equal(isIpAllowed('1.2.3.4', []), true);
    assert.equal(isIpAllowed('1.2.3.4', undefined), true);
    assert.equal(isIpAllowed('not-an-ip', null), true);
  });

  it('matches exact IPv4 addresses', () => {
    assert.equal(isIpAllowed('203.0.113.7', ['203.0.113.7']), true);
    assert.equal(isIpAllowed('203.0.113.8', ['203.0.113.7']), false);
  });

  it('matches CIDR ranges at the boundaries', () => {
    const list = ['192.168.1.0/24'];
    assert.equal(isIpAllowed('192.168.1.0', list), true);
    assert.equal(isIpAllowed('192.168.1.255', list), true);
    assert.equal(isIpAllowed('192.168.2.1', list), false);
    assert.equal(isIpAllowed('192.168.1.1', ['192.168.1.1/32']), true);
    assert.equal(isIpAllowed('0.0.0.0', ['0.0.0.0/0']), true);
  });

  it('matches IPv6 addresses and ranges', () => {
    assert.equal(isIpAllowed('2001:db8::1', ['2001:db8::1']), true);
    assert.equal(isIpAllowed('2001:db8::2', ['2001:db8::1']), false);
    assert.equal(isIpAllowed('2001:db8::abcd', ['2001:db8::/32']), true);
    assert.equal(isIpAllowed('2001:db9::1', ['2001:db8::/32']), false);
  });

  it('treats IPv4-mapped IPv6 as its IPv4 address', () => {
    assert.equal(isIpAllowed('::ffff:203.0.113.7', ['203.0.113.7']), true);
    assert.equal(isIpAllowed('203.0.113.7', ['::ffff:203.0.113.7/128']), true);
  });

  it('fails closed on garbage client IPs and corrupt entries', () => {
    assert.equal(isIpAllowed('not-an-ip', ['1.1.1.1']), false);
    assert.equal(isIpAllowed('', ['1.1.1.1']), false);
    assert.equal(isIpAllowed('1.1.1.1', ['bogus-entry', '1.1.1.1']), true);
    assert.equal(isIpAllowed('1.1.1.1', ['bogus-entry']), false);
  });

  it('never matches across IP families', () => {
    assert.equal(isIpAllowed('2001:db8::1', ['1.1.1.1', '10.0.0.0/8']), false);
    assert.equal(isIpAllowed('1.1.1.1', ['2001:db8::/32']), false);
  });
});
