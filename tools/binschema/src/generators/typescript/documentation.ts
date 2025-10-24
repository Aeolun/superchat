// ABOUTME: Documentation generation utilities for TypeScript code
// ABOUTME: Handles JSDoc generation, field descriptions, and metadata extraction

import { BinarySchema, Field } from "../../schema/binary-schema.js";
import type { ExtractedMetadata } from "../../schema/extract-metadata.js";
import { DocInput, DocBlock, FIELD_TYPE_METADATA } from "./shared.js";

/**
 * Normalize documentation input to array of non-empty lines
 */
function normalizeDocInput(doc: DocInput): string[] {
  if (!doc) return [];
  const entries = Array.isArray(doc) ? doc : doc.split(/\r?\n/);
  return entries
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Create a simple summary-only doc block
 */
function createSummaryDoc(description: DocInput): DocBlock | undefined {
  const lines = normalizeDocInput(description);
  if (lines.length === 0) return undefined;
  return { summary: lines };
}

/**
 * Add lines to summary, deduplicating
 */
function pushSummary(summary: string[], doc: DocInput, seen: Set<string>): void {
  const lines = normalizeDocInput(doc);
  for (const line of lines) {
    if (seen.has(line)) continue;
    seen.add(line);
    summary.push(line);
  }
}

/**
 * Add lines as a paragraph to remarks, deduplicating
 */
function pushRemarksParagraph(remarks: string[], doc: DocInput, seen: Set<string>): void {
  const lines = normalizeDocInput(doc).filter((line) => {
    if (seen.has(line)) return false;
    seen.add(line);
    return true;
  });

  if (lines.length === 0) return;
  if (remarks.length > 0 && remarks[remarks.length - 1] !== "") {
    remarks.push("");
  }
  remarks.push(...lines);
}

/**
 * Remove leading/trailing blank lines and collapse consecutive blanks
 */
function trimBlankEdges(lines: string[]): void {
  while (lines.length > 0 && lines[0] === "") {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "" && lines[i - 1] === "") {
      lines.splice(i, 1);
      i--;
    }
  }
}

/**
 * Convert extracted metadata to documentation lines
 */
function metadataToDoc(metadata: ExtractedMetadata | undefined): string[] | undefined {
  if (!metadata) return undefined;
  const lines: string[] = [];
  if (metadata.title) {
    lines.push(metadata.title);
  }
  if (metadata.description) {
    lines.push(metadata.description);
  }
  return lines.length > 0 ? lines : undefined;
}

/**
 * Get documentation from field type metadata
 */
function getMetadataDocForType(typeName: string | undefined): string[] | undefined {
  if (!typeName) return undefined;

  const candidates = new Set<string>();
  candidates.add(typeName);
  candidates.add(typeName.toLowerCase());

  const genericMatch = typeName.match(/^([^<]+)</);
  if (genericMatch) {
    const base = genericMatch[1];
    candidates.add(base);
    candidates.add(base.toLowerCase());
  }

  for (const key of candidates) {
    if (!key) continue;
    const metadata = FIELD_TYPE_METADATA.get(key);
    const doc = metadataToDoc(metadata);
    if (doc && doc.length > 0) {
      return doc;
    }
  }

  return undefined;
}

/**
 * Get description from schema type definition
 */
function getSchemaTypeDescription(typeName: string | undefined, schema: BinarySchema): string | undefined {
  if (!typeName) return undefined;
  if (!schema?.types) return undefined;

  const direct = schema.types[typeName];
  if (direct && typeof direct === "object" && "description" in direct) {
    const description = (direct as any).description;
    if (typeof description === "string" && description.trim()) {
      return description.trim();
    }
  }

  const genericMatch = typeName.match(/^([^<]+)<.+>$/);
  if (genericMatch) {
    const templateName = `${genericMatch[1]}<T>`;
    const template = schema.types[templateName];
    if (template && typeof template === "object" && "description" in template) {
      const description = (template as any).description;
      if (typeof description === "string" && description.trim()) {
        return description.trim();
      }
    }
  }

  return undefined;
}

/**
 * Describe array field properties
 */
