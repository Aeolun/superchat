import { BinarySchema, TypeDef, Field, Endianness } from "../schema/binary-schema.js";
import type { GeneratedCode, DocInput, DocBlock } from "./typescript/shared.js";
import { isTypeAlias, getTypeFields, isBackReferenceTypeDef, isBackReferenceType, sanitizeTypeName, sanitizeVarName, sanitizeEnumMemberName } from "./typescript/type-utils.js";
import { getFieldDocumentation, generateJSDoc } from "./typescript/documentation.js";

/**
 * TypeScript Code Generator
 *
 * Generates TypeScript encoder/decoder classes from a binary schema.
 */

export type { GeneratedCode };

/**
 * Generate TypeScript code for all types in the schema (functional style with standalone functions)
 *
 * ⚠️ WARNING: THIS GENERATOR IS INCOMPLETE AND NOT TESTED
 *
 * Known issues:
 * - Does not properly handle Optional<T> generic expansion (inlines incorrectly)
 * - Decoder does not handle generic types at all
 * - No test coverage (all tests use class-based generator)
 *
 * TODO: Either complete this generator with proper tests, or create functional wrappers
 * around the class-based generator (e.g., encode(value) => new Encoder().encode(value))
 *
 * For production use, use generateTypeScript() (class-based) instead.
 */
