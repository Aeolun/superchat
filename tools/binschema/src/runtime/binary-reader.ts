// ABOUTME: Interface and implementations for seekable binary data sources
// ABOUTME: Supports memory buffers, file handles, browser Files, and streams

/**
 * Abstract interface for reading binary data from various sources.
 * Provides random access capability when the underlying source supports it.
 */
export interface BinaryReader {
  /**
   * Total size of the data in bytes
   * Returns -1 if size is unknown (for streams)
   */
  readonly size: number;

  /**
   * Whether this reader supports random access (seeking)
   */
  readonly seekable: boolean;

  /**
   * Read bytes at the specified position
   * @param position - Byte offset to read from (negative for offset from end)
   * @param length - Number of bytes to read
   * @returns The requested bytes
   * @throws Error if position is out of bounds or seeking not supported
   */
  readAt(position: number, length: number): Uint8Array;

  /**
   * Read a single byte at the specified position
   * @param position - Byte offset to read from
   * @returns The byte value
   */
  readByteAt(position: number): number;

  /**
   * Get a slice of the data (for backward compatibility)
   * @param start - Start position (inclusive)
   * @param end - End position (exclusive), optional
   * @returns A new reader or Uint8Array for the slice
   */
  slice(start: number, end?: number): Uint8Array;

  /**
   * Close the reader and free resources (if applicable)
   */
  close?(): void;
}

/**
 * In-memory buffer reader (current behavior)
 * Provides O(1) random access to Uint8Array data
 */
export class BufferReader implements BinaryReader {
  private data: Uint8Array;

  constructor(data: Uint8Array | number[]) {
    this.data = data instanceof Uint8Array ? data : new Uint8Array(data);
  }

  get size(): number {
    return this.data.length;
  }

  get seekable(): boolean {
    return true;
  }

  readAt(position: number, length: number): Uint8Array {
    // Handle negative positions (from end)
    const actualPos = position < 0 ? this.data.length + position : position;
    
    if (actualPos < 0 || actualPos + length > this.data.length) {
      throw new Error(
        "Read out of bounds: position " + position + " (actual: " + actualPos + "), " +
        "length " + length + ", buffer size " + this.data.length
      );
    }

    return this.data.slice(actualPos, actualPos + length);
  }

  readByteAt(position: number): number {
    const actualPos = position < 0 ? this.data.length + position : position;
    
    if (actualPos < 0 || actualPos >= this.data.length) {
      throw new Error(
        "Read byte out of bounds: position " + position + " (actual: " + actualPos + "), " +
        "buffer size " + this.data.length
      );
    }

    return this.data[actualPos];
  }

  slice(start: number, end?: number): Uint8Array {
    return this.data.slice(start, end);
  }

  /**
   * Get the underlying Uint8Array (for backward compatibility)
   */
  get bytes(): Uint8Array {
    return this.data;
  }
}

/**
 * Node.js file handle reader
 * Uses fs.FileHandle with positional reads for efficient random access
 */
export class FileHandleReader implements BinaryReader {
  private handle: any; // fs.FileHandle
  private fileSize: number;
  private cache: Map<string, Uint8Array> = new Map();
  private readonly CACHE_BLOCK_SIZE = 4096; // 4KB blocks

  constructor(handle: any, size: number) {
    this.handle = handle;
    this.fileSize = size;
  }

  get size(): number {
    return this.fileSize;
  }

  get seekable(): boolean {
    return true;
  }

