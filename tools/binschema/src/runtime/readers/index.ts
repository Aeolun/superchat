// ABOUTME: Main exports and input detection for binary readers
// ABOUTME: Automatically selects the best reader based on input type

export { BinaryReader, isAsyncReader, isSyncReader, isSeekableReader } from "./binary-reader.js";
export { BufferReader } from "./buffer-reader.js";
export { FileHandleReader } from "./file-handle-reader.js";
export { StreamReader } from "./stream-reader.js";

import { BinaryReader } from "./binary-reader.js";
import { BufferReader } from "./buffer-reader.js";
import { FileHandleReader } from "./file-handle-reader.js";
import { StreamReader } from "./stream-reader.js";

/**
 * Input types that can be automatically converted to a BinaryReader
 */
export type BinaryInput = 
  | Uint8Array 
  | number[] 
  | string  // File path
  | BinaryReader  // Already a reader
  | NodeJS.ReadableStream
  | ReadableStream<Uint8Array>;

/**
 * Detect input type and create the most appropriate BinaryReader.
 * 
 * Strategy:
 * - Uint8Array/number[] → BufferReader (sync, seekable, no overhead)
 * - string (file path) → FileHandleReader (async, seekable, memory-efficient)
 * - FileHandle → FileHandleReader (async, seekable, memory-efficient)
 * - ReadableStream → StreamReader (async, buffers everything, warns user)
 * - BinaryReader → return as-is
 * 
 * @param input The input to read from
 * @returns A BinaryReader instance or Promise<BinaryReader> for async inputs
 */
export function createReader(input: Uint8Array | number[] | BinaryReader): BinaryReader;
export function createReader(input: string | NodeJS.ReadableStream | ReadableStream<Uint8Array>): Promise<BinaryReader>;
export function createReader(input: BinaryInput): BinaryReader | Promise<BinaryReader>;
export function createReader(input: BinaryInput): BinaryReader | Promise<BinaryReader> {
  // Already a reader, return as-is
  if (input && typeof input === "object" && "size" in input && "seekable" in input) {
    return input as BinaryReader;
  }
  
  // Uint8Array or number array - use BufferReader
  if (input instanceof Uint8Array || Array.isArray(input)) {
    return new BufferReader(input);
  }
  
  // String - assume file path, use FileHandleReader
  if (typeof input === "string") {
    return FileHandleReader.fromPath(input);
  }
  
  // Node.js stream or Web Streams API
  if (
    (typeof input === "object" && input && "pipe" in input) || // Node.js stream
    (typeof input === "object" && input && "getReader" in input) // Web Streams API
  ) {
    // Return StreamReader which will buffer the entire stream
    return Promise.resolve(new StreamReader(input as any));
  }
  
  // FileHandle (if passed directly)
  if (typeof input === "object" && input && "read" in input && "stat" in input) {
    return FileHandleReader.create(input as any);
  }
  
  throw new Error(
    "Unsupported input type. Expected Uint8Array, number[], string (file path), " +
    "ReadableStream, or BinaryReader. Got: " + typeof input
  );
}

/**
 * Synchronously create a reader from a buffer.
 * This is a convenience function that guarantees a synchronous reader.
 */
export function createBufferReader(input: Uint8Array | number[]): BufferReader {
  return new BufferReader(input);
}

/**
 * Get memory usage estimate for different input types
 */
export function estimateMemoryUsage(input: BinaryInput, fileSize?: number): string {
  if (input instanceof Uint8Array) {
    return "~" + input.length + " bytes (already in memory)";
  }
  
  if (Array.isArray(input)) {
    return "~" + input.length + " bytes (already in memory)";
  }
  
  if (typeof input === "string") {
    if (fileSize) {
      return "<1KB (file handle, reads on demand)";
    }
    return "Minimal (file handle, reads on demand)";
  }
  
  if (typeof input === "object" && input) {
    if ("size" in input && "seekable" in input) {
      const reader = input as BinaryReader;
      if (reader.seekable && !reader.isAsync) {
        return "~" + reader.size + " bytes (buffered in memory)";
      }
      if (reader.seekable && reader.isAsync) {
        return "Minimal (seekable async reader)";
      }
      return "Unknown (depends on stream size)";
    }
    
    // Stream - will be fully buffered
    if (fileSize) {
      return "~" + fileSize + " bytes (entire stream buffered)";
    }
    return "Entire stream size (will be buffered in memory)";
  }
  
  return "Unknown";
}
