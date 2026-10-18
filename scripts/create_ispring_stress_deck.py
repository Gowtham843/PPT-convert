#!/usr/bin/env python3
"""Create the iSpring stress-test deck: test-files/ispring-stress-test.pptx.

Builds a 12-slide 16:9 PPTX whose <p:timing> trees mirror what PowerPoint
itself writes for each effect (presetID/presetClass + canonical behavior
nodes), so the deck can be used as an Original-PowerPoint reference when
comparing iSpring Suite's PowerPoint-to-HTML5 conversion output.
"""

from __future__ import annotations

import sys
from pathlib import Path

from lxml import etree
from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "test-files" / "ispring-stress-test.pptx"
ASSETS = ROOT / "test-files" / "_assets"

NAVY = RGBColor(0x1F, 0x38, 0x64)
BLUE = RGBColor(0x44, 0x72, 0xC4)
GREEN = RGBColor(0x70, 0xAD, 0x47)
ORANGE = RGBColor(0xED, 0x7D, 0x31)
YELLOW = RGBColor(0xFF, 0xC0, 0x00)
RED = RGBColor(0xC0, 0x00, 0x00)
PURPLE = RGBColor(0x70, 0x30, 0xA0)
TEAL = RGBColor(0x2E, 0xB8, 0xB8)
GRAY = RGBColor(0x59, 0x59, 0x59)
LGRAY = RGBColor(0xA6, 0xA6, 0xA6)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

SUB_BOTTOM, SUB_TOP, SUB_LEFT, SUB_RIGHT = "4", "1", "8", "2"

STATS = {"effects": 0, "clicks": 0, "objects": set(), "presets": []}


def E(parent, tag, **attrs):
    el = etree.SubElement(parent, qn(tag))
    for k, v in attrs.items():
        el.set(k, str(v))
    return el


def tgtel(spid, prg=None):
    t = etree.Element(qn("p:tgtEl"))
    s = etree.SubElement(t, qn("p:spTgt"), spid=str(spid))
    if prg is not None:
        tx = etree.SubElement(s, qn("p:txEl"))
        etree.SubElement(tx, qn("p:pRg"), st=str(prg[0]), end=str(prg[1]))
    return t


class Timing:
    """Per-slide <p:timing> builder (PowerPoint-style mainSeq tree)."""

    def __init__(self, slide=None):
        self._id = 2
        existing = slide._element.find(qn("p:timing")) if slide is not None else None
        if existing is not None:
            self.el = existing
            self._adopt(existing)
        else:
            self._build_fresh()

    def _adopt(self, existing):
        for c in existing.iter(qn("p:cTn")):
            if c.get("id"):
                self._id = max(self._id, int(c.get("id")))
        root = next(c for c in existing.iter(qn("p:cTn")) if c.get("nodeType") == "tmRoot")
        child = root.find(qn("p:childTnLst"))
        self.seq = E(child, "p:seq", concurrent="1", nextAc="seek")
        seq_ctn = E(self.seq, "p:cTn", id=str(self.nid()), dur="indefinite", nodeType="mainSeq")
        self.main = E(seq_ctn, "p:childTnLst")
        self._add_seq_conds()

    def _build_fresh(self):
        self.el = etree.Element(qn("p:timing"))
        tnLst = E(self.el, "p:tnLst")
        root_par = E(tnLst, "p:par")
        ctn = E(root_par, "p:cTn", id="1", dur="indefinite", restart="never", nodeType="tmRoot")
        child = E(ctn, "p:childTnLst")
        self.seq = E(child, "p:seq", concurrent="1", nextAc="seek")
        seq_ctn = E(self.seq, "p:cTn", id="2", dur="indefinite", nodeType="mainSeq")
        self.main = E(seq_ctn, "p:childTnLst")
        self._add_seq_conds()

    def _add_seq_conds(self):
        cl = E(self.seq, "p:prevCondLst")
        cond = E(cl, "p:cond", evt="onPrev", delay="0")
        tg = E(cond, "p:tgtEl")
        E(tg, "p:sldTgt")
        cl2 = E(self.seq, "p:nextCondLst")
        cond2 = E(cl2, "p:cond", evt="onNext", delay="0")
        tg2 = E(cond2, "p:tgtEl")
        E(tg2, "p:sldTgt")

    def nid(self):
        self._id += 1
        return str(self._id)

    def click(self, effects):
        t = 0
        for e in effects:
            if e.get("delay") is None:
                e["delay"] = t
            t = max(t, e["delay"] + e["span"])
        grp = E(self.main, "p:par")
        gctn = E(grp, "p:cTn", id=self.nid(), fill="hold")
        st = E(gctn, "p:stCondLst")
        E(st, "p:cond", delay="indefinite")
        glist = E(gctn, "p:childTnLst")
        for e in effects:
            cls, pid, sub = _preset(e)
            par = E(glist, "p:par")
            ectn = E(
                par,
                "p:cTn",
                id=self.nid(),
                fill="hold",
                presetID=pid,
                presetClass=cls,
                nodeType=e["nt"],
            )
            if sub:
                ectn.set("presetSubtype", sub)
            est = E(ectn, "p:stCondLst")
            E(est, "p:cond", delay=str(int(e["delay"])))
            echild = E(ectn, "p:childTnLst")
            _behaviors(self, echild, e)
            STATS["effects"] += 1
            STATS["objects"].add((id(self), e["spid"]))
            STATS["presets"].append(f"{cls}:{pid}")
        STATS["clicks"] += 1


def eff(kind, spid, *, dur=500, nt="clickEffect", delay=None, span=None, prg=None, **kw):
    d = dict(kind=kind, spid=spid, dur=dur, nt=nt, delay=delay, prg=prg, **kw)
    d["span"] = span if span is not None else dur
    return d


def _preset(e):
    k = e["kind"]
    table = {
        "fade_in": ("entr", "10", None),
        "appear": ("entr", "1", None),
        "fly_in": ("entr", "2", e.get("sub")),
        "float_in": ("entr", "42", None),
        "zoom_in": ("entr", "23", "16"),
        "split_in": ("entr", "16", None),
        "wipe_in": ("entr", "22", e.get("sub")),
        "fade_out": ("exit", "10", None),
        "disappear": ("exit", "1", None),
        "fly_out": ("exit", "2", e.get("sub")),
        "zoom_out": ("exit", "23", "16"),
        "pulse": ("emph", "35", None),
        "grow": ("emph", "6", None),
        "spin": ("emph", "8", None),
        "teeter": ("emph", "32", None),
        "fill_color": ("emph", "1", None),
        "transparency": ("emph", "9", None),
        "mpath": ("path", "0", None),
    }
    return table[k]


