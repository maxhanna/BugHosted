"""Build Tal Rasha's Tomb's floor atlas from the original D2R tomb DT1 set.

The old tomb atlas was cut from a 160x80 preview sheet, so enlarging the tomb
floor would stretch preview-resolution art. D2R's own ``tomb.dt1`` contains the
original sandstone paving: orientation-0, twenty-five-block floors with large
flagstones, sand and rubble. This script decodes those floors with the Act II
palette and keeps the flat paving cells used by Tal Rasha's Tomb.

The atlas cells are doubled to 320x160 with nearest-neighbour sampling so the
2x tomb floor renders from native-resolution art instead of stretching a
160x80 cell. Cells 0-7 are the common ground, 8-11 the darker paving used on
the walked path, 12-13 the sand shoulders, and 14-15 sparse rubble accents.

Usage:
    python tools/import_d2r_tomb_tiles.py
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

from PIL import Image

import import_d2r_act5_tiles as act5

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DESTINATION = (
    PROJECT_ROOT / "src" / "assets" / "d2survivors" / "maps" / "tiles"
    / "a2-tal-rashas-tomb-floor-tiles-hd.png"
)
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"

TILE_WIDTH = 160
TILE_HEIGHT = 80
OUTPUT_WIDTH = 320
OUTPUT_HEIGHT = 160
ATLAS_COLUMNS = 4
ATLAS_CELLS = ATLAS_COLUMNS * ATLAS_COLUMNS

# SHA-256 of the 160x80 RGBA pixels for each chosen DT1 floor. Selection is by
# content so the tool keeps picking the same paving even if the DT1's record
# order changes.
GROUND = (
    "8bdbc4e0235d1a84d650a202d74920d6b10c058f074d4b66cfcbee078424471e",  # 47
    "d962b2d75dc9437873bf3c589de78f83d2adaa4f808a004371a689e48b873016",  # 48
    "193fbe68f04583133edd203ac4a512cf6be00e0bc47789744ec42562c03f468a",  # 42
    "44da6ec772e999fd3b814331ca2ff5c51e3b698e234962d94144e432bfcf9754",  # 43
    "3ce2e1f21e5f7c2963d4da3d8864a4a457eb7bf7d8cb456425cbb2127a495979",  # 44
    "c534a9fd215c6ecf6d250d5017a4e815e5a707f199d38eeb66688d696185cb3b",  # 45
    "a3a2368b7b6e1a52e550b41b16891d8b031e7309f12512d0f223df552d63baee",  # 46
    "03997b7fa6f546fd1f8f72cf76ef7018d172c86a713449a5c82a2b6dc8782ae0",  # 39
)
PATH = (
    "cf73cd255f27255e3d4c69fca5c64157e60d4407e98e6e56af84e3edc0864f67",  # 49
    "ba84f7d90f1bff2b22fba0df7ae27b0a8d0389da57fe02ab25206062eecc3c3e",  # 50
    "c4916abaeeea61b3ca04c8210d12989b189ba9052718b62dceb55e1fdbe9d611",  # 51
    "492e4b6a58c559204ed97911871da5b4c1b36dd22df63dc93cbfa4e3b1cce11e",  # 52
)
EDGE = (
    "8cfe68c365a59c170668ed68a70fc8372f08dea8b9f56caee20caba2ac187ef0",  # 23
    "deacbe25743bc647d0d89303f71ac2c0b37f2cb5c9250f07a9f75efea238debc",  # 24
)
ACCENTS = (
    "d2d929bdc5757c5d0d8c0bf47df7f67338a74ffb1be8bf92064de5a30ba50655",  # 40
    "0dbceefa789865a1f39fcbc0523126dc41dd834dbd9ef7e403965b4942e98b96",  # 41
)
TILE_ORDER = GROUND + PATH + EDGE + ACCENTS


def load_floors(source: Path, palette: list[tuple[int, int, int, int]]) -> dict[str, Image.Image]:
    """Return every distinct flat 160x80 tomb floor keyed by its pixel hash."""
    floors: dict[str, Image.Image] = {}
    for tile in act5.read_dt1(source / "global" / "tiles" / "act2" / "tomb" / "tomb.dt1"):
        if not act5.is_clean_floor(tile):
            continue
        image = act5.render_tile(tile, palette).crop((0, 0, TILE_WIDTH, TILE_HEIGHT))
        if image.getchannel("A").getbbox() is None:
            continue
        digest = hashlib.sha256(image.tobytes()).hexdigest()
        floors.setdefault(digest, image)
    return floors


def build_atlas(source: Path) -> Image.Image:
    palette = act5.load_palette(source / "global" / "palette" / "act2" / "pal.dat")
    floors = load_floors(source, palette)
    missing = [digest for digest in TILE_ORDER if digest not in floors]
    if missing:
        raise SystemExit(f"tomb.dt1 is missing {len(missing)} of the selected floor tiles")

    if len(set(TILE_ORDER)) != ATLAS_CELLS:
        raise SystemExit("the tomb atlas needs sixteen distinct floor tiles")

    atlas = Image.new(
        "RGBA", (OUTPUT_WIDTH * ATLAS_COLUMNS, OUTPUT_HEIGHT * ATLAS_COLUMNS), (0, 0, 0, 0)
    )
    for index, digest in enumerate(TILE_ORDER):
        tile = floors[digest].resize((OUTPUT_WIDTH, OUTPUT_HEIGHT), Image.NEAREST)
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
