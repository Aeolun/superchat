/**
 * String encoding and decoding support.
 * Handles various string kinds: fixed, length_prefixed, null_terminated, field_referenced.
 */

import { Endianness } from "../../schema/binary-schema.js";

/**
 * Generate encoding code for string field (class-based style).
 * Supports fixed, length_prefixed, null_terminated, and field_referenced strings.
 */
export function generateEncodeString(
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
 * Generate decoding code for string field (class-based style).
 * Supports fixed, length_prefixed, null_terminated, and field_referenced strings.
 */
export function generateDecodeString(
  field: any,
  globalEndianness: Endianness,
  fieldName: string,
  indent: string,
  addTraceLogs: boolean,
  getTargetPath: (fieldName: string) => string
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
 * Generate encoding code for string (functional style).
 * Used by the experimental functional generator.
 */
export function generateFunctionalEncodeString(
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
 * Generate decoding code for string (functional style).
 * Used by the experimental functional generator.
 */
export function generateFunctionalDecodeString(
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