def _set_vis(T, parent, e, val, delay="0", dur="1"):
    s = E(parent, "p:set")
    cb = E(s, "p:cBhvr")
    ct = E(cb, "p:cTn", id=T.nid(), dur=str(dur), fill="hold")
    cst = E(ct, "p:stCondLst")
    E(cst, "p:cond", delay=str(delay))
    cb.append(tgtel(e["spid"], e.get("prg")))
    an = E(cb, "p:attrNameLst")
    E(an, "p:attrName").text = "style.visibility"
    to = E(s, "p:to")
    E(to, "p:strVal", val=val)


def _anim_effect(T, parent, e, trans, filt, dur, tmFilter=None, prLst=None, rctx=None):
    ae = E(parent, "p:animEffect", transition=trans, filter=filt)
    if prLst:
        ae.set("prLst", prLst)
    cb = E(ae, "p:cBhvr")
    if rctx:
        cb.set("rctx", rctx)
    ct = E(cb, "p:cTn", id=T.nid(), dur=str(dur))
    if tmFilter:
        ct.set("tmFilter", tmFilter)
    cb.append(tgtel(e["spid"], e.get("prg")))


def _anim_xy(T, parent, e, attr, v_from, v_to, dur, delay="0"):
    a = E(parent, "p:anim", calcmode="lin", valueType="num")
    cb = E(a, "p:cBhvr", additive="base")
    ct = E(cb, "p:cTn", id=T.nid(), dur=str(dur), fill="hold")
    cst = E(ct, "p:stCondLst")
    E(cst, "p:cond", delay=str(delay))
    cb.append(tgtel(e["spid"], e.get("prg")))
    an = E(cb, "p:attrNameLst")
    E(an, "p:attrName").text = attr
    tav = E(a, "p:tavLst")
    for tm, val in ((0, v_from), (100000, v_to)):
        t1 = E(tav, "p:tav", tm=str(tm))
        v = E(t1, "p:val")
        E(v, "p:strVal", val=val)


def _anim_scale(T, parent, e, dur, *, by=None, frm=None, to=None, autorev=False, fill="hold"):
    sc = E(parent, "p:animScale")
    cb = E(sc, "p:cBhvr")
    attrs = {"id": T.nid(), "dur": str(dur), "fill": fill}
    if autorev:
        attrs["autoRev"] = "1"
    E(cb, "p:cTn", **attrs)
    cb.append(tgtel(e["spid"], e.get("prg")))
    if by is not None:
        E(sc, "p:by", x=str(by), y=str(by))
    if frm is not None:
        E(sc, "p:from", x=str(frm), y=str(frm))
    if to is not None:
        E(sc, "p:to", x=str(to), y=str(to))


def _anim_rot(T, parent, e, by, dur, delay="0"):
    r = E(parent, "p:animRot", by=str(by))
    cb = E(r, "p:cBhvr")
    ct = E(cb, "p:cTn", id=T.nid(), dur=str(dur), fill="hold")
    cst = E(ct, "p:stCondLst")
    E(cst, "p:cond", delay=str(delay))
    cb.append(tgtel(e["spid"], e.get("prg")))
    an = E(cb, "p:attrNameLst")
    E(an, "p:attrName").text = "r"


def _anim_clr(T, parent, e, hexval, dur):
    c = E(parent, "p:animClr", clrSpc="rgb", dir="cw")
    cb = E(c, "p:cBhvr")
    E(cb, "p:cTn", id=T.nid(), dur=str(dur), fill="hold")
    cb.append(tgtel(e["spid"], e.get("prg")))
    an = E(cb, "p:attrNameLst")
    E(an, "p:attrName").text = "fillcolor"
    to = E(c, "p:to")
    E(to, "a:srgbClr", val=hexval)


def _motion(T, parent, e, path, dur):
    m = E(
        parent,
        "p:animMotion",
        origin="layout",
        path=path,
        pathEditMode="relative",
        ptsTypes="",
    )
    cb = E(m, "p:cBhvr")
    E(cb, "p:cTn", id=T.nid(), dur=str(dur), fill="hold")
    cb.append(tgtel(e["spid"], e.get("prg")))
    an = E(cb, "p:attrNameLst")
    E(an, "p:attrName").text = "ppt_x"
    E(an, "p:attrName").text = "ppt_y"


def _behaviors(T, parent, e):
    k = e["kind"]
    dur = e["dur"]
    if k == "fade_in":
        _set_vis(T, parent, e, "visible")
        _anim_effect(T, parent, e, "in", "fade", dur)
    elif k == "appear":
        _set_vis(T, parent, e, "visible")
    elif k == "fly_in":
        x0 = "#ppt_x-0.25" if e["sub"] == SUB_LEFT else "#ppt_x+0.25" if e["sub"] == SUB_RIGHT else "#ppt_x"
        y0 = "#ppt_y+0.25" if e["sub"] == SUB_BOTTOM else "#ppt_y-0.25" if e["sub"] == SUB_TOP else "#ppt_y"
        _set_vis(T, parent, e, "visible")
        _anim_xy(T, parent, e, "ppt_x", x0, "#ppt_x", dur)
        _anim_xy(T, parent, e, "ppt_y", y0, "#ppt_y", dur)
    elif k == "float_in":
        _set_vis(T, parent, e, "visible")
        _anim_effect(T, parent, e, "in", "fade", dur)
        _anim_xy(T, parent, e, "ppt_y", "#ppt_y+0.06", "#ppt_y", dur)
    elif k == "zoom_in":
        _set_vis(T, parent, e, "visible")
        _anim_effect(T, parent, e, "in", "fade", dur)
        _anim_scale(T, parent, e, dur, frm=0, to=100000)
    elif k == "split_in":
        _set_vis(T, parent, e, "visible")
        _anim_effect(T, parent, e, "in", e.get("filter", "barn(inVertical)"), dur)
    elif k == "wipe_in":
        _set_vis(T, parent, e, "visible")
        _anim_effect(T, parent, e, "in", e.get("filter", "wipe(up)"), dur)
    elif k == "fade_out":
        _anim_effect(T, parent, e, "out", "fade", dur)
    elif k == "disappear":
        _set_vis(T, parent, e, "hidden")
    elif k == "fly_out":
        dx = "+0.25" if e.get("sub", SUB_RIGHT) == SUB_RIGHT else "-0.25"
        _anim_xy(T, parent, e, "ppt_x", "#ppt_x", f"#ppt_x{dx}", dur)
        _anim_xy(T, parent, e, "ppt_y", "#ppt_y", "#ppt_y", dur)
        _set_vis(T, parent, e, "hidden", delay=str(dur))
    elif k == "zoom_out":
        _anim_scale(T, parent, e, dur, to=0)
        _anim_effect(T, parent, e, "out", "fade", dur)
        _set_vis(T, parent, e, "hidden", delay=str(dur))
    elif k == "pulse":
        _anim_effect(T, parent, e, "out", "fade", 500, tmFilter="0, 0; .2, .5; .8, .5; 1, 0")
        _anim_scale(T, parent, e, 250, by=105000, autorev=True)
    elif k == "grow":
        _anim_scale(T, parent, e, dur, by=int(e.get("pct", 150000)), fill="hold")
    elif k == "spin":
        _anim_rot(T, parent, e, 21600000, dur)
    elif k == "teeter":
        steps = [(120000, 100, 0), (-240000, 200, 200), (240000, 200, 400), (-240000, 200, 600), (120000, 200, 800)]
        for by, sd, dl in steps:
            _anim_rot(T, parent, e, by, sd, delay=str(dl))
    elif k == "fill_color":
        _anim_clr(T, parent, e, e.get("hex", "C00000"), dur)
    elif k == "transparency":
        _set_opacity(T, parent, e, e.get("val", "0.5"))
    elif k == "mpath":
        _motion(T, parent, e, e["path"], dur)


