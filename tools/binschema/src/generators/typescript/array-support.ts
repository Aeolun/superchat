/**
 * Array encoding and decoding support.
 * Handles all array kinds: length_prefixed, fixed, field_referenced, null_terminated, signature_terminated, eof_terminated.
 */

import { BinarySchema, Endianness, Field } from "../../schema/binary-schema.js";
import { sanitizeVarName } from "./type-utils.js";
import { detectSameIndexTracking } from "./computed-fields.js";

/**
 * Calculate the size of a fixed-size primitive type item for length_prefixed_items.
 */
export function getItemSize(itemDef: any, schema: BinarySchema, globalEndianness: Endianness): number {
  const itemType = itemDef.type;

  // Primitive types
  switch (itemType) {
    case "uint8":
    case "int8":
      return 1;
    case "uint16":
    case "int16":
      return 2;
    case "uint32":
    case "int32":
    case "float32":
      return 4;
    case "uint64":
    case "int64":
    case "float64":
      return 8;
    default:
      throw new Error(`length_prefixed_items: Cannot determine size for item type "${itemType}". Only fixed-size primitive types are supported.`);
  }
}

/**
 * Generate encoding code for arrays (class-based style).
 * Handles all array kinds with same_index position tracking for choice arrays.
 */
export function generateEncodeArray(
  field: any,
  schema: BinarySchema,
  globalEndianness: Endianness,
  valuePath: string,
  indent: string,
  generateEncodeFieldCoreImpl: (field: Field, schema: BinarySchema, endianness: Endianness, valuePath: string, indent: string) => string
): string {
  let code = "";

  // Write length prefix if length_prefixed or length_prefixed_items
  if (field.kind === "length_prefixed" || field.kind === "length_prefixed_items") {
    const lengthType = field.length_type;
    switch (lengthType) {
      case "uint8":
        code += `${indent}this.writeUint8(${valuePath}.length);\n`;
        break;
      case "uint16":
        code += `${indent}this.writeUint16(${valuePath}.length, "${globalEndianness}");\n`;
        break;
      case "uint32":
        code += `${indent}this.writeUint32(${valuePath}.length, "${globalEndianness}");\n`;
        break;
      case "uint64":
        code += `${indent}this.writeUint64(BigInt(${valuePath}.length), "${globalEndianness}");\n`;
        break;
    }
  }
  // Note: field_referenced arrays don't write their own length - the length field was already written earlier

  // Safety check for items field
  if (!field.items || typeof field.items !== 'object' || !('type' in field.items)) {
    return `${indent}// ERROR: Array field '${valuePath}' has undefined or invalid items\n`;
  }

  // Check if this array needs same_index position tracking
  const trackingTypes = detectSameIndexTracking(field, schema);
  const fieldName = field.name || valuePath.split('.').pop() || 'array';

  // Initialize position tracking if needed
  if (trackingTypes) {
    code += `${indent}// Initialize same_index position tracking\n`;
    for (const typeName of trackingTypes) {
      code += `${indent}this._positions_${fieldName}_${typeName} = [];\n`;
    }
    // Also initialize index counters for ALL choice types (not just tracked ones)
    if (field.items?.type === "choice") {
      const choices = field.items.choices || [];
      for (const choice of choices) {
        code += `${indent}this._index_${fieldName}_${choice.type} = 0;\n`;
      }
    }
  }

  // Write array elements
  // Use unique variable name to avoid shadowing in nested arrays
  const itemVar = valuePath.replace(/[.\[\]]/g, "_") + "_item";

  // Track if we encounter a terminal variant (to skip null terminator)
  const hasTerminalVariants = field.kind === "null_terminated" && field.terminal_variants && Array.isArray(field.terminal_variants) && field.terminal_variants.length > 0;
  if (hasTerminalVariants) {
    const terminatedVar = valuePath.replace(/[.\[\]]/g, "_") + "_terminated";
    code += `${indent}let ${terminatedVar} = false;\n`;
  }

  code += `${indent}for (const ${itemVar} of ${valuePath}) {\n`;

  // Track position for same_index correlation (if tracking is enabled)
  if (trackingTypes && field.items?.type === "choice") {
    code += `${indent}  // Track position for same_index correlation\n`;
    for (const typeName of trackingTypes) {
      code += `${indent}  if (${itemVar}.type === '${typeName}') {\n`;
      code += `${indent}    this._positions_${fieldName}_${typeName}.push(this.byteOffset);\n`;
      code += `${indent}  }\n`;
    }
  }

  // Write item length prefix if length_prefixed_items
  if (field.kind === "length_prefixed_items" && field.item_length_type) {
    const itemLengthType = field.item_length_type;

    // Check if this is a fixed-size primitive type
    const itemType = field.items?.type;
    const isFixedSizePrimitive = ['uint8', 'int8', 'uint16', 'int16', 'uint32', 'int32', 'float32', 'uint64', 'int64', 'float64'].includes(itemType);

    if (isFixedSizePrimitive) {
      // For fixed-size primitives, we can write the size directly as a constant
      const itemSize = getItemSize(field.items, schema, globalEndianness);
      switch (itemLengthType) {
        case "uint8":
          code += `${indent}  this.writeUint8(${itemSize});\n`;
          break;
        case "uint16":
          code += `${indent}  this.writeUint16(${itemSize}, "${globalEndianness}");\n`;
          break;
        case "uint32":
          code += `${indent}  this.writeUint32(${itemSize}, "${globalEndianness}");\n`;
          break;
        case "uint64":
          code += `${indent}  this.writeUint64(BigInt(${itemSize}), "${globalEndianness}");\n`;
          break;
      }
    } else {
      // For variable-length types, encode to temporary encoder and measure
      code += `${indent}  // Encode item to temporary encoder to measure size\n`;
      code += `${indent}  const ${itemVar}_temp = new BitStreamEncoder("${globalEndianness === 'big_endian' ? 'msb_first' : 'lsb_first'}");\n`;

      // Generate inline encoding by reusing the encode logic
      // We'll encode to temp encoder, then copy the bytes
      const tempEncoding = generateEncodeFieldCoreImpl(
        field.items as Field,
        schema,
        globalEndianness,
        itemVar,
        indent + "  "
      );

      // Replace 'this.' with '${itemVar}_temp.' in the generated encoding code
      const modifiedEncoding = tempEncoding.replace(/\bthis\./g, `${itemVar}_temp.`);
      code += modifiedEncoding;

      code += `${indent}  const ${itemVar}_bytes = ${itemVar}_temp.finish();\n`;
      code += `${indent}  const ${itemVar}_length = ${itemVar}_bytes.length;\n`;

      // Validate size doesn't exceed max for item_length_type
      const maxSizes: {[key: string]: number} = {
        'uint8': 255,
        'uint16': 65535,
        'uint32': 4294967295,
        'uint64': Number.MAX_SAFE_INTEGER
      };
      const maxSize = maxSizes[itemLengthType];
      code += `${indent}  if (${itemVar}_length > ${maxSize}) {\n`;
      code += `${indent}    throw new Error(\`Item size \${${itemVar}_length} exceeds maximum ${maxSize} bytes for ${itemLengthType}\`);\n`;
      code += `${indent}  }\n`;

      // Write item length
      switch (itemLengthType) {
        case "uint8":
          code += `${indent}  this.writeUint8(${itemVar}_length);\n`;
          break;
        case "uint16":
          code += `${indent}  this.writeUint16(${itemVar}_length, "${globalEndianness}");\n`;
          break;
        case "uint32":
          code += `${indent}  this.writeUint32(${itemVar}_length, "${globalEndianness}");\n`;
          break;
        case "uint64":
          code += `${indent}  this.writeUint64(BigInt(${itemVar}_length), "${globalEndianness}");\n`;
          break;
      }

      // Write item bytes
      code += `${indent}  for (const byte of ${itemVar}_bytes) {\n`;
      code += `${indent}    this.writeUint8(byte);\n`;
      code += `${indent}  }\n`;

      // Continue to next iteration (don't encode again)
      code += `${indent}  continue;\n`;
    }
  }

  // Only encode if we didn't already handle it in length_prefixed_items above
  if (!(field.kind === "length_prefixed_items" && field.item_length_type && !['uint8', 'int8', 'uint16', 'int16', 'uint32', 'int32', 'float32', 'uint64', 'int64', 'float64'].includes(field.items?.type))) {
    code += generateEncodeFieldCoreImpl(
      field.items as Field,
      schema,
      globalEndianness,
      itemVar,
      indent + "  "
    );
  }

  // Check if this is a terminal variant (for null_terminated arrays with discriminated unions)
  if (hasTerminalVariants) {
    const terminatedVar = valuePath.replace(/[.\[\]]/g, "_") + "_terminated";
    code += `${indent}  // Check if item is a terminal variant\n`;
    const conditions = field.terminal_variants.map((v: string) => `${itemVar}.type === '${v}'`).join(' || ');
    code += `${indent}  if (${conditions}) {\n`;
    code += `${indent}    ${terminatedVar} = true;\n`;
    code += `${indent}    break;\n`;
    code += `${indent}  }\n`;
  }

  // Increment correlation index counter for same_index tracking
  if (trackingTypes && field.items?.type === "choice") {
    code += `${indent}  // Increment correlation index for this choice type\n`;
    const choices = field.items.choices || [];
    for (const choice of choices) {
      code += `${indent}  if (${itemVar}.type === '${choice.type}') {\n`;
      code += `${indent}    this._index_${fieldName}_${choice.type}++;\n`;
      code += `${indent}  }\n`;
    }
  }

  code += `${indent}}\n`;

  // Write null terminator if null_terminated and no terminal variant was encountered
  if (field.kind === "null_terminated") {
    if (hasTerminalVariants) {
      const terminatedVar = valuePath.replace(/[.\[\]]/g, "_") + "_terminated";
      code += `${indent}if (!${terminatedVar}) {\n`;
      code += `${indent}  this.writeUint8(0);\n`;
      code += `${indent}}\n`;
    } else {
      code += `${indent}this.writeUint8(0);\n`;
    }
  }

  return code;
}

