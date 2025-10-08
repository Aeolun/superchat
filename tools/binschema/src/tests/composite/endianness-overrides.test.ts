import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for per-field endianness overrides
 *
 * Demonstrates mixing big-endian and little-endian fields in same struct
 * (For when you need to deal with cursed protocols)
 */
export const mixedEndiannessTestSuite = defineTestSuite({
  name: "mixed_endianness",
  description: "Struct with mixed endianness fields",

  schema: {
    config: {
      endianness: "big_endian", // Global default
    },
    types: {
      "MixedHeader": {
        fields: [
          { name: "magic", type: "uint16" }, // Uses big_endian (global)
          { name: "version", type: "uint16", endianness: "little_endian" }, // Override!
          { name: "length", type: "uint32" }, // Uses big_endian (global)
        ]
      }
    }
  },

  test_type: "MixedHeader",

  test_cases: [
    {
      description: "Magic=0xCAFE, version=1, length=1000",
      value: {
        magic: 0xCAFE,
        version: 1,
        length: 1000,
      },
      bytes: [
        0xCA, 0xFE,       // magic (big endian)
        0x01, 0x00,       // version (little endian!)
        0x00, 0x00, 0x03, 0xE8, // length (big endian)
      ],
    },
    {
      description: "Demonstrates byte order difference",
      value: {
        magic: 0x1234,
        version: 0x1234,
        length: 0x12345678,
      },
      bytes: [
        0x12, 0x34,       // magic: 0x1234 big endian = [0x12, 0x34]
        0x34, 0x12,       // version: 0x1234 little endian = [0x34, 0x12]
        0x12, 0x34, 0x56, 0x78, // length (big endian)
      ],
    },
  ]
});

/**
 * Test suite for all little-endian with one big-endian field
 *
 * Opposite case: mostly little-endian protocol with one big-endian field
 */
export const littleEndianWithBigOverrideTestSuite = defineTestSuite({
  name: "little_endian_with_big_override",
  description: "Little-endian protocol with one big-endian field",

  schema: {
    config: {
      endianness: "little_endian", // Global default
    },
    types: {
      "NetworkPacket": {
        fields: [
          { name: "local_timestamp", type: "uint32" }, // Little endian
          { name: "network_id", type: "uint16", endianness: "big_endian" }, // Network byte order!
          { name: "local_sequence", type: "uint32" }, // Little endian
        ]
      }
    }
  },

  test_type: "NetworkPacket",

  test_cases: [
    {
      description: "Timestamp=1000, network_id=0xABCD, sequence=42",
      value: {
        local_timestamp: 1000,
        network_id: 0xABCD,
        local_sequence: 42,
      },
      bytes: [
        0xE8, 0x03, 0x00, 0x00, // timestamp (little endian)
        0xAB, 0xCD,             // network_id (big endian!)
        0x2A, 0x00, 0x00, 0x00, // sequence (little endian)
      ],
    },
  ]
});

/**
 * Test suite for float endianness override
 *
 * Demonstrates endianness applies to floating point too
 */
export const floatEndiannessOverrideTestSuite = defineTestSuite({
  name: "float_endianness_override",
  description: "Mixed endianness with float types",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "SensorData": {
        fields: [
          { name: "sensor_id", type: "uint16" }, // Big endian
          { name: "temperature", type: "float32", endianness: "little_endian" }, // Little!
          { name: "timestamp", type: "uint32" }, // Big endian
        ]
      }
    }
  },

  test_type: "SensorData",

  test_cases: [
    {
      description: "Sensor 1, temp 25.5°C, timestamp 1000",
      value: {
        sensor_id: 1,
        temperature: 25.5,
        timestamp: 1000,
      },
      bytes: [
        0x00, 0x01,             // sensor_id (big endian)
        0x00, 0x00, 0xCC, 0x41, // temperature 25.5 (little endian float)
        0x00, 0x00, 0x03, 0xE8, // timestamp (big endian)
      ],
    },
  ]
});

/**
 * Test suite demonstrating the chaos of real-world mixed-endian protocols
 *
 * Some protocols really do this (looking at you, legacy formats)
 */
export const cursedMixedEndiannessTestSuite = defineTestSuite({
  name: "cursed_mixed_endianness",
  description: "Maximum chaos: every field different endianness",

  schema: {
    types: {
      "CursedFormat": {
        fields: [
          { name: "field_a", type: "uint16", endianness: "big_endian" },
          { name: "field_b", type: "uint16", endianness: "little_endian" },
          { name: "field_c", type: "uint32", endianness: "big_endian" },
          { name: "field_d", type: "uint32", endianness: "little_endian" },
        ]
      }
    }
  },

  test_type: "CursedFormat",

  test_cases: [
    {
      description: "All fields = 0x12345678 (truncated to fit type)",
      value: {
        field_a: 0x1234,
        field_b: 0x1234,
        field_c: 0x12345678,
        field_d: 0x12345678,
      },
      bytes: [
        0x12, 0x34,             // field_a (big)
        0x34, 0x12,             // field_b (little)
        0x12, 0x34, 0x56, 0x78, // field_c (big)
        0x78, 0x56, 0x34, 0x12, // field_d (little)
      ],
    },
  ]
});
