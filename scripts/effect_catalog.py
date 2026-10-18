#!/usr/bin/env python3
"""Canonical effect catalog for building an iSpring-effect comparison deck.

Mirrors the 167 animations iSpring Suite claims to convert (Entrance 40,
Emphasis 24, Exit 40, Motion Paths 63). For each effect we record the
preset triple (presetID / presetClass / presetSubtype) PowerPoint uses and
the behavior recipe that produces the motion. Behavior OOXML is written by
the dependent builder; this module only supplies the data.

Preset IDs follow PowerPoint's standard tables where known; effects whose
extended preset ID is uncertain rely on correct behavior atoms (presetID is
optional in the pml schema) so playback is what matters for the comparison.
"""

from __future__ import annotations

import math

# Direction bitmask codes PowerPoint uses on directional effects (Fly/Wipe).
SUB_BOTTOM, SUB_TOP, SUB_LEFT, SUB_RIGHT = "4", "1", "8", "2"

# ---------------------------------------------------------------- entrance
# Each entry: (name, presetID, presetClass, subtype-or-None, recipe)
# recipe is a dict of parameters consumed by the builder's behavior emitter.
ENTRANCE = [
    ("Appear", "1", "entr", None, {"m": "appear"}),
    ("Box", "4", "entr", "16", {"m": "flt", "f": "box"}),
    ("Circle", "6", "entr", "16", {"m": "flt", "f": "circle"}),
    ("Diamond", "8", "entr", "16", {"m": "flt", "f": "diamond"}),
    ("Blinds", "3", "entr", "8", {"m": "flt", "f": "blinds(vertical)"}),
    ("Checkerboard", "5", "entr", "1", {"m": "flt", "f": "checkerboard(across)"}),
    ("Dissolve In", "9", "entr", None, {"m": "flt", "f": "dissolve"}),
    ("Fly In (From Bottom)", "2", "entr", SUB_BOTTOM, {"m": "fly", "sub": SUB_BOTTOM}),
    ("Peek In (From Bottom)", "12", "entr", SUB_BOTTOM, {"m": "fly", "sub": SUB_BOTTOM, "peek": True}),
    ("Random Bars", "14", "entr", "1", {"m": "flt", "f": "randombars(horizontal)"}),
    ("Split (Vertical In)", "16", "entr", "26", {"m": "flt", "f": "barn(inVertical)"}),
    ("Wedge", "20", "entr", None, {"m": "flt", "f": "wedge"}),
    ("Wipe (From Bottom)", "22", "entr", SUB_BOTTOM, {"m": "flt", "f": "wipe(up)"}),
    ("Plus", "13", "entr", "4", {"m": "flt", "f": "plus"}),
    ("Strips (Down Left)", "18", "entr", "1", {"m": "flt", "f": "strips(downleft)"}),
    ("Wheel (1 Spoke)", "21", "entr", "1", {"m": "wheel", "spokes": 1}),
    ("Expand", "50", "entr", None, {"m": "expand"}),
    ("Fade", "10", "entr", None, {"m": "fade"}),
    ("Swivel", "19", "entr", "1", {"m": "swivel"}),
    ("Zoom", "23", "entr", "16", {"m": "zoom"}),
    ("Basic Zoom (In)", "53", "entr", "16", {"m": "zoom"}),
    ("Center Revolve", "47", "entr", None, {"m": "center_revolve"}),
    ("Grow & Turn", "37", "entr", None, {"m": "grow_turn"}),
    ("Spinner", "51", "entr", None, {"m": "spinner", "by": 17200000}),
    ("Float Down (In)", "52", "entr", None, {"m": "float_in", "dy": 0.06}),
    ("Float Up (In)", "53", "entr", None, {"m": "float_in", "dy": -0.06}),
    ("Rise Up", "40", "entr", None, {"m": "rise_up"}),
    ("Compress", "56", "entr", None, {"m": "compress", "axis": "y"}),
    ("Stretch", "17", "entr", "1", {"m": "stretch", "axis": "y"}),
    ("Basic Swivel", "54", "entr", None, {"m": "swivel"}),
    ("Bounce", "33", "entr", None, {"m": "bounce_in"}),
    ("Curve Up", "34", "entr", None, {"m": "curve_up"}),
    ("Flip", "35", "entr", None, {"m": "flip"}),
    ("Pinwheel", "39", "entr", None, {"m": "spinner", "by": 17200000}),
    ("Whip", "45", "entr", None, {"m": "whip"}),
    ("Boomerang", "32", "entr", None, {"m": "boomerang_in"}),
    ("Credits", "34", "entr", None, {"m": "credits"}),
    ("Drop", "36", "entr", None, {"m": "drop_in"}),
    ("Float", "30", "entr", None, {"m": "float_in", "dy": -0.08}),
    ("Spiral In", "15", "entr", None, {"m": "spiral_in"}),
]