/**
 * Generate decoding code for arrays (class-based style).
 * Handles all array kinds: length_prefixed, fixed, field_referenced, null_terminated, signature_terminated, eof_terminated.
 */
export function generateDecodeArray(
  field: any,
  schema: BinarySchema,
  globalEndianness: Endianness,
  fieldName: string,
  indent: string,
  addTraceLogs: boolean,
  getTargetPath: (fieldName: string) => string,
  generateDecodeFieldCore: (field: Field, schema: BinarySchema, endianness: Endianness, fieldName: string, indent: string, addTraceLogs: boolean) => string
): string {
  const target = getTargetPath(fieldName);
  let code = "";

  if (addTraceLogs) {
    code += `${indent}console.log('[TRACE] Decoding array field ${fieldName}');\n`;
  }

  code += `${indent}${target} = [];\n`;

  // Read length if length_prefixed or length_prefixed_items
  if (field.kind === "length_prefixed" || field.kind === "length_prefixed_items") {
    const lengthType = field.length_type;
    let lengthRead = "";
    switch (lengthType) {
      case "uint8":
        lengthRead = "this.readUint8()";
        break;
      case "uint16":
        lengthRead = `this.readUint16("${globalEndianness}")`;
        break;
      case "uint32":
        lengthRead = `this.readUint32("${globalEndianness}")`;
        break;
      case "uint64":
        lengthRead = `Number(this.readUint64("${globalEndianness}"))`;
        break;
    }
    // Sanitize fieldName for use in variable name (replace dots with underscores)
    const lengthVarName = fieldName.replace(/\./g, "_") + "_length";
    code += `${indent}const ${lengthVarName} = ${lengthRead};\n`;
    code += `${indent}for (let i = 0; i < ${lengthVarName}; i++) {\n`;

    // Read item length prefix if length_prefixed_items
    if (field.kind === "length_prefixed_items" && field.item_length_type) {
      const itemLengthType = field.item_length_type;
      const itemLengthVarName = fieldName.replace(/\./g, "_") + "_item_length";
      let itemLengthRead = "";
      switch (itemLengthType) {
        case "uint8":
          itemLengthRead = "this.readUint8()";
          break;
        case "uint16":
          itemLengthRead = `this.readUint16("${globalEndianness}")`;
          break;
        case "uint32":
          itemLengthRead = `this.readUint32("${globalEndianness}")`;
          break;
        case "uint64":
          itemLengthRead = `Number(this.readUint64("${globalEndianness}"))`;
          break;
      }
      code += `${indent}  const ${itemLengthVarName} = ${itemLengthRead};\n`;
      // Note: We read the item length but don't use it for validation yet
      // In a real implementation, you might validate that the item size matches expectations
    }
  } else if (field.kind === "fixed") {
    code += `${indent}for (let i = 0; i < ${field.length}; i++) {\n`;
  } else if (field.kind === "field_referenced") {
    // Length comes from a previously-decoded field
    const lengthField = field.length_field;
    const lengthVarName = fieldName.replace(/\./g, "_") + "_length";

    // Check for _root reference
    if (lengthField.startsWith('_root.')) {
      // Reference to root object - access via context._root
      const rootPath = lengthField.substring(6); // Remove "_root."
      code += `${indent}const ${lengthVarName} = this.context?._root?.${rootPath};\n`;
      code += `${indent}if (${lengthVarName} === undefined) {\n`;
      code += `${indent}  throw new Error('Field-referenced array length field "${lengthField}" not found in context._root');\n`;
      code += `${indent}}\n`;
    } else {
      // Regular field reference - need to account for inline type decoding and array items
      // If fieldName is "local_file.entries", lengthField should be resolved relative to "local_file"
      // If fieldName is "entries_item.data", use "entries_item" directly (no "value." prefix)
      const isArrayItem = fieldName.includes('_item');
      const parentPath = fieldName.includes('.') ? fieldName.substring(0, fieldName.lastIndexOf('.')) + '.' : '';
      const fullLengthPath = parentPath + lengthField;

      if (isArrayItem) {
        // For array items, the variable is already scoped (e.g., "entries_item")
        code += `${indent}const ${lengthVarName} = ${fullLengthPath} ?? this.context?.${lengthField};\n`;
      } else {
        // For regular fields, prefix with "value."
        code += `${indent}const ${lengthVarName} = value.${fullLengthPath} ?? this.context?.${lengthField};\n`;
      }
      code += `${indent}if (${lengthVarName} === undefined) {\n`;
      code += `${indent}  throw new Error('Field-referenced array length field "${lengthField}" not found in value or context');\n`;
      code += `${indent}}\n`;
    }
    code += `${indent}for (let i = 0; i < ${lengthVarName}; i++) {\n`;
  } else if (field.kind === "null_terminated") {
    // For null-terminated arrays, we need to peek ahead to check for null terminator
    // If item type is uint8, we can optimize by reading bytes directly
    const itemType = field.items?.type;

    if (itemType === "uint8") {
      // Optimized path for byte arrays
      code += `${indent}while (true) {\n`;
      code += `${indent}  const byte = this.readUint8();\n`;
      code += `${indent}  if (byte === 0) break;\n`;
      code += `${indent}  ${target}.push(byte);\n`;
      code += `${indent}}\n`;
      return code;
    } else {
      // For complex types, peek at the first byte to check for null terminator
      // This assumes the first byte of the item can distinguish null terminator
      code += `${indent}while (true) {\n`;
      code += `${indent}  const firstByte = this.readUint8();\n`;
      code += `${indent}  if (firstByte === 0) break;\n`;
      code += `${indent}  // Rewind one byte since we peeked ahead\n`;
      code += `${indent}  this.byteOffset--;\n`;
      // Fall through to normal item decoding below
    }
  } else if (field.kind === "signature_terminated") {
    // For signature-terminated arrays, peek ahead to check for terminator value
    const terminatorValue = (field as any).terminator_value;
    const terminatorType = (field as any).terminator_type;
    const terminatorEndianness = (field as any).terminator_endianness || globalEndianness;

    if (terminatorValue === undefined || terminatorType === undefined) {
      throw new Error(`signature_terminated array '${field.name}' requires terminator_value and terminator_type`);
    }

    // Generate peek method name based on terminator type
    const peekMethod = `peek${terminatorType.charAt(0).toUpperCase() + terminatorType.slice(1)}`;
    const endiannessArg = terminatorType !== "uint8" ? `"${terminatorEndianness}"` : "";

    code += `${indent}while (true) {\n`;
    code += `${indent}  // Peek ahead to check for terminator signature\n`;
    code += `${indent}  const signature = this.${peekMethod}(${endiannessArg});\n`;
    code += `${indent}  if (signature === ${terminatorValue}) break;\n`;
    // Fall through to normal item decoding below (inside the loop)
  } else if (field.kind === "eof_terminated") {
    // For EOF-terminated arrays, read items until end of stream
    code += `${indent}while (this.byteOffset < this.bytes.length) {\n`;
    code += `${indent}  try {\n`;
    // Fall through to normal item decoding below (inside try block)
  }

  // Safety check for items field
  if (!field.items || typeof field.items !== 'object' || !('type' in field.items)) {
    code += `${indent}  // ERROR: Array items undefined\n`;
    if (field.kind === "null_terminated" || field.kind === "signature_terminated" || field.kind === "eof_terminated") {
      code += `${indent}}\n`;
    } else {
      code += `${indent}}\n`;
    }
    return code;
  }

  // Read array item
  // Use unique variable name to avoid shadowing in nested arrays
  const itemVar = fieldName.replace(/[.\[\]]/g, "_") + "_item";
  const itemDecodeCode = generateDecodeFieldCore(
    field.items as Field,
    schema,
    globalEndianness,
    itemVar,
    indent + "  ",
    addTraceLogs
  );

  // For primitive types, directly push
  if (itemDecodeCode.includes(`${itemVar} =`)) {
    code += `${indent}  let ${itemVar}: any;\n`;
    code += itemDecodeCode;
    code += `${indent}  ${target}.push(${itemVar});\n`;

    // Check if this is a terminal variant (for null_terminated arrays with discriminated unions)
    if (field.kind === "null_terminated" && field.terminal_variants && Array.isArray(field.terminal_variants)) {
      code += `${indent}  // Check if item is a terminal variant\n`;
      const conditions = field.terminal_variants.map((v: string) => `${itemVar}.type === '${v}'`).join(' || ');
      code += `${indent}  if (${conditions}) {\n`;
      code += `${indent}    break;\n`;
      code += `${indent}  }\n`;
    }
  }

  // Close eof_terminated try-catch block
  if (field.kind === "eof_terminated") {
    code += `${indent}  } catch (error) {\n`;
    code += `${indent}    // EOF reached - stop reading items\n`;
    code += `${indent}    if (error instanceof Error && error.message.includes('Unexpected end of stream')) {\n`;
    code += `${indent}      break;\n`;
    code += `${indent}    }\n`;
    code += `${indent}    throw error; // Re-throw other errors\n`;
    code += `${indent}  }\n`;
  }

  code += `${indent}}\n`;

  return code;
}

