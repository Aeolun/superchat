/**
 * Generate HTML documentation from protocol schema
 *
 * Usage: bun run src/generate-docs.ts <protocol-schema.json> <output.html>
 */

import * as fs from 'fs';
import * as path from 'path';
import JSON5 from 'json5';
import { generateHTML } from './generators/html.js';
import { ProtocolSchema, validateProtocolSchema, normalizeProtocolSchemaInPlace } from './schema/protocol-schema.js';
import { BinarySchema } from './schema/binary-schema.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
    console.log('Usage: bun run src/generate-docs.ts <protocol-schema.json> <output.html>');
    console.log('');
    console.log('Example:');
    console.log('  bun run src/generate-docs.ts examples/superchat-protocol.json docs/protocol.html');
    process.exit(0);
  }

  const protocolSchemaPath = args[0];
  const outputPath = args[1];

  // Load protocol schema
  console.log(`Loading protocol schema: ${protocolSchemaPath}`);
  const protocolSchemaRaw = fs.readFileSync(protocolSchemaPath, 'utf-8');
  const protocolSchema = JSON5.parse(protocolSchemaRaw) as ProtocolSchema;

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
