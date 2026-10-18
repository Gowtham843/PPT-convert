# SlidesCarnival Deck Analysis — Minimal Morph Space Themed Background Slides

**Source file (unmodified):**  
`/Users/gowtham/Downloads/Minimal Morph Space Themed Background Slides .pptx`

**Analysis date:** 2026-08-21  
**Method:** Direct ZIP/XML inspection of the original download — no re-save, no inference from template title.

**Rendered output:**  
`output/Minimal Morph Space Themed Background Slides /index.html`

---

## Executive summary (XML-only)

| Question | Answer |
|----------|--------|
| Contains `<p:morph>`? | **No** — zero matches in entire package |
| Slides with Morph | **None** |
| Contains `<p:timing>` animation trees? | **No** — zero matches in entire package |
| Object animations stored? | **None** |
| Slide transitions stored? | **Yes** — `<p:fade spd="slow"/>` on slides 2–22 |
| Video/audio in OOXML? | **No** — no `p:video`, `p:audio`, or `p:media` tags |
| Embedded media files | **62 PNG + 1 JPG** in `ppt/media/` (static images only) |
| Cross-slide object ID reuse? | **No** — 0 shared `cNvPr id` values on any consecutive slide pair |

The word **“Morph”** in the template name is **not** reflected in OOXML. This deck uses **slow fade** slide transitions only. Visual continuity between slides comes from **static background artwork**, not PowerPoint Morph transition metadata.

---

## 1. Does it contain `<p:morph>` transitions?

**No.**

Full-package scan of all ZIP entries (`ppt/slides/*`, masters, layouts, presentation.xml, etc.):

```text
rg 'p:morph' → 0 matches
```

---

## 2. Which slides contain Morph?

**None.**

`morphSlides: []`

---

## 3. Does it contain `<p:timing>` animation trees?

**No.**

```text
rg 'p:timing' → 0 matches (any file in package)
```

Therefore there are also **no**:

- `p:clickEffect` / `p:animEffect` / `p:animMotion` blocks
- `p:interactiveSeq` object-click sequences
- `p:set` opacity animation steps

---

## 4. Object IDs on consecutive slides

Each slide defines its own shape IDs (`p:cNvPr id="…"`). IDs **monotonically increase** across the deck (Google Slides export pattern). Example:

| Slide | Shape count (XML) | Sample IDs | Sample names |
|-------|-------------------|------------|--------------|
| 1 | 11 | 39–49 | `Shape 39`, `Google Shape;40;p10` … |
| 2 | 15 | 53–67 | `Shape 53`, `Google Shape;54;p11` … |
| 3 | 12 | 71–82 | `Google Shape;72;p12` … |
| 21 | 72 | (largest slide) | many `Google Shape;…` |
| 22 | 14 | — | — |

Shape names like `Google Shape;40;p10` indicate **Google Slides → PPTX export**, not native PowerPoint-authored morph pairs.

---

## 5. Can the same objects be matched between slides?

**Not by stable OOXML object ID.**

Consecutive-pair analysis (slides 1→2, 2→3, … 21→22):

```text
sharedIdCount = 0 for all 21 pairs
anySharedIds = false
```

| Pair | IDs slide N | IDs slide N+1 | Shared IDs |
|------|-------------|---------------|------------|
| 1 → 2 | 11 | 15 | 0 |
| 2 → 3 | 15 | 12 | 0 |
| … | … | … | 0 |
| 21 → 22 | 72 | 14 | 0 |

**Implication:** A real Morph engine cannot rely on `cNvPr id` continuity in this file. Matching would require heuristics (name similarity, geometry, image hash) — and there is **no morph transition XML** requesting such matching anyway.

---

## 6. Transitions actually stored

### Slide 1

No `<p:transition>` element.

### Slides 2–22 (identical pattern)

```xml
<p:transition spd="slow">
  <p:fade/>
</p:transition>
```

| Slide | Transition XML | Parsed type | Speed |
|-------|----------------|-------------|-------|
| 1 | *(absent)* | `none` | — |
| 2–22 | `<p:transition spd="slow"><p:fade/></p:transition>` | `fade` | `slow` (900 ms in our engine) |

**Not present:** `p:morph`, `p:push`, `p:wipe`, `p:split`, `p:cover`, `p:dissolve`, etc.

---

## 7. Animations actually stored

**None.**

No slide contains `<p:timing>`. Object-level entrance/emphasis/exit animations are **not encoded** in this PPTX.

---

## 8. Video / audio objects

**None in OOXML.**

| Check | Result |
|-------|--------|
| `p:video` tags | 0 |
| `p:audio` tags | 0 |
| `p:media` tags | 0 |
| `ppt/media/*.mp4` / `.mp3` / `.wav` | 0 files |
| `ppt/media/*` | 62 × `.png`, 1 × `.jpg` (embedded pictures) |

