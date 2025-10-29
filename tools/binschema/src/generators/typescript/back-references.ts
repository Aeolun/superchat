/**
 * Back-reference encoding and decoding support.
 * Handles compression pointers and back-reference following.
 */

import { BinarySchema, Endianness } from "../../schema/binary-schema.js";
import { generateJSDoc } from "./documentation.js";

/**
 * Capitalize first letter of a string
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Resolve back reference type to its target type
 */
export function resolveBackReferenceType(typeName: string, schema: BinarySchema): string {
  const typeDef = schema.types[typeName];
  if (typeDef && (typeDef as any).type === "back_reference") {
    return (typeDef as any).target_type;
  }
  return typeName;
}

/**
 * Generate encoding code for back reference (class-based style).
 * Handles compression dictionary and back-reference encoding.
 */
export function generateEncodeBackReference(
  field: any,
  schema: BinarySchema,
  globalEndianness: Endianness,
  valuePath: string,
  indent: string,
  generateEncodeTypeReference: (typeRef: string, schema: BinarySchema, endianness: Endianness, valuePath: string, indent: string) => string
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
 * Generate decoding code for back reference (class-based style).
 * Handles back-reference following with circular reference detection.
 */
export function generateDecodeBackReference(
  field: any,
  schema: BinarySchema,
  globalEndianness: Endianness,
  fieldName: string,
  indent: string,
  getTargetPath: (fieldName: string) => string,
  generateDecodeTypeReference: (typeRef: string, schema: BinarySchema, endianness: Endianness, fieldName: string, indent: string) => string
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
 * Generate inlined back reference decoder (functional style).
 * Used by the experimental functional generator.
 */
export function generateInlinedBackReferenceDecoder(
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
 * Generate functional-style back reference (functional style).
 * Used by the experimental functional generator.
 */
export function generateFunctionalBackReference(
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
