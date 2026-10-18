# iSpring Comparison

Comparison of the repo's PowerPoint → HTML5 pipeline against iSpring Suite,
using the 167-animation effect catalog (`test-files/ispring-effect-catalog.pptx`)
as the reference deck.

iSpring Suite claims support for **167 animations**: Entrance 40, Emphasis 24,
Exit 40, Motion Paths 63. The catalog deck contains one labeled slide per
effect (click a shape to trigger it), plus a cover slide and category index
dividers — 174 slides total. Machine-readable manifest:
`test-files/effect-manifest.json`.

## Effect coverage (ours vs iSpring)

| Category | iSpring | Our deck | Parsed | Renderable | Unsupported |
|---|--:|--:|--:|--:|--:|
| Entrance | 40 | 40 | 40 | 37 | 3 |
| Emphasis | 24 | 24 | 24 | 23 | 1 |
| Exit | 40 | 40 | 40 | 38 | 2 |
| Motion Paths | 63 | 63 | 63 | 63 | 0 |
| **Total** | **167** | **167** | **167** | **161** | **6** |

- **Parsed** = the repo `<p:timing>` parser recognized the slide's timing tree.
- **Renderable** = parsed AND mapped to an effect the HTML5 viewer runtime supports.
- **Unsupported** = parsed but mapped to an effect without a viewer keyframe yet.

Current unsupported set (audit of `output/catalog-audit/.../timelines.json`):

| Name | Category | Parsed as |
|---|---|---|
| Box | Entrance / Exit | `box` (clip filter, no keyframes) |
| Blinds | Entrance / Exit | `blinds` (clip filter) |
| Split (Vertical In) | Entrance | `grow` (preset mis-map) |
| Complementary Color | Emphasis | `colorPulse` (no keyframes) |

Full per-effect report: `test-files/catalog-audit-report.json` and
`docs/EFFECT_CATALOG_FIDELITY.md`.

## How to reproduce

```bash
# 1. Generate the catalog deck + manifest
npm run fixtures:catalog

# 2. Run our own HTML5 pipeline on it and audit each effect
node scripts/effect_catalog_audit.js      # auto-renders, then writes audit JSON + MD
```

To compare with iSpring: run the catalog deck through iSpring Suite's
PowerPoint → HTML5 export, then walk the deck side-by-side with
`docs/EFFECT_CATALOG_FIDELITY.md` and `test-files/effect-manifest.json`.

## Improving exotic-effect fidelity (recording workflow)

The catalog generator approximates the Canonical OOXML for Moderate/Exciting
presets (Center Revolve, Boomerang, Flip, Pinwheel, Shimmer, ...) and
reconstructs the 63 motion-path curves from geometry. For exact PowerPoint-
authored trees:

1. In PowerPoint (VBA): import `scripts/record_exotic_animations.bas` and run
   `RecordAllPresets`. It appends one slide per `msoAnimEffect` preset with a
   single labelled shape, so PowerPoint writes the canonical `<p:timing>`.
2. Save as e.g. `test-files/recorded-presets.pptx`.
3. Extract the real per-slide timing XML:

   ```bash
   python3 scripts/extract_recorded_animations.py test-files/recorded-presets.pptx \
     --out test-files/recorded
   ```

4. Use the per-preset `.xml`/`.json` in `test-files/recorded/` to replace the
   approximated recipe rows in `scripts/effect_catalog.py`, then regenerate.

## Feature-level comparison matrix

| Feature | iSpring | Our viewer | Notes |
|---|---|---|------|
| Static slide | Yes | Yes | pptx-glimpse SVG |
| Entrance/Exit/Emphasis | 167 effects | 161 of 167 rendered | 6 gap effects listed above |
| Motion paths | 63 | 63 (geometry approximations) | exact capture via VBA workflow |
| Click trigger | Yes | Yes | on-click sequencing |
| Fonts | Yes | Partial | no embedded font extraction |
| Charts/Tables/SmartArt | Yes | Partial | PNG fallback via LibO |
| Video/Audio | Yes | Basic overlay | no media timing parity |
| Transitions | Yes | CSS subset | fade/push/wipe partial |

Drop a reference deck into `test-files/phase2/` and re-run
`node scripts/run_phase2_suite.js` for the broader feature suite.