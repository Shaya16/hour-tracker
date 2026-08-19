"""
Subsets InterVariable to the glyphs this app can actually display.

The upstream file is ~344 KB because it carries Greek, Cyrillic and a large symbol set.
This app renders Latin text, digits, currency symbols and a handful of punctuation, so
the rest is dead weight on a phone connection — and the font sits on the critical path
for first paint.

The weight axis is preserved (Inter is variable, and the UI uses 400 through 800).

Run: python scripts/subset-font.py
"""

import os
from fontTools import subset

SRC = "public/InterVariable-full.woff2"
DST = "public/inter.woff2"

# Basic Latin + Latin-1 letters, plus everything the UI actually emits.
unicodes = set()
unicodes |= set(range(0x0020, 0x007F))  # printable ASCII
unicodes |= set(range(0x00A0, 0x0100))  # Latin-1 supplement (accented names)
unicodes |= {
    0x2010, 0x2011, 0x2012, 0x2013, 0x2014,  # hyphens and dashes
    0x2018, 0x2019, 0x201C, 0x201D,          # curly quotes (used in copy)
    0x2022,                                   # bullet
    0x2026,                                   # ellipsis
    0x00B7, 0x2027,                           # middot separators used across the UI
    0x20AA,                                   # shekel sign
    0x20AC,                                   # euro
    0x00A3, 0x00A5, 0x00A2,                   # pound, yen, cent
    0x2192, 0x2190,                           # arrows
    0x00D7,                                   # multiplication sign
    0x2264, 0x2265,                           # <=, >=
    0x25CF,                                   # filled circle (running indicator)
    0x2713, 0x2714,                           # check marks
}

options = subset.Options()
options.flavor = "woff2"
options.with_zopfli = False
options.desubroutinize = False
options.layout_features = ["*"]          # keep kerning and tnum
options.name_IDs = ["*"]
options.notdef_outline = True
options.recalc_bounds = True
# Keep the variable weight axis; drop optical sizing, which the UI does not drive.
options.retain_gids = False

font = subset.load_font(SRC, options)
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=unicodes)
subsetter.subset(font)
subset.save_font(font, DST, options)
font.close()

src_kb = os.path.getsize(SRC) / 1024
dst_kb = os.path.getsize(DST) / 1024
print(f"  source : {src_kb:7.1f} KB  {SRC}")
print(f"  subset : {dst_kb:7.1f} KB  {DST}")
print(f"  saved  : {src_kb - dst_kb:7.1f} KB  ({100 * (1 - dst_kb / src_kb):.0f}% smaller)")
