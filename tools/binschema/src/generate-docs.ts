/**
 * Generate HTML documentation from protocol schema
 *
 * Usage: bun run src/generate-docs.ts <schema.json> <output.html>
 */

import * as fs from 'fs';
import * as path from 'path';
import JSON5 from 'json5';
import { generateHTML } from './generators/html.js';
import { ProtocolSchema, validateProtocolSchema, normalizeProtocolSchemaInPlace } from './schema/protocol-schema.js';
import { BinarySchema, defineBinarySchema } from './schema/binary-schema.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
  console.log('Usage: bun run src/generate-docs.ts <schema.json> <output.html>');
    console.log('');
    console.log('Example:');
  console.log('  bun run src/generate-docs.ts examples/superchat.schema.json docs/protocol.html');
    process.exit(0);
  }

  const protocolSchemaPath = args[0];
  const outputPath = args[1];

  // Load schema file (can be combined or legacy protocol schema)
  console.log(`Loading schema: ${protocolSchemaPath}`);
  const rawSchema = JSON5.parse(fs.readFileSync(protocolSchemaPath, 'utf-8'));

  if (isCombinedSchema(rawSchema)) {
    const binarySchema = defineBinarySchema(rawSchema as BinarySchema);

    if (!binarySchema.protocol) {
      console.error('Error: Combined schema does not contain a protocol definition.');
      process.exit(1);
    }

    const legacyProtocol = convertCombinedProtocolToLegacy(protocolSchemaPath, binarySchema);

    try {
      normalizeProtocolSchemaInPlace(legacyProtocol);
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : 'Failed to normalize protocol message codes');
      process.exit(1);
    }

    console.log('Generating HTML documentation...');
    const html = generateHTML(legacyProtocol, binarySchema);
    fs.writeFileSync(outputPath, html, 'utf-8');
    console.log(`✓ Generated documentation: ${outputPath}`);
    return;
  }

  const protocolSchema = rawSchema as ProtocolSchema;

  // Validate protocol schema
  if (!validateProtocolSchema(protocolSchema)) {
    console.error('Error: Invalid protocol schema format');
    process.exit(1);
  }

  try {
    normalizeProtocolSchemaInPlace(protocolSchema);
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : 'Failed to normalize protocol message codes');
    process.exit(1);
  }

  // Load binary schema (resolve relative to protocol schema file)
  const protocolDir = path.dirname(protocolSchemaPath);
  const typesSchemaPath = path.resolve(protocolDir, protocolSchema.protocol.types_schema);
  console.log(`Loading types schema: ${typesSchemaPath}`);

  const typesSchemaRaw = fs.readFileSync(typesSchemaPath, 'utf-8');
  const binarySchema = JSON5.parse(typesSchemaRaw) as BinarySchema;

  // Generate HTML
  console.log('Generating HTML documentation...');
  const html = generateHTML(protocolSchema, binarySchema);

  // Write output
  fs.writeFileSync(outputPath, html, 'utf-8');
  console.log(`✓ Generated documentation: ${outputPath}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

function isCombinedSchema(value: unknown): value is BinarySchema {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return 'types' in record && 'protocol' in record && typeof record.protocol === 'object' && record.protocol !== null && !('types_schema' in (record.protocol as Record<string, unknown>));
}

function convertCombinedProtocolToLegacy(schemaPath: string, binarySchema: BinarySchema): ProtocolSchema {
  const protocol = binarySchema.protocol;
  if (!protocol) {
    throw new Error('Protocol definition is required to generate documentation');
  }

  const messages = protocol.messages.map((msg) => ({
    code: msg.code,
    name: msg.name,
    direction: msg.direction ?? 'bidirectional',
    payload_type: msg.payload_type,
    description: msg.description ?? '',
    notes: msg.notes,
    example: msg.example,
    since: msg.since,
    deprecated: msg.deprecated,
  }));

  const messageGroups = protocol.message_groups?.map((group) => ({
    name: group.name,
    messages: group.messages,
    description: group.description,
  }));

  return {
    protocol: {
      name: protocol.name,
      version: protocol.version,
      types_schema: `<inline:${path.basename(schemaPath)}>`,
      description: protocol.description,
      header_format: protocol.header,
      header_size_field: protocol.header_size_field,
      header_example: protocol.header_example,
      discriminator_field: protocol.discriminator,
      field_descriptions: protocol.field_descriptions,
      messages,
      message_groups,
      constants: protocol.constants,
      notes: protocol.notes,
    },
  };
}
