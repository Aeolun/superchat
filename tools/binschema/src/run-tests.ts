/**
 * Comprehensive test runner
 *
 * Runs all test suites and reports results
 */

import { runTestSuite, printTestResults, TestResult } from "./test-runner/runner.js";

// Primitives
import { uint8TestSuite } from "./tests/primitives/uint8.test.js";
import { uint16BigEndianTestSuite, uint16LittleEndianTestSuite } from "./tests/primitives/uint16.test.js";
import { uint32BigEndianTestSuite, uint32LittleEndianTestSuite } from "./tests/primitives/uint32.test.js";
import { uint64BigEndianTestSuite, uint64LittleEndianTestSuite } from "./tests/primitives/uint64.test.js";
import { int8TestSuite, int16BigEndianTestSuite, int32BigEndianTestSuite, int64BigEndianTestSuite } from "./tests/primitives/signed-integers.test.js";
import { float32BigEndianTestSuite, float32LittleEndianTestSuite, float64BigEndianTestSuite } from "./tests/primitives/floats.test.js";

// Bit-level
import { singleBitTestSuite } from "./tests/bit-level/single-bit.test.js";
import { threeBitsTestSuite } from "./tests/bit-level/three-bits.test.js";
import { spanningBytesTestSuite } from "./tests/bit-level/spanning-bytes.test.js";
import { msbFirstTestSuite, lsbFirstTestSuite, bitOrderComparisonTestSuite } from "./tests/bit-level/bit-ordering.test.js";
import { h264NALHeaderTestSuite, bitfield8TestSuite, bitfield16TestSuite, bitfieldLSBFirstTestSuite } from "./tests/bit-level/bitfields.test.js";

