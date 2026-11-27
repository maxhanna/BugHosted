"""Author the low-water layer of the painted Act III jungle map.

The painted Act III jungle (act3-jungle.png) draws its river into the same
wall-footprint mask as its trees and rock (act3-jungle-collision.png), so the
client cannot tell a low river from a stone wall and Leap stops at the water
exactly as it stops at a cliff.  Diablo II's water tiles are the only blocked
art whose green channel sits under its red channel - the jungle's foliage, grass
and stone are all green-dominant - so the river can be recovered from the
painting itself instead of being hand-traced polygon by polygon.

The exported mask marks the water plus the painted bank strip that follows it
(grown by WATER_BANK_RADIUS, then clipped to the wall footprint).  Both stop
walking; both are low enough for a leap to clear.

Usage:
    python tools/build_act3_water_mask.py
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MAP_ROOT = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "maps"
ART = MAP_ROOT / "act3-jungle.png"
WALLS = MAP_ROOT / "act3-jungle-collision.png"
OUTPUT = MAP_ROOT / "act3-jungle-water.png"

# Water art is dark and red-dominant; the jungle floor is green-dominant.  The
# red ceiling drops the black outside the map diamond, which is not water.
WATER_RED_MAX = 70
WATER_BLUE_SLACK = 8
# Open removes the dithered speckles the tree canopy throws in the water's key.
SPECKLE_RADIUS = 2
# How far the painted bank that follows the water counts as the same hazard.
WATER_BANK_RADIUS = 10


def main() -> None:
    art = np.array(Image.open(ART).convert("RGB")).astype(int)
    blocked = np.array(Image.open(WALLS).convert("L")) > 127
    red, green, blue = art[:, :, 0], art[:, :, 1], art[:, :, 2]

    water = ((blocked & (green < red) & (red < WATER_RED_MAX)
              & (blue <= red + WATER_BLUE_SLACK)) * 255).astype(np.uint8)
    water_image = Image.fromarray(water)
    span = 2 * SPECKLE_RADIUS + 1
    water_image = water_image.filter(ImageFilter.MinFilter(span)).filter(ImageFilter.MaxFilter(span))

    bank_span = 2 * WATER_BANK_RADIUS + 1
    grown = water_image.filter(ImageFilter.MaxFilter(bank_span))
    layer = (np.array(grown) > 127) & blocked

    Image.fromarray((layer * 255).astype(np.uint8)).save(OUTPUT, optimize=True)
    print(f"{OUTPUT.name}: {layer.sum()} of {blocked.sum()} wall pixels are low water")


if __name__ == "__main__":
    main()
