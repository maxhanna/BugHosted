"""Build the per-area floor atlases used by the D2 survivors campaign.

The campaign renders one 4x4 atlas of 160x80 isometric floor tiles per area
(640x320, the same shape as the hand-made act atlases). This script slices those
tiles out of the original Diablo II tile sheets extracted from the MPQs and
writes one atlas per area into assets/d2survivors/maps/tiles/.

Usage:
    python generate-d2-area-tiles.py --source "C:/path/to/d2/D2 Tiles Collection"

Only cells that look like walkable floor are used: magenta keyed backgrounds,
label cells, and dark/empty cells are skipped, then a deterministic hash picks a
varied spread of sixteen tiles so re-running always produces the same atlas.
"""

from __future__ import annotations

import argparse
import glob
import hashlib
import os
import sys

from PIL import Image

TILE_WIDTH = 160
TILE_HEIGHT = 80
ATLAS_COLUMNS = 4
ATLAS_ROWS = 4
TILES_PER_ATLAS = ATLAS_COLUMNS * ATLAS_ROWS

OUTPUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "src", "assets", "d2survivors", "maps", "tiles",
)

# area key -> (source sheet file name fragment, first row, last row)
# Row ranges keep each area's atlas visually distinct: different bands of the
# same act sheet are different terrain (dirt, grass, cobbles, stone, snow).
AREAS = [
    # Act I: Blood Moor reuses the existing hand-made atlas.
    ("a1-tamoe-highland", "Act 1 Tiles - Outdoor Floor", 8, 20),
    ("a1-catacombs", "Act 1 Tiles - Outdoor Floor", 30, 44),
    # Act II: Rocky Waste reuses the existing atlas.
    ("a2-sewers", "Act 1 Tiles - Outdoor Floor", 44, 56),
    ("a2-tal-rashas-tomb", "Act 2 Tiles - Outdoor Ground", 30, 44),
    # Act III: Spider Forest reuses the existing atlas.
    ("a3-flayer-jungle", "Act 3 Tiles - Jungle Ground", 10, 22),
    ("a3-durance-of-hate", "Act 1 Tiles - Outdoor Floor", 22, 32),
    # Act IV: Outer Steppes reuses the existing atlas.
    ("a4-city-of-the-damned", "Act 4 Tiles - Hell Floor", 0, 3),
    ("a4-chaos-sanctuary", "Act 4 Tiles - Hell Floor", 1, 3),
    # Act V floors are decoded from the D2R expansion DT1 sets by
    # tools/import_d2r_act5_tiles.py, so this older preview-sheet importer
    # must not overwrite them.
    # Pandemonium event areas.
    ("a6-forgotten-sands", "Act 2 Tiles - Outdoor Ground", 44, 57),
    ("a7-matrons-den", "Act 1 Tiles - Outdoor Floor", 2, 8),
    # Uber Tristram is rendered from tri_town4.ds1 and the Tristram DT1 set by
    # tools/render_d2r_tristram.py; this preview-sheet importer must not
    # overwrite that atlas.
]


def find_sheet(source_dir: str, fragment: str) -> str:
    matches = [p for p in glob.glob(os.path.join(source_dir, "*.png"))
               if fragment.lower() in os.path.basename(p).lower()]
    if not matches:
        raise SystemExit(f"No sheet matching {fragment!r} in {source_dir}")
    return sorted(matches)[0]


def is_label_cell(cell: Image.Image) -> bool:
    """D2 sheet previews stamp white captions (and swatches) onto some cells."""
    rgb = cell.convert("RGB")
    bright = 0
    for red, green, blue in rgb.getdata():
        if red > 235 and green > 235 and blue > 235:
            bright += 1
            if bright > 40:
                return True
    return False


def cell_score(cell: Image.Image) -> float:
    """Fraction of the cell covered by opaque, non-background pixels."""
    rgba = cell.convert("RGBA")
    opaque = 0
    total = rgba.width * rgba.height
    for red, green, blue, alpha in rgba.getdata():
        if alpha <= 8:
            continue
        # Magenta / cyan keys are the sheet matte, not floor.
        if red > 240 and green < 20 and blue > 240:
            continue
        if red < 20 and green > 240 and blue > 240:
            continue
        opaque += 1
    return opaque / total


def brightness(cell: Image.Image) -> float:
    rgb = cell.convert("RGB").resize((16, 8))
    values = [sum(pixel) / 3 for pixel in rgb.getdata()]
    return sum(values) / len(values)


def rank(seed: str, index: int) -> int:
    digest = hashlib.sha256(f"{seed}:{index}".encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "little")


def build_atlas(sheet_path: str, seed: str, first_row: int, last_row: int) -> Image.Image:
    sheet = Image.open(sheet_path).convert("RGBA")
    columns = sheet.width // TILE_WIDTH
    rows = sheet.height // TILE_HEIGHT
    first_row = max(0, min(first_row, rows - 1))
    last_row = max(first_row, min(last_row, rows - 1))

    candidates = []
    for row in range(first_row, last_row + 1):
        for column in range(columns):
            box = (column * TILE_WIDTH, row * TILE_HEIGHT,
                   column * TILE_WIDTH + TILE_WIDTH, row * TILE_HEIGHT + TILE_HEIGHT)
            cell = sheet.crop(box)
            if is_label_cell(cell):
                continue
            coverage = cell_score(cell)
            # A floor diamond covers roughly half of the 160x80 cell; anything
            # far outside that band is empty matte or a solid wall block.
            if coverage < 0.32 or coverage > 0.97:
                continue
            # Unlit sheet tiles are nearly black; the runtime brightens every
            # tile, so keep only cells that already read as lit ground.
            if brightness(cell) < 30:
                continue
            candidates.append(((row, column), cell))

    if not candidates:
        raise SystemExit(
            f"{os.path.basename(sheet_path)} rows {first_row}-{last_row} produced no "
            f"usable tiles for {seed}"
        )

    candidates.sort(key=lambda entry: rank(seed, entry[0][0] * 100 + entry[0][1]))
    # Small sheets (Act IV only has fifteen floor cells in total) are padded by
    # repeating their best tiles so every atlas is still a full 4x4 grid.
    chosen = [cell for _, cell in candidates[:TILES_PER_ATLAS]]
    while len(chosen) < TILES_PER_ATLAS:
        chosen.append(candidates[len(chosen) % len(candidates)][1])

    atlas = Image.new("RGBA", (TILE_WIDTH * ATLAS_COLUMNS, TILE_HEIGHT * ATLAS_ROWS), (0, 0, 0, 0))
    for index, cell in enumerate(chosen):
        left = (index % ATLAS_COLUMNS) * TILE_WIDTH
        top = (index // ATLAS_COLUMNS) * TILE_HEIGHT
        atlas.paste(cell, (left, top))
    return atlas


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        default=r"C:\Users\Saint\Desktop\d2\D2 Tiles Collection",
        help="Folder holding the extracted D2 tile sheets",
    )
    parser.add_argument("--only", default=None, help="Only rebuild this area key")
    args = parser.parse_args()

    if not os.path.isdir(args.source):
        raise SystemExit(f"Tile sheet folder not found: {args.source}")
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    for key, fragment, first_row, last_row in AREAS:
        if args.only and args.only != key:
            continue
        sheet = find_sheet(args.source, fragment)
        atlas = build_atlas(sheet, key, first_row, last_row)
        destination = os.path.join(OUTPUT_DIR, f"{key}-floor-tiles.png")
        atlas.save(destination)
        print(f"{key:26s} <- {os.path.basename(sheet)[:60]:60s} {atlas.size}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
