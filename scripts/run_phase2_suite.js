#!/usr/bin/env node
/**
 * Run Phase 2 render on phase2 fixtures + main deck; aggregate phase2-feature-report.json
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const {
  buildPhase2ResultMarkdown,
  buildPhase2Conclusion,
  printPhase2Result,
} = require('../lib/phase2-report');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(ROOT, 'test-files', 'phase2');
const OUTPUT = path.join(ROOT, 'output');
const DOCS = path.join(ROOT, 'docs');

const FIXTURE_NAMES = [
  '01-static-complex',
  '02-animation',
  '03-media',
  '04-transitions',
  '05-tables-charts',
  '06-fonts-themes',
  '07-combined',
];

const MAIN_DECK = path.join('/Users/gowtham/Downloads', 'Improved_Internship_Presentation.pptx');

function runRender(pptx) {
  execFileSync('node', [path.join(ROOT, 'render.js'), '--file', pptx], {
    cwd: ROOT,
    stdio: 'inherit',
    timeout: 600000,
  });
}

function worst(reports, key) {
  const rank = { FAIL: 0, PARTIAL: 1, PASS: 2, 'N/A': 3 };
  let w = 'N/A';
  for (const r of reports) {
    const v = r.summary[key];
    if (v === 'N/A') continue;
    if (rank[v] < rank[w] || w === 'N/A') w = v;
  }
  return w;
}

function main() {
  console.log('\n=== Phase 2 fidelity suite ===\n');
  execFileSync('python3', [path.join(__dirname, 'create_phase2_fixtures.py')], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  const decks = FIXTURE_NAMES.map((n) => path.join(FIXTURES, `${n}.pptx`)).filter((p) =>
    fs.existsSync(p)
  );
  if (fs.existsSync(MAIN_DECK)) decks.push(MAIN_DECK);

  const reports = [];
  const results = [];

  for (const deck of decks) {
    const name = path.basename(deck, '.pptx');
    console.log(`\n--- ${name} ---\n`);
    try {
      runRender(deck);
      const report = JSON.parse(
        fs.readFileSync(path.join(OUTPUT, name, 'phase2-feature-report.json'), 'utf8')
      );
      reports.push(report);
      results.push({ name, ok: true, report });
    } catch (e) {
      results.push({ name, ok: false, error: e.message });
    }
  }

  const keys = Object.keys(reports[0]?.summary || {});
  const aggregated = {};
  for (const k of keys) aggregated[k] = worst(reports, k);

  const suite = {
    phase: 2,
    generatedAt: new Date().toISOString(),
    decks: results,
    summary: aggregated,
    fidelity: reports.length
      ? {
          overall: Math.round(reports.reduce((s, r) => s + r.fidelity.overall, 0) / reports.length),
          estimatedISpringParity: Math.round(
            reports.reduce((s, r) => s + r.fidelity.estimatedISpringParity, 0) / reports.length
          ),
        }
      : null,
  };

  fs.writeFileSync(path.join(ROOT, 'phase2-feature-report.json'), JSON.stringify(suite, null, 2));

  const md =
    buildPhase2ResultMarkdown(reports[reports.length - 1] || { summary: aggregated, fidelity: {}, blockers: [] }, {}) +
    '\n## Suite decks\n\n' +
    results
      .map((d) =>
        d.ok
          ? `- **${d.name}**: overall=${d.report.fidelity.overall}, iSpring est=${d.report.fidelity.estimatedISpringParity}%`
          : `- **${d.name}**: ERROR ${d.error}`
      )
      .join('\n') +
    '\n\n' +
    buildPhase2Conclusion(reports[0] || { fidelity: { estimatedISpringParity: '?' } });

  fse.ensureDirSync(DOCS);
  fs.writeFileSync(path.join(DOCS, 'PHASE_2_RESULT.md'), md);

  if (!fs.existsSync(path.join(DOCS, 'ISPRING_COMPARISON.md'))) {
    fs.writeFileSync(
      path.join(DOCS, 'ISPRING_COMPARISON.md'),
      `# iSpring Comparison

No iSpring/iPrint reference PPTX provided yet.

When available, compare side-by-side:

| Feature | iSpring | Our Phase 2 viewer | Difference |
|---------|---------|-------------------|------------|
| Static slide | TBD | TBD | TBD |
| Fonts | TBD | TBD | TBD |
| Images | TBD | TBD | TBD |
| Video | TBD | TBD | TBD |
| Audio | TBD | TBD | TBD |
| Animation | TBD | TBD | TBD |
| Transition | TBD | TBD | TBD |
| Charts | TBD | TBD | TBD |
| Tables | TBD | TBD | TBD |

Drop reference deck into \`test-files/phase2/\` and re-run \`node scripts/run_phase2_suite.js\`.
`
    );
  }

  printPhase2Result({
    summary: aggregated,
    fidelity: suite.fidelity
      ? {
          staticVisualFidelity: Math.round(
            reports.reduce((s, r) => s + r.fidelity.staticVisualFidelity, 0) / reports.length
          ),
          mediaFidelity: Math.round(
            reports.reduce((s, r) => s + r.fidelity.mediaFidelity, 0) / reports.length
          ),
          animationFidelity: Math.round(
            reports.reduce((s, r) => s + r.fidelity.animationFidelity, 0) / reports.length
          ),
          transitionFidelity: Math.round(
            reports.reduce((s, r) => s + r.fidelity.transitionFidelity, 0) / reports.length
          ),
          fontFidelity: Math.round(
            reports.reduce((s, r) => s + r.fidelity.fontFidelity, 0) / reports.length
          ),
          overall: suite.fidelity.overall,
          estimatedISpringParity: suite.fidelity.estimatedISpringParity,
        }
      : {},
  });
  console.log('\nWritten: docs/PHASE_2_RESULT.md, phase2-feature-report.json');
}

main();
