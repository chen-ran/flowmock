import { summarizeRecording } from '../../src/corpus/types.ts';
import type { Cassette, Clock, CorpusStore, HttpTransport, MessageTransport, Recording, RecordingSummary } from '../../src/index.ts';

// Virtual time: sleeping jumps the clock to the deadline at once, so a
// schedule runs instantly while every timestamp lands exactly where planned.
export class InstantClock implements Clock {
  private time = 0;

  now(): number {
    return this.time;
  }

  async sleepUntil(deadline: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw signal.reason;
    this.time = Math.max(this.time, deadline);
    await Promise.resolve();
    if (signal?.aborted) throw signal.reason;
  }

  advance(ms: number): void {
    this.time += ms;
  }
}

export interface TransportEvent {
  at: number;
  type: 'head' | 'write' | 'end' | 'abort' | 'reset' | 'send' | 'close' | 'terminate';
  status?: number;
  bytes?: Uint8Array;
  text?: string;
  code?: number;
}

export class RecordingHttpTransport implements HttpTransport {
  readonly events: TransportEvent[] = [];
  private readonly controller = new AbortController();
  readonly signal = this.controller.signal;
  private readonly clock: Clock;
  private readonly abortAfterWrites: number | null;

  constructor(clock: Clock, options: { abortAfterWrites?: number } = {}) {
    this.clock = clock;
    this.abortAfterWrites = options.abortAfterWrites ?? null;
  }

  writeHead(status: number): void {
    this.events.push({ at: this.clock.now(), type: 'head', status });
  }

  async write(bytes: Uint8Array): Promise<void> {
    this.events.push({ at: this.clock.now(), type: 'write', bytes });
    if (this.abortAfterWrites !== null && this.events.filter(event => event.type === 'write').length >= this.abortAfterWrites) {
      this.controller.abort(new Error('client went away'));
    }
    await Promise.resolve();
  }

  async end(): Promise<void> {
    this.events.push({ at: this.clock.now(), type: 'end' });
    await Promise.resolve();
  }

  abort(): void {
    this.events.push({ at: this.clock.now(), type: 'abort' });
  }

  reset(): void {
    this.events.push({ at: this.clock.now(), type: 'reset' });
  }

  body(): string {
    const decoder = new TextDecoder();
    return this.events.filter(event => event.type === 'write').map(event => decoder.decode(event.bytes, { stream: true })).join('') + decoder.decode();
  }
}

export class RecordingMessageTransport implements MessageTransport {
  readonly events: TransportEvent[] = [];
  private readonly controller = new AbortController();
  readonly signal = this.controller.signal;
  private readonly clock: Clock;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  async send(text: string): Promise<void> {
    this.events.push({ at: this.clock.now(), type: 'send', text });
    await Promise.resolve();
  }

  close(code: number): void {
    this.events.push({ at: this.clock.now(), type: 'close', code });
  }

  terminate(): void {
    this.events.push({ at: this.clock.now(), type: 'terminate' });
  }
}

export class MemoryCorpus implements CorpusStore {
  readonly recordings = new Map<string, Recording>();
  readonly cassettes = new Map<string, Cassette>();

  add(...recordings: Recording[]): this {
    for (const recording of recordings) this.recordings.set(recording.id, recording);
    return this;
  }

  addCassette(cassette: Cassette): this {
    this.cassettes.set(cassette.id, cassette);
    return this;
  }

  async listCandidates(protocol: string): Promise<readonly RecordingSummary[]> {
    return await Promise.resolve([...this.recordings.values()].filter(recording => recording.protocol === protocol).map(summarizeRecording));
  }

  async getRecording(id: string): Promise<Recording | null> {
    return await Promise.resolve(this.recordings.get(id) ?? null);
  }

  async getCassette(id: string): Promise<Cassette | null> {
    return await Promise.resolve(this.cassettes.get(id) ?? null);
  }
}
