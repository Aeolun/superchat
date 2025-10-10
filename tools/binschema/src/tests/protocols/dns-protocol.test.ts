/**
 * DNS Protocol Frame Tests
 *
 * Tests complete DNS messages (header + payload) with compression pointers.
 * Unlike dns-compression.test.ts which tests standalone CompressedDomain encoding,
 * these tests verify that compression works correctly in the context of a full
 * DNS message with a 12-byte header.
 *
 * Key difference: Pointer offsets are relative to message start (offset 0 = header start),
 * not domain start. For example, a pointer to a domain starting at byte 12 (after header)
 * would be encoded as 0xC00C.
 *
 * Wire format:
 * [DnsHeader: 12 bytes]
 * [Payload: DnsQuery or DnsResponse with CompressedDomain fields]
 *
 * Header structure (12 bytes - RFC 1035):
 * - id (2B): transaction ID
 * - flags (2B): bitfield with QR, Opcode, AA, TC, RD, RA, Z, RCODE
 * - qdcount (2B): question count
 * - ancount (2B): answer count
 * - nscount (2B): authority count
 * - arcount (2B): additional count
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { transformProtocolToBinary } from "../../schema/protocol-to-binary.js";
import type { BinarySchema } from "../../schema/binary-schema.js";
import type { ProtocolSchema } from "../../schema/protocol-schema.js";

// Load protocol schema and types
const protocolSchemaPath = resolve(__dirname, "dns-protocol-schema.json");
const typesSchemaPath = resolve(__dirname, "dns-protocol-types.json");

const protocolSchemaJson = JSON.parse(readFileSync(protocolSchemaPath, "utf-8")) as ProtocolSchema;
const binarySchema = JSON.parse(readFileSync(typesSchemaPath, "utf-8")) as BinarySchema;

// Transform protocol to binary schema (creates Frame type)
const combinedSchema = transformProtocolToBinary(protocolSchemaJson, binarySchema, {
  combinedTypeName: "DnsFrame"
});

// Re-export for test runner
export const dnsProtocolQueryTestSuite = {
  name: "dns_protocol_query",
  description: "DNS protocol - Query messages with compression",
  schema: combinedSchema,
  test_type: "DnsFrame",
  test_cases: [
    {
      description: "Simple query for 'example.com' (no compression)",
      bytes: [
        // Header (12 bytes - RFC 1035 compliant)
        0x12, 0x34, // id: 0x1234
        0x01, 0x00, // flags: 0x0100 (QR=0, Opcode=0, AA=0, TC=0, RD=1, RA=0, Z=0, RCODE=0)
        0x00, 0x01, // qdcount: 1
        0x00, 0x00, // ancount: 0
        0x00, 0x00, // nscount: 0
        0x00, 0x00, // arcount: 0

        // Payload: DnsQuery (offset 12)
        // Question 1: qname + qtype + qclass
        0x07, 0x65, 0x78, 0x61, 0x6D, 0x70, 0x6C, 0x65, // offset 12: "example"
        0x03, 0x63, 0x6F, 0x6D, // offset 20: "com"
        0x00, // null terminator

        // qtype: 1 (A record)
        0x00, 0x01,

        // qclass: 1 (IN)
        0x00, 0x01
      ],
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
        payload: {
          type: "DnsQuery",
          value: {
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
          }
        }
      }
    }
  ]
};

export const dnsProtocolResponseTestSuite = {
  name: "dns_protocol_response",
  description: "DNS protocol - Response messages with complete A record",
  schema: combinedSchema,
  test_type: "DnsFrame",
  test_cases: [
    {
      description: "Complete response with A record (example.com → 93.184.216.34)",
      bytes: [
        // Header (12 bytes - RFC 1035 compliant)
        0x12, 0x34, // id: 0x1234
        0x81, 0x80, // flags: 0x8180 (QR=1, Opcode=0, AA=0, TC=0, RD=1, RA=1, Z=0, RCODE=0)
        0x00, 0x01, // qdcount: 1
        0x00, 0x01, // ancount: 1
        0x00, 0x00, // nscount: 0
        0x00, 0x00, // arcount: 0

        // Payload: DnsResponse (offset 12)
        // Question section (qdcount=1)
        // Question 1: qname + qtype + qclass
        0x07, 0x65, 0x78, 0x61, 0x6D, 0x70, 0x6C, 0x65, // offset 12: "example"
        0x03, 0x63, 0x6F, 0x6D, // offset 20: "com"
        0x00, // null terminator

        // qtype: 1 (A record)
        0x00, 0x01,

        // qclass: 1 (IN)
        0x00, 0x01,

        // Answer section (ancount=1)
        // ResourceRecord 1: name + type + class + ttl + rdlength + rdata
        // name: "example.com" (same as question, could use pointer but we'll write it out)
        0x07, 0x65, 0x78, 0x61, 0x6D, 0x70, 0x6C, 0x65, // "example"
        0x03, 0x63, 0x6F, 0x6D, // "com"
        0x00, // null terminator

        // type: 1 (A record)
        0x00, 0x01,

        // class: 1 (IN)
        0x00, 0x01,

        // ttl: 300 seconds
        0x00, 0x00, 0x01, 0x2C,

        // rdlength: 4 bytes (IPv4 address)
        0x00, 0x04,

        // rdata: 93.184.216.34 (example.com's actual IP)
        0x5D, 0xB8, 0xD8, 0x22
      ],
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
        payload: {
          type: "DnsResponse",
          value: {
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
          }
        }
      }
    }
  ]
};
