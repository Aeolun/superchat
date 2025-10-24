// ABOUTME: Generates Go encoder/decoder code from BinSchema definitions
// ABOUTME: Produces byte-for-byte compatible code with TypeScript runtime

import type { BinarySchema, Field, Endianness } from "../schema/binary-schema.js";

/**
 * Options for Go code generation
 */
export interface GoGeneratorOptions {
  packageName?: string; // default: "main"
  runtimeImport?: string; // default: "github.com/anthropics/binschema/runtime"
}

/**
 * Generated Go code result
 */
export interface GeneratedGoCode {
  code: string;
  typeName: string;
}

/**
 * Generates Go encoder/decoder code from a binary schema.
 *
 * Produces:
 * - Struct type definition with exported fields
 * - Encode() ([]byte, error) method for serialization
 * - DecodeTypeName([]byte) (*TypeName, error) function for deserialization
 *
 * @param schema - The binary schema definition
 * @param typeName - The type to generate code for
 * @param options - Optional generation options
 * @returns Generated Go code
 */
export function generateGo(
  schema: BinarySchema,
  typeName: string,
  options?: GoGeneratorOptions
): GeneratedGoCode {
  const pkg = options?.packageName || "main";
  const runtimePkg = options?.runtimeImport || "github.com/anthropics/binschema/runtime";

  // Verify the requested type exists
  if (!schema.types[typeName]) {
    throw new Error(`Type ${typeName} not found in schema`);
  }

  const lines: string[] = [];

  // Determine default endianness
  const defaultEndianness = schema.config?.endianness || "big_endian";

  // Check if we need io import (only for nested structs that need Encode())
  const needsIOImport = hasNestedStructs(schema);

  // Package and imports
  lines.push(`package ${pkg}`);
  lines.push(``);
  lines.push(`import (`);
  lines.push(`\t"fmt"`);
  if (needsIOImport) {
    lines.push(`\t"io"`);
  }
  lines.push(`\t"${runtimePkg}"`);
  lines.push(`)`);
  lines.push(``);


  // Generate all types in the schema (Go doesn't require forward declarations)
  for (const [name, typeDef] of Object.entries(schema.types)) {
    // Check if this is a composite type (has sequence) or type alias
    if ("sequence" in typeDef) {
      // Composite type with fields
      lines.push(...generateStruct(name, typeDef.sequence));
      lines.push(...generateEncodeMethod(name, typeDef.sequence, defaultEndianness));
      lines.push(...generateDecodeFunction(name, typeDef.sequence, defaultEndianness));
    } else if ("type" in typeDef) {
      // Type alias - generate Go type alias
      lines.push(...generateTypeAlias(name, typeDef as any, defaultEndianness));
    } else if ("variants" in typeDef) {
      // Discriminated union - not yet implemented
      lines.push(`// TODO: Discriminated union type ${name} not yet implemented`);
      lines.push(``);
    } else {
      // Unknown type definition
      throw new Error(`Unknown type definition for ${name}: ${JSON.stringify(typeDef)}`);
    }
  }

  return {
    code: lines.join("\n"),
    typeName,
  };
}

/**
 * Generates a type alias
 */
function generateTypeAlias(name: string, typeDef: any, defaultEndianness: string): string[] {
  const lines: string[] = [];

  // For now, treat type aliases as a struct with a single field "Value"
  // This allows the alias to have its own Encode/Decode methods
  const field: Field = {
    name: "value",
    type: typeDef.type,
    ...typeDef
  };

  lines.push(...generateStruct(name, [field]));
  lines.push(...generateEncodeMethod(name, [field], defaultEndianness));
  lines.push(...generateDecodeFunction(name, [field], defaultEndianness));

  return lines;
}

/**
 * Checks if schema has nested struct types (which require io import)
 */
function hasNestedStructs(schema: BinarySchema): boolean {
  // Always return false for now - io import is never actually used
  // We encode nested structs by calling their Encode() method which returns []byte
  return false;
}

/**
 * Checks if a type is a primitive
 */
function isPrimitiveType(type: string): boolean {
  return ["uint8", "uint16", "uint32", "uint64", "int8", "int16", "int32", "int64", "float32", "float64"].includes(type);
}

/**
 * Generates a Go struct definition
 */
function generateStruct(name: string, fields: Field[]): string[] {
  const lines: string[] = [];

  lines.push(`type ${name} struct {`);

  for (const field of fields) {
    const goType = mapFieldToGoType(field);
    const fieldName = toGoFieldName(field.name);
    lines.push(`\t${fieldName} ${goType}`);
  }

  lines.push(`}`);
  lines.push(``);

  return lines;
}

/**
 * Generates an Encode method for a struct
 */
