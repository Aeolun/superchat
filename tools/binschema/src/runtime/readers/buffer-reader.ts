// ABOUTME: BufferReader implementation for in-memory Uint8Array buffers
// ABOUTME: Provides synchronous, seekable access to binary data already in memory

import { BinaryReader } from "./binary-reader.js";

/**
 * In-memory buffer reader for Uint8Array.
 * This is the most efficient reader since all data is already in memory.
 * Supports full random access with zero overhead.
 */
export class BufferReader implements BinaryReader {
  private buffer: Uint8Array;
  private _position: number = 0;
  
  constructor(buffer: Uint8Array | number[]) {
    this.buffer = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  }
  
  get size(): number {
    return this.buffer.length;
  }
  
  get seekable(): boolean {
    return true;
  }
  
  get isAsync(): boolean {
    return false;
  }
  
  get position(): number {
    return this._position;
  }
  
  read(length: number): Uint8Array {
    if (this._position + length > this.buffer.length) {
      throw new Error(
        "Not enough bytes available: requested " + length + " bytes at position " + 
        this._position + ", but only " + (this.buffer.length - this._position) + " bytes remaining"
      );
    }
    
    const result = this.buffer.slice(this._position, this._position + length);
    this._position += length;
    return result;
  }
  
  readAt(position: number, length: number): Uint8Array {
    // Handle negative positions (from EOF)
    const actualPosition = position < 0 ? this.buffer.length + position : position;
    
    if (actualPosition < 0 || actualPosition > this.buffer.length) {
      throw new Error(
        "Position " + position + " out of bounds (valid range: 0-" + this.buffer.length + ")"
      );
    }
    
    if (actualPosition + length > this.buffer.length) {
      throw new Error(
        "Not enough bytes available: requested " + length + " bytes at position " + 
        actualPosition + ", but only " + (this.buffer.length - actualPosition) + " bytes available"
      );
    }
    
    return this.buffer.slice(actualPosition, actualPosition + length);
  }
  
  peek(length: number): Uint8Array {
    if (this._position + length > this.buffer.length) {
      throw new Error(
        "Not enough bytes available: requested " + length + " bytes at position " + 
        this._position + ", but only " + (this.buffer.length - this._position) + " bytes remaining"
      );
    }
    
    return this.buffer.slice(this._position, this._position + length);
  }
  
  seek(position: number): void {
    // Handle negative positions (from EOF)
    const actualPosition = position < 0 ? this.buffer.length + position : position;
    
    if (actualPosition < 0 || actualPosition > this.buffer.length) {
      throw new Error(
        "Seek position " + position + " out of bounds (valid range: 0-" + this.buffer.length + ")"
      );
    }
    
    this._position = actualPosition;
  }
  
  /**
   * Get the underlying buffer for compatibility with existing code
   * that directly accesses decoder['bytes']
   */
  getBuffer(): Uint8Array {
    return this.buffer;
  }
  
  close(): void {
    // No-op for in-memory buffer
  }
}
