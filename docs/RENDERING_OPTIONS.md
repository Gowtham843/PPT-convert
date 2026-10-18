# PPT/PPTX Rendering Options (Research)

**Date:** 2026-08-20  
**Goal:** Find the smallest practical stack for **object-level** slide rendering closer to iSpringCloud than LibreOffice → PDF → PNG.

This document compares approaches for a **local POC**. It does not claim iSpring parity unless tested against a real iSpring export.

---

## Summary recommendation

| Layer | Recommendation | Why |
|-------|----------------|-----|
| **Primary object renderer (evaluate next)** | [`pptx-glimpse`](https://github.com/hirokisakabe/pptx-glimpse) (MIT, Node 22+) | In-process PPTX → SVG, no LibreOffice, reports per-slide support coverage |
| **Alternate** | [`@pagus-kit/core` + `@pagus-kit/renderer`](https://github.com/pagus-kit/Pagus) (MIT) | PPTX → IR → SVG strings; browser + Node |
| **Alternate (Wasm)** | [`pptx-svg`](https://github.com/t-ujiie-g/pptx-svg) | Wasm PPTX ↔ SVG round-trip; newer/smaller project |
| **iSpring-like HTML5 export (commercial)** | Aspose.Slides HTML5 export | Closest to “presentation runtime” if budget allows |
| **Static fallback (keep)** | LibreOffice → PDF → Poppler PNG (`convert.js`) | Good static visuals; **cannot** preserve objects |

**Prototype in this repo today:**
- `parse.js` → `presentation.json` (OOXML object model via our parser)
- `render.js` → object HTML viewer + PNG fallback per slide
- `convert.js` → unchanged PNG fallback pipeline

---

## Comparison matrix

Legend: **Y** = supported well · **P** = partial · **N** = not supported · **?** = unknown / deck-dependent

| Option | PPT/PPTX | Text | Fonts | Images | Shapes | Tables | Charts | Video | Audio | Animations | Transitions | Quality | License | Node | Local | Browser output |
|--------|----------|------|-------|--------|--------|--------|--------|-------|-------|------------|-------------|---------|---------|------|-------|----------------|
| **1. LibreOffice → PDF → PNG** (current `convert.js`) | P/PPTX | P* | P* | Y | P* | P* | P* | N | N | N | N | Static good | LibreOffice (MPL) + Poppler (GPL) | Y | Y | PNG in HTML |
| **2. OOXML unzip + custom parser** (our `lib/extract-pptx.js`) | PPTX only | P | P | Y | P | N | N | P | P | P detect | P detect | Low–medium | ISC (ours) | Y | Y | Custom HTML |
| **3. python-pptx** | PPTX | P parse | P | P | P | P parse | P parse | P embed | P embed | N | N | N/A (no renderer) | MIT | Python | Y | No |
| **4. pptx-glimpse** | PPTX | Y | P | Y | Y | P | P | ? | ? | ? | ? | High static SVG | MIT | Y (≥22) | Y | SVG embed |
| **5. @pagus-kit** | PPTX | Y | P | Y | Y | Y | P | ? | ? | ? | ? | High SVG+DOM | MIT | Y | Y | SVG/HTML |
| **6. pptx-svg (Wasm)** | PPTX | P | P | Y | P | ? | ? | ? | ? | N | N | SVG | MIT | Y (≥22) | Y | SVG |
| **7. LibreOffice HTML export** | P/PPTX | P | P | P | P | P | P | N | N | N | N | Poor (known broken) | — | Y | Y | HTML |
| **8. Aspose.Slides HTML5** | PPT/PPTX | Y | Y | Y | Y | Y | Y | P | P | Y | Y | High (commercial) | Commercial | Y (via Java/.NET bridge) | Y | HTML5 bundle |
| **9. Nutrient / PSPDFKit** | PDF-first | N/A | — | — | — | — | — | — | — | — | — | PDF/HTML | Commercial | Y | Y | PDF viewer |
| **10. OnlyOffice / Collabora** | P/PPTX | Y | Y | Y | Y | Y | Y | P | P | P | P | High (server) | AGPL/commercial | Server | Y (self-host) | iframe/HTML |

\*Rasterized into PNG — not live objects.

---

## 1. Current: LibreOffice → PDF → PNG

**What it is:** Headless LibreOffice converts deck to PDF; Poppler `pdftoppm` rasterizes each page; HTML viewer shows PNGs.

**Pros**
- Works locally with real `.ppt` and `.pptx`
- Good **static** fidelity for many decks (layout, text as pixels)
- Already implemented in `convert.js`

**Cons**
- **Flattens all objects** — no real text, video, audio, animations, transitions
- Upstream fidelity gate: if PDF is wrong, everything is wrong
- Requires LibreOffice + Poppler system installs
- Poppler is GPL (consider license for SaaS)

**Verdict:** Keep as **fallback renderer only**, not primary path toward iSpring-like behavior.

---

## 2. PPTX OOXML parsing (custom / minimal)

**What it is:** Unzip `.pptx`, parse `ppt/slides/*.xml`, `ppt/media/*`, timing/transition XML.

**Pros**
- Full access to object IDs, geometry (EMU), media relationships
- No Office install
- Already partially implemented: `lib/extract-pptx.js`, `presentation.json`

**Cons**
- OOXML is huge; hand-rolling a full renderer ≈ building PowerPoint
- Theme colors, fonts, charts, groups, SmartArt, 3D, morph — very hard
- Animation XML parsing ≠ animation playback

**Verdict:** Useful for **metadata + media extraction**, not sufficient alone for iSpring-like rendering.

---

## 3. python-pptx

**What it is:** Python library to read/write PPTX.

**Pros:** Reliable for creating fixtures, reading text/shapes, embedding media via `add_movie`.

**Cons:** **No rendering engine.** No animation API. Not a viewer.

**Verdict:** Parser/authoring only — not a rendering solution.

---

## 4. pptx-glimpse (recommended to evaluate)

**Site:** https://glimpse.pptx.app · **npm:** `pptx-glimpse` · **License:** MIT · **Node:** ≥22

**What it is:** In-process PPTX → SVG (or PNG via resvg Wasm). Returns `supportCoverage` per slide.

**Tested on `Improved_Internship_Presentation.pptx` (13 slides):**
- All slides converted to SVG (~30KB/slide)
- `supportCoverage`: 0 skipped/unresolved/fallback elements per slide (simple deck)

**Pros**
- No LibreOffice
- Object-level SVG output (scalable, not flattened PNG)
- Built-in support coverage reporting
- MIT license, Node-native

**Cons**
- PPTX only (not legacy `.ppt`)
- Video/audio/animation/transition support unclear — needs testing on feature-rich decks
- Young project (2026); verify on your iSpring PPTX
- ESM-first API (use dynamic `import()` from CommonJS)

**Verdict:** **Best open-source candidate** for next integration step.

---

## 5. @pagus-kit (Pagus)

**What it is:** Modular PPTX parser + IR + SVG renderer + optional React viewer.

**Pros:** Shapes, images, tables, charts (partial), gradients; MIT; Node + browser.

**Cons:** Less battle-tested than Aspose; media/animation coverage TBD on your decks.

**Verdict:** Strong **#2 open-source option** if pptx-glimpse gaps appear.

---

## 6. pptx-svg (Wasm)

**What it is:** Wasm library for PPTX ↔ SVG round-trip.

**Pros:** Zero npm deps besides Wasm binary; browser + Node 22+.

**Cons:** Smaller community; feature matrix less documented than pptx-glimpse/Pagus.

**Verdict:** Worth a spike if Wasm bundle size matters.

---

## 7. LibreOffice HTML export

**Status in this project:** Explicitly rejected — known broken layout vs PowerPoint/iSpring.

**Verdict:** Do not use.

---

## 8. Aspose.Slides (commercial)

**What it is:** Full PowerPoint API with **HTML5 export** including optional shape animations and transitions.

**Pros**
- Closest commercial path to iSpring-like HTML5 without iSpring itself
- PPT + PPTX, charts, tables, fonts
- Runs locally with license file (offline validation)

**Cons**
- **Paid license** (developer/OEM/server pricing)
- Node bindings via Java or .NET bridge (heavier deployment)
- Evaluation mode watermarks output
- Not open source

**Verdict:** Evaluate if open-source stack fails on real iSpring PPTX.

---

## 9. Nutrient (formerly PSPDFKit) / similar

**Focus:** PDF/document viewing, not native PPTX object model.

**Verdict:** Only relevant if you convert to PDF first — same flattening problem unless paired with another PPTX engine.

---

## 10. OnlyOffice / Collabora Online (self-hosted)

**What it is:** Full office suite in browser/server.

**Pros:** High fidelity for many Office features when self-hosted.

**Cons:** AGPL/commercial licensing; **not** a lightweight embeddable library; server infrastructure; not “minimal POC stack.”

**Verdict:** Production option, overkill for current research phase.

---

## Architecture direction (this repo)

```text
PPT/PPTX
    ↓
[Primary] pptx-glimpse → SVG per slide  (future integration)
    +
[Prototype] OOXML → presentation.json → object HTML viewer
    ↓
[Fallback] LibreOffice → PDF → PNG  (convert.js)
    ↓
Hybrid index.html
```

**Do not claim iSpring equivalence** until side-by-side browser test with your iSpring/iPrint PPTX.

---

## What to test when you provide the real iSpring PPTX

1. `node render.js --file your-deck.pptx` — object model + fallback
2. `node convert.js --file your-deck.pptx` — PNG baseline
3. pptx-glimpse SVG export — compare layout vs PowerPoint vs iSpring iframe
4. Document PASS/PARTIAL/FAIL per feature (layout, fonts, video, audio, anim, transitions)

---

## Server deployment resources (if you move beyond local POC)

This section answers: **what do you need on a server to implement this?**

### Minimal hybrid stack (recommended starting point)

| Resource | Purpose | Notes |
|----------|---------|-------|
| **Node.js 22+** | Run converter + pptx-glimpse | 2–4 GB RAM per worker typical |
| **CPU** | PPTX parse + SVG render | Scale horizontally; conversion is CPU-bound |
| **Disk / temp storage** | Input PPTX, output HTML/SVG/media | Ephemeral; size ≈ 2–5× PPTX |
| **No LibreOffice** | If pptx-glimpse primary works | Simpler ops |
| **LibreOffice + Poppler** | PNG fallback only | Add if hybrid fallback required (~500MB+ install) |

### If using PNG fallback on server

| Resource | Purpose |
|----------|---------|
| LibreOffice (`soffice`) | PPT/PPTX → PDF |
| Poppler (`pdftoppm`) | PDF → PNG |
| Extra CPU/RAM | Headless LO is heavy; avoid concurrent LO on tiny instances |

### If using Aspose (commercial iSpring-like path)

| Resource | Purpose |
|----------|---------|
| Aspose.Slides license | Production HTML5 export |
| JVM or .NET runtime | Node bindings bridge |
| 4–8 GB RAM | Java/.NET + Node process |
| License compliance | Per-server or metered licensing |

### If using OnlyOffice/Collabora (full office server)

| Resource | Purpose |
|----------|---------|
| Dedicated VM(s) | Document server |
| PostgreSQL / RabbitMQ | Often required |
| Reverse proxy (nginx) | HTTPS + iframe embedding |
| Commercial/AGPL license | Production terms |

### Storage & delivery (when you later add infra — out of POC scope)

| Resource | Purpose |
|----------|---------|
| Object storage (S3-compatible) | Store generated HTML, SVG, media |
| CDN | Serve static viewer assets |
| Job queue (Redis/SQS) | Async conversion for large decks |

### Rough sizing (single-tenant POC → small production)

| Scale | Suggested |
|-------|-----------|
| POC / dev | 1 VM, 2 vCPU, 4 GB RAM, Node 22 |
| Small production (hybrid) | 2–4 workers, 4 vCPU each, LibreOffice optional |
| Aspose HTML5 path | 4 vCPU, 8 GB RAM, JVM tuned |
| iSpring parity target | Likely commercial renderer OR full document server — open-source alone is **PARTIAL** at best |

### Licensing checklist for SaaS

- **pptx-glimpse / Pagus:** MIT — generally SaaS-friendly
- **Poppler:** GPL — may affect distribution model
- **LibreOffice:** MPL — generally OK for server use
- **Aspose / Nutrient / OnlyOffice:** Review OEM/server license

---

## Files in this repo

| File | Role |
|------|------|
| `convert.js` | PNG fallback pipeline (unchanged entry point) |
| `parse.js` | OOXML → `presentation.json` |
| `render.js` | Object viewer + PNG fallback |
| `lib/extract-pptx.js` | OOXML extraction |
| `lib/presentation-model.js` | Object model builder |
| `lib/object-viewer.js` | HTML5 player prototype |
| `lib/png-pipeline.js` | Shared PNG fallback |
