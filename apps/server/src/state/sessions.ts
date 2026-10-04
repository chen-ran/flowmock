// Per-run counters behind call-index triggers and sequence replay, the
// in-flight count behind concurrency limits, and the epoch each scenario's
// time windows are measured from.
export class SessionState {
  private readonly calls = new Map<string, number>();
  private readonly inFlight = new Map<string, number>();
  private readonly epochs = new Map<string, number>();

  // Advances and returns the 1-based call number of a session under a key
  // and scenario.
  nextCall(key: string, scenario: string, session: string): number {
    const id = `${key}\u0000${scenario}\u0000${session}`;
    const next = (this.calls.get(id) ?? 0) + 1;
    this.calls.set(id, next);
    return next;
  }

  enter(key: string): number {
    const count = (this.inFlight.get(key) ?? 0) + 1;
    this.inFlight.set(key, count);
    return count;
  }

  leave(key: string): void {
    const count = (this.inFlight.get(key) ?? 1) - 1;
    if (count <= 0) this.inFlight.delete(key);
    else this.inFlight.set(key, count);
  }

  active(): number {
    let total = 0;
    for (const count of this.inFlight.values()) total += count;
    return total;
  }

  // Milliseconds since the scenario first served a request (or was reset).
  elapsed(scenario: string, now: number): number {
    let epoch = this.epochs.get(scenario);
    if (epoch === undefined) {
      epoch = now;
      this.epochs.set(scenario, epoch);
    }
    return now - epoch;
  }

  // Forgets counters and epochs, e.g. between test runs.
  reset(scenario?: string): void {
    if (scenario === undefined) {
      this.calls.clear();
      this.epochs.clear();
      return;
    }
    this.epochs.delete(scenario);
    for (const id of [...this.calls.keys()]) if (id.split('\u0000')[1] === scenario) this.calls.delete(id);
  }
}
