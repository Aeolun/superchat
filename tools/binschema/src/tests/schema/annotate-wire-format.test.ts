/**
 * Tests for wire format annotation utility
 */

import { annotateWireFormat, Annotation } from '../../schema/annotate-wire-format.js';
import { BinarySchema } from '../../schema/binary-schema.js';

// Test cases
const tests = [
  {
    name: 'simple struct with two strings',
    schema: {
      config: { endianness: 'big_endian' as const },
      types: {
        String: {
          type: 'array' as const,
          kind: 'length_prefixed' as const,
          length_type: 'uint16' as const,
          items: { type: 'uint8' as const }
        },
        TestMessage: {
          sequence: [
            { name: 'nickname', type: 'String' },
            { name: 'password', type: 'String' }
          ]
        }
      }
    },
    typeName: 'TestMessage',
    bytes: [0, 5, 97, 108, 105, 99, 101, 0, 7, 104, 117, 110, 116, 101, 114, 50],
    decoded: {
      nickname: 'alice',
      password: 'hunter2'
    },
    expected: [
      { offset: 0, length: 2, description: 'nickname length (uint16): 5' },
      { offset: 2, length: 5, description: "nickname (String): 'alice'" },
      { offset: 7, length: 2, description: 'password length (uint16): 7' },
      { offset: 9, length: 7, description: "password (String): 'hunter2'" }
    ]
  },

  {
    name: 'struct with optional field (present)',
    schema: {
      config: { endianness: 'big_endian' as const },
      types: {
        'Optional<T>': {
          sequence: [
            { name: 'present', type: 'uint8' },
            { name: 'value', type: 'T', conditional: 'present == 1' }
          ]
        },
        TestMessage: {
          sequence: [
            { name: 'id', type: 'uint64' },
            { name: 'name', type: 'Optional<uint16>' }
          ]
        }
      }
    },
    typeName: 'TestMessage',
    bytes: [0, 0, 0, 0, 0, 0, 0, 42, 1, 0, 100],
    decoded: {
      id: 42,
      name: 100
    },
    expected: [
      { offset: 0, length: 8, description: 'id (uint64): 42' },
      { offset: 8, length: 1, description: 'name present (uint8): yes' },
      { offset: 9, length: 2, description: 'name (uint16): 100' }
    ]
  },

  {
    name: 'struct with optional field (absent)',
    schema: {
      config: { endianness: 'big_endian' as const },
      types: {
        'Optional<T>': {
          sequence: [
            { name: 'present', type: 'uint8' },
            { name: 'value', type: 'T', conditional: 'present == 1' }
          ]
        },
        TestMessage: {
          sequence: [
            { name: 'id', type: 'uint64' },
            { name: 'name', type: 'Optional<uint16>' }
          ]
        }
      }
    },
    typeName: 'TestMessage',
    bytes: [0, 0, 0, 0, 0, 0, 0, 42, 0],
    decoded: {
      id: 42,
      name: null
    },
    expected: [
      { offset: 0, length: 8, description: 'id (uint64): 42' },
      { offset: 8, length: 1, description: 'name present (uint8): no' }
    ]
  },

  {
    name: 'two optional strings in a row (both present)',
    schema: {
      config: { endianness: 'big_endian' as const },
      types: {
        String: {
          type: 'array' as const,
          kind: 'length_prefixed' as const,
          length_type: 'uint16' as const,
          items: { type: 'uint8' as const }
        },
        'Optional<T>': {
          sequence: [
            { name: 'present', type: 'uint8' },
            { name: 'value', type: 'T', conditional: 'present == 1' }
          ]
        },
        TestMessage: {
          sequence: [
            { name: 'first', type: 'Optional<String>' },
            { name: 'second', type: 'Optional<String>' }
          ]
        }
      }
    },
    typeName: 'TestMessage',
    bytes: [1, 0, 3, 102, 111, 111, 1, 0, 3, 98, 97, 114],
    decoded: {
      first: 'foo',
      second: 'bar'
    },
    expected: [
      { offset: 0, length: 1, description: 'first present (uint8): yes' },
      { offset: 1, length: 2, description: 'first length (uint16): 3' },
      { offset: 3, length: 3, description: "first (String): 'foo'" },
      { offset: 6, length: 1, description: 'second present (uint8): yes' },
      { offset: 7, length: 2, description: 'second length (uint16): 3' },
      { offset: 9, length: 3, description: "second (String): 'bar'" }
    ]
  },

  {
    name: 'two optional strings in a row (first absent, second present)',
    schema: {
      config: { endianness: 'big_endian' as const },
      types: {
        String: {
          type: 'array' as const,
          kind: 'length_prefixed' as const,
          length_type: 'uint16' as const,
          items: { type: 'uint8' as const }
        },
        'Optional<T>': {
          sequence: [
            { name: 'present', type: 'uint8' },
            { name: 'value', type: 'T', conditional: 'present == 1' }
          ]
        },
        TestMessage: {
          sequence: [
            { name: 'first', type: 'Optional<String>' },
            { name: 'second', type: 'Optional<String>' }
          ]
        }
      }
    },
    typeName: 'TestMessage',
    bytes: [0, 1, 0, 3, 98, 97, 114],
    decoded: {
      first: null,
      second: 'bar'
    },
    expected: [
      { offset: 0, length: 1, description: 'first present (uint8): no' },
      { offset: 1, length: 1, description: 'second present (uint8): yes' },
      { offset: 2, length: 2, description: 'second length (uint16): 3' },
      { offset: 4, length: 3, description: "second (String): 'bar'" }
    ]
  },

  {
    name: 'struct with multiple primitive types',
    schema: {
      config: { endianness: 'big_endian' as const },
      types: {
        TestMessage: {
          sequence: [
            { name: 'flag', type: 'uint8' },
            { name: 'count', type: 'uint16' },
            { name: 'total', type: 'uint32' }
          ]
        }
      }
    },
    typeName: 'TestMessage',
    bytes: [1, 0, 10, 0, 0, 3, 232],
    decoded: {
      flag: 1,
      count: 10,
      total: 1000
    },
    expected: [
      { offset: 0, length: 1, description: 'flag (uint8): 1' },
      { offset: 1, length: 2, description: 'count (uint16): 10' },
      { offset: 3, length: 4, description: 'total (uint32): 1000' }
    ]
  },

  {
    name: 'null-terminated array of complex types (DNS labels)',
    schema: {
      config: { endianness: 'big_endian' as const },
      types: {
        Label: {
          type: 'array' as const,
          kind: 'length_prefixed' as const,
          length_type: 'uint8' as const,
          items: { type: 'uint8' as const }
        },
        DomainName: {
          type: 'array' as const,
          kind: 'null_terminated' as const,
          items: { type: 'Label' as const }
        },
        TestMessage: {
          sequence: [
            { name: 'domain', type: 'DomainName' },
            { name: 'flags', type: 'uint16' }
          ]
        }
      }
    },
    typeName: 'TestMessage',
    bytes: [7, 101, 120, 97, 109, 112, 108, 101, 3, 99, 111, 109, 0, 0, 42],
    decoded: {
      domain: [
        [101, 120, 97, 109, 112, 108, 101],  // "example"
        [99, 111, 109]                        // "com"
      ],
      flags: 42
    },
    expected: [
      { offset: 0, length: 1, description: 'domain[0] length (uint8): 7' },
      { offset: 1, length: 7, description: "domain[0] (Label): 'example'" },
      { offset: 8, length: 1, description: 'domain[1] length (uint8): 3' },
      { offset: 9, length: 3, description: "domain[1] (Label): 'com'" },
      { offset: 12, length: 1, description: 'domain terminator (uint8): 0' },
      { offset: 13, length: 2, description: 'flags (uint16): 42' }
    ]
  }
];

