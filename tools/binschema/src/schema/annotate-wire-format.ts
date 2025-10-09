/**
 * Wire format annotation utility
 *
 * Parses a byte array according to a schema and generates human-readable
 * annotations describing what each byte range represents.
 */

import { BinarySchema } from './binary-schema.js';

export interface Annotation {
  offset: number;
  length: number;
  description: string;
  bitfields?: Array<{
    name: string;
    value: any;
    bitStart: number;
    bitEnd: number;
  }>;
}

/**
 * Annotate a byte array according to a schema type
 *
 * @param bytes - The raw byte array
 * @param typeName - The type name to parse as (e.g., "AuthRequest")
 * @param schema - The binary schema definition
 * @param decoded - The decoded values (for context in descriptions)
 * @returns Array of annotations describing each byte range
 */
export function annotateWireFormat(
  bytes: number[],
  typeName: string,
  schema: BinarySchema,
  decoded: any
): Annotation[] {
  const annotations: Annotation[] = [];
  let offset = 0;

  // Find the type definition
  const typeDef = schema.types[typeName];
  if (!typeDef) {
    throw new Error(`Type "${typeName}" not found in schema`);
  }

  // Check if it's a sequence (struct)
  if ('sequence' in typeDef && Array.isArray(typeDef.sequence)) {
    let i = 0;
    while (i < typeDef.sequence.length) {
      const field = typeDef.sequence[i];

      // Check if this is a bit field
      if (field.type === 'bit' && field.size !== undefined) {
        // Collect consecutive bit fields
        const bitFields = [];
        let totalBits = 0;
        let j = i;

        while (j < typeDef.sequence.length &&
               typeDef.sequence[j].type === 'bit' &&
               typeDef.sequence[j].size !== undefined) {
          bitFields.push(typeDef.sequence[j]);
          totalBits += typeDef.sequence[j].size;
          j++;
        }

        // Calculate byte span
        const byteCount = Math.ceil(totalBits / 8);

        // Generate annotation for this group of bit fields
        const annotation = annotateBitFields(bitFields, decoded, offset, byteCount);
        annotations.push(annotation);

        offset += byteCount;
        i = j; // Skip past all the bit fields we just processed
      } else {
        // Regular field - use existing logic
        const fieldValue = decoded[field.name];
        const result = annotateField(bytes, offset, field.type, field.name, fieldValue, schema, field);
        annotations.push(...result.annotations);
        offset = result.offset;
        i++;
      }
    }
  } else {
    throw new Error(`Type "${typeName}" is not a sequence/struct (unsupported for annotation)`);
  }

  return annotations;
}

interface FieldAnnotationResult {
  annotations: Annotation[];
  offset: number;
}

/**
 * Annotate an array field (inline or type alias)
 */