// Composite
import { simpleStructTestSuite, mixedFieldsStructTestSuite } from "./tests/composite/simple-struct.test.js";
import { nestedStructTestSuite, deeplyNestedStructTestSuite } from "./tests/composite/nested-struct.test.js";
import { optionalUint64TestSuite, optionalWithBitFlagTestSuite, multipleOptionalsTestSuite } from "./tests/composite/optional.test.js";
import { fixedArrayTestSuite, lengthPrefixedArrayTestSuite, lengthPrefixedUint16ArrayTestSuite, nullTerminatedArrayTestSuite } from "./tests/composite/arrays.test.js";
import { fixedArrayOfStructsTestSuite, lengthPrefixedArrayOfStructsTestSuite, nestedArrayOfStructsTestSuite, arrayOfStructsWithOptionalsTestSuite } from "./tests/composite/array-of-structs.test.js";
import { mixedEndiannessTestSuite, cursedMixedEndiannessTestSuite, littleEndianWithBigOverrideTestSuite, floatEndiannessOverrideTestSuite } from "./tests/composite/endianness-overrides.test.js";
import { stringTestSuite, shortStringTestSuite, cStringTestSuite, multipleStringsTestSuite } from "./tests/composite/strings.test.js";
import { conditionalFieldTestSuite, versionConditionalTestSuite, multipleConditionalsTestSuite } from "./tests/composite/conditionals.test.js";

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let filter: string | null = null;

  for (const arg of args) {
    if (arg.startsWith("--filter=")) {
      filter = arg.substring("--filter=".length);
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node dist/run-tests.js [options]");
      console.log("");
      console.log("Options:");
      console.log("  --filter=<pattern>  Only run tests with names containing <pattern>");
      console.log("  --help, -h          Show this help message");
      console.log("");
      console.log("Examples:");
      console.log("  node dist/run-tests.js                    # Run all tests");
      console.log("  node dist/run-tests.js --filter=optional  # Run tests with 'optional' in name");
      console.log("  node dist/run-tests.js --filter=uint8     # Run only uint8 tests");
      process.exit(0);
    }
  }

  console.log("=".repeat(80));
  console.log("Running BinSchema Test Suite");
  if (filter) {
    console.log(`Filter: "${filter}"`);
  }
  console.log("=".repeat(80));

  const results: TestResult[] = [];

  // Group tests by category
  const testGroups = [
    {
      name: "Primitives - Unsigned Integers",
      suites: [uint8TestSuite, uint16BigEndianTestSuite, uint16LittleEndianTestSuite, uint32BigEndianTestSuite, uint32LittleEndianTestSuite, uint64BigEndianTestSuite, uint64LittleEndianTestSuite],
    },
    {
      name: "Primitives - Signed Integers",
      suites: [int8TestSuite, int16BigEndianTestSuite, int32BigEndianTestSuite, int64BigEndianTestSuite],
    },
    {
      name: "Primitives - Floats",
      suites: [float32BigEndianTestSuite, float32LittleEndianTestSuite, float64BigEndianTestSuite],
    },
    {
      name: "Bit-level Operations",
      suites: [singleBitTestSuite, threeBitsTestSuite, spanningBytesTestSuite, msbFirstTestSuite, lsbFirstTestSuite, bitOrderComparisonTestSuite],
    },
    {
      name: "Bitfields",
      suites: [h264NALHeaderTestSuite, bitfield8TestSuite, bitfield16TestSuite, bitfieldLSBFirstTestSuite],
    },
    {
      name: "Composite - Structs",
      suites: [simpleStructTestSuite, mixedFieldsStructTestSuite, nestedStructTestSuite, deeplyNestedStructTestSuite],
    },
    {
      name: "Composite - Optionals",
      suites: [optionalUint64TestSuite, optionalWithBitFlagTestSuite, multipleOptionalsTestSuite],
    },
    {
      name: "Composite - Arrays",
      suites: [fixedArrayTestSuite, lengthPrefixedArrayTestSuite, lengthPrefixedUint16ArrayTestSuite, nullTerminatedArrayTestSuite],
    },
    {
      name: "Composite - Arrays of Structs",
      suites: [fixedArrayOfStructsTestSuite, lengthPrefixedArrayOfStructsTestSuite, nestedArrayOfStructsTestSuite, arrayOfStructsWithOptionalsTestSuite],
    },
    {
      name: "Composite - Endianness Overrides",
      suites: [mixedEndiannessTestSuite, cursedMixedEndiannessTestSuite, littleEndianWithBigOverrideTestSuite, floatEndiannessOverrideTestSuite],
    },
    {
      name: "Composite - Strings",
      suites: [stringTestSuite, shortStringTestSuite, cStringTestSuite, multipleStringsTestSuite],
    },
    {
      name: "Composite - Conditionals",
      suites: [conditionalFieldTestSuite, versionConditionalTestSuite, multipleConditionalsTestSuite],
    },
  ];

  // Filter test groups and suites
  let totalSuites = 0;
  let filteredSuites = 0;

  for (const group of testGroups) {
    // Filter suites within this group
    const filteredGroupSuites = filter
      ? group.suites.filter(suite => suite.name.toLowerCase().includes(filter.toLowerCase()))
      : group.suites;

    totalSuites += group.suites.length;
    filteredSuites += filteredGroupSuites.length;

    // Skip empty groups
    if (filteredGroupSuites.length === 0) continue;

    console.log(`\n${"━".repeat(80)}`);
    console.log(`📦 ${group.name}`);
    console.log(`${"━".repeat(80)}`);

    for (const suite of filteredGroupSuites) {
      const result = await runTestSuite(suite);
      results.push(result);
    }
  }

  // Show filter summary
  if (filter && filteredSuites === 0) {
    console.log(`\n⚠️  No tests matched filter: "${filter}"`);
    console.log(`Total available test suites: ${totalSuites}`);
    process.exit(0);
  } else if (filter) {
    console.log(`\nℹ️  Ran ${filteredSuites} of ${totalSuites} test suites (filtered)`);
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log("Final Results");
  console.log("=".repeat(80));

  printTestResults(results);

  // Exit with error code if any tests failed
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
