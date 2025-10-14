/**
 * Edge case tests for streaming with chunked network data
 *
 * These tests simulate real network conditions where:
 * - Data arrives in arbitrary chunk sizes
 * - Items can be split across multiple chunks
 * - Network can slow down or fail mid-stream
 *
 * Critical for web-client where TCP/WebSocket frames split data unpredictably.
 */

import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Helper to create mock ReadableStream that delivers bytes in controlled chunks
 */
function createChunkedStream(fullData: number[], chunkSizes: number[]): ReadableStream<Uint8Array> {
  let offset = 0;
  let chunkIndex = 0;

  return new ReadableStream({
    async pull(controller) {
      if (offset >= fullData.length) {
        controller.close();
        return;
      }

      const chunkSize = chunkSizes[chunkIndex % chunkSizes.length];
      const chunk = fullData.slice(offset, offset + chunkSize);
      controller.enqueue(new Uint8Array(chunk));

      offset += chunkSize;
      chunkIndex++;
    }
  });
}

/**
 * Test: Item split across two chunks (most common failure case)
 */
export const itemSplitAcrossChunksTestSuite = defineTestSuite({
  name: "streaming_item_split_across_chunks",
  description: "Item data split across network chunks",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Message": {
        sequence: [
          {
            name: "id",
            type: "uint32",
          },
          {
            name: "data",
            type: "string",
            kind: "length_prefixed",
            length_type: "uint8",
            encoding: "utf8",
          }
        ]
      },
      "MessageArray": {
        sequence: [
          {
            name: "messages",
            type: "array",
            kind: "length_prefixed",
            length_type: "uint16",
            items: { "type": "Message" },
          }
        ]
      }
    }
  },

  test_type: "MessageArray",

  test_cases: [
    {
      description: "uint32 ID split across chunks",
      value: {
        messages: [
          { id: 0x12345678, data: "hello" }
        ]
      },
      bytes: [
        0x00, 0x01,             // Array length = 1
        0x12, 0x34, 0x56, 0x78, // ID split here →
        0x05,                   // String length
        0x68, 0x65, 0x6c, 0x6c, 0x6f, // "hello"
      ],
      chunkSizes: [3, 10], // Split ID: [0x00, 0x01, 0x12] | [0x34, 0x56, 0x78, ...]
    },
    {
      description: "String split across chunks",
      value: {
        messages: [
          { id: 100, data: "world" }
        ]
      },
      bytes: [
        0x00, 0x01,             // Array length
        0x00, 0x00, 0x00, 0x64, // ID = 100
        0x05,                   // String length = 5
        0x77, 0x6f, 0x72, 0x6c, 0x64, // "world" split here →
      ],
      chunkSizes: [10, 5], // Split string: [..., 0x77, 0x6f] | [0x72, 0x6c, 0x64]
    },
    {
      description: "Multiple items, multiple splits",
      value: {
        messages: [
          { id: 1, data: "a" },
          { id: 2, data: "b" },
          { id: 3, data: "c" }
        ]
      },
      bytes: [
        0x00, 0x03, // Array length = 3
        // Item 0
        0x00, 0x00, 0x00, 0x01,
        0x01, 0x61,
        // Item 1
        0x00, 0x00, 0x00, 0x02,
        0x01, 0x62,
        // Item 2
        0x00, 0x00, 0x00, 0x03,
        0x01, 0x63,
      ],
      chunkSizes: [5, 3, 5, 3, 5], // Arbitrary splits
    },
  ]
});

/**
 * Test: Very small chunks (1 byte at a time - worst case)
 */
export const oneByteChunksTestSuite = defineTestSuite({
  name: "streaming_one_byte_chunks",
  description: "Extreme case: 1 byte per chunk",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Point": {
        sequence: [
          { name: "x", type: "uint16" },
          { name: "y", type: "uint16" },
        ]
      },
      "PointArray": {
        sequence: [
          {
            name: "points",
            type: "array",
            kind: "length_prefixed",
            length_type: "uint8",
            items: { type: "Point" },
          }
        ]
      }
    }
  },

  test_type: "PointArray",

  test_cases: [
    {
      description: "1 byte per chunk (worst case latency)",
      value: {
        points: [
          { x: 10, y: 20 },
          { x: 30, y: 40 }
        ]
      },
      bytes: [
        0x02,       // Array length
        0x00, 0x0A, // Point 0: x=10
        0x00, 0x14, // Point 0: y=20
        0x00, 0x1E, // Point 1: x=30
        0x00, 0x28, // Point 1: y=40
      ],
      chunkSizes: [1], // Every chunk is 1 byte
    },
  ]
});

/**
 * Test: Large chunks (multiple items per chunk)
 */
