# Animation & Transition Result

Generated: 2026-09-02T10:18:32.204Z

Status legend: **PASS** = browser verified (manual) · **PARTIAL** = detected+mapped · **FAIL** = broken · **NOT_PRESENT** = not in deck

## Suite summary

### 01-fade-click

```json
{
  "animationDetection": "PASS",
  "animationObjectMapping": "PASS",
  "fade": "PARTIAL",
  "appear": "NOT_PRESENT",
  "disappear": "NOT_PRESENT",
  "fly": "NOT_PRESENT",
  "zoom": "NOT_PRESENT",
  "spin": "NOT_PRESENT",
  "motionPath": "NOT_PRESENT",
  "clickTrigger": "PARTIAL",
  "withPrevious": "NOT_PRESENT",
  "afterPrevious": "NOT_PRESENT",
  "objectClickTrigger": "NOT_PRESENT",
  "videoClickToPlay": "NOT_PRESENT",
  "audio": "NOT_PRESENT",
  "fadeTransition": "NOT_PRESENT",
  "pushTransition": "NOT_PRESENT",
  "wipeTransition": "NOT_PRESENT",
  "morphDetection": "NOT_PRESENT"
}
```

### 03-fly-in

```json
{
  "animationDetection": "PASS",
  "animationObjectMapping": "PASS",
  "fade": "NOT_PRESENT",
  "appear": "NOT_PRESENT",
  "disappear": "NOT_PRESENT",
  "fly": "PARTIAL",
  "zoom": "NOT_PRESENT",
  "spin": "NOT_PRESENT",
  "motionPath": "NOT_PRESENT",
  "clickTrigger": "PARTIAL",
  "withPrevious": "NOT_PRESENT",
  "afterPrevious": "NOT_PRESENT",
  "objectClickTrigger": "NOT_PRESENT",
  "videoClickToPlay": "NOT_PRESENT",
  "audio": "NOT_PRESENT",
  "fadeTransition": "NOT_PRESENT",
  "pushTransition": "NOT_PRESENT",
  "wipeTransition": "NOT_PRESENT",
  "morphDetection": "NOT_PRESENT"
}
```

### 09-transition-fade

```json
{
  "animationDetection": "NOT_PRESENT",
  "animationObjectMapping": "NOT_PRESENT",
  "fade": "NOT_PRESENT",
  "appear": "NOT_PRESENT",
  "disappear": "NOT_PRESENT",
  "fly": "NOT_PRESENT",
  "zoom": "NOT_PRESENT",
  "spin": "NOT_PRESENT",
  "motionPath": "NOT_PRESENT",
  "clickTrigger": "NOT_PRESENT",
  "withPrevious": "NOT_PRESENT",
  "afterPrevious": "NOT_PRESENT",
  "objectClickTrigger": "NOT_PRESENT",
  "videoClickToPlay": "NOT_PRESENT",
  "audio": "NOT_PRESENT",
  "fadeTransition": "PARTIAL",
  "pushTransition": "NOT_PRESENT",
  "wipeTransition": "NOT_PRESENT",
  "morphDetection": "NOT_PRESENT"
}
```


## Milestone 1 — Fade In + On Click

Deck: `test-files/animation/01-fade-click.pptx`

Manual: open `output/01-fade-click/index.html?animDebug=1` → object hidden → Next → WAAPI fade on object.
