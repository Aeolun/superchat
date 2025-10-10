/**
 * DNS Domain Name Tests
 *
 * Tests DNS domain names as arrays of labels.
 * Domain names are sequences of length-prefixed labels terminated by a null label (length 0).
 *
 * Wire format: [label1][label2]...[labelN][0x00]
 * Each label: [length: uint8][data: ASCII bytes]
 * Terminator: 0x00 (zero-length label)
 *
 * Examples:
 * - "www.example.com" → [3]"www"[7]"example"[3]"com"[0]
 * - "example" → [7]"example"[0]
 * - "" (root) → [0]
 */

import { defineTestSuite } from "../../schema/test-schema.js";

// Test suite for single-label domain names
export const dnsDomainSingleLabelTestSuite = defineTestSuite({
  name: "dns_domain_single_label",
  description: "DNS domain name - single label",

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
      "DomainName": {
        type: "array",
        kind: "null_terminated",
        items: { type: "Label" }
      }
    }
  },

  test_type: "DomainName",

  test_cases: [
    {
      description: "Single label 'example'",
      bytes: [
        0x07, 0x65, 0x78, 0x61, 0x6D, 0x70, 0x6C, 0x65, // "example"
        0x00  // null terminator
      ],
      value: ["example"]
    },
    {
      description: "Single label 'localhost'",
      bytes: [
        0x09, 0x6C, 0x6F, 0x63, 0x61, 0x6C, 0x68, 0x6F, 0x73, 0x74, // "localhost"
        0x00  // null terminator
      ],
      value: ["localhost"]
    }
  ]
});

// Test suite for multi-label domain names
export const dnsDomainMultiLabelTestSuite = defineTestSuite({
  name: "dns_domain_multi_label",
  description: "DNS domain name - multiple labels",

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
      "DomainName": {
        type: "array",
        kind: "null_terminated",
        items: { type: "Label" }
      }
    }
  },

  test_type: "DomainName",

  test_cases: [
    {
      description: "Two labels 'example.com'",
      bytes: [
        0x07, 0x65, 0x78, 0x61, 0x6D, 0x70, 0x6C, 0x65, // "example"
        0x03, 0x63, 0x6F, 0x6D, // "com"
        0x00  // null terminator
      ],
      value: ["example", "com"]
    },
    {
      description: "Three labels 'www.example.com'",
      bytes: [
        0x03, 0x77, 0x77, 0x77, // "www"
        0x07, 0x65, 0x78, 0x61, 0x6D, 0x70, 0x6C, 0x65, // "example"
        0x03, 0x63, 0x6F, 0x6D, // "com"
        0x00  // null terminator
      ],
      value: ["www", "example", "com"]
    },
    {
      description: "Four labels 'api.v1.example.com'",
      bytes: [
        0x03, 0x61, 0x70, 0x69, // "api"
        0x02, 0x76, 0x31, // "v1"
        0x07, 0x65, 0x78, 0x61, 0x6D, 0x70, 0x6C, 0x65, // "example"
        0x03, 0x63, 0x6F, 0x6D, // "com"
        0x00  // null terminator
      ],
      value: ["api", "v1", "example", "com"]
    }
  ]
});

// Test suite for root domain
export const dnsDomainRootTestSuite = defineTestSuite({
  name: "dns_domain_root",
  description: "DNS domain name - root domain (empty)",

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
      "DomainName": {
        type: "array",
        kind: "null_terminated",
        items: { type: "Label" }
      }
    }
  },

  test_type: "DomainName",

  test_cases: [
    {
      description: "Root domain (just null terminator)",
      bytes: [0x00], // Just null terminator
      value: []
    }
  ]
});

// Test suite for special domain names
export const dnsDomainSpecialTestSuite = defineTestSuite({
  name: "dns_domain_special",
  description: "DNS domain name - special cases",

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
      "DomainName": {
        type: "array",
        kind: "null_terminated",
        items: { type: "Label" }
      }
    }
  },

  test_type: "DomainName",

  test_cases: [
    {
      description: "Domain with hyphen 'my-api.example.com'",
      bytes: [
        0x06, 0x6D, 0x79, 0x2D, 0x61, 0x70, 0x69, // "my-api"
        0x07, 0x65, 0x78, 0x61, 0x6D, 0x70, 0x6C, 0x65, // "example"
        0x03, 0x63, 0x6F, 0x6D, // "com"
        0x00  // null terminator
      ],
      value: ["my-api", "example", "com"]
    },
    {
      description: "Domain with numbers '1.2.3.4.in-addr.arpa' (PTR record format)",
      bytes: [
        0x01, 0x34, // "4"
        0x01, 0x33, // "3"
        0x01, 0x32, // "2"
        0x01, 0x31, // "1"
        0x07, 0x69, 0x6E, 0x2D, 0x61, 0x64, 0x64, 0x72, // "in-addr"
        0x04, 0x61, 0x72, 0x70, 0x61, // "arpa"
        0x00  // null terminator
      ],
      value: ["4", "3", "2", "1", "in-addr", "arpa"]
    },
    {
      description: "Long subdomain 'subdomain1.subdomain2.subdomain3.example.com'",
      bytes: [
        0x0A, 0x73, 0x75, 0x62, 0x64, 0x6F, 0x6D, 0x61, 0x69, 0x6E, 0x31, // "subdomain1"
        0x0A, 0x73, 0x75, 0x62, 0x64, 0x6F, 0x6D, 0x61, 0x69, 0x6E, 0x32, // "subdomain2"
        0x0A, 0x73, 0x75, 0x62, 0x64, 0x6F, 0x6D, 0x61, 0x69, 0x6E, 0x33, // "subdomain3"
        0x07, 0x65, 0x78, 0x61, 0x6D, 0x70, 0x6C, 0x65, // "example"
        0x03, 0x63, 0x6F, 0x6D, // "com"
        0x00  // null terminator
      ],
      value: ["subdomain1", "subdomain2", "subdomain3", "example", "com"]
    }
  ]
});
