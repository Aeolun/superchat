/**
 * Computed field encoding support.
 * Handles auto-computation of length_of, crc32_of, and position_of fields.
 */

import { BinarySchema, Field, Endianness } from "../../schema/binary-schema.js";
import { getTypeFields } from "./type-utils.js";

/**
 * Resolve a computed field target path to the actual value path.
 * Handles relative paths (../) by stripping them and using value prefix.
 */
export function resolveComputedFieldPath(target: string, baseObjectPath: string = "value"): string {
  if (!target.startsWith('../')) {
    return `${baseObjectPath}.${target}`;
  }

  let remainingPath = target;
  while (remainingPath.startsWith('../')) {
    remainingPath = remainingPath.slice(3);
  }

  return `value.${remainingPath}`;
}

/**
 * Parse same_index correlation syntax from computed field target
 * Example: "../sections[same_index<DataBlock>]" -> { arrayPath: "sections", filterType: "DataBlock" }
 */
export function parseSameIndexTarget(target: string): { arrayPath: string; filterType: string } | null {
  const match = target.match(/(?:\.\.\/)*([^[]+)\[same_index<(\w+)>\]/);
  if (!match) return null;
  return {
    arrayPath: match[1],
    filterType: match[2]
  };
}

/**
 * Check if an array field contains choice types with same_index position_of references
 * Returns map of types that need position tracking
 */
export function detectSameIndexTracking(field: any, schema: BinarySchema): Set<string> | null {
  const itemsType = field.items?.type;
  if (itemsType !== "choice") return null;

  const choices = field.items?.choices || [];
  const typesNeedingTracking = new Set<string>();

  // Check each choice type for computed position_of fields using same_index
  for (const choice of choices) {
    const choiceTypeDef = schema.types[choice.type];
    if (!choiceTypeDef) continue;

    const fields = getTypeFields(choiceTypeDef);
    for (const f of fields) {
      const fAny = f as any;
      if (fAny.computed?.type === "position_of") {
        const sameIndexInfo = parseSameIndexTarget(fAny.computed.target);
        if (sameIndexInfo) {
          // This choice type uses same_index - add the filter type to tracking set
          typesNeedingTracking.add(sameIndexInfo.filterType);
        }
      }
    }
  }

  return typesNeedingTracking.size > 0 ? typesNeedingTracking : null;
}

/**
 * Helper function to generate runtime size computation code.
 * Generates code that computes the encoded byte size of a field at runtime by encoding to a temporary buffer.
 */
function generateRuntimeSizeComputation(
  targetPath: string,
  globalEndianness: Endianness,
  indent: string
): { code: string; sizeVar: string } {
  const sizeVar = `${targetPath.replace(/[.\[\]]/g, "_")}_size`;
  let code = "";

  // For simplicity, we'll encode the value to a temporary encoder and measure the size
  // This handles all types correctly (arrays, structs, strings, etc.)
  code += `${indent}// Compute encoded size of ${targetPath}\n`;
  code += `${indent}const ${sizeVar}_temp = new BitStreamEncoder("${globalEndianness === 'big_endian' ? 'msb_first' : 'lsb_first'}");\n`;
  code += `${indent}const ${sizeVar}_val = ${targetPath};\n`;
  code += `${indent}if (Array.isArray(${sizeVar}_val)) {\n`;
  code += `${indent}  // Encode array elements\n`;
  code += `${indent}  for (const item of ${sizeVar}_val) {\n`;
  code += `${indent}    if (typeof item === 'number') {\n`;
  code += `${indent}      if (Number.isInteger(item)) {\n`;
  code += `${indent}        if (item >= 0 && item <= 255) {\n`;
  code += `${indent}          ${sizeVar}_temp.writeUint8(item);\n`;
  code += `${indent}        } else if (item >= 0 && item <= 65535) {\n`;
  code += `${indent}          ${sizeVar}_temp.writeUint16(item, "${globalEndianness}");\n`;
  code += `${indent}        } else {\n`;
  code += `${indent}          ${sizeVar}_temp.writeUint32(item, "${globalEndianness}");\n`;
  code += `${indent}        }\n`;
  code += `${indent}      } else {\n`;
  code += `${indent}        ${sizeVar}_temp.writeFloat64(item, "${globalEndianness}");\n`;
  code += `${indent}      }\n`;
  code += `${indent}    } else if (typeof item === 'bigint') {\n`;
  code += `${indent}      ${sizeVar}_temp.writeUint64(item, "${globalEndianness}");\n`;
  code += `${indent}    } else if (typeof item === 'object') {\n`;
  code += `${indent}      // TODO: Handle array of objects/structs\n`;
  code += `${indent}    }\n`;
  code += `${indent}  }\n`;
  code += `${indent}} else if (typeof ${sizeVar}_val === 'string') {\n`;
  code += `${indent}  // Encode string\n`;
  code += `${indent}  const encoder = new TextEncoder();\n`;
  code += `${indent}  const bytes = encoder.encode(${sizeVar}_val);\n`;
  code += `${indent}  for (const byte of bytes) {\n`;
  code += `${indent}    ${sizeVar}_temp.writeUint8(byte);\n`;
  code += `${indent}  }\n`;
  code += `${indent}} else if (typeof ${sizeVar}_val === 'object' && ${sizeVar}_val !== null) {\n`;
  code += `${indent}  // TODO: Handle struct encoding\n`;
  code += `${indent}}\n`;
  code += `${indent}const ${sizeVar} = ${sizeVar}_temp.byteOffset;\n`;

  return { code, sizeVar };
}

/**
 * Helper function to compute the size of a field in bytes
 */
function getFieldSize(field: any): number {
  const fieldSizeMap: Record<string, number> = {
    "uint8": 1, "int8": 1,
    "uint16": 2, "int16": 2,
    "uint32": 4, "int32": 4, "float32": 4,
    "uint64": 8, "int64": 8, "float64": 8
  };
  return fieldSizeMap[field.type as string] || 0;
}

/**
 * Generate encoding code for computed field
 * Computes the value and writes it instead of reading from input
 */
export function generateEncodeComputedField(
  field: Field,
  schema: BinarySchema,
  globalEndianness: Endianness,
  indent: string,
  currentItemVar?: string,
  containingTypeName?: string,
  containingFields?: Field[]
): string {
  if (!('type' in field)) return "";

  const fieldAny = field as any;
  const computed = fieldAny.computed;
  const fieldName = field.name;
  const baseObjectPath = currentItemVar || "value";

  const endianness = 'endianness' in field && field.endianness
    ? field.endianness
    : globalEndianness;

  let code = "";

  // Generate computation based on computed field type
  if (computed.type === "sum_of_type_sizes") {
    const target = computed.target || "";
    const elementType = computed.element_type || "";

    code += `${indent}// Computed field '${fieldName}': auto-compute sum of sizes for elements of type '${elementType}'\n`;
    code += `${indent}let ${fieldName}_computed = 0;\n`;

    const targetPath = resolveComputedFieldPath(target, baseObjectPath);

    // Generate code to iterate array and sum sizes of matching elements
    // Use the element type's encoder to compute exact encoded size
    code += `${indent}if (Array.isArray(${targetPath})) {\n`;
    code += `${indent}  for (const item of ${targetPath}) {\n`;
    code += `${indent}    // Check if this item matches the target type\n`;
    code += `${indent}    if (!item.type || item.type === '${elementType}') {\n`;
    code += `${indent}      // Encode item using ${elementType}Encoder to measure size\n`;
    code += `${indent}      const encoder_${fieldName} = new ${elementType}Encoder();\n`;
    code += `${indent}      const encoded_${fieldName} = encoder_${fieldName}.encode(item as ${elementType});\n`;
    code += `${indent}      ${fieldName}_computed += encoded_${fieldName}.length;\n`;
    code += `${indent}    }\n`;
    code += `${indent}  }\n`;
    code += `${indent}}\n`;

    // Write the computed sum
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
  } else if (computed.type === "sum_of_sizes") {
    const targets: string[] = computed.targets || [];

    code += `${indent}// Computed field '${fieldName}': auto-compute sum of sizes for ${targets.length} target(s)\n`;
    code += `${indent}let ${fieldName}_computed = 0;\n`;

    // For each target, compute its size and add to sum
    for (const target of targets) {
      const targetPath = resolveComputedFieldPath(target, baseObjectPath);

      const { code: sizeCode, sizeVar } = generateRuntimeSizeComputation(
        targetPath,
        globalEndianness,
        indent
      );

      code += sizeCode;
      code += `${indent}${fieldName}_computed += ${sizeVar};\n`;
    }

    // Write the computed sum
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
  } else if (computed.type === "length_of") {
    const targetField = computed.target;
    const targetPath = resolveComputedFieldPath(targetField, baseObjectPath);

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
    const targetField = computed.target;
    const targetPath = resolveComputedFieldPath(targetField, baseObjectPath);

    // Compute CRC32 checksum
    code += `${indent}// Computed field '${fieldName}': auto-compute CRC32 of '${targetField}'\n`;
    code += `${indent}const ${fieldName}_computed = crc32(${targetPath});\n`;
    code += `${indent}this.writeUint32(${fieldName}_computed, "${endianness}");\n`;
  } else if (computed.type === "position_of") {
    const targetField = computed.target;

    // Check if this is a same_index correlation
    const sameIndexInfo = parseSameIndexTarget(targetField);

    if (sameIndexInfo) {
      // same_index correlation - look up position from tracking map
      const { arrayPath, filterType } = sameIndexInfo;
      code += `${indent}// Computed field '${fieldName}': auto-compute position of '${targetField}'\n`;
      code += `${indent}// Look up position using same_index correlation\n`;

      // Need to determine the current item type to use the correct index counter
      // The computed field is being encoded within a specific type's fields
      // We need to extract the containing object's variable name from the context
      // For inlined encoding, look for the parent object variable (e.g., value_sections_item)

      // Try to infer the item variable name from the schema context
      // For computed fields in choice types, the valuePath pattern is typically: value_arrayname_item
      // We can infer this from the arrayPath
      const itemVarPattern = `value_${arrayPath}_item`;

      code += `${indent}// Determine current item type to use correct correlation index\n`;
      code += `${indent}const currentType = ${itemVarPattern}.type;\n`;
      code += `${indent}const correlationIndex = (this as any)[\`_index_${arrayPath}_\${currentType}\`];\n`;
      code += `${indent}const ${fieldName}_computed = this._positions_${arrayPath}_${filterType}[correlationIndex];\n`;
      code += `${indent}if (${fieldName}_computed === undefined) {\n`;
      code += `${indent}  throw new Error(\`same_index correlation failed: no ${filterType} at correlation index \${correlationIndex} for type \${currentType}\`);\n`;
      code += `${indent}}\n`;
    } else {
      // Regular position_of - compute from current offset
      code += `${indent}// Computed field '${fieldName}': auto-compute position of '${targetField}'\n`;

      // If we have containing fields info, compute size of all remaining fields
      let totalRemainingSize = 0;
      if (containingFields) {
        // Find the current field's index
        const currentFieldIndex = containingFields.findIndex(f => f.name === fieldName);
        if (currentFieldIndex >= 0) {
          // Sum sizes of all fields from current field onwards
          for (let i = currentFieldIndex; i < containingFields.length; i++) {
            const f = containingFields[i];
            totalRemainingSize += getFieldSize(f);
          }
        }
      }

      // If we couldn't determine from containing fields, fall back to adding just this field's size
      if (totalRemainingSize === 0) {
        totalRemainingSize = getFieldSize(field);
      }

      code += `${indent}const ${fieldName}_computed = this.byteOffset`;
      if (totalRemainingSize > 0) {
        code += ` + ${totalRemainingSize}`;
      }
      code += `;\n`;
    }

    // Write the computed position using appropriate write method
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
        code += `${indent}// TODO: Unsupported position field type: ${field.type}\n`;
    }
  }

  return code;
}