Images are rendered as static SVG `<image>` elements via pptx-glimpse — not as HTML5 video/audio overlays.

---

## Actual XML examples (verbatim)

### Transition (slide 2 — representative of slides 2–22)

```xml
<p:transition spd="slow"><p:fade/></p:transition>
```

### Slide 1 tail (no transition, no timing)

```xml
</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping /></p:clrMapOvr></p:sld>
```

*(No `<p:timing>` or `<p:transition>` before `</p:sld>`.)*

---

## Morph: not present — what real Morph would require

**This file contains no `<p:morph>` to implement.** For reference, a genuine PowerPoint Morph transition looks like:

```xml
<p:transition spd="med">
  <p:morph option="byObject"/>
</p:transition>
```

Optional attributes seen in real decks: `option="byObject" | "byChar"`, sometimes combined with `advClick`, `advTm`.

To reproduce Morph (when XML exists), we would need:

1. **Detection:** `<p:morph>` on the *incoming* slide’s `<p:transition>`.
2. **Object correspondence:** stable IDs or heuristic matching between slide N and N+1 shapes (position, size, name, type, text, image blob).
3. **Per-object geometry:** `a:xfrm` off/ext, rotation, fill, path — from both slides.
4. **Interpolation engine:** tween position/size/rotation/opacity (and path morph for freeform) over transition duration.
5. **Separate from fade:** must not alias morph → CSS fade.

**This SlidesCarnival deck provides none of that** — only unrelated static backgrounds that *look* similar visually.

---

## What our parser extracts

Run: `extractPhase2Features()` on the unmodified file.

| Slide | Shapes | Timeline | Animations | Media | Transition | Morph detected |
|-------|--------|----------|------------|-------|------------|----------------|
| 1 | 10 | 0 | 0 | 0 | `none` | false |
| 2–22 | 9–63 | 0 | 0 | 0 | `fade` / rawType `fade` | false |

Parser correctly reports:

- **21 fade transitions** (slides 2–22)
- **0 animations**
- **0 morph**

---

## What our viewer reproduces

| Feature in XML | Viewer behavior | Status |
|----------------|-----------------|--------|
| Static shapes/images/text | SVG via pptx-glimpse + object map | **Works** |
| Slide 1 (no transition) | Instant slide show | **Works** |
| Slides 2–22 fade `spd="slow"` | CSS `tx-fade` ~900 ms | **Works** (approximation) |
| Object click animations | N/A — none in file | N/A |
| Morph | N/A — none in file | N/A |
| Video/audio | N/A — none in file | N/A |

**Render stats:**

- 22 SVG slides, 0 PNG fallback
- ~240 MB output (large embedded PNG backgrounds)
- 320 total object-map entries across slides
- `clickSteps: []` on every slide
- `hiddenOnLoad: []` on every slide

**Open viewer:**

```text
file:///Users/gowtham/Downloads/ppt-converter/output/Minimal Morph Space Themed Background Slides /index.html
```

Use **Next** — slides 2+ should cross-fade (CSS), not morph objects.

---

## What is missing (vs template marketing name)

| Expected from name “Morph Space” | In actual XML |
|----------------------------------|---------------|
| PowerPoint Morph transitions | **Absent** |
| Object animations | **Absent** |
| Cross-slide object identity | **Absent** (IDs reset each slide) |
| Motion paths / click builds | **Absent** |
| Video/audio | **Absent** |

What **is** present: a **themed static space background** on each slide + **slow fade** when advancing. The “morph-like” visual effect in PowerPoint/Slides preview is **art direction**, not OOXML Morph.

---

## Package inventory (relevant parts)

| Path | Count / notes |
|------|----------------|
| `ppt/slides/slide1.xml` … `slide22.xml` | 22 slides |
| `ppt/media/image*.png` | 62 files |
| `ppt/media/image8.jpg` | 1 file |
| `ppt/media/*.mp4` / audio | **0** |
| Total PPTX size | ~80 MB |
| Render output size | ~240 MB |

---

## Conclusion

**Minimal Morph Space Themed Background Slides** from SlidesCarnival is a **static SVG/image-heavy template** with **slow fade transitions only**. It is **not** a Morph transition test deck in OOXML terms.

Our engine:

- **Correctly parses** fade transitions on slides 2–22.
- **Correctly finds** zero animations and zero morph.
- **Renders** all slides as SVG with working fade slide transitions.
- **Cannot** reproduce Morph or object animations — because **they do not exist in the file**.

No Morph implementation was added (per instructions — none to implement).
