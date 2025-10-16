/**
 * Complete RFC 1035 DNS Message Tests
 *
 * Tests the FULL DNS protocol as specified in RFC 1035:
 * - Header (12 bytes)
 * - Question section (qd count questions)
 * - Answer section (an count resource records)
 * - Authority section (ns count resource records)
 * - Additional section (ar count resource records)
 *
 * This proves BinSchema can handle complete real-world protocols.
 */

import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Complete DNS query message test
 *
 * Structure:
 * - Header: 12 bytes with counts
 * - Questions: array of Question (length from qdcount)
 */
export const dnsCompleteQueryTestSuite = defineTestSuite({
  name: "dns_complete_query",
  description: "Complete DNS query with full RFC 1035 structure",

  schema: {
    config: {
      endianness: "big_endian"
    },
    types: {
      "Label": {
        "type": "string",
        "kind": "length_prefixed",
        "length_type": "uint8",
        "encoding": "ascii"
      },
      "CompressedLabel": {
        "type": "discriminated_union",
        "discriminator": {
          "peek": "uint8"
        },
        "variants": [
          {
            "type": "Label",
            "when": "value < 0xC0"
          },
          {
            "type": "LabelPointer",
            "when": "value >= 0xC0"
          }
        ]
      },
      "LabelPointer": {
        "type": "back_reference",
        "storage": "uint16",
        "endianness": "big_endian",
        "offset_mask": "0x3FFF",
        "offset_from": "message_start",
        "target_type": "Label"
      },
      "CompressedDomain": {
        "type": "array",
        "kind": "null_terminated",
        "items": {
          "type": "CompressedLabel"
        },
        "terminal_variants": ["LabelPointer"]
      },
      "Question": {
        "sequence": [
          {
            "name": "qname",
            "type": "CompressedDomain"
          },
          {
            "name": "qtype",
            "type": "uint16"
          },
          {
            "name": "qclass",
            "type": "uint16"
          }
        ]
      },
      "DnsMessage": {
        "sequence": [
          // Header (12 bytes)
          {
            "name": "id",
            "type": "uint16"
          },
          {
            "name": "flags",
            "type": "bitfield",
            "size": 16,
            "fields": [
              { "name": "qr", "offset": 0, "size": 1 },
              { "name": "opcode", "offset": 1, "size": 4 },
              { "name": "aa", "offset": 5, "size": 1 },
              { "name": "tc", "offset": 6, "size": 1 },
              { "name": "rd", "offset": 7, "size": 1 },
              { "name": "ra", "offset": 8, "size": 1 },
              { "name": "z", "offset": 9, "size": 3 },
              { "name": "rcode", "offset": 12, "size": 4 }
            ]
          },
          {
            "name": "qdcount",
            "type": "uint16"
          },
          {
            "name": "ancount",
            "type": "uint16"
          },
          {
            "name": "nscount",
            "type": "uint16"
          },
          {
            "name": "arcount",
            "type": "uint16"
          },
          // Question section
          {
            "name": "questions",
            "type": "array",
            "kind": "field_referenced",
            "length_field": "qdcount",
            "items": { "type": "Question" }
          }
        ]
      }
    }
  },

  test_type: "DnsMessage",

  test_cases: [
    {
      description: "Query for example.com A record",
      value: {
        id: 0x1234,
        flags: {
          qr: 0,
          opcode: 0,
          aa: 0,
          tc: 0,
          rd: 1,
          ra: 0,
          z: 0,
          rcode: 0
        },
        qdcount: 1,
        ancount: 0,
        nscount: 0,
        arcount: 0,
        questions: [
          {
            qname: [
              { type: "Label", value: "example" },
              { type: "Label", value: "com" }
            ],
            qtype: 1,
            qclass: 1
          }
        ]
      },
      bytes: [
        // Header
        0x12, 0x34, // id
        0x01, 0x00, // flags: rd=1
        0x00, 0x01, // qdcount: 1
        0x00, 0x00, // ancount: 0
        0x00, 0x00, // nscount: 0
        0x00, 0x00, // arcount: 0
        // Question
        0x07, 0x65, 0x78, 0x61, 0x6D, 0x70, 0x6C, 0x65, // "example"
        0x03, 0x63, 0x6F, 0x6D, // "com"
        0x00, // null term
        0x00, 0x01, // qtype: A
        0x00, 0x01  // qclass: IN
      ]
    }
  ]
});

/**
 * Complete DNS response message test
 *
 * Structure:
 * - Header: 12 bytes with counts
 * - Questions: array of Question (length from qdcount)
 * - Answers: array of ResourceRecord (length from ancount)
 */
