/**
 * HTML Documentation Generator
 *
 * Generates beautiful HTML documentation from a ProtocolSchema + BinarySchema
 */

import { BinarySchema, TypeDef, Field } from "../schema/binary-schema.js";
import { ProtocolSchema, ProtocolMessage } from "../schema/protocol-schema.js";
import { formatInlineMarkup } from "./inline-formatting.js";
import { annotateWireFormat } from "../schema/annotate-wire-format.js";
import { encodeValue } from "../schema/encoder.js";

/**
 * Check if a type is a composite (has sequence/fields) or a type alias
 */
function isTypeAlias(typeDef: TypeDef): boolean {
  return !("sequence" in typeDef || "fields" in typeDef);
}

/**
 * Get fields from a type definition (handles both 'sequence' and 'fields')
 */
function getTypeFields(typeDef: TypeDef): Field[] {
  if ("sequence" in typeDef && (typeDef as any).sequence) {
    return (typeDef as any).sequence;
  }
  if ("fields" in typeDef && (typeDef as any).fields) {
    return (typeDef as any).fields;
  }
  return [];
}

/**
 * Generate visual diagram for array or string type alias
 */
function generateArrayTypeAliasDiagram(
  aliasedType: any,
  schema: BinarySchema,
): string {
  const kind = aliasedType.kind;
  const isString = aliasedType.type === 'string';
  const encoding = isString ? (aliasedType.encoding || 'utf8') : null;
  const rawItemType = isString ? 'uint8' : (aliasedType.items?.type || "unknown");
  const itemType = isString ? `${encoding} char` : rawItemType;
  let html = `          <div class="wire-format">
            <div class="wire-diagram">
`;

  if (kind === "length_prefixed") {
    const lengthType = aliasedType.length_type || "uint8";
    const lengthBytes =
      lengthType === "uint8"
        ? 1
        : lengthType === "uint16"
          ? 2
          : lengthType === "uint32"
            ? 4
            : 8;

    // Length prefix block
    html += `              <div class="field" style="flex: ${lengthBytes}">
                <div class="field-name">length</div>
                <div class="field-type">${escapeHtml(lengthType)}</div>
                <div class="field-size">${lengthBytes} byte${lengthBytes > 1 ? "s" : ""}</div>
              </div>
`;

    // Data block (variable size) - linkify item type for arrays
    const displayItemType = isString ? escapeHtml(itemType) : linkifyType(rawItemType, schema);
    html += `              <div class="field" style="flex: 4">
                <div class="field-name">data</div>
                <div class="field-type">${displayItemType}[]</div>
                <div class="field-size">length × ${getItemTypeSize(rawItemType)}</div>
              </div>
`;
  } else if (kind === "null_terminated") {
    // Data block - linkify item type for arrays
    const displayItemType = isString ? escapeHtml(itemType) : linkifyType(rawItemType, schema);
    html += `              <div class="field" style="flex: 4">
                <div class="field-name">data</div>
                <div class="field-type">${displayItemType}[]</div>
                <div class="field-size">variable</div>
              </div>
`;

    // Null terminator
    html += `              <div class="field" style="flex: 1">
                <div class="field-name">null</div>
                <div class="field-type">0x00</div>
                <div class="field-size">1 byte</div>
              </div>
`;
  } else if (kind === "fixed") {
    const length = aliasedType.length || 0;
    // Linkify item type for arrays
    const displayItemType = isString ? escapeHtml(itemType) : linkifyType(rawItemType, schema);
    html += `              <div class="field" style="flex: ${Math.max(1, length)}">
                <div class="field-name">data</div>
                <div class="field-type">${displayItemType}[${length}]</div>
                <div class="field-size">${length} × ${getItemTypeSize(rawItemType)}</div>
              </div>
`;
  }

  html += `            </div>
          </div>
`;

  return html;
}

/**
 * Get human-readable size description for array item type
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
 * Check if a type is a built-in primitive
 */
function isBuiltInType(typeName: string): boolean {
  const builtIns = [
    "uint8",
    "uint16",
    "uint32",
    "uint64",
    "int8",
    "int16",
    "int32",
    "int64",
    "float32",
    "float64",
    "bit",
  ];
  return builtIns.includes(typeName);
}

/**
 * Make a type reference clickable if it's a custom type
 */
function linkifyType(typeName: string, schema: BinarySchema): string {
  // Handle arrays with variants (special marker from getFieldTypeInfo)
  if (typeName.startsWith("__ARRAY_WITH_VARIANTS__")) {
    const markerParts = typeName.substring("__ARRAY_WITH_VARIANTS__".length).split("__");
    try {
      const variantsJson = markerParts[0];
      const itemType = markerParts[1] || "uint8";
      const variants = JSON.parse(variantsJson) as string[];
      const linkedVariants = variants.map(v => linkifyType(v, schema)).join(" | ");
      return `${itemType}[] (${linkedVariants})`;
    } catch (e) {
      return "array";
    }
  }

  // Handle fields with variants (compression pointers, etc.)
  if (typeName.startsWith("__FIELD_WITH_VARIANTS__")) {
    const variantsJson = typeName.substring("__FIELD_WITH_VARIANTS__".length);
    try {
      const variants = JSON.parse(variantsJson) as string[];
      const linkedVariants = variants.map(v => linkifyType(v, schema)).join(" | ");
      return linkedVariants;
    } catch (e) {
      return "unknown";
    }
  }

  // Handle generic types like Optional<uint64>
  const genericMatch = typeName.match(/^(\w+)<(.+)>$/);
  if (genericMatch) {
    const [, genericType, typeArg] = genericMatch;

    // Check if there's a generic template (e.g., Optional<T>) in the schema
    const templateName = Object.keys(schema.types).find(
      (key) => key.startsWith(genericType + "<") && key.includes("<T>"),
    );

    let linkedGeneric = escapeHtml(genericType);
    if (templateName) {
      // Link to the generic template
      const templateId = templateName.replace(/[<>]/g, "-");
      linkedGeneric = `<a href="#type-${templateId}" class="type-link">${escapeHtml(genericType)}</a>`;
    }

    const linkedArg = linkifyType(typeArg, schema);
    return `${linkedGeneric}&lt;${linkedArg}&gt;`;
  }

  // Check if it's a custom type (exists in schema and not built-in)
  if (!isBuiltInType(typeName) && schema.types[typeName]) {
    const typeId = typeName.replace(/[<>]/g, "-");
    return `<a href="#type-${typeId}" class="type-link">${escapeHtml(typeName)}</a>`;
  }

  return escapeHtml(typeName);
}

