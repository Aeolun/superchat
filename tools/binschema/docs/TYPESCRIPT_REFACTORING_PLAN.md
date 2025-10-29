# TypeScript Generator Refactoring Plan

## Overview

The `typescript.ts` file started at 4,055 lines. This document outlines the plan to split it into manageable, cohesive modules.

**Current status**: Reduced to ~2,611 lines (35% reduction) after completing Phases 1, 2a-2e.

**Completed modules**:
- ✅ runtime-helpers.ts (~150 lines)
- ✅ bitfield-support.ts (~200 lines)
- ✅ computed-fields.ts (~220 lines)
- ✅ back-references.ts (~290 lines)
- ✅ string-support.ts (~370 lines)
- ✅ array-support.ts (~560 lines)

**Total extracted**: ~1,790 lines across 6 modules

## Progress

### ✅ Phase 1: Runtime Helpers (COMPLETE)
**File**: `src/generators/typescript/runtime-helpers.ts` (~150 lines)

**Extracted functions**:
- `generateRuntimeHelpers()` - Generates `__bs_get`, `__bs_numeric`, `__bs_literal`, `__bs_checkCondition`

**Status**: Complete. Tests passing (479 passed, 16 failed - no regressions).

---

### ✅ Phase 2a: Bitfield Support (COMPLETE)
**File**: `src/generators/typescript/bitfield-support.ts` (~200 lines)

**Extracted functions**:
- `generateEncodeBitfield(field, valuePath, indent)`
- `generateDecodeBitfield(field, fieldName, indent, getTargetPath)` - Note: requires `getTargetPath` function
- `generateFunctionalEncodeBitfield(field, valuePath, indent)`
- `generateFunctionalDecodeBitfield(field, fieldName, indent)`

**Call sites**:
- Line ~2268: `generateEncodeBitfield` (case "bitfield" in encode)
- Line ~3142: `generateDecodeBitfield` (case "bitfield" in decode) - **Updated to pass `getTargetPath`**
- Line ~733: `generateFunctionalEncodeBitfield` (functional style)
- Line ~967: `generateFunctionalDecodeBitfield` (functional style)

**Status**: Complete. Tests passing (479 passed, 16 failed - no regressions).

---

### ✅ Phase 2b: Computed Fields (COMPLETE)
**File**: `src/generators/typescript/computed-fields.ts` (~220 lines)

**Extracted functions**:
- `generateEncodeComputedField(field, schema, globalEndianness, indent, currentItemVar?)`
- `resolveComputedFieldPath(target)`
- `parseSameIndexTarget(target)`
- `detectSameIndexTracking(field, schema)`

**Status**: Complete. Tests passing (479 passed, 16 failed - no regressions).

---

### 🔲 Phase 2c: Back References (TODO)
**File**: `src/generators/typescript/back-references.ts` (~250 lines)

**Functions to extract**:
- `generateEncodeBackReference(field, schema, globalEndianness, valuePath, indent)` - Find with: `grep -n "^function generateEncodeBackReference"`
- `generateDecodeBackReference(field, schema, globalEndianness, fieldName, indent)` - Find with: `grep -n "^function generateDecodeBackReference"`
- `generateInlinedBackReferenceDecoder(...)` - Find with: `grep -n "^function generateInlinedBackReferenceDecoder"`
- `resolveBackReferenceType(typeRef, schema)` - Find with: `grep -n "^function resolveBackReferenceType"`

**Call sites**: Find with:
```bash
grep -n "generateEncodeBackReference\|generateDecodeBackReference" typescript.ts | grep -v "^[0-9]*:function"
```

**Dependencies**: `shared.ts`, `type-utils.ts`

---

### 🔲 Phase 2d: String Support (TODO)
**File**: `src/generators/typescript/string-support.ts` (~350 lines)

