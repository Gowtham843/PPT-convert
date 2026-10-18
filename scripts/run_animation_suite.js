#!/usr/bin/env node
/** Run animation fixture suite and write docs/ANIMATION_TRANSITION_RESULT.md */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(ROOT, 'test-files', 'animation');
const DOCS = path.join(ROOT, 'docs');

const DECKS = [
  '01-fade-click',
  '03-fly-in',
  '09-transition-fade',
  path.join('..', 'phase2', '02-animation'),
];

function run() {
  execFileSync('python3', [path.join(__dirname, 'create_animation_fixtures.py')], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  const results = [];
  for (const name of DECKS) {
    const pptx = path.join(FIXTURES, `${path.basename(name)}.pptx`);
    if (!fs.existsSync(pptx)) continue;
    console.log(`\n--- render ${path.basename(name)} ---\n`);
    execFileSync(
      'node',
      [path.join(ROOT, 'render.js'), '--file', pptx, '--debug-animation'],
      { cwd: ROOT, stdio: 'inherit' }
    );
    const outDir = path.join(ROOT, 'output', path.basename(name));
    const report = JSON.parse(
      fs.readFileSync(path.join(outDir, 'animation-feature-report.json'), 'utf8')
    );
    results.push({ name: path.basename(name), report });
  }

  const md = [
    '# Animation & Transition Result',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'Status legend: **PASS** = browser verified (manual) · **PARTIAL** = detected+mapped · **FAIL** = broken · **NOT_PRESENT** = not in deck',
    '',
    '## Suite summary',
    '',
    ...results.map(
      (r) =>
        `### ${r.name}\n\n\`\`\`json\n${JSON.stringify(r.report.summary, null, 2)}\n\`\`\`\n`
    ),
    '',
    '## Milestone 1 — Fade In + On Click',
    '',
    'Deck: `test-files/animation/01-fade-click.pptx`',
    '',
    'Manual: open `output/01-fade-click/index.html?animDebug=1` → object hidden → Next → WAAPI fade on object.',
    '',
  ].join('\n');

  fs.mkdirSync(DOCS, { recursive: true });
  fs.writeFileSync(path.join(DOCS, 'ANIMATION_TRANSITION_RESULT.md'), md);
  fs.writeFileSync(
    path.join(ROOT, 'animation-feature-report.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)
  );
  console.log('\nWrote docs/ANIMATION_TRANSITION_RESULT.md');
}

run();