/**
 * Get human-readable description of what a type alias references
 */
function getAliasedTypeInfo(typeDef: TypeDef, schema: BinarySchema): string {
  const aliasedType = typeDef as any;

  if (!("type" in aliasedType)) {
    return "unknown";
  }

  switch (aliasedType.type) {
    case "array": {
      const itemsType = aliasedType.items?.type || "unknown";
      const kind = aliasedType.kind;
      if (kind === "length_prefixed") {
        const lengthType = aliasedType.length_type || "uint8";
        return `length-prefixed array of ${itemsType} (length: ${lengthType})`;
      } else if (kind === "fixed") {
        return `fixed array[${aliasedType.length}] of ${itemsType}`;
      } else if (kind === "null_terminated") {
        return `null-terminated array of ${itemsType}`;
      }
      return `array of ${itemsType}`;
    }
    case "string": {
      const encoding = aliasedType.encoding || "utf8";
      const kind = aliasedType.kind;
      if (kind === "length_prefixed") {
        const lengthType = aliasedType.length_type || "uint8";
        return `length-prefixed string (${encoding}, length: ${lengthType})`;
      } else if (kind === "fixed") {
        return `fixed string[${aliasedType.length}] (${encoding})`;
      } else if (kind === "null_terminated") {
        return `null-terminated string (${encoding})`;
      }
      return `string (${encoding})`;
    }
    case "uint8":
    case "uint16":
    case "uint32":
    case "uint64":
    case "int8":
    case "int16":
    case "int32":
    case "int64":
    case "float32":
    case "float64":
      return aliasedType.type;
    case "bit":
      return `bit[${aliasedType.size}]`;
    default:
      // Type reference
      return aliasedType.type;
  }
}

export interface HTMLGeneratorOptions {
  /** Include CSS inline (default: true) */
  inlineCSS?: boolean;
  /** Include examples section (default: true) */
  includeExamples?: boolean;
  /** Title override */
  title?: string;
}

/**
 * Generate HTML documentation from protocol + binary schemas
 */
