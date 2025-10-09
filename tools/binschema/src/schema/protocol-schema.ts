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
  notes?: string;

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
 * Validate a ProtocolSchema
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