  readAt(position: number, length: number): Uint8Array {
    // Handle negative positions
    const actualPos = position < 0 ? this.fileSize + position : position;
    
    if (actualPos < 0 || actualPos + length > this.fileSize) {
      throw new Error(
        "Read out of bounds: position " + position + " (actual: " + actualPos + "), " +
        "length " + length + ", file size " + this.fileSize
      );
    }

    // For small reads, use block caching
    if (length <= this.CACHE_BLOCK_SIZE) {
      const blockIndex = Math.floor(actualPos / this.CACHE_BLOCK_SIZE);
      const blockKey = "block_" + blockIndex;
      const blockOffset = actualPos % this.CACHE_BLOCK_SIZE;

      let block = this.cache.get(blockKey);
      if (!block) {
        // Read full block into cache
        const blockStart = blockIndex * this.CACHE_BLOCK_SIZE;
        const blockSize = Math.min(
          this.CACHE_BLOCK_SIZE,
          this.fileSize - blockStart
        );
        
        block = new Uint8Array(blockSize);
        const bytesReadResult = this.handle.readSync(block, 0, blockSize, blockStart);
        const bytesRead = bytesReadResult.bytesRead;
        
        if (bytesRead !== blockSize) {
          throw new Error("Incomplete read: expected " + blockSize + ", got " + bytesRead);
        }
        
        // Limit cache size (LRU-ish)
        if (this.cache.size > 100) {
          const firstKey = this.cache.keys().next().value;
          this.cache.delete(firstKey);
        }
        
        this.cache.set(blockKey, block);
      }

      // Return slice from cached block
      if (blockOffset + length <= block.length) {
        return block.slice(blockOffset, blockOffset + length);
      }
    }

    // For large reads or reads spanning blocks, read directly
    const buffer = new Uint8Array(length);
    const bytesReadResult = this.handle.readSync(buffer, 0, length, actualPos);
    const bytesRead = bytesReadResult.bytesRead;
    
    if (bytesRead !== length) {
      throw new Error("Incomplete read: expected " + length + ", got " + bytesRead);
    }
    
    return buffer;
  }

  readByteAt(position: number): number {
    const bytes = this.readAt(position, 1);
    return bytes[0];
  }

  slice(start: number, end?: number): Uint8Array {
    const actualEnd = end ?? this.fileSize;
    const length = actualEnd - start;
    return this.readAt(start, length);
  }

  close(): void {
    this.handle.closeSync();
    this.cache.clear();
  }

  /**
   * Static factory to create from a file path
   */
  static async fromPath(path: string): Promise<FileHandleReader> {
    const fs = await import('fs');
    const handle = await fs.promises.open(path, 'r');
    const stats = await handle.stat();
    return new FileHandleReader(handle, stats.size);
  }

  /**
   * Sync version of fromPath
   */
  static fromPathSync(path: string): FileHandleReader {
    // Note: This requires Node.js fs module
    const fs = require('fs');
    const handle = fs.openSync(path, 'r');
    const stats = fs.fstatSync(handle);
    const fileDescriptor = handle;
    return new FileHandleReader({ 
      readSync: (buffer: Uint8Array, offset: number, length: number, position: number) => {
        const bytesRead = fs.readSync(fileDescriptor, buffer, offset, length, position);
        return { bytesRead: bytesRead };
      },
      closeSync: () => fs.closeSync(fileDescriptor)
    }, stats.size);
  }
}

/**
 * Browser File API reader
 * Uses File.slice() for efficient random access without loading entire file
 */
export class BrowserFileReader implements BinaryReader {
  private file: File;
  private cache: Map<string, Uint8Array> = new Map();

  constructor(file: File) {
    this.file = file;
  }

  get size(): number {
    return this.file.size;
  }

  get seekable(): boolean {
    return true;
  }

  readAt(position: number, length: number): Uint8Array {
    // Handle negative positions
    const actualPos = position < 0 ? this.file.size + position : position;
    
    if (actualPos < 0 || actualPos + length > this.file.size) {
      throw new Error(
        "Read out of bounds: position " + position + " (actual: " + actualPos + "), " +
        "length " + length + ", file size " + this.file.size
      );
    }

    // Check cache
    const cacheKey = actualPos + "_" + length;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Use File.slice() to read just the needed portion
    // Note: This is synchronous in practice but returns a Blob
    const blob = this.file.slice(actualPos, actualPos + length);
    
    // Convert Blob to Uint8Array synchronously
    // This is a limitation - we need sync API but File API is async
    // For now, throw error indicating async operation needed
    throw new Error(
      'BrowserFileReader requires async operation. ' +
      'Consider buffering the file first with BufferReader'
    );
  }

  readByteAt(position: number): number {
    return this.readAt(position, 1)[0];
  }

  slice(start: number, end?: number): Uint8Array {
    const actualEnd = end ?? this.file.size;
    const length = actualEnd - start;
    return this.readAt(start, length);
  }

  /**
   * Async method to read and cache data
   */
  async readAtAsync(position: number, length: number): Promise<Uint8Array> {
    // Handle negative positions
    const actualPos = position < 0 ? this.file.size + position : position;
    
    if (actualPos < 0 || actualPos + length > this.file.size) {
      throw new Error(
        "Read out of bounds: position " + position + " (actual: " + actualPos + "), " +
        "length " + length + ", file size " + this.file.size
      );
    }

    // Check cache
    const cacheKey = actualPos + "_" + length;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Use File.slice() and convert to ArrayBuffer
    const blob = this.file.slice(actualPos, actualPos + length);
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Cache for future reads (with size limit)
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(cacheKey, bytes);

    return bytes;
  }

