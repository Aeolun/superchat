import { BinarySchema, TypeDef, Field, Endianness } from "../schema/binary-schema.js";

/**
 * TypeScript Code Generator
 *
 * Generates TypeScript encoder/decoder classes from a binary schema.
 */

export interface GeneratedCode {
  code: string;
  typeName: string;
}

/**
 * TypeScript reserved keywords and built-in types that cannot be used as interface names
 */
const TS_RESERVED_TYPES = new Set([
  "string", "number", "boolean", "object", "symbol", "bigint",
  "undefined", "null", "any", "void", "never", "unknown",
  "Array", "Promise", "Map", "Set", "Date", "RegExp", "Error",
]);

/**
 * Sanitize a type name for TypeScript to avoid conflicts with built-in types
 * Appends "_" to conflicting names (e.g., "string" → "string_")
 */
function sanitizeTypeName(typeName: string): string {
  // Don't sanitize generic template parameters (e.g., "Optional<T>")
  if (typeName.includes("<")) {
    return typeName;
  }

  if (TS_RESERVED_TYPES.has(typeName)) {
    return `${typeName}_`;
  }

  return typeName;
}

/**
 * Generate TypeScript code for all types in the schema (functional style with standalone functions)
 */
export function generateTypeScriptCode(schema: BinarySchema): string {
  const globalEndianness = schema.config?.endianness || "big_endian";
  const globalBitOrder = schema.config?.bit_order || "msb_first";

  // Import runtime library
  let code = `import { BitStreamDecoder } from "../dist/runtime/bit-stream.js";\n\n`;

  // Add global visitedOffsets for pointer circular reference detection
  code += `// Global set for circular reference detection in pointers\n`;
  code += `let visitedOffsets: Set<number>;\n\n`;

  // Generate code for each type (skip generic templates)
  for (const [typeName, typeDef] of Object.entries(schema.types)) {
    if (typeName.includes('<')) {
      continue;
    }

    const sanitizedName = sanitizeTypeName(typeName);
    code += generateFunctionalTypeCode(sanitizedName, typeDef as TypeDef, schema, globalEndianness, globalBitOrder);
    code += "\n\n";
  }

  return code;
}

/**
 * Generate TypeScript code for all types in the schema (class-based style)
 */
export function generateTypeScript(schema: BinarySchema): string {
  const globalEndianness = schema.config?.endianness || "big_endian";
  const globalBitOrder = schema.config?.bit_order || "msb_first";

  // Import runtime library (relative to .generated/ → dist/runtime/)
  let code = `import { BitStreamEncoder, BitStreamDecoder, Endianness } from "../dist/runtime/bit-stream.js";\n\n`;

  // Generate code for each type (skip generic templates like Optional<T>)
  for (const [typeName, typeDef] of Object.entries(schema.types)) {
    // Skip only generic type templates (e.g., "Optional<T>", "Array<T>")
    // Don't skip regular types that happen to contain 'T' (e.g., "ThreeBitValue", "Triangle")
    if (typeName.includes('<')) {
      continue;
    }

    const sanitizedName = sanitizeTypeName(typeName);
    code += generateTypeCode(sanitizedName, typeDef as TypeDef, schema, globalEndianness, globalBitOrder);
    code += "\n\n";
  }

  return code;
}

/**
 * Generate functional-style code for a single type
 */
function generateFunctionalTypeCode(
  typeName: string,
  typeDef: TypeDef,
  schema: BinarySchema,
  globalEndianness: Endianness,
  globalBitOrder: string
): string {
  // Check if this is a discriminated union or pointer type alias
  const typeDefAny = typeDef as any;

  if (typeDefAny.type === "discriminated_union") {
    return generateFunctionalDiscriminatedUnion(typeName, typeDefAny, schema, globalEndianness);
  }

  if (typeDefAny.type === "pointer") {
    return generateFunctionalPointer(typeName, typeDefAny, schema, globalEndianness);
  }

  // Check if this is a type alias or composite type
  if (isTypeAlias(typeDef)) {
    // Regular type alias
    const aliasedType = typeDefAny;
    const tsType = getElementTypeScriptType(aliasedType, schema);

    let code = `export type ${typeName} = ${tsType};`;
    if (typeDefAny.description) {
      code = `// ${typeDefAny.description}\n${code}`;
    }

    // For simple type aliases, we might not need encode/decode functions
    // (they'd just call the underlying type's functions)
    return code;
  }

  // Composite type - generate interface and functions
  const interfaceCode = generateInterface(typeName, typeDef, schema);
  const encoderCode = generateFunctionalEncoder(typeName, typeDef, schema, globalEndianness);
  const decoderCode = generateFunctionalDecoder(typeName, typeDef, schema, globalEndianness);

  return `${interfaceCode}\n\n${encoderCode}\n\n${decoderCode}`;
}

/**
 * Check if a type is a composite (has sequence/fields) or a type alias
 */
function isTypeAlias(typeDef: TypeDef): boolean {
  return !('sequence' in typeDef || 'fields' in typeDef);
}

/**
 * Get fields from a type definition (handles both 'sequence' and 'fields')
 */
function getTypeFields(typeDef: TypeDef): Field[] {
  if ('sequence' in typeDef && (typeDef as any).sequence) {
    return (typeDef as any).sequence;
  }
  if ('fields' in typeDef && (typeDef as any).fields) {
    return (typeDef as any).fields;
  }
  return [];
}

/**
 * Generate functional-style encoder for composite types
 */
function generateFunctionalEncoder(
  typeName: string,
  typeDef: TypeDef,
  schema: BinarySchema,
  globalEndianness: Endianness
): string {
  const fields = getTypeFields(typeDef);

  // Optimization: if struct has exactly 1 field and it's a pointer, encode the target directly
  if (fields.length === 1 && 'type' in fields[0]) {
    const field = fields[0];
    const fieldTypeDef = schema.types[field.type];
    if (fieldTypeDef && (fieldTypeDef as any).type === "pointer") {
      // Encode target type directly (pointers are transparent during encoding)
      const targetType = (fieldTypeDef as any).target_type;
      let code = `function encode${typeName}(stream: any, value: ${typeName}): void {\n`;
      code += `  encode${targetType}(stream, value.${field.name});\n`;
      code += `}`;
      return code;
    }
  }

  // Regular multi-field struct
  let code = `function encode${typeName}(stream: any, value: ${typeName}): void {\n`;

  for (const field of fields) {
    code += generateFunctionalEncodeField(field, schema, globalEndianness, "value", "  ");
  }

  code += `}`;
  return code;
}

/**
 * Generate functional-style decoder for composite types
 */
function generateFunctionalDecoder(
  typeName: string,
  typeDef: TypeDef,
  schema: BinarySchema,
  globalEndianness: Endianness
): string {
  const fields = getTypeFields(typeDef);

  // Optimization: if struct has exactly 1 field and it's a pointer, inline the logic
  if (fields.length === 1 && 'type' in fields[0]) {
    const field = fields[0];
    const fieldTypeDef = schema.types[field.type];
    if (fieldTypeDef && (fieldTypeDef as any).type === "pointer") {
      // Inline pointer logic
      return generateInlinedPointerDecoder(typeName, field.name, fieldTypeDef as any, schema, globalEndianness);
    }
  }

  // Check if any field is a field-based discriminated union
  const fieldBasedUnionIndex = fields.findIndex(f => {
    if (!('type' in f)) return false;
    if (f.type === 'discriminated_union') {
      const discriminator = (f as any).discriminator;
      return discriminator && discriminator.field;
    }
    return false;
  });

  if (fieldBasedUnionIndex >= 0) {
    // Generate decoder with early returns for field-based discriminated union
    return generateFunctionalDecoderWithEarlyReturns(typeName, fields, fieldBasedUnionIndex, schema, globalEndianness);
  }

  // Regular multi-field struct
  let code = `function decode${typeName}(stream: any): ${typeName} {\n`;

  // Decode each field
  for (const field of fields) {
    code += generateFunctionalDecodeField(field, schema, globalEndianness, "  ");
  }

  // Build return object
  const fieldNames = fields.filter(f => 'name' in f).map(f => f.name);
  code += `  return { ${fieldNames.join(", ")} };\n`;
  code += `}`;
  return code;
}

/**
 * Generate functional decoder with early returns for field-based discriminated unions
 */
