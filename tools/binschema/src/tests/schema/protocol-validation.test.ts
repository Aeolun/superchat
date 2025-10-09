/**
 * Protocol Schema Validation Tests
 *
 * Tests validation of protocol schemas against their binary schemas:
 * - discriminator_field exists in header type
 * - discriminator_field required when messages.length > 1
 * - header_size_field exists in header type
 * - payload types exist
 * - message codes are unique and valid hex
 */

import { validateProtocolSchemaWithTypes, ProtocolSchema } from "../../schema/protocol-schema";
import { BinarySchema } from "../../schema/binary-schema";

interface TestCase {
  description: string;
  protocolSchema: ProtocolSchema;
  binarySchema: BinarySchema;
  shouldPass: boolean;
  expectedErrors?: string[]; // Substrings that should appear in error messages
}

const TEST_CASES: TestCase[] = [
  // ==========================================================================
  // Valid Schemas
  // ==========================================================================

  {
    description: "Valid protocol with discriminator_field",
    shouldPass: true,
    protocolSchema: {
      protocol: {
        name: "Test Protocol",
        version: "1.0",
        types_schema: "test-types.json",
        header_format: "FrameHeader",
        discriminator_field: "message_type",
        messages: [
          { code: "0x01", name: "LOGIN", direction: "client_to_server", payload_type: "LoginPayload", description: "Login" },
          { code: "0x02", name: "LOGOUT", direction: "client_to_server", payload_type: "LogoutPayload", description: "Logout" },
        ]
      }
    },
    binarySchema: {
      types: {
        "FrameHeader": {
          sequence: [
            { name: "length", type: "uint32", endianness: "big_endian" as const },
            { name: "message_type", type: "uint8" },
          ]
        },
        "LoginPayload": {
          sequence: [
            { name: "username", type: "uint8" }
          ]
        },
        "LogoutPayload": {
          sequence: [
            { name: "reason", type: "uint8" }
          ]
        }
      }
    }
  },

  {
    description: "Valid protocol with header_size_field",
    shouldPass: true,
    protocolSchema: {
      protocol: {
        name: "Test Protocol",
        version: "1.0",
        types_schema: "test-types.json",
        header_format: "FrameHeader",
        header_size_field: "length",
        discriminator_field: "message_type",
        messages: [
          { code: "0x01", name: "MSG1", direction: "client_to_server", payload_type: "Payload1", description: "Message 1" },
          { code: "0x02", name: "MSG2", direction: "client_to_server", payload_type: "Payload2", description: "Message 2" },
        ]
      }
    },
    binarySchema: {
      types: {
        "FrameHeader": {
          sequence: [
            { name: "length", type: "uint32", endianness: "big_endian" as const },
            { name: "message_type", type: "uint8" },
          ]
        },
        "Payload1": { sequence: [{ name: "data", type: "uint8" }] },
        "Payload2": { sequence: [{ name: "data", type: "uint8" }] }
      }
    }
  },

  {
    description: "Valid protocol with single message (no discriminator required)",
    shouldPass: true,
    protocolSchema: {
      protocol: {
        name: "Test Protocol",
        version: "1.0",
        types_schema: "test-types.json",
        header_format: "FrameHeader",
        // No discriminator_field - OK for single message
        messages: [
          { code: "0x01", name: "ONLY_MESSAGE", direction: "client_to_server", payload_type: "OnlyPayload", description: "Only message" },
        ]
      }
    },
    binarySchema: {
      types: {
        "FrameHeader": {
          sequence: [
            { name: "length", type: "uint32", endianness: "big_endian" as const },
          ]
        },
        "OnlyPayload": { sequence: [{ name: "data", type: "uint8" }] }
      }
    }
  },

  // ==========================================================================
  // Invalid Schemas
  // ==========================================================================

  {
    description: "Missing discriminator_field with multiple messages",
    shouldPass: false,
    expectedErrors: ["discriminator_field", "required", "2 message"],
    protocolSchema: {
      protocol: {
        name: "Test Protocol",
        version: "1.0",
        types_schema: "test-types.json",
        header_format: "FrameHeader",
        // Missing discriminator_field!
        messages: [
          { code: "0x01", name: "MSG1", direction: "client_to_server", payload_type: "Payload1", description: "Message 1" },
          { code: "0x02", name: "MSG2", direction: "client_to_server", payload_type: "Payload2", description: "Message 2" },
        ]
      }
    },
    binarySchema: {
      types: {
        "FrameHeader": { sequence: [{ name: "length", type: "uint32", endianness: "big_endian" as const }] },
        "Payload1": { sequence: [{ name: "data", type: "uint8" }] },
        "Payload2": { sequence: [{ name: "data", type: "uint8" }] }
      }
    }
  },

  {
    description: "discriminator_field not found in header type",
    shouldPass: false,
    expectedErrors: ["Discriminator field", "message_type", "not found"],
    protocolSchema: {
      protocol: {
        name: "Test Protocol",
        version: "1.0",
        types_schema: "test-types.json",
        header_format: "FrameHeader",
        discriminator_field: "message_type", // Doesn't exist in header!
        messages: [
          { code: "0x01", name: "MSG1", direction: "client_to_server", payload_type: "Payload1", description: "Message 1" },
          { code: "0x02", name: "MSG2", direction: "client_to_server", payload_type: "Payload2", description: "Message 2" },
        ]
      }
    },
    binarySchema: {
      types: {
        "FrameHeader": {
          sequence: [
            { name: "length", type: "uint32", endianness: "big_endian" as const },
            // Missing message_type field!
          ]
        },
        "Payload1": { sequence: [{ name: "data", type: "uint8" }] },
        "Payload2": { sequence: [{ name: "data", type: "uint8" }] }
      }
    }
  },

  {
    description: "header_size_field not found in header type",
    shouldPass: false,
    expectedErrors: ["Header size field", "length", "not found"],
    protocolSchema: {
      protocol: {
        name: "Test Protocol",
        version: "1.0",
        types_schema: "test-types.json",
        header_format: "FrameHeader",
        header_size_field: "length", // Doesn't exist!
        discriminator_field: "message_type",
        messages: [
          { code: "0x01", name: "MSG1", direction: "client_to_server", payload_type: "Payload1", description: "Message 1" },
        ]
      }
    },
    binarySchema: {
      types: {
        "FrameHeader": {
          sequence: [
            { name: "message_type", type: "uint8" },
            // Missing length field!
          ]
        },
        "Payload1": { sequence: [{ name: "data", type: "uint8" }] }
      }
    }
  },

  {
    description: "header_format type not found",
    shouldPass: false,
    expectedErrors: ["Header format type", "MissingHeader", "not found"],
    protocolSchema: {
      protocol: {
        name: "Test Protocol",
        version: "1.0",
        types_schema: "test-types.json",
        header_format: "MissingHeader", // Doesn't exist!
        discriminator_field: "message_type",
        messages: [
          { code: "0x01", name: "MSG1", direction: "client_to_server", payload_type: "Payload1", description: "Message 1" },
        ]
      }
    },
    binarySchema: {
      types: {
        "Payload1": { sequence: [{ name: "data", type: "uint8" }] }
      }
    }
  },

  {
    description: "payload_type not found",
    shouldPass: false,
    expectedErrors: ["Payload type", "MissingPayload", "not found"],
    protocolSchema: {
      protocol: {
        name: "Test Protocol",
        version: "1.0",
        types_schema: "test-types.json",
        header_format: "FrameHeader",
        discriminator_field: "message_type",
        messages: [
          { code: "0x01", name: "MSG1", direction: "client_to_server", payload_type: "MissingPayload", description: "Message 1" },
        ]
      }
    },
    binarySchema: {
      types: {
        "FrameHeader": {
          sequence: [
            { name: "message_type", type: "uint8" }
          ]
        }
      }
    }
  },

  {
    description: "Invalid message code (not hex)",
    shouldPass: false,
    expectedErrors: ["code", "123", "not valid hex"],
    protocolSchema: {
      protocol: {
        name: "Test Protocol",
        version: "1.0",
        types_schema: "test-types.json",
        header_format: "FrameHeader",
        discriminator_field: "message_type",
        messages: [
          { code: "123", name: "MSG1", direction: "client_to_server", payload_type: "Payload1", description: "Message 1" }, // Not hex!
        ]
      }
    },
    binarySchema: {
      types: {
        "FrameHeader": { sequence: [{ name: "message_type", type: "uint8" }] },
        "Payload1": { sequence: [{ name: "data", type: "uint8" }] }
      }
    }
  },

  {
    description: "Duplicate message codes",
    shouldPass: false,
    expectedErrors: ["Duplicate", "0x01"],
    protocolSchema: {
      protocol: {
        name: "Test Protocol",
        version: "1.0",
        types_schema: "test-types.json",
        header_format: "FrameHeader",
        discriminator_field: "message_type",
        messages: [
          { code: "0x01", name: "MSG1", direction: "client_to_server", payload_type: "Payload1", description: "Message 1" },
          { code: "0x01", name: "MSG2", direction: "client_to_server", payload_type: "Payload2", description: "Message 2" }, // Duplicate!
        ]
      }
    },
    binarySchema: {
      types: {
        "FrameHeader": { sequence: [{ name: "message_type", type: "uint8" }] },
        "Payload1": { sequence: [{ name: "data", type: "uint8" }] },
        "Payload2": { sequence: [{ name: "data", type: "uint8" }] }
      }
    }
  },
];

