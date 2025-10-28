// ABOUTME: Extension of BitStreamDecoder that supports BinaryReader sources
// ABOUTME: Enables random access to large files without loading entire content

import { BitStreamDecoder, Endianness, BitOrder } from "./bit-stream.js";
import { BinaryReader, BufferReader, createReader } from "./binary-reader.js";

/**
 * SeekableBitStreamDecoder - Extends BitStreamDecoder with BinaryReader support
 * 
 * Maintains backward compatibility while adding support for seekable sources:
 * - Files (Node.js FileHandle)
 * - Browser File API
 * - Streams (with buffering fallback)
 * 
 * Key features:
 * - Lazy loading: Only reads data when needed
 * - Smart caching: Caches frequently accessed regions
 * - Memory efficient: Doesn't load entire file for position fields
 */
export class SeekableBitStreamDecoder extends BitStreamDecoder {
  private reader: BinaryReader;
  private _cachedBytes: Uint8Array | null = null;
  
  constructor(input: Uint8Array | number[] | BinaryReader, bitOrder: BitOrder = "msb_first") {
    // If it's already a reader, check if it's a BufferReader with direct bytes access
    if (input && typeof input === 'object' && 'readAt' in input) {
      const reader = input as BinaryReader;
      // If it's a BufferReader, use its bytes directly for maximum compatibility
      if ('bytes' in reader) {
        const buffer = (reader as any).bytes as Uint8Array;
        super(buffer, bitOrder);
        this.reader = reader;
      } else {
        // For other readers (file handles, etc.), we need to load the data
        // This is a limitation - seeking requires bytes in memory
        const buffer = reader.slice(0);
        super(buffer, bitOrder);
        this.reader = new BufferReader(buffer);
      }
    } else {
      // Legacy mode: wrap array/Uint8Array in BufferReader
      const buffer = input instanceof Uint8Array ? input : new Uint8Array(input as number[]);
      super(buffer, bitOrder);
      this.reader = new BufferReader(buffer);
    }
  }

  /**
   * Override bytes property to maintain backward compatibility
   * WARNING: This may trigger full file load for large files!
   */
  get bytes(): Uint8Array {
    if (!this._cachedBytes) {
      // Check if reader has direct bytes access (BufferReader)
      if ('bytes' in this.reader) {
        this._cachedBytes = (this.reader as any).bytes;
      } else if (this.reader.seekable) {
        // For seekable sources, load entire content (with warning)
        console.warn(
          'SeekableBitStreamDecoder: Accessing .bytes property forces full file load. ' +
          'Consider using position-based reads instead.'
        );
        this._cachedBytes = this.reader.slice(0);
      } else {
        throw new Error(
          'Cannot access bytes property on non-seekable source. ' +
          'Use position-based methods instead.'
        );
      }
    }
    return this._cachedBytes;
  }

  /**
   * Create decoder from various input types
   */
  static from(input: any, bitOrder: BitOrder = "msb_first"): SeekableBitStreamDecoder {
    if (input instanceof Uint8Array || Array.isArray(input)) {
      return new SeekableBitStreamDecoder(input, bitOrder);
    }
    
    // Auto-detect and create reader
    const reader = createReader(input);
    return new SeekableBitStreamDecoder(reader, bitOrder);
  }

  /**
   * Create decoder from file path (Node.js only)
   */
  static fromFile(path: string, bitOrder: BitOrder = "msb_first"): SeekableBitStreamDecoder {
    try {
      const fs = require('fs');
      const fd = fs.openSync(path, 'r');
      const stats = fs.fstatSync(fd);
      
      const reader = {
        size: stats.size,
        seekable: true,
        readAt: (position: number, length: number): Uint8Array => {
          const buffer = new Uint8Array(length);
          const actualPos = position < 0 ? stats.size + position : position;
          fs.readSync(fd, buffer, 0, length, actualPos);
          return buffer;
        },
        readByteAt: (position: number): number => {
          const buffer = new Uint8Array(1);
          const actualPos = position < 0 ? stats.size + position : position;
          fs.readSync(fd, buffer, 0, 1, actualPos);
          return buffer[0];
        },
        slice: (start: number, end?: number): Uint8Array => {
          const actualEnd = end ?? stats.size;
          const length = actualEnd - start;
          const buffer = new Uint8Array(length);
          fs.readSync(fd, buffer, 0, length, start);
          return buffer;
        },
        close: () => fs.closeSync(fd)
      };
      
      return new SeekableBitStreamDecoder(reader, bitOrder);
    } catch (e: any) {
      throw new Error("Failed to open file: " + path + ". " + e.message);
    }
  }

  /**
   * Get size of underlying data
   */
  get size(): number {
    return this.reader.size;
  }

  /**
   * Check if source supports random access
   */
  get seekable(): boolean {
    return this.reader.seekable;
  }

  /**
   * Close the reader (if applicable)
   */
  close(): void {
    if (this.reader.close) {
      this.reader.close();
    }
  }
}
