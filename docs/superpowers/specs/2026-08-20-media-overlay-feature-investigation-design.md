# Media Overlay & Feature Investigation Design

**Date:** 2026-08-20  
**Status:** Approved

## Goal

Honestly measure how close LibreOffice → PDF → PNG + PPTX media extraction can get to an iSpringCloud-style viewer for video, audio, animations, and transitions.

## Architecture

```text
PPTX
 ├─ LibreOffice → PDF → PNG          (static visual base — unchanged)
 └─ Unzip/parse OOXML                 (media, rels, timing, transition)
              ↓
     HTML viewer: PNG + optional <video>/<audio> overlays
```

## Honesty rules

- Detected ≠ Preserved ≠ Viewer works
- PNG pipeline does **not** preserve video/audio/animations/transitions
- Overlay support only claimed if media plays in the local viewer
- Animations/transitions: detect XML; do **not** claim iSpring equivalence

## Fixtures

`test-files/01`–`06` via `python-pptx` + documented OOXML injection. Not PowerPoint-UI validated.

## Later

Drop a real iSpring/iPrint PPTX into `test-files/` and run the same suite.