# ---------------------------------------------------------------- exit
EXIT = [
    ("Blinds", "3", "exit", "8", {"m": "flt", "f": "blinds(vertical)"}),
    ("Checkerboard", "5", "exit", "1", {"m": "flt", "f": "checkerboard(across)"}),
    ("Diamond", "8", "exit", "16", {"m": "flt", "f": "diamond"}),
    ("Dissolve Out", "9", "exit", None, {"m": "flt", "f": "dissolve"}),
    ("Peek Out (To Bottom)", "12", "exit", SUB_BOTTOM, {"m": "fly_out", "sub": SUB_BOTTOM}),
    ("Random Bars", "14", "exit", "1", {"m": "flt", "f": "randombars(horizontal)"}),
    ("Strips (Up Right)", "18", "exit", "2", {"m": "flt", "f": "strips(upright)"}),
    ("Wheel (1 Spoke)", "21", "exit", "1", {"m": "wheel", "spokes": 1}),
    ("Box", "4", "exit", "16", {"m": "flt", "f": "box"}),
    ("Circle", "6", "exit", "16", {"m": "flt", "f": "circle"}),
    ("Disappear", "1", "exit", None, {"m": "appear"}),
    ("Fly Out (To Right)", "2", "exit", SUB_RIGHT, {"m": "fly_out", "sub": SUB_RIGHT}),
    ("Plus", "13", "exit", "4", {"m": "flt", "f": "plus"}),
    ("Split (Vertical Out)", "16", "exit", "28", {"m": "flt", "f": "barn(outVertical)"}),
    ("Wedge", "20", "exit", None, {"m": "flt", "f": "wedge"}),
    ("Wipe (To Bottom)", "22", "exit", SUB_BOTTOM, {"m": "flt", "f": "wipe(down)"}),
    ("Contract", "17", "exit", "16", {"m": "contract"}),
    ("Fade", "10", "exit", None, {"m": "fade"}),
    ("Swivel", "19", "exit", "1", {"m": "swivel"}),
    ("Zoom", "23", "exit", "16", {"m": "zoom"}),
    ("Basic Zoom (Out)", "53", "exit", "16", {"m": "zoom"}),
    ("Center Revolve", "47", "exit", None, {"m": "center_revolve"}),
    ("Float Down (Out)", "52", "exit", None, {"m": "float_out", "dy": 0.06}),
    ("Float Up (Out)", "53", "exit", None, {"m": "float_out", "dy": -0.06}),
    ("Shrink & Turn", "44", "exit", None, {"m": "shrink_turn"}),
    ("Spinner", "51", "exit", None, {"m": "spinner", "by": 17200000}),
    ("Sink Down", "43", "exit", None, {"m": "sink_down"}),
    ("Collapse", "55", "exit", None, {"m": "collapse"}),
    ("Stretchy", "56", "exit", None, {"m": "stretchy"}),
    ("Basic Swivel", "54", "exit", None, {"m": "swivel"}),
    ("Bounce", "33", "exit", None, {"m": "bounce_out"}),
    ("Curve Down", "34", "exit", None, {"m": "curve_down"}),
    ("Flip", "35", "exit", None, {"m": "flip"}),
    ("Pinwheel", "39", "exit", None, {"m": "spinner", "by": 17200000}),
    ("Whip", "45", "exit", None, {"m": "whip"}),
    ("Boomerang", "32", "exit", None, {"m": "boomerang_out"}),
    ("Credits", "34", "exit", None, {"m": "credits_out"}),
    ("Drop", "36", "exit", None, {"m": "drop_out"}),
    ("Float", "30", "exit", None, {"m": "float_out", "dy": -0.08}),
    ("Spiral Out", "15", "exit", None, {"m": "spiral_out"}),
]

