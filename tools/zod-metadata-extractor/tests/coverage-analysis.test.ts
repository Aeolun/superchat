// ABOUTME: Comprehensive test of all Zod types to identify coverage gaps
// ABOUTME: Tests both basic extraction and recursive/nested scenarios

import { describe, test, expect } from "bun:test";
import { z } from "zod";
import { extractMetadata, extractFields, extractUnionOptions } from "../src/extract.js";

describe("Zod Type Coverage Analysis", () => {
  describe("Primitives", () => {
    test("string", () => {
      const schema = z.object({ value: z.string() });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("string");
    });

    test("number", () => {
      const schema = z.object({ value: z.number() });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("number");
    });

    test("bigint", () => {
      const schema = z.object({ value: z.bigint() });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("bigint");
    });

    test("boolean", () => {
      const schema = z.object({ value: z.boolean() });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("boolean");
    });

    test("date", () => {
      const schema = z.object({ value: z.date() });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("date");
    });

    test("undefined", () => {
      const schema = z.object({ value: z.undefined() });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("undefined");
    });

    test("null", () => {
      const schema = z.object({ value: z.null() });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("null");
    });

    test("symbol", () => {
      const schema = z.object({ value: z.symbol() });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("symbol");
    });

    test("void", () => {
      const schema = z.object({ value: z.void() });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("void");
    });
  });

  describe("Special Types", () => {
    test("any", () => {
      const schema = z.object({ value: z.any() });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("any");
    });

    test("unknown", () => {
      const schema = z.object({ value: z.unknown() });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("unknown");
    });

    test("never", () => {
      const schema = z.object({ value: z.never() });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("never");
    });
  });

  describe("Complex Types", () => {
    test("array", () => {
      const schema = z.object({ items: z.array(z.string()) });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("array");
    });

    test("tuple", () => {
      const schema = z.object({ pair: z.tuple([z.string(), z.number()]) });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("tuple");
    });

    test("record", () => {
      const schema = z.object({ dict: z.record(z.string()) });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("record");
    });

    test("map", () => {
      const schema = z.object({ mapping: z.map(z.string(), z.number()) });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("map");
    });

    test("set", () => {
      const schema = z.object({ unique: z.set(z.string()) });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("set");
    });

    test("promise", () => {
      const schema = z.object({ async: z.promise(z.string()) });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("promise");
    });

    test("function", () => {
      const schema = z.object({
        fn: z.function()
          .args(z.string())
          .returns(z.number())
      });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("function");
    });
  });

  describe("Literal and Enum", () => {
    test("literal - already supported", () => {
      const schema = z.object({ type: z.literal("test") });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe('literal "test"');
    });

    test("enum - already supported", () => {
      const schema = z.object({ role: z.enum(["admin", "user"]) });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe('enum ("admin" | "user")');
    });

    test("nativeEnum", () => {
      enum Status { Active, Inactive }
      const schema = z.object({ status: z.nativeEnum(Status) });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("nativeEnum");
    });
  });

  describe("Union Types", () => {
    test("union - already supported", () => {
      const schema = z.object({
        value: z.union([z.string(), z.number()])
      });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("union");
    });

    test("discriminatedUnion", () => {
      const schema = z.object({
        event: z.discriminatedUnion("type", [
          z.object({ type: z.literal("click"), x: z.number() }),
          z.object({ type: z.literal("keypress"), key: z.string() }),
        ])
      });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("discriminatedUnion");
    });
  });

  describe("Intersection and Optional/Nullable", () => {
    test("intersection", () => {
      const Base = z.object({ id: z.number() });
      const Extended = z.object({ name: z.string() });
      const schema = z.object({
        combined: z.intersection(Base, Extended)
      });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("intersection");
    });

    test("optional - already supported", () => {
      const schema = z.object({ value: z.string().optional() });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("string");
      expect(fields![0].required).toBe(false);
    });

    test("nullable", () => {
      const schema = z.object({ value: z.string().nullable() });
      const fields = extractFields(schema);
      // Should handle nullable
      expect(fields).toBeDefined();
    });

    test("nullish (nullable + optional)", () => {
      const schema = z.object({ value: z.string().nullish() });
      const fields = extractFields(schema);
      expect(fields).toBeDefined();
    });
  });

  describe("Transformations and Refinements", () => {
    test("default", () => {
      const schema = z.object({
        value: z.string().default("hello")
      });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("default");
    });

    test("catch (with fallback)", () => {
      const schema = z.object({
        value: z.string().catch("fallback")
      });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("catch");
    });

    test("transform", () => {
      const schema = z.object({
        value: z.string().transform(s => s.length)
      });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("transform");
    });

    test("preprocess", () => {
      const schema = z.object({
        value: z.preprocess(
          (val) => String(val),
          z.string()
        )
      });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("preprocess");
    });

    test("refine (with validation)", () => {
      const schema = z.object({
        value: z.string().refine(s => s.length > 5)
      });
      const fields = extractFields(schema);
      // Refine wraps the base type
      expect(fields).toBeDefined();
    });

    test("superRefine", () => {
      const schema = z.object({
        value: z.string().superRefine((val, ctx) => {
          if (val.length < 5) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Too short",
            });
          }
        })
      });
      const fields = extractFields(schema);
      expect(fields).toBeDefined();
    });
  });

  describe("Branded Types", () => {
    test("branded", () => {
      const UserId = z.string().brand<"UserId">();
      const schema = z.object({ id: UserId });
      const fields = extractFields(schema);
      // Brand is a compile-time feature, runtime should show base type
      expect(fields).toBeDefined();
    });
  });

  describe("Lazy and Recursive", () => {
    test("lazy (for recursive types)", () => {
      interface Category {
        name: string;
        subcategories: Category[];
      }

      const CategorySchema: z.ZodType<Category> = z.lazy(() =>
        z.object({
          name: z.string(),
          subcategories: z.array(CategorySchema),
        })
      );

      const schema = z.object({ root: CategorySchema });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("lazy");
    });

    test("recursive (self-referencing)", () => {
      const schema = z.object({
        id: z.string(),
        children: z.lazy(() => z.array(schema)),
      });

      const fields = extractFields(schema);
      expect(fields).toBeDefined();
      expect(fields).toHaveLength(2);
    });
  });

  describe("Pipeline (Zod 4)", () => {
    test("pipe", () => {
      const schema = z.object({
        value: z.string().pipe(z.coerce.number())
      });
      const fields = extractFields(schema);
      expect(fields![0].type).toBe("pipeline");
    });
  });

  describe("Readonly and Effects", () => {
    test("readonly", () => {
      const schema = z.object({
        value: z.string().readonly()
      });
      const fields = extractFields(schema);
      // Readonly is mainly a type modifier
      expect(fields).toBeDefined();
    });

    test("effects (with side effects)", () => {
      const schema = z.object({
        value: z.string().transform(s => {
          console.log("Side effect!");
          return s;
        })
      });
      const fields = extractFields(schema);
      expect(fields).toBeDefined();
    });
  });
});