function generateFunctionalDecoderWithEarlyReturns(
  typeName: string,
  fields: Field[],
  unionFieldIndex: number,
  schema: BinarySchema,
  globalEndianness: Endianness
): string {
  let code = `function decode${typeName}(stream: any): ${typeName} {\n`;

  // Decode all fields before the discriminated union
  for (let i = 0; i < unionFieldIndex; i++) {
    code += generateFunctionalDecodeField(fields[i], schema, globalEndianness, "  ");
  }

  // Get the discriminated union field
  const unionField = fields[unionFieldIndex] as any;
  const unionFieldName = unionField.name;
  const discriminator = unionField.discriminator;
  const variants = unionField.variants || [];
  const discriminatorField = discriminator.field;

  // Collect names of fields decoded before the union
  const beforeFieldNames = fields.slice(0, unionFieldIndex).filter(f => 'name' in f).map(f => f.name);

  // Generate if-else chain with early returns
  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    if (variant.when) {
      const condition = variant.when.replace(/\bvalue\b/g, discriminatorField);
      const ifKeyword = i === 0 ? "if" : "else if";

      code += `  ${ifKeyword} (${condition}) {\n`;
      code += `    const ${unionFieldName} = decode${variant.type}(stream);\n`;

      // Build return object with inlined discriminated union
      const returnFields = [
        ...beforeFieldNames,
        `${unionFieldName}: { type: '${variant.type}', value: ${unionFieldName} }`
      ];
      code += `    return { ${returnFields.join(", ")} };\n`;
      code += `  }`;
      if (i < variants.length - 1) {
        code += "\n";
      }
    } else {
      // Fallback variant
      code += ` else {\n`;
      code += `    const ${unionFieldName} = decode${variant.type}(stream);\n`;

      const returnFields = [
        ...beforeFieldNames,
        `${unionFieldName}: { type: '${variant.type}', value: ${unionFieldName} }`
      ];
      code += `    return { ${returnFields.join(", ")} };\n`;
      code += `  }\n`;
      code += `}`;
      return code;
    }
  }

  // No fallback - throw error
  code += ` else {\n`;
  code += `    throw new Error(\`Unknown discriminator value: \${${discriminatorField}}\`);\n`;
  code += `  }\n`;
  code += `}`;

  return code;
}

/**
 * Generate decoder for single-field struct with inlined pointer logic
 */
function generateInlinedPointerDecoder(
  typeName: string,
  fieldName: string,
  pointerDef: any,
  schema: BinarySchema,
  globalEndianness: Endianness
): string {
  const storage = pointerDef.storage;
  const offsetMask = pointerDef.offset_mask;
  const offsetFrom = pointerDef.offset_from;
  const targetType = pointerDef.target_type;
  const endianness = pointerDef.endianness || globalEndianness;

  let code = `function decode${typeName}(stream: any): ${typeName} {\n`;

  // Initialize visitedOffsets if needed
  code += `  if (!visitedOffsets) visitedOffsets = new Set<number>();\n\n`;

  // Read pointer storage value
  const storageMethodName = `read${capitalize(storage)}`;
  if (storage === "uint8") {
    code += `  const pointerValue = stream.${storageMethodName}();\n`;
  } else {
    code += `  const pointerValue = stream.${storageMethodName}('${endianessToShortForm(endianness)}');\n`;
  }

  // Extract offset using mask
  code += `  const offset = pointerValue & ${offsetMask};\n\n`;

  // Check for circular reference
  code += `  if (visitedOffsets.has(offset)) {\n`;
  code += `    throw new Error(\`Circular pointer reference detected at offset \${offset}\`);\n`;
  code += `  }\n`;
  code += `  visitedOffsets.add(offset);\n\n`;

  // Calculate actual seek position
  if (offsetFrom === "current_position") {
    code += `  const currentPos = stream.position;\n`;
    code += `  stream.pushPosition();\n`;
    code += `  stream.seek(currentPos + offset);\n`;
  } else {
    // message_start
    code += `  stream.pushPosition();\n`;
    code += `  stream.seek(offset);\n`;
  }

  // Decode target type
  code += `  const ${fieldName} = decode${targetType}(stream);\n\n`;

  // Restore position
  code += `  stream.popPosition();\n\n`;

  // Remove from visited set
  code += `  visitedOffsets.delete(offset);\n\n`;

  code += `  return { ${fieldName} };\n`;
  code += `}`;

  return code;
}

/**
 * Generate functional-style discriminated union
 */
function generateFunctionalDiscriminatedUnion(
  typeName: string,
  unionDef: any,
  schema: BinarySchema,
  globalEndianness: Endianness
): string {
  const discriminator = unionDef.discriminator || {};
  const variants = unionDef.variants || [];

  // Generate TypeScript union type
  let code = "";
  if (unionDef.description) {
    code += `// ${unionDef.description}\n`;
  }
  code += `export type ${typeName} = ${generateDiscriminatedUnionType(unionDef, schema)};\n\n`;

  // Generate encoder
  code += `function encode${typeName}(stream: any, value: ${typeName}): void {\n`;
  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    const ifKeyword = i === 0 ? "if" : "else if";
    code += `  ${ifKeyword} (value.type === '${variant.type}') {\n`;
    code += `    encode${variant.type}(stream, value.value);\n`;
    code += `  }`;
    if (i < variants.length - 1) {
      code += "\n";
    }
  }
  code += ` else {\n`;
  code += `    throw new Error(\`Unknown variant type: \${(value as any).type}\`);\n`;
  code += `  }\n`;
  code += `}\n\n`;

  // Generate decoder
  code += `function decode${typeName}(stream: any): ${typeName} {\n`;

  if (discriminator.peek) {
    // Peek-based discriminator
    const peekType = discriminator.peek;
    const endianness = discriminator.endianness || globalEndianness;
    const endiannessArg = peekType !== "uint8" ? `'${endianessToShortForm(endianness)}'` : "";

    code += `  const discriminator = stream.peek${capitalize(peekType)}(${endiannessArg});\n`;

    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      if (variant.when) {
        const condition = variant.when.replace(/\bvalue\b/g, 'discriminator');
        const ifKeyword = i === 0 ? "if" : "else if";
        code += `  ${ifKeyword} (${condition}) {\n`;
        code += `    const value = decode${variant.type}(stream);\n`;
        code += `    return { type: '${variant.type}', value };\n`;
        code += `  }`;
        if (i < variants.length - 1) {
          code += "\n";
        }
      } else {
        // Fallback
        code += ` else {\n`;
        code += `    const value = decode${variant.type}(stream);\n`;
        code += `    return { type: '${variant.type}', value };\n`;
        code += `  }\n`;
        code += `}`;
        return code;
      }
    }

    // No fallback - error
    code += ` else {\n`;
    code += `    throw new Error(\`Unknown discriminator: 0x\${discriminator.toString(16)}\`);\n`;
    code += `  }\n`;

  } else if (discriminator.field) {
    // Field-based discriminator
    const discriminatorField = discriminator.field;

    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      if (variant.when) {
        const condition = variant.when.replace(/\bvalue\b/g, discriminatorField);
        const ifKeyword = i === 0 ? "if" : "else if";
        code += `  ${ifKeyword} (${condition}) {\n`;
        code += `    const payload = decode${variant.type}(stream);\n`;
        code += `    return { type: '${variant.type}', value: payload };\n`;
        code += `  }`;
        if (i < variants.length - 1) {
          code += "\n";
        }
      } else {
        // Fallback
        code += ` else {\n`;
        code += `    const payload = decode${variant.type}(stream);\n`;
        code += `    return { type: '${variant.type}', value: payload };\n`;
        code += `  }\n`;
        code += `}`;
        return code;
      }
    }

    // No fallback - error
    code += ` else {\n`;
    code += `    throw new Error(\`Unknown discriminator value: \${${discriminatorField}}\`);\n`;
    code += `  }\n`;
  }

  code += `}`;
  return code;
}

/**
 * Generate functional-style pointer
 */
function generateFunctionalPointer(
  typeName: string,
  pointerDef: any,
  schema: BinarySchema,
  globalEndianness: Endianness
): string {
  const storage = pointerDef.storage;
  const offsetMask = pointerDef.offset_mask;
  const offsetFrom = pointerDef.offset_from;
  const targetType = pointerDef.target_type;
  const endianness = pointerDef.endianness || globalEndianness;

  // Generate type alias (transparent to target type)
  let code = "";
  if (pointerDef.description) {
    code += `// ${pointerDef.description}\n`;
  }
  code += `export type ${typeName} = ${targetType};\n\n`;

  // Generate encoder (just encode the target)
  code += `function encode${typeName}(stream: any, value: ${typeName}): void {\n`;
  code += `  encode${targetType}(stream, value);\n`;
  code += `}\n\n`;

  // Generate decoder (with pointer following logic)
  code += `function decode${typeName}(stream: any): ${typeName} {\n`;

  // Initialize visitedOffsets if needed
  code += `  if (!visitedOffsets) visitedOffsets = new Set<number>();\n`;
  code += `  visitedOffsets.clear();\n\n`;

  // Read pointer storage value
  const storageMethodName = `read${capitalize(storage)}`;
  if (storage === "uint8") {
    code += `  const pointerValue = stream.${storageMethodName}();\n`;
  } else {
    code += `  const pointerValue = stream.${storageMethodName}('${endianessToShortForm(endianness)}');\n`;
  }

  // Extract offset using mask
  code += `  const offset = pointerValue & ${offsetMask};\n\n`;

  // Check for circular reference
  code += `  if (visitedOffsets.has(offset)) {\n`;
  code += `    throw new Error(\`Circular pointer reference detected at offset \${offset}\`);\n`;
  code += `  }\n`;
  code += `  visitedOffsets.add(offset);\n\n`;

  // Calculate actual seek position
  if (offsetFrom === "current_position") {
    code += `  const currentPos = stream.position;\n`;
    code += `  stream.pushPosition();\n`;
    code += `  stream.seek(currentPos + offset);\n`;
  } else {
    // message_start
    code += `  stream.pushPosition();\n`;
    code += `  stream.seek(offset);\n`;
  }

  // Decode target type
  code += `  const value = decode${targetType}(stream);\n\n`;

  // Restore position
  code += `  stream.popPosition();\n\n`;

  // Cleanup visited offsets
  code += `  visitedOffsets.clear();\n`;

  code += `  return value;\n`;
  code += `}`;

  return code;
}

