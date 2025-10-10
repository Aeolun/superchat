/**
 * DNS Compression Pointer Tests
 *
 * Tests DNS message compression using pointers to previously-seen labels.
 * Per RFC 1035 Section 4.1.4, domain names can be compressed using pointers.
 *
 * Pointer format (2 bytes):
 * - Top 2 bits: 11 (0xC0) to mark as pointer
 * - Bottom 14 bits: offset from message start
 * - Example: 0xC00C = pointer to offset 12
 *
 * Wire format examples:
 * - Full domain: [3]"www"[7]"example"[3]"com"[0]
 * - Pointer to offset 12: [0xC0][0x0C]
 * - Mixed: [3]"www"[0xC0][0x0C] (www + pointer to example.com at offset 12)
 */

import { defineTestSuite } from "../../schema/test-schema.js";

// Test suite for full domain name (no compression)
export const dnsCompressionFullDomainTestSuite = defineTestSuite({
  name: "dns_compression_full_domain",
  description: "DNS compression - full domain name (baseline, no pointers)",

  schema: {
    config: {
      endianness: "big_endian"
    },
    types: {
      "Label": {
        type: "string",
        kind: "length_prefixed",
        length_type: "uint8",
        encoding: "ascii"
      },
      "CompressedLabel": {
        type: "discriminated_union",
        discriminator: {
          peek: "uint8"
        },
        variants: [
          {
            type: "Label",
            when: "value < 0xC0"
          },
          {
            type: "LabelPointer",
            when: "value >= 0xC0"
          }
        ]
      },
      "LabelPointer": {
        type: "pointer",
        storage: "uint16",
        endianness: "big_endian",
        offset_mask: "0x3FFF",
        offset_from: "message_start",
        target_type: "Label"
      },
      "CompressedDomain": {
        type: "array",
        kind: "null_terminated",
        items: { type: "CompressedLabel" },
        terminal_variants: ["LabelPointer"]
      }
    }
  },

  test_type: "CompressedDomain",

  test_cases: [
    {
      description: "Full domain 'example.com' (no compression)",
      bytes: [
        0x07, 0x65, 0x78, 0x61, 0x6D, 0x70, 0x6C, 0x65, // "example"
        0x03, 0x63, 0x6F, 0x6D, // "com"
        0x00  // null terminator
      ],
      value: [
        { type: "Label", value: "example" },
        { type: "Label", value: "com" }
      ]
    },
    {
      description: "Full domain 'www.example.com' (no compression)",
      bytes: [
        0x03, 0x77, 0x77, 0x77, // "www"
        0x07, 0x65, 0x78, 0x61, 0x6D, 0x70, 0x6C, 0x65, // "example"
        0x03, 0x63, 0x6F, 0x6D, // "com"
        0x00  // null terminator
      ],
      value: [
        { type: "Label", value: "www" },
        { type: "Label", value: "example" },
        { type: "Label", value: "com" }
      ]
    }
  ]
});

// Test suite for pointer to domain suffix
export const dnsCompressionPointerTestSuite = defineTestSuite({
  name: "dns_compression_pointer",
  description: "DNS compression - pointer to domain suffix",

  schema: {
    config: {
      endianness: "big_endian"
    },
    types: {
      "Label": {
        type: "string",
        kind: "length_prefixed",
        length_type: "uint8",
        encoding: "ascii"
      },
      "CompressedLabel": {
        type: "discriminated_union",
        discriminator: {
          peek: "uint8"
        },
        variants: [
          {
            type: "Label",
            when: "value < 0xC0"
          },
          {
            type: "LabelPointer",
            when: "value >= 0xC0"
          }
        ]
      },
      "LabelPointer": {
        type: "pointer",
        storage: "uint16",
        endianness: "big_endian",
        offset_mask: "0x3FFF",
        offset_from: "message_start",
        target_type: "Label"
      },
      "CompressedDomain": {
        type: "array",
        kind: "null_terminated",
        items: { type: "CompressedLabel" },
        terminal_variants: ["LabelPointer"]
      }
    }
  },

  test_type: "CompressedDomain",

  test_cases: [
    {
      description: "Pointer to offset 0 (points to first label 'example')",
      bytes: [
        0x07, 0x65, 0x78, 0x61, 0x6D, 0x70, 0x6C, 0x65, // offset 0: "example"
        0xC0, 0x00 // pointer to offset 0 (terminal - no null terminator)
      ],
      value: [
        { type: "Label", value: "example" },
        { type: "LabelPointer", value: "example" }
      ]
    },
    {
      description: "Pointer to offset 4 (points to 'com')",
      bytes: [
        0x03, 0x63, 0x6F, 0x6D, // offset 0: "com"
        0xC0, 0x00 // offset 4: pointer to "com" at offset 0 (terminal - no null terminator)
      ],
      value: [
        { type: "Label", value: "com" },
        { type: "LabelPointer", value: "com" }
      ]
    },
    {
      description: "Two labels + pointer back to first label",
      bytes: [
        0x07, 0x65, 0x78, 0x61, 0x6D, 0x70, 0x6C, 0x65, // offset 0: "example"
        0x03, 0x63, 0x6F, 0x6D, // offset 8: "com"
        0xC0, 0x00 // offset 12: pointer to "example" at offset 0 (terminal - no null terminator)
      ],
      value: [
        { type: "Label", value: "example" },
        { type: "Label", value: "com" },
        { type: "LabelPointer", value: "example" }
      ]
    }
  ]
});

