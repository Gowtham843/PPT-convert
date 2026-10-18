#!/usr/bin/env python3
"""Build an iSpring animation-effect catalog deck.

Generates test-files/ispring-effect-catalog.pptx -- one slide per iSpring
animation effect (167 total: Entrance 40, Emphasis 24, Exit 40, Motion
Paths 63), each with a named labelled object animated on click -- plus
test-files/effect-manifest.json for machine-readable side-by-side auditing.

Effect definitions (name, preset triple, behavior recipe) live in
scripts/effect_catalog.py. Behavior OOXML here closely mirrors what
PowerPoint author tools write for each preset.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from lxml import etree
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

sys.path.insert(0, str(Path(__file__).resolve().parent))
import effect_catalog as cat

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "test-files" / "ispring-effect-catalog.pptx"
MANIFEST = ROOT / "test-files" / "effect-manifest.json"

WHITE = RGBColor(0xFF, 0xFF, 0xFF)
NAVY = RGBColor(0x1F, 0x38, 0x64)
LGRAY = RGBColor(0xA6, 0xA6, 0xA6)
CAT_COLORS = {"entr": RGBColor(0x70, 0xAD, 0x47), "emph": RGBColor(0xED, 0x7D, 0x31),
              "exit": RGBColor(0xC0, 0x00, 0x00), "motion": RGBColor(0x44, 0x72, 0xC4)}
CAT_LABEL = {"entr": "ENTRANCE", "emph": "EMPHASIS", "exit": "EXIT", "motion": "MOTION PATH"}


def E(parent, tag, **attrs):
    el = etree.SubElement(parent, qn(tag))
    for k, v in attrs.items():
        if v is not None:
            el.set(k, str(v))
    return el


def tgtel(spid, prg=None):
    t = etree.Element(qn("p:tgtEl"))
    s = etree.SubElement(t, qn("p:spTgt"), spid=str(spid))
    if prg is not None:
        tx = etree.SubElement(s, qn("p:txEl"))
        etree.SubElement(tx, qn("p:pRg"), st=str(prg[0]), end=str(prg[1]))
    return t


# ---------------------------------------------------------------- timing tree
class Timing:
    def __init__(self, slide):
        self._id = 2
        self.el = etree.Element(qn("p:timing"))
        tnLst = E(self.el, "p:tnLst")
        root_par = E(tnLst, "p:par")
        ctn = E(root_par, "p:cTn", id="1", dur="indefinite", restart="never", nodeType="tmRoot")
        child = E(ctn, "p:childTnLst")
        self.seq = E(child, "p:seq", concurrent="1", nextAc="seek")
        seq_ctn = E(self.seq, "p:cTn", id=str(self.nid()), dur="indefinite", nodeType="mainSeq")
        self.main = E(seq_ctn, "p:childTnLst")
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


# ---------------------------------------------------------------- primitive atoms
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


def _anim_effect(T, parent, e, transition, filt, dur, delay=None, tmFilter=None, prLst=None, rctx=None):
    ae = E(parent, "p:animEffect", transition=transition, filter=filt)
    if prLst:
        ae.set("prLst", prLst)
    cb = E(ae, "p:cBhvr")
    if rctx:
        cb.set("rctx", rctx)
    ct = E(cb, "p:cTn", id=T.nid(), dur=str(dur))
    if tmFilter:
        ct.set("tmFilter", tmFilter)
    if delay:
        cst = E(ct, "p:stCondLst")
        E(cst, "p:cond", delay=str(delay))
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


def _anim_scale(T, parent, e, dur, *, by_x=None, by_y=None, frm_x=None, frm_y=None,
                to_x=None, to_y=None, autorev=False, fill="hold", delay="0"):
    sc = E(parent, "p:animScale")
    cb = E(sc, "p:cBhvr")
    attrs = {"id": T.nid(), "dur": str(dur), "fill": fill}
    if autorev:
        attrs["autoRev"] = "1"
    ct = E(cb, "p:cTn", **attrs)
    if delay and delay != "0":
        cst = E(ct, "p:stCondLst")
        E(cst, "p:cond", delay=str(delay))
    cb.append(tgtel(e["spid"], e.get("prg")))
    if by_x is not None or by_y is not None:
        E(sc, "p:by", x=str(by_x), y=str(by_y))
    if frm_x is not None or frm_y is not None:
        E(sc, "p:from", x=str(frm_x), y=str(frm_y))
    if to_x is not None or to_y is not None:
        E(sc, "p:to", x=str(to_x), y=str(to_y))


def _anim_rot(T, parent, e, by, dur, delay="0"):
    r = E(parent, "p:animRot", by=str(by))
    cb = E(r, "p:cBhvr")
    ct = E(cb, "p:cTn", id=T.nid(), dur=str(dur), fill="hold")
    cst = E(ct, "p:stCondLst")
    E(cst, "p:cond", delay=str(delay))
    cb.append(tgtel(e["spid"], e.get("prg")))
    an = E(cb, "p:attrNameLst")
    E(an, "p:attrName").text = "r"


def _anim_clr(T, parent, e, hexval, dur, attr="fillcolor"):
    c = E(parent, "p:animClr", clrSpc="rgb", dir="cw")
    cb = E(c, "p:cBhvr")
    E(cb, "p:cTn", id=T.nid(), dur=str(dur), fill="hold")
    cb.append(tgtel(e["spid"], e.get("prg")))
    an = E(cb, "p:attrNameLst")
    E(an, "p:attrName").text = attr
    to = E(c, "p:to")
    E(to, "a:srgbClr", val=hexval)


def _motion(T, parent, e, path, dur):
    m = E(parent, "p:animMotion", origin="layout", path=path, pathEditMode="relative", ptsTypes="")
    cb = E(m, "p:cBhvr")
    E(cb, "p:cTn", id=T.nid(), dur=str(dur), fill="hold")
    cb.append(tgtel(e["spid"], e.get("prg")))
    an = E(cb, "p:attrNameLst")
    E(an, "p:attrName").text = "ppt_x"
    E(an, "p:attrName").text = "ppt_y"


# ---------------------------------------------------------------- recipe behaviors
def fly_in(T, parent, e, m):
    sub = m.get("sub")
    x0 = "#ppt_x-0.25" if sub == cat.SUB_LEFT else "#ppt_x+0.25" if sub == cat.SUB_RIGHT else "#ppt_x"
    y0 = ("#ppt_y+0.25" if sub == cat.SUB_BOTTOM else
          "#ppt_y-0.25" if sub == cat.SUB_TOP else "#ppt_y")
    _set_vis(T, parent, e, "visible")
    _anim_xy(T, parent, e, "ppt_x", x0, "#ppt_x", e["dur"])
    _anim_xy(T, parent, e, "ppt_y", y0, "#ppt_y", e["dur"])


def fly_out(T, parent, e, m):
    sub = m.get("sub", cat.SUB_RIGHT)
    dx = "+0.25" if sub == cat.SUB_RIGHT else "-0.25"
    dy = "+0.25" if sub == cat.SUB_BOTTOM else "-0.25" if sub == cat.SUB_TOP else "0"
    _anim_xy(T, parent, e, "ppt_x", "#ppt_x", f"#ppt_x{dx}", e["dur"])
    _anim_xy(T, parent, e, "ppt_y", "#ppt_y", f"#ppt_y{dy}", e["dur"])
    _set_vis(T, parent, e, "hidden", delay=str(e["dur"]))


def behaviors(T, parent, e, m):
    kind = m["m"]
    dur = e["dur"]
    out = e.get("out", False)
    if kind == "appear":
        _set_vis(T, parent, e, "hidden" if out else "visible")
    elif kind == "fade":
        if not out:
            _set_vis(T, parent, e, "visible")
            _anim_effect(T, parent, e, "in", "fade", dur)
        else:
            _anim_effect(T, parent, e, "out", "fade", dur)
            _set_vis(T, parent, e, "hidden", delay=str(dur))
    elif kind == "flt":
        _set_vis(T, parent, e, "hidden" if out else "visible", delay="0" if not out else str(dur))
        _anim_effect(T, parent, e, "out" if out else "in", m["f"], dur)
    elif kind == "fly":
        fly_in(T, parent, e, m)
    elif kind == "fly_out":
        fly_out(T, parent, e, m)
    elif kind == "wheel":
        _set_vis(T, parent, e, "visible")
        _anim_effect(T, parent, e, "in", f"wheel({int(m.get('spokes',1))})", dur)
    elif kind == "swivel":
        _set_vis(T, parent, e, "visible")
        _anim_scale(T, parent, e, dur, frm_x=0, frm_y=0, to_x=100000, to_y=100000)
        _anim_rot(T, parent, e, 36000, dur)
    elif kind == "zoom":
        if not out:
            _set_vis(T, parent, e, "visible")
            _anim_effect(T, parent, e, "in", "fade", dur)
            _anim_scale(T, parent, e, dur, frm_x=0, frm_y=0, to_x=100000, to_y=100000)
        else:
            _anim_scale(T, parent, e, dur, to_x=0, to_y=0)
            _anim_effect(T, parent, e, "out", "fade", dur)
            _set_vis(T, parent, e, "hidden", delay=str(dur))
    elif kind == "expand":
        _set_vis(T, parent, e, "visible")
        _anim_scale(T, parent, e, dur, frm_x=0, frm_y=0, to_x=100000, to_y=100000)
    elif kind == "contract":
        _anim_scale(T, parent, e, dur, to_x=0, to_y=0)
        _set_vis(T, parent, e, "hidden", delay=str(dur))
    elif kind == "center_revolve":
        if not out:
            _set_vis(T, parent, e, "visible")
            _anim_rot(T, parent, e, 360000, dur)
            _anim_scale(T, parent, e, dur, to_x=100000, to_y=100000)
        else:
            _anim_rot(T, parent, e, 360000, dur)
            _anim_scale(T, parent, e, dur, to_x=0, to_y=0)
            _set_vis(T, parent, e, "hidden", delay=str(dur))
    elif kind == "grow_turn":
        _set_vis(T, parent, e, "visible")
        _anim_scale(T, parent, e, dur, by_x=200000, by_y=200000)
        _anim_rot(T, parent, e, 180000, dur)
    elif kind == "spinner":
        _set_vis(T, parent, e, "visible")
        _anim_rot(T, parent, e, int(m.get("by", 17200000)), dur)
    elif kind == "float_in":
        _set_vis(T, parent, e, "visible")
        _anim_effect(T, parent, e, "in", "fade", dur)
        _anim_xy(T, parent, e, "ppt_y", "#ppt_y+0.06", "#ppt_y", dur)
    elif kind == "float_out":
        _anim_effect(T, parent, e, "out", "fade", dur * 3 // 5, delay=str(dur * 2 // 5))
        _anim_xy(T, parent, e, "ppt_y", "#ppt_y", "#ppt_y+0.06", dur)
        _set_vis(T, parent, e, "hidden", delay=str(dur))
    elif kind == "rise_up":
        _set_vis(T, parent, e, "visible")
        _anim_xy(T, parent, e, "ppt_y", "#ppt_y+0.15", "#ppt_y", dur)
        _anim_effect(T, parent, e, "in", "fade", dur)
    elif kind == "compress":
        _set_vis(T, parent, e, "visible")
        _anim_scale(T, parent, e, dur, by_x=200000, by_y=200000, autorev=True)
    elif kind == "stretch":
        _set_vis(T, parent, e, "visible")
        _anim_scale(T, parent, e, dur, frm_y=0, to_y=100000)
    elif kind == "bounce_in":
        _set_vis(T, parent, e, "visible")
        _anim_xy(T, parent, e, "ppt_y", "#ppt_y+0.3", "#ppt_y", dur * 3 // 5)
        _anim_effect(T, parent, e, "in", "fade", dur)
        _anim_scale(T, parent, e, 250, by_x=100000, by_y=100000, autorev=True)
    elif kind == "bounce_out":
        _anim_xy(T, parent, e, "ppt_y", "#ppt_y", "#ppt_y+0.25", dur)
        _anim_effect(T, parent, e, "out", "fade", dur)
        _set_vis(T, parent, e, "hidden", delay=str(dur))
    elif kind == "curve_up":
        _set_vis(T, parent, e, "visible")
        _anim_xy(T, parent, e, "ppt_y", "#ppt_y+0.2", "#ppt_y", dur)
    elif kind == "curve_down":
        _anim_xy(T, parent, e, "ppt_y", "#ppt_y", "#ppt_y+0.25", dur)
        _anim_effect(T, parent, e, "out", "fade", dur)
        _set_vis(T, parent, e, "hidden", delay=str(dur))
    elif kind == "flip":
        _set_vis(T, parent, e, "visible")
        _anim_scale(T, parent, e, dur, frm_x=100000, to_x=100000, frm_y=0, to_y=100000)
    elif kind == "whip":
        _set_vis(T, parent, e, "visible")
        _anim_rot(T, parent, e, 360000, dur * 3 // 5)
        _anim_xy(T, parent, e, "ppt_x", "#ppt_x-0.2", "#ppt_x", dur)
    elif kind == "boomerang_in":
        _set_vis(T, parent, e, "visible")
        _anim_xy(T, parent, e, "ppt_x", "#ppt_x-0.3", "#ppt_x", dur)
        _anim_rot(T, parent, e, 144000, dur)
    elif kind == "boomerang_out":
        _anim_xy(T, parent, e, "ppt_x", "#ppt_x", "#ppt_x+0.3", dur)
        _anim_rot(T, parent, e, -144000, dur)
        _set_vis(T, parent, e, "hidden", delay=str(dur))
    elif kind == "credits":
        _set_vis(T, parent, e, "visible")
        _anim_xy(T, parent, e, "ppt_y", "#ppt_y", "#ppt_y-0.1", dur)
        _anim_effect(T, parent, e, "in", "fade", dur)
    elif kind == "credits_out":
        _anim_xy(T, parent, e, "ppt_y", "#ppt_y", "#ppt_y+0.1", dur)
        _anim_effect(T, parent, e, "out", "fade", dur)
        _set_vis(T, parent, e, "hidden", delay=str(dur))
    elif kind == "drop_in":
        _set_vis(T, parent, e, "visible")
        _anim_xy(T, parent, e, "ppt_y", "#ppt_y-0.3", "#ppt_y", dur * 2 // 3)
        _anim_effect(T, parent, e, "in", "fade", dur)
    elif kind == "drop_out":
        _anim_xy(T, parent, e, "ppt_y", "#ppt_y", "#ppt_y+0.3", dur)
        _set_vis(T, parent, e, "hidden", delay=str(dur))
    elif kind == "spiral_in":
        _set_vis(T, parent, e, "visible")
        _anim_scale(T, parent, e, dur, frm_x=0, frm_y=0, to_x=100000, to_y=100000)
        _anim_rot(T, parent, e, 720000, dur)
    elif kind == "spiral_out":
        _anim_scale(T, parent, e, dur, to_x=0, to_y=0)
        _anim_rot(T, parent, e, -720000, dur)
        _set_vis(T, parent, e, "hidden", delay=str(dur))
    elif kind == "shrink_turn":
        _anim_scale(T, parent, e, dur, to_x=0, to_y=0)
        _anim_rot(T, parent, e, 180000, dur)
        _set_vis(T, parent, e, "hidden", delay=str(dur))
    elif kind == "sink_down":
        _anim_xy(T, parent, e, "ppt_y", "#ppt_y", "#ppt_y+0.2", dur)
        _set_vis(T, parent, e, "hidden", delay=str(dur))
    elif kind == "collapse":
        _anim_scale(T, parent, e, dur, frm_y=100000, to_y=0)
        _set_vis(T, parent, e, "hidden", delay=str(dur))
    elif kind == "stretchy":
        _anim_scale(T, parent, e, dur, frm_x=100000, to_x=0)
        _set_vis(T, parent, e, "hidden", delay=str(dur))
    elif kind == "grow":
        _anim_scale(T, parent, e, dur, by_x=int(m.get("pct", 150000)), by_y=int(m.get("pct", 150000)), fill="hold")
    elif kind == "spin":
        _anim_rot(T, parent, e, int(m.get("by", 21600000)), dur)
    elif kind == "pulse":
        _anim_effect(T, parent, e, "out", "fade", 500, tmFilter="0, 0; .2, .5; .8, .5; 1, 0")
        _anim_scale(T, parent, e, 250, by_x=105000, by_y=105000, autorev=True)
    elif kind == "teeter":
        steps = [(120000, 100, 0), (-240000, 200, 200), (240000, 200, 400), (-240000, 200, 600), (120000, 200, 800)]
        for by, sd, dl in steps:
            _anim_rot(T, parent, e, by, sd, delay=str(dl))
    elif kind == "fill":
        _anim_clr(T, parent, e, m.get("hex", "C00000"), dur)
    elif kind == "font":
        _anim_clr(T, parent, e, m.get("hex", "C00000"), dur, attr="style.color")
    elif kind == "line":
        _anim_clr(T, parent, e, m.get("hex", "C00000"), dur, attr="strokeColor")
    elif kind == "opacity":
        _set_opacity(T, parent, e, m.get("val", "0.5"))
    elif kind == "fill_cycle":
        _anim_clr(T, parent, e, "C00000", dur)
        _anim_clr(T, parent, e, "008000", dur)
    elif kind == "grow_color":
        _anim_scale(T, parent, e, dur, by_x=160000, by_y=160000, autorev=True)
        _anim_clr(T, parent, e, "C00000", dur)
    elif kind == "shimmer":
        _anim_effect(T, parent, e, "in", "fade", dur * 3 // 5, tmFilter="0, 0; .5, 1; 1, 0")
        _anim_xy(T, parent, e, "ppt_x", "#ppt_x-0.15", "#ppt_x+0.15", dur)
    elif kind == "bold_flash":
        _anim_effect(T, parent, e, "out", "fade", dur * 3 // 5)
    elif kind == "bold_reveal":
        _anim_scale(T, parent, e, dur, by_x=150000, by_y=150000, autorev=True)
    elif kind == "blink":
        _anim_effect(T, parent, e, "out", "fade", 300, tmFilter="0, 0; .2, 1; .4, 0; .6, 1; .8, 0; 1, 1")
    elif kind == "underline":
        _anim_clr(T, parent, e, "C00000", dur, attr="style.color")
    elif kind == "wave":
        _anim_rot(T, parent, e, 36000, 300, delay="0")
        _anim_rot(T, parent, e, -36000, 300, delay="200")
        _anim_rot(T, parent, e, 36000, 300, delay="400")
    elif kind == "mpath":
        _motion(T, parent, e, m["path"], dur)
    else:
        raise ValueError(f"unknown recipe kind: {kind}")


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


def _add_click(T, tree_main, e, m):
    """Wrap one effect in the canonical click group PowerPoint writes.

    Structure: p:par > p:cTn(presetID/presetClass/nodeType=clickEffect)
               > stCondLst(cond delay=indefinite) + childTnLst(behaviors)
    """
    grp = E(tree_main, "p:par")
    gctn = E(grp, "p:cTn", id=T.nid(), fill="hold")
    st = E(gctn, "p:stCondLst")
    E(st, "p:cond", delay="indefinite")
    glist = E(gctn, "p:childTnLst")
    par = E(glist, "p:par")
    ectn = E(par, "p:cTn", id=T.nid(), fill="hold",
             presetID=m.get("pid", "0"), presetClass=m.get("c", "entr"),
             nodeType="clickEffect")
    if m.get("sub"):
        ectn.set("presetSubtype", m["sub"])
    est = E(ectn, "p:stCondLst")
    E(est, "p:cond", delay=str(e["delay"]))
    echild = E(ectn, "p:childTnLst")
    behaviors(T, echild, e, m)


# ---------------------------------------------------------------- slide helpers
def txt(slide, x, y, w, h, text, size=12, color=WHITE, bold=True, align=PP_ALIGN.LEFT):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.alignment = align
    r = p.add_run()
    r.text = text
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.color.rgb = color
    return tb


def shape(slide, kind, x, y, w, h, label, fill, size=16):
    sp = slide.shapes.add_shape(kind, Inches(x), Inches(y), Inches(w), Inches(h))
    sp.fill.solid()
    sp.fill.fore_color.rgb = fill
    sp.line.fill.background()
    sp.shadow.inherit = False
    tf = sp.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = label
    r.font.size = Pt(size)
    r.font.bold = True
    r.font.color.rgb = WHITE
    return sp


# ---------------------------------------------------------------- deck
def cover_slide(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    txt(s, 0.35, 1.1, 12.5, 1.1, "iSpring Effect Catalog", size=48, color=WHITE)
    txt(s, 0.35, 2.2, 12.5, 0.6,
        "167 animations — one per slide — for PowerPoint→HTML5 comparison",
        size=20, color=LGRAY)
    txt(s, 0.35, 3.0, 12.5, 0.5,
        "Entrance 40 · Emphasis 24 · Exit 40 · Motion Paths 63",
        size=16, color=LGRAY)
    txt(s, 0.35, 6.6, 12.5, 0.5,
        "Each effect: click the labelled object to trigger. Advance slides to audit every effect.",
        size=13, color=LGRAY)


def divider_slide(prs, category, label, items):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    color = CAT_COLORS[category]
    txt(s, 0.35, 0.7, 12.5, 1.0, label, size=40, color=color)
    txt(s, 0.35, 1.8, 12.5, 0.5, f"{len(items)} effects", size=16, color=LGRAY)
    cols = 3
    per = (len(items) + cols - 1) // cols
    for ci in range(cols):
        x = 0.35 + ci * 4.3
        for ri in range(per):
            i = ci * per + ri
            if i >= len(items):
                break
            name = items[i][0]
            txt(s, x, 2.6 + ri * 0.5, 4.1, 0.4, f"{i+1:02d}  {name}", size=12, color=LGRAY)


def effect_slide(prs, idx, slide_no, name, category, m, path=None):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    color = CAT_COLORS[category]
    if category == "motion":
        m = {"m": "mpath", "path": path, "c": "path", "pid": "0"}
    txt(slide, 0.35, 0.25, 12.5, 0.45, f"#{idx:03d}   {CAT_LABEL[category]}   (slide {slide_no})",
        size=14, color=LGRAY)
    txt(slide, 0.35, 0.68, 12.5, 0.7, name, size=30, color=color)
    detail = (f"preset {m.get('pid','0')}:{m.get('c', category)} · " +
              (m.get("f") or m.get("m") or "motion path") +
              (" · click object to trigger"))
    txt(slide, 0.35, 1.42, 12.5, 0.4, detail, size=13, color=LGRAY)

    sp = shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, 4.6, 3.0, 4.1, 1.7, name, color)
    spid = sp.shape_id
    e = {"spid": spid, "dur": 800, "delay": 0, "out": category == "exit"}
    T = Timing(slide)
    _add_click(T, T.main, e, m)
    slide._element.append(T.el)
    return name, spid


def build():
    rows = []
    nav = []
    idx = 0
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    # cover
    cover_slide(prs)
    nav.append({"index": 1, "kind": "nav", "type": "cover"})

    groups = [
        ("entr", "Entrance", [(n, {"pid": p, "c": c, "sub": s, **r}) for (n, p, c, s, r) in cat.ENTRANCE]),
        ("emph", "Emphasis", [(n, {"pid": p, "c": c, "sub": s, **r}) for (n, p, c, s, r) in cat.EMPHASIS]),
        ("exit", "Exit", [(n, {"pid": p, "c": c, "sub": s, **r}) for (n, p, c, s, r) in cat.EXIT]),
    ]
    for catkey, grouplabel, items in groups:
        divider_slide(prs, catkey, f"{grouplabel} animations", items)
        nav.append({"index": len(prs.slides._sldIdLst), "kind": "nav", "type": "divider", "category": catkey})
        for name, m in items:
            idx += 1
            slno = len(prs.slides._sldIdLst) + 1
            effect_slide(prs, idx, slno, name, catkey, m)
            rows.append({"index": slno, "effect_no": idx, "name": name,
                         "category": catkey, "preset": m.get("pid"),
                         "subtype": m.get("sub"), "class": m.get("c")})

    for grouplabel, items in [
        ("Motion Paths · Basic", cat.MOTION_PATHS_BASIC),
        ("Motion Paths · Lines & Curves", cat.MOTION_PATHS_LINES),
        ("Motion Paths · Special", cat.MOTION_PATHS_SPECIAL),
    ]:
        divider_slide(prs, "motion", grouplabel, items)
        nav.append({"index": len(prs.slides._sldIdLst), "kind": "nav", "type": "divider", "category": "motion"})
        for name, path in items:
            idx += 1
            slno = len(prs.slides._sldIdLst) + 1
            effect_slide(prs, idx, slno, name, "motion", None, path)
            rows.append({"index": slno, "effect_no": idx, "name": name,
                         "category": "motion", "preset": "0", "subtype": None,
                         "class": "path", "path": path})

    prs.save(OUT)
    manifest = {
        "source": "iSpring Suite animation effects support catalogue",
        "deck": str(OUT),
        "total": len(rows),
        "total_slides": len(prs.slides._sldIdLst),
        "by_category": {k: sum(1 for r in rows if r["category"] == k)
                        for k in ("entr", "emph", "exit", "motion")},
        "navigation": nav,
        "effects": rows,
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2))
    print(f"Wrote {OUT} ({len(rows)} effects, {len(prs.slides._sldIdLst)} slides)")
    print("by_category:", manifest["by_category"])


if __name__ == "__main__":
    build()
