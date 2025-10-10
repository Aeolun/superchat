/**
 * DNS Label Tests
 *
 * Tests basic DNS labels using length-prefixed ASCII strings.
 * DNS labels are the building blocks of domain names (e.g., "www", "example", "com").
 *
 * Wire format: [length: uint8][data: ASCII bytes]
 * - Length is number of characters (max 63)
 * - Data is ASCII encoded
 */

import { defineTestSuite } from "../../schema/test-schema.js";

// Test suite for DNS labels
export const dnsLabelEmptyTestSuite = defineTestSuite({
  name: "dns_label_empty",
  description: "DNS label - empty label (length 0)",

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
      }
    }
  },

  test_type: "Label",

  test_cases: [
    {
      description: "Empty label (root domain terminator)",
      bytes: [0x00], // length = 0
      value: ""
    }
  ]
});

export const dnsLabelSingleCharTestSuite = defineTestSuite({
  name: "dns_label_single_char",
  description: "DNS label - single character",

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
      }
    }
  },

  test_type: "Label",

  test_cases: [
    {
      description: "Single character label 'a'",
      bytes: [0x01, 0x61], // length=1, 'a'
      value: "a"
    },
    {
      description: "Single digit label '0'",
      bytes: [0x01, 0x30], // length=1, '0'
      value: "0"
    }
  ]
});

export const dnsLabelTypicalTestSuite = defineTestSuite({
  name: "dns_label_typical",
  description: "DNS label - typical labels",

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
      }
    }
  },

  test_type: "Label",

  test_cases: [
    {
      description: "Label 'www'",
      bytes: [0x03, 0x77, 0x77, 0x77], // length=3, "www"
      value: "www"
    },
    {
      description: "Label 'example'",
      bytes: [0x07, 0x65, 0x78, 0x61, 0x6D, 0x70, 0x6C, 0x65], // length=7, "example"
      value: "example"
    },
    {
      description: "Label 'com'",
      bytes: [0x03, 0x63, 0x6F, 0x6D], // length=3, "com"
      value: "com"
    }
  ]
});

export const dnsLabelWithHyphensTestSuite = defineTestSuite({
  name: "dns_label_with_hyphens",
  description: "DNS label - labels with hyphens",

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
      }
    }
  },

  test_type: "Label",

  test_cases: [
    {
      description: "Label with hyphen 'api-server'",
      bytes: [0x0A, 0x61, 0x70, 0x69, 0x2D, 0x73, 0x65, 0x72, 0x76, 0x65, 0x72], // length=10, "api-server"
      value: "api-server"
    },
    {
      description: "Label with multiple hyphens 'my-test-api'",
      bytes: [0x0B, 0x6D, 0x79, 0x2D, 0x74, 0x65, 0x73, 0x74, 0x2D, 0x61, 0x70, 0x69], // length=11, "my-test-api"
      value: "my-test-api"
    }
  ]
});

export const dnsLabelMaxLengthTestSuite = defineTestSuite({
  name: "dns_label_max_length",
  description: "DNS label - maximum length (63 bytes)",

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
      }
    }
  },

  test_type: "Label",

  test_cases: [
    {
      description: "Maximum length label (63 characters)",
      bytes: [
        0x3F, // length = 63 (max allowed)
        // 63 'a' characters
        0x61, 0x61, 0x61, 0x61, 0x61, 0x61, 0x61, 0x61,
        0x61, 0x61, 0x61, 0x61, 0x61, 0x61, 0x61, 0x61,
        0x61, 0x61, 0x61, 0x61, 0x61, 0x61, 0x61, 0x61,
        0x61, 0x61, 0x61, 0x61, 0x61, 0x61, 0x61, 0x61,
        0x61, 0x61, 0x61, 0x61, 0x61, 0x61, 0x61, 0x61,
        0x61, 0x61, 0x61, 0x61, 0x61, 0x61, 0x61, 0x61,
        0x61, 0x61, 0x61, 0x61, 0x61, 0x61, 0x61, 0x61,
        0x61, 0x61, 0x61, 0x61, 0x61, 0x61, 0x61
      ],
      value: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" // 63 a's
    }
  ]
});

export const dnsLabelMixedCaseTestSuite = defineTestSuite({
  name: "dns_label_mixed_case",
  description: "DNS label - mixed case (DNS is case-insensitive but preserves case)",

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
      }
    }
  },

  test_type: "Label",

  test_cases: [
    {
      description: "Mixed case label 'GitHub'",
      bytes: [0x06, 0x47, 0x69, 0x74, 0x48, 0x75, 0x62], // length=6, "GitHub"
      value: "GitHub"
    },
    {
      description: "Mixed case label 'StackOverflow'",
      bytes: [0x0D, 0x53, 0x74, 0x61, 0x63, 0x6B, 0x4F, 0x76, 0x65, 0x72, 0x66, 0x6C, 0x6F, 0x77], // length=13, "StackOverflow"
      value: "StackOverflow"
    }
  ]
});
