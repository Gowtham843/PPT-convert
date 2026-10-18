#!/usr/bin/env python3
"""Create Phase 2 feature-rich test decks under test-files/phase2/."""

from __future__ import annotations

import subprocess
import struct
import wave
import zipfile
from pathlib import Path

from lxml import etree
from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn
from pptx.util import Inches, Pt

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "test-files" / "phase2"
ASSETS = OUT / "_assets"


def ensure_assets():
    ASSETS.mkdir(parents=True, exist_ok=True)
    from PIL import Image

    png = ASSETS / "photo.png"
    if not png.exists():
        Image.new("RGB", (200, 150), (70, 130, 180)).save(png)
    wav = ASSETS / "tone.wav"
    if not wav.exists():
        with wave.open(str(wav), "w") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(22050)
            w.writeframes(struct.pack("<h", 0) * 22050 * 2)
    mp4 = ASSETS / "clip.mp4"
    if not mp4.exists():
        subprocess.run(
            [
                "ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=green:s=320x240:d=3",
                "-f", "lavfi", "-i", "sine=f=330:d=3", "-shortest", str(mp4),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    return png, wav, mp4


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


def add_transition(root, kind):
    for c in list(root):
        if c.tag == qn("p:transition"):
            root.remove(c)
    t = etree.Element(qn("p:transition"), spd="med")
    tag = {"fade": "fade", "push": "push", "wipe": "wipe", "split": "split", "cover": "cover",
           "dissolve": "dissolve", "checker": "checker", "strips": "blinds"}.get(kind, "fade")
    if tag == "push":
        etree.SubElement(t, qn("p:push"), dir="l")
    elif tag == "wipe":
        etree.SubElement(t, qn("p:wipe"), dir="l")
    elif tag == "split":
        etree.SubElement(t, qn("p:split"), orient="horz")
    elif tag == "cover":
        etree.SubElement(t, qn("p:cover"), dir="d")
    elif tag == "dissolve":
        etree.SubElement(t, qn("p:dissolve"))
    elif tag == "checker":
        etree.SubElement(t, qn("p:checker"), dir="horz")
    elif tag == "blinds":
        etree.SubElement(t, qn("p:blinds"), dir="horz")
    else:
        etree.SubElement(t, qn("p:fade"))
    root.append(t)


def add_anim(root, spid, preset_class="entr", preset_id="10", effect_filter="fade"):
    for c in list(root):
        if c.tag == qn("p:timing"):
            root.remove(c)
    timing = etree.Element(qn("p:timing"))
    tn = etree.SubElement(timing, qn("p:tnLst"))
    par = etree.SubElement(tn, qn("p:par"))
    ctn = etree.SubElement(par, qn("p:cTn"), id="1", dur="indefinite", nodeType="tmRoot")
    child = etree.SubElement(ctn, qn("p:childTnLst"))
    seq = etree.SubElement(child, qn("p:seq"), concurrent="1", nextAc="seek")
    seq_ctn = etree.SubElement(seq, qn("p:cTn"), id="2", dur="indefinite", nodeType="mainSeq")
    seq_child = etree.SubElement(seq_ctn, qn("p:childTnLst"))
    click = etree.SubElement(seq_child, qn("p:par"))
    click_ctn = etree.SubElement(
        click, qn("p:cTn"), id="3", fill="hold",
        presetID=preset_id, presetClass=preset_class, nodeType="clickEffect",
    )
    click_child = etree.SubElement(click_ctn, qn("p:childTnLst"))
    inner = etree.SubElement(click_child, qn("p:par"))
    inner_ctn = etree.SubElement(inner, qn("p:cTn"), id="4", dur="500")
    inner_child = etree.SubElement(inner_ctn, qn("p:childTnLst"))
    ae = etree.SubElement(inner_child, qn("p:animEffect"), transition="in", filter=effect_filter)
    etree.SubElement(ae, qn("p:cTn"), id="5", dur="500")
    tgt = etree.SubElement(ae, qn("p:tgtEl"))
    etree.SubElement(tgt, qn("p:spTgt"), spid=spid)
    root.append(timing)


def spid(slide, idx=0):
    return slide.shapes[idx]._element.find(".//p:cNvPr", namespaces={"p": "http://schemas.openxmlformats.org/presentationml/2006/main"}).get("id")


def static_complex():
    png, _, _ = ensure_assets()
    prs = Presentation()
    blank = prs.slide_layouts[6]
    s = prs.slides.add_slide(blank)
    t = s.shapes.add_textbox(Inches(0.5), Inches(0.3), Inches(9), Inches(1))
    t.text_frame.text = "Phase 2 static — multi-shape layout"
    t.text_frame.paragraphs[0].font.size = Pt(32)
    t.text_frame.paragraphs[0].font.bold = True
    r = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.5), Inches(1.5), Inches(3), Inches(2))
    r.fill.solid()
    r.fill.fore_color.rgb = RGBColor(68, 114, 196)
    r.text_frame.text = "Shape A"
    o = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(4), Inches(1.5), Inches(2.5), Inches(2))
    o.fill.solid()
    o.fill.fore_color.rgb = RGBColor(237, 125, 49)
    s.shapes.add_picture(str(png), Inches(6.8), Inches(1.5), width=Inches(2.5))
    print("✓", save(prs, "01-static-complex").name)


