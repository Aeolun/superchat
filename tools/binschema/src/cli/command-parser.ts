/**
 * Structured command parser for the BinSchema CLI.
 *
 * A single source of truth describes every command, subcommand, and option.
 * The parser walks that definition to both validate user input and render help
 * text, reducing the chance of documentation/code drift.
 */

export type CLICommand =
  | HelpCommand
  | DocsBuildCommand
  | DocsServeCommand
  | GenerateCommand;

export interface HelpCommand {
  readonly type: "help";
  readonly path?: string[];
}

interface DocsCommandBase {
  readonly type: "docs";
  readonly schemaPath: string;
  readonly outputPath?: string;
}

export interface DocsBuildCommand extends DocsCommandBase {
  readonly mode: "build";
  readonly watch: false;
}

export interface DocsServeCommand extends DocsCommandBase {
  readonly mode: "serve";
  readonly watch: boolean;
  readonly port: number;
  readonly open: boolean;
}

export type SupportedLanguage = "ts" | "go" | "rust";

export interface GenerateCommand {
  readonly type: "generate";
  readonly language: SupportedLanguage;
  readonly schemaPath: string;
  readonly outputDir: string;
  readonly watch: boolean;
  readonly typeName?: string;
}

export interface CLIParseSuccess {
  readonly ok: true;
  readonly command: CLICommand;
}

export interface CLIParseFailure {
  readonly ok: false;
  readonly error: CLIParseError;
}

export interface CLIParseError {
  readonly message: string;
  readonly details?: string;
}

export type CLIParseResult = CLIParseSuccess | CLIParseFailure;

type OptionType = "string" | "number" | "boolean";

interface OptionSpec {
  readonly name: string;
  readonly key: string;
  readonly type: OptionType;
  readonly description: string;
  readonly required?: boolean;
  readonly defaultValue?: unknown;
  readonly allowNegation?: boolean;
  readonly valueName?: string;
  readonly aliases?: readonly string[];
  readonly transform?: (value: unknown) => unknown;
}

interface CommandSpec {
  readonly name: string;
  readonly description: string;
  readonly usage?: readonly string[];
  readonly options?: readonly OptionSpec[];
  readonly subcommands?: Readonly<Record<string, CommandSpec>>;
  readonly defaultSubcommand?: string;
}

const ROOT_COMMAND: CommandSpec = createRootSpec();

/**
 * Parse the provided argv vector (excluding the node/bun executable).
 */
export function parseCLICommand(argv: readonly string[]): CLIParseResult {
  if (argv.length === 0) {
    return fail("No command provided", formatHelp());
  }

  if (argv.length === 1 && isHelpToken(argv[0])) {
    return okHelp([]);
  }

  if (argv[0] === "help") {
    const topics = argv.slice(1).filter((token) => !token.startsWith("-"));
    const resolveResult = resolveSpec(topics);
    if (!resolveResult.spec) {
      const topicLabel = topics.length > 0 ? topics.join(" ") : "(root)";
      return fail(`Unknown help topic: ${topicLabel}`, formatHelp());
    }
    return okHelp(resolveResult.path);
  }

  const tokens = [...argv];
  const firstToken = tokens.shift()!;
  const firstSpec = ROOT_COMMAND.subcommands?.[firstToken];
  if (!firstSpec) {
    return fail(`Unknown command: ${firstToken}`, formatHelp());
  }

  const path: string[] = [firstToken];
  let spec = firstSpec;

  // Resolve subcommands, respecting defaults where appropriate.
  while (spec.subcommands) {
    if (tokens.length === 0) {
      const defaultName = spec.defaultSubcommand;
      if (!defaultName) break;
      const defaultSpec = spec.subcommands[defaultName];
      if (!defaultSpec) {
        return fail(`Invalid CLI configuration: missing default subcommand '${defaultName}' for ${path.join(" ")}`);
      }
      path.push(defaultName);
      spec = defaultSpec;
      continue;
    }

    const next = tokens[0];

    if (next.startsWith("-")) {
      if (tokens.some(isHelpToken)) {
        return okHelp(path);
      }
      const defaultName = spec.defaultSubcommand;
      if (!defaultName) break;
      const defaultSpec = spec.subcommands[defaultName];
      if (!defaultSpec) {
        return fail(`Invalid CLI configuration: missing default subcommand '${defaultName}' for ${path.join(" ")}`);
      }
      path.push(defaultName);
      spec = defaultSpec;
      continue;
    }

    tokens.shift();
    const subSpec = spec.subcommands[next];
    if (!subSpec) {
      return fail(`Unknown subcommand: ${next}`, formatHelp(path));
    }
    path.push(next);
    spec = subSpec;
  }

  const optionsResult = parseOptions(tokens, spec, path);
  if (!optionsResult.ok) {
    return optionsResult;
  }

  const { values, helpRequested } = optionsResult;
  if (helpRequested) {
    return okHelp(path);
  }

  if (tokens.length > 0) {
    return fail(`Unexpected argument: ${tokens[0]}`, formatHelp(path));
  }

  return buildCommand(path, values);
}