# ---------------------------------------------------------------- emphasis
EMPHASIS = [
    ("Fill Color (→ red)", "1", "emph", None, {"m": "fill", "hex": "C00000"}),
    ("Font Color (→ red)", "2", "emph", None, {"m": "font", "hex": "C00000"}),
    ("Grow/Shrink (→ 150%)", "6", "emph", None, {"m": "grow", "pct": 150000}),
    ("Transparency (→ 50%)", "9", "emph", None, {"m": "opacity", "val": "0.5"}),
    ("Spin (360°)", "8", "emph", None, {"m": "spin", "by": 21600000}),
    ("Line Color (→ red)", "7", "emph", None, {"m": "line", "hex": "C00000"}),
    ("Bold Flash", "10", "emph", None, {"m": "bold_flash"}),
    ("Complementary Color", "14", "emph", None, {"m": "fill", "hex": "00B050"}),
    ("Complementary Color 2", "15", "emph", None, {"m": "fill", "hex": "ED7D31"}),
    ("Brush Color", "12", "emph", None, {"m": "font", "hex": "7030A0"}),
    ("Contrasting Color", "16", "emph", None, {"m": "fill", "hex": "FFC000"}),
    ("Darken", "17", "emph", None, {"m": "opacity", "val": "0.3"}),
    ("Desaturate", "18", "emph", None, {"m": "fill", "hex": "808080"}),
    ("Lighten", "22", "emph", None, {"m": "fill", "hex": "FFFFFF"}),
    ("Object Color", "25", "emph", None, {"m": "fill", "hex": "C00000"}),
    ("Pulse", "35", "emph", None, {"m": "pulse"}),
    ("Underline", "17", "emph", None, {"m": "underline"}),
    ("Color Pulse", "20", "emph", None, {"m": "fill_cycle"}),
    ("Grow With Color", "21", "emph", None, {"m": "grow_color"}),
    ("Shimmer", "38", "emph", None, {"m": "shimmer"}),
    ("Teeter", "32", "emph", None, {"m": "teeter"}),
    ("Blink", "26", "emph", None, {"m": "blink"}),
    ("Bold Reveal", "11", "emph", None, {"m": "bold_reveal"}),
    ("Wave", "25", "emph", None, {"m": "wave"}),
]

# ---------------------------------------------------------------- motion paths
def _fmt(n):
    n = round(n, 4)
    if abs(n) < 1e-9:
        return "0"
    s = ("%.4f" % n).rstrip("0").rstrip(".")
    if s == "" or s == "-":
        return "0"
    return s


def _poly_path(n, r=0.22, rot=0.0):
    """Regular n-gon motion path centered at origin (relative slide units)."""
    pts = []
    for i in range(n):
        a = rot + 2 * math.pi * i / n
        pts.append(f"{_fmt(r * math.cos(a))} {_fmt(r * math.sin(a))}")
    return "M 0 0 L " + " L ".join(pts) + " E"


def _star_path(r_outer=0.24, r_inner=0.1, n=5):
    pts = []
    for i in range(2 * n):
        a = -math.pi / 2 + math.pi * i / n
        rad = r_outer if i % 2 == 0 else r_inner
        pts.append(f"{_fmt(rad * math.cos(a))} {_fmt(rad * math.sin(a))}")
    return "M 0 0 L " + " L ".join(pts) + " E"


def _circle_path(r=0.22):
    k = 0.552
    c = r * k
    return (
        f"M 0 0 C {c:.3f} -{r:.3f} {r:.3f} -{c:.3f} {r:.3f} 0 "
        f"C {r:.3f} {c:.3f} {c:.3f} {r:.3f} 0 {r:.3f} "
        f"C -{c:.3f} {r:.3f} -{r:.3f} {c:.3f} -{r:.3f} 0 "
        f"C -{r:.3f} -{c:.3f} -{c:.3f} -{r:.3f} 0 -{r:.3f} E"
    )


def _heart_path():
    return (
        "M 0 0 C 0 0.05 -0.05 0.08 -0.08 0.08 "
        "C 0 -0.02 0 -0.05 0 -0.06 C 0 -0.05 0 -0.02 0.04 0.02 "
        "C 0.08 0.0 0.1 0.02 0.08 0.06 C 0.05 0.08 0.03 0.09 0 0.0 E"
    )


def _teardrop_path():
    return (
        "M 0 -0.18 C 0.16 0.02 0.12 0.1 0.06 0.11 "
        "C 0.03 0.12 0.01 0.11 0 0.1 C -0.01 0.11 -0.03 0.12 -0.06 0.11 "
        "C -0.12 0.1 -0.16 0.02 0 -0.18 E"
    )


def _line_path(dx, dy):
    return f"M 0 0 L {_fmt(dx)} {_fmt(dy)} E"