function generateEncodeMethod(name: string, fields: Field[], defaultEndianness: string): string[] {
  const lines: string[] = [];

  lines.push(`func (m *${name}) Encode() ([]byte, error) {`);
  lines.push(`\tencoder := runtime.NewBitStreamEncoder(runtime.MSBFirst)`);
  lines.push(``);

  // Generate encoding logic for each field
  for (const field of fields) {
    lines.push(...generateEncodeField(field, defaultEndianness, "\t"));
  }

  lines.push(``);
  lines.push(`\treturn encoder.Finish(), nil`);
  lines.push(`}`);
  lines.push(``);

  return lines;
}

/**
 * Generates a Decode function for a struct
 */
function generateDecodeFunction(name: string, fields: Field[], defaultEndianness: string): string[] {
  const lines: string[] = [];

  // Public decode function
  lines.push(`func Decode${name}(bytes []byte) (*${name}, error) {`);
  lines.push(`\tdecoder := runtime.NewBitStreamDecoder(bytes, runtime.MSBFirst)`);
  lines.push(`\treturn decode${name}WithDecoder(decoder)`);
  lines.push(`}`);
  lines.push(``);

  // Helper function that accepts an existing decoder (for nested structs)
  lines.push(`func decode${name}WithDecoder(decoder *runtime.BitStreamDecoder) (*${name}, error) {`);
  lines.push(`\tresult := &${name}{}`);
  lines.push(``);

  // Generate decoding logic for each field
  for (const field of fields) {
    lines.push(...generateDecodeField(field, defaultEndianness, "\t"));
  }

  lines.push(``);
  lines.push(`\treturn result, nil`);
  lines.push(`}`);
  lines.push(``);

  return lines;
}

/**
 * Generates encoding code for a single field
 */
function generateEncodeField(field: Field, defaultEndianness: string, indent: string): string[] {
  const lines: string[] = [];
  const fieldName = `m.${toGoFieldName(field.name)}`;
  const endianness = (field as any).endianness || defaultEndianness;
  const runtimeEndianness = mapEndianness(endianness);

  // Handle conditional fields
  if ((field as any).conditional) {
    const condition = convertConditionalToGo((field as any).conditional);
    lines.push(`${indent}if ${condition} {`);
    const innerLines = generateEncodeFieldImpl(field, fieldName, endianness, runtimeEndianness, indent + "\t");
    lines.push(...innerLines);
    lines.push(`${indent}}`);
    return lines;
  }

  // Handle optional fields
  if (field.type === "optional") {
    return generateEncodeOptional(field as any, fieldName, endianness, runtimeEndianness, indent);
  }

  return generateEncodeFieldImpl(field, fieldName, endianness, runtimeEndianness, indent);
}

/**
 * Generates encoding implementation for a field (without conditional/optional wrapper)
 */
function generateEncodeFieldImpl(field: Field, fieldName: string, endianness: string, runtimeEndianness: string, indent: string): string[] {
  const lines: string[] = [];

  switch (field.type) {
    case "uint8":
      lines.push(`${indent}encoder.WriteUint8(${fieldName})`);
      break;

    case "uint16":
      lines.push(`${indent}encoder.WriteUint16(${fieldName}, runtime.${runtimeEndianness})`);
      break;

    case "uint32":
      lines.push(`${indent}encoder.WriteUint32(${fieldName}, runtime.${runtimeEndianness})`);
      break;

    case "uint64":
      lines.push(`${indent}encoder.WriteUint64(${fieldName}, runtime.${runtimeEndianness})`);
      break;

    case "int8":
      lines.push(`${indent}encoder.WriteInt8(${fieldName})`);
      break;

    case "int16":
      lines.push(`${indent}encoder.WriteInt16(${fieldName}, runtime.${runtimeEndianness})`);
      break;

    case "int32":
      lines.push(`${indent}encoder.WriteInt32(${fieldName}, runtime.${runtimeEndianness})`);
      break;

    case "int64":
      lines.push(`${indent}encoder.WriteInt64(${fieldName}, runtime.${runtimeEndianness})`);
      break;

    case "float32":
      lines.push(`${indent}encoder.WriteFloat32(${fieldName}, runtime.${runtimeEndianness})`);
      break;

    case "float64":
      lines.push(`${indent}encoder.WriteFloat64(${fieldName}, runtime.${runtimeEndianness})`);
      break;

    case "bit":
    case "int": {
      // Bitfield - write individual bits
      const bitSize = (field as any).size || 1;
      lines.push(`${indent}encoder.WriteBits(uint64(${fieldName}), ${bitSize})`);
      break;
    }

    case "bitfield": {
      // Bitfield container - encode nested fields
      // TODO: Implement proper bitfield encoding
      lines.push(`${indent}// TODO: Bitfield encoding for ${fieldName}`);
      break;
    }

    case "string":
      lines.push(...generateEncodeString(field as any, fieldName, endianness, indent));
      break;

    case "array":
      lines.push(...generateEncodeArray(field as any, fieldName, endianness, runtimeEndianness, indent));
      break;

    default:
      // Type reference - nested struct
      lines.push(...generateEncodeNestedStruct(field, fieldName, indent));
      break;
  }

  return lines;
}