function annotateArrayField(
  bytes: number[],
  offset: number,
  fieldName: string,
  value: any,
  arrayType: any,
  schema: BinarySchema
): FieldAnnotationResult {
  const annotations: Annotation[] = [];

  if (arrayType.kind === 'length_prefixed') {
    let length = 0;

    // Check if length_field is specified (meaning length was read from a separate field)
    if (arrayType.length_field) {
      // Length has already been read - just use the array length from decoded value
      if (Array.isArray(value)) {
        length = value.length;
      }
      // No length prefix to read from wire or annotate
    } else {
      // Standard length-prefixed array - read length from wire
      const lengthType = arrayType.length_type || 'uint8';
      const lengthSize = getPrimitiveSize(lengthType);

      // Read the length field from wire
      if (lengthType === 'uint8') {
        length = bytes[offset];
      } else if (lengthType === 'uint16') {
        length = (bytes[offset] << 8) | bytes[offset + 1];
      } else if (lengthType === 'uint32') {
        length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
      }

      // Annotate the length prefix
      annotations.push({
        offset,
        length: lengthSize,
        description: `${fieldName} length (${lengthType}): ${length}`
      });
      offset += lengthSize;
    }

    // For byte arrays that look like ASCII strings, show as string
    const itemType = arrayType.items?.type;
    let displayValue = JSON.stringify(value);
    if (itemType === 'uint8') {
      if (Array.isArray(value)) {
        const isAscii = value.every((b: number) => b >= 32 && b <= 126);
        if (isAscii) {
          displayValue = `'${String.fromCharCode(...value)}'`;
        }
      } else if (typeof value === 'string') {
        // Value is already a string (from decoded data)
        displayValue = `'${value}'`;
      }
    }

    annotations.push({
      offset,
      length,
      description: `${fieldName} (${itemType}[]): ${displayValue}`
    });
    offset += length;

    return { annotations, offset };
  }

  if (arrayType.kind === 'null_terminated') {
    // Array of items until we hit a terminator (0x00 for single byte, or custom type's natural terminator)
    const itemType = arrayType.items?.type;

    // For arrays of complex types (like Labels), annotate each element
    if (!isBuiltInType(itemType)) {
      const itemAnnotations: any[] = [];

      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const itemValue = value[i];
          const result = annotateField(bytes, offset, itemType, `${fieldName}[${i}]`, itemValue, schema);
          itemAnnotations.push(...result.annotations);
          offset = result.offset;
        }
      }

      // Add the terminator byte annotation
      annotations.push(...itemAnnotations);
      annotations.push({
        offset,
        length: 1,
        description: `${fieldName} terminator (uint8): 0`
      });
      offset += 1;

      return { annotations, offset };
    } else {
      // For primitive types (like uint8 for C-strings), read until null
      const startOffset = offset;
      let length = 0;
      while (bytes[offset + length] !== 0) {
        length++;
      }

      // Display as string if uint8 array
      let displayValue = JSON.stringify(value);
      if (itemType === 'uint8') {
        if (Array.isArray(value)) {
          const isAscii = value.every((b: number) => b >= 32 && b <= 126);
          if (isAscii) {
            displayValue = `'${String.fromCharCode(...value)}'`;
          }
        } else if (typeof value === 'string') {
          displayValue = `'${value}'`;
        }
      }

      annotations.push({
        offset: startOffset,
        length,
        description: `${fieldName} (${itemType}[]): ${displayValue}`
      });
      offset += length;

      // Terminator
      annotations.push({
        offset,
        length: 1,
        description: `${fieldName} terminator (uint8): 0`
      });
      offset += 1;

      return { annotations, offset };
    }
  }

  if (arrayType.kind === 'fixed') {
    const itemType = arrayType.items?.type;
    const length = arrayType.length || 0;
    const itemSize = getPrimitiveSize(itemType);

    annotations.push({
      offset,
      length: length * itemSize,
      description: `${fieldName} (${itemType}[${length}]): ${JSON.stringify(value)}`
    });
    offset += length * itemSize;

    return { annotations, offset };
  }

  throw new Error(`Unknown array kind "${arrayType.kind}" for field "${fieldName}"`);
}

/**
 * Annotate a string field (length-prefixed, null-terminated, or fixed)
 */
function annotateStringField(
  bytes: number[],
  offset: number,
  fieldName: string,
  value: any,
  stringType: any,
  schema: BinarySchema
): FieldAnnotationResult {
  const annotations: Annotation[] = [];
  const encoding = stringType.encoding || 'utf8';

  if (stringType.kind === 'length_prefixed') {
    let length = 0;

    // Check if there's no explicit length prefix (shouldn't happen for strings, but handle it)
    const lengthType = stringType.length_type || 'uint8';
    const lengthSize = getPrimitiveSize(lengthType);

    // Read the length field from wire
    if (lengthType === 'uint8') {
      length = bytes[offset];
    } else if (lengthType === 'uint16') {
      length = (bytes[offset] << 8) | bytes[offset + 1];
    } else if (lengthType === 'uint32') {
      length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    }

    // Annotate the length prefix
    annotations.push({
      offset,
      length: lengthSize,
      description: `${fieldName} length (${lengthType}): ${length}`
    });
    offset += lengthSize;

    // Annotate the string data
    const displayValue = typeof value === 'string' ? `'${value}'` : JSON.stringify(value);
    annotations.push({
      offset,
      length,
      description: `${fieldName} (string): ${displayValue}`
    });
    offset += length;

    return { annotations, offset };
  }

  if (stringType.kind === 'null_terminated') {
    // Read until null terminator
    const startOffset = offset;
    let length = 0;
    while (bytes[offset + length] !== 0) {
      length++;
    }

    // Annotate the string data
    const displayValue = typeof value === 'string' ? `'${value}'` : JSON.stringify(value);
    annotations.push({
      offset: startOffset,
      length,
      description: `${fieldName} (string): ${displayValue}`
    });
    offset += length;

    // Terminator
    annotations.push({
      offset,
      length: 1,
      description: `${fieldName} terminator (uint8): 0`
    });
    offset += 1;

    return { annotations, offset };
  }

  if (stringType.kind === 'fixed') {
    const length = stringType.length || 0;
    const displayValue = typeof value === 'string' ? `'${value}'` : JSON.stringify(value);

    annotations.push({
      offset,
      length,
      description: `${fieldName} (string[${length}]): ${displayValue}`
    });
    offset += length;

    return { annotations, offset };
  }

  throw new Error(`Unknown string kind "${stringType.kind}" for field "${fieldName}"`);
}

/**
 * Annotate a group of consecutive bit fields
 */
