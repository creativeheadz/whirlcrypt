import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ClientCrypto } from '../src/crypto/rfc8188';
import { SALT_LENGTH, MAX_RECORD_SIZE } from '../src/types';

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

function headerWithRs(salt: Uint8Array, rs: number): Uint8Array {
  const header = new Uint8Array(SALT_LENGTH + 5);
  header.set(salt, 0);
  new DataView(header.buffer, SALT_LENGTH, 4).setUint32(0, rs, false);
  header[SALT_LENGTH + 4] = 0; // idlen
  return header;
}

async function collect(stream: ReadableStream<Uint8Array>, key: Uint8Array, salt: Uint8Array): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  await ClientCrypto.decryptToSink(stream, key, salt, {
    onChunk: (chunk) => {
      parts.push(chunk.slice());
    },
  });
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

describe('decryptToSink record-size limits', () => {
  it('rejects an oversized rs before touching crypto', async () => {
    const { key, salt } = await ClientCrypto.generateKeys();
    for (const rs of [MAX_RECORD_SIZE + 1, 0xffffffff]) {
      await assert.rejects(
        collect(streamOf([headerWithRs(salt, rs)]), key, salt),
        /invalid record size in header/
      );
    }
  });

  it('rejects an undersized rs', async () => {
    const { key, salt } = await ClientCrypto.generateKeys();
    await assert.rejects(
      collect(streamOf([headerWithRs(salt, 17)]), key, salt),
      /invalid record size in header/
    );
  });

  it('accepts rs at both bounds (parse continues past the size check)', async () => {
    const { key, salt } = await ClientCrypto.generateKeys();
    for (const rs of [18, MAX_RECORD_SIZE]) {
      // Header-only stream: size check passes, stream then ends with no
      // terminal record. The size error must NOT be the failure.
      await assert.rejects(
        collect(streamOf([headerWithRs(salt, rs)]), key, salt),
        /stream ended without terminal record/
      );
    }
  });
});

describe('encryptStream record-size limits', () => {
  it('rejects rs outside [18, MAX_RECORD_SIZE]', async () => {
    const { key, salt } = await ClientCrypto.generateKeys();
    const drain = async (gen: AsyncGenerator<Uint8Array>) => {
      for await (const _chunk of gen) {
        // consume
      }
    };
    await assert.rejects(drain(ClientCrypto.encryptStream([new Uint8Array([1])], key, salt, 17)), /record size/);
    await assert.rejects(
      drain(ClientCrypto.encryptStream([new Uint8Array([1])], key, salt, MAX_RECORD_SIZE + 1)),
      /record size/
    );
  });
});

describe('decryptToSink stream integrity', () => {
  async function encrypted(plaintext: Uint8Array): Promise<{ key: Uint8Array; salt: Uint8Array; chunks: Uint8Array[] }> {
    const { key, salt } = await ClientCrypto.generateKeys();
    const chunks: Uint8Array[] = [];
    for await (const chunk of ClientCrypto.encryptStream([plaintext], key, salt)) {
      chunks.push(chunk);
    }
    return { key, salt, chunks };
  }

  it('round-trips a small payload (control)', async () => {
    const { key, salt, chunks } = await encrypted(new TextEncoder().encode('hello whirlcrypt'));
    const out = await collect(streamOf(chunks), key, salt);
    assert.equal(new TextDecoder().decode(out), 'hello whirlcrypt');
  });

  it('rejects trailing garbage after a valid stream', async () => {
    const { key, salt, chunks } = await encrypted(new TextEncoder().encode('hello whirlcrypt'));
    const junk = new Uint8Array(64).fill(0xab);
    await assert.rejects(collect(streamOf([...chunks, junk]), key, salt));
  });
});
