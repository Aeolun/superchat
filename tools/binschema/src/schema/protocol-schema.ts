/**
 * Protocol Schema Definition
 *
 * Defines the metadata layer on top of BinarySchema for documenting
 * message exchange protocols (like SuperChat).
 */

export interface ProtocolSchema {
  protocol: {
    /** Protocol name (e.g., "SuperChat Protocol") */
    name: string;

    /** Protocol version (e.g., "1.0") */
    version: string;

    /** Path to BinarySchema file containing type definitions */
    types_schema: string;

    /** Overview/description of the protocol */
    description?: string;

    /** Reference to the header/frame format type */
    header_format?: string;

    /** Optional: Name of the header field that contains the payload size/length */
    header_size_field?: string;

    /** Optional: Name of the header field used to discriminate message types (e.g., "message_type") */
    discriminator_field?: string;

    /** Optional: Example header values to use in frame format example */
    header_example?: {
      decoded: any; // Decoded header values (e.g., {version: 1, type: 0x01, flags: 0})
    };

    /** Field-level descriptions (Type.field -> description) */
    field_descriptions?: Record<string, string>;

    /** Message definitions */
    messages: ProtocolMessage[];

    /** Optional: Group messages into categories */
    message_groups?: MessageGroup[];

    /** Optional: Define constants/enums used in the protocol */
    constants?: Record<string, ProtocolConstant>;

    /** Optional: General notes about the protocol */
    notes?: string[];
  };
}

export interface ProtocolMessage {
  /** Message type code (e.g., "0x01", "0x81") */
  code: string;

  /** Message name (e.g., "AUTH_REQUEST") */
  name: string;

  /** Message direction */
  direction: "client_to_server" | "server_to_client" | "bidirectional";

  /** Type name from BinarySchema used for the payload */
  payload_type: string;

  /** Short description of the message */
  description: string;

  /** Optional: Longer notes about usage, edge cases, etc. */
  notes?: string | string[];

  /** Optional: Wire format example (hex bytes) */
  example?: {
    description: string;
    bytes: number[];
    decoded?: any; // The decoded value
  };

  /** Optional: Since which protocol version */
  since?: string;

  /** Optional: Deprecated in which version */
  deprecated?: string;
}

export interface MessageGroup {
  /** Group name (e.g., "Authentication", "Messaging") */
  name: string;

  /** Message codes in this group */
  messages: string[];

  /** Optional description */
  description?: string;
}

export interface ProtocolConstant {
  /** Constant value */
  value: number | string;

  /** Description */
  description: string;

  /** Optional: Associated type */
  type?: string;
}

/**
 * Simple type guard for ProtocolSchema structure
 */
export function validateProtocolSchema(schema: any): schema is ProtocolSchema {
  if (!schema.protocol) return false;
  if (!schema.protocol.name) return false;
  if (!schema.protocol.version) return false;
  if (!schema.protocol.types_schema) return false;
  if (!Array.isArray(schema.protocol.messages)) return false;

  // Validate each message
  for (const msg of schema.protocol.messages) {
    if (!msg.code || !msg.name || !msg.direction || !msg.payload_type) {
      return false;
    }
  }

  return true;
}

/**
 * Protocol validation error
 */
export interface ProtocolValidationError {
  path: string;
  message: string;
}

/**
 * Protocol validation result
 */
export interface ProtocolValidationResult {
  valid: boolean;
  errors: ProtocolValidationError[];
}

/**
 * Validate a ProtocolSchema against its referenced BinarySchema
 *
 * Checks:
 * - header_format type exists
 * - header_size_field exists in header type
 * - discriminator_field exists in header type
 * - All payload_type references exist
 * - Message codes are unique and valid hex
 */
export function validateProtocolSchemaWithTypes(
  protocolSchema: ProtocolSchema,
  binarySchema: any // BinarySchema from binary-schema.ts
): ProtocolValidationResult {
  const errors: ProtocolValidationError[] = [];
  const protocol = protocolSchema.protocol;

  // Validate discriminator_field is present when needed
  if (protocol.messages.length > 1 && !protocol.discriminator_field) {
    errors.push({
      path: "protocol.discriminator_field",
      message: `Protocol has ${protocol.messages.length} message types but no discriminator_field specified (required when messages.length > 1)`
    });
  }

  // Validate header_format exists
  if (protocol.header_format) {
    if (!binarySchema.types[protocol.header_format]) {
      errors.push({
        path: "protocol.header_format",
        message: `Header format type '${protocol.header_format}' not found in binary schema`
      });
    } else {
      const headerType = binarySchema.types[protocol.header_format];

      // Get fields from header type
      const headerFields = getFieldsFromType(headerType);
      const headerFieldNames = headerFields.map((f: any) => f.name);

      // Validate header_size_field exists in header
      if (protocol.header_size_field) {
        if (!headerFieldNames.includes(protocol.header_size_field)) {
          errors.push({
            path: "protocol.header_size_field",
            message: `Header size field '${protocol.header_size_field}' not found in header type '${protocol.header_format}' (available fields: ${headerFieldNames.join(", ")})`
          });
        }
      }

      // Validate discriminator_field exists in header
      if (protocol.discriminator_field) {
        if (!headerFieldNames.includes(protocol.discriminator_field)) {
          errors.push({
            path: "protocol.discriminator_field",
            message: `Discriminator field '${protocol.discriminator_field}' not found in header type '${protocol.header_format}' (available fields: ${headerFieldNames.join(", ")})`
          });
        }
      }
    }
  }

  // Validate all payload_type references exist
  const messageCodes = new Set<string>();
  for (let i = 0; i < protocol.messages.length; i++) {
    const msg = protocol.messages[i];

    // Check payload type exists
    if (!binarySchema.types[msg.payload_type]) {
      errors.push({
        path: `protocol.messages[${i}].payload_type`,
        message: `Payload type '${msg.payload_type}' for message '${msg.name}' not found in binary schema`
      });
    }

    // Check message code is valid hex
    if (!/^0x[0-9A-Fa-f]+$/.test(msg.code)) {
      errors.push({
        path: `protocol.messages[${i}].code`,
        message: `Message code '${msg.code}' for message '${msg.name}' is not valid hex (must start with 0x)`
      });
    }

    // Check for duplicate message codes
    if (messageCodes.has(msg.code)) {
      errors.push({
        path: `protocol.messages[${i}].code`,
        message: `Duplicate message code '${msg.code}' for message '${msg.name}'`
      });
    }
    messageCodes.add(msg.code);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Helper: Get fields from a type definition (handles both 'sequence' and 'fields')
 */
function getFieldsFromType(typeDef: any): any[] {
  if (typeDef.sequence) return typeDef.sequence;
  if (typeDef.fields) return typeDef.fields;
  return [];
}