// Test suite for mixed labels and pointers
export const dnsCompressionMixedTestSuite = defineTestSuite({
  name: "dns_compression_mixed",
  description: "DNS compression - mixed labels and pointers",

  schema: {
    config: {
      endianness: "big_endian"
    },
    types: {
      "Label": {
        type: "string",
        kind: "length_prefixed",
        length_type: "uint8",
        encoding: "ascii"
      },
      "CompressedLabel": {
        type: "discriminated_union",
        discriminator: {
          peek: "uint8"
        },
        variants: [
          {
            type: "Label",
            when: "value < 0xC0"
          },
          {
            type: "LabelPointer",
            when: "value >= 0xC0"
          }
        ]
      },
      "LabelPointer": {
        type: "pointer",
        storage: "uint16",
        endianness: "big_endian",
        offset_mask: "0x3FFF",
        offset_from: "message_start",
        target_type: "Label"
      },
      "CompressedDomain": {
        type: "array",
        kind: "null_terminated",
        items: { type: "CompressedLabel" },
        terminal_variants: ["LabelPointer"]
      }
    }
  },

  test_type: "CompressedDomain",

  test_cases: [
    {
      description: "One label + pointer: 'www' + pointer to 'example.com'",
      bytes: [
        0x07, 0x65, 0x78, 0x61, 0x6D, 0x70, 0x6C, 0x65, // offset 0: "example"
        0x03, 0x63, 0x6F, 0x6D, // offset 8: "com"
        0x03, 0x77, 0x77, 0x77, // offset 12: "www"
        0xC0, 0x00 // offset 16: pointer to "example" at offset 0 (terminal - no null terminator)
      ],
      value: [
        { type: "Label", value: "example" },
        { type: "Label", value: "com" },
        { type: "Label", value: "www" },
        { type: "LabelPointer", value: "example" }
      ]
    },
    {
      description: "Two labels + pointer: 'mail.example' + pointer to 'com'",
      bytes: [
        0x03, 0x63, 0x6F, 0x6D, // offset 0: "com"
        0x07, 0x65, 0x78, 0x61, 0x6D, 0x70, 0x6C, 0x65, // offset 4: "example"
        0x04, 0x6D, 0x61, 0x69, 0x6C, // offset 12: "mail"
        0xC0, 0x00 // offset 17: pointer to "com" at offset 0 (terminal - no null terminator)
      ],
      value: [
        { type: "Label", value: "com" },
        { type: "Label", value: "example" },
        { type: "Label", value: "mail" },
        { type: "LabelPointer", value: "com" }
      ]
    }
  ]
});

// TODO: Test suite for circular reference detection
// NOTE: Requires error testing support in test schema
// For now, circular reference detection is implemented but not tested
// The runtime will throw "Circular pointer reference detected at offset X"
// when a circular reference is encountered during decoding

// Test suite for edge case pointer offsets
export const dnsCompressionEdgeCasesTestSuite = defineTestSuite({
  name: "dns_compression_edge_cases",
  description: "DNS compression - edge case pointer offsets",

  schema: {
    config: {
      endianness: "big_endian"
    },
    types: {
      "Label": {
        type: "string",
        kind: "length_prefixed",
        length_type: "uint8",
        encoding: "ascii"
      },
      "CompressedLabel": {
        type: "discriminated_union",
        discriminator: {
          peek: "uint8"
        },
        variants: [
          {
            type: "Label",
            when: "value < 0xC0"
          },
          {
            type: "LabelPointer",
            when: "value >= 0xC0"
          }
        ]
      },
      "LabelPointer": {
        type: "pointer",
        storage: "uint16",
        endianness: "big_endian",
        offset_mask: "0x3FFF",
        offset_from: "message_start",
        target_type: "Label"
      },
      "CompressedDomain": {
        type: "array",
        kind: "null_terminated",
        items: { type: "CompressedLabel" },
        terminal_variants: ["LabelPointer"]
      }
    }
  },

  test_type: "CompressedDomain",

  test_cases: [
    {
      description: "Pointer with all lower bits set (tests offset mask)",
      bytes: [
        0x03, 0x63, 0x6F, 0x6D, // offset 0: "com"
        0xC0, 0x00 // 0xC000 (top bits) | 0x0000 (offset 0) - terminal, no null terminator
      ],
      value: [
        { type: "Label", value: "com" },
        { type: "LabelPointer", value: "com" }
      ]
    },
    {
      description: "Pointer with top bits set (0xC000 | offset)",
      bytes: [
        0x03, 0x63, 0x6F, 0x6D, // offset 0: "com"
        0xC0, 0x00 // 0xC000 (top bits 11) + offset 0 - terminal, no null terminator
      ],
      value: [
        { type: "Label", value: "com" },
        { type: "LabelPointer", value: "com" }
      ]
    }
  ]
});