/**
 * Render contextual help for the given command path.
 */
export function formatHelp(path?: readonly string[]): string {
  const resolveResult = resolveSpec(path ?? []);
  if (!resolveResult.spec) {
    const topicLabel = path && path.length > 0 ? path.join(" ") : "(root)";
    return `Unknown help topic: ${topicLabel}`;
  }

  const spec = resolveResult.spec;
  const resolvedPath = resolveResult.path;
  const lines: string[] = [];

  const title = resolvedPath.length > 0 ? `binschema ${resolvedPath.join(" ")}` : "BinSchema CLI";
  lines.push(title, "");

  if (spec.description) {
    lines.push(spec.description, "");
  }

  if (spec.usage && spec.usage.length > 0) {
    lines.push("Usage:");
    for (const usage of spec.usage) {
      lines.push(`  ${usage}`);
    }
    lines.push("");
  }

  if (spec.subcommands && Object.keys(spec.subcommands).length > 0) {
    lines.push("Commands:");
    const entries = Object.entries(spec.subcommands).map(([name, command]) => {
      let label = name;
      if (spec.defaultSubcommand === name) {
        label += " (default)";
      }
      return { label, description: command.description };
    });
    const maxLabel = Math.max(0, ...entries.map((entry) => entry.label.length));
    for (const entry of entries) {
      const padded = entry.label.padEnd(maxLabel + 2, " ");
      lines.push(`  ${padded}${entry.description}`);
    }
    lines.push("");
  }

  if (spec.options && spec.options.length > 0) {
    lines.push("Options:");
    const optionEntries = spec.options.map((option) => {
      const label = formatOptionLabel(option);
      const details: string[] = [];
      if (option.required) {
        details.push("required");
      }
      if (option.defaultValue !== undefined) {
        details.push(`default: ${String(option.defaultValue)}`);
      }
      return {
        label,
        description: option.description + (details.length > 0 ? ` (${details.join(", ")})` : ""),
      };
    });
    const maxOptionLabel = Math.max(0, ...optionEntries.map((entry) => entry.label.length));
    for (const entry of optionEntries) {
      const padded = entry.label.padEnd(maxOptionLabel + 2, " ");
      lines.push(`  ${padded}${entry.description}`);
    }
    lines.push("");
  }

  if (resolvedPath.length === 0) {
    lines.push("Run 'binschema help <command>' for more information on a specific command.");
  } else if (spec.subcommands && Object.keys(spec.subcommands).length > 0) {
    const prefix = `binschema help ${resolvedPath.join(" ")}`;
    lines.push(`Run '${prefix} <subcommand>' for details on a subcommand.`);
  }

  return lines.join("\n").trimEnd();
}

function buildCommand(path: string[], values: Record<string, unknown>): CLIParseResult {
  if (path[0] === "docs") {
    if (path[1] === "build") {
      return ok({
        type: "docs",
        mode: "build",
        schemaPath: values.schemaPath as string,
        outputPath: values.outputPath as string,
        watch: false,
      } satisfies DocsBuildCommand);
    }

    if (path[1] === "serve") {
      return ok({
        type: "docs",
        mode: "serve",
        schemaPath: values.schemaPath as string,
        outputPath: values.outputPath as string | undefined,
        watch: values.watch as boolean,
        port: values.port as number,
        open: values.open as boolean,
      } satisfies DocsServeCommand);
    }
  }

  if (path[0] === "generate") {
    return ok({
      type: "generate",
      language: values.language as SupportedLanguage,
      schemaPath: values.schemaPath as string,
      outputDir: values.outputDir as string,
      watch: values.watch as boolean,
      typeName: values.typeName as string | undefined,
    } satisfies GenerateCommand);
  }

  return fail(`Unsupported command path: ${path.join(" ")}`, formatHelp());
}

type OptionParseResult =
  | CLIParseFailure
  | {
      readonly ok: true;
      readonly values: Record<string, unknown>;
      readonly helpRequested: boolean;
    };