/**
 * Generate functional encoding for a field
 */
function generateFunctionalEncodeField(
  field: Field,
  schema: BinarySchema,
  globalEndianness: Endianness,
  valuePath: string,
  indent: string
): string {
  if (!('type' in field)) return "";

  const fieldName = field.name;
  const fieldPath = `${valuePath}.${fieldName}`;
  const fieldEndianness = 'endianness' in field && field.endianness ? field.endianness : globalEndianness;

  switch (field.type) {
    case "uint8":
      return `${indent}stream.writeUint8(${fieldPath});\n`;
    case "uint16":
      return `${indent}stream.writeUint16(${fieldPath}, '${endianessToShortForm(fieldEndianness)}');\n`;
    case "uint32":
      return `${indent}stream.writeUint32(${fieldPath}, '${endianessToShortForm(fieldEndianness)}');\n`;
    case "uint64":
      return `${indent}stream.writeUint64(${fieldPath}, '${endianessToShortForm(fieldEndianness)}');\n`;
    case "int8":
      return `${indent}stream.writeInt8(${fieldPath});\n`;
    case "int16":
      return `${indent}stream.writeInt16(${fieldPath}, '${endianessToShortForm(fieldEndianness)}');\n`;
    case "int32":
      return `${indent}stream.writeInt32(${fieldPath}, '${endianessToShortForm(fieldEndianness)}');\n`;
    case "int64":
      return `${indent}stream.writeInt64(${fieldPath}, '${endianessToShortForm(fieldEndianness)}');\n`;
    case "array":
      return generateFunctionalEncodeArray(field, schema, globalEndianness, fieldPath, indent);
    case "string":
      return generateFunctionalEncodeString(field, globalEndianness, fieldPath, indent);
    case "discriminated_union":
      return generateFunctionalEncodeDiscriminatedUnionField(field as any, schema, globalEndianness, fieldPath, indent);
    default:
      // Type reference - resolve pointers to their target type
      const resolvedType = resolvePointerType(field.type, schema);
      return `${indent}encode${resolvedType}(stream, ${fieldPath});\n`;
  }
}

/**
 * Generate functional encoding for discriminated union field
 */
function generateFunctionalEncodeDiscriminatedUnionField(
  field: any,
  schema: BinarySchema,
  globalEndianness: Endianness,
  valuePath: string,
  indent: string
): string {
  let code = "";
  const variants = field.variants || [];

  // Generate if-else chain for each variant
  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    const ifKeyword = i === 0 ? "if" : "else if";

    code += `${indent}${ifKeyword} (${valuePath}.type === '${variant.type}') {\n`;
    code += `${indent}  encode${variant.type}(stream, ${valuePath}.value);\n`;
    code += `${indent}}`;
    if (i < variants.length - 1) {
      code += "\n";
    }
  }

  // Add fallthrough error
  code += ` else {\n`;
  code += `${indent}  throw new Error(\`Unknown variant type: \${(${valuePath} as any).type}\`);\n`;
  code += `${indent}}\n`;

  return code;
}

/**
 * Resolve pointer types to their target type (for encoding - pointers are transparent)
 */
function resolvePointerType(typeName: string, schema: BinarySchema): string {
  const typeDef = schema.types[typeName];
  if (typeDef && (typeDef as any).type === "pointer") {
    return (typeDef as any).target_type;
  }
  return typeName;
}

/**
 * Generate functional encoding for array
 */
function generateFunctionalEncodeArray(
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
        code += `${indent}stream.writeUint16(${valuePath}.length, '${endianessToShortForm(globalEndianness)}');\n`;
        break;
      case "uint32":
        code += `${indent}stream.writeUint32(${valuePath}.length, '${endianessToShortForm(globalEndianness)}');\n`;
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

  return code;
}

/**
 * Generate functional encoding for string
 */
function generateFunctionalEncodeString(
  field: any,
  globalEndianness: Endianness,
  valuePath: string,
  indent: string
): string {
  const encoding = field.encoding || "utf8";
  const kind = field.kind;
  let code = "";

  const bytesVarName = valuePath.replace(/\./g, "_") + "_bytes";

  // Convert string to bytes
  if (encoding === "utf8") {
    code += `${indent}const ${bytesVarName} = new TextEncoder().encode(${valuePath});\n`;
  } else if (encoding === "ascii") {
    code += `${indent}const ${bytesVarName} = Array.from(${valuePath}, c => c.charCodeAt(0));\n`;
  }

  if (kind === "length_prefixed") {
    const lengthType = field.length_type || "uint8";
    switch (lengthType) {
      case "uint8":
        code += `${indent}stream.writeUint8(${bytesVarName}.length);\n`;
        break;
      case "uint16":
        code += `${indent}stream.writeUint16(${bytesVarName}.length, '${endianessToShortForm(globalEndianness)}');\n`;
        break;
    }
    code += `${indent}for (const byte of ${bytesVarName}) {\n`;
    code += `${indent}  stream.writeUint8(byte);\n`;
    code += `${indent}}\n`;
  } else if (kind === "null_terminated") {
    code += `${indent}for (const byte of ${bytesVarName}) {\n`;
    code += `${indent}  stream.writeUint8(byte);\n`;
    code += `${indent}}\n`;
    code += `${indent}stream.writeUint8(0);\n`;
  } else if (kind === "fixed") {
    const fixedLength = field.length || 0;
    code += `${indent}for (let i = 0; i < ${fixedLength}; i++) {\n`;
    code += `${indent}  stream.writeUint8(i < ${bytesVarName}.length ? ${bytesVarName}[i] : 0);\n`;
    code += `${indent}}\n`;
  }

  return code;
}

/**
 * Generate functional decoding for a field
 */
function generateFunctionalDecodeField(
  field: Field,
  schema: BinarySchema,
  globalEndianness: Endianness,
  indent: string
): string {
  if (!('type' in field)) return "";

  const fieldName = field.name;
  const fieldEndianness = 'endianness' in field && field.endianness ? field.endianness : globalEndianness;

  switch (field.type) {
    case "uint8":
      return `${indent}const ${fieldName} = stream.readUint8();\n`;
    case "uint16":
      return `${indent}const ${fieldName} = stream.readUint16('${endianessToShortForm(fieldEndianness)}');\n`;
    case "uint32":
      return `${indent}const ${fieldName} = stream.readUint32('${endianessToShortForm(fieldEndianness)}');\n`;
    case "uint64":
      return `${indent}const ${fieldName} = stream.readUint64('${endianessToShortForm(fieldEndianness)}');\n`;
    case "int8":
      return `${indent}const ${fieldName} = stream.readInt8();\n`;
    case "int16":
      return `${indent}const ${fieldName} = stream.readInt16('${endianessToShortForm(fieldEndianness)}');\n`;
    case "int32":
      return `${indent}const ${fieldName} = stream.readInt32('${endianessToShortForm(fieldEndianness)}');\n`;
    case "int64":
      return `${indent}const ${fieldName} = stream.readInt64('${endianessToShortForm(fieldEndianness)}');\n`;
    case "array":
      return generateFunctionalDecodeArray(field, schema, globalEndianness, fieldName, indent);
    case "string":
      return generateFunctionalDecodeString(field, globalEndianness, fieldName, indent);
    case "discriminated_union":
      return generateFunctionalDecodeDiscriminatedUnionField(field as any, schema, globalEndianness, fieldName, indent);
    default:
      // Type reference - always call the decoder function
      return `${indent}const ${fieldName} = decode${field.type}(stream);\n`;
  }
}

/**
 * Generate functional decoding for discriminated union field
 */