def _s_curve(dx=0.3, dy=0.08):
    return f"M 0 0 C {dx*0.33:.3f} -{dy/2:.3f} {dx*0.66:.3f} {dy/2:.3f} {dx:.3f} 0 E"


def _spring(dx=0.3):
    seg = dx / 6
    return (
        "M 0 0 L "
        + " ".join(f"{_fmt(seg*(k+1))} {_fmt(0.05 if k % 2 == 0 else -0.05)}" for k in range(6))
        + " E"
    )


def _zigzag(dx=0.28, amp=0.14):
    seg = dx / 8
    coords = []
    for k in range(8):
        coords.append(f"{_fmt(seg*(k+1))} {_fmt(amp if k % 2 == 0 else -amp)}")
    return "M 0 0 L " + " ".join(coords) + " E"


def _wave(dx=0.3, amp=0.06, n=3):
    seg = dx / (2 * n)
    coords = []
    for k in range(2 * n):
        y = amp if k % 2 == 0 else -amp
        coords.append(f"{_fmt(seg*(k+1))} {_fmt(y)}")
    return "M 0 0 L " + " ".join(coords) + " E"


def _arc(dx, dy, bulge):
    return f"M 0 0 C {dx*0.5:.3f} {_fmt(bulge)} {dx:.3f} {_fmt(dy-bulge)} {_fmt(dx)} {_fmt(dy)} E"


