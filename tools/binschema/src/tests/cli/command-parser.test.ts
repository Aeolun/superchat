import {
  parseCLICommand,
  DocsBuildCommand,
  DocsServeCommand,
  GenerateCommand,
  HelpCommand,
  SupportedLanguage,
} from "../../cli/command-parser";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function expectBuild(argv: string[], expected: DocsBuildCommand): void {
  const result = parseCLICommand(argv);
  assert(result.ok, `Expected success but got error: ${(result as any).error?.message ?? "unknown"}`);
  const command = (result as { ok: true; command: DocsBuildCommand }).command;
  assert(command.type === "docs" && command.mode === "build", "Parsed command is not docs build");
  assert(command.schemaPath === expected.schemaPath, `Expected schema "${expected.schemaPath}" but got "${command.schemaPath}"`);
  assert(command.outputPath === expected.outputPath, `Expected out "${expected.outputPath}" but got "${command.outputPath}"`);
  assert(command.watch === false, "Build command should always disable watch");
}

function expectServe(argv: string[], expected: Partial<DocsServeCommand>): void {
  const result = parseCLICommand(argv);
  assert(result.ok, `Expected success but got error: ${(result as any).error?.message ?? "unknown"}`);
  const command = (result as { ok: true; command: DocsServeCommand }).command;
  assert(command.type === "docs" && command.mode === "serve", "Parsed command is not docs serve");
  if (expected.schemaPath !== undefined) {
    assert(command.schemaPath === expected.schemaPath, `Expected schema "${expected.schemaPath}" but got "${command.schemaPath}"`);
  }
  if (expected.outputPath !== undefined) {
    assert(command.outputPath === expected.outputPath, `Expected out "${expected.outputPath}" but got "${command.outputPath}"`);
  }
  if (expected.port !== undefined) {
    assert(command.port === expected.port, `Expected port ${expected.port} but got ${command.port}`);
  }
  if (expected.watch !== undefined) {
    assert(command.watch === expected.watch, `Expected watch=${expected.watch} but got ${command.watch}`);
  }
  if (expected.open !== undefined) {
    assert(command.open === expected.open, `Expected open=${expected.open} but got ${command.open}`);
  }
}

function expectHelp(argv: string[], expectedPath?: string[]): void {
  const result = parseCLICommand(argv);
  assert(result.ok, `Expected success but got error: ${(result as any).error?.message ?? "unknown"}`);
  const command = (result as { ok: true; command: HelpCommand }).command;
  assert(command.type === "help", "Parsed command is not help");
  if (expectedPath === undefined) {
    assert(!command.path || command.path.length === 0, `Expected root help but got path ${command.path?.join(" ")}`);
    return;
  }
  assert(command.path !== undefined, "Expected help path to be defined");
  assert(
    arraysEqual(command.path, expectedPath),
    `Expected help path "${expectedPath.join(" ")}" but got "${command.path.join(" ")}"`,
  );
}

function expectGenerate(argv: string[], expected: Partial<GenerateCommand>): void {
  const result = parseCLICommand(argv);
  assert(result.ok, `Expected success but got error: ${(result as any).error?.message ?? "unknown"}`);
  const command = (result as { ok: true; command: GenerateCommand }).command;
  assert(command.type === "generate", "Parsed command is not generate");

  if (expected.schemaPath !== undefined) {
    assert(command.schemaPath === expected.schemaPath, `Expected schema "${expected.schemaPath}" but got "${command.schemaPath}"`);
  }

  if (expected.outputDir !== undefined) {
    assert(command.outputDir === expected.outputDir, `Expected out "${expected.outputDir}" but got "${command.outputDir}"`);
  }

  if (expected.language !== undefined) {
    assert(command.language === expected.language, `Expected language "${expected.language}" but got "${command.language}"`);
  }

  if (expected.watch !== undefined) {
    assert(command.watch === expected.watch, `Expected watch=${expected.watch} but got ${command.watch}`);
  }
  if (expected.typeName !== undefined) {
    assert(command.typeName === expected.typeName, `Expected typeName="${expected.typeName}" but got "${command.typeName}"`);
  }
}

function expectError(argv: string[], substring: string): void {
  const result = parseCLICommand(argv);
  assert(!result.ok, "Expected error but parser succeeded");
  assert(result.error.message.includes(substring), `Expected error to include "${substring}" but was "${result.error.message}"`);
}

function arraysEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

export function runCommandParserTests() {
  console.log("\n=== CLI Command Parser Tests ===\n");

  expectBuild(
    ["docs", "build", "--schema", "schema.json", "--out", "docs.html"],
    {
      type: "docs",
      mode: "build",
      schemaPath: "schema.json",
      outputPath: "docs.html",
      watch: false,
    } as DocsBuildCommand,
  );

  expectServe(
    ["docs", "serve", "--schema", "schema.json"],
    { schemaPath: "schema.json", port: 4173, watch: true, open: false },
  );

  expectServe(
    ["docs", "serve", "--schema", "schema.json", "--out", "docs.html", "--port", "5000", "--no-watch", "--open"],
    { schemaPath: "schema.json", outputPath: "docs.html", port: 5000, watch: false, open: true },
  );

  expectBuild(
    ["docs", "--schema", "schema.json", "--out", "docs.html"],
    {
      type: "docs",
      mode: "build",
      schemaPath: "schema.json",
      outputPath: "docs.html",
      watch: false,
    } as DocsBuildCommand,
  );

  expectGenerate(
    ["generate", "--schema=schema.json", "--out", "./gen", "--language", "ts"],
    { schemaPath: "schema.json", outputDir: "./gen", language: "ts" as SupportedLanguage, watch: false },
  );

  expectGenerate(
    ["generate", "--schema", "schema.json", "--out", "./gen", "--language", "rust", "--watch"],
    { schemaPath: "schema.json", outputDir: "./gen", language: "rust", watch: true },
  );

  expectGenerate(
    ["generate", "--schema", "schema.json", "--out", "./gen", "--language", "TypeScript"],
    { schemaPath: "schema.json", outputDir: "./gen", language: "ts", watch: false },
  );

  expectGenerate(
    ["generate", "--schema", "schema.json", "--out", "./gen", "--language", "go", "--type", "Point"],
    { schemaPath: "schema.json", outputDir: "./gen", language: "go", typeName: "Point", watch: false },
  );

  expectHelp(["help"], undefined);
  expectHelp(["help", "docs"], ["docs"]);
  expectHelp(["docs", "--help"], ["docs"]);
  expectHelp(["docs", "serve", "--help"], ["docs", "serve"]);
  expectHelp(["generate", "--help"], ["generate"]);

  expectError([], "No command");
  expectError(["docs"], "Missing required option: --schema <file>");
  expectError(["docs", "build", "--schema", "schema.json"], "Missing required option: --out <file>");
  expectError(["docs", "serve", "--schema", "schema.json", "--port", "not-a-number"], "Invalid number for --port");
  expectError(["generate"], "Missing required option: --schema <file>");
  expectError(["generate", "--schema", "schema.json"], "Missing required option: --out <dir>");
  expectError(["generate", "--schema", "schema.json", "--out", "./gen"], "Missing required option: --language <ts|go|rust>");
  expectError(["generate", "--schema", "schema.json", "--out", "./gen", "--language", "cpp"], "Unsupported language");

  console.log("✓ CLI parser assertions passed");
}

runCommandParserTests();
