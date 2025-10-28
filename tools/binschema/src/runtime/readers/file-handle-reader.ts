// ABOUTME: FileHandleReader implementation for Node.js fs.FileHandle
// ABOUTME: Provides async, seekable access to files without loading into memory

import { BinaryReader } from "./binary-reader.js";
import type { FileHandle } from "fs/promises";
import { stat } from "fs/promises";

/**
 * File handle reader for Node.js.
 * Uses fs.FileHandle.read() for efficient random access without buffering entire file.
 * This is the most memory-efficient way to read large files.
 */
export class FileHandleReader implements BinaryReader {
  private handle: FileHandle;
  private fileSize: number;
  private _position: number = 0;
  
  private constructor(handle: FileHandle, size: number) {
    this.handle = handle;
    this.fileSize = size;
  }
  
  /**
   * Create a FileHandleReader from an open FileHandle
   */
  static async create(handle: FileHandle): Promise<FileHandleReader> {
    const stats = await handle.stat();
    return new FileHandleReader(handle, stats.size);
  }
  
  /**
   * Create a FileHandleReader from a file path
   */
  static async fromPath(path: string): Promise<FileHandleReader> {
    const { open } = await import("fs/promises");
    const handle = await open(path, "r");
    const stats = await handle.stat();
    return new FileHandleReader(handle, stats.size);
  }
  
  get size(): number {
    return this.fileSize;
  }
  
  get seekable(): boolean {
    return true;
  }
  
  get isAsync(): boolean {
    return true;
  }
  
  get position(): number {
    return this._position;
  }
  
  async readAsync(length: number): Promise<Uint8Array> {
    const buffer = new Uint8Array(length);
    const { bytesRead } = await this.handle.read(buffer, 0, length, this._position);
    
    if (bytesRead < length) {
      throw new Error(
        "Not enough bytes available: requested " + length + " bytes at position " +
        this._position + ", but only " + bytesRead + " bytes could be read"
      );
    }
    
    this._position += bytesRead;
    return buffer;
  }
  
  async readAtAsync(position: number, length: number): Promise<Uint8Array> {
    // Handle negative positions (from EOF)
    const actualPosition = position < 0 ? this.fileSize + position : position;
    
    if (actualPosition < 0 || actualPosition > this.fileSize) {
      throw new Error(
        "Position " + position + " out of bounds (valid range: 0-" + this.fileSize + ")"
      );
    }
    
    if (actualPosition + length > this.fileSize) {
      throw new Error(
        "Not enough bytes available: requested " + length + " bytes at position " +
        actualPosition + ", but only " + (this.fileSize - actualPosition) + " bytes available"
      );
    }
    
    const buffer = new Uint8Array(length);
    const { bytesRead } = await this.handle.read(buffer, 0, length, actualPosition);
    
    if (bytesRead < length) {
      throw new Error(
        "Failed to read requested bytes: expected " + length + " but got " + bytesRead
      );
    }
    
    return buffer;
  }
  
  async peekAsync(length: number): Promise<Uint8Array> {
    // Read without advancing position
    return this.readAtAsync(this._position, length);
  }
  
  seek(position: number): void {
    // Handle negative positions (from EOF)
    const actualPosition = position < 0 ? this.fileSize + position : position;
    
    if (actualPosition < 0 || actualPosition > this.fileSize) {
      throw new Error(
        "Seek position " + position + " out of bounds (valid range: 0-" + this.fileSize + ")"
      );
    }
    
    this._position = actualPosition;
  }
  
  async closeAsync(): Promise<void> {
    await this.handle.close();
  }
}