function parseOptions(tokens: string[], spec: CommandSpec, path: string[]): OptionParseResult {
  const options = spec.options ?? [];
  const values: Record<string, unknown> = {};
  let helpRequested = false;

  const optionLookup = new Map<string, OptionSpec>();
  for (const option of options) {
    optionLookup.set(option.name, option);
    if (option.aliases) {
      for (const alias of option.aliases) {
        optionLookup.set(alias, option);
      }
    }
    if (option.defaultValue !== undefined) {
      values[option.key] = option.defaultValue;
    }
  }

  while (tokens.length > 0) {
    const token = tokens[0];
    if (!token.startsWith("-")) {
      return fail(`Unexpected argument: ${token}`, formatHelp(path));
    }

    tokens.shift();

    if (isHelpToken(token)) {
      helpRequested = true;
      continue;
    }

    if (token === "--") {
      break;
    }

    if (token.startsWith("--no-")) {
      const rawName = token.slice("--no-".length);
      const option = optionLookup.get(rawName);
      if (!option || option.type !== "boolean" || !option.allowNegation) {
        return fail(`Unknown option: ${token}`, formatHelp(path));
      }
      values[option.key] = false;
      continue;
    }

    if (!token.startsWith("--")) {
      return fail(`Unknown option: ${token}`, formatHelp(path));
    }

    const [rawName, attached] = token.slice(2).split(/=(.+)/, 2);
    const option = optionLookup.get(rawName);
    if (!option) {
      return fail(`Unknown option: --${rawName}`, formatHelp(path));
    }

    const parsed = parseOptionValue(option, attached, tokens, path);
    if (!parsed.ok) {
      return parsed;
    }

    values[option.key] = parsed.value;
  }

  if (helpRequested) {
    return { ok: true, values, helpRequested };
  }

  for (const option of options) {
    if (option.required && values[option.key] === undefined) {
      const valueLabel = option.valueName ?? inferValueName(option.type);
      return fail(
        `Missing required option: --${option.name} ${valueLabel}`,
        formatHelp(path),
      );
    }
  }

  return { ok: true, values, helpRequested };
}

type ParsedOptionValue =
  | CLIParseFailure
  | {
      readonly ok: true;
      readonly value: unknown;
    };

function parseOptionValue(
  option: OptionSpec,
  attached: string | undefined,
  tokens: string[],
  path: string[],
): ParsedOptionValue {
  switch (option.type) {
    case "boolean": {
      if (attached !== undefined) {
        const bool = parseBoolean(attached);
        if (bool === null) {
          return fail(`Invalid boolean value for --${option.name}: ${attached}`, formatHelp(path));
        }
        return withTransform(option, bool, path);
      }

      if (tokens.length > 0 && !tokens[0].startsWith("-")) {
        const candidate = tokens[0];
        const bool = parseBoolean(candidate);
        if (bool !== null) {
          tokens.shift();
          return withTransform(option, bool, path);
        }
      }

      return withTransform(option, true, path);
    }

    case "number": {
      const valueToken = attached ?? tokens.shift();
      if (valueToken === undefined || valueToken.startsWith("-")) {
        return fail(`Option --${option.name} requires a number`, formatHelp(path));
      }
      const parsed = Number(valueToken);
      if (!Number.isFinite(parsed)) {
        return fail(`Invalid number for --${option.name}: ${valueToken}`, formatHelp(path));
      }
      return withTransform(option, parsed, path);
    }

    case "string": {
      const valueToken = attached ?? tokens.shift();
      if (valueToken === undefined || valueToken.startsWith("-")) {
        const valueLabel = option.valueName ?? "<value>";
        return fail(`Option --${option.name} requires ${valueLabel}`, formatHelp(path));
      }
      return withTransform(option, valueToken, path);
    }
  }
}