def _set_opacity(T, parent, e, val):
    s = E(parent, "p:set")
    cb = E(s, "p:cBhvr")
    E(cb, "p:cTn", id=T.nid())
    cb.append(tgtel(e["spid"], e.get("prg")))
    an = E(cb, "p:attrNameLst")
    E(an, "p:attrName").text = "style.opacity"
    to = E(s, "p:to")
    E(to, "p:strVal", val=val)
    ae = E(parent, "p:animEffect", filter="image", prLst=f"opacity: {val}")
    cb2 = E(ae, "p:cBhvr", rctx="IE")
    E(cb2, "p:cTn", id=T.nid())
    cb2.append(tgtel(e["spid"], e.get("prg")))


def attach_timing(slide, timing, bld_spids=()):
    if bld_spids:
        bld = E(timing.el, "p:bldLst")
        for sp in bld_spids:
            bg = E(bld, "p:bldGraphic", spid=str(sp), grpId="0")
            E(bg, "p:bldAsOne")
    if timing.el.getparent() is None:
        slide._element.append(timing.el)


def add_transition(slide, kind, spd="med", **attrs):
    tr = etree.Element(qn("p:transition"), spd=spd)
    ch = etree.SubElement(tr, qn(f"p:{kind}"))
    for k, v in attrs.items():
        ch.set(k, v)
    slide._element.append(tr)


# ---------------------------------------------------------------- slide helpers


def txt(slide, x, y, w, h, lines, size=12, color=WHITE, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE, italic=False):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = Emu(18288)
    tf.margin_top = tf.margin_bottom = 0
    lines = [lines] if isinstance(lines, str) else list(lines)
    size_l = list(size) if isinstance(size, (list, tuple)) else None
    color_l = list(color) if isinstance(color, list) else None
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        r = p.add_run()
        r.text = line
        r.font.size = Pt(size_l[min(i, len(size_l) - 1)] if size_l else size)
        r.font.bold = bold and not (size_l and i > 0)
        r.font.italic = italic
        r.font.color.rgb = color_l[min(i, len(color_l) - 1)] if color_l else color
    return tb


def para_box(slide, x, y, w, h, items, size=14, colors=None, bold=False):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = MSO_ANCHOR.TOP
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = PP_ALIGN.LEFT
        r = p.add_run()
        r.text = item
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.color.rgb = (colors[min(i, len(colors) - 1)] if colors else GRAY)
    return tb


def shape(slide, kind, x, y, w, h, label, fill, size=13, line=None):
    sp = slide.shapes.add_shape(kind, Inches(x), Inches(y), Inches(w), Inches(h))
    sp.fill.solid()
    sp.fill.fore_color.rgb = fill
    if line is None:
        sp.line.fill.background()
    else:
        sp.line.color.rgb = line
        sp.line.width = Pt(1)
    sp.shadow.inherit = False
    tf = sp.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.margin_left = tf.margin_right = Emu(27432)
    tf.margin_top = tf.margin_bottom = 0
    parts = label.split("\n") if label else []
    for i, part in enumerate(parts):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = PP_ALIGN.CENTER
        r = p.add_run()
        r.text = part
        r.font.size = Pt(size if i == 0 else max(size - 3, 8))
        r.font.bold = i == 0
        r.font.color.rgb = WHITE
    return sp


def caption(slide, x, y, w, text, h=0.35, size=10, align=PP_ALIGN.CENTER, color=LGRAY):
    return txt(slide, x, y, w, h, text, size=size, color=color, bold=False, align=align, italic=True)


def header(slide, tag, title):
    shape(slide, MSO_SHAPE.RECTANGLE, 0, 0, 13.333, 0.95, "", NAVY)
    chip = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.45), Inches(0.24), Inches(1.85), Inches(0.48))
    chip.fill.solid()
    chip.fill.fore_color.rgb = ORANGE
    chip.line.fill.background()
    chip.shadow.inherit = False
    ctf = chip.text_frame
    ctf.vertical_anchor = MSO_ANCHOR.MIDDLE
    cp = ctf.paragraphs[0]
    cp.alignment = PP_ALIGN.CENTER
    cr = cp.add_run()
    cr.text = tag
    cr.font.size = Pt(16)
    cr.font.bold = True
    cr.font.color.rgb = WHITE
    txt(slide, 2.55, 0.18, 10.4, 0.6, title, size=26, color=WHITE, align=PP_ALIGN.LEFT)


def hint(slide, text):
    caption(slide, 0.6, 7.08, 12.1, text, size=11, align=PP_ALIGN.LEFT, color=LGRAY)


def sid(sh):
    return sh.shape_id


# ---------------------------------------------------------------- slides


