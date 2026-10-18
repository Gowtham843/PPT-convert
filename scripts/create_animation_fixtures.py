#!/usr/bin/env python3
"""Create animation test decks under test-files/animation/ (synthetic valid OOXML)."""

from __future__ import annotations

import sys
import zipfile
from pathlib import Path

from lxml import etree
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn
from pptx.util import Inches

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "test-files" / "animation"
sys.path.insert(0, str(ROOT / "scripts"))
from create_phase2_fixtures import ensure_assets, spid  # noqa: E402

_id = 10


def _nid():
    global _id
    _id += 1
    return str(_id)


def save_anim(name, prs):
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


def _clear_timing(root):
    for c in list(root):
        if c.tag == qn("p:timing"):
            root.remove(c)


def _timing_shell():
    timing = etree.Element(qn("p:timing"))
    tn = etree.SubElement(timing, qn("p:tnLst"))
    par = etree.SubElement(tn, qn("p:par"))
    ctn = etree.SubElement(par, qn("p:cTn"), id=_nid(), dur="indefinite", nodeType="tmRoot")
    child = etree.SubElement(ctn, qn("p:childTnLst"))
    seq = etree.SubElement(child, qn("p:seq"), concurrent="1", nextAc="seek")
    seq_ctn = etree.SubElement(seq, qn("p:cTn"), id=_nid(), dur="indefinite", nodeType="mainSeq")
    seq_child = etree.SubElement(seq_ctn, qn("p:childTnLst"))
    return timing, seq_child


def _append_leaf_anim(parent, spid, *, effect_filter="fade", dur="500"):
    inner = etree.SubElement(parent, qn("p:par"))
    inner_ctn = etree.SubElement(inner, qn("p:cTn"), id=_nid(), dur=dur)
    inner_child = etree.SubElement(inner_ctn, qn("p:childTnLst"))
    ae = etree.SubElement(inner_child, qn("p:animEffect"), transition="in", filter=effect_filter)
    etree.SubElement(ae, qn("p:cTn"), id=_nid(), dur=dur)
    tgt = etree.SubElement(ae, qn("p:tgtEl"))
    etree.SubElement(tgt, qn("p:spTgt"), spid=spid)


def _append_timed_anim(parent, spid, *, preset_class="entr", preset_id="10", effect_filter="fade", dur="500", node_type="clickEffect"):
    par = etree.SubElement(parent, qn("p:par"))
    ctn = etree.SubElement(
        par,
        qn("p:cTn"),
        id=_nid(),
        fill="hold",
        presetID=preset_id,
        presetClass=preset_class,
        nodeType=node_type,
    )
    child = etree.SubElement(ctn, qn("p:childTnLst"))
    _append_leaf_anim(child, spid, effect_filter=effect_filter, dur=dur)


def _append_motion_leaf(parent, spid, *, dx="1200000", dy="0", dur="800"):
    inner = etree.SubElement(parent, qn("p:par"))
    inner_ctn = etree.SubElement(inner, qn("p:cTn"), id=_nid(), dur=dur)
    inner_child = etree.SubElement(inner_ctn, qn("p:childTnLst"))
    am = etree.SubElement(inner_child, qn("p:animMotion"), path="M 0 0 L 120 0")
    etree.SubElement(am, qn("p:cTn"), id=_nid(), dur=dur)
    etree.SubElement(am, qn("p:by"), x=dx, y=dy)
    tgt = etree.SubElement(am, qn("p:tgtEl"))
    etree.SubElement(tgt, qn("p:spTgt"), spid=spid)


def add_click_sequence(root, clicks):
    """Multiple Next clicks — one clickEffect par per click."""
    _clear_timing(root)
    timing, seq_child = _timing_shell()
    for spec in clicks:
        click = etree.SubElement(seq_child, qn("p:par"))
        click_ctn = etree.SubElement(
            click,
            qn("p:cTn"),
            id=_nid(),
            fill="hold",
            presetID=spec.get("preset_id", "10"),
            presetClass=spec.get("preset_class", "entr"),
            nodeType="clickEffect",
        )
        click_child = etree.SubElement(click_ctn, qn("p:childTnLst"))
        _append_leaf_anim(
            click_child,
            spec["spid"],
            effect_filter=spec.get("effect_filter", "fade"),
            dur=str(spec.get("dur", 500)),
        )
    root.append(timing)


def add_timed_click_group(root, anims):
    """Single click with withPrevious / afterPrevious inner steps."""
    _clear_timing(root)
    timing, seq_child = _timing_shell()
    click = etree.SubElement(seq_child, qn("p:par"))
    click_ctn = etree.SubElement(
        click,
        qn("p:cTn"),
        id=_nid(),
        fill="hold",
        presetID="10",
        presetClass="entr",
        nodeType="clickEffect",
    )
    click_child = etree.SubElement(click_ctn, qn("p:childTnLst"))
    for spec in anims:
        _append_timed_anim(
            click_child,
            spec["spid"],
            preset_class=spec.get("preset_class", "entr"),
            preset_id=spec.get("preset_id", "10"),
            effect_filter=spec.get("effect_filter", "fade"),
            dur=str(spec.get("dur", 500)),
            node_type=spec.get("node_type", "clickEffect"),
        )
    root.append(timing)