/**
 * Generates encoding code for optional field
 */
function generateEncodeOptional(field: any, fieldName: string, endianness: string, runtimeEndianness: string, indent: string): string[] {
  const lines: string[] = [];
  const presenceType = field.presence_type || "uint8";

  lines.push(`${indent}if ${fieldName} != nil {`);

  // Write presence indicator (1 = present)
  if (presenceType === "uint8") {
    lines.push(`${indent}\tencoder.WriteUint8(1)`);
  } else {
    lines.push(`${indent}\tencoder.WriteBit(1)`);
  }

  // Write value (dereference pointer)
  const valueField: Field = {
    name: "",
    type: field.value_type
  };
  const innerLines = generateEncodeFieldImpl(valueField, `*${fieldName}`, endianness, runtimeEndianness, indent + "\t");
  lines.push(...innerLines);

  lines.push(`${indent}} else {`);

  // Write presence indicator (0 = absent)
  if (presenceType === "uint8") {
    lines.push(`${indent}\tencoder.WriteUint8(0)`);
  } else {
    lines.push(`${indent}\tencoder.WriteBit(0)`);
  }

  lines.push(`${indent}}`);

  return lines;
}

/**
 * Generates encoding code for string field
 */
function generateEncodeString(field: any, fieldName: string, endianness: string, indent: string): string[] {
  const lines: string[] = [];
  const kind = field.kind;
  const encoding = field.encoding || "utf8";
  const bytesVar = `${fieldName.replace(/\./g, "_")}_bytes`;

  // Convert string to bytes
  lines.push(`${indent}${bytesVar} := []byte(${fieldName})`);

  switch (kind) {
    case "length_prefixed": {
      const lengthType = field.length_type || "uint8";
      // Write length prefix
      switch (lengthType) {
        case "uint8":
          lines.push(`${indent}encoder.WriteUint8(uint8(len(${bytesVar})))`);
          break;
        case "uint16":
          lines.push(`${indent}encoder.WriteUint16(uint16(len(${bytesVar})), runtime.${mapEndianness(endianness)})`);
          break;
        case "uint32":
          lines.push(`${indent}encoder.WriteUint32(uint32(len(${bytesVar})), runtime.${mapEndianness(endianness)})`);
          break;
        case "uint64":
          lines.push(`${indent}encoder.WriteUint64(uint64(len(${bytesVar})), runtime.${mapEndianness(endianness)})`);
          break;
      }
      // Write bytes
      lines.push(`${indent}for _, b := range ${bytesVar} {`);
      lines.push(`${indent}\tencoder.WriteUint8(b)`);
      lines.push(`${indent}}`);
      break;
    }

    case "null_terminated":
      // Write bytes then null terminator
      lines.push(`${indent}for _, b := range ${bytesVar} {`);
      lines.push(`${indent}\tencoder.WriteUint8(b)`);
      lines.push(`${indent}}`);
      lines.push(`${indent}encoder.WriteUint8(0)`);
      break;

    case "fixed": {
      const length = field.length || 0;
      // Write bytes (padded or truncated to fixed length)
      lines.push(`${indent}for i := 0; i < ${length}; i++ {`);
      lines.push(`${indent}\tif i < len(${bytesVar}) {`);
      lines.push(`${indent}\t\tencoder.WriteUint8(${bytesVar}[i])`);
      lines.push(`${indent}\t} else {`);
      lines.push(`${indent}\t\tencoder.WriteUint8(0)`);
      lines.push(`${indent}\t}`);
      lines.push(`${indent}}`);
      break;
    }

    default:
      throw new Error(`Unknown string kind: ${kind}`);
  }

  return lines;
}

/**
 * Generates encoding code for array field
 */