def animation_deck():
    prs = Presentation()
    blank = prs.slide_layouts[6]
    s = prs.slides.add_slide(blank)
    s.shapes.add_textbox(Inches(0.5), Inches(0.2), Inches(9), Inches(0.7)).text_frame.text = "Multi-step animations"
    boxes = []
    for i, color in enumerate([(68, 114, 196), (112, 173, 71), (255, 192, 0)]):
        b = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1 + i * 2.8), Inches(2.5), Inches(2.2), Inches(1.2))
        b.fill.solid()
        b.fill.fore_color.rgb = RGBColor(*color)
        b.text_frame.text = f"Box {i+1}"
        boxes.append(spid(s, i + 1))
    path = save(prs, "02-animation")
    inject_xml(path, 1, lambda r: add_anim(r, boxes[0], preset_id="10", effect_filter="fade"))
    print("✓", path.name)


def media_deck():
    _, wav, mp4 = ensure_assets()
    prs = Presentation()
    blank = prs.slide_layouts[6]
    s1 = prs.slides.add_slide(blank)
    s1.shapes.add_textbox(Inches(0.5), Inches(0.2), Inches(9), Inches(0.6)).text_frame.text = "Video slide"
    s1.shapes.add_movie(str(mp4), Inches(1.5), Inches(1.2), Inches(6), Inches(4))
    s2 = prs.slides.add_slide(blank)
    s2.shapes.add_textbox(Inches(0.5), Inches(0.2), Inches(9), Inches(0.6)).text_frame.text = "Audio slide"
    s2.shapes.add_movie(str(wav), Inches(2), Inches(3.5), Inches(5), Inches(0.7))
    print("✓", save(prs, "03-media").name)


def transitions_deck():
    prs = Presentation()
    blank = prs.slide_layouts[6]
    kinds = ["fade", "push", "wipe", "split", "cover", "dissolve", "checker", "strips"]
    for k in kinds:
        s = prs.slides.add_slide(blank)
        tb = s.shapes.add_textbox(Inches(1), Inches(2.8), Inches(8), Inches(1))
        tb.text_frame.text = f"{k} transition"
        tb.text_frame.paragraphs[0].alignment = PP_ALIGN.CENTER
    path = save(prs, "04-transitions")
    for i, k in enumerate(kinds, 1):
        inject_xml(path, i, lambda r, kind=k: add_transition(r, kind))
    print("✓", path.name)


def tables_charts():
    prs = Presentation()
    blank = prs.slide_layouts[6]
    s1 = prs.slides.add_slide(blank)
    s1.shapes.add_textbox(Inches(0.5), Inches(0.2), Inches(9), Inches(0.6)).text_frame.text = "Table"
    tbl = s1.shapes.add_table(4, 3, Inches(0.8), Inches(1), Inches(8), Inches(3)).table
    for r in range(4):
        for c in range(3):
            cell = tbl.cell(r, c)
            cell.text = f"R{r+1}C{c+1}"
            if r == 0:
                cell.fill.solid()
                cell.fill.fore_color.rgb = RGBColor(68, 114, 196)
    s2 = prs.slides.add_slide(blank)
    s2.shapes.add_textbox(Inches(0.5), Inches(0.2), Inches(9), Inches(0.6)).text_frame.text = "Chart"
    data = CategoryChartData()
    data.categories = ["A", "B", "C"]
    data.add_series("Series 1", (10, 20, 15))
    s2.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(1), Inches(1.2), Inches(7), Inches(4.5), data)
    print("✓", save(prs, "05-tables-charts").name)


def fonts_themes():
    prs = Presentation()
    blank = prs.slide_layouts[6]
    s = prs.slides.add_slide(blank)
    tb = s.shapes.add_textbox(Inches(0.8), Inches(1), Inches(8), Inches(4))
    tf = tb.text_frame
    tf.text = "Heading font test"
    p2 = tf.add_paragraph()
    p2.text = "Body — bold italic underline"
    p2.font.bold = True
    p2.font.italic = True
    p2.font.underline = True
    p2.font.size = Pt(18)
    tf.paragraphs[0].font.size = Pt(36)
    tf.paragraphs[0].font.color.rgb = RGBColor(192, 0, 0)
    print("✓", save(prs, "06-fonts-themes").name)


def combined():
    png, wav, mp4 = ensure_assets()
    prs = Presentation()
    blank = prs.slide_layouts[6]
    s1 = prs.slides.add_slide(blank)
    s1.shapes.add_textbox(Inches(0.5), Inches(0.2), Inches(9), Inches(0.6)).text_frame.text = "Combined static + video"
    s1.shapes.add_picture(str(png), Inches(0.5), Inches(1), width=Inches(2))
    s1.shapes.add_movie(str(mp4), Inches(3), Inches(1), Inches(5.5), Inches(3.5))
    s2 = prs.slides.add_slide(blank)
    s2.shapes.add_textbox(Inches(0.5), Inches(0.2), Inches(9), Inches(0.6)).text_frame.text = "Combined animation"
    box = s2.shapes.add_shape(MSO_SHAPE.HEXAGON, Inches(3), Inches(2.5), Inches(3.5), Inches(2))
    box.fill.solid()
    box.fill.fore_color.rgb = RGBColor(112, 173, 71)
    box.text_frame.text = "Animate"
    bid = spid(s2, 1)
    s3 = prs.slides.add_slide(blank)
    s3.shapes.add_textbox(Inches(1), Inches(2.5), Inches(8), Inches(1)).text_frame.text = "Combined fade transition + audio"
    s3.shapes.add_movie(str(wav), Inches(2), Inches(4), Inches(5), Inches(0.6))
    path = save(prs, "07-combined")
    inject_xml(path, 2, lambda r: add_anim(r, bid, preset_id="2", effect_filter="fly"))
    inject_xml(path, 3, lambda r: add_transition(r, "fade"))
    print("✓", path.name)


def main():
    ensure_assets()
    static_complex()
    animation_deck()
    media_deck()
    transitions_deck()
    tables_charts()
    fonts_themes()
    combined()
    print(f"\nPhase 2 fixtures → {OUT}")


if __name__ == "__main__":
    main()
