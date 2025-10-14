# Zod Constraint Extraction

## Current Status

**The zod-metadata-extractor library does NOT currently extract validation constraints.**

We extract:
- Type information (string, number, array, etc.)
- Required/optional status
- Description from `.describe()`
- Custom metadata from `.meta()`

We DON'T extract:
- Min/max values
- Length constraints
- Format constraints (email, url, uuid)
- Pattern/regex constraints
- Numeric constraints (positive, negative, int, finite, multipleOf)

## Constraint Storage in Zod 4

Constraints are stored in the `_def.checks` array. Each check object has a `_zod.def` property with:

### String Constraints

**Min/Max Length:**
```typescript
z.string().min(5).max(100)

// Check structure:
{
  _zod: {
    def: {
      check: "min_length",  // or "max_length"
      minimum: 5,           // or maximum: 100
    }
  }
}
```

**Format Constraints:**
```typescript
z.string().email()
z.string().url()
z.string().uuid()

// Check structure:
{
  _zod: {
    def: {
      check: "string_format",
      format: "email",      // or "url", "uuid"
      pattern: /regex/      // Validation regex
    }
  }
}
```

**Pattern Constraints:**
```typescript
z.string().regex(/^[A-Z]+$/)

// Check structure:
{
  _zod: {
    def: {
      check: "regex",
      pattern: /^[A-Z]+$/
    }
  }
}
```

### Number Constraints

**Min/Max:**
```typescript
z.number().min(0).max(100)

// Check structure:
{
  _zod: {
    def: {
      check: "greater_than",  // or "less_than"
      value: 0,               // or 100
      inclusive: true         // min/max are inclusive
    }
  }
}
```

**Positive/Negative:**
```typescript
z.number().positive()
z.number().negative()

// Check structure:
{
  _zod: {
    def: {
      check: "greater_than",  // or "less_than"
      value: 0,
      inclusive: false        // exclusive (> 0, not >= 0)
    }
  }
}
```

**Integer:**
```typescript
z.number().int()

// Check structure:
{
  _zod: {
    def: {
      check: "number_format",
      format: "safeint"
    }
  }
}
```

**Multiple Of:**
```typescript
z.number().multipleOf(5)

// Check structure:
{
  _zod: {
    def: {
      check: "multiple_of",
      value: 5
    }
  }
}
```

### Array Constraints

**Min/Max/Exact Length:**
```typescript
z.array(z.string()).min(1).max(10).length(5)

// Check structure (same as string min/max):
{
  _zod: {
    def: {
      check: "min_length",  // or "max_length", "exact_length"
      minimum: 1,           // or maximum: 10, value: 5
    }
  }
}
```

**Nonempty:**
```typescript
z.array(z.string()).nonempty()

// Equivalent to .min(1)
{
  _zod: {
    def: {
      check: "min_length",
      minimum: 1
    }
  }
}
```

### Date Constraints

**Min/Max:**
```typescript
z.date().min(new Date("2020-01-01")).max(new Date("2030-12-31"))

// Check structure:
{
  _zod: {
    def: {
      check: "greater_than",  // or "less_than"
      value: Date("2020-01-01T00:00:00.000Z"),
      inclusive: true
    }
  }
}
```

## Example Extraction Code

```typescript
// Access checks array
const schema = z.string().min(5).max(100).email();
const def = (schema as any)._def;
const checks = def.checks || [];

// Extract constraints
const constraints: any[] = [];
for (const check of checks) {
  const checkDef = check._zod?.def;
  if (!checkDef) continue;

  switch (checkDef.check) {
    case "min_length":
      constraints.push({ type: "min_length", value: checkDef.minimum });
      break;
    case "max_length":
      constraints.push({ type: "max_length", value: checkDef.maximum });
      break;
    case "greater_than":
      constraints.push({
        type: checkDef.inclusive ? "min" : "greater_than",
        value: checkDef.value
      });
      break;
    case "less_than":
      constraints.push({
        type: checkDef.inclusive ? "max" : "less_than",
        value: checkDef.value
      });
      break;
    case "string_format":
      constraints.push({
        type: "format",
        format: checkDef.format,
        pattern: checkDef.pattern
      });
      break;
    // ... more cases
  }
}
```

## Should We Add Constraint Extraction?

**Arguments FOR:**
- Useful for documentation generation (show min/max in docs)
- Useful for validation in code generators
- Zod stores all this information - we're throwing it away

**Arguments AGAINST:**
- Adds complexity to the library
- Not all use cases need constraints
- Can be extracted separately if needed

**Recommendation:**
Add constraint extraction as an **optional feature** controlled by `ExtractionOptions`:

```typescript
export interface ExtractionOptions {
  extractConstraints?: boolean;  // Default: false for backward compatibility
}

export interface FieldInfo {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  default?: string;
  constraints?: Constraint[];  // New optional field
}

export interface Constraint {
  type: "min" | "max" | "min_length" | "max_length" | "format" | "pattern" | "multiple_of";
  value?: any;
  format?: string;
  pattern?: RegExp;
}
```

This way:
- Existing users aren't affected (backward compatible)
- New users can opt-in to constraint extraction
- BinSchema can use it for documentation generation