/**
 * Generate functional-style array encoding.
 * Used by the experimental functional generator.
 */
export function generateFunctionalEncodeArray(
  field: any,
  schema: BinarySchema,
  globalEndianness: Endianness,
  valuePath: string,
  indent: string
): string {
  let code = "";

  // Write length prefix if length_prefixed
  if (field.kind === "length_prefixed") {
    const lengthType = field.length_type;
    switch (lengthType) {
      case "uint8":
        code += `${indent}stream.writeUint8(${valuePath}.length);\n`;
        break;
      case "uint16":
        code += `${indent}stream.writeUint16(${valuePath}.length, '${globalEndianness}');\n`;
        break;
      case "uint32":
        code += `${indent}stream.writeUint32(${valuePath}.length, '${globalEndianness}');\n`;
        break;
    }
  }

  // Write array elements
  const itemVar = valuePath.replace(/[.\[\]]/g, "_") + "_item";
  code += `${indent}for (const ${itemVar} of ${valuePath}) {\n`;
  const itemType = field.items?.type || "unknown";
  if (itemType === "uint8") {
    code += `${indent}  stream.writeUint8(${itemVar});\n`;
  } else {
    code += `${indent}  encode${itemType}(stream, ${itemVar});\n`;
  }
  code += `${indent}}\n`;

  // Write null terminator for null-terminated arrays
  if (field.kind === "null_terminated") {
    if (itemType === "uint8") {
      code += `${indent}stream.writeUint8(0);\n`;
    }
    // For complex types with terminal variants, the terminal variant IS the terminator
    // so we don't add anything extra
  }

  return code;
}

