/**
 * Tests for wire format annotation with bitfields
 */

import { annotateWireFormat, Annotation } from '../../schema/annotate-wire-format.js';
import { BinarySchema } from '../../schema/binary-schema.js';

// Test cases for bitfield handling
const tests = [
  {
    name: 'single bit field',
    schema: {
      config: { endianness: 'big_endian' as const },
      types: {
        TestMessage: {
          sequence: [
            { name: 'compression', type: 'bit', size: 1 },
            { name: 'encryption', type: 'bit', size: 1 },
            { name: 'reserved', type: 'bit', size: 6 }
          ]
        }
      }
    },
    typeName: 'TestMessage',
    bytes: [0b00000011], // compression=1, encryption=1, reserved=0
    decoded: {
      compression: 1,
      encryption: 1,
      reserved: 0
    },
    expected: [
      { offset: 0, length: 1, description: 'Byte 0 (bits): compression=1, encryption=1, reserved=0' }
    ]
  },

  {
    name: 'bit field spanning two bytes',
    schema: {
      config: { endianness: 'big_endian' as const },
      types: {
        TestMessage: {
          sequence: [
            { name: 'flags', type: 'bit', size: 4 },
            { name: 'counter', type: 'bit', size: 12 }
          ]
        }
      }
    },
    typeName: 'TestMessage',
    bytes: [0b00010000, 0b11111111], // flags=0001, counter=000011111111 (255)
    decoded: {
      flags: 1,
      counter: 255
    },
    expected: [
      { offset: 0, length: 2, description: 'Bytes 0-1 (bits): flags=1 (bits 0-3), counter=255 (bits 4-15)' }
    ]
  },

  {
    name: 'mix of bitfields and byte-aligned fields',
    schema: {
      config: { endianness: 'big_endian' as const },
      types: {
        TestMessage: {
          sequence: [
            { name: 'version', type: 'uint8' },
            { name: 'compression', type: 'bit', size: 1 },
            { name: 'encryption', type: 'bit', size: 1 },
            { name: 'reserved', type: 'bit', size: 6 },
            { name: 'length', type: 'uint16' }
          ]
        }
      }
    },
    typeName: 'TestMessage',
    bytes: [1, 0b00000011, 0, 42],
    decoded: {
      version: 1,
      compression: 1,
      encryption: 1,
      reserved: 0,
      length: 42
    },
    expected: [
      { offset: 0, length: 1, description: 'version (uint8): 1' },
      { offset: 1, length: 1, description: 'Byte 1 (bits): compression=1, encryption=1, reserved=0' },
      { offset: 2, length: 2, description: 'length (uint16): 42' }
    ]
  },

  {
    name: 'three consecutive bytes of bitfields',
    schema: {
      config: { endianness: 'big_endian' as const },
      types: {
        TestMessage: {
          sequence: [
            { name: 'type', type: 'bit', size: 4 },
            { name: 'subtype', type: 'bit', size: 4 },
            { name: 'flags', type: 'bit', size: 8 },
            { name: 'counter', type: 'bit', size: 8 }
          ]
        }
      }
    },
    typeName: 'TestMessage',
    bytes: [0b00010010, 0xFF, 0x0A],
    decoded: {
      type: 1,
      subtype: 2,
      flags: 255,
      counter: 10
    },
    expected: [
      { offset: 0, length: 3, description: 'Bytes 0-2 (bits): type=1 (bits 0-3), subtype=2 (bits 4-7), flags=255 (bits 8-15), counter=10 (bits 16-23)' }
    ]
  },

  {
    name: 'non-byte-aligned transition',
    schema: {
      config: { endianness: 'big_endian' as const },
      types: {
        TestMessage: {
          sequence: [
            { name: 'flag', type: 'bit', size: 1 },
            { name: 'value', type: 'bit', size: 3 },
            { name: 'padding', type: 'bit', size: 4 },
            { name: 'data', type: 'uint8' }
          ]
        }
      }
    },
    typeName: 'TestMessage',
    bytes: [0b10110000, 42],
    decoded: {
      flag: 1,
      value: 3,
      padding: 0,
      data: 42
    },
    expected: [
      { offset: 0, length: 1, description: 'Byte 0 (bits): flag=1, value=3, padding=0' },
      { offset: 1, length: 1, description: 'data (uint8): 42' }
    ]
  },

  {
    name: 'single 16-bit field spanning two bytes',
    schema: {
      config: { endianness: 'big_endian' as const },
      types: {
        TestMessage: {
          sequence: [
            { name: 'value', type: 'bit', size: 16 }
          ]
        }
      }
    },
    typeName: 'TestMessage',
    bytes: [0x12, 0x34],
    decoded: {
      value: 0x1234
    },
    expected: [
      { offset: 0, length: 2, description: 'Bytes 0-1 (bits): value=4660 (bits 0-15)' }
    ]
  },

  {
    name: 'complex: bitfields, byte field, more bitfields',
    schema: {
      config: { endianness: 'big_endian' as const },
      types: {
        TestMessage: {
          sequence: [
            { name: 'flag1', type: 'bit', size: 1 },
            { name: 'flag2', type: 'bit', size: 1 },
            { name: 'padding1', type: 'bit', size: 6 },
            { name: 'command', type: 'uint8' },
            { name: 'status', type: 'bit', size: 2 },
            { name: 'padding2', type: 'bit', size: 6 }
          ]
        }
      }
    },
    typeName: 'TestMessage',
    bytes: [0b11000000, 5, 0b01000000],
    decoded: {
      flag1: 1,
      flag2: 1,
      padding1: 0,
      command: 5,
      status: 1,
      padding2: 0
    },
    expected: [
      { offset: 0, length: 1, description: 'Byte 0 (bits): flag1=1, flag2=1, padding1=0' },
      { offset: 1, length: 1, description: 'command (uint8): 5' },
      { offset: 2, length: 1, description: 'Byte 2 (bits): status=1, padding2=0' }
    ]
  }
];

// Only run tests if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1])) {
  // Run tests
  let passed = 0;
  let failed = 0;

  console.log('Running bitfield annotation tests...\n');

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