// Only run tests if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1])) {
  // Run tests
  let passed = 0;
  let failed = 0;

  console.log('Running wire format annotation tests...\n');

  for (const test of tests) {
    try {
      const result = annotateWireFormat(test.bytes, test.typeName, test.schema as BinarySchema, test.decoded);

      // Compare results
      if (result.length !== test.expected.length) {
        failed++;
        console.log(`✗ ${test.name}`);
        console.log(`  Expected ${test.expected.length} annotations, got ${result.length}`);
        console.log(`  Expected:`, JSON.stringify(test.expected, null, 2));
        console.log(`  Got:`, JSON.stringify(result, null, 2));
        continue;
      }

      let testPassed = true;
      for (let i = 0; i < result.length; i++) {
        const r = result[i];
        const e = test.expected[i];
        if (r.offset !== e.offset || r.length !== e.length || r.description !== e.description) {
          testPassed = false;
          failed++;
          console.log(`✗ ${test.name}`);
          console.log(`  Annotation ${i} mismatch:`);
          console.log(`    Expected: ${JSON.stringify(e)}`);
          console.log(`    Got:      ${JSON.stringify(r)}`);
          break;
        }
      }

      if (testPassed) {
        passed++;
        console.log(`✓ ${test.name}`);
      }
    } catch (error) {
      failed++;
      console.log(`✗ ${test.name} (threw error)`);
      console.log(`  Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}
