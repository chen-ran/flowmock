import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { RecordedChunk } from '@flowmock/core';

// Recorded body chunks with their arrival times, byte-exact:
//
//   "FMC1" | (float64 LE t-ms | uint32 LE length | bytes)*
const MAGIC = new TextEncoder().encode('FMC1');

export const encodeChunks = (chunks: readonly RecordedChunk[]): Uint8Array => {
  const size = MAGIC.byteLength + chunks.reduce((sum, chunk) => sum + 12 + chunk.bytes.byteLength, 0);
  const buffer = new Uint8Array(size);
  const view = new DataView(buffer.buffer);
  buffer.set(MAGIC, 0);
  let offset = MAGIC.byteLength;
  for (const chunk of chunks) {
    view.setFloat64(offset, chunk.t, true);
    view.setUint32(offset + 8, chunk.bytes.byteLength, true);
    buffer.set(chunk.bytes, offset + 12);
    offset += 12 + chunk.bytes.byteLength;
  }
  return buffer;
};

export const decodeChunks = (buffer: Uint8Array): RecordedChunk[] => {
  if (buffer.byteLength < MAGIC.byteLength || !MAGIC.every((byte, index) => buffer[index] === byte)) {
    throw new Error('Not a FlowMock chunk file');
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const chunks: RecordedChunk[] = [];
  let offset = MAGIC.byteLength;
  while (offset < buffer.byteLength) {
    if (offset + 12 > buffer.byteLength) throw new Error('Truncated FlowMock chunk file');
    const t = view.getFloat64(offset, true);
    const length = view.getUint32(offset + 8, true);
    if (offset + 12 + length > buffer.byteLength) throw new Error('Truncated FlowMock chunk file');
    chunks.push({ t, bytes: buffer.slice(offset + 12, offset + 12 + length) });
    offset += 12 + length;
  }
  return chunks;
};

export class ChunkFiles {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  // Two-level fan-out keeps directories small on large corpora.
  relativePath(id: string): string {
    return join(id.slice(-2), `${id}.fmc`);
  }

  async write(relative: string, chunks: readonly RecordedChunk[]): Promise<void> {
    const path = join(this.root, relative);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, encodeChunks(chunks));
  }

  async read(relative: string): Promise<RecordedChunk[]> {
    return decodeChunks(new Uint8Array(await readFile(join(this.root, relative))));
  }

  async remove(relative: string): Promise<void> {
    await rm(join(this.root, relative), { force: true });
  }
}
