// ABOUTME: Abstract BinaryReader interface for reading from various binary sources
// ABOUTME: Provides unified API for memory buffers, file handles, streams, and browser files

/**
 * Abstract interface for reading binary data from various sources.
 * Implementations can be sync or async depending on the underlying source.
 * 
 * Design decisions:
 * - Synchronous API for memory-based sources (BufferReader)
 * - Asynchronous API for I/O-based sources (FileHandleReader, BrowserFileReader)
 * - Automatic detection and best strategy selection
 * - Lazy buffering only when necessary
 */
export interface BinaryReader {
  /**
   * Total size of the binary data in bytes.
   * Returns -1 if size is unknown (e.g., for streams).
   */
  readonly size: number;
  
  /**
   * Whether this reader supports seeking to arbitrary positions.
   * If false, only sequential reading is supported.
   */
  readonly seekable: boolean;
  
  /**
   * Whether this reader requires async operations.
   * If true, use readAsync/readAtAsync instead of read/readAt.
   */
  readonly isAsync: boolean;
  
  /**
   * Read bytes from the current position (for sequential reading).
   * Only available for synchronous readers (isAsync = false).
   * 
   * @param length Number of bytes to read
   * @returns Uint8Array containing the read bytes
   * @throws Error if not enough bytes available or if reader is async
   */
  read?(length: number): Uint8Array;
  
  /**
   * Read bytes from the current position (for sequential reading).
   * Only available for asynchronous readers (isAsync = true).
   * 
   * @param length Number of bytes to read
   * @returns Promise resolving to Uint8Array containing the read bytes
   * @throws Error if not enough bytes available or if reader is sync
   */
  readAsync?(length: number): Promise<Uint8Array>;
  
  /**
   * Read bytes at a specific position (for random access).
   * Only available for synchronous seekable readers.
   * 
   * @param position Byte offset to read from (can be negative for offset from EOF)
   * @param length Number of bytes to read
   * @returns Uint8Array containing the read bytes
   * @throws Error if position is out of bounds, reader is not seekable, or reader is async
   */
  readAt?(position: number, length: number): Uint8Array;
  
  /**
   * Read bytes at a specific position (for random access).
   * Only available for asynchronous seekable readers.
   * 
   * @param position Byte offset to read from (can be negative for offset from EOF)
   * @param length Number of bytes to read
   * @returns Promise resolving to Uint8Array containing the read bytes
   * @throws Error if position is out of bounds, reader is not seekable, or reader is sync
   */
  readAtAsync?(position: number, length: number): Promise<Uint8Array>;
  
  /**
   * Peek at bytes without advancing position (for lookahead).
   * Only available for synchronous readers.
   * 
   * @param length Number of bytes to peek
   * @returns Uint8Array containing the peeked bytes
   * @throws Error if not enough bytes available or if reader is async
   */
  peek?(length: number): Uint8Array;
  
  /**
   * Peek at bytes without advancing position (for lookahead).
   * Only available for asynchronous readers.
   * 
   * @param length Number of bytes to peek
   * @returns Promise resolving to Uint8Array containing the peeked bytes
   * @throws Error if not enough bytes available or if reader is sync
   */
  peekAsync?(length: number): Promise<Uint8Array>;
  
  /**
   * Get current read position.
   */
  readonly position: number;
  
  /**
   * Seek to a specific position (for seekable readers).
   * 
   * @param position Byte offset to seek to (can be negative for offset from EOF)
   * @throws Error if reader is not seekable or position is out of bounds
   */
  seek(position: number): void;
  
  /**
   * Close the reader and release any resources.
   * After closing, the reader cannot be used anymore.
   */
  close?(): void;
  
  /**
   * Close the reader and release any resources (async version).
   * After closing, the reader cannot be used anymore.
   */
  closeAsync?(): Promise<void>;
}

/**
 * Type guard to check if a reader is asynchronous
 */
export function isAsyncReader(reader: BinaryReader): reader is BinaryReader & {
  readAsync: NonNullable<BinaryReader['readAsync']>;
  readAtAsync?: NonNullable<BinaryReader['readAtAsync']>;
  peekAsync: NonNullable<BinaryReader['peekAsync']>;
} {
  return reader.isAsync === true;
}

/**
 * Type guard to check if a reader is synchronous
 */
export function isSyncReader(reader: BinaryReader): reader is BinaryReader & {
  read: NonNullable<BinaryReader['read']>;
  readAt?: NonNullable<BinaryReader['readAt']>;
  peek: NonNullable<BinaryReader['peek']>;
} {
  return reader.isAsync === false;
}

/**
 * Type guard to check if a reader is seekable
 */
export function isSeekableReader(reader: BinaryReader): boolean {
  return reader.seekable === true;
}