def slide_cover(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    shape(s, MSO_SHAPE.RECTANGLE, 0, 0, 13.333, 7.5, "", NAVY)
    shape(s, MSO_SHAPE.RECTANGLE, 0, 6.9, 13.333, 0.6, "", ORANGE)
    txt(s, 0.8, 1.9, 11.7, 1.1, "PowerPoint Animation Stress-Test Deck", size=40, color=WHITE)
    txt(
        s,
        0.8,
        3.05,
        11.7,
        0.6,
        "Reference deck for evaluating iSpring Suite's PowerPoint → HTML5 conversion",
        size=17,
        color=RGBColor(0xBD, 0xD7, 0xEE),
        bold=False,
    )
    para_box(
        s,
        3.1,
        4.15,
        7.2,
        2.2,
        [
            "10 labeled TEST areas — entrance, exit, emphasis, motion paths,",
            "timing/sequencing, text builds, charts & diagrams, media,",
            "complex combinations, and one heavy 29-object stress slide.",
            "",
            "Advance with clicks — every slide states how many clicks it needs.",
            "Final slide lists every feature for the compatibility checklist.",
        ],
        size=14,
        colors=[WHITE, WHITE, WHITE, WHITE, RGBColor(0xBD, 0xD7, 0xEE)],
    )
    txt(s, 0.8, 6.98, 11.7, 0.4, "Office Open XML · 16:9 · animations authored with standard PowerPoint preset OOXML", size=11, color=NAVY, bold=True)


def slide_entrance(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    header(s, "TEST 01", "BASIC ENTRANCE ANIMATIONS")
    caption(s, 0.75, 1.05, 12, "Seven objects hidden at start — one appears per click, in reading order.", size=12)
    specs = [
        ("Fade", BLUE, lambda sp: eff("fade_in", sp, dur=600)),
        ("Appear", GREEN, lambda sp: eff("appear", sp, dur=100, span=300)),
        ("Fly In\n(from bottom)", ORANGE, lambda sp: eff("fly_in", sp, sub=SUB_BOTTOM, dur=700)),
        ("Float In\n(rise + fade)", TEAL, lambda sp: eff("float_in", sp, dur=900)),
        ("Zoom\n(scale in)", PURPLE, lambda sp: eff("zoom_in", sp, dur=600)),
        ("Split\n(vertical in)", RED, lambda sp: eff("split_in", sp, filter="barn(inVertical)", dur=700)),
        ("Wipe\n(from bottom)", RGBColor(0x7F, 0x60, 0x00), lambda sp: eff("wipe_in", sp, filter="wipe(up)", sub=SUB_BOTTOM, dur=600)),
    ]
    xs = [0.75, 3.9, 7.05, 10.2]
    clicks = []
    ids = []
    for i, (label, color, fx) in enumerate(specs):
        row, col = divmod(i, 4)
        x = xs[col]
        y = 1.95 if row == 0 else 4.35
        sp = shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, x, y, 2.55, 1.35, f"{label}\nclick {i + 1}", color, size=15)
        ids.append(sid(sp))
        caption(s, x, y + 1.42, 2.55, f"Click {i + 1}")
        clicks.append(fx(ids[-1]))
    hint(s, "Effects used: Fade · Appear · Fly In (bottom) · Float In · Zoom · Split (Vertical In) · Wipe (From Bottom)")
    T = Timing()
    for e in clicks:
        T.click([e])
    attach_timing(s, T)


def slide_exit(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    header(s, "TEST 02", "EXIT ANIMATIONS")
    caption(s, 0.75, 1.05, 12, "All four shapes are visible immediately — each click removes one of them.", size=12)
    specs = [
        ("Fade Out", BLUE, lambda sp: eff("fade_out", sp, dur=600)),
        ("Disappear", GREEN, lambda sp: eff("disappear", sp, dur=100, span=300)),
        ("Fly Out\n(to the right)", ORANGE, lambda sp: eff("fly_out", sp, sub=SUB_RIGHT, dur=800)),
        ("Zoom Out\n(shrink away)", PURPLE, lambda sp: eff("zoom_out", sp, dur=700)),
    ]
    xs = [0.95, 4.1, 7.25, 10.4]
    T = Timing()
    for i, (label, color, fx) in enumerate(specs):
        sp = shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, xs[i], 2.5, 2.55, 1.5, f"{label}\nexit target {i + 1}", color, size=15)
        caption(s, xs[i], 4.15, 2.55, f"Click {i + 1} removes this shape")
        T.click([fx(sid(sp))])
    hint(s, "Effects used: Fade (exit) · Disappear · Fly Out (right) · Zoom/Contract (exit)")
    attach_timing(s, T)


def slide_emphasis(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    header(s, "TEST 03", "EMPHASIS ANIMATIONS")
    caption(s, 0.75, 1.05, 12, "Shapes stay visible — each click applies one emphasis effect in place.", size=12)
    specs = [
        ("Pulse", BLUE, lambda sp: eff("pulse", sp, dur=500, span=500)),
        ("Grow / Shrink\n(to 150%)", GREEN, lambda sp: eff("grow", sp, pct=150000, dur=900)),
        ("Spin\n(360° clockwise)", ORANGE, lambda sp: eff("spin", sp, dur=1200)),
        ("Teeter\n(rocking rotation)", TEAL, lambda sp: eff("teeter", sp, dur=100, span=1000)),
        ("Fill Color → Red", YELLOW, lambda sp: eff("fill_color", sp, hex="C00000", dur=700)),
        ("Transparency → 50%", LGRAY, lambda sp: eff("transparency", sp, val="0.5", dur=100, span=600)),
    ]
    xs = [0.9, 5.0, 9.1]
    ys = [2.0, 4.3]
    T = Timing()
    for i, (label, color, fx) in enumerate(specs):
        row, col = divmod(i, 3)
        x, y = xs[col], ys[row]
        sp = shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, x, y, 3.5, 1.6, f"{label}\nclick {i + 1}", color, size=15)
        caption(s, x, y + 1.68, 3.5, f"Click {i + 1}: {label.splitlines()[0]}")
        T.click([fx(sid(sp))])
    hint(s, "Effects used: Pulse · Grow/Shrink 150% · Spin 360° · Teeter · Change Fill Color · Transparency 50%")
    attach_timing(s, T)


def slide_motion(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    header(s, "TEST 04", "MOTION PATHS")
    caption(s, 0.75, 1.05, 12, "Six click stages — straight, diagonal, curved, simultaneous and follow-the-leader movement.", size=12)
    right = shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 1.0, 2.3, 2.0, 1.0, "→ Right", BLUE, size=13)
    left = shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 4.3, 2.3, 2.0, 1.0, "← Left", GREEN, size=13)
    up = shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 7.6, 2.3, 1.9, 1.0, "↑ Up", ORANGE, size=13)
    down = shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 9.9, 2.3, 1.9, 1.0, "↓ Down", PURPLE, size=13)
    diag = shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 1.0, 4.6, 2.0, 1.0, "↘ Diagonal", RED, size=13)
    curve = shape(s, MSO_SHAPE.OVAL, 4.3, 4.6, 1.6, 1.6, "Custom\ncurve", TEAL, size=12)
    leader = shape(s, MSO_SHAPE.OVAL, 7.6, 4.4, 1.1, 1.1, "Lead", BLUE, size=11)
    follower = shape(s, MSO_SHAPE.OVAL, 7.6, 5.8, 1.1, 1.1, "Follow", GREEN, size=11)
    caption(s, 0.9, 3.38, 2.2, "Click 1: path Right")
    caption(s, 4.2, 3.38, 2.2, "Click 2: path Left")
    caption(s, 7.5, 1.95, 4.4, "Click 3: Up + Down simultaneously (With Previous)")
    caption(s, 0.9, 6.28, 2.2, "Click 4: diagonal")
    caption(s, 4.2, 6.28, 2.2, "Click 5: Bézier path")
    caption(s, 9.9, 4.95, 3.2, "Click 6: follower starts +250 ms\nafter leader (same path)", h=0.8)
    T = Timing()
    T.click([eff("mpath", sid(right), path="M 0 0 L 0.18 0 E", dur=1000)])
    T.click([eff("mpath", sid(left), path="M 0 0 L -0.18 0 E", dur=1000)])
    T.click([
        eff("mpath", sid(up), path="M 0 0 L 0 -0.18 E", dur=1000, nt="clickEffect", delay=0),
        eff("mpath", sid(down), path="M 0 0 L 0 0.18 E", dur=1000, nt="withEffect", delay=0),
    ])
    T.click([eff("mpath", sid(diag), path="M 0 0 L 0.14 0.11 E", dur=1100)])
    T.click([eff("mpath", sid(curve), path="M 0 0 C 0.07 -0.14 0.18 0.14 0.26 0 E", dur=1400)])
    T.click([
        eff("mpath", sid(leader), path="M 0 0 L 0.22 0 E", dur=1200, nt="clickEffect", delay=0),
        eff("mpath", sid(follower), path="M 0 0 L 0.22 0 E", dur=1200, nt="withEffect", delay=250),
    ])
    hint(s, "Path types: Right · Left · Up/Down simultaneous · Diagonal · Custom Bézier · Follow-the-leader (delayed twin)")
    attach_timing(s, T)


