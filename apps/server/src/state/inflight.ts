export class InflightTracker {
  private readonly pending = new Set<Promise<unknown>>();
  private readonly waiters = new Set<() => void>();

  get size(): number { return this.pending.size; }

  track<T>(work: Promise<T>): Promise<T> {
    this.pending.add(work);
    const settled = () => {
      this.pending.delete(work);
      if (this.pending.size === 0) for (const resolve of this.waiters) resolve();
    };
    void work.then(settled, settled);
    return work;
  }

  async drain(timeoutMs: number): Promise<{ drained: boolean; remaining: number }> {
    if (this.pending.size === 0) return { drained: true, remaining: 0 };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finish!: () => void;
    try {
      await new Promise<void>(resolve => {
        finish = resolve;
        this.waiters.add(finish);
        if (Number.isFinite(timeoutMs)) timer = setTimeout(finish, Math.max(0, timeoutMs));
      });
    } finally {
      clearTimeout(timer);
      this.waiters.delete(finish);
    }
    return { drained: this.pending.size === 0, remaining: this.pending.size };
  }
}
