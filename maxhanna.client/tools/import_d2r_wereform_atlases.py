"""Build the Druid wereform atlases from the D2R extraction.

The player forms are the bipedal D2 Wolf and Bear units, not the Fenris and
Grizzly summon art that previously occupied `werewolf.png` and `werebear.png`.
Each output has eight walk directions followed by eight matching attack
directions, which is the 16-row layout the game loads for a transformed Druid.

Usage:
    python tools/import_d2r_wereform_atlases.py
    python tools/import_d2r_wereform_atlases.py --only werewolf
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

import d2r_dcc as dcc
import import_d2r_summon_atlases as atlas

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "models" / "druid" / "animations"
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"

# form -> (monster token, output file)
WEREFORMS: dict[str, tuple[str, str]] = {
    "werewolf": ("40", "werewolf.png"),
    "werebear": ("tg", "werebear.png"),
}

COLUMNS = 13


def build(source: Path, form: str) -> str:
    code, out_name = WEREFORMS[form]
    monster_dir = source / "global" / "monsters" / code
    walk_path = atlas.find_animation(monster_dir, "wl")
    attack_path = atlas.find_animation(monster_dir, "a1")
    if walk_path is None or attack_path is None:
        return f"skip {form}: {code} is missing walk or attack animation"

    walk = dcc.parse(walk_path.read_bytes())
    attack = dcc.parse(attack_path.read_bytes())
    directions = min(8, walk["directions"], attack["directions"])
    walk_frames = min(walk["frames_per_dir"], COLUMNS)
    attack_frames = min(attack["frames_per_dir"], COLUMNS)
    if not directions or not walk_frames or not attack_frames:
        return f"skip {form}: {code} has an empty animation"

    cell_width, cell_height = 128, 112
    sheet = Image.new("RGBA", (COLUMNS * cell_width, 16 * cell_height), (0, 0, 0, 0))

    def paste(image: Image.Image, column: int, row: int) -> None:
        scaled = atlas.fit_into(image, cell_width, cell_height)
        sheet.alpha_composite(
            scaled,
            (
                column * cell_width + (cell_width - scaled.width) // 2,
                row * cell_height + (cell_height - scaled.height) // 2,
            ),
        )

    for direction in range(directions):
        # Walk. These cels have a dark torso over true transparency, so do not
        # run the summon atlas's black-matte flood fill or it eats the body.
        # Repeat the short walk loop to fill the 13-column row so the existing
        # movement selector never lands on an empty cel.
        for column in range(COLUMNS):
            paste(atlas.frame_crop(walk, direction, column % walk_frames, clear_matte=False), column, direction)

        # Attack. Hold the final cel when the source is shorter than the row.
        for column in range(COLUMNS):
            paste(atlas.frame_crop(attack, direction, min(column, attack_frames - 1), clear_matte=False), column, 8 + direction)

    destination = ASSET_ROOT / out_name
    sheet.save(destination)
    return (
        f"{form:9s} {code:3s} {out_name:13s} {sheet.width}x{sheet.height} "
        f"cell {cell_width}x{cell_height} walk {walk_frames}f attack {attack_frames}f"
    )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--only", nargs="*", default=None)
    args = parser.parse_args(argv)

    atlas.PALETTE = dcc.load_palette(args.source / "global" / "palette" / "units" / "pal.dat")
    wanted = sorted(WEREFORMS) if not args.only else [name for name in args.only if name in WEREFORMS]
    failures = 0
    for form in wanted:
        message = build(args.source, form)
        print(message)
        if message.startswith("skip"):
            failures += 1
    print(f"built {len(wanted) - failures}/{len(wanted)} wereform atlases")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