function withTransform(option: OptionSpec, value: unknown, path: string[]): ParsedOptionValue {
  if (!option.transform) {
    return { ok: true, value };
  }

  try {
    return { ok: true, value: option.transform(value) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(message, formatHelp(path));
  }
}

function ok(command: CLICommand): CLIParseSuccess {
  return { ok: true, command };
}

function okHelp(path: string[]): CLIParseSuccess {
  return ok({
    type: "help",
    path: path.length > 0 ? [...path] : undefined,
  });
}

function fail(message: string, details?: string): CLIParseFailure {
  return { ok: false, error: { message, details } };
}

function isHelpToken(token: string): boolean {
  return token === "--help" || token === "-h";
}

function parseBoolean(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return null;
}

function inferValueName(type: OptionType): string {
  switch (type) {
    case "number":
      return "<number>";
    case "boolean":
      return "<boolean>";
    case "string":
    default:
      return "<value>";
  }
}

function formatOptionLabel(option: OptionSpec): string {
  const parts: string[] = [];
  if (option.type === "boolean") {
    parts.push(`--${option.name}`);
    if (option.allowNegation) {
      parts.push(`--no-${option.name}`);
    }
  } else {
    const valueName = option.valueName ?? inferValueName(option.type);
    parts.push(`--${option.name} ${valueName}`);
  }
  return parts.join(", ");
}

interface ResolveResult {
  readonly spec: CommandSpec | null;
  readonly path: string[];
}

function resolveSpec(path: readonly string[]): ResolveResult {
  let spec: CommandSpec = ROOT_COMMAND;
  const resolvedPath: string[] = [];

  for (const segment of path) {
    if (!spec.subcommands) {
      return { spec: null, path: resolvedPath };
    }
    const next = spec.subcommands[segment];
    if (!next) {
      return { spec: null, path: resolvedPath };
    }
    spec = next;
    resolvedPath.push(segment);
  }

  return { spec, path: resolvedPath };
}

function createRootSpec(): CommandSpec {
  const docsBuild: CommandSpec = {
    name: "build",
    description: "Generate static documentation.",
    usage: ["binschema docs build --schema <file> --out <file>"],
    options: [
      {
        name: "schema",
        key: "schemaPath",
        type: "string",
        description: "Path to the protocol schema JSON/JSON5 file.",
        required: true,
        valueName: "<file>",
      },
      {
        name: "out",
        key: "outputPath",
        type: "string",
        description: "File to write generated HTML documentation.",
        required: true,
        valueName: "<file>",
      },
    ],
  };

  const docsServe: CommandSpec = {
    name: "serve",
    description: "Start a live-reloading documentation server.",
    usage: ["binschema docs serve --schema <file> [options]"],
    options: [
      {
        name: "schema",
        key: "schemaPath",
        type: "string",
        description: "Path to the protocol schema JSON/JSON5 file.",
        required: true,
        valueName: "<file>",
      },
      {
        name: "out",
        key: "outputPath",
        type: "string",
        description: "Optional HTML output path for the latest build.",
        valueName: "<file>",
      },
      {
        name: "port",
        key: "port",
        type: "number",
        description: "Port to serve documentation on.",
        defaultValue: 4173,
        transform: (value) => {
          if (typeof value !== "number") {
            throw new Error("Port must be numeric.");
          }
          if (!Number.isInteger(value) || value <= 0 || value > 65535) {
            throw new Error("Port must be an integer between 1 and 65535.");
          }
          return value;
        },
        valueName: "<port>",
      },
      {
        name: "watch",
        key: "watch",
        type: "boolean",
        description: "Regenerate documentation when files change.",
        defaultValue: true,
        allowNegation: true,
      },
      {
        name: "open",
        key: "open",
        type: "boolean",
        description: "Open the documentation in the default browser.",
        defaultValue: false,
      },
    ],
  };

  const docs: CommandSpec = {
    name: "docs",
    description: "Manage documentation for a schema.",
    usage: ["binschema docs <subcommand> [options]"],
    defaultSubcommand: "build",
    subcommands: {
      build: docsBuild,
      serve: docsServe,
    },
  };

  const generate: CommandSpec = {
    name: "generate",
    description: "Emit code for a target language.",
    usage: ["binschema generate --language <ts|go|rust> --schema <file> --out <dir> [--watch]"],
    options: [
      {
        name: "schema",
        key: "schemaPath",
        type: "string",
        description: "Path to the protocol schema JSON/JSON5 file.",
        required: true,
        valueName: "<file>",
      },
      {
        name: "out",
        key: "outputDir",
        type: "string",
        description: "Directory where generated sources will be written.",
        required: true,
        valueName: "<dir>",
      },
      {
        name: "language",
        key: "language",
        type: "string",
        description: "Target language for generated sources.",
        required: true,
        valueName: "<ts|go|rust>",
        transform: (value) => {
          if (typeof value !== "string") {
            throw new Error("Language must be a string.");
          }
          const normalized = normalizeLanguage(value);
          if (!normalized) {
            throw new Error(`Unsupported language: ${value}`);
          }
          return normalized;
        },
      },
      {
        name: "type",
        key: "typeName",
        type: "string",
        description: "Optional root type to validate during generation.",
        valueName: "<TypeName>",
      },
      {
        name: "watch",
        key: "watch",
        type: "boolean",
        description: "Regenerate when schema files change.",
        defaultValue: false,
        allowNegation: true,
      },
    ],
  };

  return {
    name: "binschema",
    description: "BinSchema command line interface.",
    usage: ["binschema <command> [options]"],
    subcommands: {
      docs,
      generate,
    },
  };
}

function normalizeLanguage(value: string): SupportedLanguage | null {
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "ts":
    case "typescript":
      return "ts";
    case "go":
    case "golang":
      return "go";
    case "rust":
      return "rust";
    default:
      return null;
  }
}