function generateFunctionalDecodeDiscriminatedUnionField(
  field: any,
  schema: BinarySchema,
  globalEndianness: Endianness,
  fieldName: string,
  indent: string
): string {
  let code = "";
  const discriminator = field.discriminator || {};
  const variants = field.variants || [];

  // Get the union type for the field
  const unionType = generateDiscriminatedUnionType(field, schema);

  // Declare variable with let (will be assigned conditionally)
  code += `${indent}let ${fieldName}: ${unionType};\n`;

  if (discriminator.peek) {
    // Peek-based discriminator
    const peekType = discriminator.peek;
    const endianness = discriminator.endianness || globalEndianness;
    const endiannessArg = peekType !== "uint8" ? `'${endianessToShortForm(endianness)}'` : "";

    code += `${indent}const discriminator = stream.peek${capitalize(peekType)}(${endiannessArg});\n`;

    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      if (variant.when) {
        const condition = variant.when.replace(/\bvalue\b/g, 'discriminator');
        const ifKeyword = i === 0 ? "if" : "else if";
        code += `${indent}${ifKeyword} (${condition}) {\n`;
        code += `${indent}  const value = decode${variant.type}(stream);\n`;
        code += `${indent}  ${fieldName} = { type: '${variant.type}', value };\n`;
        code += `${indent}}`;
        if (i < variants.length - 1) {
          code += "\n";
        }
      } else {
        // Fallback
        code += ` else {\n`;
        code += `${indent}  const value = decode${variant.type}(stream);\n`;
        code += `${indent}  ${fieldName} = { type: '${variant.type}', value };\n`;
        code += `${indent}}\n`;
        return code;
      }
    }

    // No fallback - error
    code += ` else {\n`;
    code += `${indent}  throw new Error(\`Unknown discriminator: 0x\${discriminator.toString(16)}\`);\n`;
    code += `${indent}}\n`;

  } else if (discriminator.field) {
    // Field-based discriminator
    const discriminatorField = discriminator.field;

    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      if (variant.when) {
        const condition = variant.when.replace(/\bvalue\b/g, discriminatorField);
        const ifKeyword = i === 0 ? "if" : "else if";
        code += `${indent}${ifKeyword} (${condition}) {\n`;
        code += `${indent}  const value = decode${variant.type}(stream);\n`;
        code += `${indent}  ${fieldName} = { type: '${variant.type}', value };\n`;
        code += `${indent}}`;
        if (i < variants.length - 1) {
          code += "\n";
        }
      } else {
        // Fallback
        code += ` else {\n`;
        code += `${indent}  const value = decode${variant.type}(stream);\n`;
        code += `${indent}  ${fieldName} = { type: '${variant.type}', value };\n`;
        code += `${indent}}\n`;
        return code;
      }
    }

    // No fallback - error
    code += ` else {\n`;
    code += `${indent}  throw new Error(\`Unknown discriminator value: \${${discriminatorField}}\`);\n`;
    code += `${indent}}\n`;
  }

  return code;
}

/**
 * Generate functional decoding for array
 */
function generateFunctionalDecodeArray(
  field: any,
  schema: BinarySchema,
  globalEndianness: Endianness,
  fieldName: string,
  indent: string
): string {
  // Get proper type annotation for array
  const itemType = field.items?.type || "any";
  const typeAnnotation = `${itemType}[]`;
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
        lengthRead = `stream.readUint16('${endianessToShortForm(globalEndianness)}')`;
        break;
      case "uint32":
        lengthRead = `stream.readUint32('${endianessToShortForm(globalEndianness)}')`;
        break;
    }
    code += `${indent}const ${fieldName}_length = ${lengthRead};\n`;
    code += `${indent}for (let i = 0; i < ${fieldName}_length; i++) {\n`;
  } else if (field.kind === "fixed") {
    code += `${indent}for (let i = 0; i < ${field.length}; i++) {\n`;
  }

  // Read array item (reuse itemType from line 683)
  if (itemType === "uint8") {
    code += `${indent}  ${fieldName}.push(stream.readUint8());\n`;
  } else {
    code += `${indent}  ${fieldName}.push(decode${itemType}(stream));\n`;
  }
  code += `${indent}}\n`;

  return code;
}

/**
 * Generate functional decoding for string
 */
function generateFunctionalDecodeString(
  field: any,
  globalEndianness: Endianness,
  fieldName: string,
  indent: string
): string {
  const encoding = field.encoding || "utf8";
  const kind = field.kind;
  let code = "";

  if (kind === "length_prefixed") {
    const lengthType = field.length_type || "uint8";
    let lengthRead = "";
    switch (lengthType) {
      case "uint8":
        lengthRead = "stream.readUint8()";
        break;
      case "uint16":
        lengthRead = `stream.readUint16('${endianessToShortForm(globalEndianness)}')`;
        break;
      case "uint32":
        lengthRead = `stream.readUint32('${endianessToShortForm(globalEndianness)}')`;
        break;
    }

    code += `${indent}const ${fieldName}_length = ${lengthRead};\n`;
    code += `${indent}const ${fieldName}_bytes: number[] = [];\n`;
    code += `${indent}for (let i = 0; i < ${fieldName}_length; i++) {\n`;
    code += `${indent}  ${fieldName}_bytes.push(stream.readUint8());\n`;
    code += `${indent}}\n`;

    if (encoding === "utf8") {
      code += `${indent}const ${fieldName} = new TextDecoder().decode(new Uint8Array(${fieldName}_bytes));\n`;
    } else if (encoding === "ascii") {
      code += `${indent}const ${fieldName} = String.fromCharCode(...${fieldName}_bytes);\n`;
    }
  } else if (kind === "null_terminated") {
    code += `${indent}const ${fieldName}_bytes: number[] = [];\n`;
    code += `${indent}while (true) {\n`;
    code += `${indent}  const byte = stream.readUint8();\n`;
    code += `${indent}  if (byte === 0) break;\n`;
    code += `${indent}  ${fieldName}_bytes.push(byte);\n`;
    code += `${indent}}\n`;

    if (encoding === "utf8") {
      code += `${indent}const ${fieldName} = new TextDecoder().decode(new Uint8Array(${fieldName}_bytes));\n`;
    } else if (encoding === "ascii") {
      code += `${indent}const ${fieldName} = String.fromCharCode(...${fieldName}_bytes);\n`;
    }
  } else if (kind === "fixed") {
    const fixedLength = field.length || 0;
    code += `${indent}const ${fieldName}_bytes: number[] = [];\n`;
    code += `${indent}for (let i = 0; i < ${fixedLength}; i++) {\n`;
    code += `${indent}  ${fieldName}_bytes.push(stream.readUint8());\n`;
    code += `${indent}}\n`;
    code += `${indent}let actualLength = ${fieldName}_bytes.indexOf(0);\n`;
    code += `${indent}if (actualLength === -1) actualLength = ${fieldName}_bytes.length;\n`;

    if (encoding === "utf8") {
      code += `${indent}const ${fieldName} = new TextDecoder().decode(new Uint8Array(${fieldName}_bytes.slice(0, actualLength)));\n`;
    } else if (encoding === "ascii") {
      code += `${indent}const ${fieldName} = String.fromCharCode(...${fieldName}_bytes.slice(0, actualLength));\n`;
    }
  }

  return code;
}

/**
 * Generate code for a single type
 */
function generateTypeCode(
  typeName: string,
  typeDef: TypeDef,
  schema: BinarySchema,
  globalEndianness: Endianness,
  globalBitOrder: string
): string {
  // Check if this is a type alias or composite type
  if (isTypeAlias(typeDef)) {
    // Type alias - generate type alias, encoder, and decoder
    return generateTypeAliasCode(typeName, typeDef, schema, globalEndianness, globalBitOrder);
  }

  // Composite type - generate interface, encoder, and decoder
  const interfaceCode = generateInterface(typeName, typeDef, schema);
  const encoderCode = generateEncoder(typeName, typeDef, schema, globalEndianness, globalBitOrder);
  const decoderCode = generateDecoder(typeName, typeDef, schema, globalEndianness, globalBitOrder);

  return `${interfaceCode}\n\n${encoderCode}\n\n${decoderCode}`;
}

/**
 * Generate code for a type alias (non-composite type)
 */
function generateTypeAliasCode(
  typeName: string,
  typeDef: TypeDef,
  schema: BinarySchema,
  globalEndianness: Endianness,
  globalBitOrder: string
): string {
  // Type alias is stored as an element type (no 'name' field)
  const aliasedType = typeDef as any; // Cast to any since it's an element type
  const tsType = getElementTypeScriptType(aliasedType, schema);

  // Generate type alias
  const typeAliasCode = `export type ${typeName} = ${tsType};`;

  // Generate encoder
  const encoderCode = generateTypeAliasEncoder(typeName, aliasedType, schema, globalEndianness, globalBitOrder);

  // Generate decoder
  const decoderCode = generateTypeAliasDecoder(typeName, aliasedType, schema, globalEndianness, globalBitOrder);

  return `${typeAliasCode}\n\n${encoderCode}\n\n${decoderCode}`;
}

/**
 * Get TypeScript type for an element (like getFieldTypeScriptType but without 'name')
 */
function getElementTypeScriptType(element: any, schema: BinarySchema): string {
  if (!element || typeof element !== 'object') {
    return "any";
  }

  if ('type' in element) {
    switch (element.type) {
      case "bit":
      case "uint8":
      case "uint16":
      case "uint32":
      case "int8":
      case "int16":
      case "int32":
      case "float32":
      case "float64":
        return "number";
      case "uint64":
      case "int64":
        return "bigint";
      case "array":
        const itemType = getElementTypeScriptType(element.items, schema);
        return `${itemType}[]`;
      case "string":
        return "string";
      case "discriminated_union":
        // Generate union type from variants
        return generateDiscriminatedUnionType(element, schema);
      case "pointer":
        // Pointer is transparent - just the target type
        return resolveTypeReference(element.target_type, schema);
      default:
        // Type reference
        return resolveTypeReference(element.type, schema);
    }
  }
  return "any";
}

