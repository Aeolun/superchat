/**
 * Runtime helper functions that are injected into generated TypeScript code.
 * These provide safe conditional evaluation and type coercion utilities.
 */

/**
 * Generate runtime helper functions that will be injected into the generated code.
 * These helpers provide safe conditional evaluation and numeric type handling.
 */
export function generateRuntimeHelpers(): string {
  let code = "";

  // Safe conditional evaluation - returns undefined instead of throwing
  code += `function __bs_get<T>(expr: () => T): T | undefined {\n`;
  code += `  try {\n`;
  code += `    return expr();\n`;
  code += `  } catch {\n`;
  code += `    return undefined;\n`;
  code += `  }\n`;
  code += `}\n\n`;

  // Numeric type coercion - converts integers to BigInt
  code += `function __bs_numeric(value: any): any {\n`;
  code += `  if (typeof value === "bigint") {\n`;
  code += `    return value;\n`;
  code += `  }\n`;
  code += `  if (typeof value === "number" && Number.isInteger(value)) {\n`;
  code += `    return BigInt(value);\n`;
  code += `  }\n`;
  code += `  return value;\n`;
  code += `}\n\n`;

  // Literal value handling - converts integer numbers to BigInt
  code += `function __bs_literal(value: number): number | bigint {\n`;
  code += `  if (Number.isInteger(value)) {\n`;
  code += `    return BigInt(value);\n`;
  code += `  }\n`;
  code += `  return value;\n`;
  code += `}\n\n`;

  // Conditional checking - safely evaluates conditions, treating bigint 0 as false
  code += `function __bs_checkCondition(expr: () => any): boolean {\n`;
  code += `  try {\n`;
  code += `    const result = expr();\n`;
  code += `    if (typeof result === "bigint") {\n`;
  code += `      return result !== 0n;\n`;
  code += `    }\n`;
  code += `    return !!result;\n`;
  code += `  } catch {\n`;
  code += `    return false;\n`;
  code += `  }\n`;
  code += `}\n\n`;

  return code;
}
