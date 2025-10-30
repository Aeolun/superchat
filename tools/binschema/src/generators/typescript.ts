import { BinarySchema, TypeDef, Field, Endianness } from "../schema/binary-schema.js";
import type { GeneratedCode, DocInput, DocBlock } from "./typescript/shared.js";
import { isTypeAlias, getTypeFields, isBackReferenceTypeDef, isBackReferenceType, sanitizeTypeName, sanitizeVarName, sanitizeEnumMemberName } from "./typescript/type-utils.js";
import { getFieldDocumentation, generateJSDoc } from "./typescript/documentation.js";
import { generateRuntimeHelpers } from "./typescript/runtime-helpers.js";
import {
  generateEncodeBitfield,
  generateDecodeBitfield,
  generateFunctionalEncodeBitfield,
  generateFunctionalDecodeBitfield
} from "./typescript/bitfield-support.js";
import {
  generateEncodeComputedField,
  resolveComputedFieldPath,
  parseSameIndexTarget,
  detectSameIndexTracking
} from "./typescript/computed-fields.js";
import {
  generateEncodeBackReference,
  generateDecodeBackReference,
  generateInlinedBackReferenceDecoder,
  generateFunctionalBackReference,
  resolveBackReferenceType,
  capitalize
} from "./typescript/back-references.js";
import {
  generateEncodeString,
  generateDecodeString,
  generateFunctionalEncodeString,
  generateFunctionalDecodeString
} from "./typescript/string-support.js";
import {
  generateEncodeArray,
  generateDecodeArray,
  generateFunctionalEncodeArray,
  generateFunctionalDecodeArray,
  getItemSize
} from "./typescript/array-support.js";

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
  code += `import { createReader } from "./binary-reader.js";\n`;
  code += `import { crc32 } from "./crc32.js";\n\n`;

  // Helper utilities for safe conditional evaluation (avoid runtime errors during decode/encode)
  code += generateRuntimeHelpers();

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
  const decodeCode = generateFunctionalDecodeArray(arrayField, schema, globalEndianness, 'result', '  ', getElementTypeScriptType, generateDecodeChoice, generateDecodeDiscriminatedUnionInline);

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
/**
 * Generate functional encoding for array
 */

/**
 * Generate functional encoding for string
 */

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
      return generateFunctionalDecodeArray(field, schema, globalEndianness, fieldName, indent, getElementTypeScriptType, generateDecodeChoice, generateDecodeDiscriminatedUnionInline);
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

/**
 * Generate functional decoding for string
 */

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
      case "choice":
        // Generate flat union type from choices
        return generateChoiceType(element, schema);
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
 * Generate TypeScript union type for choice (flat discriminated union)
 */
function generateChoiceType(choiceDef: any, schema: BinarySchema): string {
  const choices: string[] = [];
  for (const choice of choiceDef.choices) {
    const choiceType = resolveTypeReference(choice.type, schema);
    // Flat union: each choice type includes { type: string } as part of its structure
    // The discriminator field is part of the type itself, not a wrapper
    choices.push(`(${choiceType} & { type: '${choice.type}' })`);
  }
  return "\n  | " + choices.join("\n  | ");
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
  code += `  private compressionDict: Map<string, number> = new Map();\n`;

  // Detect if any fields need same_index tracking and declare tracking variables
  for (const field of fields) {
    if ('type' in field && field.type === 'array') {
      const trackingTypes = detectSameIndexTracking(field as any, schema);
      if (trackingTypes) {
        const fieldName = field.name;
        for (const typeName of trackingTypes) {
          code += `  private _positions_${fieldName}_${typeName}: number[] = [];\n`;
        }
        // Declare index counters for all choice types
        const choices = (field as any).items?.choices || [];
        for (const choice of choices) {
          code += `  private _index_${fieldName}_${choice.type}: number = 0;\n`;
        }
      }
    }
  }

  code += `\n  constructor() {\n`;
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
    code += generateEncodeField(field, schema, globalEndianness, "    ", typeName, fields);
  }

  code += `    return this.finish();\n`;
  code += `  }\n`;
  code += `}`;

  return code;
}

/**
 * Resolve parent references in computed field targets
 *
 * When nested structs are inlined (current implementation), all encoding happens
 * in the context of the root struct. Therefore, all parent references (../, ../../, etc.)
 * resolve to fields in the root `value` object.
 *
 * Examples:
 *   "field" → "value.field" (sibling field)
 *   "../field" → "value.field" (parent's field, but inlined so same as root)
 *   "../../field" → "value.field" (grandparent's field, but inlined so same as root)
 */
/**
 * Generate encoding code for a single field
 */