**Functions to extract**:
- `generateEncodeString(field, globalEndianness, valuePath, indent)` - Handles fixed, prefixed, null_terminated, zero_padded
- `generateDecodeString(field, globalEndianness, fieldName, indent, addTraceLogs)` - All string kinds
- `generateFunctionalEncodeString(...)` - Functional style
- `generateFunctionalDecodeString(...)` - Functional style

**Find functions**:
```bash
grep -n "^function.*String" typescript.ts
```

**Dependencies**: `shared.ts`, `type-utils.ts`, `runtime-helpers.ts`

---

### ✅ Phase 2e: Array Support (COMPLETE)
**File**: `src/generators/typescript/array-support.ts` (~560 lines)

**Extracted functions**:
- `generateEncodeArray(field, schema, globalEndianness, valuePath, indent, generateEncodeFieldCoreImpl)` - Class-based encoder
- `generateDecodeArray(field, schema, globalEndianness, fieldName, indent, addTraceLogs, getTargetPath, generateDecodeFieldCore)` - Class-based decoder
- `generateFunctionalEncodeArray(...)` - Functional style encoder
- `generateFunctionalDecodeArray(..., getElementTypeScriptType, generateDecodeChoice, generateDecodeDiscriminatedUnionInline)` - Functional style decoder
- `getItemSize(itemDef, schema, globalEndianness)` - Utility for length_prefixed_items

**Call sites**:
- Line ~1790: `generateEncodeArray` (case "array" in encode) - Updated to pass `generateEncodeFieldCoreImpl`
- Line ~2520: `generateDecodeArray` (case "array" in decode) - Updated to pass `getTargetPath`, `generateDecodeFieldCore`
- Line ~210: `generateFunctionalEncodeArray` (functional type alias encoder) - No changes needed
- Line ~292: `generateFunctionalDecodeArray` (functional type alias decoder) - Updated to pass `getElementTypeScriptType`, `generateDecodeChoice`, `generateDecodeDiscriminatedUnionInline`
- Line ~620: `generateFunctionalEncodeArray` (functional field encoder) - No changes needed
- Line ~783: `generateFunctionalDecodeArray` (functional field decoder) - Updated to pass helper functions

**Status**: Complete. Tests passing (479 passed, 16 failed - no regressions).

---

### ⏸️ Phase 2f: Union Support (POSTPONED)
**File**: `src/generators/typescript/union-support.ts` (~2,000 lines - much larger than estimated!)

**Note**: This phase is postponed due to size. The union support functions are approximately ~2,000 lines (not ~400 as estimated), making this a complex extraction that should be handled separately or split into multiple modules.

**Functions to extract** (7 functions total):

**Class-based encoding/decoding**:
- `generateEncodeChoice(...)` - Line 1688, ~41 lines
- `generateDecodeChoice(...)` - Line 1729, ~58 lines
- `generateEncodeDiscriminatedUnion(...)` - Line 1787, ~421 lines (very large!)
- `generateDecodeDiscriminatedUnion(...)` - Line 2208, ~792 lines (very large!)

**Functional-style encoding/decoding**:
- `generateFunctionalDiscriminatedUnion(...)` - Line 469, ~193 lines
- `generateFunctionalEncodeDiscriminatedUnionField(...)` - Line 662, ~94 lines
- `generateFunctionalDecodeDiscriminatedUnionField(...)` - Line 756, ~373 lines

**Potential approach**: Split into choice-support.ts (~100 lines) and discriminated-union-support.ts (~1,900 lines), or extract incrementally.

**Dependencies**: `shared.ts`, `type-utils.ts`, `runtime-helpers.ts`, `documentation.ts`, `getTargetPath`, `generateEncodeTypeReference`, `generateDecodeFieldCore`, `capitalize`

---

### 🔲 Phase 3: Type Generation (TODO)
**File**: `src/generators/typescript/type-generation.ts` (~400 lines)

