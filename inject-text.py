#!/usr/bin/env python3
"""Embed searchable word positions into an SVG from PDF bounding boxes.

Injects a hidden <g> with a data-words JSON attribute containing word text
and bounding boxes in SVG coordinate space. The JS search reads this at runtime.

Usage: python3 inject-text.py <input.svg> <input.pdf> <output.svg>

Requires: pdftotext (from poppler-utils) on PATH.
"""

import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from html import escape as html_escape


def main():
    if len(sys.argv) != 4:
        print(f"Usage: {sys.argv[0]} <input.svg> <input.pdf> <output.svg>")
        sys.exit(1)

    svg_path, pdf_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]

    # --- Read SVG viewBox ---
    with open(svg_path, "r", encoding="utf-8") as f:
        svg = f.read()

    m = re.search(r'viewBox="([^"]+)"', svg)
    if not m:
        print("ERROR: No viewBox in SVG", file=sys.stderr)
        sys.exit(1)
    parts = m.group(1).split()
    svg_w, svg_h = float(parts[2]), float(parts[3])

    # --- Extract words with bounding boxes from PDF ---
    result = subprocess.run(
        ["pdftotext", "-bbox", pdf_path, "-"],
        capture_output=True, text=True, check=True,
    )
    xml_text = re.sub(r'\s+xmlns="[^"]*"', "", result.stdout, count=1)
    root = ET.fromstring(xml_text)
    page = root.find(".//page")
    if page is None:
        print("ERROR: No <page> in pdftotext output", file=sys.stderr)
        sys.exit(1)

    pdf_w = float(page.get("width"))
    pdf_h = float(page.get("height"))
    sx = svg_w / pdf_w
    sy = svg_h / pdf_h

    words = []
    for w in page.iter("word"):
        text = (w.text or "").strip()
        if not text:
            continue
        x_min = float(w.get("xMin")) * sx
        y_min = float(w.get("yMin")) * sy
        x_max = float(w.get("xMax")) * sx
        y_max = float(w.get("yMax")) * sy
        words.append({
            "t": text,
            "x": round(x_min, 1),
            "y": round(y_min, 1),
            "w": round(x_max - x_min, 1),
            "h": round(y_max - y_min, 1),
        })

    # --- Inject into SVG ---
    # Use a hidden group with data attributes; JS reads and removes it
    inject = (
        f'<g id="search-data" display="none" '
        f'data-words=\'{html_escape(json.dumps(words, separators=(",", ":")))}\'></g>'
    )
    svg = svg.replace("</svg>", f"{inject}\n</svg>")

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(svg)

    print(f"  {len(words)} words, scale {sx:.3f}x/{sy:.3f}x → {out_path}")


if __name__ == "__main__":
    main()
