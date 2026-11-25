"""Rebuild Matron's Den's floor atlas out of the Catacombs' own flagstones.

Matron's Den is a painted-tile zone: it has no exported DS1 world of its own, so
its ground comes from a 4x4 atlas of 160x80 isometric tiles.  That atlas used to
be cut from the Act I *outdoor* preview sheet, which left the arena floored with
dirt and grass while the Catacombs next door stand on cold stone.

tools/build_d2_worlds.py already exports the Catacombs ground as one seamless
sheet of the real D2R catacomb floor tiles.  This tool cuts floor diamonds out of
that sheet and writes the Matron's Den atlas, so the Pandemonium arena is paved
with the same flagstone the Catacombs are.

The sheet draws its diamonds on an isometric lattice over a flat matte, so a
naive 160x80 crop catches the quarters of four neighbouring diamonds.  The first
floor pixel is a diamond's top vertex; from there every lattice diamond is a
160x80 box stepped by half a tile, and the flagstone is copied through a diamond
mask.  Identical diamonds are collapsed, so the atlas holds only the variants the
Catacombs actually use.

Usage:
    python tools/build_matrons_den_tiles.py
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
GROUND = (PROJECT_ROOT / "src" / "assets" / "d2survivors" / "maps" / "worlds"
          / "a1-catacombs-ground.png")
OUTPUT = (PROJECT_ROOT / "src" / "assets" / "d2survivors" / "maps" / "tiles"
          / "a7-matrons-den-floor-tiles.png")

TILE_WIDTH = 160
TILE_HEIGHT = 80
ATLAS_COLUMNS = 4
ATLAS_ROWS = 4
TILES_PER_ATLAS = ATLAS_COLUMNS * ATLAS_ROWS

# The exported ground sits on a flat matte; the flagstone itself is dark grey, so
# the key stays tight and only the exact background colour is treated as empty.
MATTE_TOLERANCE = 8


def is_matte(pixel: tuple[int, int, int], matte: tuple[int, int, int]) -> bool:
    return all(abs(pixel[channel] - matte[channel]) <= MATTE_TOLERANCE for channel in range(3))


def find_first_floor_pixel(image: Image.Image, matte: tuple[int, int, int]) -> tuple[int, int]:
    """The topmost floor pixel of the exported map is a tile's top vertex."""
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            if not is_matte(pixels[x, y], matte):
                return x, y
    raise SystemExit("The Catacombs ground sheet is empty")


def diamond_mask() -> Image.Image:
    """A 160x80 diamond, one pixel inside the cell edge to drop the matte rim."""
    mask = Image.new("L", (TILE_WIDTH, TILE_HEIGHT), 0)
    for y in range(TILE_HEIGHT):
        dy = abs(y - (TILE_HEIGHT - 1) / 2) / ((TILE_HEIGHT - 2) / 2)
        half = int((TILE_WIDTH - 2) / 2 * (1 - dy))
        if half <= 0:
            continue
        left = TILE_WIDTH // 2 - half
        for x in range(left, left + half * 2):
            mask.putpixel((x, y), 255)
    return mask


def cut_tile(image: Image.Image, left: int, top: int, mask: Image.Image,
             matte: tuple[int, int, int]) -> Image.Image | None:
    """One flagstone, or None when the box is off the map or lands on its rock."""
    if left < 0 or top < 0 or left + TILE_WIDTH > image.width or top + TILE_HEIGHT > image.height:
        return None
    tile = image.crop((left, top, left + TILE_WIDTH, top + TILE_HEIGHT)).convert("RGBA")
    # The exported map keeps its unpainted rock in the same matte as the sheet
    # around it, so a diamond that is mostly background is void, not floor.
    empty = 0
    filled = 0
    for (red, green, blue, _), alpha in zip(tile.getdata(), mask.getdata()):
        if not alpha:
            continue
        filled += 1
        if is_matte((red, green, blue), matte):
            empty += 1
    # The art diamond sits a couple of pixels inside the geometric one, so a
    # clean floor tile still shows a thin matte rim.  That rim is left opaque:
    # keying it out left hairline gaps between the flagstones once the tiles were
    # butted together, and the near-black edge reads as mortar instead.
    if not filled or empty / filled > 0.06:
        return None
    tile.putalpha(mask)
    return tile


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ground", default=str(GROUND), help="Exported Catacombs ground sheet")
    parser.add_argument("--output", default=str(OUTPUT), help="Atlas to write")
    args = parser.parse_args()

    ground_path = Path(args.ground)
    if not ground_path.is_file():
        raise SystemExit(
            f"Catacombs ground not found: {ground_path}\n"
            "Run `python tools/build_d2_worlds.py --act 1` first."
        )

    ground = Image.open(ground_path).convert("RGB")
    matte = ground.getpixel((0, 0))
    vertex_x, vertex_y = find_first_floor_pixel(ground, matte)
    mask = diamond_mask()

    # The vertex is the middle of a diamond's top edge; its box starts half a tile
    # to the left and steps by half a tile across and a quarter tile down, so only
    # sites with matching parity land on a whole diamond.
    origin_x = vertex_x - TILE_WIDTH // 2
    origin_y = vertex_y

    variants: dict[str, Image.Image] = {}
    for step_x in range(0, 24):
        for step_y in range(0, 12):
            if (step_x + step_y) % 2:
                continue
            tile = cut_tile(ground, origin_x + step_x * TILE_WIDTH // 2,
                            origin_y + step_y * TILE_HEIGHT // 2, mask, matte)
            if tile is None:
                continue
            key = hashlib.sha1(tile.tobytes()).hexdigest()
            variants.setdefault(key, tile)
            if len(variants) >= TILES_PER_ATLAS:
                break
        if len(variants) >= TILES_PER_ATLAS:
            break

    if not variants:
        raise SystemExit(f"{ground_path.name} produced no floor tiles")

    chosen = list(variants.values())
    # The catacomb floor is one flagstone repeated; fill the grid with it rather
    # than inventing tiles the Catacombs never use.
    while len(chosen) < TILES_PER_ATLAS:
        chosen.append(chosen[len(chosen) % len(variants)])

    atlas = Image.new("RGBA", (TILE_WIDTH * ATLAS_COLUMNS, TILE_HEIGHT * ATLAS_ROWS),
                      (0, 0, 0, 0))
    for index, tile in enumerate(chosen):
        left = (index % ATLAS_COLUMNS) * TILE_WIDTH
        top = (index // ATLAS_COLUMNS) * TILE_HEIGHT
        atlas.paste(tile, (left, top))

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(output_path)
    print(f"{output_path.name} <- {ground_path.name} "
          f"({len(variants)} distinct tiles) {atlas.size}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
