# PPTX → PDF → PNG → HTML Viewer POC Design

**Date:** 2026-08-20  
**Status:** Approved

## Goal

Determine whether a local pipeline that renders each slide as a complete image can produce a browser-viewable presentation whose visual fidelity is closer to iPrintCloud than LibreOffice’s direct HTML export.

Acceptance comparison:

1. Original PowerPoint  
2. Generated PDF  
3. Generated PNG  
4. iPrintCloud output  

## Pipeline

```text
.ppt / .pptx
    → LibreOffice headless → PDF
    → [fidelity gate]
    → high-resolution PNG per page (swappable rasterizer)
    → local HTML viewer (file://)
```

LibreOffice is used **only** for PPT/PPTX → PDF. Do **not** use LibreOffice HTML export. Do **not** parse PowerPoint objects or build an iSpring-like engine.

## Fidelity gate

After PDF generation, the PDF path is printed and the PDF is kept in the output folder.

- If the PDF has layout/text/font problems vs the original PPT, **stop and report**. Do not optimize PNG conversion; the problem is upstream.
- If the PDF is visually correct, continue with high-resolution PNG rendering and the HTML viewer.

## CLI

```bash
node convert.js --file "/absolute/path/to/file.pptx"
node convert.js --file "/absolute/path/to/file.ppt"
node convert.js --file "/absolute/path/to/file.pptx" --output "./output"
```

- Accept only `.ppt` and `.pptx`.
- `--output` optional; default `output/<basename>/` (filename only; ignore `--id`).
- Local only. No URL download required for this POC.

## Output layout

```text
output/<basename>/
  ├── index.html
  ├── presentation.pdf          # intermediate, for comparison
  ├── slides/
  │   ├── slide-001.png
  │   └── ...
  └── metadata.json
```

## Rasterizer

Preferred: Poppler `pdftoppm` at ~1920px wide (or equivalent high DPI).

The PDF → PNG step must be isolated behind a single function/module so the rasterizer can be replaced later without changing LibreOffice conversion or the viewer.

Preserve original slide aspect ratio. Do not stretch.

## Viewer

Plain HTML/CSS/JS (no CDN, no backend):

- One slide at a time  
- Fit inside viewport without distortion (`object-fit: contain`)  
- Previous / Next  
- `Slide X / N`  
- Left / Right arrows  
- Fullscreen if trivial  

## Progress / summary output

Print clear step status, then:

```text
Input:
<path>

PDF:
<path>

Slides:
<number>

Viewer:
<file:// URL>

Output size:
<size>
```

## Out of scope

API, database, S3, CloudFront, Redis, queues, authentication, Docker, production infra, LibreOffice HTML export, PPT object parsing, animation engine, unnecessary npm dependencies.

## Dependencies

- Existing: Node, `fs-extra` (keep). Axios/chalk unused by this POC path may remain in `package.json` but are not required.
- System: LibreOffice (`soffice`), Poppler (`pdftoppm`).
- No new npm PDF libraries for v1.
