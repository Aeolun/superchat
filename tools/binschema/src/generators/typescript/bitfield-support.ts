/**
 * Bitfield encoding and decoding support.
 * Handles bitfields - structures with multiple bit-sized fields packed together.
 */

/**
 * Generate encoding code for a bitfield (class-based style).
 * Writes each sub-field using writeBits().
 */
export function generateEncodeBitfield(field: any, valuePath: string, indent: string): string {
  let code = "";

  for (const subField of field.fields) {
    code += `${indent}this.writeBits(${valuePath}.${subField.name}, ${subField.size});\n`;
  }

  return code;
}

/**
 * Generate decoding code for a bitfield (class-based style).
 * Reads each sub-field using readBits(), converting to Number for fields <= 53 bits.
 *
 * @param getTargetPath - Function to determine the target variable path (array item vs regular field)
 */
export function generateDecodeBitfield(
  field: any,
  fieldName: string,
  indent: string,
  getTargetPath: (fieldName: string) => string
): string {
  const target = getTargetPath(fieldName);
  let code = `${indent}${target} = {};\n`;

  for (const subField of field.fields) {
    // Keep as bigint for > 53 bits to preserve precision (MAX_SAFE_INTEGER = 2^53 - 1)
    if (subField.size > 53) {
      code += `${indent}${target}.${subField.name} = this.readBits(${subField.size});\n`;
    } else {
      code += `${indent}${target}.${subField.name} = Number(this.readBits(${subField.size}));\n`;
    }
  }

  return code;
}

/**
 * Generate encoding code for a bitfield (functional style).
 * Used by the experimental functional generator.
 */
export function generateFunctionalEncodeBitfield(field: any, valuePath: string, indent: string): string {
  let code = "";
  for (const subField of field.fields) {
    code += `${indent}stream.writeBits(${valuePath}.${subField.name}, ${subField.size});\n`;
  }
  return code;
}

/**
 * Generate decoding code for a bitfield (functional style).
 * Used by the experimental functional generator.
 */
export function generateFunctionalDecodeBitfield(field: any, fieldName: string, indent: string): string {
  let code = `${indent}const ${fieldName} = {\n`;
  for (const subField of field.fields) {
    code += `${indent}  ${subField.name}: Number(stream.readBits(${subField.size})),\n`;
  }
  code += `${indent}};\n`;
  return code;
}
