/**
 * Protocol-to-Binary Transformation Tests
 *
 * Tests the automatic transformation of protocol schemas into binary schemas
 * with discriminated unions. This transformation is syntactic sugar that:
 *
 * 1. Flattens header fields into the combined type
 * 2. Creates a discriminated union for payloads based on message_type
 * 3. Generates 'when' conditions from message codes
 * 4. Validates no field name collisions between header and payloads
 */

import { transformProtocolToBinary } from "../../schema/protocol-to-binary";
import { ProtocolSchema } from "../../schema/protocol-schema";
import { BinarySchema } from "../../schema/binary-schema";

interface TransformTestCase {
  description: string;
  protocolSchema: ProtocolSchema;
  binarySchema: BinarySchema; // Input binary schema with types
  expectedOutput: {
    // The auto-generated combined type
    combinedTypeName: string;
    combinedType: any; // What the combined type should look like
  };
  shouldSucceed: boolean;
  expectedError?: string; // If shouldSucceed=false, error substring
}

const TRANSFORM_TEST_CASES: TransformTestCase[] = [
  // ==========================================================================
  // Basic Transformation
  // ==========================================================================

  {
    description: "Simple protocol with 2 message types",
    shouldSucceed: true,
    protocolSchema: {
      protocol: {
        name: "Simple Protocol",
        version: "1.0",
        types_schema: "types.json",
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
            { name: "length", type: "uint32", endianness: "big_endian" },
            { name: "version", type: "uint8" },
            { name: "message_type", type: "uint8" },
            { name: "flags", type: "uint8" },
          ]
        },
        "LoginPayload": {
          sequence: [
            { name: "username", type: "string", kind: "length_prefixed", length_type: "uint8", encoding: "utf8" }
          ]
        },
        "LogoutPayload": {
          sequence: [
            { name: "reason", type: "uint8" }
          ]
        }
      }
    },
    expectedOutput: {
      combinedTypeName: "Frame", // Default combined type name
      combinedType: {
        sequence: [
          // Flattened header fields
          { name: "length", type: "uint32", endianness: "big_endian" },
          { name: "version", type: "uint8" },
          { name: "message_type", type: "uint8" },
          { name: "flags", type: "uint8" },
          // Auto-generated discriminated union
          {
            name: "payload",
            type: "discriminated_union",
            discriminator: {
              field: "message_type"
            },
            variants: [
              { when: "value == 0x01", type: "LoginPayload" },
              { when: "value == 0x02", type: "LogoutPayload" },
            ]
          }
        ],
        description: "Auto-generated combined frame type for Simple Protocol"
      }
    }
  },

  {
    description: "Protocol transformation with numeric message codes",
    shouldSucceed: true,
    protocolSchema: {
      protocol: {
        name: "Numeric Codes",
        version: "1.0",
        types_schema: "types.json",
        header_format: "FrameHeader",
        discriminator_field: "message_type",
        messages: [
          { code: 0x10, name: "PING", direction: "client_to_server", payload_type: "PingPayload", description: "Ping" },
          { code: 0x90, name: "PONG", direction: "server_to_client", payload_type: "PongPayload", description: "Pong" },
        ]
      }
    },
    binarySchema: {
      types: {
        "FrameHeader": {
          sequence: [
            { name: "length", type: "uint32", endianness: "big_endian" },
            { name: "message_type", type: "uint8" },
          ]
        },
        "PingPayload": { sequence: [{ name: "timestamp", type: "uint64" }] },
        "PongPayload": { sequence: [{ name: "timestamp", type: "uint64" }] }
      }
    },
    expectedOutput: {
      combinedTypeName: "Frame",
      combinedType: {
        sequence: [
          { name: "length", type: "uint32", endianness: "big_endian" },
          { name: "message_type", type: "uint8" },
          {
            name: "payload",
            type: "discriminated_union",
            discriminator: {
              field: "message_type"
            },
            variants: [
              { when: "value == 0x10", type: "PingPayload" },
              { when: "value == 0x90", type: "PongPayload" },
            ]
          }
        ],
        description: "Auto-generated combined frame type for Numeric Codes"
      }
    }
  },

  // ==========================================================================
  // Single Message (Degenerate Case)
  // ==========================================================================

  {
    description: "Protocol with single message (no discriminated union needed)",
    shouldSucceed: true,
    protocolSchema: {
      protocol: {
        name: "Single Message Protocol",
        version: "1.0",
        types_schema: "types.json",
        header_format: "FrameHeader",
        // No discriminator_field needed for single message
        messages: [
          { code: "0x01", name: "ONLY_MESSAGE", direction: "client_to_server", payload_type: "OnlyPayload", description: "Only message" },
        ]
      }
    },
    binarySchema: {
      types: {
        "FrameHeader": {
          sequence: [
            { name: "length", type: "uint32", endianness: "big_endian" },
            { name: "message_type", type: "uint8" },
          ]
        },
        "OnlyPayload": {
          sequence: [
            { name: "data", type: "uint8" }
          ]
        }
      }
    },
    expectedOutput: {
      combinedTypeName: "Frame",
      combinedType: {
        sequence: [
          // Flattened header fields
          { name: "length", type: "uint32", endianness: "big_endian" },
          { name: "message_type", type: "uint8" },
          // Direct payload reference (no discriminated union)
          { name: "payload", type: "OnlyPayload" }
        ],
        description: "Auto-generated combined frame type for Single Message Protocol"
      }
    }
  },

  // ==========================================================================
  // Complex Header
  // ==========================================================================

  {
    description: "Protocol with complex header (many fields)",
    shouldSucceed: true,
    protocolSchema: {
      protocol: {
        name: "Complex Protocol",
        version: "1.0",
        types_schema: "types.json",
        header_format: "ComplexHeader",
        discriminator_field: "msg_type",
        messages: [
          { code: "0x10", name: "MSG_A", direction: "client_to_server", payload_type: "PayloadA", description: "Message A" },
          { code: "0x20", name: "MSG_B", direction: "server_to_client", payload_type: "PayloadB", description: "Message B" },
          { code: "0x30", name: "MSG_C", direction: "bidirectional", payload_type: "PayloadC", description: "Message C" },
        ]
      }
    },
    binarySchema: {
      types: {
        "ComplexHeader": {
          sequence: [
            { name: "magic", type: "uint32", endianness: "big_endian" },
            { name: "length", type: "uint32", endianness: "big_endian" },
            { name: "version", type: "uint8" },
            { name: "msg_type", type: "uint8" },
            { name: "flags", type: "uint16", endianness: "little_endian" },
            { name: "sequence_number", type: "uint32", endianness: "big_endian" },
          ]
        },
        "PayloadA": { sequence: [{ name: "a", type: "uint8" }] },
        "PayloadB": { sequence: [{ name: "b", type: "uint16", endianness: "big_endian" }] },
        "PayloadC": { sequence: [{ name: "c", type: "uint32", endianness: "little_endian" }] },
      }
    },
    expectedOutput: {
      combinedTypeName: "Frame",
      combinedType: {
        sequence: [
          // All header fields flattened
          { name: "magic", type: "uint32", endianness: "big_endian" },
          { name: "length", type: "uint32", endianness: "big_endian" },
          { name: "version", type: "uint8" },
          { name: "msg_type", type: "uint8" },
          { name: "flags", type: "uint16", endianness: "little_endian" },
          { name: "sequence_number", type: "uint32", endianness: "big_endian" },
          // Discriminated union with 3 variants
          {
            name: "payload",
            type: "discriminated_union",
            discriminator: { field: "msg_type" },
            variants: [
              { when: "value == 0x10", type: "PayloadA" },
              { when: "value == 0x20", type: "PayloadB" },
              { when: "value == 0x30", type: "PayloadC" },
            ]
          }
        ],
        description: "Auto-generated combined frame type for Complex Protocol"
      }
    }
  },

  // ==========================================================================
  // Field Name Collision Detection
  // ==========================================================================

  {
    description: "Detect collision: header and payload both have 'data' field",
    shouldSucceed: false,
    expectedError: "Field name collision: 'data' exists in both header type 'FrameHeader' and payload type 'DataPayload'",
    protocolSchema: {
      protocol: {
        name: "Collision Protocol",
        version: "1.0",
        types_schema: "types.json",
        header_format: "FrameHeader",
        discriminator_field: "message_type",
        messages: [
          { code: "0x01", name: "DATA_MSG", direction: "client_to_server", payload_type: "DataPayload", description: "Data" },
        ]
      }
    },
    binarySchema: {
      types: {
        "FrameHeader": {
          sequence: [
            { name: "message_type", type: "uint8" },
            { name: "data", type: "uint8" }, // ← Collision!
          ]
        },
        "DataPayload": {
          sequence: [
            { name: "data", type: "uint16", endianness: "big_endian" }, // ← Collision!
          ]
        }
      }
    },
    expectedOutput: { combinedTypeName: "", combinedType: {} }
  },

  {
    description: "Detect collision: multiple payloads with same field name as header",
    shouldSucceed: false,
    expectedError: "Field name collision: 'length' exists in both header type 'FrameHeader' and payload type 'Payload1'",
    protocolSchema: {
      protocol: {
        name: "Multi Collision Protocol",
        version: "1.0",
        types_schema: "types.json",
        header_format: "FrameHeader",
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
            { name: "length", type: "uint32", endianness: "big_endian" },
            { name: "message_type", type: "uint8" },
          ]
        },
        "Payload1": {
          sequence: [
            { name: "length", type: "uint8" }, // ← Collision with header!
          ]
        },
        "Payload2": {
          sequence: [
            { name: "data", type: "uint8" }, // No collision
          ]
        }
      }
    },
    expectedOutput: { combinedTypeName: "", combinedType: {} }
  },

  // ==========================================================================
  // CRITICAL ERROR TESTS (from architect review)
  // ==========================================================================

  {
    description: "CRITICAL: Error when multi-message protocol missing discriminator_field",
    shouldSucceed: false,
    expectedError: "no discriminator_field specified",
    protocolSchema: {
      protocol: {
        name: "No Discriminator Protocol",
        version: "1.0",
        types_schema: "types.json",
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
        "FrameHeader": { sequence: [{ name: "length", type: "uint32", endianness: "big_endian" }] },
        "Payload1": { sequence: [{ name: "data", type: "uint8" }] },
        "Payload2": { sequence: [{ name: "data", type: "uint8" }] }
      }
    },
    expectedOutput: { combinedTypeName: "", combinedType: {} }
  },

  {
    description: "CRITICAL: Error when discriminator_field doesn't exist in header",
    shouldSucceed: false,
    expectedError: "Discriminator field 'msg_type' not found in header type 'FrameHeader'",
    protocolSchema: {
      protocol: {
        name: "Invalid Discriminator Protocol",
        version: "1.0",
        types_schema: "types.json",
        header_format: "FrameHeader",
        discriminator_field: "msg_type", // Field doesn't exist!
        messages: [
          { code: "0x01", name: "MSG1", direction: "client_to_server", payload_type: "Payload1", description: "Msg 1" },
        ]
      }
    },
    binarySchema: {
      types: {
        "FrameHeader": {
          sequence: [
            { name: "length", type: "uint32", endianness: "big_endian" },
            { name: "version", type: "uint8" },
            // msg_type missing!
          ]
        },
        "Payload1": { sequence: [{ name: "a", type: "uint8" }] }
      }
    },
    expectedOutput: { combinedTypeName: "", combinedType: {} }
  },

  {
    description: "CRITICAL: Error when header_format type doesn't exist",
    shouldSucceed: false,
    expectedError: "Header format type 'NonexistentHeader' not found in binary schema",
    protocolSchema: {
      protocol: {
        name: "Missing Header Protocol",
        version: "1.0",
        types_schema: "types.json",
        header_format: "NonexistentHeader", // Type doesn't exist!
        discriminator_field: "message_type",
        messages: [
          { code: "0x01", name: "MSG", direction: "client_to_server", payload_type: "Payload", description: "Message" },
        ]
      }
    },
    binarySchema: {
      types: {
        "Payload": { sequence: [{ name: "data", type: "uint8" }] }
        // NonexistentHeader missing!
      }
    },
    expectedOutput: { combinedTypeName: "", combinedType: {} }
  },

  {
    description: "CRITICAL: Error when payload_type doesn't exist",
    shouldSucceed: false,
    expectedError: "Payload type 'NonexistentPayload' for message 'MSG' not found in binary schema",
    protocolSchema: {
      protocol: {
        name: "Missing Payload Protocol",
        version: "1.0",
        types_schema: "types.json",
        header_format: "FrameHeader",
        discriminator_field: "message_type",
        messages: [
          { code: "0x01", name: "MSG", direction: "client_to_server", payload_type: "NonexistentPayload", description: "Message" },
        ]
      }
    },
    binarySchema: {
      types: {
        "FrameHeader": { sequence: [{ name: "message_type", type: "uint8" }] }
        // NonexistentPayload missing!
      }
    },
    expectedOutput: { combinedTypeName: "", combinedType: {} }
  },

  {
    description: "CRITICAL: Error when messages array is empty",
    shouldSucceed: false,
    expectedError: "Protocol must have at least one message",
    protocolSchema: {
      protocol: {
        name: "Empty Protocol",
        version: "1.0",
        types_schema: "types.json",
        header_format: "FrameHeader",
        messages: [] // Empty!
      }
    },
    binarySchema: {
      types: {
        "FrameHeader": { sequence: [{ name: "message_type", type: "uint8" }] }
      }
    },
    expectedOutput: { combinedTypeName: "", combinedType: {} }
  },

  {
    description: "CRITICAL: Error on duplicate message codes",
    shouldSucceed: false,
    expectedError: "Duplicate message code '0x01'",
    protocolSchema: {
      protocol: {
        name: "Duplicate Code Protocol",
        version: "1.0",
        types_schema: "types.json",
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
    },
    expectedOutput: { combinedTypeName: "", combinedType: {} }
  },

  {
    description: "CRITICAL: Error on invalid hex code (missing 0x prefix)",
    shouldSucceed: false,
    expectedError: "Message code '01' for message 'MSG' is not valid hex (must start with 0x)",
    protocolSchema: {
      protocol: {
        name: "Invalid Hex Protocol",
        version: "1.0",
        types_schema: "types.json",
        header_format: "FrameHeader",
        discriminator_field: "message_type",
        messages: [
          { code: "01", name: "MSG", direction: "client_to_server", payload_type: "Payload", description: "Message" }, // Missing 0x!
        ]
      }
    },
    binarySchema: {
      types: {
        "FrameHeader": { sequence: [{ name: "message_type", type: "uint8" }] },
        "Payload": { sequence: [{ name: "data", type: "uint8" }] }
      }
    },
    expectedOutput: { combinedTypeName: "", combinedType: {} }
  },

  {
    description: "CRITICAL: Error on invalid hex characters",
    shouldSucceed: false,
    expectedError: "Message code '0xGG' for message 'MSG' is not valid hex",
    protocolSchema: {
      protocol: {
        name: "Invalid Hex Chars Protocol",
        version: "1.0",
        types_schema: "types.json",
        header_format: "FrameHeader",
        discriminator_field: "message_type",
        messages: [
          { code: "0xGG", name: "MSG", direction: "client_to_server", payload_type: "Payload", description: "Message" }, // Invalid hex!
        ]
      }
    },
    binarySchema: {
      types: {
        "FrameHeader": { sequence: [{ name: "message_type", type: "uint8" }] },
        "Payload": { sequence: [{ name: "data", type: "uint8" }] }
      }
    },
    expectedOutput: { combinedTypeName: "", combinedType: {} }
  },

  // ==========================================================================
  // DESIGN AMBIGUITY TESTS (from architect review)
  // ==========================================================================

  {
    description: "DESIGN: Error when header has reserved 'payload' field name",
    shouldSucceed: false,
    expectedError: "Header type 'FrameHeader' cannot have a field named 'payload' (reserved for generated union)",
    protocolSchema: {
      protocol: {
        name: "Reserved Name Protocol",
        version: "1.0",
        types_schema: "types.json",
        header_format: "FrameHeader",
        discriminator_field: "message_type",
        messages: [
          { code: "0x01", name: "MSG", direction: "client_to_server", payload_type: "Payload", description: "Message" },
        ]
      }
    },
    binarySchema: {
      types: {
        "FrameHeader": {
          sequence: [
            { name: "message_type", type: "uint8" },
            { name: "payload", type: "uint8" }, // Reserved name collision!
          ]
        },
        "Payload": { sequence: [{ name: "data", type: "uint8" }] }
      }
    },
    expectedOutput: { combinedTypeName: "", combinedType: {} }
  },

  {
    description: "DESIGN: Error when combined type name already exists",
    shouldSucceed: false,
    expectedError: "Combined type name 'Frame' already exists in binary schema",
    protocolSchema: {
      protocol: {
        name: "Name Collision Protocol",
        version: "1.0",
        types_schema: "types.json",
        header_format: "FrameHeader",
        discriminator_field: "message_type",
        messages: [
          { code: "0x01", name: "MSG", direction: "client_to_server", payload_type: "Payload", description: "Message" },
        ]
      }
    },
    binarySchema: {
      types: {
        "FrameHeader": { sequence: [{ name: "message_type", type: "uint8" }] },
        "Payload": { sequence: [{ name: "data", type: "uint8" }] },
        "Frame": { sequence: [{ name: "existing", type: "uint8" }] } // Already exists!
      }
    },
    expectedOutput: { combinedTypeName: "", combinedType: {} }
  },

  // ==========================================================================
  // POSITIVE TEST CASES (from architect review)
  // ==========================================================================

  {
    description: "Multiple messages using same payload type (different codes)",
    shouldSucceed: true,
    protocolSchema: {
      protocol: {
        name: "Shared Payload Protocol",
        version: "1.0",
        types_schema: "types.json",
        header_format: "FrameHeader",
        discriminator_field: "message_type",
        messages: [
          { code: "0x01", name: "MSG1", direction: "client_to_server", payload_type: "SharedPayload", description: "Message 1" },
          { code: "0x02", name: "MSG2", direction: "client_to_server", payload_type: "SharedPayload", description: "Message 2" },
          { code: "0x03", name: "MSG3", direction: "server_to_client", payload_type: "SharedPayload", description: "Message 3" },
        ]
      }
    },
    binarySchema: {
      types: {
        "FrameHeader": { sequence: [{ name: "message_type", type: "uint8" }] },
        "SharedPayload": { sequence: [{ name: "data", type: "uint8" }] }
      }
    },
    expectedOutput: {
      combinedTypeName: "Frame",
      combinedType: {
        sequence: [
          { name: "message_type", type: "uint8" },
          {
            name: "payload",
            type: "discriminated_union",
            discriminator: { field: "message_type" },
            variants: [
              { when: "value == 0x01", type: "SharedPayload" },
              { when: "value == 0x02", type: "SharedPayload" }, // Same type, different code
              { when: "value == 0x03", type: "SharedPayload" },
            ]
          }
        ],
        description: "Auto-generated combined frame type for Shared Payload Protocol"
      }
    }
  },

  {
    description: "Header with nested struct field (flatten as type reference)",
    shouldSucceed: true,
    protocolSchema: {
      protocol: {
        name: "Nested Header Protocol",
        version: "1.0",
        types_schema: "types.json",
        header_format: "NestedHeader",
        discriminator_field: "message_type",
        messages: [
          { code: "0x01", name: "MSG", direction: "client_to_server", payload_type: "Payload", description: "Message" },
        ]
      }
    },
    binarySchema: {
      types: {
        "NestedHeader": {
          sequence: [
            { name: "length", type: "uint32", endianness: "big_endian" },
            { name: "metadata", type: "Metadata" }, // Nested type reference!
            { name: "message_type", type: "uint8" },
          ]
        },
        "Metadata": {
          sequence: [
            { name: "version", type: "uint8" },
            { name: "flags", type: "uint8" },
          ]
        },
        "Payload": { sequence: [{ name: "data", type: "uint8" }] }
      }
    },
    expectedOutput: {
      combinedTypeName: "Frame",
      combinedType: {
        sequence: [
          { name: "length", type: "uint32", endianness: "big_endian" },
          { name: "metadata", type: "Metadata" }, // Flattened as-is (type reference)
          { name: "message_type", type: "uint8" },
          {
            name: "payload",
            type: "discriminated_union",
            discriminator: { field: "message_type" },
            variants: [
              { when: "value == 0x01", type: "Payload" },
            ]
          }
        ],
        description: "Auto-generated combined frame type for Nested Header Protocol"
      }
    }
  },

  // ==========================================================================
  // Hex Code Formatting
  // ==========================================================================

  {
    description: "Preserve hex code formatting in 'when' conditions",
    shouldSucceed: true,
    protocolSchema: {
      protocol: {
        name: "Hex Format Protocol",
        version: "1.0",
        types_schema: "types.json",
        header_format: "FrameHeader",
        discriminator_field: "message_type",
        messages: [
          { code: "0x01", name: "MSG1", direction: "client_to_server", payload_type: "Payload1", description: "Msg 1" },
          { code: "0x0A", name: "MSG2", direction: "client_to_server", payload_type: "Payload2", description: "Msg 2" },
          { code: "0xFF", name: "MSG3", direction: "client_to_server", payload_type: "Payload3", description: "Msg 3" },
        ]
      }
    },
    binarySchema: {
      types: {
        "FrameHeader": { sequence: [{ name: "message_type", type: "uint8" }] },
        "Payload1": { sequence: [{ name: "a", type: "uint8" }] },
        "Payload2": { sequence: [{ name: "b", type: "uint8" }] },
        "Payload3": { sequence: [{ name: "c", type: "uint8" }] },
      }
    },
    expectedOutput: {
      combinedTypeName: "Frame",
      combinedType: {
        sequence: [
          { name: "message_type", type: "uint8" },
          {
            name: "payload",
            type: "discriminated_union",
            discriminator: { field: "message_type" },
            variants: [
              { when: "value == 0x01", type: "Payload1" }, // Lowercase hex
              { when: "value == 0x0A", type: "Payload2" }, // Uppercase hex preserved
              { when: "value == 0xFF", type: "Payload3" }, // Uppercase hex preserved
            ]
          }
        ],
        description: "Auto-generated combined frame type for Hex Format Protocol"
      }
    }
  },

  // ==========================================================================
  // Custom Combined Type Name
  // ==========================================================================

  {
    description: "Allow custom combined type name via options",
    shouldSucceed: true,
    protocolSchema: {
      protocol: {
        name: "Custom Name Protocol",
        version: "1.0",
        types_schema: "types.json",
        header_format: "FrameHeader",
        discriminator_field: "message_type",
        messages: [
          { code: "0x01", name: "MSG", direction: "client_to_server", payload_type: "Payload", description: "Message" },
        ]
      }
    },
    binarySchema: {
      types: {
        "FrameHeader": { sequence: [{ name: "message_type", type: "uint8" }] },
        "Payload": { sequence: [{ name: "data", type: "uint8" }] },
      }
    },
    expectedOutput: {
      combinedTypeName: "CustomFrame", // Custom name from options
      combinedType: {
        sequence: [
          { name: "message_type", type: "uint8" },
          {
            name: "payload",
            type: "discriminated_union",
            discriminator: { field: "message_type" },
            variants: [
              { when: "value == 0x01", type: "Payload" },
            ]
          }
        ],
        description: "Auto-generated combined frame type for Custom Name Protocol"
      }
    }
  },

  // ==========================================================================
  // No Header Format (Edge Case)
  // ==========================================================================

  {
    description: "Protocol without header_format (payload-only)",
    shouldSucceed: true,
    protocolSchema: {
      protocol: {
        name: "No Header Protocol",
        version: "1.0",
        types_schema: "types.json",
        // No header_format
        messages: [
          { code: "0x01", name: "MSG", direction: "client_to_server", payload_type: "Payload", description: "Message" },
        ]
      }
    },
    binarySchema: {
      types: {
        "Payload": { sequence: [{ name: "data", type: "uint8" }] },
      }
    },
    expectedOutput: {
      combinedTypeName: "Frame",
      combinedType: {
        sequence: [
          // No header fields, just payload
          { name: "payload", type: "Payload" }
        ],
        description: "Auto-generated combined frame type for No Header Protocol"
      }
    }
  },
];

