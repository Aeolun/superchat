/**
 * Protocol-to-Binary Schema Transformation
 *
 * Automatically transforms protocol schemas (syntactic sugar) into binary schemas
 * with discriminated unions. This simplifies protocol definitions by:
 *
 * 1. Flattening header fields into a combined frame type
 * 2. Auto-generating discriminated unions for message payloads
 * 3. Validating field name uniqueness across header and payloads
 * 4. Generating 'when' conditions from message codes
 */

import { ProtocolSchema, validateProtocolSchemaWithTypes } from "./protocol-schema";
import { BinarySchema } from "./binary-schema";

export interface ProtocolTransformOptions {
  /** Custom name for the generated combined type (default: "Frame") */
  combinedTypeName?: string;
}

/**
 * Transform a protocol schema into a binary schema with discriminated unions
 *
 * @param protocolSchema - The protocol schema to transform
 * @param binarySchema - The binary schema containing type definitions
 * @param options - Optional transformation options
 * @returns Binary schema with the combined frame type added
 */
export function transformProtocolToBinary(
  protocolSchema: ProtocolSchema,
  binarySchema: BinarySchema,
  options?: ProtocolTransformOptions
): BinarySchema {
  const protocol = protocolSchema.protocol;
  const combinedTypeName = options?.combinedTypeName || "Frame";

  // 1. Validate protocol has at least one message
  if (protocol.messages.length === 0) {
    throw new Error("Protocol must have at least one message");
  }

  // 2. Validate protocol schema against binary schema (discriminator_field, types exist, etc.)
  const validationResult = validateProtocolSchemaWithTypes(protocolSchema, binarySchema);
  if (!validationResult.valid) {
    // Throw first error for simplicity (tests expect specific error messages)
    throw new Error(validationResult.errors[0].message);
  }

  // 3. Check for duplicate message codes
  const messageCodes = new Set<string>();
  for (const msg of protocol.messages) {
    if (messageCodes.has(msg.code)) {
      throw new Error(`Duplicate message code '${msg.code}' for message '${msg.name}'`);
    }
    messageCodes.add(msg.code);
  }

  // 4. Validate message codes are valid hex
  for (const msg of protocol.messages) {
    if (!/^0x[0-9A-Fa-f]+$/.test(msg.code)) {
      throw new Error(`Message code '${msg.code}' for message '${msg.name}' is not valid hex (must start with 0x)`);
    }
  }

  // 5. Check that combined type name doesn't already exist
  if (binarySchema.types[combinedTypeName]) {
    throw new Error(`Combined type name '${combinedTypeName}' already exists in binary schema`);
  }

  // 6. Get header fields (if header_format exists)
  let headerFields: any[] = [];
  if (protocol.header_format) {
    const headerType = binarySchema.types[protocol.header_format];
    headerFields = getFieldsFromType(headerType);

    // Check that header doesn't have reserved 'payload' field name
    const hasPayloadField = headerFields.some((f: any) => f.name === "payload");
    if (hasPayloadField) {
      throw new Error(`Header type '${protocol.header_format}' cannot have a field named 'payload' (reserved for generated union)`);
    }
  }

  // 7. Check for field name collisions between header and payloads
  const headerFieldNames = new Set(headerFields.map((f: any) => f.name));
  for (const msg of protocol.messages) {
    const payloadType = binarySchema.types[msg.payload_type];
    const payloadFields = getFieldsFromType(payloadType);

    for (const payloadField of payloadFields) {
      if (headerFieldNames.has(payloadField.name)) {
        throw new Error(
          `Field name collision: '${payloadField.name}' exists in both header type '${protocol.header_format}' and payload type '${msg.payload_type}'`
        );
      }
    }
  }

  // 8. Build combined type
  const combinedFields: any[] = [...headerFields];

  // 9. Add payload field (discriminated union or direct reference)
  if (protocol.messages.length === 1 && !protocol.discriminator_field) {
    // Single message without discriminator: direct type reference
    combinedFields.push({
      name: "payload",
      type: protocol.messages[0].payload_type
    });
  } else {
    // Multiple messages OR single message with discriminator: use discriminated union
    const variants = protocol.messages.map((msg) => ({
      when: `value == ${msg.code}`,
      type: msg.payload_type
    }));

    combinedFields.push({
      name: "payload",
      type: "discriminated_union",
      discriminator: {
        field: protocol.discriminator_field!
      },
      variants
    });
  }

  // 10. Create combined type
  const combinedType = {
    sequence: combinedFields,
    description: `Auto-generated combined frame type for ${protocol.name}`
  };

  // 11. Return binary schema with combined type added
  return {
    ...binarySchema,
    types: {
      ...binarySchema.types,
      [combinedTypeName]: combinedType
    }
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
