# Media Overlay Feature Investigation Plan

> Inline execution in this session.

**Goal:** Add PPTX media extraction + overlay viewer + fixtures + honest feature reports without breaking PNG pipeline.

**Architecture:** PNG base + `extractPptxFeatures()` + overlay HTML; fixtures via python-pptx.

**Tech Stack:** Node.js, unzip, python-pptx, ffmpeg (assets), LibreOffice, pdftoppm

## Files

- Create: `scripts/create_fixtures.py`, `scripts/run_feature_suite.js`, `lib/extract-pptx.js`, `test-files/**`, `FIXTURES.md`
- Modify: `convert.js`, `README.md`

### Task 1: Fixtures
### Task 2: extract-pptx + convert.js viewer overlays + feature-report
### Task 3: Run suite; print matrix
