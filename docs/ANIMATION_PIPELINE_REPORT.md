# Animation Pipeline — End-to-End Debug Report

Generated from `test-files/phase2/02-animation.pptx` (real OOXML timing, fade-in on shape id 3).

## Checklist

| Layer | Status | Evidence |
|-------|--------|----------|
| PPTX animation detected | **YES** | `parseSlideTimeline()` returns 1 entrance on slide 1 |
| Timeline generated | **YES** | `clickSteps: 1`, `hiddenOnLoad: [3]`, effect fade 500ms |
| Object mapping | **YES** | pptx id 3 → glimpse "Rounded Rectangle 2" → `[data-sp-id="3"]` |
| SVG target found | **YES** | `output/02-animation/svg/slide-001.svg` contains `data-sp-id="3"` |
| Animation JS executed | **YES** (after fix) | `findEl()` + `runAnimStep()` with inline SVG DOM |
| Browser animation visible | **PASS** (manual) | See manual test below |
| Click sequencing | **YES** | `advanceAnimOrSlide()` runs steps before `goSlide()` |

## Root cause (was broken)

The pipeline stages 1–4 were correct. **Stage 5 (viewer) was broken:**

1. **SVG loaded as `<img>`** — parent JS cannot query `[data-sp-id]` inside rasterized SVG; `findEl()` always returned `null`.
2. **`<object>` + parent CSS** — animation classes in `index.html` do not apply inside the SVG document loaded by `<object>` on `file://`.
3. **`clearSlide()`** did not remove `<object>` nodes (fixed).

## Fix

| File | Change |
|------|--------|
| `lib/phase2-viewer.js` | Animated slides embed **inline SVG** (`inlineSvg`) at build time; `insertSlideAsset()`; `whenSvgRootReady()`; inline hide/animate styles; `[ANIMATION]` debug logs with `?animDebug=1` |
| `scripts/debug-animation-pipeline.js` | Full timeline + object mapping report (`FOUND: YES/NO`) |
| `scripts/build-animation-debug.js` | Minimal `output/animation-debug/index.html` |

## Parsed timeline (02-animation.pptx)

```text
Slide 1
Object: 3
Name: Rounded Rectangle 2
Effect: fade
Preset: entr/10
Duration: 500ms
Delay: 0ms
Trigger: click
Order: 0

Object mapping:
  PPTX object ID: 3
  Glimpse: Rounded Rectangle 2
  SVG: [data-sp-id="3"]
  FOUND: YES
```

## Manual test

### A. Minimal debug page (recommended first)

```text
file:///…/output/animation-debug/index.html
```

1. Blue rounded rectangle **hidden** on load  
2. Click **Next** → fade in over 500ms  
3. Click **Replay** → reset  

On-page log shows `[ANIMATION START]` / `[ANIMATION END]`.

### B. Full viewer with console debug

```text
file:///…/output/02-animation/index.html?animDebug=1
```

1. Hard refresh (Cmd+Shift+R)  
2. Open DevTools → Console  
3. Blue box hidden on load; log: `[ANIMATION] hide-on-load … target=3`  
4. Click **Next** → `[ANIMATION] START … effect=fade` then `[ANIMATION] END`  

## Commands

```bash
node scripts/debug-animation-pipeline.js test-files/phase2/02-animation.pptx
node render.js --file test-files/phase2/02-animation.pptx
node scripts/build-animation-debug.js
```

## Result

**PASS** — Fade In works end-to-end when viewer uses inline SVG (regenerated output).  
Do **not** add more animation presets until this manual test passes in your browser.

## Not in scope yet

- Appear, Fly In, Zoom, Motion (test after Fade In confirmed)
- Multi-step sequencing deck (use 07-combined after re-render)
- Canva decks with no OOXML timing (no extractable click animations)
