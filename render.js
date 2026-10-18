#!/usr/bin/env node
/**
 * Phase 2: PPTX → pptx-glimpse SVG → Phase 2 HTML5 player (+ PNG fallback)
 *
 * Usage:
 *   node render.js --file "/path/to/deck.pptx" [--output "./output"] [--ppt-layers "/path/to/deck-layers"]
 */

const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const os = require('os');
const { extractPhase2Features } = require('./lib/phase2-extract');
const { renderPptxToSvgs, GLIMPSE_VERSION } = require('./lib/glimpse-renderer');
const { loadPptLayers } = require('./lib/ppt-layers');
const { buildPhase2Presentation } = require('./lib/presentation-model');
const { writePhase2Viewer } = require('./lib/phase2-viewer');
const { runPngFallback } = require('./lib/png-pipeline');
const { printAnimationDebug } = require('./lib/animation-debug');
const { writeAnimationFeatureReport } = require('./lib/animation-feature-report');
const {
  buildPhase2FeatureReport,
  printPhase2Result,
  buildPhase2ResultMarkdown,
  buildPhase2Conclusion,
} = require('./lib/phase2-report');

const OUTPUT_BASE = path.join(__dirname, 'output');

function ok(m) {
  console.log('✓', m);
}
function fail(m) {
  console.error('✗', m);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { debugAnimation: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--file') args.file = argv[++i];
    else if (argv[i] === '--output') args.output = argv[++i];
    else if (argv[i] === '--debug-animation') args.debugAnimation = true;
    else if (argv[i] === '--ppt-layers') args.pptLayers = argv[++i];
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

function dirSizeBytes(dir) {
  let total = 0;
  const walk = (p) => {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const full = path.join(p, e.name);
      if (e.isDirectory()) walk(full);
      else total += fs.statSync(full).size;
    }
  };
  walk(dir);
  return total;
}

async function main() {
  const totalStart = Date.now();
  console.log('\nPhase 2: PPTX → SVG + timeline → HTML5 player\n');
  console.log(`pptx-glimpse version: ${GLIMPSE_VERSION}\n`);

  const args = parseArgs(process.argv.slice(2));
  if (!args.file) fail('Missing --file');
  const input = path.resolve(args.file);
  if (!fs.existsSync(input)) fail(`File not found: ${input}`);
  if (path.extname(input).toLowerCase() !== '.pptx') {
    fail('render.js requires .pptx. Use convert.js for .ppt PNG fallback.');
  }

  const outputDir = resolveOutputDir(input, args.output);
  const svgDir = path.join(outputDir, 'svg');
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppt-phase2-'));
  fse.ensureDirSync(outputDir);

  try {
    ok('Extracting Phase 2 OOXML (timeline, tables, charts, theme, media)');
    const features = extractPhase2Features(input, outputDir);

    ok('Generating SVG slides with pptx-glimpse + object map');
    let glimpseResult;
    try {
      const pptLayers = args.pptLayers ? loadPptLayers(path.resolve(args.pptLayers)) : null;
      if (pptLayers) ok(`Using PowerPoint-drawn layers from ${args.pptLayers}`);
      glimpseResult = await renderPptxToSvgs(input, svgDir, features, pptLayers);
      ok(`${glimpseResult.slideCount} SVG files → ${svgDir}`);
      console.log(`  SVG generation: ${glimpseResult.svgGenerationMs} ms`);
    } catch (err) {
      fail(`pptx-glimpse failed: ${err.message}`);
    }

    fs.writeFileSync(
      path.join(outputDir, 'object-map.json'),
      JSON.stringify(
        features.slides.map((s, i) => ({
          slide: s.index,
          objects: glimpseResult.slides[i]?.objectMap || s.objectMap || [],
        })),
        null,
        2
      )
    );

    const needsAnyPng = glimpseResult.slides.some((s) => s.needsPngFallback);
    let pngResult = null;
    let pngFallbackMs = null;
    if (needsAnyPng) {
      const fallbackSlideNumbers = glimpseResult.slides
        .filter((s) => s.needsPngFallback)
        .map((s) => s.index);
      ok(`PNG fallback required — LibreOffice → PDF → PNG (${fallbackSlideNumbers.length} slide(s))`);
      const t0 = Date.now();
      try {
        pngResult = runPngFallback(input, outputDir, workDir, {
          slideNumbers: fallbackSlideNumbers,
        });
        pngFallbackMs = Date.now() - t0;
        ok(`PNG fallback ready (${fallbackSlideNumbers.length} slide(s), ${pngFallbackMs} ms)`);
      } catch (err) {
        console.warn('⚠ PNG fallback failed:', err.message);
      }
    } else {
      ok('No PNG fallback required for this deck');
    }

    const inputStat = fs.statSync(input);
    const performance = {
      inputSizeBytes: inputStat.size,
      svgGenerationMs: glimpseResult.svgGenerationMs,
      pngFallbackMs,
      totalMs: Date.now() - totalStart,
      slideCount: glimpseResult.slideCount,
      svgSlideCount: 0,
      pngFallbackSlideCount: 0,
      outputSizeBytes: 0,
    };

    const presentation = buildPhase2Presentation(features, glimpseResult, pngResult, performance);
    performance.svgSlideCount = presentation.stats.svgSlideCount;
    performance.pngFallbackSlideCount = presentation.stats.pngFallbackSlideCount;
    performance.outputSizeBytes = dirSizeBytes(outputDir);

    const pdfArtifact = path.join(outputDir, 'presentation.pdf');
    if (fs.existsSync(pdfArtifact)) fs.unlinkSync(pdfArtifact);

    writePhase2Viewer(outputDir, presentation, path.basename(input));
    ok('Phase 2 index.html + viewer.js generated');

    writeAnimationFeatureReport(presentation, outputDir);
    ok('animation-feature-report.json written');

    if (args.debugAnimation) {
      printAnimationDebug(presentation, outputDir);
    }

    const featureReport = buildPhase2FeatureReport(
      presentation,
      features,
      glimpseResult,
      pngResult,
      performance
    );
    fs.writeFileSync(
      path.join(outputDir, 'phase2-feature-report.json'),
      JSON.stringify(featureReport, null, 2)
    );

    printPhase2Result(featureReport);
    console.log(buildPhase2Conclusion(featureReport));

    const md = buildPhase2ResultMarkdown(featureReport, presentation);
    fs.writeFileSync(path.join(__dirname, 'docs/PHASE_2_RESULT.md'), md);

    console.log('\nOpen viewer:');
    console.log(`  file://${path.join(outputDir, 'index.html')}`);
    console.log('\nCommands:');
    console.log(`  node parse.js --file "${input}"`);
    console.log(`  node render.js --file "${input}"`);
    console.log('  node scripts/run_phase2_suite.js');
    console.log('');
  } finally {
    try {
      fse.removeSync(workDir);
    } catch {
      /* ignore */
    }
  }
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