/**
 * Run all protocol transformation tests
 */
export function runProtocolTransformationTests() {
  console.log("\n=== Protocol-to-Binary Transformation Tests ===\n");

  let passed = 0;
  let failed = 0;

  for (const tc of TRANSFORM_TEST_CASES) {
    try {
      // Custom combined type name for specific test
      const options = tc.expectedOutput.combinedTypeName !== "Frame"
        ? { combinedTypeName: tc.expectedOutput.combinedTypeName }
        : undefined;

      // Merge protocol schema and binary schema into unified schema
      // Map old field names to new ones for backward compatibility with tests
      const protocol = tc.protocolSchema.protocol;
      const unifiedSchema: BinarySchema = {
        ...tc.binarySchema,
        protocol: {
          ...protocol,
          header: (protocol as any).header_format || (protocol as any).header,
          discriminator: (protocol as any).discriminator_field || (protocol as any).discriminator
        }
      };
      const result = transformProtocolToBinary(unifiedSchema, options);

      if (!tc.shouldSucceed) {
        // Expected failure, but got success
        console.error(`✗ ${tc.description}\n  Expected transformation to fail but it succeeded`);
        failed++;
        continue;
      }

      // Verify combined type was generated
      const combinedTypeName = tc.expectedOutput.combinedTypeName;
      if (!result.types[combinedTypeName]) {
        console.error(`✗ ${tc.description}\n  Combined type '${combinedTypeName}' not found in output`);
        failed++;
        continue;
      }

      const actualCombinedType = result.types[combinedTypeName];
      const expectedCombinedType = tc.expectedOutput.combinedType;

      // Deep comparison of combined type structure
      const actualJson = JSON.stringify(actualCombinedType, null, 2);
      const expectedJson = JSON.stringify(expectedCombinedType, null, 2);

      if (actualJson !== expectedJson) {
        console.error(`✗ ${tc.description}\n  Combined type mismatch:\n  Expected:\n${expectedJson}\n\n  Actual:\n${actualJson}`);
        failed++;
        continue;
      }

      passed++;
    } catch (error: any) {
      if (!tc.shouldSucceed) {
        // Expected failure - check error message
        if (tc.expectedError && error.message.includes(tc.expectedError)) {
          passed++;
        } else {
          console.error(`✗ ${tc.description}\n  Expected error containing "${tc.expectedError}" but got: ${error.message}`);
          failed++;
        }
      } else {
        // Unexpected failure
        console.error(`✗ ${tc.description}\n  Unexpected error: ${error.message}`);
        failed++;
      }
    }
  }

  console.log(`✓ ${passed} tests passed`);
  if (failed > 0) {
    console.log(`✗ ${failed} tests failed`);
    throw new Error(`${failed} protocol transformation tests failed`);
  }

  console.log("\n✓ All protocol transformation tests passed!\n");
}

// Run tests if executed directly
if (require.main === module) {
  runProtocolTransformationTests();
}
