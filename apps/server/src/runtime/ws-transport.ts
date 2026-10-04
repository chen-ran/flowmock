import type { WebSocket } from 'ws';

import type { MessageTransport } from '@flowmock/core';

// One turn on a Responses WebSocket. The signal aborts when the connection
// goes away; a completed turn leaves the socket open for the next one.
export class WsMessageTransport implements MessageTransport {
  private readonly socket: WebSocket;
  readonly signal: AbortSignal;

  constructor(socket: WebSocket, signal: AbortSignal) {
    this.socket = socket;
    this.signal = signal;
  }

  async send(text: string): Promise<void> {
    if (this.socket.readyState !== this.socket.OPEN) throw new Error('WebSocket is not open');
    await new Promise<void>((resolve, reject) => this.socket.send(text, error => (error ? reject(error) : resolve())));
  }

  close(code: number, reason: string): void {
    this.socket.close(code, reason);
  }

  terminate(): void {
    this.socket.terminate();
  }
}