# name -> path string (relative slide-unit coordinates)
MOTION_PATHS = {
    "4 Point Star": _star_path(n=4),
    "5 Point Star": _star_path(n=5),
    "6 Point Star": _star_path(n=6),
    "8 Point Star": _star_path(n=8),
    "Hexagon": _poly_path(6),
    "Octagon": _poly_path(8),
    "Pentagon": _poly_path(5),
    "Parallelogram": "M 0 0 L -0.12 0.12 L 0.12 0.12 L 0.24 0 E",
    "Circle": _circle_path(),
    "Crescent Moon": "M 0 0 C 0.08 0.08 0.16 0.05 0.18 -0.05 C 0.12 0.0 0.06 0.0 0 0 E",
    "Right Triangle": "M 0 0 L 0.24 0 L 0 0.2 E",
    "Square": "M 0 0 L 0.2 0 L 0.2 0.2 L 0 0.2 E",
    "Diamond": "M 0 0 L 0.14 -0.14 L 0.28 0 L 0.14 0.14 E",
    "Equal Triangle": "M 0 0 L 0.2 0 L 0.1 0.17 E",
    "Teardrop": _teardrop_path(),
    "Trapezoid": "M 0 0 L -0.06 0.1 L 0.1 0.1 L 0.16 0 E",
    "Football": "M 0 0 C -0.06 0.12 0.06 0.14 0.02 0.04 C 0.12 0.1 0.16 -0.1 0 -0.04 E",
    "Heart": _heart_path(),
    "Arc Down": _arc(0.28, 0.12, 0.1),
    "Arc Left": _arc(0.12, -0.28, 0.1),
    "Arc Right": _arc(0.12, 0.28, 0.1),
    "Arc Up": _arc(0.28, -0.12, 0.1),
    "S Curve 1": _s_curve(0.3, 0.1),
    "S Curve 2": _s_curve(0.3, -0.1),
    "Spring": _spring(),
    "Sine Wave": _wave(0.3, 0.06, 3),
    "Wave": _wave(0.3, 0.06, 2),
    "Decaying Wave": "M 0 0 C 0.05 0.08 0.1 0.02 0.15 0.06 C 0.2 0.09 0.25 0.03 0.3 0.05 E",
    "Bounce Left": "M 0 0 L 0 -0.06 L -0.05 0.02 L -0.1 -0.04 L -0.15 0 E",
    "Bounce Right": "M 0 0 L 0 -0.06 L 0.05 0.02 L 0.1 -0.04 L 0.15 0 E",
    "Turn Down": "M 0 0 L 0.05 0 L 0.05 0.15 L 0.1 0.15 E",
    "Turn Up": "M 0 0 L 0.05 0 L 0.05 -0.15 L 0.1 -0.15 E",
    "Turn Down Right": _arc(0.15, 0.15, 0.08),
    "Turn Up Right": _arc(0.15, -0.15, 0.08),
    "Curvy Left": _line_path(-0.28, 0),
    "Curvy Right": _line_path(0.28, 0),
    "Spiral Left": "M 0 0 C -0.03 0.03 -0.05 0.05 -0.08 0.04 C -0.09 0.01 -0.06 -0.03 -0.02 -0.03 C 0.03 -0.02 0.02 0.05 -0.04 0.06 E",
    "Spiral Right": "M 0 0 C 0.03 0.03 0.05 0.05 0.08 0.04 C 0.09 0.01 0.06 -0.03 0.02 -0.03 C -0.03 -0.02 -0.02 0.05 0.04 0.06 E",
    "Diagonal Down Right": _line_path(0.2, 0.2),
    "Diagonal Up Right": _line_path(0.2, -0.2),
    "Stairs Down": "M 0 0 L 0.03 -0.06 L 0.09 -0.06 L 0.12 -0.12 L 0.18 -0.12 L 0.21 -0.18 E",
    "Up": _line_path(0, -0.24),
    "Down": _line_path(0, 0.24),
    "Left": _line_path(-0.24, 0),
    "Right": _line_path(0.24, 0),
    "Zigzag": _zigzag(),
    "Funnel": "M 0 0 L 0.12 0 L -0.1 0.16 L -0.02 0.16 L -0.12 0.32 L 0.02 0.32 E",
    "Heartbeat": "M 0 0 L 0.03 0 L 0.04 0.04 L 0.06 -0.02 L 0.07 0.02 L 0.12 0 E",
    "Bean": "M 0 0 C 0.14 0.04 0.2 0.16 0.12 0.18 C 0.02 0.2 -0.1 0.12 -0.14 0.02 C -0.16 -0.04 -0.06 -0.02 0 0 E",
    "Curved X": "M 0 0 C 0.05 0.05 0.06 0.08 0 0.14 C -0.06 0.08 -0.05 0.05 0 0 E",
    "Neutron": _circle_path(0.16),
    "Peanut": "M 0 0 C -0.04 0.08 -0.12 0.08 -0.14 0.02 C -0.16 0.08 -0.08 0.14 0 0.12 C 0.08 0.14 0.16 0.08 0.14 0.02 C 0.12 0.08 0.04 0.08 0 0 E",
    "Curved Square": "M 0 0 C 0.05 0.02 0.12 0.02 0.16 0.06 C 0.12 0.12 0.02 0.12 -0.02 0.06 E",
    "Figure 8 Four": "M 0 0 C 0.08 0.1 0.16 0.1 0.16 0.0 C 0.16 -0.1 0.08 -0.1 0 -0.02 C 0.08 0.02 0.12 0.04 0.1 0.1 E",
    "Plus": "M 0 0 L 0.04 0.04 L 0.04 0.1 L -0.04 0.1 L -0.04 0.04 L -0.1 0.04 L -0.1 -0.04 L -0.04 -0.04 L -0.04 -0.1 L 0.04 -0.1 L 0.04 -0.04 L 0.1 -0.04 L 0.1 0.04 E",
    "Pointy Star": _star_path(0.2, 0.06, 5),
    "Curvy Star": _star_path(0.2, 0.09, 5),
    "Inverted Square": "M 0 0 L 0.2 0.1 L 0 0.2 L -0.2 0.1 E",
    "Swoosh": "M 0 0 C 0.1 0.06 0.16 0.14 0.12 0.2 C 0.08 0.26 0.0 0.22 -0.04 0.16 E",
    "Vertical Figure 8": "M 0 0 C 0.1 0.06 0.14 0.14 0.08 0.18 C 0.02 0.22 -0.06 0.18 -0.04 0.12 E",
    "Horizontal Figure 8": "M 0 0 C 0.06 0.1 0.14 0.1 0.14 0.02 C 0.14 -0.06 0.06 -0.06 -0.02 0.0 C 0.06 0.02 0.1 0.03 0.08 0.08 E",
    "Inverted Triangle": "M 0 0 L -0.1 -0.13 L 0.1 -0.13 E",
    "Loop de Loop": "M 0 0 C -0.1 -0.02 -0.12 -0.08 -0.08 -0.1 C -0.04 -0.12 0.04 -0.08 0.06 -0.02 C 0.12 0.06 0.14 0.12 0.08 0.14 C 0.02 0.16 -0.06 0.1 -0.1 0.04 E",
}

