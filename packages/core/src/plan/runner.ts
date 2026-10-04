import type { EndMode, ReplayPlan } from './types.ts';
import type { Clock, HttpTransport, MessageTransport } from '../contracts.ts';

export type RunOutcome = 'completed' | 'interrupted' | 'client_aborted' | 'failed';

export interface RunResult {
  outcome: RunOutcome;
  endMode: EndMode;
  // Milliseconds since the request arrived.
  headersAt: number | null;
  firstByteAt: number | null;
  firstContentAt: number | null;
  lastContentAt: number | null;
  endedAt: number;
  bytesWritten: number;
  writes: number;
  // Measured on the wire: the time the first output-carrying write started,
  // and the decode speed between the first and last output writes.
  achievedTtftMs: number | null;
  achievedTps: number | null;
  error: string | null;
}

class Measure {
  headersAt: number | null = null;
  firstByteAt: number | null = null;
  firstContentAt: number | null = null;
  lastContentAt: number | null = null;
  firstContentFrame = -1;
  firstContentTokens = 0;
  tokens = 0;
  bytes = 0;
  writes = 0;

  private readonly clock: Clock;
  private readonly origin: number;

  constructor(clock: Clock, origin: number) {
    this.clock = clock;
    this.origin = origin;
  }

  elapsed(): number {
    return this.clock.now() - this.origin;
  }

  result(outcome: RunOutcome, endMode: EndMode, error: string | null): RunResult {
    const span = this.firstContentAt !== null && this.lastContentAt !== null ? this.lastContentAt - this.firstContentAt : 0;
    const decoded = this.tokens - this.firstContentTokens;
    return {
      outcome,
      endMode,
      headersAt: this.headersAt,
      firstByteAt: this.firstByteAt,
      firstContentAt: this.firstContentAt,
      lastContentAt: this.lastContentAt,
      endedAt: this.elapsed(),
      bytesWritten: this.bytes,
      writes: this.writes,
      achievedTtftMs: this.firstContentAt,
      achievedTps: span > 0 && decoded > 0 ? (decoded * 1000) / span : null,
      error,
    };
  }
}

const isAbort = (signal: AbortSignal): boolean => signal.aborted;

// Executes a plan against an HTTP transport. `origin` is the clock reading
// when the request arrived; every planned time is relative to it, so time
// spent selecting and loading a recording counts against the schedule rather
// than adding to it.
export const runHttpPlan = async (plan: ReplayPlan, transport: HttpTransport, clock: Clock, origin: number): Promise<RunResult> => {
  const measure = new Measure(clock, origin);
  const { signal } = transport;
  try {
    await clock.sleepUntil(origin + plan.headersAt, signal);
    transport.writeHead(plan.status, plan.headers);
    measure.headersAt = measure.elapsed();

    for (const write of plan.writes) {
      await clock.sleepUntil(origin + write.at, signal);
      if (isAbort(signal)) return measure.result('client_aborted', plan.end.mode, null);
      const startedAt = measure.elapsed();
      measure.firstByteAt ??= startedAt;
      // A fragmented frame starts with its first piece and carries its
      // tokens on its last one.
      if (write.content && write.first) {
        if (measure.firstContentAt === null) {
          measure.firstContentAt = startedAt;
          measure.firstContentFrame = write.frame;
        }
        measure.lastContentAt = startedAt;
      }
      await transport.write(write.bytes ?? new Uint8Array());
      measure.bytes += write.bytes?.byteLength ?? 0;
      measure.writes++;
      if (write.content && write.last) {
        measure.tokens += write.tokens;
        if (write.frame === measure.firstContentFrame) measure.firstContentTokens = write.tokens;
      }
    }

    await clock.sleepUntil(origin + plan.end.at, signal);
    switch (plan.end.mode) {
    case 'complete':
      await transport.end();
      return measure.result('completed', 'complete', null);
    case 'fin':
      await transport.end();
      return measure.result('interrupted', 'fin', null);
    case 'abort':
      transport.abort();
      return measure.result('interrupted', 'abort', null);
    case 'hang':
      await clock.sleepUntil(origin + plan.end.at + (plan.end.hangMs ?? 0), signal);
      transport.abort();
      return measure.result('interrupted', 'hang', null);
    case 'reset':
    case 'ws_close':
    case 'ws_terminate':
      transport.reset();
      return measure.result('interrupted', plan.end.mode, null);
    }
  } catch (error) {
    if (isAbort(signal)) return measure.result('client_aborted', plan.end.mode, null);
    transport.reset();
    return measure.result('failed', plan.end.mode, error instanceof Error ? error.stack ?? error.message : String(error));
  }
};

// Executes one WebSocket turn. A completed turn leaves the connection open
// for the next `response.create`.
export const runMessagePlan = async (plan: ReplayPlan, transport: MessageTransport, clock: Clock, origin: number): Promise<RunResult> => {
  const measure = new Measure(clock, origin);
  const { signal } = transport;
  try {
    for (const write of plan.writes) {
      await clock.sleepUntil(origin + write.at, signal);
      if (isAbort(signal)) return measure.result('client_aborted', plan.end.mode, null);
      const startedAt = measure.elapsed();
      measure.firstByteAt ??= startedAt;
      if (write.content && measure.firstContentAt === null) {
        measure.firstContentAt = startedAt;
        measure.firstContentTokens = write.tokens;
      }
      await transport.send(write.text ?? '');
      measure.bytes += write.text?.length ?? 0;
      measure.writes++;
      if (write.content) {
        measure.tokens += write.tokens;
        measure.lastContentAt = startedAt;
      }
    }
    await clock.sleepUntil(origin + plan.end.at, signal);
    switch (plan.end.mode) {
    case 'complete':
      return measure.result('completed', 'complete', null);
    case 'ws_close':
      transport.close(plan.end.code ?? 1011, plan.end.reason ?? '');
      return measure.result('interrupted', 'ws_close', null);
    case 'hang':
      await clock.sleepUntil(origin + plan.end.at + (plan.end.hangMs ?? 0), signal);
      transport.terminate();
      return measure.result('interrupted', 'hang', null);
    default:
      transport.terminate();
      return measure.result('interrupted', plan.end.mode, null);
    }
  } catch (error) {
    if (isAbort(signal)) return measure.result('client_aborted', plan.end.mode, null);
    transport.terminate();
    return measure.result('failed', plan.end.mode, error instanceof Error ? error.stack ?? error.message : String(error));
  }
};