export function generateTypeScriptCode(schema: BinarySchema): string {
  const globalEndianness = schema.config?.endianness || "big_endian";
  const globalBitOrder = schema.config?.bit_order || "msb_first";

  // Import runtime library (from same directory)
  let code = `import { BitStreamEncoder, BitStreamDecoder } from "./BitStream.js";\n\n`;

  // Add global visitedOffsets for back_reference circular reference detection
  code += `// Global set for circular reference detection in back references\n`;
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
export interface GenerateTypeScriptOptions {
  addTraceLogs?: boolean;
}

export function generateTypeScript(schema: BinarySchema, options?: GenerateTypeScriptOptions): string {
  const globalEndianness = schema.config?.endianness || "big_endian";
  const globalBitOrder = schema.config?.bit_order || "msb_first";
  const addTraceLogs = options?.addTraceLogs || false;

  // Import runtime library (from same directory)
  let code = `import { BitStreamEncoder, Endianness } from "./BitStream.js";\n`;
  code += `import { SeekableBitStreamDecoder } from "./seekable-bit-stream.js";\n`;
  code += `import { createReader } from "./binary-reader.js";\n\n`;

  // Helper utilities for safe conditional evaluation (avoid runtime errors during decode/encode)
  code += `function __bs_get<T>(expr: () => T): T | undefined {\n`;
  code += `  try {\n`;
  code += `    return expr();\n`;
  code += `  } catch {\n`;
  code += `    return undefined;\n`;
  code += `  }\n`;
  code += `}\n\n`;

  code += `function __bs_numeric(value: any): any {\n`;
  code += `  if (typeof value === "bigint") {\n`;
  code += `    return value;\n`;
  code += `  }\n`;
  code += `  if (typeof value === "number" && Number.isInteger(value)) {\n`;
  code += `    return BigInt(value);\n`;
  code += `  }\n`;
  code += `  return value;\n`;
  code += `}\n\n`;

  code += `function __bs_literal(value: number): number | bigint {\n`;
  code += `  if (Number.isInteger(value)) {\n`;
  code += `    return BigInt(value);\n`;
  code += `  }\n`;
  code += `  return value;\n`;
  code += `}\n\n`;

  code += `function __bs_checkCondition(expr: () => any): boolean {\n`;
  code += `  try {\n`;
  code += `    const result = expr();\n`;
  code += `    if (typeof result === "bigint") {\n`;
  code += `      return result !== 0n;\n`;
  code += `    }\n`;
  code += `    return !!result;\n`;
  code += `  } catch {\n`;
  code += `    return false;\n`;
  code += `  }\n`;
  code += `}\n\n`;

  // Generate code for each type (skip generic templates like Optional<T>)
  for (const [typeName, typeDef] of Object.entries(schema.types)) {
    // Skip only generic type templates (e.g., "Optional<T>", "Array<T>")
    // Don't skip regular types that happen to contain 'T' (e.g., "ThreeBitValue", "Triangle")
    if (typeName.includes('<')) {
      continue;
    }

    const sanitizedName = sanitizeTypeName(typeName);
    code += generateTypeCode(sanitizedName, typeDef as TypeDef, schema, globalEndianness, globalBitOrder, addTraceLogs);
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
  // Check if this is a discriminated union or back_reference type alias
  const typeDefAny = typeDef as any;

  if (typeDefAny.type === "discriminated_union") {
    return generateFunctionalDiscriminatedUnion(typeName, typeDefAny, schema, globalEndianness);
  }

  if (isBackReferenceTypeDef(typeDefAny)) {
    return generateFunctionalBackReference(typeName, typeDefAny, schema, globalEndianness);
  }

  // Handle string types - generate type alias + functions
  if (typeDefAny.type === "string") {
    let code = generateJSDoc(typeDefAny.description);
    code += `export type ${typeName} = string;`;
    const encoderCode = generateFunctionalEncoder(typeName, typeDef, schema, globalEndianness);
    const decoderCode = generateFunctionalDecoder(typeName, typeDef, schema, globalEndianness);
    return `${code}\n\n${encoderCode}\n\n${decoderCode}`;
  }

  // Handle array types - generate type alias + functions
  if (typeDefAny.type === "array") {
    const itemType = getElementTypeScriptType(typeDefAny.items, schema);
    let code = generateJSDoc(typeDefAny.description);
    code += `export type ${typeName} = ${itemType}[];`;
    const encoderCode = generateFunctionalEncoder(typeName, typeDef, schema, globalEndianness);
    const decoderCode = generateFunctionalDecoder(typeName, typeDef, schema, globalEndianness);
    return `${code}\n\n${encoderCode}\n\n${decoderCode}`;
  }

  // Check if this is a type alias or composite type
  if (isTypeAlias(typeDef)) {
    // Regular type alias
    const aliasedType = typeDefAny;
    const tsType = getElementTypeScriptType(aliasedType, schema);

    let code = generateJSDoc(typeDefAny.description);
    code += `export type ${typeName} = ${tsType};`;

    // For simple type aliases, we might not need encode/decode functions
    // (they'd just call the underlying type's functions)
    return code;
  }

  // Composite type - generate interface and functions
  const fields = getTypeFields(typeDef);
  const interfaceCode = generateInterface(typeName, typeDef, schema);
  const encoderCode = generateFunctionalEncoder(typeName, typeDef, schema, globalEndianness);
  const decoderCode = generateFunctionalDecoder(typeName, typeDef, schema, globalEndianness);

  const sections = [interfaceCode];
  const enumCode = generateDiscriminatedUnionEnumsForFields(typeName, fields);
  if (enumCode) {
    sections.push(enumCode);
  }
  sections.push(encoderCode, decoderCode);

  return sections.filter(Boolean).join("\n\n");
}

/**
 * Check if a type is a composite (has sequence) or a type alias
 * Note: Standalone array types (type: "array") and string types (type: "string")
 * are NOT aliases - they need encoder/decoder functions
 */
/**
 * Generate encoder for standalone array type
 */
function generateFunctionalEncoderForArray(
  typeName: string,
  typeDefAny: any,
  schema: BinarySchema,
  globalEndianness: Endianness
): string {
  const arrayField = { ...typeDefAny, name: 'value' };
  const encodeCode = generateFunctionalEncodeArray(arrayField, schema, globalEndianness, 'value', '  ');

  return `export function encode${typeName}(stream: BitStreamEncoder, value: ${typeName}): void {\n${encodeCode}}`;
}

/**
 * Generate encoder for standalone string type
 */
function generateFunctionalEncoderForString(
  typeName: string,
  typeDefAny: any,
  globalEndianness: Endianness
): string {
  const stringField = { ...typeDefAny, name: 'value' };
  const encodeCode = generateFunctionalEncodeString(stringField, globalEndianness, 'value', '  ');

  return `export function encode${typeName}(stream: BitStreamEncoder, value: ${typeName}): void {\n${encodeCode}}`;
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
  const typeDefAny = typeDef as any;

  // Handle standalone array types
  if (typeDefAny.type === 'array') {
    return generateFunctionalEncoderForArray(typeName, typeDefAny, schema, globalEndianness);
  }

  // Handle standalone string types
  if (typeDefAny.type === 'string') {
    return generateFunctionalEncoderForString(typeName, typeDefAny, globalEndianness);
  }

  const fields = getTypeFields(typeDef);

  // Optimization: if struct has exactly 1 field and it's a back_reference, encode the target directly
  if (fields.length === 1 && 'type' in fields[0]) {
    const field = fields[0];
    const fieldTypeDef = schema.types[field.type];
    if (isBackReferenceTypeDef(fieldTypeDef)) {
      // Encode target type directly (back references are transparent during encoding)
      const targetType = (fieldTypeDef as any).target_type;
      let code = `function encode${typeName}(stream: BitStreamEncoder, value: ${typeName}): void {\n`;
      code += `  encode${targetType}(stream, value.${field.name});\n`;
      code += `}`;
      return code;
    }
  }

  // Regular multi-field struct
  let code = `/**\n`;
  code += ` * Encode ${typeName} to the stream\n`;
  code += ` * @param stream - The bit stream to write to\n`;
  code += ` * @param value - The ${typeName} to encode\n`;
  code += ` */\n`;
  code += `export function encode${typeName}(stream: BitStreamEncoder, value: ${typeName}): void {\n`;

  for (const field of fields) {
    code += generateFunctionalEncodeField(field, schema, globalEndianness, "value", "  ");
  }

  code += `}`;
  return code;
}

/**
 * Generate decoder for standalone array type
 */
function generateFunctionalDecoderForArray(
  typeName: string,
  typeDefAny: any,
  schema: BinarySchema,
  globalEndianness: Endianness
): string {
  const arrayField = { ...typeDefAny, name: 'result' };
  const decodeCode = generateFunctionalDecodeArray(arrayField, schema, globalEndianness, 'result', '  ');

  return `export function decode${typeName}(stream: BitStreamDecoder): ${typeName} {\n${decodeCode}  return result;\n}`;
}

/**
 * Generate decoder for standalone string type
 */
function generateFunctionalDecoderForString(
  typeName: string,
  typeDefAny: any,
  globalEndianness: Endianness
): string {
  const stringField = { ...typeDefAny, name: 'result' };
  const decodeCode = generateFunctionalDecodeString(stringField, globalEndianness, 'result', '  ');

  return `export function decode${typeName}(stream: BitStreamDecoder): ${typeName} {\n${decodeCode}  return result;\n}`;
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
  const typeDefAny = typeDef as any;

  // Handle standalone array types
  if (typeDefAny.type === 'array') {
    return generateFunctionalDecoderForArray(typeName, typeDefAny, schema, globalEndianness);
  }

  // Handle standalone string types
  if (typeDefAny.type === 'string') {
    return generateFunctionalDecoderForString(typeName, typeDefAny, globalEndianness);
  }

  const fields = getTypeFields(typeDef);

  // Optimization: if struct has exactly 1 field and it's a back_reference, inline the logic
  if (fields.length === 1 && 'type' in fields[0]) {
    const field = fields[0];
    const fieldTypeDef = schema.types[field.type];
    if (isBackReferenceTypeDef(fieldTypeDef)) {
      // Inline back_reference logic
      return generateInlinedBackReferenceDecoder(typeName, field.name, fieldTypeDef as any, schema, globalEndianness);
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
  let code = `/**\n`;
  code += ` * Decode ${typeName} from the stream\n`;
  code += ` * @param stream - The bit stream to read from\n`;
  code += ` * @returns The decoded ${typeName}\n`;
  code += ` */\n`;
  code += `export function decode${typeName}(stream: BitStreamDecoder): ${typeName} {\n`;

  // Decode each field
  for (const field of fields) {
    code += generateFunctionalDecodeField(field, schema, globalEndianness, "  ");
  }

  // Build return object
  const returnFields = fields
    .filter(f => 'name' in f)
    .map(f => {
      const originalName = f.name;
      const sanitizedName = sanitizeVarName(originalName);
      // If sanitized, use explicit mapping: field: varName
      // If not sanitized, use shorthand: field
      return sanitizedName === originalName ? originalName : `${originalName}: ${sanitizedName}`;
    });
  code += `  return { ${returnFields.join(", ")} };\n`;
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
  let code = `function decode${typeName}(stream: BitStreamDecoder): ${typeName} {\n`;

  // Decode all fields before the discriminated union
  for (let i = 0; i < unionFieldIndex; i++) {
    code += generateFunctionalDecodeField(fields[i], schema, globalEndianness, "  ");
  }

  // Get the discriminated union field
  const unionField = fields[unionFieldIndex] as any;
  const unionFieldName = unionField.name;
  const discriminator = unionField.discriminator;
  const variants = unionField.variants || [];
  const discriminatorField = sanitizeVarName(discriminator.field);

  // Collect names of fields decoded before the union
  const beforeFieldNames = fields.slice(0, unionFieldIndex)
    .filter(f => 'name' in f)
    .map(f => {
      const originalName = f.name;
      const sanitizedName = sanitizeVarName(originalName);
      return sanitizedName === originalName ? originalName : `${originalName}: ${sanitizedName}`;
    });

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
 * Generate decoder for single-field struct with inlined back_reference logic
 */
function generateInlinedBackReferenceDecoder(
  typeName: string,
  fieldName: string,
  backRefDef: any,
  schema: BinarySchema,
  globalEndianness: Endianness
): string {
  const storage = backRefDef.storage;
  const offsetMask = backRefDef.offset_mask;
  const offsetFrom = backRefDef.offset_from;
  const targetType = backRefDef.target_type;
  const endianness = backRefDef.endianness || globalEndianness;

  let code = `function decode${typeName}(stream: BitStreamDecoder): ${typeName} {\n`;

  // Initialize visitedOffsets if needed
  code += `  if (!visitedOffsets) visitedOffsets = new Set<number>();\n\n`;

  // Read back_reference storage value
  const storageMethodName = `read${capitalize(storage)}`;
  if (storage === "uint8") {
    code += `  const referenceValue = stream.${storageMethodName}();\n`;
  } else {
    code += `  const referenceValue = stream.${storageMethodName}('${endianness}');\n`;
  }

  // Extract offset using mask
  code += `  const offset = referenceValue & ${offsetMask};\n\n`;

  // Check for circular reference
  code += `  if (visitedOffsets.has(offset)) {\n`;
  code += `    throw new Error(\`Circular back_reference detected at offset \${offset}\`);\n`;
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
  const enumName = `${typeName}Variant`;

  // Generate TypeScript union type
  const headerSections: string[] = [];
  const unionDocString = generateJSDoc(getFieldDocumentation({ ...unionDef, name: typeName } as Field, schema));
  if (unionDocString) {
    headerSections.push(unionDocString.trimEnd());
  }
  headerSections.push(`export type ${typeName} = ${generateDiscriminatedUnionType(unionDef, schema)};`);
  const enumCode = generateDiscriminatedUnionEnum(unionDef, enumName, "", typeName);
  if (enumCode) {
    headerSections.push(enumCode.trimEnd());
  }
  let code = headerSections.join("\n\n") + "\n\n";

  // Generate encoder
  code += `function encode${typeName}(stream: BitStreamEncoder, value: ${typeName}): void {\n`;
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
  code += `function decode${typeName}(stream: BitStreamDecoder): ${typeName} {\n`;

  if (discriminator.peek) {
    // Peek-based discriminator
    const peekType = discriminator.peek;
    const endianness = discriminator.endianness || globalEndianness;
    const endiannessArg = peekType !== "uint8" ? `'${endianness}'` : "";

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
 * Generate functional-style back_reference
 */
function generateFunctionalBackReference(
  typeName: string,
  backRefDef: any,
  schema: BinarySchema,
  globalEndianness: Endianness
): string {
  const storage = backRefDef.storage;
  const offsetMask = backRefDef.offset_mask;
  const offsetFrom = backRefDef.offset_from;
  const targetType = backRefDef.target_type;
  const endianness = backRefDef.endianness || globalEndianness;

  // Generate type alias (transparent to target type)
  let code = generateJSDoc(backRefDef.description);
  code += `export type ${typeName} = ${targetType};\n\n`;

  // Generate encoder (just encode the target)
  code += `function encode${typeName}(stream: BitStreamEncoder, value: ${typeName}): void {\n`;
  code += `  encode${targetType}(stream, value);\n`;
  code += `}\n\n`;

  // Generate decoder (with back_reference following logic)
  code += `function decode${typeName}(stream: BitStreamDecoder): ${typeName} {\n`;

  // Initialize visitedOffsets if needed
  code += `  if (!visitedOffsets) visitedOffsets = new Set<number>();\n`;
  code += `  visitedOffsets.clear();\n\n`;

  // Read back_reference storage value
  const storageMethodName = `read${capitalize(storage)}`;
  if (storage === "uint8") {
    code += `  const referenceValue = stream.${storageMethodName}();\n`;
  } else {
    code += `  const referenceValue = stream.${storageMethodName}('${endianness}');\n`;
  }

  // Extract offset using mask
  code += `  const offset = referenceValue & ${offsetMask};\n\n`;

  // Check for circular reference
  code += `  if (visitedOffsets.has(offset)) {\n`;
  code += `    throw new Error(\`Circular back_reference detected at offset \${offset}\`);\n`;
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
      return `${indent}stream.writeUint16(${fieldPath}, '${fieldEndianness}');\n`;
    case "uint32":
      return `${indent}stream.writeUint32(${fieldPath}, '${fieldEndianness}');\n`;
    case "uint64":
      return `${indent}stream.writeUint64(${fieldPath}, '${fieldEndianness}');\n`;
    case "int8":
      return `${indent}stream.writeInt8(${fieldPath});\n`;
    case "int16":
      return `${indent}stream.writeInt16(${fieldPath}, '${fieldEndianness}');\n`;
    case "int32":
      return `${indent}stream.writeInt32(${fieldPath}, '${fieldEndianness}');\n`;
    case "int64":
      return `${indent}stream.writeInt64(${fieldPath}, '${fieldEndianness}');\n`;
    case "array":
      return generateFunctionalEncodeArray(field, schema, globalEndianness, fieldPath, indent);
    case "string":
      return generateFunctionalEncodeString(field, globalEndianness, fieldPath, indent);
    case "bitfield":
      return generateFunctionalEncodeBitfield(field, fieldPath, indent);
    case "discriminated_union":
      return generateFunctionalEncodeDiscriminatedUnionField(field as any, schema, globalEndianness, fieldPath, indent);
    default:
      // Check for generic type instantiation (e.g., Optional<uint64>)
      const genericMatch = field.type.match(/^(\w+)<(.+)>$/);
      if (genericMatch) {
        const [, genericType, typeArg] = genericMatch;
        const templateDef = schema.types[`${genericType}<T>`] as TypeDef | undefined;

        if (templateDef) {
          const templateFields = getTypeFields(templateDef);
          // Inline expand the generic by replacing T with the type argument
          let code = "";
          for (const tmplField of templateFields) {
            // Replace T with the actual type
            const expandedField = JSON.parse(
              JSON.stringify(tmplField).replace(/"T"/g, `"${typeArg}"`)
            );
            const newFieldPath = `${fieldPath}.${expandedField.name}`;
            code += generateFunctionalEncodeField(expandedField, schema, globalEndianness, newFieldPath, indent);
          }
          return code;
        }
      }
      // Type reference - resolve back_reference types to their target type
      const resolvedType = resolveBackReferenceType(field.type, schema);
      return `${indent}encode${resolvedType}(stream, ${fieldPath});\n`;
  }
}

/**
 * Generate functional encoding for bitfield
 */
function generateFunctionalEncodeBitfield(field: any, valuePath: string, indent: string): string {
  let code = "";
  for (const subField of field.fields) {
    code += `${indent}stream.writeBits(${valuePath}.${subField.name}, ${subField.size});\n`;
  }
  return code;
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
 * Resolve back_reference types to their target type (for encoding - references are transparent)
 */
function resolveBackReferenceType(typeName: string, schema: BinarySchema): string {
  const typeDef = schema.types[typeName];
  if (typeDef && (typeDef as any).type === "back_reference") {
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
 * Generate functional encoding for string
 */
function generateFunctionalEncodeString(
  field: any,
  globalEndianness: Endianness,
  valuePath: string,
  indent: string
): string {
  const encoding = field.encoding || "utf8";
  let kind = field.kind;
  let code = "";

  // Auto-detect field_referenced: if kind is "fixed" but length_field exists, treat as field_referenced
  if (kind === "fixed" && field.length_field && !field.length) {
    kind = "field_referenced";
  }

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
        code += `${indent}stream.writeUint16(${bytesVarName}.length, '${globalEndianness}');\n`;
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
  } else if (kind === "field_referenced") {
    // Length comes from another field, we just write the bytes (length was already written)
    code += `${indent}for (const byte of ${bytesVarName}) {\n`;
    code += `${indent}  stream.writeUint8(byte);\n`;
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

  const fieldName = sanitizeVarName(field.name);
  const fieldEndianness = 'endianness' in field && field.endianness ? field.endianness : globalEndianness;

  switch (field.type) {
    case "uint8":
      return `${indent}const ${fieldName} = stream.readUint8();\n`;
    case "uint16":
      return `${indent}const ${fieldName} = stream.readUint16('${fieldEndianness}');\n`;
    case "uint32":
      return `${indent}const ${fieldName} = stream.readUint32('${fieldEndianness}');\n`;
    case "uint64":
      return `${indent}const ${fieldName} = stream.readUint64('${fieldEndianness}');\n`;
    case "int8":
      return `${indent}const ${fieldName} = stream.readInt8();\n`;
    case "int16":
      return `${indent}const ${fieldName} = stream.readInt16('${fieldEndianness}');\n`;
    case "int32":
      return `${indent}const ${fieldName} = stream.readInt32('${fieldEndianness}');\n`;
    case "int64":
      return `${indent}const ${fieldName} = stream.readInt64('${fieldEndianness}');\n`;
    case "array":
      return generateFunctionalDecodeArray(field, schema, globalEndianness, fieldName, indent);
    case "string":
      return generateFunctionalDecodeString(field, globalEndianness, fieldName, indent);
    case "bitfield":
      return generateFunctionalDecodeBitfield(field, fieldName, indent);
    case "discriminated_union":
      return generateFunctionalDecodeDiscriminatedUnionField(field as any, schema, globalEndianness, fieldName, indent);
    default:
      // Type reference - always call the decoder function
      return `${indent}const ${fieldName} = decode${field.type}(stream);\n`;
  }
}

/**
 * Generate functional decoding for bitfield
 */
function generateFunctionalDecodeBitfield(field: any, fieldName: string, indent: string): string {
  let code = `${indent}const ${fieldName} = {\n`;
  for (const subField of field.fields) {
    code += `${indent}  ${subField.name}: Number(stream.readBits(${subField.size})),\n`;
  }
  code += `${indent}};\n`;
  return code;
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
    const endiannessArg = peekType !== "uint8" ? `'${endianness}'` : "";

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
  let kind = field.kind;
  let code = "";

  // Auto-detect field_referenced: if kind is "fixed" but length_field exists, treat as field_referenced
  if (kind === "fixed" && field.length_field && !field.length) {
    kind = "field_referenced";
  }

  if (kind === "length_prefixed") {
    const lengthType = field.length_type || "uint8";
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
  } else if (kind === "field_referenced") {
    // Length comes from another field in the same value/result object
    const lengthField = field.length_field;
    code += `${indent}const ${fieldName}_length = ${lengthField};\n`;
    code += `${indent}const ${fieldName}_bytes: number[] = [];\n`;
    code += `${indent}for (let i = 0; i < ${fieldName}_length; i++) {\n`;
    code += `${indent}  ${fieldName}_bytes.push(stream.readUint8());\n`;
    code += `${indent}}\n`;

    if (encoding === "utf8") {
      code += `${indent}const ${fieldName} = new TextDecoder().decode(new Uint8Array(${fieldName}_bytes));\n`;
    } else if (encoding === "ascii") {
      code += `${indent}const ${fieldName} = String.fromCharCode(...${fieldName}_bytes);\n`;
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
  globalBitOrder: string,
  addTraceLogs: boolean = false
): string {
  const typeDefAny = typeDef as any;
  const fields = getTypeFields(typeDef);

  // Handle standalone string types - generate type alias + encoder/decoder
  if (typeDefAny.type === 'string') {
    const docLines = getFieldDocumentation({ ...typeDefAny, name: typeName } as Field, schema);
    let code = generateJSDoc(docLines);
    code += `export type ${typeName} = string;\n\n`;
    code += generateTypeAliasEncoder(typeName, typeDefAny, schema, globalEndianness, globalBitOrder);
    code += '\n\n';
    code += generateTypeAliasDecoder(typeName, typeDefAny, schema, globalEndianness, globalBitOrder);
    return code;
  }

  // Handle standalone array types - generate type alias + encoder/decoder
  if (typeDefAny.type === 'array') {
    const itemType = getElementTypeScriptType(typeDefAny.items, schema);
    const docLines = getFieldDocumentation({ ...typeDefAny, name: typeName } as Field, schema);
    let code = generateJSDoc(docLines);
    code += `export type ${typeName} = ${itemType}[];\n\n`;
    code += generateTypeAliasEncoder(typeName, typeDefAny, schema, globalEndianness, globalBitOrder);
    code += '\n\n';
    code += generateTypeAliasDecoder(typeName, typeDefAny, schema, globalEndianness, globalBitOrder);
    return code;
  }

  // Check if this is a type alias or composite type
  if (isTypeAlias(typeDef)) {
    // Type alias - generate type alias, encoder, and decoder
    return generateTypeAliasCode(typeName, typeDef, schema, globalEndianness, globalBitOrder);
  }

  // Composite type - generate interface, encoder, and decoder
  const interfaceCode = generateInterface(typeName, typeDef, schema);
  const encoderCode = generateEncoder(typeName, typeDef, schema, globalEndianness, globalBitOrder);
  const decoderCode = generateDecoder(typeName, typeDef, schema, globalEndianness, globalBitOrder, addTraceLogs);

  const sections = [interfaceCode];
  const enumCode = generateDiscriminatedUnionEnumsForFields(typeName, fields);
  if (enumCode) {
    sections.push(enumCode);
  }

  // Generate instance class if type has position fields
  const typeDefWithInstances = typeDef as any;
  if (typeDefWithInstances.instances && Array.isArray(typeDefWithInstances.instances) && typeDefWithInstances.instances.length > 0) {
    const instanceClassCode = generateInstanceClass(typeName, typeDef, schema, globalEndianness, globalBitOrder);
    sections.push(instanceClassCode);
  }

  sections.push(encoderCode, decoderCode);

  return sections.filter(Boolean).join("\n\n");
}

/**
 * Generate field access path from dot notation string
 * Converts "header.offset" to "this.header.offset"
 * Converts "_root.header.offset" to "this._root.header.offset"
 */
function generateFieldAccessPath(path: string): string {
  const parts = path.split('.');

  if (parts[0] === '_root') {
    // Root reference: "_root.header.offset" -> "this._root.header.offset"
    return 'this._root.' + parts.slice(1).join('.');
  } else {
    // Local reference: "header.offset" -> "this.header.offset"
    return 'this.' + parts.join('.');
  }
}

/**
 * Generate instance class with lazy getters for position fields
 */
function generateInstanceClass(
  typeName: string,
  typeDef: TypeDef,
  schema: BinarySchema,
  globalEndianness: Endianness,
  globalBitOrder: string
): string {
  const typeDefAny = typeDef as any;
  const instances = typeDefAny.instances || [];
  const fields = getTypeFields(typeDef);

  let code = `class ${typeName}Instance implements ${typeName} {\n`;
  code += `  private _decoder!: BitStreamDecoder;\n`;
  code += `  private _lazyCache!: Map<string, any>;\n`;
  code += `  private _evaluating!: Set<string>;\n`;
  code += `  private _root!: any;\n\n`;

  // Add sequence field properties
  for (const field of fields) {
    const fieldType = getFieldTypeScriptType(field, schema);
    code += `  ${field.name}: ${fieldType};\n`;
  }
  code += `\n`;

  // Constructor
  code += `  constructor(decoder: BitStreamDecoder, sequenceData: any, root?: any) {\n`;
  code += `    // Make internal properties non-enumerable to avoid cyclic JSON issues\n`;
  code += `    Object.defineProperty(this, '_decoder', { value: decoder, enumerable: false });\n`;
  code += `    Object.defineProperty(this, '_lazyCache', { value: new Map(), enumerable: false });\n`;
  code += `    Object.defineProperty(this, '_evaluating', { value: new Set(), enumerable: false });\n`;
  code += `    Object.defineProperty(this, '_root', { value: root || this, enumerable: false });\n\n`;

  // Copy sequence data to properties
  for (const field of fields) {
    code += `    this.${field.name} = sequenceData.${field.name};\n`;
  }
  code += `  }\n\n`;

  // In constructor, define getters as enumerable properties
  code = code.replace(`  }\n\n`, '');

  // Add getter definitions to constructor
  for (const instance of instances) {
    const instanceType = resolveTypeReference(instance.type, schema);

    code += `\n    // Define enumerable getter for lazy field '${instance.name}'\n`;
    code += `    Object.defineProperty(this, '${instance.name}', {\n`;
    code += `      enumerable: true,\n`;
    code += `      get: () => {\n`;
    code += `        // Check for circular reference\n`;
    code += `        if (this._evaluating.has('${instance.name}')) {\n`;
    code += `          throw new Error(\`Circular reference detected: field '${instance.name}' references itself during evaluation\`);\n`;
    code += `        }\n\n`;
    code += `        if (!this._lazyCache.has('${instance.name}')) {\n`;
    code += `          this._evaluating.add('${instance.name}');\n`;
    code += `          try {\n`;

    // Resolve position
    const position = instance.position;
    if (typeof position === 'number') {
      // Numeric position
      if (position < 0) {
        // Negative position - from EOF
        code += `          const position = this._decoder['bytes'].length + (${position});\n`;
      } else {
        // Positive position - absolute
        code += `          const position = ${position};\n`;
      }
    } else {
      // Field reference - generate direct property access
      const accessPath = generateFieldAccessPath(position);
      code += `          const position = ${accessPath};\n`;
      code += `          if (typeof position !== 'number' && typeof position !== 'bigint') {\n`;
      code += `            throw new Error(\`Field reference '${position}' does not resolve to a numeric value (got \${typeof position})\`);\n`;
      code += `          }\n`;
    }

    // Validate alignment if specified
    if (instance.alignment) {
      code += `\n          // Validate alignment\n`;
      code += `          if (position % ${instance.alignment} !== 0) {\n`;
      code += `            throw new Error(\`Position \${position} is not aligned to ${instance.alignment} bytes (\${position} % ${instance.alignment} = \${position % ${instance.alignment}})\`);\n`;
      code += `          }\n`;
    }

    // Seek to position
    code += `\n          this._decoder.seek(position);\n\n`;

    // Decode the type at that position
    // Pass root decoder so nested position fields can seek in the full file
    code += `            const decoder = new ${instance.type}Decoder(this._decoder['bytes'].slice(position), { _root: this._root, _rootDecoder: this._decoder });\n`;
    code += `            const value = decoder.decode();\n`;
    code += `            this._lazyCache.set('${instance.name}', value);\n`;
    code += `          } finally {\n`;
    code += `            this._evaluating.delete('${instance.name}');\n`;
    code += `          }\n`;
    code += `        }\n`;
    code += `        return this._lazyCache.get('${instance.name}')!;\n`;
    code += `      }\n`;
    code += `    });\n`;
  }

  code += `  }\n`;
  code += `}`;

  return code;
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

  const sections: string[] = [];
  const aliasDocString = generateJSDoc(getFieldDocumentation({ ...aliasedType, name: typeName } as Field, schema));
  if (aliasDocString) {
    sections.push(aliasDocString.trimEnd());
  }

  sections.push(`export type ${typeName} = ${tsType};`);

  if (aliasedType.type === "discriminated_union") {
    const enumName = `${typeName}Variant`;
    const enumCode = generateDiscriminatedUnionEnum(aliasedType, enumName, "", typeName);
    if (enumCode) {
      sections.push(enumCode.trimEnd());
    }
  }

  sections.push(generateTypeAliasEncoder(typeName, aliasedType, schema, globalEndianness, globalBitOrder));
  sections.push(generateTypeAliasDecoder(typeName, aliasedType, schema, globalEndianness, globalBitOrder));

  return sections.filter(Boolean).join("\n\n");
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
      case "back_reference":
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

function generateDiscriminatedUnionEnum(
  unionDef: any,
  enumName: string,
  indent: string = "",
  targetLabel?: string
): string {
  const variants = Array.isArray(unionDef?.variants) ? unionDef.variants : [];
  if (variants.length === 0) {
    return "";
  }

  const docLabel = targetLabel ?? enumName;
  const doc = generateJSDoc(`Variant tags for ${docLabel}`, indent);
  const entries = variants
    .map((variant: any) => {
      const memberName = sanitizeEnumMemberName(variant.type);
      return `${indent}  ${memberName} = '${variant.type}',`;
    })
    .join("\n");
  let code = doc;
  code += `${indent}export const enum ${enumName} {\n`;
  code += `${entries}\n`;
  code += `${indent}}\n`;
  return code;
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
  code += `  private compressionDict: Map<string, number> = new Map();\n\n`;
  code += `  constructor() {\n`;
  code += `    super("${globalBitOrder}");\n`;
  code += `  }\n\n`;
  code += `  encode(value: ${typeName}): Uint8Array {\n`;
  code += `    // Reset compression dictionary for each encode\n`;
  code += `    this.compressionDict.clear();\n\n`;

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
  let code = `export class ${typeName}Decoder extends SeekableBitStreamDecoder {\n`;
  code += `  constructor(input: Uint8Array | number[] | string) {\n`;
  code += `    const reader = createReader(input);\n`;
  code += `    super(reader, "${globalBitOrder}");\n`;
  code += `  }\n\n`;
  code += `  decode(): ${typeName} {\n`;

  // For simple types, decode directly and return
  // For complex types (arrays, etc), use existing decoding logic
  if ('type' in aliasedType) {
    switch (aliasedType.type) {
      case "array":
        // Use existing array decoding logic
        code += `    let value: any = {};\n`;
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
        code += `    let value: any = {};\n`;
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
  const typeDefAny = typeDef as any;

  // Add JSDoc for the interface itself
  let code = generateJSDoc(typeDefAny.description);
  code += `export interface ${typeName} {\n`;

  // Add sequence fields (skip computed fields - they are output-only)
  for (const field of fields) {
    const fieldAny = field as any;

    // Skip computed fields in interface - users cannot provide them as input
    if (fieldAny.computed) {
      continue;
    }

    const fieldType = getFieldTypeScriptType(field, schema);
    const optional = isFieldConditional(field) ? "?" : "";

    // Add JSDoc for each field
    const fieldDocString = generateJSDoc(getFieldDocumentation(field, schema), "  ");
    if (fieldDocString) {
      code += fieldDocString;
    }
    code += `  ${field.name}${optional}: ${fieldType};\n`;
  }

  // Add instance fields (position-based lazy fields)
  if (typeDefAny.instances && Array.isArray(typeDefAny.instances)) {
    for (const instance of typeDefAny.instances) {
      const instanceType = resolveTypeReference(instance.type, schema);

      // Add JSDoc for instance field
      const instanceDoc: any = {
        summary: instance.description || `Position-based field at ${typeof instance.position === 'number' ? instance.position : instance.position}`
      };
      const instanceDocString = generateJSDoc(instanceDoc, "  ");
      if (instanceDocString) {
        code += instanceDocString;
      }
      code += `  readonly ${instance.name}: ${instanceType};\n`;
    }
  }

  code += `}`;
  return code;
}

function generateDiscriminatedUnionEnumsForFields(
  typeName: string,
  fields: Field[]
): string {
  const enums: string[] = [];

  for (const field of fields) {
    const fieldAny = field as any;
    if (fieldAny && fieldAny.type === "discriminated_union") {
      const enumName = `${typeName}${capitalize(fieldAny.name)}Variant`;
      const enumCode = generateDiscriminatedUnionEnum(fieldAny, enumName, "", `${typeName}.${fieldAny.name}`);
      if (enumCode) {
        enums.push(enumCode.trimEnd());
      }
    }
  }

  return enums.join("\n\n");
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
      case "back_reference":
        // Pointer is transparent - just the target type
        return resolveTypeReference((field as any).target_type, schema);
      case "optional":
        // Optional field - generate T | undefined
        const valueType = resolveTypeReference((field as any).value_type, schema);
        return `${valueType} | undefined`;
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
      // For generic types, expand inline
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
  // First wrap numeric literals so they can be coerced to BigInt when appropriate.
  const numberLiteralRegex = /(?<![\w$])(-?(?:0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|\d+(?:\.\d+)?))(?![\w$])/g;
  let expression = condition.replace(numberLiteralRegex, (match) => `__bs_literal(${match})`);

  const reservedIdentifiers = new Set([
    "true",
    "false",
    "null",
    "undefined",
    "BigInt",
    "Number",
    "Math",
    "__bs_literal",
    "__bs_numeric",
    "__bs_get",
    "__bs_checkCondition"
  ]);

  // Replace field paths (identifier sequences separated by dots) with safe accessors.
  const identifierRegex = /\b([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)\b/g;
  expression = expression.replace(identifierRegex, (match) => {
    if (reservedIdentifiers.has(match)) {
      return match;
    }
    if (/^\d/.test(match)) {
      return match;
    }
    if (match === basePath || match.startsWith(`${basePath}.`)) {
      return `__bs_numeric(__bs_get(() => ${match}))`;
    }
    return `__bs_numeric(__bs_get(() => ${basePath}.${match}))`;
  });

  return `__bs_checkCondition(() => (${expression}))`;
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
  code += `  private compressionDict: Map<string, number> = new Map();\n\n`;
  code += `  constructor() {\n`;
  code += `    super("${globalBitOrder}");\n`;
  code += `  }\n\n`;

  // Generate encode method
  code += `  encode(value: ${typeName}): Uint8Array {\n`;
  code += `    // Reset compression dictionary for each encode\n`;
  code += `    this.compressionDict.clear();\n\n`;

  // Validate: error if user provides computed fields
  const computedFields = fields.filter(f => (f as any).computed);
  if (computedFields.length > 0) {
    code += `    // Validate: error if user bypassed TypeScript and provided computed fields\n`;
    for (const field of computedFields) {
      code += `    if ((value as any).${field.name} !== undefined) {\n`;
      code += `      throw new Error("Field '${field.name}' is computed and cannot be set manually");\n`;
      code += `    }\n`;
    }
    code += `\n`;
  }

  for (const field of fields) {
    code += generateEncodeField(field, schema, globalEndianness, "    ");
  }

  code += `    return this.finish();\n`;
  code += `  }\n`;
  code += `}`;

  return code;
}

/**
 * Generate encoding code for computed field
 * Computes the value and writes it instead of reading from input
 */
function generateEncodeComputedField(
  field: Field,
  schema: BinarySchema,
  globalEndianness: Endianness,
  indent: string
): string {
  if (!('type' in field)) return "";

  const fieldAny = field as any;
  const computed = fieldAny.computed;
  const fieldName = field.name;

  const endianness = 'endianness' in field && field.endianness
    ? field.endianness
    : globalEndianness;

  let code = "";

  // Generate computation based on computed field type
  if (computed.type === "length_of") {
    const targetField = computed.target;
    const targetPath = `value.${targetField}`;

    // Compute the length value
    code += `${indent}// Computed field '${fieldName}': auto-compute length_of '${targetField}'\n`;
    code += `${indent}let ${fieldName}_computed: number;\n`;

    // Check if encoding is specified (for string byte length)
    if (computed.encoding) {
      // String byte length with specific encoding
      code += `${indent}{\n`;
      code += `${indent}  const encoder = new TextEncoder();\n`;
      code += `${indent}  ${fieldName}_computed = encoder.encode(${targetPath}).length;\n`;
      code += `${indent}}\n`;
    } else {
      // Array element count or string character count
      code += `${indent}${fieldName}_computed = ${targetPath}.length;\n`;
    }

    // Write the computed value using appropriate write method
    switch (field.type) {
      case "uint8":
        code += `${indent}this.writeUint8(${fieldName}_computed);\n`;
        break;
      case "uint16":
        code += `${indent}this.writeUint16(${fieldName}_computed, "${endianness}");\n`;
        break;
      case "uint32":
        code += `${indent}this.writeUint32(${fieldName}_computed, "${endianness}");\n`;
        break;
      case "uint64":
        code += `${indent}this.writeUint64(BigInt(${fieldName}_computed), "${endianness}");\n`;
        break;
      default:
        code += `${indent}// TODO: Unsupported computed field type: ${field.type}\n`;
    }
  } else if (computed.type === "crc32_of") {
    // TODO: Implement CRC32 computation
    code += `${indent}// TODO: Implement CRC32 computation for '${fieldName}'\n`;
    code += `${indent}this.writeUint32(0, "${endianness}"); // Placeholder\n`;
  } else if (computed.type === "position_of") {
    // TODO: Implement position computation
    code += `${indent}// TODO: Implement position computation for '${fieldName}'\n`;
    code += `${indent}this.writeUint32(0, "${endianness}"); // Placeholder\n`;
  }

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

  const fieldAny = field as any;
  const fieldName = field.name;

  // Handle computed fields - generate computation code instead of reading from value
  if (fieldAny.computed) {
    return generateEncodeComputedField(field, schema, globalEndianness, indent);
  }

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

    case "back_reference":
      return generateEncodeBackReference(field, schema, globalEndianness, valuePath, indent);

    case "optional":
      return generateEncodeOptional(field, schema, globalEndianness, valuePath, indent);

    default:
      // Type reference - need to encode nested struct
      return generateEncodeTypeReference(field.type, schema, globalEndianness, valuePath, indent);
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

    // Track non-back_reference variants in compression dictionary
    const variantTypeDef = schema.types[variant.type];
    const isBackReference = variantTypeDef && (variantTypeDef as any).type === "back_reference";

    if (!isBackReference) {
      // Check if variant is a string type that can be referenced by back references
      const variantTypeDef = schema.types[variant.type];
      const isStringType = variantTypeDef && (variantTypeDef as any).type === "string";

      if (isStringType) {
        // Non-reference string variant: record offset before encoding so back references can reuse it
        code += `${indent}  const valueKey = JSON.stringify(${valuePath}.value);\n`;
        code += `${indent}  const currentOffset = this.byteOffset;\n`;
        code += `${indent}  this.compressionDict.set(valueKey, currentOffset);\n`;
      }
    }

    // Encode the variant value (back references handle their own compression via generateEncodeBackReference)
    code += generateEncodeTypeReference(variant.type, schema, globalEndianness, `${valuePath}.value`, indent + "  ");

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
 * Generate encoding for optional field
 */
function generateEncodeOptional(
  field: any,
  schema: BinarySchema,
  globalEndianness: Endianness,
  valuePath: string,
  indent: string
): string {
  const valueType = field.value_type;
  const presenceType = field.presence_type || "uint8";

  let code = "";

  // Check if value is undefined or null
  code += `${indent}if (${valuePath} === undefined || ${valuePath} === null) {\n`;

  // Write presence = 0
  if (presenceType === "uint8") {
    code += `${indent}  this.writeUint8(0);\n`;
  } else if (presenceType === "bit") {
    code += `${indent}  this.writeBits(0, 1);\n`;
  }

  code += `${indent}} else {\n`;

  // Write presence = 1
  if (presenceType === "uint8") {
    code += `${indent}  this.writeUint8(1);\n`;
  } else if (presenceType === "bit") {
    code += `${indent}  this.writeBits(1, 1);\n`;
  }

  // Write value - create a synthetic field with value_type
  const syntheticField: any = {
    type: valueType,
    name: field.name
  };

  // Preserve endianness if it's a multi-byte type
  if (field.endianness) {
    syntheticField.endianness = field.endianness;
  }

  code += generateEncodeFieldCoreImpl(syntheticField, schema, globalEndianness, valuePath, indent + "  ");
  code += `${indent}}\n`;

  return code;
}

/**
 * Generate encoding for back_reference with compression support
 *
 * Back references use compression by default:
 * - If value exists in compressionDict → emit compression pointer bytes (0xC000 | offset)
 * - Otherwise record current offset, encode target value, add to dictionary
 */
function generateEncodeBackReference(
  field: any,
  schema: BinarySchema,
  globalEndianness: Endianness,
  valuePath: string,
  indent: string
): string {
  const storage = field.storage || "uint16"; // uint8, uint16, uint32
  const offsetMask = field.offset_mask || "0x3FFF"; // Default mask for 14-bit offset
  const targetType = field.target_type;
  const endianness = field.endianness || globalEndianness;

  if (typeof targetType !== "string" || targetType.length === 0) {
    throw new Error(
      [
        "Back-reference field is missing a valid 'target_type'.",
        `field: ${field?.name ?? "<unnamed>"}`,
        `valuePath: ${valuePath}`,
        `storage: ${storage}`,
      ].join(" ")
    );
  }

  let code = "";

  // Serialize value for dictionary key (use JSON.stringify for structural equality)
  code += `${indent}const valueKey = JSON.stringify(${valuePath});\n`;
  code += `${indent}const existingOffset = this.compressionDict.get(valueKey);\n\n`;

  // If found in dictionary, encode as compression pointer bytes
  code += `${indent}if (existingOffset !== undefined) {\n`;
  code += `${indent}  // Encode compression pointer: set top bits (0xC0 for uint16) and mask offset\n`;

  if (storage === "uint8") {
    code += `${indent}  const referenceValue = 0xC0 | (existingOffset & ${offsetMask});\n`;
    code += `${indent}  this.writeUint8(referenceValue);\n`;
  } else if (storage === "uint16") {
    code += `${indent}  const referenceValue = 0xC000 | (existingOffset & ${offsetMask});\n`;
    code += `${indent}  this.writeUint16(referenceValue, "${endianness}");\n`;
  } else if (storage === "uint32") {
    code += `${indent}  const referenceValue = 0xC0000000 | (existingOffset & ${offsetMask});\n`;
    code += `${indent}  this.writeUint32(referenceValue, "${endianness}");\n`;
  }

  code += `${indent}} else {\n`;

  // Otherwise, record offset and encode target value
  code += `${indent}  // First occurrence - record offset and encode target value\n`;
  code += `${indent}  const currentOffset = this.byteOffset;\n`;
  code += `${indent}  this.compressionDict.set(valueKey, currentOffset);\n`;
  code += generateEncodeTypeReference(targetType, schema, globalEndianness, valuePath, indent + "  ");
  code += `${indent}}\n`;

  return code;
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
 * Generate encoding for string field
 */
function generateEncodeString(
  field: any,
  globalEndianness: Endianness,
  valuePath: string,
  indent: string
): string {
  const encoding = field.encoding || "utf8";
  let kind = field.kind;
  let code = "";

  // Auto-detect field_referenced: if kind is "fixed" but length_field exists, treat as field_referenced
  if (kind === "fixed" && field.length_field && !field.length) {
    kind = "field_referenced";
  }

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
  } else if (kind === "field_referenced") {
    // Length comes from another field, we just write the bytes (length was already written)
    code += `${indent}for (const byte of ${bytesVarName}) {\n`;
    code += `${indent}  this.writeUint8(byte);\n`;
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
  globalEndianness: Endianness,
  valuePath: string,
  indent: string
): string {
  // Check if this is a generic type instantiation (e.g., Optional<uint64>)
  const genericMatch = typeRef.match(/^(\w+)<(.+)>$/);
  if (genericMatch) {
    const [, genericType, typeArg] = genericMatch;
    const templateDef = schema.types[`${genericType}<T>`] as TypeDef | undefined;

    if (templateDef) {
      // For generic types, inline expand by replacing T with the type argument
      const templateFields = getTypeFields(templateDef);
      let code = "";
      for (const field of templateFields) {
        // Replace T with the actual type
        const expandedField = JSON.parse(
          JSON.stringify(field).replace(/"T"/g, `"${typeArg}"`)
        );
        const newValuePath = `${valuePath}.${field.name}`;
        code += generateEncodeFieldCore(expandedField, schema, globalEndianness, newValuePath, indent);
      }
      return code;
    }
  }

  // Regular type reference (not generic)
  const typeDef = schema.types[typeRef] as TypeDef | undefined;
  if (!typeDef) {
    return `${indent}// TODO: Unknown type ${typeRef}\n`;
  }

  const typeDefAny = typeDef as any;

  // Handle standalone string types - encode using the aliased string type
  if (typeDefAny.type === 'string') {
    const pseudoField = { ...typeDefAny, name: valuePath.split('.').pop() };
    return generateEncodeFieldCoreImpl(pseudoField, schema, globalEndianness, valuePath, indent);
  }

  // Handle standalone array types - encode using the aliased array type
  if (typeDefAny.type === 'array') {
    const pseudoField = { ...typeDefAny, name: valuePath.split('.').pop() };
    return generateEncodeFieldCoreImpl(pseudoField, schema, globalEndianness, valuePath, indent);
  }

  // Check if this is a type alias
  if (isTypeAlias(typeDef)) {
    // Type alias - encode directly using the aliased type
    const aliasedType = typeDef as any;
    const pseudoField = { ...aliasedType, name: valuePath.split('.').pop() };
    return generateEncodeFieldCoreImpl(pseudoField, schema, globalEndianness, valuePath, indent);
  }

  // Composite type - encode all fields
  const fields = getTypeFields(typeDef);
  let code = "";

  // Add runtime validation for computed fields in nested struct
  const computedFields = fields.filter(f => (f as any).computed);
  if (computedFields.length > 0) {
    code += `${indent}// Runtime validation: reject computed fields in nested struct\n`;
    for (const field of computedFields) {
      code += `${indent}if ((${valuePath} as any).${field.name} !== undefined) {\n`;
      code += `${indent}  throw new Error("Field '${field.name}' is computed and cannot be set manually");\n`;
      code += `${indent}}\n`;
    }
  }

  for (const field of fields) {
    const newValuePath = `${valuePath}.${field.name}`;
    code += generateEncodeFieldCore(field, schema, globalEndianness, newValuePath, indent);
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
  globalBitOrder: string,
  addTraceLogs: boolean = false
): string {
  const fields = getTypeFields(typeDef);
  const typeDefAny = typeDef as any;
  const hasInstances = typeDefAny.instances && Array.isArray(typeDefAny.instances) && typeDefAny.instances.length > 0;

  let code = `export class ${typeName}Decoder extends SeekableBitStreamDecoder {\n`;
  code += `  constructor(input: Uint8Array | number[] | string, private context?: any) {\n`;
  code += `    const reader = createReader(input);\n`;
  code += `    super(reader, "${globalBitOrder}");\n`;
  code += `  }\n\n`;
  code += `  decode(): ${typeName} {\n`;
  if (addTraceLogs) {
    code += `    console.log('[TRACE] Decoding ${typeName}');\n`;
  }

  if (!hasInstances) {
    // No instance fields - return plain object
    code += `    const value: any = {};\n\n`;

    for (const field of fields) {
      code += generateDecodeField(field, schema, globalEndianness, "    ", addTraceLogs);
    }

    code += `    return value;\n`;
  } else {
    // Has instance fields - return class instance with lazy getters
    code += generateDecoderWithLazyFields(typeName, fields, typeDefAny.instances, schema, globalEndianness, "    ", addTraceLogs);
  }

  code += `  }\n`;
  code += `}`;

  return code;
}

/**
 * Generate decoder body with lazy getters for position fields
 */
function generateDecoderWithLazyFields(
  typeName: string,
  fields: Field[],
  instances: any[],
  schema: BinarySchema,
  globalEndianness: Endianness,
  indent: string,
  addTraceLogs: boolean = false
): string {
  let code = "";

  // Decode sequence fields first
  code += `${indent}const sequenceData: any = {};\n\n`;

  for (const field of fields) {
    code += generateDecodeField(field, schema, globalEndianness, indent, addTraceLogs).replace(/value\./g, "sequenceData.");
  }

  // Create class instance with lazy getters
  code += `\n${indent}// Create instance with lazy getters for position fields\n`;
  code += `${indent}// Pass root decoder (if available from context) so nested position fields can seek in full byte array\n`;
  code += `${indent}const decoder = this.context?._rootDecoder || this;\n`;
  code += `${indent}const root = this.context?._root;\n`;
  code += `${indent}const instance = new ${typeName}Instance(decoder, sequenceData, root);\n`;
  code += `${indent}return instance as ${typeName};\n`;

  return code;
}

/**
 * Generate decoding code for a single field
 */
function generateDecodeField(
  field: Field,
  schema: BinarySchema,
  globalEndianness: Endianness,
  indent: string,
  addTraceLogs: boolean = false
): string {
  if (!('type' in field)) return "";

  const fieldName = field.name;

  // Add trace logging before field decode
  let code = "";
  if (addTraceLogs) {
    code += `${indent}console.log('[TRACE] Decoding field: ${fieldName}');\n`;
  }

  // generateDecodeFieldCore handles both conditional and non-conditional fields
  code += generateDecodeFieldCore(field, schema, globalEndianness, fieldName, indent, addTraceLogs);

  // Add trace logging after field decode
  if (addTraceLogs) {
    code += `${indent}console.log('[TRACE] Decoded ${fieldName}:', value.${fieldName});\n`;
  }

  return code;
}

/**
 * Generate core decoding logic for a field
 */
function generateDecodeFieldCore(
  field: Field,
  schema: BinarySchema,
  globalEndianness: Endianness,
  fieldName: string,
  indent: string,
  addTraceLogs: boolean = false
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
    code += generateDecodeFieldCoreImpl(field, schema, globalEndianness, fieldName, indent + "  ", addTraceLogs);
    code += `${indent}}\n`;
    return code;
  }

  return generateDecodeFieldCoreImpl(field, schema, globalEndianness, fieldName, indent, addTraceLogs);
}

/**
 * Generate core decoding logic implementation (without conditional wrapper)
 */
function generateDecodeFieldCoreImpl(
  field: Field,
  schema: BinarySchema,
  globalEndianness: Endianness,
  fieldName: string,
  indent: string,
  addTraceLogs: boolean = false
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
      return generateDecodeArray(field, schema, globalEndianness, fieldName, indent, addTraceLogs);

    case "string":
      return generateDecodeString(field, globalEndianness, fieldName, indent, addTraceLogs);

    case "bitfield":
      return generateDecodeBitfield(field, fieldName, indent);

    case "discriminated_union":
      return generateDecodeDiscriminatedUnion(field, schema, globalEndianness, fieldName, indent, addTraceLogs);

    case "back_reference":
      return generateDecodeBackReference(field, schema, globalEndianness, fieldName, indent);

    case "optional":
      return generateDecodeOptional(field, schema, globalEndianness, fieldName, indent);

    default:
      // Type reference
      return generateDecodeTypeReference(field.type, schema, globalEndianness, fieldName, indent);
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
  indent: string,
  addTraceLogs: boolean = false
): string {
  const target = getTargetPath(fieldName);
  let code = "";

  if (addTraceLogs) {
    code += `${indent}console.log('[TRACE] Decoding discriminated union field ${fieldName}');\n`;
  }

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
        // Check if variant type is a back_reference - these need full bytes to seek backwards
        const variantTypeDef = schema.types[variant.type];
        const isBackReference = variantTypeDef && (variantTypeDef as any).type === "back_reference";
        // Determine the base object for context (usually "value" for top-level, or extract from target)
        const baseObject = target.includes(".") ? target.split(".")[0] : "value";
        if (isBackReference) {
          // Back-reference variant: pass full bytes (may seek to earlier offsets)
          code += `${indent}  const decoder = new ${variant.type}Decoder(this.bytes, ${baseObject});\n`;
          code += `${indent}  decoder.byteOffset = this.byteOffset;\n`;
          code += `${indent}  const decodedValue = decoder.decode();\n`;
          code += `${indent}  this.byteOffset = decoder.byteOffset;\n`;
        } else {
          // Non-reference variant: pass sliced bytes (standard pattern)
          code += `${indent}  const decoder = new ${variant.type}Decoder(this.bytes.slice(this.byteOffset), ${baseObject});\n`;
          code += `${indent}  const decodedValue = decoder.decode();\n`;
          code += `${indent}  this.byteOffset += decoder.byteOffset;\n`;
        }
        code += `${indent}  ${target} = { type: '${variant.type}', value: decodedValue };\n`;
        code += `${indent}}`;
        if (i < variants.length - 1) {
          code += "\n";
        }
      } else {
        // Fallback variant (no 'when' condition)
        code += ` else {\n`;
        // Check if variant type is a back_reference - these need full bytes to seek backwards
        const variantTypeDef = schema.types[variant.type];
        const isBackReference = variantTypeDef && (variantTypeDef as any).type === "back_reference";
        // Determine the base object for context (usually "value" for top-level, or extract from target)
        const baseObject = target.includes(".") ? target.split(".")[0] : "value";
        if (isBackReference) {
          // Back-reference variant: pass full bytes (may seek to earlier offsets)
          code += `${indent}  const decoder = new ${variant.type}Decoder(this.bytes, ${baseObject});\n`;
          code += `${indent}  decoder.byteOffset = this.byteOffset;\n`;
          code += `${indent}  const decodedValue = decoder.decode();\n`;
          code += `${indent}  this.byteOffset = decoder.byteOffset;\n`;
        } else {
          // Non-reference variant: pass sliced bytes (standard pattern)
          code += `${indent}  const decoder = new ${variant.type}Decoder(this.bytes.slice(this.byteOffset), ${baseObject});\n`;
          code += `${indent}  const decodedValue = decoder.decode();\n`;
          code += `${indent}  this.byteOffset += decoder.byteOffset;\n`;
        }
        code += `${indent}  ${target} = { type: '${variant.type}', value: decodedValue };\n`;
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

    // Determine the base object for discriminator field reference
    // If target contains a dot (e.g., "answers_item.rdata"), extract base object name
    // Otherwise use "value" for top-level fields
    const baseObject = target.includes(".") ? target.split(".")[0] : "value";
    const discriminatorRef = `${baseObject}.${discriminatorField}`;

    // Generate if-else chain for each variant using previously read field
    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];

      if (variant.when) {
        // Convert condition to TypeScript (replace 'value' with field reference)
        const condition = variant.when.replace(/\bvalue\b/g, discriminatorRef);
        const ifKeyword = i === 0 ? "if" : "else if";

        code += `${indent}${ifKeyword} (${condition}) {\n`;
        // Determine base object for context
        const baseObject = target.includes(".") ? target.split(".")[0] : "value";
        // Check if variant type is a back_reference - these need full bytes to seek backwards
        const variantTypeDef = schema.types[variant.type];
        const isBackReference = variantTypeDef && (variantTypeDef as any).type === "back_reference";
        if (isBackReference) {
          // Back-reference variant: pass full bytes (may seek to earlier offsets)
          code += `${indent}  const decoder = new ${variant.type}Decoder(this.bytes, ${baseObject});\n`;
          code += `${indent}  decoder.byteOffset = this.byteOffset;\n`;
          code += `${indent}  const payload = decoder.decode();\n`;
          code += `${indent}  this.byteOffset = decoder.byteOffset;\n`;
        } else {
          // Non-reference variant: pass sliced bytes (standard pattern)
          code += `${indent}  const decoder = new ${variant.type}Decoder(this.bytes.slice(this.byteOffset), ${baseObject});\n`;
          code += `${indent}  const payload = decoder.decode();\n`;
          code += `${indent}  this.byteOffset += decoder.byteOffset;\n`;
        }
        code += `${indent}  ${target} = { type: '${variant.type}', value: payload };\n`;
        code += `${indent}}`;
        if (i < variants.length - 1) {
          code += "\n";
        }
      } else {
        // Fallback variant
        code += ` else {\n`;
        // Determine base object for context
        const baseObject = target.includes(".") ? target.split(".")[0] : "value";
        // Check if variant type is a back_reference - these need full bytes to seek backwards
        const variantTypeDef = schema.types[variant.type];
        const isBackReference = variantTypeDef && (variantTypeDef as any).type === "back_reference";
        if (isBackReference) {
          // Back-reference variant: pass full bytes (may seek to earlier offsets)
          code += `${indent}  const decoder = new ${variant.type}Decoder(this.bytes, ${baseObject});\n`;
          code += `${indent}  decoder.byteOffset = this.byteOffset;\n`;
          code += `${indent}  const payload = decoder.decode();\n`;
          code += `${indent}  this.byteOffset = decoder.byteOffset;\n`;
        } else {
          // Non-reference variant: pass sliced bytes (standard pattern)
          code += `${indent}  const decoder = new ${variant.type}Decoder(this.bytes.slice(this.byteOffset), ${baseObject});\n`;
          code += `${indent}  const payload = decoder.decode();\n`;
          code += `${indent}  this.byteOffset += decoder.byteOffset;\n`;
        }
        code += `${indent}  ${target} = { type: '${variant.type}', value: payload };\n`;
        code += `${indent}}\n`;
        return code;
      }
    }

    // No fallback - throw error for unknown discriminator
    code += ` else {\n`;
    code += `${indent}  throw new Error(\`Unknown discriminator value: \${${discriminatorRef}}\`);\n`;
    code += `${indent}}\n`;
  }

  return code;
}

/**
 * Generate decoding for optional field
 */
function generateDecodeOptional(
  field: any,
  schema: BinarySchema,
  globalEndianness: Endianness,
  fieldName: string,
  indent: string
): string {
  const valueType = field.value_type;
  const presenceType = field.presence_type || "uint8";

  let code = "";

  // Read presence flag
  const presentVar = `${fieldName.replace(/\./g, "_")}_present`;
  code += `${indent}const ${presentVar} = `;

  if (presenceType === "uint8") {
    code += `this.readUint8();\n`;
  } else if (presenceType === "bit") {
    code += `Number(this.readBits(1));\n`;
  }

  // Only set field if present (omit if not present)
  code += `${indent}if (${presentVar} !== 0) {\n`;

  // Create synthetic field for value type
  const syntheticField: any = {
    type: valueType,
    name: fieldName
  };

  // Preserve endianness if specified
  if (field.endianness) {
    syntheticField.endianness = field.endianness;
  }

  code += generateDecodeFieldCoreImpl(syntheticField, schema, globalEndianness, fieldName, indent + "  ");
  code += `${indent}}\n`;

  return code;
}

/**
 * Generate decoding for back_reference
 */
function generateDecodeBackReference(
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
  const endiannessArg = storage !== "uint8" ? `'${endianness}'` : "";

  let code = "";

  // Initialize visitedOffsets set (shared across all back_reference decoders)
  code += `${indent}if (!this.visitedOffsets) {\n`;
  code += `${indent}  this.visitedOffsets = new Set<number>();\n`;
  code += `${indent}}\n\n`;

  // Read back_reference storage value
  if (storage === "uint8") {
    code += `${indent}const referenceValue = this.read${capitalize(storage)}();\n`;
  } else {
    code += `${indent}const referenceValue = this.read${capitalize(storage)}(${endiannessArg});\n`;
  }

  // Extract offset using mask
  code += `${indent}const offset = referenceValue & ${offsetMask};\n\n`;

  // Check for circular reference
  code += `${indent}if (this.visitedOffsets.has(offset)) {\n`;
  code += `${indent}  throw new Error(\`Circular back_reference detected at offset \${offset}\`);\n`;
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

  // Decode target type inline (we're already positioned at the target)
  // Pass fieldName (not target path) since generateDecodeTypeReference will add "value." prefix
  code += generateDecodeTypeReference(targetType, schema, globalEndianness, fieldName, indent);

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
 * Generate decoding for array field
 */
function generateDecodeArray(
  field: any,
  schema: BinarySchema,
  globalEndianness: Endianness,
  fieldName: string,
  indent: string,
  addTraceLogs: boolean = false
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
 * Get the target path for a field (handles array item variables)
 */
function getTargetPath(fieldName: string): string {
  // Array item variables contain '_item' and should not be prefixed with 'value.'
  return fieldName.includes("_item") ? fieldName : `value.${fieldName}`;
}

/**
 * Generate decoding for a value directly to a target path (for Optional<T> value fields)
 * This bypasses getTargetPath to avoid double-prefixing with "value."
 */
function generateDecodeValueField(
  field: Field,
  schema: BinarySchema,
  globalEndianness: Endianness,
  targetPath: string,
  indent: string
): string {
  const fieldType = field.type;

  switch (fieldType) {
    case "uint8":
      return `${indent}${targetPath} = this.readUint8();\n`;
    case "uint16":
      return `${indent}${targetPath} = this.readUint16("${globalEndianness}");\n`;
    case "uint32":
      return `${indent}${targetPath} = this.readUint32("${globalEndianness}");\n`;
    case "uint64":
      return `${indent}${targetPath} = this.readUint64("${globalEndianness}");\n`;
    case "int8":
      return `${indent}${targetPath} = this.readInt8();\n`;
    case "int16":
      return `${indent}${targetPath} = this.readInt16("${globalEndianness}");\n`;
    case "int32":
      return `${indent}${targetPath} = this.readInt32("${globalEndianness}");\n`;
    case "int64":
      return `${indent}${targetPath} = this.readInt64("${globalEndianness}");\n`;
    case "float32":
      return `${indent}${targetPath} = this.readFloat32("${globalEndianness}");\n`;
    case "float64":
      return `${indent}${targetPath} = this.readFloat64("${globalEndianness}");\n`;
    default:
      // For complex types, we need to decode into the target
      // Extract just the field name from the target path (e.g., "value.maybe_id" -> "maybe_id")
      const fieldName = targetPath.replace(/^value\./, '');
      return generateDecodeFieldCoreImpl(field, schema, globalEndianness, fieldName, indent);
  }
}

/**
 * Calculate the size in bytes of an item type
 * Used for length_prefixed_items arrays
 */
function getItemSize(itemDef: any, schema: BinarySchema, globalEndianness: Endianness): number {
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
 * Generate decoding for string field
 */
function generateDecodeString(
  field: any,
  globalEndianness: Endianness,
  fieldName: string,
  indent: string,
  addTraceLogs: boolean = false
): string {
  const encoding = field.encoding || "utf8";
  let kind = field.kind;
  const target = getTargetPath(fieldName);
  let code = "";

  if (addTraceLogs) {
    code += `${indent}console.log('[TRACE] Decoding string field ${fieldName}, kind: ${kind}, length_field: ${field.length_field}, length: ${field.length}');\n`;
  }

  // Auto-detect field_referenced: if kind is "fixed" but length_field exists, treat as field_referenced
  if (kind === "fixed" && field.length_field && !field.length) {
    kind = "field_referenced";
    if (addTraceLogs) {
      code += `${indent}console.log('[TRACE] Auto-detected field_referenced string for ${fieldName}');\n`;
    }
  }

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
  } else if (kind === "field_referenced") {
    // Length comes from a previously-decoded field
    const lengthField = field.length_field;
    const lengthVarName = fieldName.replace(/\./g, "_") + "_length";

    // Resolve the length field (same logic as field_referenced arrays)
    if (lengthField.startsWith('_root.')) {
      // Reference to root object - access via context._root
      const rootPath = lengthField.substring(6); // Remove "_root."
      code += `${indent}const ${lengthVarName} = this.context?._root?.${rootPath};\n`;
      code += `${indent}if (${lengthVarName} === undefined) {\n`;
      code += `${indent}  throw new Error('Field-referenced string length field "${lengthField}" not found in context._root');\n`;
      code += `${indent}}\n`;
    } else {
      // Regular field reference - need to account for inline type decoding and array items
      // If fieldName is "local_file.filename", lengthField should be resolved relative to "local_file"
      // If fieldName is "entries_item.filename", use "entries_item" directly (no "value." prefix)
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
      code += `${indent}  throw new Error('Field-referenced string length field "${lengthField}" not found in value or context');\n`;
      code += `${indent}}\n`;
    }

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
  globalEndianness: Endianness,
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
      // For generic types, inline expand by replacing T with the type argument
      const templateFields = getTypeFields(templateDef);
      let code = `${indent}${target} = {};\n`;
      for (const field of templateFields) {
        // Replace T with the actual type
        const expandedField = JSON.parse(
          JSON.stringify(field).replace(/"T"/g, `"${typeArg}"`)
        );
        const subFieldCode = generateDecodeFieldCore(
          expandedField,
          schema,
          globalEndianness,
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

  const typeDefAny = typeDef as any;

  // Handle standalone string types - decode using the aliased string type
  if (typeDefAny.type === 'string') {
    const pseudoField = { ...typeDefAny, name: fieldName.split('.').pop() };
    return generateDecodeFieldCoreImpl(pseudoField, schema, globalEndianness, fieldName, indent);
  }

  // Handle standalone array types - decode using the aliased array type
  if (typeDefAny.type === 'array') {
    const pseudoField = { ...typeDefAny, name: fieldName.split('.').pop() };
    return generateDecodeFieldCoreImpl(pseudoField, schema, globalEndianness, fieldName, indent);
  }

  // Check if this is a type alias
  if (isTypeAlias(typeDef)) {
    // Type alias - decode directly using the aliased type
    const aliasedType = typeDef as any;
    const pseudoField = { ...aliasedType, name: fieldName.split('.').pop() };
    return generateDecodeFieldCoreImpl(pseudoField, schema, globalEndianness, fieldName, indent);
  }

  // Check if type has instance fields (position-based lazy loading)
  const hasInstanceFields = typeDefAny.instances && Array.isArray(typeDefAny.instances) && typeDefAny.instances.length > 0;

  if (hasInstanceFields) {
    // Type has instance fields - must use standalone decoder to create instance with lazy getters
    // Cannot inline decode because we need the wrapper class
    const decoderClass = `${typeRef}Decoder`;
    let code = "";

    // Read all sequence fields to pass to decoder
    const sequenceFields = getTypeFields(typeDef);
    const isArrayItem = fieldName.includes("_item");

    // Create a temporary variable for the decoded data
    const tempVar = fieldName.replace(/\./g, "_") + "_data";
    code += `${indent}const ${tempVar}: any = {};\n`;

    // Decode all sequence fields into temp variable
    for (const field of sequenceFields) {
      const subFieldCode = generateDecodeFieldCore(
        field,
        schema,
        globalEndianness,
        `${tempVar}.${field.name}`,
        indent
      );
      // Replace target path to use tempVar instead of value/item
      const modifiedCode = subFieldCode.replace(
        new RegExp(`${isArrayItem ? fieldName : `value\\.${fieldName}`}\\.`, 'g'),
        `${tempVar}.`
      );
      code += modifiedCode;
    }

    // Create instance using decoded data
    // Pass the root decoder (with full bytes) so position fields can seek correctly
    const rootDecoderExpr = "this.context?._rootDecoder || this";
    code += `${indent}${target} = new ${typeRef}Instance(${rootDecoderExpr}, ${tempVar}, this.context?._root || this as any);\n`;

    return code;
  }

  // Composite type without instance fields - safe to inline decode
  const fields = getTypeFields(typeDef);
  let code = `${indent}${target} = {};\n`;
  for (const field of fields) {
    const subFieldCode = generateDecodeFieldCore(
      field,
      schema,
      globalEndianness,
      `${fieldName}.${field.name}`,
      indent
    );
    code += subFieldCode;
  }

  return code;
}
