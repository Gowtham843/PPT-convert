#!/usr/bin/env python3
"""Extract real PowerPoint-authored <p:timing> OOXML from a recorded deck.

The companion record_exotic_animations.bas macro creates one slide per
animation preset using PowerPoint's native AddEffect/preset engine, so each
slide's <p:timing> is canonical. This helper unzips the saved deck, reads the
<p:timing> subtree of every slide, and writes:

  <out>/<label>.xml        raw <p:timing> subtree (pretty printed)
  <out>/<label>.json       parsed { presets[], behaviors[], ooxml }

and a combined <out>/_recorded_manifest.json listing them. Use the XML to fold
exact PowerPoint-authored trees back into effect_catalog.py recipes.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path

from lxml import etree

P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"


def qn(tag):
    if tag.startswith("{") or tag.startswith("http"):
        return tag
    return f"{{{P_NS}}}{tag}"


def extract_timing(xml_bytes):
    root = etree.fromstring(xml_bytes)
    tm = root.find(qn("timing"))
    return tm


def slide_title_from_xml(xml_bytes):
    root = etree.fromstring(xml_bytes)
    ns = {"a": A_NS, "p": P_NS}
    shapes = root.findall(".//p:sp", ns)
    for sp in shapes:
        for t in sp.findall(".//a:t", ns):
            txt = (t.text or "").strip()
            if txt:
                return txt
    return None


def summarize_timing(tm):
    """Best-effort inventory of behaviors + presets in a timing tree."""
    if tm is None:
        return None
    presets = []
    behaviors = []
    for el in tm.iter():
        local = etree.QName(el).localname
        if local == "cTn":
            pid = el.get("presetID")
            pclass = el.get("presetClass")
            if pid is not None or pclass:
                presets.append({"presetID": pid, "presetClass": pclass,
                                "presetSubtype": el.get("presetSubtype"),
                                "nodeType": el.get("nodeType")})
        elif local in ("animEffect", "anim", "animMotion", "animRot",
                       "animScale", "animClr", "set"):
            row = {"np": local}
            if el.get("presetID") is not None or el.get("presetClass"):
                row["presetID"] = el.get("presetID")
                row["presetClass"] = el.get("presetClass")
            if el.get("filter"):
                row["filter"] = el.get("filter")
            if el.get("transition"):
                row["transition"] = el.get("transition")
            if local == "animMotion":
                row["path"] = (el.get("path") or "")[:200]
            if local == "animRot":
                row["by"] = el.get("by")
            behaviors.append(row)
    return {"presets": presets, "behaviors": behaviors}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("deck", help="path to recorded .pptx")
    ap.add_argument("--out", default="test-files/recorded",
                    help="output directory (default test-files/recorded)")
    args = ap.parse_args()

    deck = Path(args.deck)
    if not deck.exists():
        sys.exit(f"deck not found: {deck}")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    recorded = []
    with zipfile.ZipFile(deck) as z:
        names = sorted((n for n in z.namelist()
                        if n.startswith("ppt/slides/slide") and n.endswith(".xml")),
                       key=lambda n: int(re.search(r"slide(\d+)\.xml$", n).group(1)))
        for n in names:
            raw = z.read(n)
            label = slide_title_from_xml(raw)
            tm = extract_timing(raw)
            if tm is None:
                continue
            pretty = etree.tostring(tm, pretty_print=True, xml_declaration=True,
                                    encoding="UTF-8")
            slug = (label or n.split("/")[-1].replace(".xml", "")) \
                .replace(" ", "_").replace("&", "")
            xml_path = out / f"{slug}.xml"
            xml_path.write_bytes(pretty)
            summary = summarize_timing(tm)
            json_path = out / f"{slug}.json"
            json_path.write_text(json.dumps({
                "source_slide": n, "label": label,
                "timing_xml_file": xml_path.name,
                "summary": summary,
            }, indent=2))
            recorded.append({"label": label, "slide": n,
                             "xml": xml_path.name, "json": json_path.name,
                             "presets": summary["presets"],
                             "behavior_count": len(summary["behaviors"])})

    manifest = {"deck": str(deck), "count": len(recorded), "slides": recorded}
    (out / "_recorded_manifest.json").write_text(
        json.dumps(manifest, indent=2))
    print(f"Extracted {len(recorded)} timing trees -> {out}")
    for r in recorded:
        print(f"  {r['label']:24s} {r['xml']}")


if __name__ == "__main__":
    main()