def add_object_click_anim(root, trigger_spid, target_spid, *, effect_filter="fade", dur="500"):
    _clear_timing(root)
    timing = etree.Element(qn("p:timing"))
    tn = etree.SubElement(timing, qn("p:tnLst"))
    par = etree.SubElement(tn, qn("p:par"))
    ctn = etree.SubElement(par, qn("p:cTn"), id=_nid(), dur="indefinite", nodeType="tmRoot")
    child = etree.SubElement(ctn, qn("p:childTnLst"))
    seq = etree.SubElement(child, qn("p:seq"), concurrent="1", nextAc="seek")
    seq_ctn = etree.SubElement(seq, qn("p:cTn"), id=_nid(), dur="indefinite", nodeType="interactiveSeq")
    cond_lst = etree.SubElement(seq_ctn, qn("p:stCondLst"))
    cond = etree.SubElement(cond_lst, qn("p:cond"), delay="indefinite")
    tgt = etree.SubElement(cond, qn("p:tgtEl"))
    etree.SubElement(tgt, qn("p:spTgt"), spid=trigger_spid)
    seq_child = etree.SubElement(seq_ctn, qn("p:childTnLst"))
    click = etree.SubElement(seq_child, qn("p:par"))
    click_ctn = etree.SubElement(
        click,
        qn("p:cTn"),
        id=_nid(),
        fill="hold",
        presetClass="entr",
        presetID="10",
        nodeType="clickEffect",
    )
    click_child = etree.SubElement(click_ctn, qn("p:childTnLst"))
    _append_leaf_anim(click_child, target_spid, effect_filter=effect_filter, dur=dur)
    root.append(timing)


def add_motion_click(root, spid, *, dx="1200000", dy="0", dur="800"):
    _clear_timing(root)
    timing, seq_child = _timing_shell()
    click = etree.SubElement(seq_child, qn("p:par"))
    click_ctn = etree.SubElement(
        click,
        qn("p:cTn"),
        id=_nid(),
        fill="hold",
        presetClass="entr",
        presetID="1",
        nodeType="clickEffect",
    )
    click_child = etree.SubElement(click_ctn, qn("p:childTnLst"))
    _append_motion_leaf(click_child, spid, dx=dx, dy=dy, dur=str(dur))
    root.append(timing)


def fade_click():
    prs = Presentation()
    s = prs.slides.add_slide(prs.slide_layouts[6])
    s.shapes.add_textbox(Inches(0.5), Inches(0.2), Inches(9), Inches(0.8)).text_frame.text = "HELLO"
    box = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1), Inches(2.4), Inches(2.2), Inches(1.2))
    box.fill.solid()
    box.fill.fore_color.rgb = RGBColor(68, 114, 196)
    box.text_frame.text = "Fade target"
    path = save_anim("01-fade-click", prs)
    inject_xml(
        path,
        1,
        lambda r: add_click_sequence(
            r,
            [{"spid": spid(s, 1), "preset_id": "10", "effect_filter": "fade", "dur": 500}],
        ),
    )
    print("✓ 01-fade-click.pptx")


def appear_sequence():
    prs = Presentation()
    s = prs.slides.add_slide(prs.slide_layouts[6])
    s.shapes.add_textbox(Inches(0.5), Inches(0.3), Inches(9), Inches(0.8)).text_frame.text = "Title"
    s.shapes.add_textbox(Inches(1), Inches(1.5), Inches(6), Inches(0.6)).text_frame.text = "Bullet 1"
    s.shapes.add_textbox(Inches(1), Inches(2.4), Inches(6), Inches(0.6)).text_frame.text = "Bullet 2"
    s2 = prs.slides.add_slide(prs.slide_layouts[6])
    s2.shapes.add_textbox(Inches(1), Inches(2.5), Inches(8), Inches(1)).text_frame.text = "Slide 2"
    ids = [spid(s, 0), spid(s, 1), spid(s, 2)]
    path = save_anim("02-appear-sequence", prs)
    inject_xml(
        path,
        1,
        lambda r: add_click_sequence(
            r,
            [
                {"spid": ids[0], "preset_id": "1", "effect_filter": "appear", "dur": 500},
                {"spid": ids[1], "preset_id": "1", "effect_filter": "appear", "dur": 500},
                {"spid": ids[2], "preset_id": "1", "effect_filter": "appear", "dur": 500},
            ],
        ),
    )
    print("✓ 02-appear-sequence.pptx")


