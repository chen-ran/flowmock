import type { ServerResponse } from 'node:http';

import type { HttpTransport } from '@flowmock/core';

// Byte-level control of a Node response. Writes go out as individual HTTP
// chunks with Nagle disabled, so a fragmented plan reaches the client as
// separate TCP segments.
export class NodeHttpTransport implements HttpTransport {
  private readonly controller = new AbortController();
  private readonly response: ServerResponse;
  private settled = false;

  constructor(response: ServerResponse) {
    this.response = response;
    response.socket?.setNoDelay(true);
    response.on('close', () => {
      if (!this.settled) this.controller.abort(new Error('client closed the connection'));
    });
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  writeHead(status: number, headers: ReadonlyArray<readonly [string, string]>): void {
    this.response.writeHead(status, headers.flatMap(([name, value]) => [name, value]));
    this.response.flushHeaders();
  }

  async write(bytes: Uint8Array): Promise<void> {
    if (bytes.byteLength === 0) return;
    if (this.response.write(bytes)) return;
    await new Promise<void>((resolve, reject) => {
      const onDrain = () => {
        this.response.off('close', onClose);
        resolve();
      };
      const onClose = () => {
        this.response.off('drain', onDrain);
        reject(new Error('client closed the connection'));
      };
      this.response.once('drain', onDrain);
      this.response.once('close', onClose);
    });
  }

  async end(): Promise<void> {
    this.settled = true;
    await new Promise<void>(resolve => this.response.end(resolve));
  }

  // FIN after the bytes already written, without the chunked terminator: the
  // client sees the body end early.
  abort(): void {
    this.settled = true;
    this.response.socket?.end();
  }

  // A reset destroys the socket and whatever Node still buffers with it, which
  // would cut the body before bytes the plan wrote. So the RST waits until
  // Node has handed every written byte to the kernel.
  // https://nodejs.org/api/net.html#socketresetanddestroy
  reset(): void {
    this.settled = true;
    const socket = this.response.socket;
    if (!socket || socket.destroyed) return;
    if (socket.writableLength === 0) socket.resetAndDestroy();
    else socket.write('', () => { if (!socket.destroyed) socket.resetAndDestroy(); });
  }
}
