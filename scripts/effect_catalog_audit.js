#!/usr/bin/env node
/** Catalog feature audit: per-effect parse/render status for the 167-effect deck.
 *
 * Joins test-files/effect-manifest.json (what we AUTHORED) with the repo's
 * own HTML5 parser output (output/catalog-audit/.../timelines.json, what our
 * pipeline DETECTS/renders) to produce a per-effect fidelity report, grouped
 * by category, and a JSON file consumers can reuse.
 */

const fs = require('fs');
const path = require('path');
const { EFFECT_DEFINITIONS } = require('../lib/animation-engine');

const ROOT = path.join(__dirname, '..');
const MANIFEST = path.join(ROOT, 'test-files', 'effect-manifest.json');
const TIMELINES = path.join(
  ROOT, 'output', 'catalog-audit', 'ispring-effect-catalog', 'timelines.json'
);
const OUT_JSON = path.join(ROOT, 'test-files', 'catalog-audit-report.json');

// renderable effect names the viewer runtime/engine actually supports
const RENDERABLE = new Set(
  Object.entries(EFFECT_DEFINITIONS)
    .filter(([, def]) => def.supported)
    .map(([name]) => name)
);

function statusOf({ renderable, bind }) {
  if (!bind) return 'UNPARSED';
  if (!bind.renderable) return 'DETECTED_UNSUPPORTED';
  if (RENDERABLE.has(bind.effect)) return 'RENDERABLE';
  return 'DETECTED_UNSUPPORTED';
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

  if (!fs.existsSync(TIMELINES)) {
    console.log('timelines.json missing — running render pipeline first...');
    const { execFileSync } = require('child_process');
    execFileSync(
      'node',
      [path.join(ROOT, 'render.js'), '--file', path.join(ROOT, 'test-files', 'ispring-effect-catalog.pptx'),
       '--output', path.join(ROOT, 'output', 'catalog-audit')],
      { cwd: ROOT, stdio: 'inherit' }
    );
  }
  const timelines = JSON.parse(fs.readFileSync(TIMELINES, 'utf8'));
  const perSlide = {};
  for (const s of timelines) perSlide[s.slide] = s.timeline;

  const rows = manifest.effects.map((fx) => {
    const tl = perSlide[fx.index] || [];
    const primary = tl.find((e) => e.nodeType === 'clickEffect') || tl[0];
    const bind = primary || null;
    return {
      index: fx.index,
      name: fx.name,
      category: fx.category,
      authoredPreset: fx.preset,
      parsedEffect: bind ? bind.effect : null,
      parsedType: bind ? bind.type : null,
      renderable: bind ? (bind.renderable && RENDERABLE.has(bind.effect)) : false,
      status: statusOf({ renderable: bind, bind }),
    };
  });

  const byCat = {};
  const counts = {
    RENDERABLE: 0, DETECTED_UNSUPPORTED: 0, UNPARSED: 0, total: rows.length,
  };
  for (const r of rows) {
    (byCat[r.category] = byCat[r.category] || []).push(r);
    counts[r.status] = (counts[r.status] || 0) + 1;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    note: 'Parsed by repo timeline-parser (own HTML5 pipeline). RENDERABLE = viewer runtime supports it.',
    counts,
    byCategory: Object.fromEntries(
      Object.entries(byCat).map(([c, arr]) => [
        c,
        {
          total: arr.length,
          renderable: arr.filter((r) => r.status === 'RENDERABLE').length,
          unsupported: arr.filter((r) => r.status === 'DETECTED_UNSUPPORTED').length,
          unparsed: arr.filter((r) => r.status === 'UNPARSED').length,
        },
      ])
    ),
    effects: rows,
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  writeMarkdown(report);
  console.log(`Total: ${counts.total}`);
  console.log(`  RENDERABLE:            ${counts.RENDERABLE}`);
  console.log(`  DETECTED_UNSUPPORTED:  ${counts.DETECTED_UNSUPPORTED}`);
  console.log(`  UNPARSED:              ${counts.UNPARSED}`);
  console.log('By category:');
  for (const [c, v] of Object.entries(report.byCategory)) {
    console.log(`  ${c.padEnd(7)} ${String(v.renderable).padStart(3)} renderable / ${String(v.total).padStart(3)} total (unsupported ${v.unsupported}, unparsed ${v.unparsed})`);
  }
  console.log(`Wrote ${OUT_JSON}`);
}

function writeMarkdown(report) {
  const md = [
    '# Effect Catalog Fidelity Report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    'Per-effect status after running the deck through the repo\'s own HTML5 pipeline.',
    '',
    'Status legend:',
    '- **RENDERABLE** — parsed and mapped to an effect the viewer runtime supports',
    '- **DETECTED_UNSUPPORTED** — parsed but mapped to an effect the runtime does not yet render',
    '- **UNPARSED** — the HTML5 `<p:timing>` parser did not recognize the effect',
    '',
    '## Summary',
    '',
    `| | Count |`,
    '|---|--|',
    `| Total | ${report.counts.total} |`,
    `| RENDERABLE | ${report.counts.RENDERABLE} |`,
    `| DETECTED_UNSUPPORTED | ${report.counts.DETECTED_UNSUPPORTED} |`,
    `| UNPARSED | ${report.counts.UNPARSED} |`,
    '',
    '## By category',
    '',
    '| Category | Renderable | Unsupported | Unparsed | Total |',
    '|---|---|---|---|---|',
    ...Object.entries(report.byCategory).map(
      ([c, v]) => `| ${c} | ${v.renderable} | ${v.unsupported} | ${v.unparsed} | ${v.total} |`
    ),
    '',
    '## Unsupported effects (identified gap)',
    '',
    '| Index | Category | Name | Parsed effect |',
    '|---|---|---|---|',
    ...report.effects
      .filter((r) => r.status === 'DETECTED_UNSUPPORTED')
      .map((r) => `| ${r.index} | ${r.category} | ${r.name} | ${r.parsedEffect} |`),
    '',
    'Full per-effect data: `test-files/catalog-audit-report.json`.',
  ].join('\n');
  const out = path.join(ROOT, 'docs', 'EFFECT_CATALOG_FIDELITY.md');
  fs.writeFileSync(out, md);
  console.log(`Wrote ${out}`);
}

main();
