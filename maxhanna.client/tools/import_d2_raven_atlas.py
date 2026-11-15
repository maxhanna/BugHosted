"""Build the druid Raven atlas from the extracted D2R ``druidhawk`` art.

The summon uses the monster token ``hk``.  Its walk and attack animations live
under ``global/monsters/hk`` as eight-direction DCCs:

* ``hktrlitwlhth.dcc`` - 12-frame walk
* ``hktrlita1hth.dcc`` - 23-frame attack

The runtime expects 12 columns and 8 direction rows.  Columns 0-7 hold walk
frames, while columns 8-11 hold four peak attack frames; the idle pose uses the
walk row.  Each cel is composited at its authored frame offset so the bird does
not jitter between frames.

Usage:
    python tools/import_d2_raven_atlas.py
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

import d2r_dcc as dcc

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUT_PATH = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "models" / "druid" / "animations" / "raven.png"
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"
WALK = Path("global/monsters/hk/tr/hktrlitwlhth.dcc")
ATTACK = Path("global/monsters/hk/tr/hktrlita1hth.dcc")
COLUMNS = 12
ATTACK_COLUMNS = (8, 10, 12, 14)


def direction_frames(animation: dict, palette: list[tuple[int, int, int]]) -> list[list[Image.Image]]:
    """Return one full direction canvas per frame, preserving frame offsets."""
    result: list[list[Image.Image]] = []
    for direction in animation["dirs"]:
        xmin, ymin, width, height = direction["box"]
        frames: list[Image.Image] = []
        for frame, bitmap in zip(direction["frames"], direction["bitmaps"]):
            canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
            cel = dcc.frame_image(bitmap, frame["width"], frame["height"], palette)
            canvas.alpha_composite(cel, (frame["xmin"] - xmin, frame["ymin"] - ymin))
            frames.append(canvas)
        result.append(frames)
    return result


def main() -> None:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    palette = [(red, green, blue) for blue, green, red in dcc.load_palette(
        source / "global" / "palette" / "units" / "pal.dat"
    )]
    walk = direction_frames(dcc.parse((source / WALK).read_bytes()), palette)
    attack = direction_frames(dcc.parse((source / ATTACK).read_bytes()), palette)
    if len(walk) != 8 or len(attack) != 8:
        raise RuntimeError(f"expected 8 directions, got walk={len(walk)} attack={len(attack)}")

    # The raw direction canvas includes the raven's whole flight envelope, which
    # leaves the bird as a tiny speck in a mostly empty cell.  The summon's
    # world position already moves it around the arena, so tighten every cel to
    # its own artwork and centre it in a common cell instead of preserving the
    # authored flight offset.
    rows: list[tuple[list[Image.Image], list[Image.Image]]] = []
    for direction in range(8):
        walk_cels = [cel.crop(cel.getbbox()) if cel.getbbox() else cel for cel in walk[direction][:8]]
        attack_cels = [
            cel.crop(cel.getbbox()) if cel.getbbox() else cel
            for cel in (attack[direction][frame] for frame in ATTACK_COLUMNS)
        ]
        rows.append((walk_cels, attack_cels))
    all_cels = [cel for walk_cels, attack_cels in rows for cel in walk_cels + attack_cels]
    cell_width = max(cel.width for cel in all_cels) + 4
    cell_height = max(cel.height for cel in all_cels) + 4
    sheet = Image.new("RGBA", (COLUMNS * cell_width, 8 * cell_height), (0, 0, 0, 0))

    for direction in range(8):
        walk_cels, attack_cels = rows[direction]
        for column, cel in enumerate(walk_cels):
            sheet.alpha_composite(
                cel,
                (column * cell_width + (cell_width - cel.width) // 2,
                 direction * cell_height + cell_height - cel.height - 2),
            )
        for column, cel in enumerate(attack_cels, start=8):
            sheet.alpha_composite(
                cel,
                (column * cell_width + (cell_width - cel.width) // 2,
                 direction * cell_height + cell_height - cel.height - 2),
            )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT_PATH)
    print(f"wrote {OUT_PATH} {sheet.width}x{sheet.height} ({cell_width}x{cell_height} cells)")


if __name__ == "__main__":
    main()
