// ABOUTME: Tests for metadata extraction from Zod schemas
// ABOUTME: Covers simple schemas, unions, fields, and edge cases

import { describe, test, expect } from "bun:test";
import { z } from "zod";
import {
  extractMetadata,
  extractFields,
  extractUnionOptions,
  walkUnion,
} from "../src/extract.js";

describe("extractMetadata", () => {
  test("extracts metadata from schema with .meta()", () => {
    const schema = z.string().meta({
      title: "Username",
      description: "User's display name",
      custom: "value",
    });

    const meta = extractMetadata(schema);

    expect(meta).toBeDefined();
    expect(meta?.title).toBe("Username");
    expect(meta?.description).toBe("User's display name");
    expect((meta as any)?.custom).toBe("value");
  });

  test("returns undefined for schema without metadata", () => {
    const schema = z.string();
    const meta = extractMetadata(schema);
    expect(meta).toBeUndefined();
  });

  test("extracts complex metadata with nested objects", () => {
    const schema = z.number().meta({
      title: "Age",
      examples: [18, 25, 42],
      custom_data: {
        nested: { value: 123 },
      },
    });

    const meta = extractMetadata(schema);

    expect(meta).toBeDefined();
    expect(meta?.examples).toEqual([18, 25, 42]);
    expect((meta as any)?.custom_data?.nested?.value).toBe(123);
  });
});

describe("extractFields", () => {
  test("extracts fields from object schema", () => {
    const schema = z.object({
      id: z.number(),
      name: z.string(),
      email: z.string().optional(),
    });

    const fields = extractFields(schema);

    expect(fields).toBeDefined();
    expect(fields).toHaveLength(3);

    expect(fields![0]).toMatchObject({
      name: "id",
      type: "number",
      required: true,
    });

    expect(fields![1]).toMatchObject({
      name: "name",
      type: "string",
      required: true,
    });

    expect(fields![2]).toMatchObject({
      name: "email",
      type: "string",
      required: false,
    });
  });

  test("returns undefined for non-object schemas", () => {
    const stringSchema = z.string();
    const arraySchema = z.array(z.number());

    expect(extractFields(stringSchema)).toBeUndefined();
    expect(extractFields(arraySchema)).toBeUndefined();
  });

  test("extracts field descriptions from .meta()", () => {
    const schema = z.object({
      age: z.number().meta({ description: "User's age in years" }),
      name: z.string(),
    });

    const fields = extractFields(schema, { extractFieldMeta: true });

    expect(fields).toBeDefined();
    expect(fields![0].description).toBe("User's age in years");
    expect(fields![1].description).toBeUndefined();
  });

  test("handles literal types", () => {
    const schema = z.object({
      type: z.literal("user"),
      status: z.literal(42),
    });

    const fields = extractFields(schema);

    expect(fields).toBeDefined();
    expect(fields![0].type).toBe('literal "user"');
    expect(fields![1].type).toBe('literal "42"');
  });

  test("handles enum types (Zod 4)", () => {
    const schema = z.object({
      role: z.enum(["admin", "user", "guest"]),
    });

    const fields = extractFields(schema);

    expect(fields).toBeDefined();
    expect(fields![0].type).toBe('enum ("admin" | "user" | "guest")');
  });
});

describe("extractUnionOptions", () => {
  test("extracts options from a union of objects", () => {
    const schema = z.union([
      z.object({
        type: z.literal("text"),
        content: z.string(),
      }),
      z.object({
        type: z.literal("image"),
        url: z.string(),
        width: z.number().optional(),
      }),
    ]);

    const options = extractUnionOptions(schema);

    expect(options).toBeDefined();
    expect(options).toHaveLength(2);

    // First option (text)
    expect(options![0].fields).toHaveLength(2);
    expect(options![0].fields[0]).toMatchObject({
      name: "type",
      type: 'literal "text"',
      required: true,
    });
    expect(options![0].fields[1]).toMatchObject({
      name: "content",
      type: "string",
      required: true,
    });

    // Second option (image)
    expect(options![1].fields).toHaveLength(3);
    expect(options![1].fields[0]).toMatchObject({
      name: "type",
      type: 'literal "image"',
      required: true,
    });
    expect(options![1].fields[1]).toMatchObject({
      name: "url",
      type: "string",
      required: true,
    });
    expect(options![1].fields[2]).toMatchObject({
      name: "width",
      type: "number",
      required: false,
    });
  });

  test("returns undefined for non-union schemas", () => {
    const schema = z.string();
    const options = extractUnionOptions(schema);
    expect(options).toBeUndefined();
  });

  test("returns undefined for union of primitives", () => {
    const schema = z.union([z.string(), z.number()]);
    const options = extractUnionOptions(schema);
    expect(options).toBeUndefined();
  });
});

