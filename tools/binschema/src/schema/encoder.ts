/**
 * Binary encoder utility
 *
 * Encodes values according to a BinarySchema into byte arrays.
 * This is the inverse of the decoder/annotation system.
 */

import { BinarySchema } from './binary-schema.js';

/**
 * Encode a value according to its type in the schema
 *
 * @param schema - The binary schema
 * @param typeName - The type name to encode as
 * @param value - The value to encode (decoded representation)
 * @returns Byte array
 */
export function encodeValue(schema: BinarySchema, typeName: string, value: any): number[] {
  const bytes: number[] = [];
  const typeDef = schema.types[typeName];

  if (!typeDef) {
    throw new Error(`Type "${typeName}" not found in schema`);
  }

  // Check if it's a composite type (struct with sequence)
  if ('sequence' in typeDef && Array.isArray(typeDef.sequence)) {
    const fields = typeDef.sequence;
    let i = 0;

    while (i < fields.length) {
      const field = fields[i];

      // Check if this is the start of a bit field group
      if (field.type === 'bit' && field.size !== undefined) {
        // Collect consecutive bit fields
        const bitFields = [];
        let totalBits = 0;
        let j = i;

        while (j < fields.length &&
               fields[j].type === 'bit' &&
               fields[j].size !== undefined) {
          bitFields.push(fields[j]);
          totalBits += fields[j].size;
          j++;
        }

        // Pack bit fields into bytes
        const packedBytes = packBitFields(bitFields, value);
        bytes.push(...packedBytes);

        i = j; // Skip past all processed bit fields
      } else {
        // Regular field - encode it
        const fieldValue = value[field.name];
        const fieldBytes = encodeField(schema, field.type, fieldValue, field);
        bytes.push(...fieldBytes);
        i++;
      }
    }
  } else {
    throw new Error(`Type "${typeName}" is not a composite type (encoding not supported for type aliases yet)`);
  }

  return bytes;
}

/**
 * Pack consecutive bit fields into bytes (MSB first)
 */
function packBitFields(bitFields: any[], decodedValues: any): number[] {
  let totalBits = 0;
  for (const field of bitFields) {
    totalBits += field.size;
  }

  const numBytes = Math.ceil(totalBits / 8);
  const bytes = new Array(numBytes).fill(0);

  let bitOffset = 0;
  for (const field of bitFields) {
    const value = decodedValues[field.name] || 0;
    const fieldSize = field.size;

    // Pack bits MSB first
    for (let bit = 0; bit < fieldSize; bit++) {
      const bitValue = (value >> (fieldSize - 1 - bit)) & 1;
      const byteIndex = Math.floor(bitOffset / 8);
      const bitIndex = 7 - (bitOffset % 8); // MSB first within byte

      if (bitValue) {
        bytes[byteIndex] |= (1 << bitIndex);
      }

      bitOffset++;
    }
  }

  return bytes;
}

/**
 * Encode a single field value
 */
function encodeField(schema: BinarySchema, typeName: string, value: any, field?: any): number[] {
  // Handle primitives
  switch (typeName) {
    case 'uint8':
      return [value & 0xFF];

    case 'uint16':
      return [
        (value >> 8) & 0xFF,
        value & 0xFF
      ];

    case 'uint32':
      return [
        (value >> 24) & 0xFF,
        (value >> 16) & 0xFF,
        (value >> 8) & 0xFF,
        value & 0xFF
      ];

    case 'uint64':
      // JavaScript loses precision beyond 53 bits, but encode what we can
      return [
        (value >> 56) & 0xFF,
        (value >> 48) & 0xFF,
        (value >> 40) & 0xFF,
        (value >> 32) & 0xFF,
        (value >> 24) & 0xFF,
        (value >> 16) & 0xFF,
        (value >> 8) & 0xFF,
        value & 0xFF
      ];

    case 'int8':
      return [value & 0xFF];

    case 'int16':
      return [
        (value >> 8) & 0xFF,
        value & 0xFF
      ];

    case 'int32':
      return [
        (value >> 24) & 0xFF,
        (value >> 16) & 0xFF,
        (value >> 8) & 0xFF,
        value & 0xFF
      ];

    case 'int64':
      return [
        (value >> 56) & 0xFF,
        (value >> 48) & 0xFF,
        (value >> 40) & 0xFF,
        (value >> 32) & 0xFF,
        (value >> 24) & 0xFF,
        (value >> 16) & 0xFF,
        (value >> 8) & 0xFF,
        value & 0xFF
      ];

    case 'bit':
      // Single bit field (should be handled by packBitFields in practice)
      throw new Error('Bit fields must be grouped and encoded together');

    case 'array':
      return encodeArray(schema, field, value);

    case 'string':
      return encodeString(field, value);

    default:
      // Custom type - recurse
      return encodeValue(schema, typeName, value);
  }
}

