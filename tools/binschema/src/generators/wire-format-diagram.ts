// ABOUTME: Shared wire format diagram generation for HTML documentation
// ABOUTME: Creates visual block diagrams showing binary layout of types

import { ExtractedMetadata } from "../schema/extract-metadata.js";

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Get human-readable size description for item type
 */
function getItemTypeSize(itemType: string): string {
  switch (itemType) {
    case "uint8":
    case "int8":
      return "1 byte";
    case "uint16":
    case "int16":
      return "2 bytes";
    case "uint32":
    case "int32":
    case "float32":
      return "4 bytes";
    case "uint64":
    case "int64":
    case "float64":
      return "8 bytes";
    default:
      return "variable";
  }
}

/**
 * Generate wire format diagram for complex types
 *
 * Returns HTML string with wire-format diagram, or null for primitive types
 * that should fall back to text description.
 */
export function generateWireFormatDiagram(
  typeName: string,
  meta: ExtractedMetadata
): string | null {
  // Only generate diagrams for complex types with wire format info
  if (!meta.wire_format) {
    return null;
  }

  // Determine type from wire_format string or fields
  const isStringType = typeName === "string";
  const isArrayType = typeName === "array";
  const isOptionalType = typeName === "optional";

  // For now, only handle string and array types (most common complex types)
  // Other complex types (optional, discriminated_union, bitfield, pointer) can be added later
  if (!isStringType && !isArrayType) {
    return null; // Fall back to text for other complex types
  }

  // Parse kind from wire format description
  let kind: string | null = null;
  if (meta.wire_format.includes("length-prefixed")) {
    kind = "length_prefixed";
  } else if (meta.wire_format.includes("fixed")) {
    kind = "fixed";
  } else if (meta.wire_format.includes("null-terminated")) {
    kind = "null_terminated";
  }

  if (!kind) {
    return null; // Can't determine kind, fall back to text
  }

  // Generate diagram based on type and kind
  let html = `              <div class="wire-format">
                <div class="wire-diagram">
`;

  if (kind === "length_prefixed") {
    // Length prefix + data block
    const lengthType = "uint8"; // Default assumption
    const lengthBytes = 1;

    html += `                  <div class="field" style="flex: ${lengthBytes}">
                    <div class="field-name">length</div>
                    <div class="field-type">${escapeHtml(lengthType)}</div>
                    <div class="field-size">${lengthBytes} byte</div>
                  </div>
`;

    // Data block (variable size)
    const itemType = isStringType ? "utf8 char" : "T";
    html += `                  <div class="field" style="flex: 4">
                    <div class="field-name">data</div>
                    <div class="field-type">${isStringType ? escapeHtml(itemType) : "T"}[]</div>
                    <div class="field-size">length × ${isStringType ? "1 byte" : "sizeof(T)"}</div>
                  </div>
`;
  } else if (kind === "null_terminated") {
    // Data block + null terminator
    const itemType = isStringType ? "utf8 char" : "T";
    html += `                  <div class="field" style="flex: 4">
                    <div class="field-name">data</div>
                    <div class="field-type">${isStringType ? escapeHtml(itemType) : "T"}[]</div>
                    <div class="field-size">variable</div>
                  </div>
`;

    html += `                  <div class="field" style="flex: 1">
                    <div class="field-name">null</div>
                    <div class="field-type">0x00</div>
                    <div class="field-size">1 byte</div>
                  </div>
`;
  } else if (kind === "fixed") {
    // Fixed size data block
    const itemType = isStringType ? "utf8 char" : "T";
    html += `                  <div class="field" style="flex: 4">
                    <div class="field-name">data</div>
                    <div class="field-type">${isStringType ? escapeHtml(itemType) : "T"}[N]</div>
                    <div class="field-size">N × ${isStringType ? "1 byte" : "sizeof(T)"}</div>
                  </div>
`;
  }

  html += `                </div>
              </div>
`;

  return html;
}