def slide_timing(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    header(s, "TEST 05", "TIMING & SEQUENCING")
    caption(s, 0.75, 1.05, 12, "Three click groups demonstrate On Click vs With Previous vs After Previous, delays and durations.", size=12)
    a = shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 0.9, 1.95, 2.7, 1.0, "A — On Click", BLUE, size=13)
    caption(s, 0.9, 3.0, 2.7, "Click 1 · starts alone")
    b = shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 0.9, 3.65, 2.7, 1.0, "B — With Previous", GREEN, size=13)
    c = shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 4.3, 3.65, 2.7, 1.0, "C — After Previous\n+250 ms gap", ORANGE, size=13)
    d = shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 7.7, 3.65, 2.4, 1.0, "D — With Previous\ndelay 700 ms", PURPLE, size=13)
    caption(s, 0.9, 4.72, 9.4, "Click 2 group: B at 0 ms · C after B ends (+250 ms) · D at absolute 700 ms")
    e = shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 0.9, 5.5, 2.7, 1.0, "E — After Previous\n0.3 s", TEAL, size=13)
    f = shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 4.3, 5.5, 2.7, 1.0, "F — After Previous\n0.9 s", RED, size=13)
    g = shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 7.7, 5.5, 2.7, 1.0, "G — After Previous\n0.6 s", RGBColor(0x7F, 0x60, 0x00), size=13)
    caption(s, 0.9, 6.57, 9.4, "Click 3 chain: E → F → G run automatically with different durations (0.3 / 0.9 / 0.6 s)")
    T = Timing()
    T.click([eff("fade_in", sid(a), dur=500)])
    T.click([
        eff("fade_in", sid(b), dur=600, nt="clickEffect", delay=0),
        eff("fade_in", sid(c), dur=500, nt="afterEffect", delay=850),
        eff("wipe_in", sid(d), filter="wipe(up)", sub=SUB_BOTTOM, dur=400, nt="withEffect", delay=700),
    ])
    T.click([
        eff("fade_in", sid(e), dur=300, nt="clickEffect", delay=0),
        eff("zoom_in", sid(f), dur=900, nt="afterEffect"),
        eff("fade_in", sid(g), dur=600, nt="afterEffect"),
    ])
    hint(s, "Covers: Start On Click · Start With Previous · Start After Previous · delays 0–850 ms · durations 0.3–0.9 s")
    attach_timing(s, T)


