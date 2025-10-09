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
 * Generate TypeScript code for all types in the schema
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
      default:
        // Type reference
        return resolveTypeReference(element.type, schema);
    }
  }
  return "any";
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

    default:
      // Type reference - need to encode nested struct
      return generateEncodeTypeReference(field.type, schema, valuePath, indent);
  }
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

    default:
      // Type reference
      return generateDecodeTypeReference(field.type, schema, fieldName, indent);
  }
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
