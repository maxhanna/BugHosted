"""Build Spider Forest's floor atlas from the original Act III D2R DT1 sets.

The old Act III atlas was a 160x80 preview sheet, so enlarging Spider Forest's
floor would stretch preview-resolution art. The original D2R extraction stores
the jungle's flat ground under ``data/global/tiles/act3``. This script decodes
those orientation-0, twenty-five-block floors with the Act III palette and
composes a 320x160-cell atlas:

* cells 0-3: dark earth from the jungle dungeon floor,
* cells 4-7: mossy dark-grass ground,
* cells 8-11: dry-mud trail cells,
* cells 12-13: ruin-stone shoulders,
* cells 14-15: a vine/root and a ruin accent.

The cells are doubled with nearest-neighbour sampling, so the 2x Spider Forest
floor renders from the original pixels instead of scaling the old preview art.

Usage:
    python tools/import_d2r_spider_forest_tiles.py
"""

from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DESTINATION = (
    PROJECT_ROOT / "src" / "assets" / "d2survivors" / "maps" / "tiles"
    / "a3-spider-forest-floor-tiles-hd.png"
)
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"

TILE_WIDTH = 160
TILE_HEIGHT = 80
OUTPUT_WIDTH = 320
OUTPUT_HEIGHT = 160
ATLAS_COLUMNS = 4
ATLAS_CELLS = ATLAS_COLUMNS * ATLAS_COLUMNS

# The DT1 record order is stable. Each entry contributes its floors in this
# order: dungeon earth, moss ground, path, shoulders, then sparse accents.
TILE_SELECTION = (
    ("jungle/dungeon.dt1", (42, 43, 44, 45)),
    ("ground/darkgrass.dt1", (28, 30, 32, 34)),
    ("ground/drymud.dt1", (0, 5, 10, 15)),
    ("jungle/ruin.dt1", (0, 7)),
    ("jungle/dungeon.dt1", (80,)),
    ("jungle/ruin.dt1", (16,)),
)


def load_act5_module():
    """Reuse the existing DT1 reader and renderer from the Act V importer."""
    path = Path(__file__).with_name("import_d2r_act5_tiles.py")
    spec = importlib.util.spec_from_file_location("d2r_act5_tiles", path)
    if spec is None or spec.loader is None:
        raise SystemExit(f"Could not load the DT1 helper: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_floors(path: Path, palette: list[tuple[int, int, int, int]], dt1) -> list[Image.Image]:
    """Return complete 160x80 floor diamonds from one DT1 file."""
    floors: list[Image.Image] = []
    for tile in dt1.read_dt1(path):
        if not dt1.is_clean_floor(tile):
            continue
        image = dt1.render_tile(tile, palette).crop((0, 0, TILE_WIDTH, TILE_HEIGHT))
        if image.getchannel("A").getbbox() is not None:
            floors.append(image)
    return floors


def build_atlas(source: Path) -> Image.Image:
    dt1 = load_act5_module()
    palette = dt1.load_palette(source / "global" / "palette" / "act3" / "pal.dat")
    cache: dict[str, list[Image.Image]] = {}
    cells: list[Image.Image] = []
    for relative, indices in TILE_SELECTION:
        floors = cache.get(relative)
        if floors is None:
            floors = read_floors(
                source / "global" / "tiles" / "act3" / relative, palette, dt1,
            )
            cache[relative] = floors
        for index in indices:
            if index >= len(floors):
                raise SystemExit(f"{relative} has no floor {index} (found {len(floors)})")
            cells.append(floors[index])

    if len(cells) != ATLAS_CELLS:
        raise SystemExit(f"the Spider Forest atlas needs {ATLAS_CELLS} cells, got {len(cells)}")

    atlas = Image.new(
        "RGBA", (OUTPUT_WIDTH * ATLAS_COLUMNS, OUTPUT_HEIGHT * ATLAS_COLUMNS), (0, 0, 0, 0)
    )
    for index, image in enumerate(cells):
        tile = image.resize((OUTPUT_WIDTH, OUTPUT_HEIGHT), Image.NEAREST)
        atlas.alpha_composite(
            tile,
            ((index % ATLAS_COLUMNS) * OUTPUT_WIDTH, (index // ATLAS_COLUMNS) * OUTPUT_HEIGHT),
        )
    return atlas


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DESTINATION)
    args = parser.parse_args(argv)

    if not args.source.is_dir():
        raise SystemExit(f"D2R extraction not found: {args.source}")

    atlas = build_atlas(args.source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(args.output, optimize=True)
    print(
        f"{args.output.relative_to(PROJECT_ROOT)}: {atlas.width}x{atlas.height} "
        f"({ATLAS_CELLS} cells of {OUTPUT_WIDTH}x{OUTPUT_HEIGHT})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