function generateEncodeField(
  field: Field,
  schema: BinarySchema,
  globalEndianness: Endianness,
  indent: string,
  typeName?: string,
  allFields?: Field[]
): string {
  if (!('type' in field)) return "";

  const fieldAny = field as any;
  const fieldName = field.name;

  // Handle computed fields - generate computation code instead of reading from value
  if (fieldAny.computed) {
    return generateEncodeComputedField(field, schema, globalEndianness, indent, undefined, typeName, allFields);
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
  indent: string,
  typeName?: string,
  containingFields?: Field[]
): string {
  if (!('type' in field)) return "";

  const fieldAny = field as any;

  // Handle computed fields - generate computation code instead of reading from value
  if (fieldAny.computed) {
    // Extract the base object path (remove the field name)
    const lastDotIndex = valuePath.lastIndexOf('.');
    const baseObjectPath = lastDotIndex > 0 ? valuePath.substring(0, lastDotIndex) : "value";
    return generateEncodeComputedField(field, schema, globalEndianness, indent, baseObjectPath, typeName, containingFields);
  }

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
      return generateEncodeArray(field, schema, globalEndianness, valuePath, indent, generateEncodeFieldCoreImpl);

    case "string":
      return generateEncodeString(field, globalEndianness, valuePath, indent);

    case "bitfield":
      return generateEncodeBitfield(field, valuePath, indent);

    case "discriminated_union":
      return generateEncodeDiscriminatedUnion(field, schema, globalEndianness, valuePath, indent);

    case "choice":
      return generateEncodeChoice(field, schema, globalEndianness, valuePath, indent);

    case "back_reference":
      return generateEncodeBackReference(field, schema, globalEndianness, valuePath, indent, generateEncodeTypeReference);

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
function generateEncodeChoice(
  field: any,
  schema: BinarySchema,
  globalEndianness: Endianness,
  valuePath: string,
  indent: string
): string {
  let code = "";
  const choices = field.choices || [];

  // TODO: Auto-detect discriminator field from choice types
  // For now, assume first field of each type is the discriminator

  // Generate if-else chain for each choice
  // Unlike discriminated_union, choice uses flat structure (no .value wrapper)
  for (let i = 0; i < choices.length; i++) {
    const choice = choices[i];
    const ifKeyword = i === 0 ? "if" : "else if";

    code += `${indent}${ifKeyword} (${valuePath}.type === '${choice.type}') {\n`;

    // Encode the choice directly (no .value wrapper like discriminated_union)
    code += generateEncodeTypeReference(choice.type, schema, globalEndianness, valuePath, indent + "  ");

    code += `${indent}}`;
    if (i < choices.length - 1) {
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
 * Generate decoding for choice (flat discriminated union)
 */
function generateDecodeChoice(
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
    code += `${indent}console.log('[TRACE] Decoding choice field ${fieldName}');\n`;
  }

  const choices = field.choices || [];

  // TODO: Auto-detect discriminator field from all choice types
  // For now, peek at first byte (assuming uint8 discriminator as first field)

  // Peek discriminator value (first byte of first field)
  code += `${indent}const discriminator = this.peekUint8();\n`;

  // Generate if-else chain for each choice
  for (let i = 0; i < choices.length; i++) {
    const choice = choices[i];
    const ifKeyword = i === 0 ? "if" : "else if";

    // We need to get the discriminator value for this choice type
    // For now, assume the discriminator values are 0x01, 0x02, etc.
    // TODO: Extract actual discriminator values from type definitions
    const discriminatorValue = i + 1;

    code += `${indent}${ifKeyword} (discriminator === 0x${discriminatorValue.toString(16).padStart(2, '0')}) {\n`;

    // Determine the base object for context
    const baseObject = target.includes(".") ? target.split(".")[0] : "value";

    // Choice uses flat structure - decode directly into target without wrapper
    code += `${indent}  const decoder = new ${choice.type}Decoder(this.bytes.slice(this.byteOffset), ${baseObject});\n`;
    code += `${indent}  const decodedValue = decoder.decode();\n`;
    code += `${indent}  this.byteOffset += decoder.byteOffset;\n`;

    // Add type property for TypeScript discrimination (flat structure, not wrapped)
    code += `${indent}  ${target} = { ...decodedValue, type: '${choice.type}' };\n`;
    code += `${indent}}`;
    if (i < choices.length - 1) {
      code += "\n";
    }
  }

  code += ` else {\n`;
  code += `${indent}  throw new Error(\`Unknown choice discriminator: 0x\${discriminator.toString(16)}\`);\n`;
  code += `${indent}}\n`;

  return code;
}

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
 * Generate encoding for array field
 */

/**
 * Generate encoding for bitfield
 */

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
    code += generateEncodeFieldCore(field, schema, globalEndianness, newValuePath, indent, typeRef, fields);
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
      return generateDecodeArray(field, schema, globalEndianness, fieldName, indent, addTraceLogs, getTargetPath, generateDecodeFieldCore);

    case "string":
      return generateDecodeString(field, globalEndianness, fieldName, indent, addTraceLogs, getTargetPath);

    case "bitfield":
      return generateDecodeBitfield(field, fieldName, indent, getTargetPath);

    case "discriminated_union":
      return generateDecodeDiscriminatedUnion(field, schema, globalEndianness, fieldName, indent, addTraceLogs);

    case "choice":
      return generateDecodeChoice(field, schema, globalEndianness, fieldName, indent, addTraceLogs);

    case "back_reference":
      return generateDecodeBackReference(field, schema, globalEndianness, fieldName, indent, getTargetPath, generateDecodeTypeReference);

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
 * Generate decoding for array field
 */

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


/**
 * Generate decoding for bitfield
 */

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