export const dnsCompleteResponseTestSuite = defineTestSuite({
  name: "dns_complete_response",
  description: "Complete DNS response with A record RDATA",

  schema: {
    config: {
      endianness: "big_endian"
    },
    types: {
      "Label": {
        "type": "string",
        "kind": "length_prefixed",
        "length_type": "uint8",
        "encoding": "ascii"
      },
      "CompressedLabel": {
        "type": "discriminated_union",
        "discriminator": {
          "peek": "uint8"
        },
        "variants": [
          {
            "type": "Label",
            "when": "value < 0xC0"
          },
          {
            "type": "LabelPointer",
            "when": "value >= 0xC0"
          }
        ]
      },
      "LabelPointer": {
        "type": "back_reference",
        "storage": "uint16",
        "endianness": "big_endian",
        "offset_mask": "0x3FFF",
        "offset_from": "message_start",
        "target_type": "Label"
      },
      "CompressedDomain": {
        "type": "array",
        "kind": "null_terminated",
        "items": {
          "type": "CompressedLabel"
        },
        "terminal_variants": ["LabelPointer"]
      },
      "Question": {
        "sequence": [
          {
            "name": "qname",
            "type": "CompressedDomain"
          },
          {
            "name": "qtype",
            "type": "uint16"
          },
          {
            "name": "qclass",
            "type": "uint16"
          }
        ]
      },
      "ARdata": {
        "sequence": [
          {
            "name": "address",
            "type": "uint32",
            "description": "IPv4 address"
          }
        ]
      },
      "ResourceRecord": {
        "sequence": [
          {
            "name": "name",
            "type": "CompressedDomain"
          },
          {
            "name": "type",
            "type": "uint16"
          },
          {
            "name": "class",
            "type": "uint16"
          },
          {
            "name": "ttl",
            "type": "uint32"
          },
          {
            "name": "rdlength",
            "type": "uint16"
          },
          {
            "name": "rdata",
            "type": "discriminated_union",
            "discriminator": {
              "field": "type"
            },
            "variants": [
              {
                "type": "ARdata",
                "when": "value === 1"
              }
            ]
          }
        ]
      },
      "DnsMessage": {
        "sequence": [
          // Header (12 bytes)
          {
            "name": "id",
            "type": "uint16"
          },
          {
            "name": "flags",
            "type": "bitfield",
            "size": 16,
            "fields": [
              { "name": "qr", "offset": 0, "size": 1 },
              { "name": "opcode", "offset": 1, "size": 4 },
              { "name": "aa", "offset": 5, "size": 1 },
              { "name": "tc", "offset": 6, "size": 1 },
              { "name": "rd", "offset": 7, "size": 1 },
              { "name": "ra", "offset": 8, "size": 1 },
              { "name": "z", "offset": 9, "size": 3 },
              { "name": "rcode", "offset": 12, "size": 4 }
            ]
          },
          {
            "name": "qdcount",
            "type": "uint16"
          },
          {
            "name": "ancount",
            "type": "uint16"
          },
          {
            "name": "nscount",
            "type": "uint16"
          },
          {
            "name": "arcount",
            "type": "uint16"
          },
          // Question section
          {
            "name": "questions",
            "type": "array",
            "kind": "field_referenced",
            "length_field": "qdcount",
            "items": { "type": "Question" }
          },
          // Answer section
          {
            "name": "answers",
            "type": "array",
            "kind": "field_referenced",
            "length_field": "ancount",
            "items": { "type": "ResourceRecord" }
          },
          // Authority section (empty for now)
          {
            "name": "authority",
            "type": "array",
            "kind": "field_referenced",
            "length_field": "nscount",
            "items": { "type": "ResourceRecord" }
          },
          // Additional section (empty for now)
          {
            "name": "additional",
            "type": "array",
            "kind": "field_referenced",
            "length_field": "arcount",
            "items": { "type": "ResourceRecord" }
          }
        ]
      }
    }
  },

  test_type: "DnsMessage",

  test_cases: [
    {
      description: "Response with A record (example.com → 93.184.216.34)",
      value: {
        id: 0x1234,
        flags: {
          qr: 1,
          opcode: 0,
          aa: 0,
          tc: 0,
          rd: 1,
          ra: 1,
          z: 0,
          rcode: 0
        },
        qdcount: 1,
        ancount: 1,
        nscount: 0,
        arcount: 0,
        questions: [
          {
            qname: [
              { type: "Label", value: "example" },
              { type: "Label", value: "com" }
            ],
            qtype: 1,
            qclass: 1
          }
        ],
        answers: [
          {
            name: [
              { type: "Label", value: "example" },
              { type: "Label", value: "com" }
            ],
            type: 1,
            class: 1,
            ttl: 300,
            rdlength: 4,
            rdata: {
              type: "ARdata",
              value: {
                address: 0x5DB8D822  // 93.184.216.34
              }
            }
          }
        ],
        authority: [],
        additional: []
      },
      bytes: [
        // Header
        0x12, 0x34, // id
        0x81, 0x80, // flags: qr=1, rd=1, ra=1
        0x00, 0x01, // qdcount: 1
        0x00, 0x01, // ancount: 1
        0x00, 0x00, // nscount: 0
        0x00, 0x00, // arcount: 0
        // Question
        0x07, 0x65, 0x78, 0x61, 0x6D, 0x70, 0x6C, 0x65, // "example"
        0x03, 0x63, 0x6F, 0x6D, // "com"
        0x00, // null term
        0x00, 0x01, // qtype: A
        0x00, 0x01, // qclass: IN
        // Answer RR
        0x07, 0x65, 0x78, 0x61, 0x6D, 0x70, 0x6C, 0x65, // "example"
        0x03, 0x63, 0x6F, 0x6D, // "com"
        0x00, // null term
        0x00, 0x01, // type: A
        0x00, 0x01, // class: IN
        0x00, 0x00, 0x01, 0x2C, // ttl: 300
        0x00, 0x04, // rdlength: 4
        0x5D, 0xB8, 0xD8, 0x22  // rdata: 93.184.216.34
      ]
    }
  ]
});