/**
 * Generate TypeScript union type for discriminated union variants
 */
function generateDiscriminatedUnionType(unionDef: any, schema: BinarySchema): string {
  const variants: string[] = [];
  for (const variant of unionDef.variants) {
    const variantType = resolveTypeReference(variant.type, schema);
    variants.push(`{ type: '${variant.type}'; value: ${variantType} }`);
  }
  return "\n  | " + variants.join("\n  | ");
}

/**
 * Generate encoder for a type alias
 */
function generateTypeAliasEncoder(
  typeName: string,
  aliasedType: any,
  schema: BinarySchema,
  globalEndianness: Endianness,
  globalBitOrder: string
): string {
  let code = `export class ${typeName}Encoder extends BitStreamEncoder {\n`;
  code += `  constructor() {\n`;
  code += `    super("${globalBitOrder}");\n`;
  code += `  }\n\n`;
  code += `  encode(value: ${typeName}): Uint8Array {\n`;

  // Generate encoding logic for the aliased type
  // Create a pseudo-field with no name to use existing encoding logic
  const pseudoField = { ...aliasedType, name: 'value' };
  code += generateEncodeFieldCoreImpl(pseudoField, schema, globalEndianness, 'value', '    ');

  code += `    return this.finish();\n`;
  code += `  }\n`;
  code += `}`;

  return code;
}

/**
 * Generate decoder for a type alias
 */
function generateTypeAliasDecoder(
  typeName: string,
  aliasedType: any,
  schema: BinarySchema,
  globalEndianness: Endianness,
  globalBitOrder: string
): string {
  let code = `export class ${typeName}Decoder extends BitStreamDecoder {\n`;
  code += `  constructor(bytes: Uint8Array | number[]) {\n`;
  code += `    super(bytes, "${globalBitOrder}");\n`;
  code += `  }\n\n`;
  code += `  decode(): ${typeName} {\n`;

  // For simple types, decode directly and return
  // For complex types (arrays, etc), use existing decoding logic
  if ('type' in aliasedType) {
    switch (aliasedType.type) {
      case "array":
        // Use existing array decoding logic
        code += `    let value: any;\n`;
        code += generateDecodeFieldCoreImpl(
          { ...aliasedType, name: 'result' },
          schema,
          globalEndianness,
          'result',
          '    '
        );
        code += `    return value.result;\n`;
        break;
      default:
        // For primitives and type references, decode and return directly
        code += `    let value: any;\n`;
        code += generateDecodeFieldCoreImpl(
          { ...aliasedType, name: 'result' },
          schema,
          globalEndianness,
          'result',
          '    '
        );
        code += `    return value.result;\n`;
    }
  }

  code += `  }\n`;
  code += `}`;

  return code;
}

/**
 * Generate TypeScript interface for a composite type
 */
function generateInterface(typeName: string, typeDef: TypeDef, schema: BinarySchema): string {
  const fields = getTypeFields(typeDef);
  let code = `export interface ${typeName} {\n`;

  for (const field of fields) {
    const fieldType = getFieldTypeScriptType(field, schema);
    const optional = isFieldConditional(field) ? "?" : "";
    code += `  ${field.name}${optional}: ${fieldType};\n`;
  }

  code += `}`;
  return code;
}

/**
 * Get TypeScript type for a field
 */
function getFieldTypeScriptType(field: Field, schema: BinarySchema): string {
  // Safety check
  if (!field || typeof field !== 'object') {
    return "any";
  }

  if ('type' in field) {
    switch (field.type) {
      case "bit":
      case "uint8":
      case "uint16":
      case "uint32":
      case "int8":
      case "int16":
      case "int32":
      case "float32":
      case "float64":
        return "number";
      case "uint64":
      case "int64":
        return "bigint";
      case "array":
        const itemType = getFieldTypeScriptType(field.items as Field, schema);
        return `${itemType}[]`;
      case "string":
        return "string";
      case "bitfield":
        // Bitfield is an object with named fields
        return `{ ${field.fields!.map((f: any) => `${f.name}: number`).join(", ")} }`;
      case "discriminated_union":
        // Generate union type from variants
        return generateDiscriminatedUnionType(field, schema);
      case "pointer":
        // Pointer is transparent - just the target type
        return resolveTypeReference((field as any).target_type, schema);
      default:
        // Type reference (e.g., "Point", "Optional<uint64>")
        return resolveTypeReference(field.type, schema);
    }
  }
  return "any";
}

/**
 * Resolve type reference (handles generics like Optional<T>)
 */
function resolveTypeReference(typeRef: string, schema: BinarySchema): string {
  // Check for generic syntax: Optional<T>
  const genericMatch = typeRef.match(/^(\w+)<(.+)>$/);
  if (genericMatch) {
    const [, genericType, typeArg] = genericMatch;
    const templateDef = schema.types[`${genericType}<T>`] as TypeDef | undefined;

    if (templateDef) {
      const templateFields = getTypeFields(templateDef);
      // Generate inline interface structure
      const fields: string[] = [];
      for (const field of templateFields) {
        // Get the TypeScript type for the field, replacing T with typeArg
        let fieldType: string;
        if ('type' in field && field.type === 'T') {
          // Direct T reference - replace with type argument
          fieldType = getFieldTypeScriptType({ ...field, type: typeArg } as any, schema);
        } else {
          fieldType = getFieldTypeScriptType(field, schema);
        }

        const optional = isFieldConditional(field) ? "?" : "";
        fields.push(`${field.name}${optional}: ${fieldType}`);
      }
      return `{ ${fields.join(", ")} }`;
    }
  }

  // Simple type reference - sanitize to avoid TypeScript keyword conflicts
  return sanitizeTypeName(typeRef);
}

/**
 * Check if field is conditional
 */
function isFieldConditional(field: Field): boolean {
  return 'conditional' in field && field.conditional !== undefined;
}

/**
 * Convert conditional expression to TypeScript code
 * E.g., "flags & 0x01" -> "value.flags & 0x01"
 * E.g., "header.flags & 0x01" -> "value.header.flags & 0x01"
 * E.g., "settings.config.enabled == 1" -> "value.settings.config.enabled == 1"
 * For nested paths, basePath might be "value.maybe_id", so "present == 1" -> "value.maybe_id.present == 1"
 */
