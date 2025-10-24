#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import { spawn } from "child_process";
import JSON5 from "json5";
import {
  parseCLICommand,
  formatHelp,
  DocsBuildCommand,
  DocsServeCommand,
  GenerateCommand,
  HelpCommand,
} from "./command-parser.js";
import type { BinarySchema } from "../schema/binary-schema.js";

async function main() {
  const argv = process.argv.slice(2);
  const result = parseCLICommand(argv);

  if (!result.ok) {
    console.error(`Error: ${result.error.message}`);
    if (result.error.details) {
      console.error(result.error.details);
    }
    process.exitCode = 1;
    return;
  }

  const command = result.command;

  switch (command.type) {
    case "help":
      await handleHelp(command);
      break;
    case "docs":
      if (command.mode === "build") {
        await handleDocsBuild(command);
      } else {
        await handleDocsServe(command);
      }
      break;
    case "generate":
      await handleGenerate(command);
      break;
    default:
      // Exhaustiveness guard
      const neverCommand: never = command;
      throw new Error(`Unhandled command: ${JSON.stringify(neverCommand)}`);
  }
}

async function handleHelp(command: HelpCommand): Promise<void> {
  console.log(formatHelp(command.path));
}

async function handleDocsBuild(command: DocsBuildCommand): Promise<void> {
  console.log(`Building documentation for schema: ${command.schemaPath}`);
  console.log(`→ Output: ${command.outputPath}`);
  console.log("TODO: integrate with documentation generator");
}

async function handleDocsServe(command: DocsServeCommand): Promise<void> {
  console.log(`Serving documentation for schema: ${command.schemaPath}`);
  console.log(`→ Port: ${command.port}`);
  console.log(`→ Watch mode: ${command.watch ? "enabled" : "disabled"}`);
  if (command.outputPath) {
    console.log(`→ Initial output path: ${command.outputPath}`);
  }
  if (command.open) {
    console.log("→ Browser auto-open requested");
  }
  console.log("TODO: start dev server and file watcher");
}

async function handleGenerate(command: GenerateCommand): Promise<void> {
  if (command.watch) {
    console.warn("Watch mode for code generation is not implemented yet; proceeding with a single build.");
  }

  const schema = loadSchema(command.schemaPath);
  const absoluteOut = resolve(process.cwd(), command.outputDir);
  mkdirSync(absoluteOut, { recursive: true });

  switch (command.language) {
    case "go": {
      const typeName = resolveTypeName(schema, command.typeName);
      if (!typeName) {
        throw new Error("Schema does not define any types; cannot generate Go code.");
      }
      await runGoGenerator({
        schemaPath: resolve(process.cwd(), command.schemaPath),
        typeName,
        outputDir: absoluteOut,
      });
      console.log(`Generated Go sources → ${join(absoluteOut, "generated.go")}`);
      break;
    }
    case "ts":
      console.error("TypeScript emission is not yet implemented in the CLI.");
      process.exitCode = 1;
      break;
    case "rust":
      console.error("Rust emission is not yet implemented in the CLI.");
      process.exitCode = 1;
      break;
    default:
      console.error(`Unsupported language: ${command.language}`);
      process.exitCode = 1;
  }
}

function loadSchema(schemaPath: string): BinarySchema {
  const absolute = resolve(process.cwd(), schemaPath);
  const raw = readFileSync(absolute, "utf-8");
  return JSON5.parse(raw) as BinarySchema;
}

function resolveTypeName(schema: BinarySchema, explicit?: string): string | undefined {
  if (explicit) return explicit;
  const names = Object.keys(schema.types ?? {});
  return names.length > 0 ? names.sort()[0] : undefined;
}

async function runGoGenerator(opts: { schemaPath: string; typeName: string; outputDir: string }): Promise<void> {
  mkdirSync(opts.outputDir, { recursive: true });

  // Use TypeScript generator directly
  const { generateGo } = await import("../generators/go.js");
  const schema = loadSchema(opts.schemaPath);
  const result = generateGo(schema, opts.typeName);

  const outputPath = join(opts.outputDir, "generated.go");
  writeFileSync(outputPath, result.code);
}

function execCommand(cmd: string, args: string[], options: { cwd: string }): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
      }
    });
    child.on("error", reject);
  });
}

main().catch((error) => {
  console.error("Unexpected error:", error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