  /**
   * Buffer the entire file for sync access
   */
  static async buffer(file: File): Promise<BufferReader> {
    const buffer = await file.arrayBuffer();
    return new BufferReader(new Uint8Array(buffer));
  }
}

/**
 * Stream reader with progressive buffering
 * Falls back to buffering for random access (with warning)
 */
export class StreamReader implements BinaryReader {
  private buffer: Uint8Array[] = [];
  private totalBytes: number = 0;
  private streamEnded: boolean = false;
  private warnedAboutBuffering: boolean = false;

  constructor() {
    // Stream readers are typically created empty and fed data
  }

  get size(): number {
    return this.streamEnded ? this.totalBytes : -1;
  }

  get seekable(): boolean {
    // Can only seek within buffered data
    return false;
  }

  /**
   * Add chunk of data from stream
   */
  addChunk(chunk: Uint8Array): void {
    this.buffer.push(chunk);
    this.totalBytes += chunk.length;
  }

  /**
   * Signal that stream has ended
   */
  end(): void {
    this.streamEnded = true;
  }

  readAt(position: number, length: number): Uint8Array {
    if (!this.warnedAboutBuffering) {
      console.warn(
        'StreamReader: Random access requires buffering entire stream. ' +
        'Consider using a seekable source (file) for better performance.'
      );
      this.warnedAboutBuffering = true;
    }

    // Handle negative positions (only if stream ended)
    const actualPos = position < 0 
      ? (this.streamEnded ? this.totalBytes + position : position)
      : position;
    
    if (actualPos < 0) {
      throw new Error("Invalid position: " + position + " (actual: " + actualPos + ")");
    }

    // Consolidate buffer chunks for reading
    const consolidated = this.getConsolidatedBuffer();
    
    if (actualPos + length > consolidated.length) {
      throw new Error(
        "Read out of bounds: position " + position + " (actual: " + actualPos + "), " +
        "length " + length + ", buffered size " + consolidated.length
      );
    }

    return consolidated.slice(actualPos, actualPos + length);
  }

  readByteAt(position: number): number {
    return this.readAt(position, 1)[0];
  }

  slice(start: number, end?: number): Uint8Array {
    const consolidated = this.getConsolidatedBuffer();
    return consolidated.slice(start, end);
  }

  private getConsolidatedBuffer(): Uint8Array {
    if (this.buffer.length === 0) {
      return new Uint8Array(0);
    }
    
    if (this.buffer.length === 1) {
      return this.buffer[0];
    }

    // Consolidate all chunks
    const result = new Uint8Array(this.totalBytes);
    let offset = 0;
    for (const chunk of this.buffer) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    // Replace chunks with consolidated buffer
    this.buffer = [result];
    return result;
  }
}

/**
 * Auto-detect input type and create appropriate reader
 */
export function createReader(input: any): BinaryReader {
  // Uint8Array or number array
  if (input instanceof Uint8Array || Array.isArray(input)) {
    return new BufferReader(input);
  }

  // Node.js Buffer (subclass of Uint8Array)
  if (typeof Buffer !== 'undefined' && input instanceof Buffer) {
    return new BufferReader(input);
  }

  // Browser File object
  if (typeof File !== 'undefined' && input instanceof File) {
    console.warn(
      'BrowserFileReader requires async operations. ' +
      'Consider using BrowserFileReader.buffer() to load file first.'
    );
    return new BrowserFileReader(input);
  }

  // Node.js file handle
  if (input && typeof input.readSync === 'function') {
    // Assume it's a file handle with size property or method
    const size = input.size || (input.stat && input.stat().size) || 0;
    return new FileHandleReader(input, size);
  }

  // String path - try to open as file (Node.js only)
  if (typeof input === 'string') {
    try {
      return FileHandleReader.fromPathSync(input);
    } catch (e: any) {
      throw new Error("Cannot open file: " + input + ". " + e);
    }
  }

  throw new Error(
    "Unsupported input type: " + typeof input + ". " +
    "Expected Uint8Array, File, file path, or file handle."
  );
}