export const largeChunksTestSuite = defineTestSuite({
  name: "streaming_large_chunks",
  description: "Multiple items arrive in single chunk",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "ByteArray": {
        sequence: [
          {
            name: "bytes",
            type: "array",
            kind: "length_prefixed",
            length_type: "uint16",
            items: { type: "uint8" },
          }
        ]
      }
    }
  },

  test_type: "ByteArray",

  test_cases: [
    {
      description: "10 items in single 12-byte chunk",
      value: {
        bytes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
      },
      bytes: [
        0x00, 0x0A, // Array length = 10
        0x00, 0x01, 0x02, 0x03, 0x04,
        0x05, 0x06, 0x07, 0x08, 0x09,
      ],
      chunkSizes: [12], // All data in one chunk
    },
  ]
});

/**
 * Test: Partial item at chunk boundary (critical edge case)
 */
export const partialItemBoundaryTestSuite = defineTestSuite({
  name: "streaming_partial_item_boundary",
  description: "Item incomplete at end of chunk, completed in next chunk",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Record": {
        sequence: [
          { name: "a", type: "uint32" },
          { name: "b", type: "uint32" },
          { name: "c", type: "uint32" },
        ]
      },
      "RecordArray": {
        sequence: [
          {
            name: "records",
            type: "array",
            kind: "length_prefixed",
            length_type: "uint8",
            items: { type: "Record" },
          }
        ]
      }
    }
  },

  test_type: "RecordArray",

  test_cases: [
    {
      description: "Chunk ends mid-item, next chunk completes it",
      value: {
        records: [
          { a: 0x11111111, b: 0x22222222, c: 0x33333333 },
          { a: 0x44444444, b: 0x55555555, c: 0x66666666 }
        ]
      },
      bytes: [
        0x02, // Array length = 2
        // Record 0 (12 bytes)
        0x11, 0x11, 0x11, 0x11,
        0x22, 0x22, 0x22, 0x22,
        0x33, 0x33, 0x33, 0x33,
        // Record 1 (12 bytes)
        0x44, 0x44, 0x44, 0x44,
        0x55, 0x55, 0x55, 0x55,
        0x66, 0x66, 0x66, 0x66,
      ],
      chunkSizes: [9, 20], // Chunk 1 ends mid-record (after 8 bytes of Record 0)
    },
  ]
});

/**
 * Test: Variable-length items (unpredictable boundaries)
 */
export const variableLengthItemsTestSuite = defineTestSuite({
  name: "streaming_variable_length_items",
  description: "Items with variable-length strings (worst case for buffering)",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Person": {
        sequence: [
          { name: "age", type: "uint8" },
          {
            name: "name",
            type: "string",
            kind: "length_prefixed",
            length_type: "uint8",
            encoding: "utf8",
          }
        ]
      },
      "PersonArray": {
        sequence: [
          {
            name: "people",
            type: "array",
            kind: "length_prefixed",
            length_type: "uint16",
            items: { type: "Person" },
          }
        ]
      }
    }
  },

  test_type: "PersonArray",

  test_cases: [
    {
      description: "Variable-length strings with arbitrary chunk splits",
      value: {
        people: [
          { age: 30, name: "Alice" },
          { age: 25, name: "Bob" },
          { age: 40, name: "Charlotte" }
        ]
      },
      bytes: [
        0x00, 0x03, // Array length = 3
        // Person 0
        0x1E,       // age = 30
        0x05,       // name length = 5
        0x41, 0x6c, 0x69, 0x63, 0x65, // "Alice"
        // Person 1
        0x19,       // age = 25
        0x03,       // name length = 3
        0x42, 0x6f, 0x62, // "Bob"
        // Person 2
        0x28,       // age = 40
        0x09,       // name length = 9
        0x43, 0x68, 0x61, 0x72, 0x6c, 0x6f, 0x74, 0x74, 0x65, // "Charlotte"
      ],
      chunkSizes: [7, 8, 12], // Splits at unpredictable points
    },
  ]
});

/**
 * Test: Empty array (edge case - should complete immediately)
 */
export const emptyArrayStreamingTestSuite = defineTestSuite({
  name: "streaming_empty_array",
  description: "Empty array should not wait for data",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "EmptyArray": {
        sequence: [
          {
            name: "items",
            type: "array",
            kind: "length_prefixed",
            length_type: "uint16",
            items: { type: "uint32" },
          }
        ]
      }
    }
  },

  test_type: "EmptyArray",

  test_cases: [
    {
      description: "Empty array completes after reading length",
      value: { items: [] },
      bytes: [0x00, 0x00], // Array length = 0
      chunkSizes: [2], // Length arrives in first chunk
    },
  ]
});

/**
 * Test: Network error mid-stream
 */
export const networkErrorTestSuite = {
  name: "streaming_network_error",
  description: "Handle network errors gracefully",

  async test() {
    const stream = new ReadableStream({
      async pull(controller) {
        // First chunk: array length + partial item
        controller.enqueue(new Uint8Array([0x00, 0x0A, 0x00, 0x00]));
        // Simulate network error
        controller.error(new Error("Network connection lost"));
      }
    });

    let itemsReceived = 0;
    let errorCaught = false;

    try {
      // Attempt to decode stream
      for await (const item of decodeArrayStream(stream.getReader())) {
        itemsReceived++;
      }
    } catch (e) {
      errorCaught = true;
      // Error should include context about where failure occurred
      if (!e.message.includes("Network connection lost")) {
        throw new Error("Error should preserve original network error message");
      }
    }

    if (!errorCaught) {
      throw new Error("Expected network error to be thrown");
    }

    // Should have received 0 items (error happened before first item complete)
    if (itemsReceived !== 0) {
      throw new Error(`Expected 0 items, received ${itemsReceived}`);
    }
  }
};

