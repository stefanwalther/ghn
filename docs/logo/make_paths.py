#!/usr/bin/env python3
"""Regenerate ghn wordmark SVG masters with vectorized Helvetica Bold letterforms.

Why paths, not <text>: SVG <text> renders in whatever font each viewer has
(GitHub, browsers, rsvg all differ). Paths look identical everywhere.
Run from docs/logo:  python3 make_paths.py
Requires: fontTools (pip install fonttools), macOS Helvetica.ttc
"""
from fontTools.ttLib import TTCollection
from fontTools.pens.svgPathPen import SVGPathPen

FONT_PATH = "/System/Library/Fonts/Helvetica.ttc"
FACE_INDEX = 1  # Helvetica Bold

TRACKING = 40  # font units shaved off each advance: tight, not touching

MASTERS = {
    # name: (px_size, baseline_y, dot_r, dot_overshoot, gap, dot_cx_extra)
    "wordmark": dict(size=52, baseline=57, dot_r=9, overshoot=1.0, gap=8),
    "tile": dict(size=24, baseline=42, dot_r=4.5, overshoot=0.5, gap=4),
    "menu": dict(size=28, baseline=29, dot_r=5, overshoot=0.6, gap=5),
}


def load_face():
    return TTCollection(FONT_PATH).fonts[FACE_INDEX]


def glyph_path_and_advance(font, char):
    cmap = font.getBestCmap()
    glyph_name = cmap[ord(char)]
    pen = SVGPathPen(font.getGlyphSet())
    font.getGlyphSet()[glyph_name].draw(pen)
    advance = font["hmtx"][glyph_name][0]
    return pen.getCommands(), advance


def word_paths(font, tracking):
    parts, x, advances = [], 0, []
    for ch in "ghn":
        d, adv = glyph_path_and_advance(font, ch)
        parts.append((d, x))
        advances.append(adv)
        x += adv - tracking
    total_advance = x + tracking  # undo last tracking shave
    return parts, total_advance


def themed(body_template, vb):
    # body uses class="ink"/class="dot" resolved by the embedded style
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">
  <style>
    .ink {{ fill: #1A2332; }}
    .dot {{ fill: #65A30D; }}
    .ring {{ fill: none; stroke: #65A30D; }}
    @media (prefers-color-scheme: dark) {{
      .ink {{ fill: #FFFFFF; }}
      .dot {{ fill: #C8F04B; }}
      .ring {{ stroke: #C8F04B; }}
    }}
  </style>
  {body_template}
</svg>
"""


def main():
    font = load_face()
    upm = font["head"].unitsPerEm

    # --- wordmark light/dark (fixed inks, dot color fixed per theme file) ---
    for theme, ink, dot in (("light", "#1A2332", "#65A30D"), ("dark", "#FFFFFF", "#C8F04B")):
        spec = MASTERS["wordmark"]
        s = spec["size"] / upm
        parts, total = word_paths(font, TRACKING)
        els = []
        for d, x in parts:
            els.append(
                f'<path d="{d}" transform="translate({6 + x * s:.2f},{spec["baseline"]}) scale({s:.4f},{-s:.4f})" fill="{ink}"/>'
            )
        dot_cx = 6 + total * s + spec["gap"] + spec["dot_r"]
        dot_cy = spec["baseline"] + spec["overshoot"] - spec["dot_r"]
        els.append(f'<circle cx="{dot_cx:.2f}" cy="{dot_cy:.2f}" r="{spec["dot_r"]}" fill="{dot}"/>')
        doc = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 132 80">\n  ' + "\n  ".join(els) + "\n</svg>\n"
        open(f"wordmark-{theme}.svg", "w").write(doc)
        print(f"wordmark-{theme}.svg  text-width={(total * s):.1f} dot-cx={dot_cx:.1f}")

    # --- tile-text (navy tile source for favicons) ---
    spec = MASTERS["tile"]
    s = spec["size"] / upm
    parts, total = word_paths(font, TRACKING)
    els = ['<rect width="64" height="64" rx="14" fill="#1A2332"/>']
    for d, x in parts:
        els.append(
            f'<path d="{d}" transform="translate({7 + x * s:.2f},{spec["baseline"]}) scale({s:.4f},{-s:.4f})" fill="#FFFFFF"/>'
        )
    dot_cx = 7 + total * s + spec["gap"] + spec["dot_r"]
    dot_cy = spec["baseline"] + spec["overshoot"] - spec["dot_r"]
    els.append(f'<circle cx="{dot_cx:.2f}" cy="{dot_cy:.2f}" r="{spec["dot_r"]}" fill="#C8F04B"/>')
    open("tile-text.svg", "w").write(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">\n  ' + "\n  ".join(els) + "\n</svg>\n"
    )
    print(f"tile-text.svg  text-width={(total * s):.1f} dot-cx={dot_cx:.1f} (must be < 59)")

    # --- menu letters (theme-adaptive) + indicators ---
    spec = MASTERS["menu"]
    s = spec["size"] / upm
    parts, total = word_paths(font, TRACKING)
    els = []
    for d, x in parts:
        els.append(
            f'<path d="{d}" transform="translate({4 + x * s:.2f},{spec["baseline"]}) scale({s:.4f},{-s:.4f})" class="ink"/>'
        )
    end = 4 + total * s
    open("brand-ghn.svg", "w").write(themed("\n  ".join(els), f"0 0 {end + 1:.0f} 40"))
    end = 4 + total * s
    dot_cx = end + spec["gap"] + spec["dot_r"]
    dot_cy = spec["baseline"] + spec["overshoot"] - spec["dot_r"]
    open("i-dot.svg", "w").write(
        themed(f'<circle cx="{dot_cx - end:.2f}" cy="{dot_cy:.2f}" r="{spec["dot_r"]}" class="dot"/>', f"0 0 {dot_cx - end + spec['dot_r'] + 1:.0f} 40")
    )
    open("i-ring.svg", "w").write(
        themed(f'<circle cx="{dot_cx - end:.2f}" cy="{dot_cy:.2f}" r="{spec["dot_r"] + 0.5}" stroke-width="2.5" class="ring"/>', f"0 0 {dot_cx - end + spec['dot_r'] + 2:.0f} 40")
    )
    bw = spec["dot_r"] * 1.4
    open("i-bar.svg", "w").write(
        themed(f'<rect x="{spec["gap"]:.2f}" y="{spec["baseline"] - spec["size"] * 0.78:.2f}" width="{bw:.2f}" height="{spec["size"] * 0.86:.2f}" rx="1.5" class="dot"/>', f"0 0 {spec['gap'] + bw + 1:.0f} 40")
    )
    print(f"menu letters end={end:.1f} indicator viewBoxes sized to content")


if __name__ == "__main__":
    main()
