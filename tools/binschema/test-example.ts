/**
 * Example test runner
 *
 * Demonstrates running a single test suite
 */

import { uint8TestSuite } from "./src/tests/primitives/uint8.test.js";
import { runTestSuite, printTestResults } from "./src/test-runner/runner.js";

async function main() {
  console.log("Running uint8 test suite...\n");

  const result = await runTestSuite(uint8TestSuite);

  printTestResults([result]);
}

main().catch(console.error);