def slide_text(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    header(s, "TEST 06", "TEXT ANIMATION")
    caption(s, 0.75, 1.05, 12, "Whole-text-box animation, paragraph-range builds, and automatic bullet sequencing.", size=12)
    frame = shape(s, MSO_SHAPE.RECTANGLE, 0.85, 1.95, 3.6, 1.5, "", RGBColor(0xF2, 0xF2, 0xF2))
    frame.text_frame.text = ""
    whole = para_box(s, 1.0, 2.1, 3.3, 1.2, ["This whole text box fades", "in as a single object."], size=14, colors=[NAVY])
    caption(s, 0.85, 3.55, 3.6, "Click 1 — animate entire text box")
    shape(s, MSO_SHAPE.RECTANGLE, 4.95, 1.95, 3.6, 2.6, "", RGBColor(0xF2, 0xF2, 0xF2)).text_frame.text = ""
    bypara = para_box(
        s,
        5.1,
        2.1,
        3.3,
        2.3,
        ["Paragraph one — click 2", "Paragraph two — click 3", "Paragraph three — click 4"],
        size=14,
        colors=[BLUE, GREEN, RED],
    )
    caption(s, 4.95, 4.62, 3.6, "Clicks 2–4 — animate by paragraph (pRg ranges)")
    shape(s, MSO_SHAPE.RECTANGLE, 9.05, 1.95, 3.6, 2.6, "", RGBColor(0xF2, 0xF2, 0xF2)).text_frame.text = ""
    bullets = para_box(
        s,
        9.2,
        2.1,
        3.3,
        2.3,
        ["• Bullet one (0.4 s)", "• Bullet two (0.7 s)", "• Bullet three (1.0 s)"],
        size=14,
        colors=[PURPLE, ORANGE, TEAL],
    )
    caption(s, 9.05, 4.62, 3.6, "Click 5 — bullets build automatically,\none after another", h=0.6)
    T = Timing()
    T.click([eff("fade_in", sid(whole), dur=700)])
    T.click([eff("fade_in", sid(bypara), prg=(0, 0), dur=500)])
    T.click([eff("fade_in", sid(bypara), prg=(1, 1), dur=700)])
    T.click([eff("wipe_in", sid(bypara), prg=(2, 2), filter="wipe(right)", dur=900)])
    T.click([
        eff("appear", sid(bullets), prg=(0, 0), dur=100, span=400, nt="clickEffect", delay=0),
        eff("appear", sid(bullets), prg=(1, 1), dur=100, span=700, nt="afterEffect"),
        eff("fade_in", sid(bullets), prg=(2, 2), dur=1000, nt="afterEffect"),
    ])
    hint(s, "Covers: whole-object text animation · paragraph-index targets · sequential bullet builds · mixed durations on one shape")
    attach_timing(s, T)


def slide_chart(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    header(s, "TEST 07", "CHARTS & DIAGRAMS")
    caption(s, 0.75, 1.05, 12, "Animated chart object, sequential process flow, and a milestone timeline.", size=12)
    data = CategoryChartData()
    data.categories = ["Q1", "Q2", "Q3", "Q4"]
    data.add_series("Units", (12.5, 8.4, 15.9, 19.2))
    gf = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(0.7), Inches(1.9), Inches(5.4), Inches(3.9), data)
    gf.has_title = False
    chart_caption = caption(s, 0.7, 5.95, 5.4, "Click 1 — chart fades in as ONE animated object")
    chevs = []
    labels = ["Step 1\nPlan", "Step 2\nBuild", "Step 3\nTest", "Step 4\nShip"]
    colors = [BLUE, GREEN, ORANGE, PURPLE]
    for i in range(4):
        chevs.append(shape(s, MSO_SHAPE.CHEVRON, 6.5 + i * 1.62, 2.0, 1.55, 0.95, labels[i], colors[i], size=11))
    caption(s, 6.5, 3.05, 6.2, "Click 2 — process flow builds step-by-step (After Previous)")
    base = shape(s, MSO_SHAPE.RECTANGLE, 6.5, 5.45, 6.2, 0.07, "", LGRAY)
    base.text_frame.text = ""
    miles = []
    for i, name in enumerate(["Kickoff", "Design", "Build", "Launch"]):
        dot = shape(s, MSO_SHAPE.OVAL, 6.75 + i * 1.52, 5.28, 0.4, 0.4, "", colors[i])
        dot.text_frame.text = ""
        miles.append((dot, name))
    caption(s, 6.5, 5.85, 6.2, "Click 3 — timeline milestones appear one after another")
    T = Timing()
    T.click([eff("fade_in", sid(gf), dur=800)])
    flow_effects = []
    for i, ch in enumerate(chevs):
        flow_effects.append(eff("wipe_in", sid(ch), filter="wipe(left)", dur=350, nt="clickEffect" if i == 0 else "afterEffect"))
    T.click(flow_effects)
    tl = [eff("wipe_in", sid(base), filter="wipe(right)", dur=400, nt="clickEffect", delay=0)]
    for dot, _ in miles:
        tl.append(eff("zoom_in", sid(dot), dur=300, nt="afterEffect"))
    T.click(tl)
    hint(s, "Chart targeted via spTgt + <p:bldGraphic><p:bldAsOne/> · chevron wipe-left sequence · milestone zoom chain")
    attach_timing(s, T, bld_spids=(sid(gf),))


def slide_media(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    header(s, "TEST 08", "IMAGES & MEDIA")
    caption(s, 0.75, 1.05, 12, "Image entrance/movement/exit, image + text combo, and an embedded MP4 video.", size=12)
    png = str(ASSETS / "sample.png")
    mp4 = str(ASSETS / "sample.mp4")
    img1 = s.shapes.add_picture(png, Inches(0.9), Inches(1.9), Inches(3.0), Inches(2.25))
    img2 = s.shapes.add_picture(png, Inches(0.9), Inches(5.0), Inches(1.9), Inches(1.43))
    img2_cap = txt(s, 3.0, 5.35, 3.1, 0.8, ["Caption enters together", "with the image (Click 4)"], size=12, color=GRAY, align=PP_ALIGN.LEFT)
    video = s.shapes.add_movie(mp4, Inches(7.4), Inches(1.9), Inches(5.2), Inches(2.93), poster_frame_image=png, mime_type="video/mp4")
    caption(s, 0.9, 4.3, 3.0, "Clicks 1–3:\nZoom in → move right → fade out", h=0.6)
    caption(s, 7.4, 4.98, 5.2, "Embedded MP4 (static media test) — Click 5 fades the poster frame in")
    T = Timing(s)
    T.click([eff("zoom_in", sid(img1), dur=600)])
    T.click([eff("mpath", sid(img1), path="M 0 0 L 0.12 0 E", dur=900)])
    T.click([eff("fade_out", sid(img1), dur=600)])
    T.click([
        eff("fade_in", sid(img2), dur=600, nt="clickEffect", delay=0),
        eff("fade_in", sid(img2_cap), dur=600, nt="withEffect", delay=0),
    ])
    T.click([eff("fade_in", sid(video), dur=800)])
    add_transition(s, "push", dir="l")
    hint(s, "Media coverage: image zoom/path/fade-exit · simultaneous image+text · embedded H.264 MP4 · push slide transition")
    attach_timing(s, T)


def slide_complex(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    header(s, "TEST 09", "COMPLEX ANIMATION COMBINATIONS")
    caption(s, 0.75, 1.05, 12, "Multi-effect lifecycles, text + motion simultaneity, layered overlaps, transition + foreground mix.", size=12)
    star = shape(s, MSO_SHAPE.STAR_5_POINT, 1.0, 2.0, 1.6, 1.6, "Combo", YELLOW, size=12)
    caption(s, 0.7, 3.8, 3.3, "Click 1 Zoom in → Click 2 Move ↘\nClick 3 Pulse → Click 4 Fade out", h=0.7, color=GRAY)
    story = para_box(
        s,
        4.6,
        2.0,
        3.6,
        1.5,
        ["Line one appears…", "line two follows…", "line three completes."],
        size=14,
        colors=[BLUE, GREEN, RED],
    )
    c1 = shape(s, MSO_SHAPE.OVAL, 4.8, 4.0, 0.85, 0.85, "A", BLUE, size=12)
    c2 = shape(s, MSO_SHAPE.OVAL, 6.0, 4.0, 0.85, 0.85, "B", GREEN, size=12)
    caption(s, 4.6, 5.05, 3.8, "Click 5 — text builds line-by-line while circles A+B move simultaneously", h=0.6)
    layers = [
        shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 9.2, 2.1, 2.7, 1.6, "Layer 1", RGBColor(0x8F, 0xAA, 0xDC), size=12),
        shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 9.85, 2.8, 2.7, 1.6, "Layer 2", RGBColor(0xF4, 0xB1, 0x83), size=12),
        shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 9.5, 3.55, 2.7, 1.6, "Layer 3", RGBColor(0xA9, 0xD1, 0x8E), size=12),
    ]
    caption(s, 9.2, 5.35, 3.4, "Click 6 — overlapping layers fade in staggered (0 / 250 / 500 ms)", h=0.6)
    chip = shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 9.2, 6.25, 3.4, 0.55, "Slide transition: Fade", NAVY, size=11)
    chip.text_frame.paragraphs[0].runs[0].font.italic = True
    T = Timing()
    T.click([eff("zoom_in", sid(star), dur=700)])
    T.click([eff("mpath", sid(star), path="M 0 0 L 0.1 0.08 E", dur=1000)])
    T.click([eff("pulse", sid(star), dur=500, span=500)])
    T.click([eff("fade_out", sid(star), dur=700)])
    T.click([
        eff("fade_in", sid(story), prg=(0, 0), dur=400, nt="clickEffect", delay=0),
        eff("fade_in", sid(story), prg=(1, 1), dur=400, nt="afterEffect"),
        eff("fade_in", sid(story), prg=(2, 2), dur=400, nt="afterEffect"),
        eff("mpath", sid(c1), path="M 0 0 L 0.09 -0.09 E", dur=1300, nt="withEffect", delay=0),
        eff("mpath", sid(c2), path="M 0 0 L 0.09 0.09 E", dur=1300, nt="withEffect", delay=200),
    ])
    T.click([
        eff("fade_in", sid(layers[0]), dur=600, nt="clickEffect", delay=0),
        eff("fade_in", sid(layers[1]), dur=600, nt="afterEffect", delay=250),
        eff("fade_in", sid(layers[2]), dur=600, nt="afterEffect", delay=500),
    ])
    add_transition(s, "fade")
    hint(s, "Lifecycle enter→move→emphasize→exit · paragraph build + parallel motion · layered staggered reveal · Fade transition + foreground animation")
    attach_timing(s, T)


