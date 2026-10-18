#!/usr/bin/env node
/**
 * Run Phase 1 render on all fixtures + main deck; aggregate feature-report.json
 * and write docs/PHASE_1_RESULT.md
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const {
  buildPhase1ResultMarkdown,
  printPhase1Result,
} = require('../lib/phase1-report');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(ROOT, 'test-files');
const OUTPUT = path.join(ROOT, 'output');
const DOCS = path.join(ROOT, 'docs');

const FIXTURE_NAMES = [
  '01-static',
  '02-video',
  '03-audio',
  '04-animation',
  '05-transition',
  '06-combined',
];

const MAIN_DECK = path.join('/Users/gowtham/Downloads', 'Improved_Internship_Presentation.pptx');

function runRender(pptxPath) {
  execFileSync('node', [path.join(ROOT, 'render.js'), '--file', pptxPath], {
    cwd: ROOT,
    stdio: 'inherit',
    timeout: 600000,
  });
}

function aggregateReports(reports) {
  const keys = [
    'staticSlides',
    'text',
    'images',
    'shapes',
    'svgRendering',
    'video',
    'audio',
    'fadeAnimation',
    'appearAnimation',
    'basicMovement',
    'fadeTransition',
    'pushTransition',
    'wipeTransition',
    'pngFallback',
  ];
  const rank = { FAIL: 0, PARTIAL: 1, PASS: 2, 'N/A': 3 };
  const summary = {};
  for (const k of keys) {
    let worst = 'N/A';
    for (const r of reports) {
      const v = r.summary[k];
      if (v === 'N/A') continue;
      if (rank[v] < rank[worst] || worst === 'N/A') worst = v;
    }
    summary[k] = worst;
  }
  return summary;
}

function aggregatePerformance(reports) {
  const perf = reports.map((r) => r.performance).filter(Boolean);
  if (!perf.length) return {};
  return {
    inputSizeBytes: perf.reduce((s, p) => s + (p.inputSizeBytes || 0), 0),
    svgGenerationMs: Math.round(perf.reduce((s, p) => s + (p.svgGenerationMs || 0), 0) / perf.length),
    pngFallbackMs: perf.some((p) => p.pngFallbackMs != null)
      ? Math.round(
          perf.filter((p) => p.pngFallbackMs != null).reduce((s, p) => s + p.pngFallbackMs, 0) /
            perf.filter((p) => p.pngFallbackMs != null).length
        )
      : null,
    totalMs: perf.reduce((s, p) => s + (p.totalMs || 0), 0),
    outputSizeBytes: perf.reduce((s, p) => s + (p.outputSizeBytes || 0), 0),
    slideCount: perf.reduce((s, p) => s + (p.slideCount || 0), 0),
    svgSlideCount: perf.reduce((s, p) => s + (p.svgSlideCount || 0), 0),
    pngFallbackSlideCount: perf.reduce((s, p) => s + (p.pngFallbackSlideCount || 0), 0),
    deckCount: perf.length,
  };
}

function aggregatePresentationStats(reports) {
  const perf = aggregatePerformance(reports);
  return {
    stats: {
      slideCount: perf.slideCount,
      svgSlideCount: perf.svgSlideCount,
      pngFallbackSlideCount: perf.pngFallbackSlideCount,
    },
  };
}

function main() {
  console.log('\n=== Phase 1 feature suite ===\n');

  const fixtureScript = path.join(__dirname, 'create_fixtures.py');
  if (fs.existsSync(fixtureScript)) {
    console.log('Generating fixtures…');
    execFileSync('python3', [fixtureScript], { cwd: ROOT, stdio: 'inherit' });
  }

  const decks = FIXTURE_NAMES.map((n) => path.join(FIXTURES, `${n}.pptx`)).filter((p) =>
    fs.existsSync(p)
  );
  if (fs.existsSync(MAIN_DECK)) decks.push(MAIN_DECK);

  if (!decks.length) {
    console.error('No PPTX files found. Run scripts/create_fixtures.py first.');
    process.exit(1);
  }

  const allReports = [];
  const deckResults = [];

  for (const deck of decks) {
    const name = path.basename(deck, '.pptx');
    console.log(`\n--- Rendering ${name} ---\n`);
    try {
      runRender(deck);
      const reportPath = path.join(OUTPUT, name, 'feature-report.json');
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      allReports.push(report);
      deckResults.push({ name, report, ok: true });
    } catch (err) {
      console.error(`Failed: ${name}:`, err.message);
      deckResults.push({ name, ok: false, error: err.message });
    }
  }

  const aggregated = aggregateReports(allReports);
  const suiteReport = {
    phase: 1,
    generatedAt: new Date().toISOString(),
    decks: deckResults.map((d) =>
      d.ok
        ? { name: d.name, summary: d.report.summary, performance: d.report.performance }
        : { name: d.name, error: d.error }
    ),
    summary: aggregated,
  };

  fse.ensureDirSync(DOCS);
  fs.writeFileSync(path.join(ROOT, 'feature-report.json'), JSON.stringify(suiteReport, null, 2));

  const md = buildPhase1ResultMarkdown(
    {
      ...suiteReport,
      glimpseVersion: allReports[0]?.glimpseVersion,
      unsupported: allReports[0]?.unsupported,
      notes: allReports[0]?.notes,
      performance: aggregatePerformance(allReports),
    },
    aggregatePresentationStats(allReports)
  );

  const extra = [
    '',
    '## Suite decks',
    '',
    ...deckResults.map((d) => {
      if (!d.ok) return `- **${d.name}**: ERROR — ${d.error}`;
      const s = d.report.summary;
      return `- **${d.name}**: SVG=${s.svgRendering}, video=${s.video}, audio=${s.audio}, anim=${s.fadeAnimation}, trans=${s.fadeTransition}`;
    }),
    '',
    '## Aggregated summary (worst across decks)',
    '',
    '| Feature | Result |',
    '|---------|--------|',
    ...Object.entries(aggregated).map(([k, v]) => `| ${k} | ${v} |`),
  ].join('\n');

  fs.writeFileSync(path.join(DOCS, 'PHASE_1_RESULT.md'), md + extra);

  console.log('\n==============================');
  console.log('SUITE AGGREGATE (worst case)');
  console.log('==============================\n');
  printPhase1Result({ summary: aggregated });

  console.log('\nWritten:');
  console.log(`  ${path.join(DOCS, 'PHASE_1_RESULT.md')}`);
  console.log(`  ${path.join(ROOT, 'feature-report.json')}`);
  console.log('\nCommands:');
  console.log(`  node parse.js --file "${MAIN_DECK}"`);
  console.log(`  node render.js --file "${MAIN_DECK}"`);
  console.log('  node scripts/run_feature_suite.js');
}

main();