export function generateHTML(
  protocolSchema: ProtocolSchema,
  binarySchema: BinarySchema,
  options: HTMLGeneratorOptions = {},
): string {
  const { inlineCSS = true, includeExamples = true } = options;
  const title = options.title || protocolSchema.protocol.name;

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
`;

  if (inlineCSS) {
    html += `  <style>\n${generateCSS()}\n  </style>\n`;
  } else {
    html += `  <link rel="stylesheet" href="protocol-docs.css">\n`;
  }

  html += `  <script>
    // Auto-open details elements when navigating to type anchors
    document.addEventListener('DOMContentLoaded', () => {
      // Handle initial load with hash
      if (window.location.hash) {
        const target = document.querySelector(window.location.hash);
        if (target && target.tagName === 'DETAILS') {
          target.open = true;
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }

      // Handle hash changes (clicking type links)
      window.addEventListener('hashchange', () => {
        const target = document.querySelector(window.location.hash);
        if (target && target.tagName === 'DETAILS') {
          target.open = true;
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  </script>
</head>
<body>
  <header class="protocol-header">
    <h1>${escapeHtml(protocolSchema.protocol.name)}</h1>
    <div class="protocol-version">Version ${escapeHtml(protocolSchema.protocol.version)}</div>
  </header>

  <nav class="toc">
    <h2>Table of Contents</h2>
    <ul>
      <li><a href="#overview">Overview</a></li>
      <li><a href="#frame-format">Frame Format</a></li>
      <li><a href="#data-types">Data Types</a></li>
      <li><a href="#messages">Messages</a></li>
    </ul>
  </nav>

  <main>
`;

  // Overview section
  html += `    <section id="overview" class="section">
      <h2>Overview</h2>
      ${protocolSchema.protocol.description ? `<p>${escapeHtml(protocolSchema.protocol.description)}</p>` : ""}
`;

  if (protocolSchema.protocol.notes) {
    html += `      <div class="notes">\n`;
    html += renderNotes(protocolSchema.protocol.notes);
    html += `      </div>\n`;
  }

  html += `    </section>\n\n`;

  // Frame format section
  if (protocolSchema.protocol.header_format) {
    html += generateFrameFormatSection(
      protocolSchema.protocol.header_format,
      binarySchema,
      protocolSchema.protocol.field_descriptions || {},
      protocolSchema,
    );
  }

  // Data types section
  html += generateDataTypesSection(
    binarySchema,
    protocolSchema.protocol.field_descriptions || {},
  );

  // Messages section
  html += generateMessagesSection(
    protocolSchema,
    binarySchema,
    includeExamples,
  );

  html += `  </main>

  <footer>
    <p>Generated by BinSchema HTML Generator</p>
  </footer>

  <script>
    // Cross-highlight hex segments and annotations on hover
    document.addEventListener('DOMContentLoaded', () => {
      const segments = document.querySelectorAll('.hex-segment');
      const annotations = document.querySelectorAll('.annotation');

      segments.forEach(segment => {
        const id = segment.dataset.segment;
        const matchingAnnotation = document.querySelector(\`.annotation[data-segment="\${id}"]\`);

        segment.addEventListener('mouseenter', () => {
          if (matchingAnnotation) matchingAnnotation.classList.add('highlight');
        });

        segment.addEventListener('mouseleave', () => {
          if (matchingAnnotation) matchingAnnotation.classList.remove('highlight');
        });
      });

      annotations.forEach(annotation => {
        const id = annotation.dataset.segment;
        const matchingSegment = document.querySelector(\`.hex-segment[data-segment="\${id}"]\`);

        annotation.addEventListener('mouseenter', () => {
          if (matchingSegment) matchingSegment.classList.add('highlight');
        });

        annotation.addEventListener('mouseleave', () => {
          if (matchingSegment) matchingSegment.classList.remove('highlight');
        });
      });
    });
  </script>
</body>
</html>`;

  return html;
}

/**
 * Calculate the size of all header fields except a specific field
 */
function getHeaderSizeExcept(headerFields: Field[], excludeFieldName: string, binarySchema: BinarySchema): number {
  let size = 0;
  for (const field of headerFields) {
    if (field.name === excludeFieldName) continue; // Skip the excluded field
    const typeInfo = getFieldTypeInfo(field, binarySchema);
    size += typeInfo.bytes;
  }
  return size;
}

/**
 * Generate frame format section
 */
function generateFrameFormatSection(
  headerTypeName: string,
  binarySchema: BinarySchema,
  fieldDescriptions: Record<string, string>,
  protocolSchema: ProtocolSchema,
): string {
  const headerType = binarySchema.types[headerTypeName] as TypeDef;
  if (!headerType) {
    return `    <section id="frame-format" class="section">
      <h2>Frame Format</h2>
      <p class="error">Header type "${headerTypeName}" not found in schema.</p>
    </section>\n\n`;
  }

  let html = `    <section id="frame-format" class="section">
      <h2>Frame Format</h2>
      <p>All messages use the following frame-based format:</p>

      <div class="wire-format">
        <div class="wire-diagram">
`;

  const headerFields = getTypeFields(headerType);
  for (const field of headerFields) {
    const fieldKey = `${headerTypeName}.${field.name}`;
    const description = fieldDescriptions[fieldKey] || "";
    const typeInfo = getFieldTypeInfo(field, binarySchema);
    const width = calculateFieldWidth(typeInfo.bytes);

    html += `          <div class="field" style="flex: ${width}">
            <div class="field-name">${escapeHtml(field.name)}</div>
            <div class="field-type">${linkifyType(typeInfo.displayType, binarySchema)}</div>
            <div class="field-size">${escapeHtml(typeInfo.size)}</div>
          </div>
`;
  }

  // Add payload field to show complete frame structure
  html += `          <div class="field" style="flex: 8">
            <div class="field-name">payload</div>
            <div class="field-type">varies by message type</div>
            <div class="field-size">N bytes</div>
          </div>
`;

  html += `        </div>
`;

  // Add descriptions below the diagram
  for (const field of headerFields) {
    const fieldKey = `${headerTypeName}.${field.name}`;
    const description = fieldDescriptions[fieldKey] || "";
    if (description) {
      html += `        <div class="field-desc"><strong>${escapeHtml(field.name)}:</strong> ${escapeHtml(description)}</div>\n`;
    }
  }

  // Add payload description
  html += `        <div class="field-desc"><strong>payload:</strong> Message-specific data as defined by the message type. See individual message types below for payload structure.</div>\n`;

  // Add example if we have header_example and a message with an example
  const headerExample = protocolSchema.protocol.header_example;
  const firstMessageWithExample = protocolSchema.protocol.messages.find(msg => msg.example);

  if (headerExample && firstMessageWithExample?.example) {
    const msg = firstMessageWithExample;
    const example = msg.example!; // Safe because we check above
    const payloadBytes = example.bytes;
    const payloadDecoded = example.decoded;

    html += `
      <div class="example">
        <details open>
          <summary>Example: Complete frame with ${msg.name} payload</summary>
          <div class="example-content">
            <p>${escapeHtml(example.description)}:</p>
`;

    // First, encode just the payload to get its size
    const payloadAnnotations = annotateWireFormat(
      payloadBytes,
      msg.payload_type,
      binarySchema,
      payloadDecoded
    );

    // Now encode the header with the complete frame using the annotate function
    // to calculate the total size
    const headerDecoded = { ...headerExample.decoded };

    // Auto-calculate the header size field if specified and not provided
    const headerFields = getTypeFields(headerType);
    const sizeFieldName = protocolSchema.protocol.header_size_field;

    if (sizeFieldName && headerDecoded[sizeFieldName] === undefined) {
      // Calculate total payload size from annotations
      const lastPayloadAnn = payloadAnnotations[payloadAnnotations.length - 1];
      const payloadSize = lastPayloadAnn.offset + lastPayloadAnn.length;

      // Size/length is typically everything except the size field itself
      const headerSizeWithoutSizeField = getHeaderSizeExcept(headerFields, sizeFieldName, binarySchema);
      headerDecoded[sizeFieldName] = headerSizeWithoutSizeField + payloadSize;
    }

    // Generate header annotations - this will encode the header for us
    const headerAnnotations = annotateWireFormat(
      [], // We'll build this
      headerTypeName,
      binarySchema,
      headerDecoded
    );

    // Now build the complete frame by encoding header + payload
    const completeFrame: number[] = [];

    // Encode header using the encoder utility
    const headerBytes = encodeValue(binarySchema, headerTypeName, headerDecoded);
    completeFrame.push(...headerBytes);

    // Add payload
    completeFrame.push(...payloadBytes);

    // Re-generate header annotations with actual complete frame
    const finalHeaderAnnotations = annotateWireFormat(
      completeFrame,
      headerTypeName,
      binarySchema,
      headerDecoded
    );

    // Calculate where header ends
    const lastHeaderAnnotation = finalHeaderAnnotations[finalHeaderAnnotations.length - 1];
    const headerEndOffset = lastHeaderAnnotation.offset + lastHeaderAnnotation.length;

    // Adjust payload annotation offsets to account for header
    const adjustedPayloadAnnotations = payloadAnnotations.map(ann => ({
      ...ann,
      offset: ann.offset + headerEndOffset
    }));

    // Combine annotations
    const allAnnotations = [...finalHeaderAnnotations, ...adjustedPayloadAnnotations];

    html += generateAnnotatedHexView(completeFrame, allAnnotations, 'frame-example');

    html += `          </div>
        </details>
      </div>
`;
  }

  html += `      </div>
    </section>\n\n`;

  return html;
}

/**
 * Generate data types section
 */
function generateDataTypesSection(
  binarySchema: BinarySchema,
  fieldDescriptions: Record<string, string>,
): string {
  let html = `    <section id="data-types" class="section">
      <h2>Data Types</h2>
      <div class="type-list">
`;

  // Primitive types
  html += `        <details class="type-details">
          <summary><h3>Primitive Types</h3></summary>
          <table class="types-table">
            <thead>
              <tr><th>Type</th><th>Size</th><th>Description</th><th>Range</th></tr>
            </thead>
            <tbody>
              <tr><td>uint8</td><td>1 byte</td><td>Unsigned 8-bit integer</td><td>0 to 255</td></tr>
              <tr><td>uint16</td><td>2 bytes</td><td>Unsigned 16-bit integer (big-endian)</td><td>0 to 65,535</td></tr>
              <tr><td>uint32</td><td>4 bytes</td><td>Unsigned 32-bit integer (big-endian)</td><td>0 to 4.29×10<sup>9</sup></td></tr>
              <tr><td>uint64</td><td>8 bytes</td><td>Unsigned 64-bit integer (big-endian)</td><td>0 to 1.84×10<sup>19</sup></td></tr>
              <tr><td>int8</td><td>1 byte</td><td>Signed 8-bit integer</td><td>-128 to 127</td></tr>
              <tr><td>int16</td><td>2 bytes</td><td>Signed 16-bit integer (big-endian)</td><td>-32,768 to 32,767</td></tr>
              <tr><td>int32</td><td>4 bytes</td><td>Signed 32-bit integer (big-endian)</td><td>-2.15×10<sup>9</sup> to 2.15×10<sup>9</sup></td></tr>
              <tr><td>int64</td><td>8 bytes</td><td>Signed 64-bit integer (big-endian)</td><td>-9.22×10<sup>18</sup> to 9.22×10<sup>18</sup></td></tr>
              <tr><td>float32</td><td>4 bytes</td><td>32-bit floating point (IEEE 754)</td><td>±1.4×10<sup>-45</sup> to ±3.4×10<sup>38</sup></td></tr>
              <tr><td>float64</td><td>8 bytes</td><td>64-bit floating point (IEEE 754)</td><td>±4.9×10<sup>-324</sup> to ±1.8×10<sup>308</sup></td></tr>
            </tbody>
          </table>
        </details>
`;

  // Custom types from schema
  for (const [typeName, typeDef] of Object.entries(binarySchema.types)) {
    const typeDefObj = typeDef as TypeDef;
    const description = (typeDefObj as any).description || "";
    const isGeneric = typeName.includes("<");

    // Create anchor-safe ID (replace < and > with -)
    const typeId = typeName.replace(/[<>]/g, "-");

    html += `        <details class="type-details" id="type-${typeId}">
          <summary><h3>${escapeHtml(typeName)}${isGeneric ? ' <span class="generic-badge">Generic</span>' : ""}</h3></summary>
`;

    // Check if this is a type alias or composite type
    if (isTypeAlias(typeDefObj)) {
      // Type alias - show visual diagram if it's an array, otherwise show text
      if (description) {
        html += `          <p class="type-description">${escapeHtml(description)}</p>\n`;
      }

      const aliasedType = typeDefObj as any;
      if ("type" in aliasedType && (aliasedType.type === "array" || aliasedType.type === "string")) {
        // Show visual diagram for arrays and strings
        html += generateArrayTypeAliasDiagram(aliasedType, binarySchema);
      } else {
        // Show text description for non-array type aliases
        const aliasedTypeInfo = getAliasedTypeInfo(typeDefObj, binarySchema);
        html += `          <p class="type-alias">
            Type alias: <code>${escapeHtml(aliasedTypeInfo)}</code>
          </p>
`;
      }
    } else {
      // Composite type - show horizontal block diagram
      if (description) {
        html += `          <p class="type-description">${escapeHtml(description)}</p>\n`;
      }

      html += `          <div class="wire-format">
            <div class="wire-diagram">
`;

      const typeFields = getTypeFields(typeDefObj);
      for (const field of typeFields) {
        const typeInfo = getFieldTypeInfo(field, binarySchema);
        const conditional = "conditional" in field && field.conditional;
        const width = calculateFieldWidth(typeInfo.bytes);

        html += `              <div class="field${conditional ? " conditional" : ""}" style="flex: ${width}">
                <div class="field-name">${escapeHtml(field.name)}</div>
                <div class="field-type">${linkifyType(typeInfo.displayType, binarySchema)}</div>
                <div class="field-size">${escapeHtml(typeInfo.size)}</div>
                ${conditional ? `<div class="field-condition">if ${escapeHtml(field.conditional as string)}</div>` : ""}
              </div>
`;
      }

      html += `            </div>
`;

      // Add descriptions below the diagram
      for (const field of typeFields) {
        const fieldKey = `${typeName}.${field.name}`;
        const fieldDescription = fieldDescriptions[fieldKey] || "";
        if (fieldDescription) {
          html += `            <div class="field-desc"><strong>${escapeHtml(field.name)}:</strong> ${escapeHtml(fieldDescription)}</div>\n`;
        }
      }

      html += `          </div>
`;
    }

    html += `        </details>
`;
  }

  html += `      </div>
    </section>\n\n`;

  return html;
}

/**
 * Generate messages section
 */
function generateMessagesSection(
  protocolSchema: ProtocolSchema,
  binarySchema: BinarySchema,
  includeExamples: boolean,
): string {
  const messages = protocolSchema.protocol.messages;

  // Group messages by direction
  const clientToServer = messages.filter(
    (m) => m.direction === "client_to_server",
  );
  const serverToClient = messages.filter(
    (m) => m.direction === "server_to_client",
  );
  const bidirectional = messages.filter((m) => m.direction === "bidirectional");

  let html = `    <section id="messages" class="section">
      <h2>Messages</h2>
`;

  if (clientToServer.length > 0) {
    html += `      <h3>Client → Server Messages</h3>
      ${generateMessageTable(clientToServer)}
      ${generateMessageDetails(clientToServer, binarySchema, protocolSchema.protocol.field_descriptions || {}, includeExamples)}
`;
  }

  if (serverToClient.length > 0) {
    html += `      <h3>Server → Client Messages</h3>
      ${generateMessageTable(serverToClient)}
      ${generateMessageDetails(serverToClient, binarySchema, protocolSchema.protocol.field_descriptions || {}, includeExamples)}
`;
  }

  if (bidirectional.length > 0) {
    html += `      <h3>Bidirectional Messages</h3>
      ${generateMessageTable(bidirectional)}
      ${generateMessageDetails(bidirectional, binarySchema, protocolSchema.protocol.field_descriptions || {}, includeExamples)}
`;
  }

  html += `    </section>\n\n`;

  return html;
}

/**
 * Generate message summary table
 */
function generateMessageTable(messages: ProtocolMessage[]): string {
  let html = `      <table class="messages-table">
        <thead>
          <tr><th>Code</th><th>Name</th><th>Description</th></tr>
        </thead>
        <tbody>
`;

  for (const msg of messages) {
    html += `          <tr>
            <td><code>${escapeHtml(msg.code)}</code></td>
            <td><a href="#msg-${msg.code}">${escapeHtml(msg.name)}</a></td>
            <td>${escapeHtml(msg.description)}</td>
          </tr>
`;
  }

  html += `        </tbody>
      </table>
`;

  return html;
}

/**
 * Generate detailed message documentation
 */
function generateMessageDetails(
  messages: ProtocolMessage[],
  binarySchema: BinarySchema,
  fieldDescriptions: Record<string, string>,
  includeExamples: boolean,
): string {
  let html = "";

  for (const msg of messages) {
    const payloadType = binarySchema.types[msg.payload_type] as TypeDef;

    html += `      <details class="message-details" id="msg-${msg.code}">
        <summary>
          <h4><code>${escapeHtml(msg.code)}</code> ${escapeHtml(msg.name)}</h4>
        </summary>

        <p class="message-description">${escapeHtml(msg.description)}</p>
`;

    if (msg.notes) {
      html += `        <div class="message-notes">\n`;
      html += renderNotes(msg.notes);
      html += `        </div>\n`;
    }

    if (payloadType) {
      html += `        <div class="wire-format">
          <div class="wire-diagram">
`;
      const payloadFields = getTypeFields(payloadType);
      for (const field of payloadFields) {
        const typeInfo = getFieldTypeInfo(field, binarySchema);
        const conditional = "conditional" in field && field.conditional;
        const width = calculateFieldWidth(typeInfo.bytes);

        html += `            <div class="field${conditional ? " conditional" : ""}" style="flex: ${width}">
              <div class="field-name">${escapeHtml(field.name)}</div>
              <div class="field-type">${linkifyType(typeInfo.displayType, binarySchema)}</div>
              <div class="field-size">${escapeHtml(typeInfo.size)}</div>
              ${conditional ? `<div class="field-condition">if ${escapeHtml(field.conditional as string)}</div>` : ""}
            </div>
`;
      }
      html += `          </div>
`;

      // Add descriptions below the diagram
      for (const field of payloadFields) {
        const fieldKey = `${msg.payload_type}.${field.name}`;
        const description = fieldDescriptions[fieldKey] || "";
        if (description) {
          html += `          <div class="field-desc"><strong>${escapeHtml(field.name)}:</strong> ${escapeHtml(description)}</div>\n`;
        }
      }

      html += `        </div>
`;
    } else {
      html += `        <p class="error">Payload type "${msg.payload_type}" not found in schema.</p>\n`;
    }

    if (includeExamples && msg.example) {
      html += `        <details class="example">
          <summary>Wire Format Example</summary>
          <div class="example-content">
            <p>${escapeHtml(msg.example.description)}</p>
`;

      // Generate annotations from schema
      if (msg.example.decoded && msg.payload_type) {
        try {
          const annotations = annotateWireFormat(
            msg.example.bytes,
            msg.payload_type,
            binarySchema,
            msg.example.decoded,
          );

          if (annotations.length > 0) {
            html += `            <div class="example-hex">\n`;
            html += `              <h5>Wire Format (Hex Bytes)</h5>\n`;
            html += generateAnnotatedHexView(msg.example.bytes, annotations, msg.name);
            html += `            </div>\n`;
          } else {
            // Fallback to plain hex dump if no annotations
            html += `            <div class="example-hex">\n`;
            html += `              <h5>Wire Format (Hex Bytes)</h5>\n`;
            html += `              <pre class="hex-dump">${formatHexBytes(msg.example.bytes)}</pre>\n`;
            html += `            </div>\n`;
          }
        } catch (error) {
          console.warn(
            `Failed to generate annotations for ${msg.name}: ${error instanceof Error ? error.message : String(error)}`,
          );
          // Fallback to plain hex dump on error
          html += `            <div class="example-hex">\n`;
          html += `              <h5>Wire Format (Hex Bytes)</h5>\n`;
          html += `              <pre class="hex-dump">${formatHexBytes(msg.example.bytes)}</pre>\n`;
          html += `            </div>\n`;
        }
      } else {
        // No decoded data, just show plain hex dump
        html += `            <div class="example-hex">\n`;
        html += `              <h5>Wire Format (Hex Bytes)</h5>\n`;
        html += `              <pre class="hex-dump">${formatHexBytes(msg.example.bytes)}</pre>\n`;
        html += `            </div>\n`;
      }

      if (msg.example.decoded) {
        html += `            <div class="example-decoded">
              <h5>Decoded Payload</h5>
              <pre class="decoded">${escapeHtml(JSON.stringify(msg.example.decoded, null, 2))}</pre>
            </div>
`;
      }
      html += `          </div>
        </details>
`;
    }

    html += `      </details>\n\n`;
  }

  return html;
}

/**
 * Get field type information for display
 */
function getFieldTypeInfo(
  field: Field,
  schema: BinarySchema,
): { displayType: string; size: string; bytes: number } {
  if (!("type" in field)) {
    return { displayType: "unknown", size: "?", bytes: 1 };
  }

  const type = field.type;

  switch (type) {
    case "uint8":
    case "int8":
      return { displayType: type, size: "1 byte", bytes: 1 };
    case "uint16":
    case "int16":
      return { displayType: type, size: "2 bytes", bytes: 2 };
    case "uint32":
    case "int32":
    case "float32":
      return { displayType: type, size: "4 bytes", bytes: 4 };
    case "uint64":
    case "int64":
    case "float64":
      return { displayType: type, size: "8 bytes", bytes: 8 };
    case "bit":
      const bitBytes = Math.ceil((field.size || 1) / 8);
      return {
        displayType: `bit<${field.size}>`,
        size: `${field.size} bits`,
        bytes: bitBytes,
      };
    case "array":
      const itemType =
        field.items && "type" in field.items ? field.items.type : "unknown";
      // Check for variants annotation
      if ("variants" in field && field.variants && Array.isArray(field.variants)) {
        // Return a special marker that we'll process when linkifying
        return { displayType: `__ARRAY_WITH_VARIANTS__${JSON.stringify(field.variants)}__${itemType}`, size: "variable", bytes: 4 };
      }
      return { displayType: `${itemType}[]`, size: "variable", bytes: 4 }; // Assume 4 bytes for variable size (length prefix)
    case "string":
      const encoding = "encoding" in field ? field.encoding : "utf8";
      return { displayType: `string (${encoding})`, size: "variable", bytes: 4 };
    default:
      // Check if field has variants (compression pointers, etc.)
      if ("variants" in field && field.variants && Array.isArray(field.variants)) {
        // Return special marker for linkifyType to process
        return { displayType: `__FIELD_WITH_VARIANTS__${JSON.stringify(field.variants)}`, size: "variable", bytes: 4 };
      }

      // Custom type reference - try to calculate size from schema
      const refType = schema.types[type];
      if (refType && !isTypeAlias(refType)) {
        const fields = getTypeFields(refType);
        let totalBytes = 0;
        for (const f of fields) {
          totalBytes += getFieldTypeInfo(f, schema).bytes;
        }
        return {
          displayType: type,
          size: `${totalBytes} bytes`,
          bytes: totalBytes,
        };
      }
      return { displayType: type, size: "variable", bytes: 4 };
  }
}

/**
 * Calculate flex width for a field based on byte size
 * Minimum width of 1, scales proportionally with byte count
 */
function calculateFieldWidth(bytes: number): number {
  return Math.max(1, bytes);
}

/**
 * Format hex bytes for display
 */
function formatHexBytes(bytes: number[]): string {
  return bytes
    .map((b, i) => {
      const hex = b.toString(16).toUpperCase().padStart(2, "0");
      return (i + 1) % 16 === 0 ? hex + "\n" : hex + " ";
    })
    .join("")
    .trim();
}

/**
 * Generate annotated hex view with inline colored segments
 * @param exampleId - Unique identifier for this example (to avoid data-segment collisions across multiple examples)
 */
function generateAnnotatedHexView(bytes: number[], annotations: any[], exampleId: string = 'default'): string {
  // Validate that annotations don't exceed byte array bounds
  for (let i = 0; i < annotations.length; i++) {
    const ann = annotations[i];
    const requiredBytes = ann.offset + ann.length;
    if (requiredBytes > bytes.length) {
      throw new Error(
        `Annotation validation failed: Annotation ${i} ("${ann.description}") ` +
        `requires bytes ${ann.offset}-${ann.offset + ann.length - 1} ` +
        `but byte array only has ${bytes.length} bytes (0-${bytes.length - 1}).\n\n` +
        `This usually means:\n` +
        `  1. The 'bytes' array in your example is too short\n` +
        `  2. The 'decoded' values don't match the actual bytes\n` +
        `  3. The schema definition doesn't match the example data\n\n` +
        `Check that your example's byte array matches what the schema would encode.`
      );
    }
  }

  const colors = [
    "#dbeafe",
    "#fce7f3",
    "#fef3c7",
    "#d1fae5",
    "#e9d5ff",
    "#fed7aa",
  ];

  let html = `              <div class="annotated-hex-view">\n`;

  // Create inline hex with colored segments
  html += `                <div class="hex-inline">\n`;

  let byteIndex = 0;
  annotations.forEach((ann, idx) => {
    const color = colors[idx % colors.length];
    const segmentId = `${exampleId}-${idx}`;
    const isBitfield = ann.description.includes("(bits)");

    html += `                  <span class="hex-segment" data-segment="${segmentId}" style="background-color: ${color};">`;

    // Add binary icon for bitfield segments
    if (isBitfield) {
      html += `<svg class="binary-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><ellipse cx="94" cy="72" rx="30" ry="40" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/><ellipse cx="166" cy="184" rx="30" ry="40" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/><polyline points="176 112 176 32 152 45.33" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/><polyline points="96 224 96 144 72 157.33" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/></svg> `;
    }

    for (let i = 0; i < ann.length; i++) {
      if (isBitfield) {
        // Display as binary for bitfields
        const binary = bytes[ann.offset + i]
          .toString(2)
          .padStart(8, "0");
        html += binary;
      } else {
        // Display as hex for regular fields
        const hex = bytes[ann.offset + i]
          .toString(16)
          .toUpperCase()
          .padStart(2, "0");
        html += hex;
      }
      if (i < ann.length - 1) html += " ";
    }

    html += `</span>`;
  });

  html += `\n                </div>\n`;

  // Create annotation list
  html += `                <div class="hex-annotations">\n`;
  annotations.forEach((ann, idx) => {
    const color = colors[idx % colors.length];
    const segmentId = `${exampleId}-${idx}`;
    const endByte = ann.offset + ann.length - 1;
    const byteRange =
      ann.length === 1
        ? `Byte ${ann.offset}`
        : `Bytes ${ann.offset}-${endByte}`;
    html += `                  <div class="annotation" data-segment="${segmentId}" style="border-left-color: ${color};">\n`;

    // Check if this is a bitfield annotation with structured data
    if (ann.bitfields && ann.bitfields.length > 0) {
      html += `                    <strong>${byteRange} (bits):</strong>\n`;
      html += `                    <ul class="bitfield-list">\n`;
      for (const bitfield of ann.bitfields) {
        const bitRange = bitfield.bitStart === bitfield.bitEnd
          ? `bit ${bitfield.bitStart}`
          : `bits ${bitfield.bitStart}-${bitfield.bitEnd}`;
        html += `                      <li><code>${escapeHtml(bitfield.name)}</code> = ${bitfield.value} (${bitRange})</li>\n`;
      }
      html += `                    </ul>\n`;
    } else {
      // Regular annotation - display as before
      html += `                    <strong>${byteRange}:</strong> ${escapeHtml(ann.description)}\n`;
    }

    html += `                  </div>\n`;
  });
  html += `                </div>\n`;

  html += `              </div>\n`;

  return html;
}

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
 * Render notes as HTML (supports both string and string[])
 * Applies inline formatting (**bold**, *italic*)
 */
function renderNotes(notes: string | string[]): string {
  if (Array.isArray(notes)) {
    // Render as bullet list
    if (notes.length === 0) return "";
    const items = notes
      .map((note) => `      <li>${formatInlineMarkup(note)}</li>`)
      .join("\n");
    return `    <ul class="notes-list">\n${items}\n    </ul>\n`;
  } else {
    // Render as paragraph (backward compat)
    return `    <p>${formatInlineMarkup(notes)}</p>\n`;
  }
}

/**
 * Generate CSS stylesheet
 */
function generateCSS(): string {
  return `    /* Protocol Documentation Styles */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
      padding: 20px;
    }

    .protocol-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 20px;
      border-radius: 8px;
      margin-bottom: 30px;
      text-align: center;
    }

    .protocol-header h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
    }

    .protocol-version {
      font-size: 1.2em;
      opacity: 0.9;
    }

    .toc {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .toc h2 {
      margin-bottom: 15px;
      color: #667eea;
    }

    .toc ul {
      list-style: none;
    }

    .toc li {
      margin: 8px 0;
    }

    .toc a {
      color: #667eea;
      text-decoration: none;
      padding: 5px 10px;
      display: inline-block;
      border-radius: 4px;
      transition: background 0.2s;
    }

    .toc a:hover {
      background: #f0f0f0;
    }

    main {
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .section {
      margin-bottom: 50px;
    }

    .section h2 {
      color: #667eea;
      border-bottom: 2px solid #667eea;
      padding-bottom: 10px;
      margin-bottom: 20px;
    }

    .section h3 {
      color: #764ba2;
      margin: 30px 0 15px 0;
    }

    .wire-format {
      background: #f9f9f9;
      border-top: 1px solid #ddd;
      border-bottom: 1px solid #ddd;
      padding: 20px;
      margin: 20px 0;
      overflow-x: auto;
    }

    .wire-diagram {
      display: flex;
      flex-direction: row;
      gap: 0;
      min-width: 100%;
      margin-bottom: 15px;
    }

    .field {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: 2px solid #555;
      border-right: none;
      padding: 12px 8px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      min-height: 80px;
      position: relative;
      box-sizing: border-box;
    }

    .field:last-child {
      border-right: 2px solid #555;
    }

    .field.conditional {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    }

    .field-name {
      font-weight: bold;
      color: white;
      font-size: 0.9em;
      margin-bottom: 4px;
      word-wrap: break-word;
      max-width: 100%;
    }

    .field-type {
      font-family: 'Courier New', monospace;
      color: rgba(255, 255, 255, 0.9);
      font-size: 0.75em;
      margin-bottom: 2px;
    }

    .field-size {
      color: rgba(255, 255, 255, 0.7);
      font-size: 0.7em;
      font-weight: 600;
    }

    .field-desc {
      margin-top: 8px;
      color: #555;
      font-size: 0.95em;
      line-height: 1.5;
    }

    .field-condition {
      margin-top: 6px;
      padding: 6px 10px;
      background: #fef3c7;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 0.85em;
      color: #92400e;
      border: 1px solid #fbbf24;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }

    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }

    th {
      background: #667eea;
      color: white;
      font-weight: 600;
    }

    tr:hover {
      background: #f9f9f9;
    }

    code {
      background: #f0f0f0;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
    }

    .type-link {
      color: #667eea;
      text-decoration: none;
      border-bottom: 1px dashed #667eea;
      transition: all 0.2s;
    }

    .type-link:hover {
      color: #764ba2;
      border-bottom-color: #764ba2;
      border-bottom-style: solid;
    }

    /* Type links inside field diagrams need high contrast on colored backgrounds */
    .field-type .type-link {
      color: #fde047;
      border-bottom-color: rgba(253, 224, 71, 0.6);
    }

    .field-type .type-link:hover {
      color: #ffffff;
      border-bottom-color: #ffffff;
    }

    details {
      margin: 15px 0;
    }

    summary {
      cursor: pointer;
      user-select: none;
      padding: 10px;
      background: #f9f9f9;
      border-radius: 4px;
      transition: background 0.2s;
    }

    summary:hover {
      background: #f0f0f0;
    }

    summary h3, summary h4 {
      display: inline;
      margin: 0;
    }

    .example summary {
      border-radius: 0;
    }

    .message-details {
      border: 1px solid #ddd;
      border-radius: 6px;
      padding: 0;
      margin: 15px 0;
    }

    .message-details summary {
      background: #f5f5f5;
    }

    .message-details[open] summary {
      border-bottom: 1px solid #ddd;
    }

    .message-details[open] .example summary {
      border-bottom: 0;
    }

    .message-details[open] .example[open] summary {
      border-bottom: 1px solid #ddd;
    }

    .message-description {
      font-size: 1.1em;
      margin: 15px 0;
      padding: 0 15px;
    }

    .message-notes {
      background: #eff6ff;
      border-left: 4px solid #3b82f6;
      padding: 12px;
      margin: 15px;
      border-radius: 4px;
    }

    .notes-list {
      margin: 0;
      padding-left: 20px;
      list-style-type: disc;
    }

    .notes-list li {
      margin: 8px 0;
      line-height: 1.6;
    }

    .generic-badge {
      font-size: 0.7em;
      background: #fbbf24;
      color: #78350f;
      padding: 2px 8px;
      border-radius: 3px;
      font-weight: 600;
      margin-left: 8px;
    }

    .example {
      margin: 20px 0;
      border-top: 1px solid #ddd;
      border-bottom: 1px solid #ddd;
    }

    .example-content {
      padding: 20px;
    }

    .example-content > p {
      margin: 0 0 15px 0;
    }

    .example h5 {
      margin: 15px 0 10px 0;
      font-size: 1em;
      color: #555;
      font-weight: 600;
    }

    .example-hex,
    .example-decoded {
      margin: 15px 0;
    }

    .annotated-hex-view {
      margin: 15px 0;
    }

    .hex-inline {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 0.5em;
      font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
      font-size: 0.95em;
      line-height: 1.8;
      padding: 12px;
      background: #f8f9fa;
      border-radius: 4px;
      overflow-x: auto;
      margin-bottom: 15px;
    }

    .hex-segment {
      padding: 4px 6px;
      border-radius: 3px;
      cursor: pointer;
      transition: all 0.15s;
      border: 2px solid transparent;
      line-height: 1em;
    }

    .binary-icon {
      width: 1em;
      height: 1em;
      display: inline-block;
      vertical-align: middle;
      margin-right: 4px;
    }

    .hex-segment:hover,
    .hex-segment.highlight {
      border-color: rgba(0, 0, 0, 0.3);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .hex-annotations {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      padding: 8px;
    }

    .annotation {
      padding: 8px 12px;
      margin: 4px 0;
      border-left: 4px solid #ddd;
      background: #f9fafb;
      border-radius: 0 4px 4px 0;
      cursor: pointer;
      transition: all 0.15s;
    }

    .annotation:hover,
    .annotation.highlight {
      background: #f3f4f6;
      transform: translateX(4px);
    }

    .annotation strong {
      font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
      font-size: 0.9em;
      color: #4b5563;
    }

    .bitfield-list {
      margin: 8px 0 0 0;
      padding-left: 20px;
      list-style-type: disc;
    }

    .bitfield-list li {
      margin: 4px 0;
      font-size: 0.9em;
      color: #374151;
    }

    .bitfield-list code {
      background: #e5e7eb;
      padding: 1px 4px;
      border-radius: 2px;
      font-size: 0.85em;
    }

    .hex-dump {
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 15px;
      border-radius: 4px;
      overflow-x: auto;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
      line-height: 1.4;
    }

    .decoded {
      background: #f9f9f9;
      padding: 15px;
      border-radius: 4px;
      overflow-x: auto;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
    }

    .error {
      color: #dc2626;
      background: #fee2e2;
      padding: 10px;
      border-radius: 4px;
      border-left: 4px solid #dc2626;
    }

    footer {
      text-align: center;
      padding: 20px;
      color: #999;
      margin-top: 40px;
    }`;
}
