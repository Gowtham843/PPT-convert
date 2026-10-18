# PPT → HTML Presentation (Local POC)

Phase 2 pushes fidelity toward iSpringCloud-style playback using open-source tooling.

```text
PPTX
 ├── pptx-glimpse → SVG (+ editor session object map)
 ├── OOXML → timeline, media, tables, charts, theme
 ├── Phase 2 HTML5 player (click-through animations)
 └── LibreOffice → PNG fallback (SmartArt / complex chart / glimpse gaps)

convert.js — unchanged PNG-only pipeline
```

See **`docs/PHASE_2_RESULT.md`**, **`docs/ISPRING_COMPARISON.md`**, **`docs/RENDERING_OPTIONS.md`**.

## Prerequisites

```bash
brew install --cask libreoffice poppler ffmpeg
pip install python-pptx lxml pillow
cd ppt-converter && npm install
```

Node **22+** required.

## Phase 2 render

```bash
node render.js --file "/absolute/path/to/deck.pptx"
node parse.js --file "/absolute/path/to/deck.pptx"
```

Output: `svg/`, `media/`, `presentation.json`, `timelines.json`, `object-map.json`, `index.html`, `viewer.js`, `phase2-feature-report.json`.

## Phase 2 test suite

```bash
python3 scripts/create_phase2_fixtures.py
node scripts/run_phase2_suite.js
```

Fixtures: `test-files/phase2/01-static-complex` … `07-combined`.

## Legacy PNG pipeline

```bash
node convert.js --file "/path/to/deck.pptx"
```

## Honest scope

- **Not iSpring equivalent** until tested with your iSpring/iPrint PPTX.
- Animation fidelity ~CSS approximations; many PowerPoint presets unmapped.
- Charts: basic static SVG or PNG fallback.
- SmartArt: PNG fallback.
- Estimated iSpring parity: see Phase 2 conclusion (~40–45% conservative).