function describeArrayField(field: any): string[] | undefined {
  if (!field || typeof field !== "object") return undefined;
  const lines: string[] = [];

  if (field.kind) {
    let detail = `Array kind: ${field.kind}`;
    if (field.kind === "field_referenced" && field.length_field) {
      detail += ` (length from '${field.length_field}')`;
    }
    lines.push(detail);
  }

  if (typeof field.length === "number") {
    lines.push(`Fixed length: ${field.length}`);
  }

  if (field.length_type) {
    lines.push(`Length prefix type: ${field.length_type}`);
  }

  if (field.item_length_type) {
    lines.push(`Item length type: ${field.item_length_type}`);
  }

  if (field.length_field && field.kind !== "field_referenced") {
    lines.push(`Length field: ${field.length_field}`);
  }

  return lines.length > 0 ? lines : undefined;
}

/**
 * Describe string field properties
 */
function describeStringField(field: any): string[] | undefined {
  if (!field || typeof field !== "object") return undefined;
  const lines: string[] = [];

  if (field.kind) {
    lines.push(`String kind: ${field.kind}`);
  }

  if (field.encoding) {
    lines.push(`Encoding: ${field.encoding}`);
  }

  if (typeof field.length === "number") {
    lines.push(`Fixed length: ${field.length}`);
  }

  if (field.length_type) {
    lines.push(`Length prefix type: ${field.length_type}`);
  }

  return lines.length > 0 ? lines : undefined;
}

/**
 * Describe discriminated union field properties
 */
function describeDiscriminatedUnion(field: any): string[] | undefined {
  if (!field || typeof field !== "object") return undefined;
  const lines: string[] = [];

  const discriminator = field.discriminator;
  if (discriminator?.field) {
    lines.push(`Discriminator: field '${discriminator.field}'`);
  } else if (discriminator?.peek) {
    const endianness = discriminator.endianness ? `, ${discriminator.endianness}` : "";
    lines.push(`Discriminator: peek ${discriminator.peek}${endianness}`);
  }

  if (Array.isArray(field.variants)) {
    lines.push(`Variants: ${field.variants.length}`);
    for (const variant of field.variants) {
      if (!variant) continue;
      let entry = `- ${variant.type ?? "unknown"}`;
      if (variant.when) {
        entry += ` (when ${variant.when})`;
      }
      if (variant.description) {
        entry += ` - ${variant.description}`;
      }
      lines.push(entry);
    }
  }

  return lines.length > 0 ? lines : undefined;
}

/**
 * Describe back reference field properties
 */
function describeBackReference(field: any): string[] | undefined {
  if (!field || typeof field !== "object") return undefined;
  const lines: string[] = [];

  if (field.storage) {
    lines.push(`Storage type: ${field.storage}`);
  }

  if (field.offset_mask) {
    lines.push(`Offset mask: ${field.offset_mask}`);
  }

  if (field.offset_from) {
    lines.push(`Offset from: ${field.offset_from}`);
  }

  if (field.target_type) {
    lines.push(`Target type: ${field.target_type}`);
  }

  return lines.length > 0 ? lines : undefined;
}

/**
 * Describe bitfield properties
 */
function describeBitfield(field: any): string[] | undefined {
  if (!field || typeof field !== "object") return undefined;
  const lines: string[] = [];

  if (typeof field.size === "number") {
    lines.push(`Total size: ${field.size} bits`);
  }

  if (Array.isArray(field.fields)) {
    const names = field.fields.map((f: any) => f?.name).filter(Boolean);
    if (names.length > 0) {
      lines.push(`Bitfield entries: ${names.join(", ")}`);
    }
  }

  return lines.length > 0 ? lines : undefined;
}

/**
 * Describe element type definition
 */
function describeElementTypeDef(typeDef: any): string[] | undefined {
  if (!typeDef || typeof typeDef !== "object" || !("type" in typeDef)) return undefined;
  switch (typeDef.type) {
    case "array":
      return describeArrayField(typeDef);
    case "string":
      return describeStringField(typeDef);
    case "discriminated_union":
      return describeDiscriminatedUnion(typeDef);
    case "back_reference":
      return describeBackReference(typeDef);
    case "bitfield":
      return describeBitfield(typeDef);
    default:
      return undefined;
  }
}

/**
 * Get comprehensive field documentation
 */