function convertConditionalToTypeScript(condition: string, basePath: string = "value"): string {
  // Replace field paths (including nested paths like "header.flags" or "settings.config.enabled")
  // with basePath prefixed versions (e.g., "value.header.flags")
  //
  // Strategy: Match field paths (identifier sequences separated by dots) and prepend basePath
  // Example: "header.flags & 0x01" matches "header.flags" as a field path

  return condition.replace(/\b([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)\b/g, (match) => {
    // Don't replace operators, keywords, or hex literals
    if (['true', 'false', 'null', 'undefined'].includes(match)) {
      return match;
    }
    // Prepend basePath to the field path
    return `${basePath}.${match}`;
  });
}

/**
 * Generate encoder class
 */
function generateEncoder(
  typeName: string,
  typeDef: TypeDef,
  schema: BinarySchema,
  globalEndianness: Endianness,
  globalBitOrder: string
): string {
  const fields = getTypeFields(typeDef);
  let code = `export class ${typeName}Encoder extends BitStreamEncoder {\n`;
  code += `  constructor() {\n`;
  code += `    super("${globalBitOrder}");\n`;
  code += `  }\n\n`;

  // Generate encode method
  code += `  encode(value: ${typeName}): Uint8Array {\n`;

  for (const field of fields) {
    code += generateEncodeField(field, schema, globalEndianness, "    ");
  }

  code += `    return this.finish();\n`;
  code += `  }\n`;
  code += `}`;

  return code;
}

/**
 * Generate encoding code for a single field
 */
function generateEncodeField(
  field: Field,
  schema: BinarySchema,
  globalEndianness: Endianness,
  indent: string
): string {
  if (!('type' in field)) return "";

  const fieldName = field.name;
  const valuePath = `value.${fieldName}`;

  // generateEncodeFieldCore handles both conditional and non-conditional fields
  return generateEncodeFieldCore(field, schema, globalEndianness, valuePath, indent);
}

/**
 * Generate core encoding logic for a field
 */
function generateEncodeFieldCore(
  field: Field,
  schema: BinarySchema,
  globalEndianness: Endianness,
  valuePath: string,
  indent: string
): string {
  if (!('type' in field)) return "";

  // Handle conditional fields
  if (isFieldConditional(field)) {
    const condition = field.conditional!;
    // Extract parent path from valuePath (e.g., "value.maybe_id.present" -> "value.maybe_id")
    const lastDotIndex = valuePath.lastIndexOf('.');
    const basePath = lastDotIndex > 0 ? valuePath.substring(0, lastDotIndex) : "value";
    const tsCondition = convertConditionalToTypeScript(condition, basePath);
    // Encode field if condition is true AND value is defined
    let code = `${indent}if (${tsCondition} && ${valuePath} !== undefined) {\n`;
    code += generateEncodeFieldCoreImpl(field, schema, globalEndianness, valuePath, indent + "  ");
    code += `${indent}}\n`;
    return code;
  }

  return generateEncodeFieldCoreImpl(field, schema, globalEndianness, valuePath, indent);
}

/**
 * Generate core encoding logic implementation (without conditional wrapper)
 */
function generateEncodeFieldCoreImpl(
  field: Field,
  schema: BinarySchema,
  globalEndianness: Endianness,
  valuePath: string,
  indent: string
): string {
  if (!('type' in field)) return "";

  const endianness = 'endianness' in field && field.endianness
    ? field.endianness
    : globalEndianness;

  switch (field.type) {
    case "bit":
      return `${indent}this.writeBits(${valuePath}, ${field.size});\n`;

    case "uint8":
      return `${indent}this.writeUint8(${valuePath});\n`;

    case "uint16":
      return `${indent}this.writeUint16(${valuePath}, "${endianness}");\n`;

    case "uint32":
      return `${indent}this.writeUint32(${valuePath}, "${endianness}");\n`;

    case "uint64":
      return `${indent}this.writeUint64(${valuePath}, "${endianness}");\n`;

    case "int8":
      return `${indent}this.writeInt8(${valuePath});\n`;

    case "int16":
      return `${indent}this.writeInt16(${valuePath}, "${endianness}");\n`;

    case "int32":
      return `${indent}this.writeInt32(${valuePath}, "${endianness}");\n`;

    case "int64":
      return `${indent}this.writeInt64(${valuePath}, "${endianness}");\n`;

    case "float32":
      return `${indent}this.writeFloat32(${valuePath}, "${endianness}");\n`;

    case "float64":
      return `${indent}this.writeFloat64(${valuePath}, "${endianness}");\n`;

    case "array":
      return generateEncodeArray(field, schema, globalEndianness, valuePath, indent);

    case "string":
      return generateEncodeString(field, globalEndianness, valuePath, indent);

    case "bitfield":
      return generateEncodeBitfield(field, valuePath, indent);

    case "discriminated_union":
      return generateEncodeDiscriminatedUnion(field, schema, globalEndianness, valuePath, indent);

    case "pointer":
      return generateEncodePointer(field, schema, globalEndianness, valuePath, indent);

    default:
      // Type reference - need to encode nested struct
      return generateEncodeTypeReference(field.type, schema, valuePath, indent);
  }
}

/**
 * Generate encoding for discriminated union
 */
function generateEncodeDiscriminatedUnion(
  field: any,
  schema: BinarySchema,
  globalEndianness: Endianness,
  valuePath: string,
  indent: string
): string {
  let code = "";
  const variants = field.variants || [];

  // Generate if-else chain for each variant
  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    const ifKeyword = i === 0 ? "if" : "else if";

    code += `${indent}${ifKeyword} (${valuePath}.type === '${variant.type}') {\n`;

    // Encode the variant value by calling the type's encoder
    code += generateEncodeTypeReference(variant.type, schema, `${valuePath}.value`, indent + "  ");

    code += `${indent}}`;
    if (i < variants.length - 1) {
      code += "\n";
    }
  }

  // Add fallthrough error
  code += ` else {\n`;
  code += `${indent}  throw new Error(\`Unknown variant type: \${(${valuePath} as any).type}\`);\n`;
  code += `${indent}}\n`;

  return code;
}

/**
 * Generate encoding for pointer
 */
function generateEncodePointer(
  field: any,
  schema: BinarySchema,
  globalEndianness: Endianness,
  valuePath: string,
  indent: string
): string {
  // Pointer encoding: just encode the target value directly
  // The pointer itself is transparent at the encoding level
  return generateEncodeTypeReference(field.target_type, schema, valuePath, indent);
}

/**
 * Generate encoding for array field
 */
function generateEncodeArray(
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

  // Safety check for items field
  if (!field.items || typeof field.items !== 'object' || !('type' in field.items)) {
    return `${indent}// ERROR: Array field '${valuePath}' has undefined or invalid items\n`;
  }

  // Write array elements
  // Use unique variable name to avoid shadowing in nested arrays
  const itemVar = valuePath.replace(/[.\[\]]/g, "_") + "_item";
  code += `${indent}for (const ${itemVar} of ${valuePath}) {\n`;
  code += generateEncodeFieldCoreImpl(
    field.items as Field,
    schema,
    globalEndianness,
    itemVar,
    indent + "  "
  );
  code += `${indent}}\n`;

  // Write null terminator if null_terminated
  if (field.kind === "null_terminated") {
    code += `${indent}this.writeUint8(0);\n`;
  }

  return code;
}

/**
 * Generate encoding for string field
 */
function generateEncodeString(
  field: any,
  globalEndianness: Endianness,
  valuePath: string,
  indent: string
): string {
  const encoding = field.encoding || "utf8";
  const kind = field.kind;
  let code = "";

  // Sanitize variable name (replace dots with underscores)
  const bytesVarName = valuePath.replace(/\./g, "_") + "_bytes";

  // Convert string to bytes
  if (encoding === "utf8") {
    code += `${indent}const ${bytesVarName} = new TextEncoder().encode(${valuePath});\n`;
  } else if (encoding === "ascii") {
    code += `${indent}const ${bytesVarName} = Array.from(${valuePath}, c => c.charCodeAt(0));\n`;
  }

  if (kind === "length_prefixed") {
    const lengthType = field.length_type || "uint8";
    // Write length prefix
    switch (lengthType) {
      case "uint8":
        code += `${indent}this.writeUint8(${bytesVarName}.length);\n`;
        break;
      case "uint16":
        code += `${indent}this.writeUint16(${bytesVarName}.length, "${globalEndianness}");\n`;
        break;
      case "uint32":
        code += `${indent}this.writeUint32(${bytesVarName}.length, "${globalEndianness}");\n`;
        break;
      case "uint64":
        code += `${indent}this.writeUint64(BigInt(${bytesVarName}.length), "${globalEndianness}");\n`;
        break;
    }
    // Write bytes
    code += `${indent}for (const byte of ${bytesVarName}) {\n`;
    code += `${indent}  this.writeUint8(byte);\n`;
    code += `${indent}}\n`;
  } else if (kind === "null_terminated") {
    // Write bytes
    code += `${indent}for (const byte of ${bytesVarName}) {\n`;
    code += `${indent}  this.writeUint8(byte);\n`;
    code += `${indent}}\n`;
    // Write null terminator
    code += `${indent}this.writeUint8(0);\n`;
  } else if (kind === "fixed") {
    const fixedLength = field.length || 0;
    // Write bytes (padded or truncated to fixed length)
    code += `${indent}for (let i = 0; i < ${fixedLength}; i++) {\n`;
    code += `${indent}  this.writeUint8(i < ${bytesVarName}.length ? ${bytesVarName}[i] : 0);\n`;
    code += `${indent}}\n`;
  }

  return code;
}

/**
 * Generate encoding for bitfield
 */
function generateEncodeBitfield(field: any, valuePath: string, indent: string): string {
  let code = "";

  for (const subField of field.fields) {
    code += `${indent}this.writeBits(${valuePath}.${subField.name}, ${subField.size});\n`;
  }

  return code;
}

/**
 * Generate encoding for type reference
 */
function generateEncodeTypeReference(
  typeRef: string,
  schema: BinarySchema,
  valuePath: string,
  indent: string
): string {
  // Check if this is a generic type instantiation (e.g., Optional<uint64>)
  const genericMatch = typeRef.match(/^(\w+)<(.+)>$/);
  if (genericMatch) {
    const [, genericType, typeArg] = genericMatch;
    const templateDef = schema.types[`${genericType}<T>`] as TypeDef | undefined;

    if (templateDef) {
      const templateFields = getTypeFields(templateDef);
      // Inline expand the generic by replacing T with the type argument
      let code = "";
      for (const field of templateFields) {
        // Replace T with the actual type
        const expandedField = JSON.parse(
          JSON.stringify(field).replace(/"T"/g, `"${typeArg}"`)
        );
        const newValuePath = `${valuePath}.${expandedField.name}`;
        code += generateEncodeFieldCore(expandedField, schema, "big_endian", newValuePath, indent);
      }
      return code;
    }
  }

  // Regular type reference (not generic)
  const typeDef = schema.types[typeRef] as TypeDef | undefined;
  if (!typeDef) {
    return `${indent}// TODO: Unknown type ${typeRef}\n`;
  }

  // Check if this is a type alias
  if (isTypeAlias(typeDef)) {
    // Type alias - encode directly using the aliased type
    const aliasedType = typeDef as any;
    const pseudoField = { ...aliasedType, name: valuePath.split('.').pop() };
    return generateEncodeFieldCoreImpl(pseudoField, schema, "big_endian", valuePath, indent);
  }

  // Composite type - encode all fields
  const fields = getTypeFields(typeDef);
  let code = "";
  for (const field of fields) {
    const newValuePath = `${valuePath}.${field.name}`;
    code += generateEncodeFieldCore(field, schema, "big_endian", newValuePath, indent);
  }

  return code;
}