MOTION_PATHS_SPECIAL = [
    ("Bean", MOTION_PATHS["Bean"]),
    ("Curved X", MOTION_PATHS["Curved X"]),
    ("Neutron", MOTION_PATHS["Neutron"]),
    ("Peanut", MOTION_PATHS["Peanut"]),
    ("Curved Square", MOTION_PATHS["Curved Square"]),
    ("Figure 8 Four", MOTION_PATHS["Figure 8 Four"]),
    ("Plus", MOTION_PATHS["Plus"]),
    ("Pointy Star", MOTION_PATHS["Pointy Star"]),
    ("Curvy Star", MOTION_PATHS["Curvy Star"]),
    ("Inverted Square", MOTION_PATHS["Inverted Square"]),
    ("Swoosh", MOTION_PATHS["Swoosh"]),
    ("Vertical Figure 8", MOTION_PATHS["Vertical Figure 8"]),
    ("Horizontal Figure 8", MOTION_PATHS["Horizontal Figure 8"]),
    ("Inverted Triangle", MOTION_PATHS["Inverted Triangle"]),
    ("Loop de Loop", MOTION_PATHS["Loop de Loop"]),
]

MOTION_PATHS_LINES = [
    ("Arc Down", MOTION_PATHS["Arc Down"]),
    ("Arc Left", MOTION_PATHS["Arc Left"]),
    ("S Curve 1", MOTION_PATHS["S Curve 1"]),
    ("Spiral Left", MOTION_PATHS["Spiral Left"]),
    ("Arc Right", MOTION_PATHS["Arc Right"]),
    ("Arc Up", MOTION_PATHS["Arc Up"]),
    ("S Curve 2", MOTION_PATHS["S Curve 2"]),
    ("Spring", MOTION_PATHS["Spring"]),
    ("Bounce Left", MOTION_PATHS["Bounce Left"]),
    ("Bounce Right", MOTION_PATHS["Bounce Right"]),
    ("Sine Wave", MOTION_PATHS["Sine Wave"]),
    ("Turn Down", MOTION_PATHS["Turn Down"]),
    ("Curvy Left", MOTION_PATHS["Curvy Left"]),
    ("Curvy Right", MOTION_PATHS["Curvy Right"]),
    ("Spiral Right", MOTION_PATHS["Spiral Right"]),
    ("Turn Up", MOTION_PATHS["Turn Up"]),
    ("Decaying Wave", MOTION_PATHS["Decaying Wave"]),
    ("Diagonal Down Right", MOTION_PATHS["Diagonal Down Right"]),
    ("Stairs Down", MOTION_PATHS["Stairs Down"]),
    ("Up", MOTION_PATHS["Up"]),
    ("Diagonal Up Right", MOTION_PATHS["Diagonal Up Right"]),
    ("Down", MOTION_PATHS["Down"]),
    ("Turn Down Right", MOTION_PATHS["Turn Down Right"]),
    ("Zigzag", MOTION_PATHS["Zigzag"]),
    ("Funnel", MOTION_PATHS["Funnel"]),
    ("Heartbeat", MOTION_PATHS["Heartbeat"]),
    ("Turn Up Right", MOTION_PATHS["Turn Up Right"]),
    ("Left", MOTION_PATHS["Left"]),
    ("Right", MOTION_PATHS["Right"]),
    ("Wave", MOTION_PATHS["Wave"]),
]

MOTION_PATHS_BASIC = [
    ("4 Point Star", MOTION_PATHS["4 Point Star"]),
    ("5 Point Star", MOTION_PATHS["5 Point Star"]),
    ("Hexagon", MOTION_PATHS["Hexagon"]),
    ("Octagon", MOTION_PATHS["Octagon"]),
    ("6 Point Star", MOTION_PATHS["6 Point Star"]),
    ("8 Point Star", MOTION_PATHS["8 Point Star"]),
    ("Parallelogram", MOTION_PATHS["Parallelogram"]),
    ("Pentagon", MOTION_PATHS["Pentagon"]),
    ("Circle", MOTION_PATHS["Circle"]),
    ("Crescent Moon", MOTION_PATHS["Crescent Moon"]),
    ("Right Triangle", MOTION_PATHS["Right Triangle"]),
    ("Square", MOTION_PATHS["Square"]),
    ("Diamond", MOTION_PATHS["Diamond"]),
    ("Equal Triangle", MOTION_PATHS["Equal Triangle"]),
    ("Teardrop", MOTION_PATHS["Teardrop"]),
    ("Trapezoid", MOTION_PATHS["Trapezoid"]),
    ("Football", MOTION_PATHS["Football"]),
    ("Heart", MOTION_PATHS["Heart"]),
]