export function getFieldDocumentation(field: Field, schema: BinarySchema): DocBlock | undefined {
  const summary: string[] = [];
  const remarks: string[] = [];
  const seen = new Set<string>();
  const fieldAny = field as any;

  pushSummary(summary, fieldAny?.description, seen);

  if ("type" in field) {
    const typeValue = (field as any).type;
    if (typeof typeValue === "string") {
      pushRemarksParagraph(remarks, getSchemaTypeDescription(typeValue, schema), seen);
      pushRemarksParagraph(remarks, getMetadataDocForType(typeValue), seen);

      switch (typeValue) {
        case "array":
          pushRemarksParagraph(remarks, describeArrayField(fieldAny), seen);
          break;
        case "string":
          pushRemarksParagraph(remarks, describeStringField(fieldAny), seen);
          break;
        case "discriminated_union":
          pushRemarksParagraph(remarks, describeDiscriminatedUnion(fieldAny), seen);
          break;
        case "back_reference":
          pushRemarksParagraph(remarks, describeBackReference(fieldAny), seen);
          break;
        case "bitfield":
          pushRemarksParagraph(remarks, describeBitfield(fieldAny), seen);
          break;
        default:
          break;
      }

      const referencedType = schema.types?.[typeValue];
      if (referencedType && typeof referencedType === "object" && !("sequence" in referencedType)) {
        pushRemarksParagraph(remarks, describeElementTypeDef(referencedType), seen);
      }

      const genericMatch = typeValue.match(/^([^<]+)<.+>$/);
      if (genericMatch) {
        const baseName = genericMatch[1];
        pushRemarksParagraph(remarks, getSchemaTypeDescription(`${baseName}<T>`, schema), seen);
        pushRemarksParagraph(remarks, getSchemaTypeDescription(baseName, schema), seen);
        const template = schema.types?.[`${baseName}<T>`];
        if (template && typeof template === "object" && !("sequence" in template)) {
          pushRemarksParagraph(remarks, describeElementTypeDef(template), seen);
        }
        const baseTypeDef = schema.types?.[baseName];
        if (baseTypeDef && typeof baseTypeDef === "object" && !("sequence" in baseTypeDef)) {
          pushRemarksParagraph(remarks, describeElementTypeDef(baseTypeDef), seen);
        }
        pushRemarksParagraph(remarks, getMetadataDocForType(baseName), seen);
      } else if (typeValue !== typeValue.toLowerCase()) {
        pushRemarksParagraph(remarks, getMetadataDocForType(typeValue.toLowerCase()), seen);
      }
    }
  }

  if (summary.length === 0 && remarks.length > 0) {
    // Promote first paragraph of remarks to summary
    const promoted: string[] = [];
    while (remarks.length > 0) {
      const line = remarks.shift()!;
      if (line === "") break;
      promoted.push(line);
    }
    trimBlankEdges(remarks);
    summary.push(...promoted);
  }

  trimBlankEdges(summary);
  trimBlankEdges(remarks);

  if (summary.length === 0 && remarks.length === 0) {
    return undefined;
  }

  return {
    summary: summary.length > 0 ? summary : undefined,
    remarks: remarks.length > 0 ? remarks : undefined,
  };
}

/**
 * Check if value is a DocBlock
 */
function isDocBlock(value: DocInput | DocBlock | undefined): value is DocBlock {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Generate a formatted JSDoc comment block
 */
export function generateJSDoc(doc: DocInput | DocBlock, indent: string = ""): string {
  let block: DocBlock | undefined;

  if (doc === undefined) {
    return "";
  } else if (isDocBlock(doc)) {
    block = doc;
  } else {
    block = createSummaryDoc(doc);
  }

  if (!block) return "";

  const summary = block.summary ? [...block.summary] : [];
  const remarks = block.remarks ? [...block.remarks] : [];

  trimBlankEdges(summary);
  trimBlankEdges(remarks);

  if (summary.length === 0 && remarks.length === 0) {
    return "";
  }

  const lines: string[] = [];
  lines.push(...summary);

  if (remarks.length > 0) {
    if (lines.length > 0 && lines[lines.length - 1] !== "") {
      lines.push("");
    }
    lines.push("@remarks");
    lines.push("");
    lines.push(...remarks);
  }

  trimBlankEdges(lines);

  if (lines.length === 0) return "";

  const formatted = lines
    .map((line) => (line.length > 0 ? `${indent} * ${line}` : `${indent} *`))
    .join("\n");

  return `${indent}/**\n${formatted}\n${indent} */\n`;
}