/**
 * Generate decoder class
 */
function generateDecoder(
  typeName: string,
  typeDef: TypeDef,
  schema: BinarySchema,
  globalEndianness: Endianness,
  globalBitOrder: string
): string {
  const fields = getTypeFields(typeDef);
  let code = `export class ${typeName}Decoder extends BitStreamDecoder {\n`;
  code += `  constructor(bytes: Uint8Array | number[]) {\n`;
  code += `    super(bytes, "${globalBitOrder}");\n`;
  code += `  }\n\n`;
  code += `  decode(): ${typeName} {\n`;
  code += `    const value: any = {};\n\n`;

  for (const field of fields) {
    code += generateDecodeField(field, schema, globalEndianness, "    ");
  }

  code += `    return value;\n`;
  code += `  }\n`;
  code += `}`;

  return code;
}

/**
 * Generate decoding code for a single field
 */
function generateDecodeField(
  field: Field,
  schema: BinarySchema,
  globalEndianness: Endianness,
  indent: string
): string {
  if (!('type' in field)) return "";

  const fieldName = field.name;

  // generateDecodeFieldCore handles both conditional and non-conditional fields
  return generateDecodeFieldCore(field, schema, globalEndianness, fieldName, indent);
}

/**
 * Generate core decoding logic for a field
 */
function generateDecodeFieldCore(
  field: Field,
  schema: BinarySchema,
  globalEndianness: Endianness,
  fieldName: string,
  indent: string
): string {
  if (!('type' in field)) return "";

  // Handle conditional fields
  if (isFieldConditional(field)) {
    const condition = field.conditional!;
    const targetPath = getTargetPath(fieldName);
    const lastDotIndex = targetPath.lastIndexOf('.');
    const basePath = lastDotIndex > 0 ? targetPath.substring(0, lastDotIndex) : "value";
    const tsCondition = convertConditionalToTypeScript(condition, basePath);
    let code = `${indent}if (${tsCondition}) {\n`;
    code += generateDecodeFieldCoreImpl(field, schema, globalEndianness, fieldName, indent + "  ");
    code += `${indent}}\n`;
    return code;
  }

  return generateDecodeFieldCoreImpl(field, schema, globalEndianness, fieldName, indent);
}

/**
 * Generate core decoding logic implementation (without conditional wrapper)
 */
function generateDecodeFieldCoreImpl(
  field: Field,
  schema: BinarySchema,
  globalEndianness: Endianness,
  fieldName: string,
  indent: string
): string {
  if (!('type' in field)) return "";

  const endianness = 'endianness' in field && field.endianness
    ? field.endianness
    : globalEndianness;

  // Determine target: array item variables (containing '_item') are used directly,
  // otherwise they're accessed as properties of 'value'
  // E.g., "shapes_item" or "shapes_item.vertices" should not be prefixed with "value."
  const isArrayItem = fieldName.includes("_item");
  const target = isArrayItem ? fieldName : `value.${fieldName}`;

  switch (field.type) {
    case "bit":
      // Keep as bigint for > 53 bits to preserve precision (MAX_SAFE_INTEGER = 2^53 - 1)
      if (field.size > 53) {
        return `${indent}${target} = this.readBits(${field.size});\n`;
      }
      return `${indent}${target} = Number(this.readBits(${field.size}));\n`;

    case "uint8":
      return `${indent}${target} = this.readUint8();\n`;

    case "uint16":
      return `${indent}${target} = this.readUint16("${endianness}");\n`;

    case "uint32":
      return `${indent}${target} = this.readUint32("${endianness}");\n`;

    case "uint64":
      return `${indent}${target} = this.readUint64("${endianness}");\n`;

    case "int8":
      return `${indent}${target} = this.readInt8();\n`;

    case "int16":
      return `${indent}${target} = this.readInt16("${endianness}");\n`;

    case "int32":
      return `${indent}${target} = this.readInt32("${endianness}");\n`;

    case "int64":
      return `${indent}${target} = this.readInt64("${endianness}");\n`;

    case "float32":
      return `${indent}${target} = this.readFloat32("${endianness}");\n`;

    case "float64":
      return `${indent}${target} = this.readFloat64("${endianness}");\n`;

    case "array":
      return generateDecodeArray(field, schema, globalEndianness, fieldName, indent);

    case "string":
      return generateDecodeString(field, globalEndianness, fieldName, indent);

    case "bitfield":
      return generateDecodeBitfield(field, fieldName, indent);

    case "discriminated_union":
      return generateDecodeDiscriminatedUnion(field, schema, globalEndianness, fieldName, indent);

    case "pointer":
      return generateDecodePointer(field, schema, globalEndianness, fieldName, indent);

    default:
      // Type reference
      return generateDecodeTypeReference(field.type, schema, fieldName, indent);
  }
}

/**
 * Generate decoding for discriminated union
 */
function generateDecodeDiscriminatedUnion(
  field: any,
  schema: BinarySchema,
  globalEndianness: Endianness,
  fieldName: string,
  indent: string
): string {
  const target = getTargetPath(fieldName);
  let code = "";
  const discriminator = field.discriminator || {};
  const variants = field.variants || [];

  // Determine how to read discriminator
  if (discriminator.peek) {
    // Peek-based discriminator (DNS compression pattern)
    const peekType = discriminator.peek;
    const endianness = discriminator.endianness || globalEndianness;
    const endiannessArg = peekType !== "uint8" ? `'${endianness}'` : "";

    // Peek discriminator value
    code += `${indent}const discriminator = this.peek${capitalize(peekType)}(${endiannessArg});\n`;

    // Generate if-else chain for each variant
    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];

      if (variant.when) {
        // Convert condition to TypeScript (replace 'value' with 'discriminator')
        const condition = variant.when.replace(/\bvalue\b/g, 'discriminator');
        const ifKeyword = i === 0 ? "if" : "else if";

        code += `${indent}${ifKeyword} (${condition}) {\n`;
        code += `${indent}  const value = decode${variant.type}(this);\n`;
        code += `${indent}  ${target} = { type: '${variant.type}', value };\n`;
        code += `${indent}}`;
        if (i < variants.length - 1) {
          code += "\n";
        }
      } else {
        // Fallback variant (no 'when' condition)
        code += ` else {\n`;
        code += `${indent}  const value = decode${variant.type}(this);\n`;
        code += `${indent}  ${target} = { type: '${variant.type}', value };\n`;
        code += `${indent}}\n`;
        return code;
      }
    }

    // No fallback - throw error for unknown discriminator
    code += ` else {\n`;
    code += `${indent}  throw new Error(\`Unknown discriminator: 0x\${discriminator.toString(16)}\`);\n`;
    code += `${indent}}\n`;

  } else if (discriminator.field) {
    // Field-based discriminator (SuperChat pattern)
    const discriminatorField = discriminator.field;

    // Generate if-else chain for each variant using previously read field
    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];

      if (variant.when) {
        // Convert condition to TypeScript (replace 'value' with field reference)
        const condition = variant.when.replace(/\bvalue\b/g, discriminatorField);
        const ifKeyword = i === 0 ? "if" : "else if";

        code += `${indent}${ifKeyword} (${condition}) {\n`;
        code += `${indent}  const payload = decode${variant.type}(this);\n`;
        code += `${indent}  ${target} = { type: '${variant.type}', value: payload };\n`;
        code += `${indent}}`;
        if (i < variants.length - 1) {
          code += "\n";
        }
      } else {
        // Fallback variant
        code += ` else {\n`;
        code += `${indent}  const payload = decode${variant.type}(this);\n`;
        code += `${indent}  ${target} = { type: '${variant.type}', value: payload };\n`;
        code += `${indent}}\n`;
        return code;
      }
    }

    // No fallback - throw error for unknown discriminator
    code += ` else {\n`;
    code += `${indent}  throw new Error(\`Unknown discriminator value: \${${discriminatorField}}\`);\n`;
    code += `${indent}}\n`;
  }

  return code;
}

/**
 * Generate decoding for pointer
 */
