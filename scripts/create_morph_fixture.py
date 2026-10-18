#!/usr/bin/env python3
"""Create a Morph-transition test deck under test-files/phase2/.

PowerPoint Morph interpolates matched shapes between consecutive slides.
This deck pairs slides and marks the incoming slide with <p:morph/> so the
repo transition-engine can detect it. Shapes are named consistently across
the pair (PowerPoint matches by name), and given a CSS-safe `sp-morphable`
class + data attributes the viewer could use to interpolate later.

Currently the viewer renders a hard cut for morph slides (detection only).
"""

from __future__ import annotations

import zipfile
from pathlib import Path

from lxml import etree
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "test-files" / "phase2"
XMLNS = {"p": "http://schemas.openxmlformats.org/presentationml/2006/main"}


def save(prs, name):
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / f"{name}.pptx"
    prs.save(str(p))
    return p


def inject_xml(pptx, slide_idx, fn):
    name = f"ppt/slides/slide{slide_idx}.xml"
    with zipfile.ZipFile(pptx, "r") as zin:
        root = etree.fromstring(zin.read(name))
        fn(root)
        new = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
        tmp = pptx.with_suffix(".tmp.pptx")
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                zout.writestr(item, new if item.filename == name else zin.read(item.filename))
    tmp.replace(pptx)


def add_morph_transition(root, orientation="horizontal", dur=2500):
    for c in list(root):
        if c.tag == "{%s}transition" % XMLNS["p"]:
            root.remove(c)
    t = etree.Element("{%s}transition" % XMLNS["p"], spd="med")
    etree.SubElement(t, "{%s}morph" % XMLNS["p"])
    root.append(t)


def morphable(shape):
    """Mark shape as morphable + name it for matching."""
    el = shape._element
    cNvPr = el.find(".//p:cNvPr", namespaces=XMLNS)
    cNvPr.set("class", "sp-morphable")
    return shape


def name_shape(shape, name):
    el = shape._element
    cNvPr = el.find(".//p:cNvPr", namespaces=XMLNS)
    cNvPr.set("name", name)
    return shape


def label(slide, text, x=0.4, y=0.2, w=12, size=18):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(0.6))
    tf = tb.text_frame
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.LEFT
    r = p.add_run()
    r.text = text
    r.font.size = Pt(size)
    return tb


def build():
    prs = Presentation()
    blank = prs.slide_layouts[6]
    WHITE = RGBColor(255, 255, 255)

    # ---- Pair 1: move + scale -----------------------------------------------
    s1 = prs.slides.add_slide(blank)
    label(s1, "Slide 1 -> 2 : Morph move + scale")
    hero = s1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.5), Inches(2.5), Inches(2), Inches(1.2))
    hero.fill.solid(); hero.fill.fore_color.rgb = RGBColor(68, 114, 196); hero.line.fill.background()
    morphable(name_shape(hero, "hero"))
    tf = hero.text_frame; tf.text = "A"; tf.paragraphs[0].alignment = PP_ALIGN.CENTER

    s2 = prs.slides.add_slide(blank)
    label(s2, "Slide 2 : morph target (scaled, moved)")
    hero2 = s2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6), Inches(1.2), Inches(4), Inches(2.4))
    hero2.fill.solid(); hero2.fill.fore_color.rgb = RGBColor(68, 114, 196); hero2.line.fill.background()
    morphable(name_shape(hero2, "hero"))
    tf = hero2.text_frame; tf.text = "A"; tf.paragraphs[0].alignment = PP_ALIGN.CENTER

    # ---- Pair 2: rotation -----------------------------------------------------
    s3 = prs.slides.add_slide(blank)
    label(s3, "Slide 3 : rotated 90deg")
    hero3 = s3.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6), Inches(1.2), Inches(4), Inches(2.4))
    hero3.fill.solid(); hero3.fill.fore_color.rgb = RGBColor(68, 114, 196); hero3.line.fill.background()
    hero3.rotation = 90.0
    morphable(name_shape(hero3, "hero"))
    tf = hero3.text_frame; tf.text = "A"; tf.paragraphs[0].alignment = PP_ALIGN.CENTER

    # ---- Pair 3: color ---------------------------------------------------------
    s4 = prs.slides.add_slide(blank)
    label(s4, "Slide 4 : color morph")
    hero4 = s4.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6), Inches(1.2), Inches(4), Inches(2.4))
    hero4.fill.solid(); hero4.fill.fore_color.rgb = RGBColor(237, 125, 49); hero4.line.fill.background()
    hero4.rotation = 90.0
    morphable(name_shape(hero4, "hero"))
    tf = hero4.text_frame; tf.text = "A"; tf.paragraphs[0].alignment = PP_ALIGN.CENTER

    # ---- Pair 4: shape -> shape (rounded rect -> oval) -------------------------
    s5 = prs.slides.add_slide(blank)
    label(s5, "Slide 5 -> 6 : shape morph (rect -> oval)")
    circle = s5.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(2), Inches(2), Inches(3), Inches(3))
    circle.fill.solid(); circle.fill.fore_color.rgb = RGBColor(155, 89, 182); circle.line.fill.background()
    morphable(name_shape(circle, "circle"))
    tf = circle.text_frame; tf.text = "O"; tf.paragraphs[0].alignment = PP_ALIGN.CENTER

    s6 = prs.slides.add_slide(blank)
    label(s6, "Slide 6 : morph to oval (size + position)")
    circle2 = s6.shapes.add_shape(MSO_SHAPE.OVAL, Inches(6.5), Inches(1.5), Inches(4), Inches(4))
    circle2.fill.solid(); circle2.fill.fore_color.rgb = RGBColor(155, 89, 182); circle2.line.fill.background()
    morphable(name_shape(circle2, "circle"))
    tf = circle2.text_frame; tf.text = "O"; tf.paragraphs[0].alignment = PP_ALIGN.CENTER

    # ---- static control slide (no morph transition) ----------------------------
    s7 = prs.slides.add_slide(blank)
    label(s7, "Slide 7 : no morph (control)")

    path = save(prs, "06-morph")
    for idx in (2, 3, 4, 6):  # incoming slides get the morph transition
        inject_xml(path, idx, add_morph_transition)
    print("✓", path.name)


if __name__ == "__main__":
    build()