function generateEncodeArray(field: any, fieldName: string, endianness: string, runtimeEndianness: string, indent: string): string[] {
  const lines: string[] = [];
  const kind = field.kind;
  const items = field.items;

  // Write length prefix for length_prefixed arrays
  if (kind === "length_prefixed" || kind === "length_prefixed_items") {
    const lengthType = field.length_type || "uint8";
    switch (lengthType) {
      case "uint8":
        lines.push(`${indent}encoder.WriteUint8(uint8(len(${fieldName})))`);
        break;
      case "uint16":
        lines.push(`${indent}encoder.WriteUint16(uint16(len(${fieldName})), runtime.${runtimeEndianness})`);
        break;
      case "uint32":
        lines.push(`${indent}encoder.WriteUint32(uint32(len(${fieldName})), runtime.${runtimeEndianness})`);
        break;
      case "uint64":
        lines.push(`${indent}encoder.WriteUint64(uint64(len(${fieldName})), runtime.${runtimeEndianness})`);
        break;
    }
  }

  // Skip encoding for field_referenced arrays (length already encoded in the referenced field)
  if (kind === "field_referenced") {
    // Don't write length - it's already written in another field
  }

  // Generate loop variable name
  const itemVar = `${fieldName.replace(/\./g, "_").replace(/^m_/, "")}_item`;

  // Handle greedy arrays (no length prefix, no terminator - just encode all items)
  if (kind === "greedy") {
    // Just encode items - no prefix, no terminator
  }

  // For length_prefixed_items, encode each item separately
  if (kind === "length_prefixed_items") {
    const itemLengthType = field.item_length_type || "uint32";

    lines.push(`${indent}for _, ${itemVar} := range ${fieldName} {`);

    // Encode item to get bytes
    const itemBytesVar = `${itemVar}_bytes`;
    lines.push(`${indent}\t${itemBytesVar}, err := ${itemVar}.Encode()`);
    lines.push(`${indent}\tif err != nil {`);
    lines.push(`${indent}\t\treturn nil, err`);
    lines.push(`${indent}\t}`);

    // Write item length
    switch (itemLengthType) {
      case "uint8":
        lines.push(`${indent}\tencoder.WriteUint8(uint8(len(${itemBytesVar})))`);
        break;
      case "uint16":
        lines.push(`${indent}\tencoder.WriteUint16(uint16(len(${itemBytesVar})), runtime.${runtimeEndianness})`);
        break;
      case "uint32":
        lines.push(`${indent}\tencoder.WriteUint32(uint32(len(${itemBytesVar})), runtime.${runtimeEndianness})`);
        break;
      case "uint64":
        lines.push(`${indent}\tencoder.WriteUint64(uint64(len(${itemBytesVar})), runtime.${runtimeEndianness})`);
        break;
    }

    // Write item bytes
    lines.push(`${indent}\tfor _, b := range ${itemBytesVar} {`);
    lines.push(`${indent}\t\tencoder.WriteUint8(b)`);
    lines.push(`${indent}\t}`);

    lines.push(`${indent}}`);
  } else {
    // Regular array encoding (fixed, length_prefixed, null_terminated)
    lines.push(`${indent}for _, ${itemVar} := range ${fieldName} {`);

    const itemField: Field = {
      name: "",
      type: items.type,
      ...(items as any)
    };
    const innerLines = generateEncodeFieldImpl(itemField, itemVar, endianness, runtimeEndianness, indent + "\t");
    lines.push(...innerLines);

    lines.push(`${indent}}`);

    // Write null terminator for null_terminated arrays
    if (kind === "null_terminated") {
      lines.push(`${indent}encoder.WriteUint8(0)`);
    }
  }

  return lines;
}

/**
 * Generates encoding code for nested struct
 */
function generateEncodeNestedStruct(field: Field, fieldName: string, indent: string): string[] {
  const lines: string[] = [];
  const bytesVar = `${fieldName.replace(/\./g, "_")}_bytes`;

  lines.push(`${indent}${bytesVar}, err := ${fieldName}.Encode()`);
  lines.push(`${indent}if err != nil {`);
  lines.push(`${indent}\treturn nil, err`);
  lines.push(`${indent}}`);
  lines.push(`${indent}for _, b := range ${bytesVar} {`);
  lines.push(`${indent}\tencoder.WriteUint8(b)`);
  lines.push(`${indent}}`);

  return lines;
}

/**
 * Converts conditional expression to Go syntax
 */