function annotateBitFields(
  bitFields: any[],
  decoded: any,
  offset: number,
  byteCount: number
): Annotation {
  let bitOffset = 0;
  const parts: string[] = [];
  const bitfieldData: Array<{ name: string; value: any; bitStart: number; bitEnd: number }> = [];

  for (const field of bitFields) {
    const value = decoded[field.name];
    const bitStart = bitOffset;
    const bitEnd = bitOffset + field.size - 1;

    // Store structured data
    bitfieldData.push({
      name: field.name,
      value,
      bitStart,
      bitEnd
    });

    if (byteCount > 1) {
      // Multi-byte: show bit ranges
      parts.push(`${field.name}=${value} (bits ${bitStart}-${bitEnd})`);
    } else {
      // Single byte: just name=value
      parts.push(`${field.name}=${value}`);
    }

    bitOffset += field.size;
  }

  const description = byteCount === 1
    ? `Byte ${offset} (bits): ${parts.join(', ')}`
    : `Bytes ${offset}-${offset + byteCount - 1} (bits): ${parts.join(', ')}`;

  return {
    offset,
    length: byteCount,
    description,
    bitfields: bitfieldData
  };
}

/**
 * Annotate a single field
 */
function annotateField(
  bytes: number[],
  offset: number,
  typeName: string,
  fieldName: string,
  value: any,
  schema: BinarySchema,
  field?: any
): FieldAnnotationResult {
  const annotations: Annotation[] = [];

  // Handle Optional<T> - generic pattern, not protocol-specific
  const optionalMatch = typeName.match(/^Optional<(.+)>$/);
  if (optionalMatch) {
    const innerType = optionalMatch[1];
    const present = bytes[offset];
    annotations.push({
      offset,
      length: 1,
      description: `${fieldName} present (uint8): ${present === 1 ? 'yes' : 'no'}`
    });
    offset++;

    if (present === 1) {
      const result = annotateField(bytes, offset, innerType, fieldName, value, schema, field);
      annotations.push(...result.annotations);
      offset = result.offset;
    }

    return { annotations, offset };
  }

  // Handle primitive types
  const primitiveSize = getPrimitiveSize(typeName);
  if (primitiveSize > 0) {
    annotations.push({
      offset,
      length: primitiveSize,
      description: `${fieldName} (${typeName}): ${formatValue(value, typeName)}`
    });
    offset += primitiveSize;
    return { annotations, offset };
  }

  // Handle inline array fields (when field itself is an array, not a type reference)
  if (typeName === 'array' && field && 'kind' in field && 'items' in field) {
    return annotateArrayField(bytes, offset, fieldName, value, field, schema);
  }

  // Handle inline string fields (when field itself is a string, not a type reference)
  if (typeName === 'string' && field && 'kind' in field && 'encoding' in field) {
    return annotateStringField(bytes, offset, fieldName, value, field, schema);
  }

  // Handle custom types
  const customType = schema.types[typeName];
  if (customType) {
    // Check if it's an array type (type alias)
    if ('type' in customType && customType.type === 'array') {
      return annotateArrayField(bytes, offset, fieldName, value, customType, schema);
    }

    // Check if it's a string type (type alias)
    if ('type' in customType && customType.type === 'string') {
      return annotateStringField(bytes, offset, fieldName, value, customType, schema);
    }

    // Check if it's a struct (sequence)
    if ('sequence' in customType) {
      // Nested struct - annotate its fields
      for (const nestedField of customType.sequence) {
        const nestedValue = value[nestedField.name];
        const result = annotateField(bytes, offset, nestedField.type, `${fieldName}.${nestedField.name}`, nestedValue, schema, nestedField);
        annotations.push(...result.annotations);
        offset = result.offset;
      }
      return { annotations, offset };
    }
  }

  // Unknown type
  throw new Error(`Unknown type "${typeName}" for field "${fieldName}"`);
}

/**
 * Check if a type is a built-in primitive
 */
function isBuiltInType(typeName: string): boolean {
  const builtIns = [
    'uint8', 'uint16', 'uint32', 'uint64',
    'int8', 'int16', 'int32', 'int64',
    'float32', 'float64', 'bit'
  ];
  return builtIns.includes(typeName);
}

/**
 * Get the size in bytes of a primitive type
 */
function getPrimitiveSize(typeName: string): number {
  const sizes: Record<string, number> = {
    uint8: 1,
    int8: 1,
    uint16: 2,
    int16: 2,
    uint32: 4,
    int32: 4,
    uint64: 8,
    int64: 8,
    float32: 4,
    float64: 8,
  };
  return sizes[typeName] || 0;
}

/**
 * Format a value for display in annotation
 */
function formatValue(value: any, typeName: string): string {
  if (typeof value === 'string') {
    return `'${value}'`;
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return JSON.stringify(value);
}