/**
 * Test: Decode error mid-stream (invalid data)
 */
export const decodeErrorMidStreamTestSuite = {
  name: "streaming_decode_error_midstream",
  description: "Invalid data should throw with context",

  async test() {
    const malformedData = [
      0x00, 0x03, // Array length = 3
      0x00, 0x00, 0x00, 0x01, // Item 0: valid uint32
      0x00, 0x00, 0x00, 0x02, // Item 1: valid uint32
      0xFF, // Item 2: incomplete (only 1 byte of uint32)
    ];

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(malformedData));
        controller.close(); // EOF with incomplete item
      }
    });

    let itemsReceived = 0;
    let errorCaught = false;

    try {
      for await (const item of decodeUint32ArrayStream(stream.getReader())) {
        itemsReceived++;
      }
    } catch (e) {
      errorCaught = true;
      // Error should mention which item failed
      if (!e.message.includes("item 2") && !e.message.includes("item 3")) {
        throw new Error(
          `Error should mention item number. Got: ${e.message}`
        );
      }
    }

    if (!errorCaught) {
      throw new Error("Expected decode error to be thrown");
    }

    // Should have received 2 valid items before error
    if (itemsReceived !== 2) {
      throw new Error(`Expected 2 items, received ${itemsReceived}`);
    }
  }
};

/**
 * Test: Slow consumer (backpressure)
 */
export const slowConsumerTestSuite = {
  name: "streaming_slow_consumer",
  description: "Decoder should handle slow consumer without buffering entire array",

  async test() {
    let chunksRead = 0;

    const stream = new ReadableStream({
      async pull(controller) {
        chunksRead++;

        if (chunksRead === 1) {
          // First chunk: array length + 5 items
          controller.enqueue(new Uint8Array([
            0x00, 0x64, // Array length = 100
            0x01, 0x02, 0x03, 0x04, 0x05, // First 5 items
          ]));
        } else if (chunksRead <= 20) {
          // Subsequent chunks: 5 items each
          controller.enqueue(new Uint8Array([0x06, 0x07, 0x08, 0x09, 0x0A]));
        } else {
          controller.close();
        }
      }
    });

    let itemsProcessed = 0;
    const startTime = Date.now();

    for await (const item of decodeUint8ArrayStream(stream.getReader())) {
      itemsProcessed++;

      // Simulate slow consumer (10ms per item)
      await new Promise(resolve => setTimeout(resolve, 10));

      if (itemsProcessed >= 10) break; // Process first 10 items only
    }

    const duration = Date.now() - startTime;

    // Should take ~100ms (10 items * 10ms each)
    // NOT wait for all 100 items to download
    if (duration > 200) {
      throw new Error(
        `Took too long (${duration}ms) - should not buffer entire array`
      );
    }

    if (itemsProcessed !== 10) {
      throw new Error(`Expected 10 items, processed ${itemsProcessed}`);
    }
  }
};

/**
 * Test: length_prefixed_items with chunked data
 */
export const lengthPrefixedItemsChunkedTestSuite = defineTestSuite({
  name: "streaming_length_prefixed_items_chunked",
  description: "Per-item length prefix with network chunks",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Message": {
        sequence: [
          { name: "id", type: "uint32" },
          {
            name: "text",
            type: "string",
            kind: "length_prefixed",
            length_type: "uint8",
            encoding: "utf8",
          }
        ]
      },
      "MessageArray": {
        sequence: [
          {
            name: "messages",
            type: "array",
            kind: "length_prefixed_items",
            length_type: "uint16",
            item_length_type: "uint16",
            items: { type: "Message" },
          }
        ]
      }
    }
  },

  test_type: "MessageArray",

  test_cases: [
    {
      description: "Item length split across chunks",
      value: {
        messages: [
          { id: 1, text: "hello" },
          { id: 2, text: "world" }
        ]
      },
      bytes: [
        0x00, 0x02,       // Array length = 2
        // Item 0
        0x00, 0x0A,       // Item length = 10 bytes (split here →)
        0x00, 0x00, 0x00, 0x01, // id = 1
        0x05,             // text length = 5
        0x68, 0x65, 0x6c, 0x6c, 0x6f, // "hello"
        // Item 1
        0x00, 0x0A,       // Item length = 10 bytes
        0x00, 0x00, 0x00, 0x02, // id = 2
        0x05,             // text length = 5
        0x77, 0x6f, 0x72, 0x6c, 0x64, // "world"
      ],
      chunkSizes: [3, 10, 10], // Split: [0x00, 0x02, 0x00] | [0x0A, ...] | [...]
    },
  ]
});
