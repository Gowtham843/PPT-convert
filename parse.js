#!/usr/bin/env node
/**
 * Parse PPTX → presentation.json (Phase 1 model, no SVG generation)
 */
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const { extractPhase2Features } = require('./lib/phase2-extract');
const { buildPhase2Presentation } = require('./lib/presentation-model');

const OUTPUT_BASE = path.join(__dirname, 'output');

function fail(msg) {
  console.error('✗', msg);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--file') args.file = argv[++i];
    else if (argv[i] === '--output') args.output = argv[++i];
  }
  return args;
}

function resolveOutputDir(inputPath, outputArg) {
  const base = path.basename(inputPath, path.extname(inputPath));
  if (outputArg) {
    const resolved = path.resolve(outputArg);
    if (path.basename(resolved) === base) return resolved;
    return path.join(resolved, base);
  }
  return path.join(OUTPUT_BASE, base);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) fail('Missing --file');
  const input = path.resolve(args.file);
  if (!fs.existsSync(input)) fail(`File not found: ${input}`);
  if (path.extname(input).toLowerCase() !== '.pptx') fail('parse.js requires .pptx');

  const outputDir = resolveOutputDir(input, args.output);
  fse.ensureDirSync(outputDir);

  const features = extractPhase2Features(input, outputDir);
  const presentation = buildPhase2Presentation(
    features,
    { slides: [], glimpseVersion: null, slideCount: features.slideCount },
    null,
    { inputSizeBytes: fs.statSync(input).size }
  );

  const outPath = path.join(outputDir, 'presentation.json');
  fs.writeFileSync(outPath, JSON.stringify(presentation, null, 2));
  console.log('✓ presentation.json (OOXML-only, no SVG)');
  console.log(outPath);
}

main();