**Functions to extract**:
- `generateInterface(typeName, typeDef, schema)` - Interface generation
- `generateTypeCode(...)` - Main type orchestrator
- `generateTypeAliasCode(...)` - Type alias generation
- `generateChoiceType(choiceDef, schema)` - Lines ~1553-1565
- `generateDiscriminatedUnionType(unionDef, schema)` - Union type generation
- `generateDiscriminatedUnionEnum(...)` - Enum generation
- `generateDiscriminatedUnionEnumsForFields(...)` - Field-level enums
- `getFieldTypeScriptType(field, schema)` - Field type resolution
- `getElementTypeScriptType(element, schema)` - Element type resolution
- `resolveTypeReference(typeRef, schema)` - Type reference resolution
- `generateInstanceClass(...)` - Instance class for lazy fields
- `generateFieldAccessPath(...)` - Field access paths

**Dependencies**: `shared.ts`, `type-utils.ts`, `documentation.ts`

---

### 🔲 Phase 4: Encoder/Decoder Orchestrators (TODO)

#### Phase 4a: Encoder Generation
**File**: `src/generators/typescript/encoder-generation.ts` (~800 lines)

**Functions to extract**:
- `generateEncoder(typeName, typeDef, schema, globalEndianness, globalBitOrder)` - Main encoder class
- `generateTypeAliasEncoder(...)` - Type alias encoders
- `generateEncodeField(field, schema, globalEndianness, indent)` - Field encoding dispatcher
- `generateEncodeFieldCore(field, schema, globalEndianness, valuePath, indent)` - Core field encoding
- `generateEncodeFieldCoreImpl(field, schema, globalEndianness, valuePath, indent)` - Implementation
- `generateEncodeTypeReference(typeRef, schema, globalEndianness, valuePath, indent)` - Type reference encoding
- `generateEncodeOptional(field, schema, globalEndianness, valuePath, indent)` - Optional field encoding
- `isFieldConditional(field)` - Conditional detection
- `convertConditionalToTypeScript(condition, basePath)` - Conditional conversion

**Dependencies**: ALL feature modules (computed-fields, union-support, array-support, string-support, bitfield-support, back-references)

#### Phase 4b: Decoder Generation
**File**: `src/generators/typescript/decoder-generation.ts` (~900 lines)

**Functions to extract**:
- `generateDecoder(typeName, typeDef, schema, globalEndianness, globalBitOrder, addTraceLogs)` - Main decoder class
- `generateDecoderWithLazyFields(...)` - Decoder with lazy evaluation
- `generateTypeAliasDecoder(...)` - Type alias decoders
- `generateDecodeField(field, schema, globalEndianness, indent, addTraceLogs)` - Field decoding dispatcher
- `generateDecodeFieldCore(field, schema, globalEndianness, fieldName, indent, addTraceLogs)` - Core decoding
- `generateDecodeFieldCoreImpl(field, schema, globalEndianness, fieldName, indent, addTraceLogs)` - Implementation
- `generateDecodeTypeReference(typeRef, schema, globalEndianness, fieldName, indent)` - Type reference decoding
- `generateDecodeOptional(field, schema, globalEndianness, fieldName, indent)` - Optional field decoding
- `generateDecodeValueField(...)` - Value field decoding (for back references)
- `capitalize(str)` - String capitalization
- `getTargetPath(fieldName)` - Target path generation
- `getItemSize(field, schema, globalEndianness)` - Item size calculation

**Dependencies**: ALL feature modules

---

### 🔲 Phase 5: Functional Style (TODO)
**File**: `src/generators/typescript/functional-style.ts` (~600 lines)

**Functions to extract**:
- `generateTypeScriptCode(schema)` - Main functional generator entry point (EXPERIMENTAL)
- `generateFunctionalTypeCode(...)` - Functional type generator
- All remaining `generateFunctional*()` functions

**⚠️ IMPORTANT**: This generator is **INCOMPLETE and NOT USED in production**. Mark with clear warnings.

**Dependencies**: All feature modules

---

### 🔲 Phase 6: Create Facade (TODO)
**File**: `src/generators/typescript/index.ts` (~100 lines)

**Purpose**: Clean public API entry point