describe("walkUnion", () => {
  test("walks union and extracts metadata from each option", () => {
    const schema = z.union([
      z.object({
        type: z.literal("uint8"),
        name: z.string(),
      }).meta({
        title: "8-bit Unsigned Integer",
        description: "Single-byte unsigned integer",
      }),
      z.object({
        type: z.literal("uint16"),
        name: z.string(),
      }).meta({
        title: "16-bit Unsigned Integer",
        description: "Two-byte unsigned integer",
      }),
    ]);

    const result = walkUnion(schema);

    expect(result.hasMetadata).toBe(true);
    expect(result.metadata.size).toBe(2);

    const uint8Meta = result.metadata.get("uint8");
    expect(uint8Meta).toBeDefined();
    expect(uint8Meta?.title).toBe("8-bit Unsigned Integer");
    expect(uint8Meta?.description).toBe("Single-byte unsigned integer");

    const uint16Meta = result.metadata.get("uint16");
    expect(uint16Meta).toBeDefined();
    expect(uint16Meta?.title).toBe("16-bit Unsigned Integer");
  });

  test("enriches metadata with field information", () => {
    const schema = z.union([
      z.object({
        type: z.literal("user"),
        id: z.number(),
        name: z.string(),
      }).meta({
        title: "User",
      }),
    ]);

    const result = walkUnion(schema, { mergeFields: true });

    expect(result.hasMetadata).toBe(true);

    const userMeta = result.metadata.get("user");
    expect(userMeta).toBeDefined();
    expect(userMeta?.fields).toBeDefined();
    expect(userMeta?.fields).toHaveLength(3);
    expect(userMeta?.fields![0].name).toBe("type");
    expect(userMeta?.fields![1].name).toBe("id");
    expect(userMeta?.fields![2].name).toBe("name");
  });

  test("handles union without metadata", () => {
    const schema = z.union([
      z.object({
        type: z.literal("a"),
        value: z.string(),
      }),
      z.object({
        type: z.literal("b"),
        count: z.number(),
      }),
    ]);

    const result = walkUnion(schema);

    expect(result.hasMetadata).toBe(false);
    expect(result.metadata.size).toBe(0);
  });

  test("skips options without discriminator field", () => {
    const schema = z.union([
      z.object({
        // No "type" field
        value: z.string(),
      }).meta({
        title: "No Discriminator",
      }),
    ]);

    const result = walkUnion(schema);

    expect(result.hasMetadata).toBe(false);
    expect(result.metadata.size).toBe(0);
  });

  test("handles union with field descriptions in metadata", () => {
    const schema = z.union([
      z.object({
        type: z.literal("data"),
        value: z.number(),
      }).meta({
        title: "Data",
        fields: [
          { name: "type", type: "literal", required: true, description: "Type discriminator" },
          { name: "value", type: "number", required: true, description: "Numeric value" },
        ],
      }),
    ]);

    const result = walkUnion(schema, { mergeFields: true });

    const dataMeta = result.metadata.get("data");
    expect(dataMeta).toBeDefined();
    expect(dataMeta?.fields).toBeDefined();

    // Descriptions should be merged
    expect(dataMeta?.fields![0].description).toBe("Type discriminator");
    expect(dataMeta?.fields![1].description).toBe("Numeric value");
  });
});

describe("edge cases", () => {
  test("handles empty object schema", () => {
    const schema = z.object({});
    const fields = extractFields(schema);
    expect(fields).toBeUndefined();
  });

  test("handles deeply nested optional", () => {
    const schema = z.object({
      value: z.string().optional().optional(), // Double optional (shouldn't happen but test it)
    });

    const fields = extractFields(schema);
    expect(fields).toBeDefined();
    expect(fields![0].type).toBe("string");
    expect(fields![0].required).toBe(false);
  });

  test("handles union field within object", () => {
    const schema = z.object({
      data: z.union([
        z.object({ kind: z.literal("a"), value: z.string() }),
        z.object({ kind: z.literal("b"), count: z.number() }),
      ]),
    });

    const fields = extractFields(schema, { extractUnions: true });

    expect(fields).toBeDefined();
    expect(fields![0].type).toBe("union");
    expect(fields![0].unionOptions).toBeDefined();
    expect(fields![0].unionOptions).toHaveLength(2);
  });

  test("does not extract union options when disabled", () => {
    const schema = z.object({
      data: z.union([
        z.object({ kind: z.literal("a") }),
        z.object({ kind: z.literal("b") }),
      ]),
    });

    const fields = extractFields(schema, { extractUnions: false });

    expect(fields).toBeDefined();
    expect(fields![0].unionOptions).toBeUndefined();
  });

  test("does not extract field meta when disabled", () => {
    const schema = z.object({
      age: z.number().meta({ description: "User's age" }),
    });

    const fields = extractFields(schema, { extractFieldMeta: false });

    expect(fields).toBeDefined();
    expect(fields![0].description).toBeUndefined();
  });
});
