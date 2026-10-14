import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BanManager } from '../src/services/BanManager';

describe('BanManager.isIPWhitelisted', () => {
  const bans = new BanManager();

  it('whitelists loopback and the configured hosts', () => {
    assert.equal(bans.isIPWhitelisted('127.0.0.1'), true);
    assert.equal(bans.isIPWhitelisted('::1'), true);
    assert.equal(bans.isIPWhitelisted('192.168.1.100'), true);
    assert.equal(bans.isIPWhitelisted('81.150.150.132'), true);
  });

  it('whitelists all of 10/8, not just 10.0.0.x', () => {
    assert.equal(bans.isIPWhitelisted('10.0.0.5'), true);
    assert.equal(bans.isIPWhitelisted('10.1.2.3'), true);
    assert.equal(bans.isIPWhitelisted('10.255.255.255'), true);
    assert.equal(bans.isIPWhitelisted('11.0.0.1'), false);
  });

  it('whitelists all of 172.16/12, not just 172.16.0.x', () => {
    assert.equal(bans.isIPWhitelisted('172.16.0.9'), true);
    assert.equal(bans.isIPWhitelisted('172.20.5.5'), true);
    assert.equal(bans.isIPWhitelisted('172.31.255.255'), true);
    assert.equal(bans.isIPWhitelisted('172.15.0.1'), false);
    assert.equal(bans.isIPWhitelisted('172.32.0.1'), false);
  });

  it('whitelists all of 192.168/16, not just 192.168.0.x', () => {
    assert.equal(bans.isIPWhitelisted('192.168.0.9'), true);
    assert.equal(bans.isIPWhitelisted('192.168.5.5'), true);
    assert.equal(bans.isIPWhitelisted('192.168.255.255'), true);
  });

  it('does not whitelist public or garbage IPs', () => {
    assert.equal(bans.isIPWhitelisted('8.8.8.8'), false);
    assert.equal(bans.isIPWhitelisted('203.0.113.7'), false);
    assert.equal(bans.isIPWhitelisted('not-an-ip'), false);
    assert.equal(bans.isIPWhitelisted(''), false);
  });
});