**Contents**:
```typescript
// Re-export public API
export { GeneratedCode } from "./shared.js";
export type { GenerateTypeScriptOptions } from "./encoder-generation.js";

// Main generators
export { generateTypeScript } from "../typescript.js"; // Main class-based generator (PRODUCTION)
export { generateTypeScriptCode } from "./functional-style.js"; // Functional generator (EXPERIMENTAL)
```

**Update**: Modify main `typescript.ts` to re-export from `typescript/index.js`:
```typescript
export * from "./typescript/index.js";
```

---

## Validation Strategy

### After Each Phase:
```bash
npm test  # Must show: 479 passed, 16 failed
```

### Final Validation:
```bash
# Run full test suite
npm test

# Check file sizes
wc -l src/generators/typescript.ts src/generators/typescript/*.ts

# Verify no regressions
git diff --stat
```

---

## Dependency Graph

```
Level 0: shared.ts ✅
Level 1: type-utils.ts ✅, documentation.ts ✅
Level 2: runtime-helpers.ts ✅, bitfield-support.ts ✅, computed-fields.ts ✅
Level 3: array-support.ts ✅, string-support.ts ✅, back-references.ts ✅, union-support.ts
Level 4: type-generation.ts, encoder-generation.ts, decoder-generation.ts
Level 5: functional-style.ts
Level 6: index.ts (facade)
```

---

## Quick Reference Commands

### Find functions to extract:
```bash
# Find all function definitions
grep -n "^function generate" typescript.ts

# Find specific feature functions
grep -n "^function.*Bitfield" typescript.ts
grep -n "^function.*String" typescript.ts
grep -n "^function.*Array" typescript.ts
grep -n "^function.*Union\|Choice" typescript.ts
grep -n "^function.*BackReference" typescript.ts
grep -n "^function.*Computed" typescript.ts
```

### Find call sites:
```bash
# Find where a function is called (excluding its definition)
grep -n "functionName" typescript.ts | grep -v "^[0-9]*:function"
```

### Check test status:
```bash
npm test 2>&1 | grep "^Total:"
```

---

## Expected Final Structure

```
src/generators/typescript/
├── shared.ts (63 lines) ✅
├── type-utils.ts (91 lines) ✅
├── documentation.ts (451 lines) ✅
├── runtime-helpers.ts (150 lines) ✅
├── bitfield-support.ts (200 lines) ✅
├── computed-fields.ts (300 lines) 🔲
├── back-references.ts (250 lines) 🔲
├── string-support.ts (350 lines) 🔲
├── array-support.ts (500 lines) 🔲
├── union-support.ts (400 lines) 🔲
├── type-generation.ts (400 lines) 🔲
├── encoder-generation.ts (800 lines) 🔲
├── decoder-generation.ts (900 lines) 🔲
├── functional-style.ts (600 lines) 🔲
└── index.ts (100 lines) 🔲
```

**Total**: ~4,900 lines (accounting for some duplication)
**Main typescript.ts**: Should reduce to ~200-300 lines (imports + re-exports)

---

## Notes

- Always work backwards (delete bottom functions first to keep line numbers stable)
- Run tests after each phase
- The `getTargetPath` function is used by many decoders - keep it in main file or move to shared utilities
- Same-index position tracking logic in arrays was recently added - be careful when extracting
- Functional style generator is incomplete - mark clearly as experimental

---

## Completion Checklist

- [x] Phase 1: Runtime helpers
- [x] Phase 2a: Bitfield support
- [x] Phase 2b: Computed fields
- [x] Phase 2c: Back references
- [x] Phase 2d: String support
- [x] Phase 2e: Array support
- [ ] Phase 2f: Union support
- [ ] Phase 3: Type generation
- [ ] Phase 4a: Encoder generation
- [ ] Phase 4b: Decoder generation
- [ ] Phase 5: Functional style
- [ ] Phase 6: Create facade
- [ ] Final validation (all tests pass, no regressions)