/**
 * Generate functional-style array decoding.
 * Used by the experimental functional generator.
 */
export function generateFunctionalDecodeArray(
  field: any,
  schema: BinarySchema,
  globalEndianness: Endianness,
  fieldName: string,
  indent: string,
  getElementTypeScriptType: (element: any, schema: BinarySchema) => string,
  generateDecodeChoice: (field: any, schema: BinarySchema, endianness: Endianness, indent: string, arrayName: string) => string,
  generateDecodeDiscriminatedUnionInline: (field: any, schema: BinarySchema, endianness: Endianness, indent: string, arrayName: string) => string
): string {
  // Get proper type annotation for array
  const itemType = field.items?.type || "any";
  const tsItemType = getElementTypeScriptType(field.items, schema);
  const typeAnnotation = `${tsItemType}[]`;
  let code = `${indent}const ${fieldName}: ${typeAnnotation} = [];\n`;

  // Read length if length_prefixed
  if (field.kind === "length_prefixed") {
    const lengthType = field.length_type;
    let lengthRead = "";
    switch (lengthType) {
      case "uint8":
        lengthRead = "stream.readUint8()";
        break;
      case "uint16":
        lengthRead = `stream.readUint16('${globalEndianness}')`;
        break;
      case "uint32":
        lengthRead = `stream.readUint32('${globalEndianness}')`;
        break;
    }
    code += `${indent}const ${fieldName}_length = ${lengthRead};\n`;
    code += `${indent}for (let i = 0; i < ${fieldName}_length; i++) {\n`;
  } else if (field.kind === "fixed") {
    code += `${indent}for (let i = 0; i < ${field.length}; i++) {\n`;
  } else if (field.kind === "field_referenced") {
    // Length comes from a previously-decoded field in the same sequence
    const lengthField = sanitizeVarName(field.length_field);
    code += `${indent}for (let i = 0; i < ${lengthField}; i++) {\n`;
  } else if (field.kind === "null_terminated") {
    // Null-terminated array - read until null terminator or terminal variant
    code += `${indent}while (true) {\n`;

    // Check for terminal variants if specified
    if (field.terminal_variants && field.terminal_variants.length > 0) {
      // For discriminated unions with terminal variants, check if we got a terminal
      code += `${indent}  const item = decode${itemType}(stream);\n`;
      code += `${indent}  ${fieldName}.push(item);\n`;
      // Check if this item is a terminal variant
      code += `${indent}  if (`;
      code += field.terminal_variants.map((v: string) => `item.type === '${v}'`).join(' || ');
      code += `) break;\n`;
      // Also check for empty label/string (common terminator pattern in protocols like DNS)
      code += `${indent}  if (item.type === 'Label' && item.value === '') break;\n`;
      code += `${indent}}\n`;
      return code;
    }

    // For simple types, check for zero byte
    if (itemType === "uint8") {
      code += `${indent}  const byte = stream.readUint8();\n`;
      code += `${indent}  if (byte === 0) break;\n`;
      code += `${indent}  ${fieldName}.push(byte);\n`;
      code += `${indent}}\n`;
      return code;
    }

    // For complex types without terminal variants, this is an error
    throw new Error(`Null-terminated array of ${itemType} requires terminal_variants`);
  }

  // Read array item (for non-null-terminated arrays)
  if (itemType === "uint8") {
    code += `${indent}  ${fieldName}.push(stream.readUint8());\n`;
  } else if (itemType === "choice") {
    // Inline choice - need to decode discriminated union inline
    code += generateDecodeChoice(field.items, schema, globalEndianness, `${indent}  `, fieldName);
  } else if (itemType === "discriminated_union") {
    // Inline discriminated union - need to decode inline
    code += generateDecodeDiscriminatedUnionInline(field.items, schema, globalEndianness, `${indent}  `, fieldName);
  } else {
    code += `${indent}  ${fieldName}.push(decode${itemType}(stream));\n`;
  }
  code += `${indent}}\n`;

  return code;
}