def slide_heavy(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    header(s, "TEST 10", "HEAVY ANIMATION STRESS TEST")
    caption(s, 0.45, 1.05, 12.4, "29 animated objects · ~60 timed effects · 5 click stages · mixed types, overlaps, paths and text builds.", size=12)
    palette = [BLUE, GREEN, ORANGE, PURPLE, TEAL, RED]
    kinds = ["fade_in", "wipe_in", "zoom_in", "fly_in", "float_in", "appear"]
    kinds_args = {
        "fade_in": {},
        "wipe_in": {"filter": "wipe(up)", "sub": SUB_BOTTOM},
        "zoom_in": {},
        "fly_in": {"sub": SUB_BOTTOM},
        "float_in": {},
        "appear": {},
    }
    shapes_by_idx = {}
    n = 1
    for row in range(4):
        for col in range(6):
            k = (row * 6 + col) % 6
            kind = [MSO_SHAPE.RECTANGLE, MSO_SHAPE.OVAL, MSO_SHAPE.DIAMOND, MSO_SHAPE.HEXAGON][(row + col) % 4]
            sp = shape(
                s,
                kind,
                0.45 + col * 2.09,
                1.75 + row * 1.22,
                1.95,
                1.05,
                f"H{n:02d}",
                palette[k],
                size=11,
            )
            shapes_by_idx[n] = sp
            n += 1
    cluster = [
        shape(s, MSO_SHAPE.OVAL, 5.85, 3.45, 1.5, 1.5, "C1", BLUE, size=10),
        shape(s, MSO_SHAPE.OVAL, 6.65, 3.45, 1.5, 1.5, "C2", ORANGE, size=10),
        shape(s, MSO_SHAPE.OVAL, 6.25, 4.2, 1.5, 1.5, "C3", GREEN, size=10),
        shape(s, MSO_SHAPE.OVAL, 7.05, 4.2, 1.5, 1.5, "C4", PURPLE, size=10),
    ]
    stress = para_box(
        s,
        0.5,
        6.68,
        5.6,
        0.75,
        ["Stress text line 1", "Stress text line 2", "Stress text line 3"],
        size=9,
        colors=[NAVY, NAVY, NAVY],
    )
    caption(
        s,
        6.5,
        6.72,
        6.3,
        "Stage 1 entrances (staggered) · Stage 2 text+pulse · Stage 3 paths+spin · Stage 4 emphasis mix · Stage 5 exits",
        h=0.6,
        align=PP_ALIGN.LEFT,
    )

    def spid_of(i):
        return sid(shapes_by_idx[i])

    T = Timing()

    stage1 = []
    for i in range(1, 25):
        k = kinds[(i - 1) % 6]
        kw = kinds_args[k]
        stage1.append(eff(k, spid_of(i), dur=450 if k != "appear" else 100, span=450 if k != "appear" else 250, nt="withEffect", delay=(i - 1) * 70, **kw))
    for j, cshape in enumerate(cluster):
        stage1.append(eff("fade_in", sid(cshape), dur=500, nt="withEffect", delay=1750 + j * 160))
    T.click(stage1)
    stage2 = [eff("fade_in", sid(stress), prg=(0, 0), dur=300, nt="clickEffect", delay=0)]
    stage2.append(eff("fade_in", sid(stress), prg=(1, 1), dur=300, nt="afterEffect"))
    stage2.append(eff("fade_in", sid(stress), prg=(2, 2), dur=300, nt="afterEffect"))
    stage2.append(eff("pulse", spid_of(5), dur=500, span=500, nt="withEffect", delay=1000))
    stage2.append(eff("pulse", spid_of(11), dur=500, span=500, nt="withEffect", delay=1300))
    stage2.append(eff("pulse", spid_of(17), dur=500, span=500, nt="withEffect", delay=1600))
    T.click(stage2)
    stage3 = []
    for j, idx in enumerate([1, 7, 13, 19]):
        stage3.append(eff("mpath", spid_of(idx), path="M 0 0 L 0.1 0 E", dur=800, nt="clickEffect" if j == 0 else "withEffect", delay=j * 150))
    stage3.append(eff("spin", spid_of(4), dur=900, nt="withEffect", delay=0))
    stage3.append(eff("spin", spid_of(16), dur=900, nt="withEffect", delay=400))
    T.click(stage3)
    stage4 = [
        eff("grow", spid_of(9), pct=150000, dur=700, nt="clickEffect", delay=0),
        eff("grow", spid_of(21), pct=150000, dur=700, nt="withEffect", delay=250),
        eff("teeter", spid_of(6), dur=100, span=1000, nt="withEffect", delay=0),
        eff("teeter", spid_of(18), dur=100, span=1000, nt="withEffect", delay=250),
        eff("fill_color", spid_of(2), hex="C00000", dur=600, nt="withEffect", delay=0),
        eff("fill_color", spid_of(14), hex="C00000", dur=600, nt="withEffect", delay=250),
        eff("transparency", spid_of(8), val="0.5", dur=100, span=600, nt="withEffect", delay=0),
        eff("transparency", spid_of(20), val="0.5", dur=100, span=600, nt="withEffect", delay=250),
    ]
    T.click(stage4)
    stage5 = []
    for j, idx in enumerate([1, 3, 5, 7, 9, 11, 13, 15]):
        stage5.append(eff("fade_out", spid_of(idx), dur=400, nt="clickEffect" if j == 0 else "withEffect", delay=j * 80))
    for j, idx in enumerate([2, 4, 6, 8]):
        stage5.append(eff("disappear", spid_of(idx), dur=100, span=250, nt="withEffect", delay=800 + j * 80))
    stage5.append(eff("fly_out", spid_of(22), sub=SUB_RIGHT, dur=700, nt="withEffect", delay=1200))
    stage5.append(eff("fly_out", spid_of(24), sub=SUB_RIGHT, dur=700, nt="withEffect", delay=1300))
    stage5.append(eff("zoom_out", spid_of(10), dur=600, nt="withEffect", delay=1400))
    stage5.append(eff("zoom_out", spid_of(16), dur=600, nt="withEffect", delay=1500))
    T.click(stage5)
    hint(s, "Entrances: fade/wipe/zoom/fly/float/appear · emphasis: pulse/grow/teeter/color/transparency · exits: fade/disappear/fly-out/zoom-out · 4 motion paths + 2 spins + 3 text builds")
    attach_timing(s, T)


def slide_summary(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    header(s, "SUMMARY", "FEATURES USED — iSPRING COMPATIBILITY CHECKLIST BASE")
    rows = [
        ("Test area", "Effects & features exercised", "Slide"),
        ("Basic entrance", "Fade · Appear · Fly In (bottom) · Float In · Zoom · Split (Vertical In) · Wipe (From Bottom)", "TEST 01"),
        ("Exit", "Fade Out · Disappear · Fly Out (right) · Zoom Out", "TEST 02"),
        ("Emphasis", "Pulse · Grow/Shrink 150% · Spin 360° · Teeter · Change Fill Color · Transparency 50%", "TEST 03"),
        ("Motion paths", "Right · Left · Up + Down simultaneous · Diagonal · Custom Bézier curve · Follow-the-leader (+250 ms)", "TEST 04"),
        ("Timing & sequencing", "On Click · With Previous · After Previous chains · delays 0–850 ms · durations 0.3–1.4 s · multi-effect groups", "TEST 05 / 04"),
        ("Text animation", "Whole text box · by paragraph range (pRg) · sequential bullet builds · mixed timings per paragraph", "TEST 06 / 09"),
        ("Charts & diagrams", "Column chart animated as one object (bldAsOne) · chevron process flow (sequential wipe) · milestone timeline (zoom chain)", "TEST 07"),
        ("Images & media", "Picture zoom-in / motion path / fade-out · image + caption simultaneous entrance · embedded MP4 video · push slide transition", "TEST 08"),
        ("Complex combinations", "enter→move→emphasize→exit lifecycle · text line-by-line + simultaneous motion · staggered layered overlaps · Fade transition + foreground animations", "TEST 09"),
        ("Heavy stress test", "29 animated objects · ~60 timed effects · 5 click stages · mixed entrances/emphasis/exits/paths/spins/text builds · overlapping cluster", "TEST 10"),
        ("Transitions", "Fade (TEST 09) · Push Left (TEST 08)", "—"),
    ]
    tbl = s.shapes.add_table(len(rows), 3, Inches(0.5), Inches(1.35), Inches(12.33), Inches(5.5)).table
    tbl.columns[0].width = Inches(2.5)
    tbl.columns[1].width = Inches(8.03)
    tbl.columns[2].width = Inches(1.8)
    for r, row in enumerate(rows):
        for c, val in enumerate(row):
            cell = tbl.cell(r, c)
            cell.text = val
            para = cell.text_frame.paragraphs[0]
            para.font.size = Pt(11 if r == 0 else 10.5)
            para.font.bold = r == 0 or c == 0
            para.font.color.rgb = WHITE if r == 0 else (NAVY if c == 0 else GRAY)
            cell.fill.solid()
            cell.fill.fore_color.rgb = NAVY if r == 0 else (RGBColor(0xF2, 0xF2, 0xF2) if r % 2 else RGBColor(0xE8, 0xEE, 0xF7))
    caption(s, 0.5, 7.02, 12.3, "Tick Pass/Fail per row after running this deck through iSpring Suite and comparing its HTML5 output against this original PPTX.", size=11, align=PP_ALIGN.LEFT, color=GRAY)


def main():
    ensure_assets()
    prs = Presentation()
    prs.slide_width = Emu(12192000)
    prs.slide_height = Emu(6858000)
    slide_cover(prs)
    slide_entrance(prs)
    slide_exit(prs)
    slide_emphasis(prs)
    slide_motion(prs)
    slide_timing(prs)
    slide_text(prs)
    slide_chart(prs)
    slide_media(prs)
    slide_complex(prs)
    slide_heavy(prs)
    slide_summary(prs)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    prs.save(str(OUT))
    print(f"✓ {OUT.relative_to(ROOT)}")
    print(
        f"  slides: {len(prs.slides._sldIdLst)} · click groups: {STATS['clicks']} · "
        f"timed effects: {STATS['effects']} · animated objects: {len(STATS['objects'])}"
    )


def ensure_assets():
    ASSETS.mkdir(parents=True, exist_ok=True)
    from PIL import Image

    png = ASSETS / "sample.png"
    if not png.exists():
        Image.new("RGB", (200, 150), (70, 130, 180)).save(png)
    mp4 = ASSETS / "sample.mp4"
    if not mp4.exists():
        import subprocess

        subprocess.run(
            ["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=steelblue:s=480x270:d=3", "-f", "lavfi", "-i", "sine=f=330:d=3", "-shortest", str(mp4)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )


if __name__ == "__main__":
    sys.exit(main())
