// ABOUTME: Tests for validation constraint extraction from Zod schemas
// ABOUTME: Covers all constraint types: min/max, length, format, pattern, multiple_of

import { describe, test, expect } from "bun:test";
import { z } from "zod";
import { extractFields } from "../src/extract.js";
import type { Constraint } from "../src/types.js";

describe("Constraint Extraction", () => {
  describe("String Constraints", () => {
    test("extracts min_length constraint", () => {
      const schema = z.object({
        value: z.string().min(5),
      });

      const fields = extractFields(schema);
      expect(fields).toBeDefined();
      expect(fields![0].constraints).toEqual([
        { type: "min_length", value: 5 },
      ]);
    });

    test("extracts max_length constraint", () => {
      const schema = z.object({
        value: z.string().max(100),
      });

      const fields = extractFields(schema);
      expect(fields![0].constraints).toEqual([
        { type: "max_length", value: 100 },
      ]);
    });

    test("extracts both min and max length", () => {
      const schema = z.object({
        value: z.string().min(5).max(100),
      });

      const fields = extractFields(schema);
      expect(fields![0].constraints).toEqual([
        { type: "min_length", value: 5 },
        { type: "max_length", value: 100 },
      ]);
    });

    test("extracts exact_length constraint", () => {
      const schema = z.object({
        value: z.string().length(10),
      });

      const fields = extractFields(schema);
      expect(fields![0].constraints).toEqual([
        { type: "exact_length", value: 10 },
      ]);
    });

    test("extracts email format constraint", () => {
      const schema = z.object({
        value: z.string().email(),
      });

      const fields = extractFields(schema);
      expect(fields![0].constraints).toBeDefined();
      expect(fields![0].constraints![0].type).toBe("format");
      expect((fields![0].constraints![0] as any).format).toBe("email");
      expect((fields![0].constraints![0] as any).pattern).toBeInstanceOf(RegExp);
    });

    test("extracts url format constraint", () => {
      const schema = z.object({
        value: z.string().url(),
      });

      const fields = extractFields(schema);
      expect(fields![0].constraints).toBeDefined();
      expect(fields![0].constraints![0].type).toBe("format");
      expect((fields![0].constraints![0] as any).format).toBe("url");
    });

    test("extracts uuid format constraint", () => {
      const schema = z.object({
        value: z.string().uuid(),
      });

      const fields = extractFields(schema);
      expect(fields![0].constraints).toBeDefined();
      expect(fields![0].constraints![0].type).toBe("format");
      expect((fields![0].constraints![0] as any).format).toBe("uuid");
    });

    test("extracts regex pattern constraint", () => {
      const pattern = /^[A-Z]+$/;
      const schema = z.object({
        value: z.string().regex(pattern),
      });

      const fields = extractFields(schema);
      expect(fields![0].constraints).toEqual([
        { type: "pattern", pattern },
      ]);
    });

    test("extracts multiple string constraints", () => {
      const schema = z.object({
        value: z.string().min(5).max(100).email(),
      });

      const fields = extractFields(schema);
      expect(fields![0].constraints).toBeDefined();
      expect(fields![0].constraints!.length).toBe(3);
      expect(fields![0].constraints![0]).toEqual({ type: "min_length", value: 5 });
      expect(fields![0].constraints![1]).toEqual({ type: "max_length", value: 100 });
      expect(fields![0].constraints![2].type).toBe("format");
    });
  });

  describe("Number Constraints", () => {
    test("extracts min constraint (inclusive)", () => {
      const schema = z.object({
        value: z.number().min(0),
      });

      const fields = extractFields(schema);
      expect(fields![0].constraints).toEqual([
        { type: "min", value: 0, inclusive: true },
      ]);
    });

    test("extracts max constraint (inclusive)", () => {
      const schema = z.object({
        value: z.number().max(100),
      });

      const fields = extractFields(schema);
      expect(fields![0].constraints).toEqual([
        { type: "max", value: 100, inclusive: true },
      ]);
    });

    test("extracts both min and max", () => {
      const schema = z.object({
        value: z.number().min(0).max(100),
      });

      const fields = extractFields(schema);
      expect(fields![0].constraints).toEqual([
        { type: "min", value: 0, inclusive: true },
        { type: "max", value: 100, inclusive: true },
      ]);
    });

    test("extracts positive constraint (exclusive)", () => {
      const schema = z.object({
        value: z.number().positive(),
      });

      const fields = extractFields(schema);
      expect(fields![0].constraints).toEqual([
        { type: "greater_than", value: 0, inclusive: false },
      ]);
    });

    test("extracts negative constraint (exclusive)", () => {
      const schema = z.object({
        value: z.number().negative(),
      });

      const fields = extractFields(schema);
      expect(fields![0].constraints).toEqual([
        { type: "less_than", value: 0, inclusive: false },
      ]);
    });

    test("extracts multiple_of constraint", () => {
      const schema = z.object({
        value: z.number().multipleOf(5),
      });

      const fields = extractFields(schema);
      expect(fields![0].constraints).toEqual([
        { type: "multiple_of", value: 5 },
      ]);
    });

    test("extracts multiple number constraints", () => {
      const schema = z.object({
        value: z.number().min(0).max(100).multipleOf(5),
      });

      const fields = extractFields(schema);
      expect(fields![0].constraints).toEqual([
        { type: "min", value: 0, inclusive: true },
        { type: "max", value: 100, inclusive: true },
        { type: "multiple_of", value: 5 },
      ]);
    });
  });

  describe("Array Constraints", () => {
    test("extracts min_length for arrays", () => {
      const schema = z.object({
        items: z.array(z.string()).min(1),
      });

      const fields = extractFields(schema);
      expect(fields![0].constraints).toEqual([
        { type: "min_length", value: 1 },
      ]);
    });

    test("extracts max_length for arrays", () => {
      const schema = z.object({
        items: z.array(z.string()).max(10),
      });

      const fields = extractFields(schema);
      expect(fields![0].constraints).toEqual([
        { type: "max_length", value: 10 },
      ]);
    });

    test("extracts both min and max for arrays", () => {
      const schema = z.object({
        items: z.array(z.string()).min(1).max(10),
      });

      const fields = extractFields(schema);
      expect(fields![0].constraints).toEqual([
        { type: "min_length", value: 1 },
        { type: "max_length", value: 10 },
      ]);
    });

    test("extracts exact_length for arrays", () => {
      const schema = z.object({
        items: z.array(z.string()).length(5),
      });

      const fields = extractFields(schema);
      expect(fields![0].constraints).toEqual([
        { type: "exact_length", value: 5 },
      ]);
    });

    test("extracts nonempty constraint (same as min 1)", () => {
      const schema = z.object({
        items: z.array(z.string()).nonempty(),
      });

      const fields = extractFields(schema);
      expect(fields![0].constraints).toEqual([
        { type: "min_length", value: 1 },
      ]);
    });
  });

  describe("Date Constraints", () => {
    test("extracts min constraint for dates", () => {
      const minDate = new Date("2020-01-01");
      const schema = z.object({
        date: z.date().min(minDate),
      });

      const fields = extractFields(schema);
      expect(fields![0].constraints).toEqual([
        { type: "min", value: minDate, inclusive: true },
      ]);
    });

    test("extracts max constraint for dates", () => {
      const maxDate = new Date("2030-12-31");
      const schema = z.object({
        date: z.date().max(maxDate),
      });

      const fields = extractFields(schema);
      expect(fields![0].constraints).toEqual([
        { type: "max", value: maxDate, inclusive: true },
      ]);
    });

    test("extracts both min and max for dates", () => {
      const minDate = new Date("2020-01-01");
      const maxDate = new Date("2030-12-31");
      const schema = z.object({
        date: z.date().min(minDate).max(maxDate),
      });

      const fields = extractFields(schema);
      expect(fields![0].constraints).toEqual([
        { type: "min", value: minDate, inclusive: true },
        { type: "max", value: maxDate, inclusive: true },
      ]);
    });
  });

  describe("No Constraints", () => {
    test("returns undefined for fields without constraints", () => {
      const schema = z.object({
        value: z.string(),
      });

      const fields = extractFields(schema);
      expect(fields![0].constraints).toBeUndefined();
    });

    test("handles mix of constrained and unconstrained fields", () => {
      const schema = z.object({
        constrained: z.string().min(5),
        unconstrained: z.string(),
        alsoConstrained: z.number().max(100),
      });

      const fields = extractFields(schema);
      expect(fields![0].constraints).toBeDefined();
      expect(fields![1].constraints).toBeUndefined();
      expect(fields![2].constraints).toBeDefined();
    });
  });

  describe("Optional Fields with Constraints", () => {
    test("extracts constraints from optional fields", () => {
      const schema = z.object({
        value: z.string().min(5).max(100).optional(),
      });

      const fields = extractFields(schema);
      expect(fields![0].required).toBe(false);
      expect(fields![0].constraints).toEqual([
        { type: "min_length", value: 5 },
        { type: "max_length", value: 100 },
      ]);
    });

    test("extracts constraints from deeply nested optional", () => {
      const schema = z.object({
        value: z.string().min(5).optional().optional(),
      });

      const fields = extractFields(schema);
      expect(fields![0].required).toBe(false);
      expect(fields![0].constraints).toEqual([
        { type: "min_length", value: 5 },
      ]);
    });
  });
});