function convertConditionalToGo(condition: string): string {
  // Simple conversion: "field == 1" -> "m.Field == 1"
  // Handle dot notation: "flags.enabled == 1" -> "m.Flags.Enabled == 1"

  // Parse the condition (simple cases for now)
  const match = condition.match(/^(\w+(?:\.\w+)*)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
  if (!match) {
    throw new Error(`Could not parse conditional: ${condition}`);
  }

  const [, fieldPath, operator, value] = match;
  const fieldParts = fieldPath.split(".");
  const goFieldPath = "m." + fieldParts.map(toGoFieldName).join(".");

  return `${goFieldPath} ${operator} ${value}`;
}

/**
 * Generates decoding code for a single field
 */
function generateDecodeField(field: Field, defaultEndianness: string, indent: string): string[] {
  const lines: string[] = [];
  const fieldName = toGoFieldName(field.name);
  const varName = toGoVarName(field.name);
  const endianness = (field as any).endianness || defaultEndianness;
  const runtimeEndianness = mapEndianness(endianness);

  // Handle conditional fields
  if ((field as any).conditional) {
    const condition = convertConditionalToGo((field as any).conditional);
    lines.push(`${indent}if ${condition} {`);
    const innerLines = generateDecodeFieldImpl(field, fieldName, varName, endianness, runtimeEndianness, indent + "\t");
    lines.push(...innerLines);
    lines.push(`${indent}}`);
    lines.push(``);
    return lines;
  }

  // Handle optional fields
  if (field.type === "optional") {
    return generateDecodeOptional(field as any, fieldName, varName, endianness, runtimeEndianness, indent);
  }

  return generateDecodeFieldImpl(field, fieldName, varName, endianness, runtimeEndianness, indent);
}

/**
 * Generates decoding implementation for a field (without conditional/optional wrapper)
 */
function generateDecodeFieldImpl(field: Field, fieldName: string, varName: string, endianness: string, runtimeEndianness: string, indent: string): string[] {
  const lines: string[] = [];

  switch (field.type) {
    case "uint8":
      lines.push(`${indent}${varName}, err := decoder.ReadUint8()`);
      break;

    case "uint16":
      lines.push(`${indent}${varName}, err := decoder.ReadUint16(runtime.${runtimeEndianness})`);
      break;

    case "uint32":
      lines.push(`${indent}${varName}, err := decoder.ReadUint32(runtime.${runtimeEndianness})`);
      break;

    case "uint64":
      lines.push(`${indent}${varName}, err := decoder.ReadUint64(runtime.${runtimeEndianness})`);
      break;

    case "int8":
      lines.push(`${indent}${varName}, err := decoder.ReadInt8()`);
      break;

    case "int16":
      lines.push(`${indent}${varName}, err := decoder.ReadInt16(runtime.${runtimeEndianness})`);
      break;

    case "int32":
      lines.push(`${indent}${varName}, err := decoder.ReadInt32(runtime.${runtimeEndianness})`);
      break;

    case "int64":
      lines.push(`${indent}${varName}, err := decoder.ReadInt64(runtime.${runtimeEndianness})`);
      break;

    case "float32":
      lines.push(`${indent}${varName}, err := decoder.ReadFloat32(runtime.${runtimeEndianness})`);
      break;

    case "float64":
      lines.push(`${indent}${varName}, err := decoder.ReadFloat64(runtime.${runtimeEndianness})`);
      break;

    case "bit": {
      // Bitfield - read individual bits
      const bitSize = (field as any).size || 1;
      const goType = mapFieldToGoType(field);
      lines.push(`${indent}${varName}Bits, err := decoder.ReadBits(${bitSize})`);
      lines.push(`${indent}if err != nil {`);
      lines.push(`${indent}\treturn nil, fmt.Errorf("failed to decode ${field.name || 'bit value'}: %w", err)`);
      lines.push(`${indent}}`);
      lines.push(`${indent}${varName} := ${goType}(${varName}Bits)`);
      if (fieldName) {
        lines.push(`${indent}result.${fieldName} = ${varName}`);
        lines.push(``);
      }
      return lines;
    }

    case "int": {
      // Signed int bitfield
      const bitSize = (field as any).size || 8;
      const goType = mapFieldToGoType(field);
      lines.push(`${indent}${varName}Bits, err := decoder.ReadBits(${bitSize})`);
      lines.push(`${indent}if err != nil {`);
      lines.push(`${indent}\treturn nil, fmt.Errorf("failed to decode ${field.name || 'int value'}: %w", err)`);
      lines.push(`${indent}}`);
      lines.push(`${indent}${varName} := ${goType}(${varName}Bits)`);
      if (fieldName) {
        lines.push(`${indent}result.${fieldName} = ${varName}`);
        lines.push(``);
      }
      return lines;
    }

    case "bitfield":
      // Bitfield container - decode nested fields
      // TODO: Implement proper bitfield decoding
      lines.push(`${indent}// TODO: Bitfield decoding for ${fieldName}`);
      return lines;

    case "string":
      lines.push(...generateDecodeString(field as any, fieldName, varName, endianness, indent));
      return lines; // Early return - string handling includes assignment

    case "array":
      lines.push(...generateDecodeArray(field as any, fieldName, varName, endianness, runtimeEndianness, indent));
      return lines; // Early return - array handling includes assignment

    default:
      // Type reference - nested struct
      lines.push(...generateDecodeNestedStruct(field, fieldName, varName, indent));
      return lines; // Early return - nested struct handling includes assignment
  }

  // Error handling (for primitives)
  lines.push(`${indent}if err != nil {`);
  lines.push(`${indent}\treturn nil, fmt.Errorf("failed to decode ${field.name || 'value'}: %w", err)`);
  lines.push(`${indent}}`);

  // Assign to result (for primitives)
  if (fieldName) {
    lines.push(`${indent}result.${fieldName} = ${varName}`);
    lines.push(``);
  }

  return lines;
}

/**
 * Generates decoding code for optional field
 */
function generateDecodeOptional(field: any, fieldName: string, varName: string, endianness: string, runtimeEndianness: string, indent: string): string[] {
  const lines: string[] = [];
  const presenceType = field.presence_type || "uint8";
  const presenceVar = `${varName}Present`;

  // Read presence indicator
  if (presenceType === "uint8") {
    lines.push(`${indent}${presenceVar}, err := decoder.ReadUint8()`);
  } else {
    lines.push(`${indent}${presenceVar}, err := decoder.ReadBit()`);
  }

  lines.push(`${indent}if err != nil {`);
  lines.push(`${indent}\treturn nil, fmt.Errorf("failed to decode ${field.name} presence: %w", err)`);
  lines.push(`${indent}}`);

  lines.push(`${indent}if ${presenceVar} == 1 {`);

  // Read value
  const valueField: Field = {
    name: "",
    type: field.value_type
  };
  const valueVar = `${varName}Value`;
  const innerLines = generateDecodeFieldImpl(valueField, "", valueVar, endianness, runtimeEndianness, indent + "\t");
  lines.push(...innerLines);

  // Assign pointer to value
  lines.push(`${indent}\tresult.${fieldName} = &${valueVar}`);

  lines.push(`${indent}}`);
  lines.push(``);

  return lines;
}

/**
 * Generates decoding code for string field
 */
function generateDecodeString(field: any, fieldName: string, varName: string, endianness: string, indent: string): string[] {
  const lines: string[] = [];
  const kind = field.kind;
  const encoding = field.encoding || "utf8";
  const bytesVar = `${varName}Bytes`;

  switch (kind) {
    case "length_prefixed": {
      const lengthType = field.length_type || "uint8";
      // Read length prefix
      switch (lengthType) {
        case "uint8":
          lines.push(`${indent}length, err := decoder.ReadUint8()`);
          break;
        case "uint16":
          lines.push(`${indent}length, err := decoder.ReadUint16(runtime.${mapEndianness(endianness)})`);
          break;
        case "uint32":
          lines.push(`${indent}length, err := decoder.ReadUint32(runtime.${mapEndianness(endianness)})`);
          break;
        case "uint64":
          lines.push(`${indent}length, err := decoder.ReadUint64(runtime.${mapEndianness(endianness)})`);
          break;
      }
      lines.push(`${indent}if err != nil {`);
      lines.push(`${indent}\treturn nil, fmt.Errorf("failed to decode ${field.name} length: %w", err)`);
      lines.push(`${indent}}`);

      // Read bytes
      lines.push(`${indent}${bytesVar} := make([]byte, length)`);
      lines.push(`${indent}for i := range ${bytesVar} {`);
      lines.push(`${indent}\tb, err := decoder.ReadUint8()`);
      lines.push(`${indent}\tif err != nil {`);
      lines.push(`${indent}\t\treturn nil, fmt.Errorf("failed to decode ${field.name}: %w", err)`);
      lines.push(`${indent}\t}`);
      lines.push(`${indent}\t${bytesVar}[i] = b`);
      lines.push(`${indent}}`);
      break;
    }

    case "null_terminated":
      // Read until null terminator
      lines.push(`${indent}${bytesVar} := []byte{}`);
      lines.push(`${indent}for {`);
      lines.push(`${indent}\tb, err := decoder.ReadUint8()`);
      lines.push(`${indent}\tif err != nil {`);
      lines.push(`${indent}\t\treturn nil, fmt.Errorf("failed to decode ${field.name}: %w", err)`);
      lines.push(`${indent}\t}`);
      lines.push(`${indent}\tif b == 0 {`);
      lines.push(`${indent}\t\tbreak`);
      lines.push(`${indent}\t}`);
      lines.push(`${indent}\t${bytesVar} = append(${bytesVar}, b)`);
      lines.push(`${indent}}`);
      break;

    case "fixed": {
      const length = field.length || 0;
      // Read fixed number of bytes, trimming nulls
      lines.push(`${indent}${bytesVar} := make([]byte, 0)`);
      lines.push(`${indent}for i := 0; i < ${length}; i++ {`);
      lines.push(`${indent}\tb, err := decoder.ReadUint8()`);
      lines.push(`${indent}\tif err != nil {`);
      lines.push(`${indent}\t\treturn nil, fmt.Errorf("failed to decode ${field.name}: %w", err)`);
      lines.push(`${indent}\t}`);
      lines.push(`${indent}\tif b != 0 {`);
      lines.push(`${indent}\t\t${bytesVar} = append(${bytesVar}, b)`);
      lines.push(`${indent}\t}`);
      lines.push(`${indent}}`);
      break;
    }

    default:
      throw new Error(`Unknown string kind: ${kind}`);
  }

  // Convert bytes to string
  lines.push(`${indent}result.${fieldName} = string(${bytesVar})`);
  lines.push(``);

  return lines;
}

/**
 * Generates decoding code for array field
 */
function generateDecodeArray(field: any, fieldName: string, varName: string, endianness: string, runtimeEndianness: string, indent: string): string[] {
  const lines: string[] = [];
  const kind = field.kind;
  const items = field.items;

  if (!items) {
    throw new Error(`Array field ${field.name} missing items definition`);
  }

  const itemType = mapFieldToGoType(items);

  // Read length prefix for length_prefixed arrays
  if (kind === "length_prefixed" || kind === "length_prefixed_items") {
    const lengthType = field.length_type || "uint8";
    switch (lengthType) {
      case "uint8":
        lines.push(`${indent}length, err := decoder.ReadUint8()`);
        break;
      case "uint16":
        lines.push(`${indent}length, err := decoder.ReadUint16(runtime.${runtimeEndianness})`);
        break;
      case "uint32":
        lines.push(`${indent}length, err := decoder.ReadUint32(runtime.${runtimeEndianness})`);
        break;
      case "uint64":
        lines.push(`${indent}length, err := decoder.ReadUint64(runtime.${runtimeEndianness})`);
        break;
    }
    lines.push(`${indent}if err != nil {`);
    lines.push(`${indent}\treturn nil, fmt.Errorf("failed to decode ${field.name} length: %w", err)`);
    lines.push(`${indent}}`);
    lines.push(`${indent}result.${fieldName} = make([]${itemType}, length)`);

    // For length_prefixed_items, handle per-item lengths
    if (kind === "length_prefixed_items") {
      return [...lines, ...generateDecodeLengthPrefixedItems(field, fieldName, endianness, runtimeEndianness, indent)];
    }

    lines.push(`${indent}for i := range result.${fieldName} {`);
  } else if (kind === "field_referenced") {
    // Length is stored in another field
    const lengthField = (field as any).length_field;
    const lengthFieldGo = toGoFieldName(lengthField);
    lines.push(`${indent}result.${fieldName} = make([]${itemType}, result.${lengthFieldGo})`);
    lines.push(`${indent}for i := range result.${fieldName} {`);
  } else if (kind === "fixed") {
    const length = field.length || 0;
    lines.push(`${indent}result.${fieldName} = make([]${itemType}, ${length})`);
    lines.push(`${indent}for i := 0; i < ${length}; i++ {`);
  } else if (kind === "null_terminated") {
    lines.push(`${indent}result.${fieldName} = []${itemType}{}`);
    lines.push(`${indent}for {`);
    // TODO: Need to check for terminator BEFORE decoding item
    // This is complex and depends on item type
  } else if (kind === "greedy") {
    // Greedy: read until end of buffer
    // For now, just allocate empty array - TODO: implement greedy properly
    lines.push(`${indent}result.${fieldName} = []${itemType}{}`);
    lines.push(`${indent}// TODO: Implement greedy array reading`);
    lines.push(``);
    return lines;
  } else {
    throw new Error(`Unknown array kind: ${kind}`);
  }

  // Decode item
  const itemVar = `${varName}Item`;
  const itemField: Field = {
    name: "",
    type: items.type,
    ...(items as any)
  };
  const innerLines = generateDecodeFieldImpl(itemField, "", itemVar, endianness, runtimeEndianness, indent + "\t");
  lines.push(...innerLines);

  // Assign to array
  if (kind === "fixed" || kind === "length_prefixed") {
    lines.push(`${indent}\tresult.${fieldName}[i] = ${itemVar}`);
    lines.push(`${indent}}`);
  } else if (kind === "null_terminated") {
    lines.push(`${indent}\tresult.${fieldName} = append(result.${fieldName}, ${itemVar})`);
    lines.push(`${indent}}`);
  }

  lines.push(``);

  return lines;
}

/**
 * Generates decoding code for length-prefixed items array
 */
function generateDecodeLengthPrefixedItems(field: any, fieldName: string, endianness: string, runtimeEndianness: string, indent: string): string[] {
  const lines: string[] = [];
  const itemLengthType = field.item_length_type || "uint32";

  lines.push(`${indent}for i := range result.${fieldName} {`);

  // Read item length
  switch (itemLengthType) {
    case "uint8":
      lines.push(`${indent}\titemLength, err := decoder.ReadUint8()`);
      break;
    case "uint16":
      lines.push(`${indent}\titemLength, err := decoder.ReadUint16(runtime.${runtimeEndianness})`);
      break;
    case "uint32":
      lines.push(`${indent}\titemLength, err := decoder.ReadUint32(runtime.${runtimeEndianness})`);
      break;
    case "uint64":
      lines.push(`${indent}\titemLength, err := decoder.ReadUint64(runtime.${runtimeEndianness})`);
      break;
  }
  lines.push(`${indent}\tif err != nil {`);
  lines.push(`${indent}\t\treturn nil, fmt.Errorf("failed to decode item length: %w", err)`);
  lines.push(`${indent}\t}`);

  // Read item bytes
  lines.push(`${indent}\titemBytes := make([]byte, itemLength)`);
  lines.push(`${indent}\tfor j := range itemBytes {`);
  lines.push(`${indent}\t\tb, err := decoder.ReadUint8()`);
  lines.push(`${indent}\t\tif err != nil {`);
  lines.push(`${indent}\t\t\treturn nil, fmt.Errorf("failed to decode item bytes: %w", err)`);
  lines.push(`${indent}\t\t}`);
  lines.push(`${indent}\t\titemBytes[j] = b`);
  lines.push(`${indent}\t}`);

  // Decode item from bytes
  const items = field.items;
  const typeName = toGoTypeName(items.type);
  lines.push(`${indent}\titem, err := Decode${typeName}(itemBytes)`);
  lines.push(`${indent}\tif err != nil {`);
  lines.push(`${indent}\t\treturn nil, fmt.Errorf("failed to decode item: %w", err)`);
  lines.push(`${indent}\t}`);
  lines.push(`${indent}\tresult.${fieldName}[i] = *item`);

  lines.push(`${indent}}`);
  lines.push(``);

  return lines;
}

/**
 * Generates decoding code for nested struct
 */
function generateDecodeNestedStruct(field: Field, fieldName: string, varName: string, indent: string): string[] {
  const lines: string[] = [];
  const typeName = toGoTypeName(field.type);

  lines.push(`${indent}${varName}, err := decode${typeName}WithDecoder(decoder)`);
  lines.push(`${indent}if err != nil {`);
  lines.push(`${indent}\treturn nil, fmt.Errorf("failed to decode ${field.name || 'nested struct'}: %w", err)`);
  lines.push(`${indent}}`);
  lines.push(`${indent}result.${fieldName} = *${varName}`);
  lines.push(``);

  return lines;
}

/**
 * Maps a field to its Go type
 */
function mapFieldToGoType(field: Field): string {
  switch (field.type) {
    case "uint8":
      return "uint8";
    case "uint16":
      return "uint16";
    case "uint32":
      return "uint32";
    case "uint64":
      return "uint64";
    case "int8":
      return "int8";
    case "int16":
      return "int16";
    case "int32":
      return "int32";
    case "int64":
      return "int64";
    case "float32":
      return "float32";
    case "float64":
      return "float64";
    case "string":
      return "string";
    case "bit":
      // Bitfield - determine size
      const size = (field as any).size || 1;
      if (size <= 8) return "uint8";
      if (size <= 16) return "uint16";
      if (size <= 32) return "uint32";
      return "uint64";
    case "int":
      // Signed int bitfield
      const intSize = (field as any).size || 8;
      if (intSize <= 8) return "int8";
      if (intSize <= 16) return "int16";
      if (intSize <= 32) return "int32";
      return "int64";
    case "bitfield":
      // Bitfield container - treat as struct with nested fields
      return "uint64"; // For now, use largest type
    case "array":
      // Array type - get items type
      const itemsType = mapFieldToGoType((field as any).items);
      return `[]${itemsType}`;
    case "optional":
      // Optional type - pointer
      const valueType = (field as any).value_type;
      return `*${valueType}`;
    default:
      // Assume it's a type reference (nested struct)
      return toGoTypeName(field.type);
  }
}

/**
 * Converts a field name to Go exported field name (PascalCase)
 */
function toGoFieldName(name: string): string {
  // Convert snake_case or camelCase to PascalCase
  // Handle numbers properly: pattern_5555 → Pattern5555
  return name
    .split(/[_-]/)
    .map(part => {
      if (!part) return "";
      // If part is all digits, keep as-is
      if (/^\d+$/.test(part)) return part;
      // Otherwise capitalize first letter
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("");
}

/**
 * Converts a field name to Go local variable name (camelCase)
 */
function toGoVarName(name: string): string {
  const parts = name.split(/[_-]/);
  if (parts.length === 0) return name;

  // First part lowercase, rest capitalized
  return parts[0].toLowerCase() + parts.slice(1)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/**
 * Converts a type name to Go type name (ensures PascalCase)
 */
function toGoTypeName(name: string): string {
  if (!name) return name;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Maps endianness string to Go runtime constant
 */
function mapEndianness(endianness: string): string {
  if (endianness === "little_endian") {
    return "LittleEndian";
  }
  return "BigEndian";
}