/**
 * Encode an array field
 */
function encodeArray(schema: BinarySchema, arrayField: any, value: any): number[] {
  const bytes: number[] = [];
  const kind = arrayField.kind;

  if (kind === 'length_prefixed') {
    const lengthType = arrayField.length_type || 'uint8';
    const length = Array.isArray(value) ? value.length : 0;

    // Encode length prefix
    bytes.push(...encodeField(schema, lengthType, length));

    // Encode array elements
    if (Array.isArray(value)) {
      for (const item of value) {
        const itemType = arrayField.items?.type;
        bytes.push(...encodeField(schema, itemType, item));
      }
    }

    return bytes;
  }

  if (kind === 'null_terminated') {
    // Encode elements
    if (Array.isArray(value)) {
      for (const item of value) {
        const itemType = arrayField.items?.type;
        bytes.push(...encodeField(schema, itemType, item));
      }
    }

    // Add null terminator
    bytes.push(0);

    return bytes;
  }

  if (kind === 'fixed') {
    const length = arrayField.length || 0;

    // Encode fixed number of elements
    for (let i = 0; i < length; i++) {
      const item = Array.isArray(value) && i < value.length ? value[i] : 0;
      const itemType = arrayField.items?.type;
      bytes.push(...encodeField(schema, itemType, item));
    }

    return bytes;
  }

  throw new Error(`Unknown array kind: ${kind}`);
}

/**
 * Encode a string field
 */
function encodeString(stringField: any, value: string): number[] {
  const bytes: number[] = [];
  const kind = stringField.kind;
  const encoding = stringField.encoding || 'utf8';

  // Convert string to bytes based on encoding
  const stringBytes = encoding === 'ascii'
    ? Array.from(value).map(c => c.charCodeAt(0) & 0x7F)
    : Array.from(new TextEncoder().encode(value));

  if (kind === 'length_prefixed') {
    const lengthType = stringField.length_type || 'uint8';

    // Encode length prefix
    if (lengthType === 'uint8') {
      bytes.push(stringBytes.length & 0xFF);
    } else if (lengthType === 'uint16') {
      bytes.push((stringBytes.length >> 8) & 0xFF, stringBytes.length & 0xFF);
    } else if (lengthType === 'uint32') {
      bytes.push(
        (stringBytes.length >> 24) & 0xFF,
        (stringBytes.length >> 16) & 0xFF,
        (stringBytes.length >> 8) & 0xFF,
        stringBytes.length & 0xFF
      );
    }

    // Encode string bytes
    bytes.push(...stringBytes);

    return bytes;
  }

  if (kind === 'null_terminated') {
    bytes.push(...stringBytes);
    bytes.push(0); // Null terminator
    return bytes;
  }

  if (kind === 'fixed') {
    const length = stringField.length || 0;

    // Pad or truncate to fixed length
    for (let i = 0; i < length; i++) {
      bytes.push(i < stringBytes.length ? stringBytes[i] : 0);
    }

    return bytes;
  }

  throw new Error(`Unknown string kind: ${kind}`);
}