function generateDecodePointer(
  field: any,
  schema: BinarySchema,
  globalEndianness: Endianness,
  fieldName: string,
  indent: string
): string {
  const target = getTargetPath(fieldName);
  const storage = field.storage; // uint8, uint16, uint32
  const offsetMask = field.offset_mask; // e.g., "0x3FFF"
  const offsetFrom = field.offset_from; // "message_start" or "current_position"
  const targetType = field.target_type;
  const endianness = field.endianness || globalEndianness;
  const endiannessArg = storage !== "uint8" ? `, '${endianness}'` : "";

  let code = "";

  // Initialize visitedOffsets set (shared across all pointer decoders)
  code += `${indent}if (!this.visitedOffsets) {\n`;
  code += `${indent}  this.visitedOffsets = new Set<number>();\n`;
  code += `${indent}}\n\n`;

  // Read pointer storage value
  code += `${indent}const pointerValue = this.read${capitalize(storage)}(${endiannessArg});\n`;

  // Extract offset using mask
  code += `${indent}const offset = pointerValue & ${offsetMask};\n\n`;

  // Check for circular reference
  code += `${indent}if (this.visitedOffsets.has(offset)) {\n`;
  code += `${indent}  throw new Error(\`Circular pointer reference detected at offset \${offset}\`);\n`;
  code += `${indent}}\n`;
  code += `${indent}this.visitedOffsets.add(offset);\n\n`;

  // Calculate actual seek position
  if (offsetFrom === "current_position") {
    code += `${indent}const currentPos = this.position;\n`;
    code += `${indent}this.pushPosition();\n`;
    code += `${indent}this.seek(currentPos + offset);\n`;
  } else {
    // message_start
    code += `${indent}this.pushPosition();\n`;
    code += `${indent}this.seek(offset);\n`;
  }

  // Decode target type
  code += `${indent}${target} = decode${targetType}(this);\n\n`;

  // Restore position
  code += `${indent}this.popPosition();\n\n`;

  // Remove from visited set (allow same offset from different paths)
  code += `${indent}this.visitedOffsets.delete(offset);\n`;

  return code;
}

/**
 * Capitalize first letter of a string
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert endianness to short form for runtime
 * big_endian → 'big', little_endian → 'little'
 */
function endianessToShortForm(endianness: Endianness): string {
  return endianness === "big_endian" ? "big" : "little";
}

/**
 * Generate decoding for array field
 */
function generateDecodeArray(
  field: any,
  schema: BinarySchema,
  globalEndianness: Endianness,
  fieldName: string,
  indent: string
): string {
  const target = getTargetPath(fieldName);
  let code = `${indent}${target} = [];\n`;

  // Read length if length_prefixed
  if (field.kind === "length_prefixed") {
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
  } else if (field.kind === "fixed") {
    code += `${indent}for (let i = 0; i < ${field.length}; i++) {\n`;
  } else if (field.kind === "null_terminated") {
    // Read until null byte
    code += `${indent}while (true) {\n`;
    code += `${indent}  const byte = this.readUint8();\n`;
    code += `${indent}  if (byte === 0) break;\n`;
    code += `${indent}  ${target}.push(byte);\n`;
    code += `${indent}}\n`;
    return code;
  }

  // Safety check for items field
  if (!field.items || typeof field.items !== 'object' || !('type' in field.items)) {
    code += `${indent}  // ERROR: Array items undefined\n`;
    code += `${indent}}\n`;
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
    indent + "  "
  );

  // For primitive types, directly push
  if (itemDecodeCode.includes(`${itemVar} =`)) {
    code += `${indent}  let ${itemVar}: any;\n`;
    code += itemDecodeCode;
    code += `${indent}  ${target}.push(${itemVar});\n`;
  }

  code += `${indent}}\n`;

  return code;
}

/**
 * Get the target path for a field (handles array item variables)
 */
function getTargetPath(fieldName: string): string {
  // Array item variables contain '_item' and should not be prefixed with 'value.'
  return fieldName.includes("_item") ? fieldName : `value.${fieldName}`;
}

/**
 * Generate decoding for string field
 */
function generateDecodeString(
  field: any,
  globalEndianness: Endianness,
  fieldName: string,
  indent: string
): string {
  const encoding = field.encoding || "utf8";
  const kind = field.kind;
  const target = getTargetPath(fieldName);
  let code = "";

  if (kind === "length_prefixed") {
    const lengthType = field.length_type || "uint8";
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

    // Read length
    const lengthVarName = fieldName.replace(/\./g, "_") + "_length";
    code += `${indent}const ${lengthVarName} = ${lengthRead};\n`;

    // Read bytes
    const bytesVarName = fieldName.replace(/\./g, "_") + "_bytes";
    code += `${indent}const ${bytesVarName}: number[] = [];\n`;
    code += `${indent}for (let i = 0; i < ${lengthVarName}; i++) {\n`;
    code += `${indent}  ${bytesVarName}.push(this.readUint8());\n`;
    code += `${indent}}\n`;

    // Convert bytes to string
    if (encoding === "utf8") {
      code += `${indent}${target} = new TextDecoder().decode(new Uint8Array(${bytesVarName}));\n`;
    } else if (encoding === "ascii") {
      code += `${indent}${target} = String.fromCharCode(...${bytesVarName});\n`;
    }
  } else if (kind === "null_terminated") {
    // Read bytes until null terminator
    const bytesVarName = fieldName.replace(/\./g, "_") + "_bytes";
    code += `${indent}const ${bytesVarName}: number[] = [];\n`;
    code += `${indent}while (true) {\n`;
    code += `${indent}  const byte = this.readUint8();\n`;
    code += `${indent}  if (byte === 0) break;\n`;
    code += `${indent}  ${bytesVarName}.push(byte);\n`;
    code += `${indent}}\n`;

    // Convert bytes to string
    if (encoding === "utf8") {
      code += `${indent}${target} = new TextDecoder().decode(new Uint8Array(${bytesVarName}));\n`;
    } else if (encoding === "ascii") {
      code += `${indent}${target} = String.fromCharCode(...${bytesVarName});\n`;
    }
  } else if (kind === "fixed") {
    const fixedLength = field.length || 0;

    // Read fixed number of bytes
    const bytesVarName = fieldName.replace(/\./g, "_") + "_bytes";
    code += `${indent}const ${bytesVarName}: number[] = [];\n`;
    code += `${indent}for (let i = 0; i < ${fixedLength}; i++) {\n`;
    code += `${indent}  ${bytesVarName}.push(this.readUint8());\n`;
    code += `${indent}}\n`;

    // Find actual string length (before first null byte)
    code += `${indent}let actualLength = ${bytesVarName}.indexOf(0);\n`;
    code += `${indent}if (actualLength === -1) actualLength = ${bytesVarName}.length;\n`;

    // Convert bytes to string (only up to first null)
    if (encoding === "utf8") {
      code += `${indent}${target} = new TextDecoder().decode(new Uint8Array(${bytesVarName}.slice(0, actualLength)));\n`;
    } else if (encoding === "ascii") {
      code += `${indent}${target} = String.fromCharCode(...${bytesVarName}.slice(0, actualLength));\n`;
    }
  }

  return code;
}

/**
 * Generate decoding for bitfield
 */
function generateDecodeBitfield(field: any, fieldName: string, indent: string): string {
  const target = getTargetPath(fieldName);
  let code = `${indent}${target} = {};\n`;

  for (const subField of field.fields) {
    // Keep as bigint for > 53 bits to preserve precision
    if (subField.size > 53) {
      code += `${indent}${target}.${subField.name} = this.readBits(${subField.size});\n`;
    } else {
      code += `${indent}${target}.${subField.name} = Number(this.readBits(${subField.size}));\n`;
    }
  }

  return code;
}

/**
 * Generate decoding for type reference
 */
function generateDecodeTypeReference(
  typeRef: string,
  schema: BinarySchema,
  fieldName: string,
  indent: string
): string {
  const target = getTargetPath(fieldName);

  // Check if this is a generic type instantiation (e.g., Optional<uint64>)
  const genericMatch = typeRef.match(/^(\w+)<(.+)>$/);
  if (genericMatch) {
    const [, genericType, typeArg] = genericMatch;
    const templateDef = schema.types[`${genericType}<T>`] as TypeDef | undefined;

    if (templateDef) {
      const templateFields = getTypeFields(templateDef);
      // Inline expand the generic by replacing T with the type argument
      let code = `${indent}${target} = {};\n`;
      for (const field of templateFields) {
        // Replace T with the actual type
        const expandedField = JSON.parse(
          JSON.stringify(field).replace(/"T"/g, `"${typeArg}"`)
        );
        const subFieldCode = generateDecodeFieldCore(
          expandedField,
          schema,
          "big_endian",
          `${fieldName}.${expandedField.name}`,
          indent
        );
        code += subFieldCode;
      }
      return code;
    }
  }

  // Regular type reference (not generic)
  const typeDef = schema.types[typeRef] as TypeDef | undefined;
  if (!typeDef) {
    return `${indent}// TODO: Unknown type ${typeRef}\n`;
  }

  // Check if this is a type alias
  if (isTypeAlias(typeDef)) {
    // Type alias - decode directly using the aliased type
    const aliasedType = typeDef as any;
    const pseudoField = { ...aliasedType, name: fieldName.split('.').pop() };
    return generateDecodeFieldCoreImpl(pseudoField, schema, "big_endian", fieldName, indent);
  }

  // Composite type - decode all fields
  const fields = getTypeFields(typeDef);
  let code = `${indent}${target} = {};\n`;
  for (const field of fields) {
    const subFieldCode = generateDecodeFieldCore(
      field,
      schema,
      "big_endian",
      `${fieldName}.${field.name}`,
      indent
    );
    code += subFieldCode;
  }

  return code;
}
