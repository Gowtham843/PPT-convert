# PPTX → PDF → PNG → HTML Viewer Implementation Plan

> **For agentic workers:** Execute inline in this session. Steps use checkbox syntax for tracking.

**Goal:** Replace LibreOffice HTML export in `convert.js` with a local PPT/PPTX → PDF → PNG → HTML viewer POC.

**Architecture:** LibreOffice headless produces PDF (fidelity gate). Isolated `rasterizePdfToPngs()` uses Poppler `pdftoppm`. Generated `index.html` shows PNGs one slide at a time via `file://`.

**Tech Stack:** Node.js (CommonJS), `fs-extra`, LibreOffice `soffice`, Poppler `pdftoppm`. No new npm deps.

## Global Constraints

- Local only; PPT/PPTX only; no API/DB/S3/CDN/queues/Docker/auth
- No LibreOffice HTML export; no PPT object parsing
- Rasterizer isolated and replaceable
- Default output: `output/<basename>/`; optional `--output`
- High-res PNGs (~1920px wide); preserve aspect ratio
- Keep PDF in output for comparison

## File structure

- Modify: `convert.js` — full rewrite of main pipeline
- Modify: `README.md` — document new CLI and system deps
- Create: none required (viewer HTML generated at runtime)

---

### Task 1: Rewrite `convert.js` pipeline

**Files:**
- Modify: `convert.js`

**Interfaces:**
- Produces: `findLibreOffice()`, `findPdftoppm()`, `convertToPdf(loPath, inputFile, outDir)`, `rasterizePdfToPngs(pdfPath, slidesDir)`, `writeViewer(outputDir, slides, meta)`, `main()`

- [ ] **Step 1:** Implement CLI (`--file`, `--output`), validation, LibreOffice PDF conversion, isolated rasterizer, viewer + metadata, progress + final summary.
- [ ] **Step 2:** Update README with usage, Poppler install, fidelity-gate note.
- [ ] **Step 3:** Ensure `pdftoppm` available (`brew install poppler` if missing).
- [ ] **Step 4:** Run against user PPTX when present; print exact test command.

**Verification:** Script fails clearly without file/LO/poppler; succeeds with PDF + PNGs + `index.html` + summary.
