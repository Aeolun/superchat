#!/usr/bin/env node
import { mkdirSync, readdirSync, statSync, copyFileSync, unlinkSync } from 'fs';
import { join, extname, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = resolve(__dirname, '..');
const binschemaRoot = resolve(projectRoot, '..', 'tools', 'binschema');

const docsOutputDir = join(projectRoot, 'public', 'docs');
const examplesOutputDir = join(projectRoot, 'public', 'examples');

const ensureDir = (path) => mkdirSync(path, { recursive: true });

const cleanDirectory = (path, extensions) => {
  try {
    const entries = readdirSync(path);
    for (const entry of entries) {
      const entryPath = join(path, entry);
      if (statSync(entryPath).isDirectory()) continue;
      if (extensions.includes(extname(entry))) {
        unlinkSync(entryPath);
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
};

const copyIfExists = (source, destination) => {
  try {
    copyFileSync(source, destination);
    console.log(`Copied ${source} → ${destination}`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`Source file not found: ${source}`);
    } else {
      throw error;
    }
  }
};

// Ensure destination directories exist
ensureDir(docsOutputDir);
ensureDir(examplesOutputDir);

// Clean stale files
cleanDirectory(docsOutputDir, ['.html', '.md']);
cleanDirectory(examplesOutputDir, ['.html', '.json']);

// Copy README for usage documentation
copyIfExists(
  join(binschemaRoot, 'README.md'),
  join(docsOutputDir, 'README.md')
);

// Copy type reference HTML
copyIfExists(
  join(binschemaRoot, 'type-reference.html'),
  join(docsOutputDir, 'type-reference.html')
);

// Copy example schemas and generated docs
const examplesSourceDir = join(binschemaRoot, 'examples');

try {
  const exampleFiles = readdirSync(examplesSourceDir);
  for (const file of exampleFiles) {
    const sourcePath = join(examplesSourceDir, file);
    if (statSync(sourcePath).isDirectory()) continue;

    const extension = extname(file);
    if (['.json', '.html'].includes(extension)) {
      const destinationPath = join(examplesOutputDir, file);
      copyIfExists(sourcePath, destinationPath);
    }
  }
} catch (error) {
  if (error.code === 'ENOENT') {
    console.warn(`Examples directory not found: ${examplesSourceDir}`);
  } else {
    throw error;
  }
}
