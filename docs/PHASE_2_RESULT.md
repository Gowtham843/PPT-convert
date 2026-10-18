# Phase 2 Result

## Architecture

```text
PPTX → pptx-glimpse SVG + editor session object map
     → OOXML timeline/tables/charts/theme/media
     → Phase 2 HTML5 player (click-through animations)
     → PNG fallback (SmartArt/complex chart/unresolved glimpse)
```

## Feature support

| Feature | Result |
|---------|--------|
| Static rendering | PASS |
| Text | PASS |
| Fonts | PARTIAL |
| Images | PASS |
| Shapes | PASS |
| Tables | N/A |
| Charts | N/A |
| SmartArt | N/A |
| Video | N/A |
| Audio | PARTIAL |
| Appear | N/A |
| Fade | N/A |
| Fly In | PARTIAL |
| Fly Out | N/A |
| Zoom | N/A |
| Spin | N/A |
| Motion | N/A |
| Fade transition | N/A |
| Push transition | PARTIAL |
| Wipe transition | N/A |
| Other transitions | PARTIAL |
| Click triggers | PARTIAL |
| Animation sequencing | PARTIAL |

## Fidelity scores

| Category | Score |
|----------|-------|
| Static visual | 90/100 |
| Media | 48/100 |
| Animation | 43/100 |
| Transition | 48/100 |
| Font | 55/100 |
| **Overall** | **57/100** |
| Est. iSpring parity | ~45% |

Methodology: Rubric: PASS≈90, PARTIAL≈55, FAIL≈15 per category; overall is mean of five categories. Not iSpring-calibrated.

## Performance

| Metric | Value |
|--------|-------|
| Input size | 32.5 MB |
| SVG generation | 3938 ms |
| PNG fallback | N/A ms |
| Total | 4894 ms |
| SVG slides | 15 |
| PNG fallback slides | 0 |

## Blockers

- pptx-glimpse does not expose spid in SVG — mapping via editor session + aria-label index
- PowerPoint presetID coverage incomplete — many effects map to CSS approximations
- Chart OOXML → static SVG is basic; complex charts need PNG or commercial renderer
- SmartArt requires PNG fallback — no open-source SmartArt → SVG path verified
- Font theme resolved but embedded fonts not shipped — browser substitution
- No iSpring reference deck provided for parity verification


==============================
PHASE 2 CONCLUSION
==============================

Estimated iSpring fidelity: ~45% (conservative; no iSpring deck tested)

Good enough for:
- Static/text/shape/image decks via pptx-glimpse SVG
- Basic HTML5 video/audio overlays with controls
- Click-through animation demos (fade/appear/fly approximations)
- Basic slide transitions (CSS subset)
- Research/POC to measure gaps vs commercial HTML5 export

Not good enough for:
- iSpringCloud/iPrintCloud parity (animations, triggers, media timing)
- Complex charts, SmartArt, embedded font fidelity
- Exact PowerPoint animation preset reproduction
- Production LMS delivery without per-deck QA

Main blockers:
- Incomplete OOXML animation preset → visual effect mapping
- SVG object IDs not native in glimpse output (workaround: editor session map)
- Tables/charts/SmartArt need PNG or commercial renderer for fidelity
- Browser autoplay restrictions vs PowerPoint media behavior

Can we continue with open-source?
MAYBE

If NO (production iSpring-like):
Recommended commercial renderer: Aspose.Slides HTML5 export, or iSpring SDK / Nutrient/PDFTron PPT SDK

If YES (research path):
Phase 3 priorities:
1. Side-by-side test with real iSpring/iPrint PPTX
2. Evaluate Aspose/Nutrient trial on same decks
3. Motion path + emphasis preset library expansion
4. Embedded font extraction (woff) where licensed

