import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '../src/utils/logger';

const savedLevel = process.env.LOG_LEVEL;
afterEach(() => {
  if (savedLevel === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = savedLevel;
  }
});

function capture(stream: 'stdout' | 'stderr', fn: () => void): string {
  const target = stream === 'stdout' ? process.stdout : process.stderr;
  const original = target.write.bind(target);
  let out = '';
  (target as unknown).write = ((chunk: unknown) => {
    out += String(chunk);
    return true;
  }) as never;
  try {
    fn();
  } finally {
    (target as unknown).write = original;
  }
  return out;
}

describe('createLogger', () => {
  it('prefixes lines with timestamp, level, and scope', () => {
    process.env.LOG_LEVEL = 'debug';
    const log = createLogger('routes/download');
    const out = capture('stdout', () => log.info('hello', { a: 1 }));
    assert.match(out, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z INFO \[routes\/download\] hello \{"a":1\}\n$/);
  });

  it('routes warn/error to stderr and formats Errors with stacks', () => {
    process.env.LOG_LEVEL = 'debug';
    const log = createLogger('svc');
    const err = new Error('boom');
    const out = capture('stderr', () => log.error('failed', err));
    assert.match(out, /ERROR \[svc\] failed Error: boom/);
    assert.equal(capture('stdout', () => log.warn('x')), '');
  });

  it('gates below LOG_LEVEL', () => {
    process.env.LOG_LEVEL = 'warn';
    const log = createLogger('svc');
    assert.equal(capture('stdout', () => log.debug('d')), '');
    assert.equal(capture('stdout', () => log.info('i')), '');
    assert.match(capture('stderr', () => log.warn('w')), /WARN/);
    assert.match(capture('stderr', () => log.error('e')), /ERROR/);
  });

  it('defaults to info for missing or bogus levels', () => {
    delete process.env.LOG_LEVEL;
    const log = createLogger('svc');
    assert.equal(capture('stdout', () => log.debug('d')), '');
    assert.match(capture('stdout', () => log.info('i')), /INFO/);
    process.env.LOG_LEVEL = 'verbose-bogus';
    assert.equal(capture('stdout', () => log.debug('d')), '');
    assert.match(capture('stdout', () => log.info('i')), /INFO/);
  });
});
