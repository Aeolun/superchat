# Constraint Extraction Investigation - Findings

## Summary

**Q: Do we extract validation constraints like min/max/length for strings?**

**A: No, we currently do NOT extract validation constraints.**

## What We Currently Extract

✅ Type information (string, number, array, object, union, etc.)
✅ Required/optional status
✅ Description from `.describe()`
✅ Custom metadata from `.meta()`
✅ Union discriminator values
✅ Enum options
✅ Literal values

## What We DON'T Extract

❌ Min/max length for strings
❌ Min/max values for numbers
❌ Format constraints (email, url, uuid)
❌ Pattern/regex constraints
❌ Numeric constraints (positive, negative, int, multipleOf)
❌ Array length constraints
❌ Date min/max

## Why Not?

**Not implemented yet** - it's technically feasible but adds complexity.

The constraint information IS available in Zod schemas. It's stored in the `_def.checks` array, where each check object has a `_zod.def` property containing the constraint details.

## Example

```typescript
const schema = z.string().min(5).max(100).email();

// We currently extract:
{
  type: "string",
  required: true
}

// We DON'T extract:
{
  constraints: [
    { type: "min_length", value: 5 },
    { type: "max_length", value: 100 },
    { type: "format", format: "email", pattern: /.../ }
  ]
}
```

## Technical Details

Zod 4 stores constraints in a non-enumerable structure:

```typescript
check._zod.def = {
  check: "min_length",  // Constraint type
  minimum: 5,           // Constraint value
  // ... other properties
}
```

See `CONSTRAINTS.md` for complete technical documentation of all constraint types and their structure.

## Recommendation

**Add constraint extraction as an optional feature:**

1. Add `extractConstraints?: boolean` to `ExtractionOptions` (default: false)
2. Add `constraints?: Constraint[]` to `FieldInfo` interface
3. Implement extraction logic for all constraint types
4. Add comprehensive tests
5. Update documentation

This keeps backward compatibility while enabling advanced use cases like:
- Documentation generation with validation rules
- Code generators that need constraint information
- Schema validation/linting tools

## Use Case for BinSchema

BinSchema could use constraint extraction for:
- Showing min/max values in generated documentation
- Validating that binary field sizes match schema constraints
- Generating validation code in target languages

Example:
```typescript
// BinSchema schema with Zod constraints
const MessageSchema = z.object({
  nickname: z.string().min(1).max(32).describe("User nickname"),
  age: z.number().int().min(0).max(255).describe("User age")
});

// Generated docs could show:
// - nickname: string (1-32 chars) - User nickname
// - age: uint8 (0-255) - User age
```

## Next Steps

1. **Decision needed**: Should we implement constraint extraction?
2. **If yes**: Design the API (see recommended approach above)
3. **If no**: Document this limitation so users know to extract constraints separately if needed