def with_previous():
    prs = Presentation()
    s = prs.slides.add_slide(prs.slide_layouts[6])
    a = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.8), Inches(2.5), Inches(2), Inches(1))
    a.fill.solid()
    a.fill.fore_color.rgb = RGBColor(68, 114, 196)
    a.text_frame.text = "A"
    b = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(3.2), Inches(2.5), Inches(2), Inches(1))
    b.fill.solid()
    b.fill.fore_color.rgb = RGBColor(112, 173, 71)
    b.text_frame.text = "B"
    path = save_anim("04-with-previous", prs)
    inject_xml(
        path,
        1,
        lambda r: add_timed_click_group(
            r,
            [
                {"spid": spid(s, 0), "effect_filter": "fade", "dur": 600, "node_type": "clickEffect"},
                {"spid": spid(s, 1), "effect_filter": "fade", "dur": 600, "node_type": "withEffect"},
            ],
        ),
    )
    print("✓ 04-with-previous.pptx")


def after_previous():
    prs = Presentation()
    s = prs.slides.add_slide(prs.slide_layouts[6])
    a = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.8), Inches(2.5), Inches(2), Inches(1))
    a.fill.solid()
    a.fill.fore_color.rgb = RGBColor(68, 114, 196)
    a.text_frame.text = "First"
    b = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(3.2), Inches(2.5), Inches(2), Inches(1))
    b.fill.solid()
    b.fill.fore_color.rgb = RGBColor(237, 125, 49)
    b.text_frame.text = "Second"
    path = save_anim("05-after-previous", prs)
    inject_xml(
        path,
        1,
        lambda r: add_timed_click_group(
            r,
            [
                {"spid": spid(s, 0), "effect_filter": "fade", "dur": 400, "node_type": "clickEffect"},
                {"spid": spid(s, 1), "effect_filter": "fade", "dur": 400, "node_type": "afterEffect"},
            ],
        ),
    )
    print("✓ 05-after-previous.pptx")


def multi_duration():
    prs = Presentation()
    s = prs.slides.add_slide(prs.slide_layouts[6])
    for i, col in enumerate([(68, 114, 196), (112, 173, 71), (255, 192, 0)]):
        sh = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(1 + i * 2.5), Inches(2.5), Inches(1.8), Inches(1.2))
        sh.fill.solid()
        sh.fill.fore_color.rgb = RGBColor(*col)
    path = save_anim("06-multiple-effects", prs)
    inject_xml(
        path,
        1,
        lambda r: add_timed_click_group(
            r,
            [
                {"spid": spid(s, 0), "effect_filter": "fade", "dur": 300, "node_type": "clickEffect"},
                {"spid": spid(s, 1), "effect_filter": "fade", "dur": 900, "node_type": "afterEffect"},
                {"spid": spid(s, 2), "effect_filter": "fade", "dur": 500, "node_type": "afterEffect"},
            ],
        ),
    )
    print("✓ 06-multiple-effects.pptx")


def object_click():
    prs = Presentation()
    s = prs.slides.add_slide(prs.slide_layouts[6])
    btn = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1), Inches(1.5), Inches(2.5), Inches(1))
    btn.fill.solid()
    btn.fill.fore_color.rgb = RGBColor(192, 0, 0)
    btn.text_frame.text = "Click me"
    tgt = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(4.5), Inches(2.5), Inches(3), Inches(1.5))
    tgt.fill.solid()
    tgt.fill.fore_color.rgb = RGBColor(68, 114, 196)
    tgt.text_frame.text = "Hidden target"
    path = save_anim("07-object-click", prs)
    inject_xml(
        path,
        1,
        lambda r: add_object_click_anim(r, spid(s, 0), spid(s, 1), effect_filter="fade", dur="600"),
    )
    print("✓ 07-object-click.pptx")


def motion_path():
    prs = Presentation()
    s = prs.slides.add_slide(prs.slide_layouts[6])
    sh = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(1), Inches(3), Inches(1.5), Inches(1))
    sh.fill.solid()
    sh.fill.fore_color.rgb = RGBColor(112, 173, 71)
    sh.text_frame.text = "Move"
    path = save_anim("08-motion-path", prs)
    inject_xml(path, 1, lambda r: add_motion_click(r, spid(s, 0), dx="1200000", dy="0", dur=800))
    print("✓ 08-motion-path.pptx")


def main():
    ensure_assets()
    fade_click()
    appear_sequence()
    with_previous()
    after_previous()
    multi_duration()
    object_click()
    motion_path()
    (OUT / "FIXTURES.md").write_text(
        "# Animation fixtures\n\nSynthetic OOXML injected after python-pptx save.\n",
        encoding="utf-8",
    )
    print(f"\nFixtures → {OUT}")


if __name__ == "__main__":
    main()