describe("Nested and Recursive Coverage", () => {
  test("deeply nested objects", () => {
    const schema = z.object({
      level1: z.object({
        level2: z.object({
          level3: z.object({
            value: z.string(),
          }),
        }),
      }),
    });

    const fields = extractFields(schema);
    expect(fields).toBeDefined();
    expect(fields![0].type).toBe("object");
  });

  test("array of unions", () => {
    const schema = z.object({
      items: z.array(
        z.union([
          z.object({ type: z.literal("a"), value: z.string() }),
          z.object({ type: z.literal("b"), count: z.number() }),
        ])
      ),
    });

    const fields = extractFields(schema);
    expect(fields).toBeDefined();
  });

  test("union of arrays", () => {
    const schema = z.object({
      data: z.union([
        z.array(z.string()),
        z.array(z.number()),
      ]),
    });

    const fields = extractFields(schema);
    expect(fields).toBeDefined();
  });

  test("optional array of optional objects", () => {
    const schema = z.object({
      items: z.array(
        z.object({
          id: z.number(),
          name: z.string().optional(),
        })
      ).optional(),
    });

    const fields = extractFields(schema);
    expect(fields).toBeDefined();
    expect(fields![0].required).toBe(false);
  });

  test("record of unions", () => {
    const schema = z.object({
      mappings: z.record(
        z.union([z.string(), z.number()])
      ),
    });

    const fields = extractFields(schema);
    expect(fields).toBeDefined();
  });

  test("map with complex values", () => {
    const schema = z.object({
      cache: z.map(
        z.string(),
        z.object({
          timestamp: z.date(),
          data: z.unknown(),
        })
      ),
    });

    const fields = extractFields(schema);
    expect(fields).toBeDefined();
  });
});