/**
 * Run all protocol validation tests
 */
export function runProtocolValidationTests() {
  console.log("\n=== Protocol Schema Validation Tests ===\n");

  let passed = 0;
  let failed = 0;

  for (const tc of TEST_CASES) {
    const result = validateProtocolSchemaWithTypes(tc.protocolSchema, tc.binarySchema);

    if (tc.shouldPass && result.valid) {
      // Expected pass, got pass
      passed++;
    } else if (!tc.shouldPass && !result.valid) {
      // Expected fail, got fail - check error messages
      if (tc.expectedErrors) {
        let allErrorsFound = true;
        for (const expectedError of tc.expectedErrors) {
          const found = result.errors.some((err) =>
            err.message.toLowerCase().includes(expectedError.toLowerCase())
          );
          if (!found) {
            console.error(
              `✗ ${tc.description}\n  Expected error containing "${expectedError}" but got:\n  ${result.errors.map((e) => e.message).join("\n  ")}`
            );
            allErrorsFound = false;
            failed++;
            break;
          }
        }
        if (allErrorsFound) {
          passed++;
        }
      } else {
        passed++;
      }
    } else if (tc.shouldPass && !result.valid) {
      // Expected pass, got fail
      console.error(
        `✗ ${tc.description}\n  Expected to pass but got errors:\n  ${result.errors.map((e) => `${e.path}: ${e.message}`).join("\n  ")}`
      );
      failed++;
    } else {
      // Expected fail, got pass
      console.error(`✗ ${tc.description}\n  Expected to fail but passed validation`);
      failed++;
    }
  }

  console.log(`✓ ${passed} tests passed`);
  if (failed > 0) {
    console.log(`✗ ${failed} tests failed`);
    throw new Error(`${failed} protocol validation tests failed`);
  }

  console.log("\n✓ All protocol validation tests passed!\n");
}

// Run tests if executed directly
if (require.main === module) {
  runProtocolValidationTests();
}
