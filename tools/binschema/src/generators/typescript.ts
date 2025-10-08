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
 * Generate TypeScript code for all types in the schema
 */
export function generateTypeScript(schema: BinarySchema): string {
  const globalEndianness = schema.config?.endianness || "big_endian";
  const globalBitOrder = schema.config?.bit_order || "msb_first";

  // Import runtime library (relative to .generated/ → dist/runtime/)
  let code = `import { BitStreamEncoder, BitStreamDecoder, Endianness } from "../dist/runtime/bit-stream.js";\n\n`;

  // Generate code for each type (skip generic types like Optional<T>)
  for (const [typeName, typeDef] of Object.entries(schema.types)) {
    // Skip generic type templates (contain < or T parameter)
    if (typeName.includes('<') || typeName.includes('T')) {
      continue;
    }

    code += generateTypeCode(typeName, typeDef as TypeDef, schema, globalEndianness, globalBitOrder);
    code += "\n\n";
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
  // Generate TypeScript interface for the value
  const interfaceCode = generateInterface(typeName, typeDef, schema);

  // Generate encoder class
  const encoderCode = generateEncoder(typeName, typeDef, schema, globalEndianness, globalBitOrder);

  // Generate decoder class
  const decoderCode = generateDecoder(typeName, typeDef, schema, globalEndianness, globalBitOrder);

  return `${interfaceCode}\n\n${encoderCode}\n\n${decoderCode}`;
}

/**
 * Generate TypeScript interface for a type
 */
function generateInterface(typeName: string, typeDef: TypeDef, schema: BinarySchema): string {
  let code = `export interface ${typeName} {\n`;

  for (const field of typeDef.fields) {
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
      // Generate inline interface structure
      const fields: string[] = [];
      for (const field of templateDef.fields) {
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

  // Simple type reference
  return typeRef;
}

/**
 * Check if field is conditional
 */
function isFieldConditional(field: Field): boolean {
  return 'conditional' in field && field.conditional !== undefined;
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
  let code = `export class ${typeName}Encoder extends BitStreamEncoder {\n`;
  code += `  constructor() {\n`;
  code += `    super("${globalBitOrder}");\n`;
  code += `  }\n\n`;

  // Generate encode method
  code += `  encode(value: ${typeName}): Uint8Array {\n`;

  for (const field of typeDef.fields) {
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

  // Handle conditional fields
  if (isFieldConditional(field)) {
    let code = `${indent}if (${valuePath} !== undefined) {\n`;
    code += generateEncodeFieldCore(field, schema, globalEndianness, valuePath, indent + "  ");
    code += `${indent}}\n`;
    return code;
  }

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
    const conditional = 'conditional' in field ? field.conditional : '';
    // Simple conditional evaluation (just check if field is present/defined)
    let code = `${indent}if (${valuePath} !== undefined) {\n`;
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

  // Write array elements
  code += `${indent}for (const item of ${valuePath}) {\n`;

  // Safety check for items field
  if (!field.items || typeof field.items !== 'object') {
    code += `${indent}  // TODO: Array items type not specified\n`;
  } else {
    code += generateEncodeFieldCoreImpl(
      field.items as Field,
      schema,
      globalEndianness,
      "item",
      indent + "  "
    );
  }

  code += `${indent}}\n`;

  // Write null terminator if null_terminated
  if (field.kind === "null_terminated") {
    code += `${indent}this.writeUint8(0);\n`;
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
      // Inline expand the generic by replacing T with the type argument
      let code = "";
      for (const field of templateDef.fields) {
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

  let code = "";
  for (const field of typeDef.fields) {
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
  let code = `export class ${typeName}Decoder extends BitStreamDecoder {\n`;
  code += `  decode(): ${typeName} {\n`;
  code += `    const value: any = {};\n\n`;

  for (const field of typeDef.fields) {
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

  // Handle conditional fields
  if (isFieldConditional(field)) {
    // TODO: Evaluate condition
    let code = `${indent}// Conditional: ${field.conditional}\n`;
    code += `${indent}// TODO: Implement conditional logic\n`;
    return code;
  }

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

  const endianness = 'endianness' in field && field.endianness
    ? field.endianness
    : globalEndianness;

  switch (field.type) {
    case "bit":
      return `${indent}value.${fieldName} = Number(this.readBits(${field.size}));\n`;

    case "uint8":
      return `${indent}value.${fieldName} = this.readUint8();\n`;

    case "uint16":
      return `${indent}value.${fieldName} = this.readUint16("${endianness}");\n`;

    case "uint32":
      return `${indent}value.${fieldName} = this.readUint32("${endianness}");\n`;

    case "uint64":
      return `${indent}value.${fieldName} = this.readUint64("${endianness}");\n`;

    case "int8":
      return `${indent}value.${fieldName} = this.readInt8();\n`;

    case "int16":
      return `${indent}value.${fieldName} = this.readInt16("${endianness}");\n`;

    case "int32":
      return `${indent}value.${fieldName} = this.readInt32("${endianness}");\n`;

    case "int64":
      return `${indent}value.${fieldName} = this.readInt64("${endianness}");\n`;

    case "float32":
      return `${indent}value.${fieldName} = this.readFloat32("${endianness}");\n`;

    case "float64":
      return `${indent}value.${fieldName} = this.readFloat64("${endianness}");\n`;

    case "array":
      return generateDecodeArray(field, schema, globalEndianness, fieldName, indent);

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
  let code = `${indent}value.${fieldName} = [];\n`;

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
    code += `${indent}const ${fieldName}_length = ${lengthRead};\n`;
    code += `${indent}for (let i = 0; i < ${fieldName}_length; i++) {\n`;
  } else if (field.kind === "fixed") {
    code += `${indent}for (let i = 0; i < ${field.length}; i++) {\n`;
  } else if (field.kind === "null_terminated") {
    // Read until null byte
    code += `${indent}while (true) {\n`;
    code += `${indent}  const byte = this.readUint8();\n`;
    code += `${indent}  if (byte === 0) break;\n`;
    code += `${indent}  value.${fieldName}.push(byte);\n`;
    code += `${indent}}\n`;
    return code;
  }

  // Read array item
  const itemDecodeCode = generateDecodeFieldCore(
    { ...field.items, name: "item" },
    schema,
    globalEndianness,
    "item",
    indent + "  "
  );

  // For primitive types, directly push
  if (itemDecodeCode.includes("item =")) {
    code += `${indent}  let item: any;\n`;
    code += itemDecodeCode;
    code += `${indent}  value.${fieldName}.push(item);\n`;
  }

  code += `${indent}}\n`;

  return code;
}

/**
 * Generate decoding for bitfield
 */
function generateDecodeBitfield(field: any, fieldName: string, indent: string): string {
  let code = `${indent}value.${fieldName} = {};\n`;

  for (const subField of field.fields) {
    code += `${indent}value.${fieldName}.${subField.name} = Number(this.readBits(${subField.size}));\n`;
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
  // Check if this is a generic type instantiation (e.g., Optional<uint64>)
  const genericMatch = typeRef.match(/^(\w+)<(.+)>$/);
  if (genericMatch) {
    const [, genericType, typeArg] = genericMatch;
    const templateDef = schema.types[`${genericType}<T>`] as TypeDef | undefined;

    if (templateDef) {
      // Inline expand the generic by replacing T with the type argument
      let code = `${indent}value.${fieldName} = {};\n`;
      for (const field of templateDef.fields) {
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

  let code = `${indent}value.${fieldName} = {};\n`;
  for (const field of typeDef.fields) {
    const subFieldCode = generateDecodeFieldCore(
      field,
      schema,
      "big_endian",
      `${fieldName}.${field.name}`,
      indent
    );
    code += subFieldCode.replace(`value.${fieldName}.`, `value.${fieldName}.`);
  }

  return code;
}
