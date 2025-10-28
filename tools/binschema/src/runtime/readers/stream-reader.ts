// ABOUTME: StreamReader implementation for streams with automatic buffering
// ABOUTME: Provides fallback when seekable access isn't available, warns about memory usage

import { BinaryReader } from "./binary-reader.js";
import { BufferReader } from "./buffer-reader.js";

/**
 * Stream reader that buffers entire stream into memory.
 * This is a fallback for when seekable access isn't available.
 * WARNING: This will load the entire stream into memory!
 */
export class StreamReader implements BinaryReader {
  private bufferReader: BufferReader | null = null;
  private stream: ReadableStream<Uint8Array> | NodeJS.ReadableStream;
  private bufferedChunks: Uint8Array[] = [];
  private isBuffering: boolean = false;
  private bufferingComplete: boolean = false;
  private bufferingPromise: Promise<void> | null = null;
  
  constructor(stream: ReadableStream<Uint8Array> | NodeJS.ReadableStream) {
    this.stream = stream;
    console.warn(
      "StreamReader: Input stream is not seekable. Buffering entire stream into memory. " +
      "For large files, this may consume significant memory. " +
      "Consider using a seekable input source (file path or FileHandle) instead."
    );
  }
  
  private async ensureBuffered(): Promise<void> {
    if (this.bufferingComplete) {
      return;
    }
    
    if (this.isBuffering) {
      // Already buffering, wait for completion
      if (this.bufferingPromise) {
        await this.bufferingPromise;
      }
      return;
    }
    
    this.isBuffering = true;
    this.bufferingPromise = this.bufferStream();
    await this.bufferingPromise;
  }
  
  private async bufferStream(): Promise<void> {
    try {
      // Handle Web Streams API
      if ('getReader' in this.stream) {
        const reader = this.stream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              this.bufferedChunks.push(value);
            }
          }
        } finally {
          reader.releaseLock();
        }
      } 
      // Handle Node.js streams
      else {
        const stream = this.stream as NodeJS.ReadableStream;
        
        await new Promise<void>((resolve, reject) => {
          stream.on('data', (chunk: Buffer | Uint8Array) => {
            if (chunk instanceof Buffer) {
              this.bufferedChunks.push(new Uint8Array(chunk));
            } else {
              this.bufferedChunks.push(chunk);
            }
          });
          
          stream.on('end', () => resolve());
          stream.on('error', (err) => reject(err));
        });
      }
      
      // Combine all chunks into a single buffer
      const totalLength = this.bufferedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const fullBuffer = new Uint8Array(totalLength);
      let offset = 0;
      
      for (const chunk of this.bufferedChunks) {
        fullBuffer.set(chunk, offset);
        offset += chunk.length;
      }
      
      // Create BufferReader with the complete data
      this.bufferReader = new BufferReader(fullBuffer);
      this.bufferingComplete = true;
      
      // Clear chunks to free memory
      this.bufferedChunks = [];
      
      console.warn(
        "StreamReader: Buffered " + totalLength + " bytes into memory. " +
        "Stream is now seekable but at the cost of memory usage."
      );
    } catch (error) {
      this.isBuffering = false;
      this.bufferingPromise = null;
      throw new Error("Failed to buffer stream: " + (error as Error).message);
    }
  }
  
  get size(): number {
    if (!this.bufferReader) {
      return -1; // Size unknown until buffered
    }
    return this.bufferReader.size;
  }
  
  get seekable(): boolean {
    // Becomes seekable after buffering
    return this.bufferingComplete;
  }
  
  get isAsync(): boolean {
    return true;
  }
  
  get position(): number {
    if (!this.bufferReader) {
      return 0;
    }
    return this.bufferReader.position;
  }
  
  async readAsync(length: number): Promise<Uint8Array> {
    await this.ensureBuffered();
    if (!this.bufferReader) {
      throw new Error("Stream buffering failed");
    }
    return this.bufferReader.read(length);
  }
  
  async readAtAsync(position: number, length: number): Promise<Uint8Array> {
    await this.ensureBuffered();
    if (!this.bufferReader) {
      throw new Error("Stream buffering failed");
    }
    return this.bufferReader.readAt(position, length);
  }
  
  async peekAsync(length: number): Promise<Uint8Array> {
    await this.ensureBuffered();
    if (!this.bufferReader) {
      throw new Error("Stream buffering failed");
    }
    return this.bufferReader.peek(length);
  }
  
  seek(position: number): void {
    if (!this.bufferReader) {
      throw new Error("Cannot seek before stream is buffered");
    }
    this.bufferReader.seek(position);
  }
  
  close(): void {
    // No-op, stream is already consumed
  }
}
