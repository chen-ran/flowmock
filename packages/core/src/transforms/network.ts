import type { PlannedWrite, ReplayPlan } from '../plan/types.ts';
import type { Rng } from '../random.ts';
import type { Network } from '../scenario/schema.ts';

const round = (value: number): number => Math.round(value * 1000) / 1000;

const splitWrite = (write: PlannedWrite, sizes: readonly number[], gapMs: number): PlannedWrite[] => {
  const bytes = write.bytes!;
  const pieces: PlannedWrite[] = [];
  let offset = 0;
  for (const [index, size] of sizes.entries()) {
    pieces.push({
      ...write,
      at: round(write.at + index * gapMs),
      bytes: bytes.subarray(offset, offset + size),
      first: write.first && index === 0,
      last: write.last && index === sizes.length - 1,
      tokens: index === sizes.length - 1 ? write.tokens : 0,
    });
    offset += size;
  }
  return pieces;
};

// Random piece sizes in [min, max] that add up to `length`.
const pieceSizes = (length: number, min: number, max: number, rng: Rng): number[] => {
  const sizes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    const size = Math.min(remaining, rng.int(Math.min(min, max), max));
    sizes.push(size);
    remaining -= size;
  }
  return sizes;
};

// Consecutive pieces keep at least `gapMs` between them across frame
// boundaries too; pieces written back to back would merge into one TCP
// segment and the client would never see the split.
const fragment = (writes: PlannedWrite[], options: NonNullable<Network['fragmentation']>, rng: Rng): PlannedWrite[] => {
  const pieces = writes.flatMap(write => (write.bytes && write.bytes.byteLength > 1
    ? splitWrite(write, pieceSizes(write.bytes.byteLength, options.minBytes, options.maxBytes, rng), 0)
    : [write]));
  let previous = -Infinity;
  for (const piece of pieces) {
    piece.at = round(Math.max(piece.at, previous + options.gapMs));
    previous = piece.at;
  }
  return pieces;
};

// Token-bucket pacing: the link carries `bytesPerMs`, so a write starts when
// the previous one has drained and large writes are spread over time.
const throttle = (writes: PlannedWrite[], kilobytesPerSecond: number): PlannedWrite[] => {
  const bytesPerMs = (kilobytesPerSecond * 1024) / 1000;
  // Ten-millisecond slices keep the pacing smooth without flooding the
  // event loop with timers.
  const slice = Math.max(1, Math.floor(bytesPerMs * 10));
  let linkFree = 0;
  const paced: PlannedWrite[] = [];
  for (const write of writes) {
    if (!write.bytes) {
      paced.push(write);
      continue;
    }
    const start = Math.max(write.at, linkFree);
    const length = write.bytes.byteLength;
    if (length <= slice) {
      paced.push({ ...write, at: round(start) });
    } else {
      const sizes: number[] = [];
      for (let offset = 0; offset < length; offset += slice) sizes.push(Math.min(slice, length - offset));
      let sent = 0;
      for (const piece of splitWrite({ ...write, at: start }, sizes, 0)) {
        paced.push({ ...piece, at: round(start + sent / bytesPerMs) });
        sent += piece.bytes!.byteLength;
      }
    }
    linkFree = start + length / bytesPerMs;
  }
  return paced;
};

export const applyNetwork = (plan: ReplayPlan, network: Network, rng: Rng): string[] => {
  const notes: string[] = [];
  const isHttp = plan.transport === 'http';

  // Jitter and stalls act per frame, before fragmentation and pacing, so a
  // probability means the same thing however finely the bytes are split.
  // Delays accumulate: each one pushes every later write back.
  let shift = 0;
  let stalls = 0;
  let floor = 0;
  let writes = plan.writes.map(write => {
    if (write.first) {
      if (network.stalls && rng.next() < network.stalls.probability) {
        const [min, max] = network.stalls.durationMs;
        shift += min + rng.next() * Math.max(0, max - min);
        stalls++;
      }
      if (network.jitterMs > 0) shift += rng.next() * network.jitterMs;
    }
    const at = Math.max(floor, round(write.at + shift));
    floor = at;
    return { ...write, at };
  });
  if (stalls > 0) notes.push(`${stalls} stall(s)`);
  if (network.jitterMs > 0) notes.push(`jitter up to ${network.jitterMs}ms per frame`);

  if (network.fragmentation && isHttp) {
    writes = fragment(writes, network.fragmentation, rng);
    notes.push(`fragmented into ${writes.length} writes of ${network.fragmentation.minBytes}-${network.fragmentation.maxBytes} bytes`);
  }
  if (network.bandwidthKBps !== undefined && isHttp) {
    writes = throttle(writes, network.bandwidthKBps);
    notes.push(`bandwidth ${network.bandwidthKBps} KB/s`);
  }

  if (network.latencyMs > 0) notes.push(`latency ${network.latencyMs}ms`);
  if (network.headersDelayMs > 0) notes.push(`headers delayed ${network.headersDelayMs}ms`);
  const headersAt = round(plan.headersAt + network.latencyMs + network.headersDelayMs);
  writes = writes.map(write => ({ ...write, at: Math.max(headersAt, round(write.at + network.latencyMs)) }));
  const lastAt = writes.at(-1)?.at ?? headersAt;
  plan.writes = writes;
  plan.headersAt = headersAt;
  plan.end = { ...plan.end, at: Math.max(round(plan.end.at + shift + network.latencyMs), lastAt, headersAt) };
  return notes;
};
