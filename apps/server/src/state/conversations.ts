// Remembers the conversation behind each Responses id this server returned
// (replay) or saw upstream (recording), so a `previous_response_id`
// continuation normalizes like a full resend. Bounded; the oldest entries
// fall out first.
export class ConversationMemory {
  private readonly entries = new Map<string, unknown[]>();
  private readonly capacity: number;

  constructor(capacity = 10_000) {
    this.capacity = capacity;
  }

  get(responseId: string | null | undefined): unknown[] | null {
    if (!responseId) return null;
    return this.entries.get(responseId) ?? null;
  }

  set(responseId: string, items: unknown[]): void {
    this.entries.delete(responseId);
    this.entries.set(responseId, items);
    if (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!);
  }
}
