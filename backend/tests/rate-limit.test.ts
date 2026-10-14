import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import {
  clientIpKeyGenerator,
  shouldSkipRateLimit,
  downloadRateLimitMiddleware,
} from '../src/middleware/security';

function req(path: string, ip = '203.0.113.7'): Request {
  return { path, ip, method: 'GET', headers: {} } as unknown as Request;
}

describe('shouldSkipRateLimit', () => {
  for (const p of ['/assets/app.js', '/favicon.ico', '/x.js', '/x.css', '/x.png', '/x.ico']) {
    it(`skips static asset ${p}`, () => {
      assert.equal(shouldSkipRateLimit(req(p)), true);
    });
  }

  for (const p of ['/api/download/abc123', '/api/download/abc123/info', '/api/upload', '/api/admin/stats', '/']) {
    it(`limits ${p}`, () => {
      assert.equal(shouldSkipRateLimit(req(p)), false);
    });
  }
});

describe('clientIpKeyGenerator', () => {
  it('buckets by req.ip and ignores proxy headers', () => {
    const r = req('/api/download/x', '198.51.100.9');
    r.headers = { 'x-forwarded-for': '1.2.3.4, 5.6.7.8', 'x-real-ip': '9.9.9.9' };
    assert.equal(clientIpKeyGenerator(r), '198.51.100.9');
  });

  it('falls back to unknown without an ip', () => {
    assert.equal(clientIpKeyGenerator({ path: '/', headers: {} } as unknown as Request), 'unknown');
  });
});

describe('downloadRateLimitMiddleware', () => {
  function mockRes() {
    const res: any = {
      statusCode: 200,
      body: undefined as unknown,
      headers: {} as Record<string, string>,
      setHeader(name: string, value: string) {
        res.headers[name] = value;
      },
      getHeader(name: string) {
        return res.headers[name];
      },
      status(code: number) {
        res.statusCode = code;
        return res;
      },
      json(payload: unknown) {
        res.body = payload;
        return res;
      },
      send(payload: unknown) {
        res.body = payload;
        return res;
      },
    };
    return res;
  }

  async function hit(mw: (rq: Request, rs: Response, nx: NextFunction) => unknown, ip: string) {
    const res = mockRes();
    let nexted = false;
    await mw(req('/api/download/abc', ip), res as unknown as Response, (() => {
      nexted = true;
    }) as NextFunction);
    return { nexted, status: res.statusCode as number, body: res.body as unknown };
  }

  it('allows 30 downloads per window then answers 429', async () => {
    for (let i = 0; i < 30; i++) {
      const r = await hit(downloadRateLimitMiddleware, '203.0.113.99');
      assert.equal(r.nexted, true, `request ${i + 1} should pass`);
    }
    const limited = await hit(downloadRateLimitMiddleware, '203.0.113.99');
    assert.equal(limited.nexted, false);
    assert.equal(limited.status, 429);
  });

  it('limits per IP independently', async () => {
    for (let i = 0; i < 30; i++) {
      await hit(downloadRateLimitMiddleware, '203.0.113.100');
    }
    const other = await hit(downloadRateLimitMiddleware, '203.0.113.101');
    assert.equal(other.nexted, true);
  });
});
