import { Writable } from "node:stream";

export class MemoryLogStream extends Writable {
  override _write(
    _chunk: string | Uint8Array,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    callback();
  }
}
