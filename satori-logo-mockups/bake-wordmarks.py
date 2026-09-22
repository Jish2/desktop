#!/usr/bin/env /tmp/ftenv/bin/python
"""Bake 'satori' wordmarks to SVG path files replacing Zen's baked wordmarks.

Uses SF Pro Rounded, text-as-paths (like Zen's originals — no font dependency).
Usage: /tmp/ftenv/bin/python bake-wordmarks.py <release-branding-dir>
"""
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform

FONT = "/System/Library/Fonts/SFNSRounded.ttf"
TRACKING = 0.015  # em of extra letterspacing

font = TTFont(FONT)
instantiateVariableFont(font, {"wght": 660}, inplace=True)  # semibold, close to Zen's chunky mark
upm = font["head"].unitsPerEm
glyphset = font.getGlyphSet()
cmap = font.getBestCmap()
xheight_units = font["OS/2"].sxHeight


def bake(text, fontsize, tracking=TRACKING):
    """Return (path_d, width) for text at given em size, baseline at y=0."""
    scale = fontsize / upm
    out, x = [], 0.0
    for ch in text:
        if ch == " ":
            x += fontsize * 0.24
            continue
        gname = cmap[ord(ch)]
        pen = SVGPathPen(glyphset)
        tp = TransformPen(pen, Transform(scale, 0, 0, -scale, x, 0))
        glyphset[gname].draw(tp)
        out.append(pen.getCommands())
        x += glyphset[gname].width * scale + fontsize * tracking
    return " ".join(out), x - fontsize * tracking


def wordmark_svg(text, view_w, view_h, fill_css, target_frac=0.95, stroke=""):
    # size the text to fill target_frac of the view width
    _, w100 = bake(text, 100)
    fontsize = (view_w * target_frac) / w100 * 100
    d, w = bake(text, fontsize)
    xh = xheight_units * fontsize / upm
    baseline = (view_h + xh) / 2
    margin = (view_w - w) / 2
    return (
        f'<?xml version="1.0" encoding="UTF-8"?>'
        f'<svg id="a" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {view_w} {view_h}">'
        f"<defs><style>.b{{fill:{fill_css};{stroke}}}</style></defs>"
        f'<g transform="translate({margin:.2f},0)"><path class="b" d="{d}" transform="translate(0,{baseline:.2f})"/></g>'
        f"</svg>",
        fontsize,
    )


outdir = sys.argv[1]

about, fsA = wordmark_svg("satori browser", 260, 56, "#fff", stroke="stroke-width:0px;")
firefox, fsF = wordmark_svg("satori", 80, 56, "context-fill #20123a", 0.92)

with open(f"{outdir}/content/about-wordmark.svg", "w") as f:
    f.write(about)
with open(f"{outdir}/content/firefox-wordmark.svg", "w") as f:
    f.write(firefox)
print(f"wrote wordmarks (about fontsize {fsA:.1f}, firefox fontsize {fsF:.1f})")
