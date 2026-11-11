"""Build the Diablo II summon and pet atlases from the D2R extraction.

The necromancer golems, the druid's wolf, bear and spirits and their D2
animation names live in `Desktop/d2/d2r extract/data/global/monsters`, so each
summon can stop borrowing an unrelated monster sheet:

    G1 clay golem (already on `golem.png`), G2 blood, G3 fire, G4 iron
    WF fenris (Spirit Wolf, Dire Wolf), B7 druid bear (Grizzly)
    XW Oak Sage, X3 Heart of Wolverine, X4 Spirit of Barbs

Two layouts are produced, matching `enemySpriteDirectionRow`:

* `walk_attack` - sixteen rows: eight walk directions above eight attack rows,
* `walk_only`   - four rows, one per direction, for the stationary spirits.

Usage:
    python tools/import_d2r_summon_atlases.py
    python tools/import_d2r_summon_atlases.py --only wolf grizzly
    python tools/import_d2r_summon_atlases.py --list
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

import d2r_dcc as dcc

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "enemies" / "animated"
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"

# species -> (monster code, output file, columns, cell width, cell height, mode)
SPECIES: dict[str, tuple[str, str, int, int, int, str]] = {
    "wolf": ("WF", "wolf.png", 13, 96, 80, "walk_attack"),
    "grizzly": ("B7", "grizzly.png", 13, 128, 104, "walk_attack"),
    "bloodGolem": ("G2", "blood-golem.png", 16, 112, 88, "walk_attack"),
    "fireGolem": ("G3", "fire-golem.png", 17, 96, 104, "walk_attack"),
    "ironGolem": ("G4", "iron-golem.png", 16, 96, 112, "walk_attack"),
    "oakSage": ("XW", "oak-sage.png", 7, 120, 120, "walk_only"),
    "heartOfWolverine": ("X3", "heart-of-wolverine.png", 7, 120, 120, "walk_only"),
    "spiritOfBarbs": ("X4", "spirit-of-barbs.png", 7, 120, 120, "walk_only"),
}

# The Assassin sentry turret: one row of idle (`nu`) cels above one row of the
# firing (`s1`) loop, both single-direction like the other trap art.
SENTRY = ("lg", "sentry.png", 15, 64, 64)

PALETTE: list[tuple[int, int, int]] = []


def find_animation(monster_dir: Path, sequence: str) -> Path | None:
    """Prefer the neutral `tr` variant, then any other folder holding the sequence."""
    candidates: list[tuple[int, str, Path]] = []
    for variant in sorted((p for p in monster_dir.iterdir() if p.is_dir()), key=lambda p: p.name):
        rank = 0 if variant.name == "tr" else 1
        for path in sorted(variant.glob("*.dcc")):
            if sequence in path.name.lower():
                candidates.append((rank, path.name, path))
    return sorted(candidates)[0][2] if candidates else None


def key_matte(image: Image.Image) -> Image.Image:
    """Clear the near-black backdrop some cels carry, keeping the glow inside it.

    The druid spirit DCCs paint a dark disk behind the orb. The palette maps it to
    opaque black, so a flood fill from the cel border turns it transparent without
    touching the blue spirit art.
    """
    pixels = image.load()
    width, height = image.size
    stack: list[tuple[int, int]] = []
    for x in range(width):
        stack.append((x, 0))
        stack.append((x, height - 1))
    for y in range(height):
        stack.append((0, y))
        stack.append((width - 1, y))
    seen = bytearray(width * height)
    while stack:
        x, y = stack.pop()
        if seen[y * width + x]:
            continue
        seen[y * width + x] = 1
        red, green, blue, alpha = pixels[x, y]
        if alpha == 0 or max(red, green, blue) <= 40:
            if alpha:
                pixels[x, y] = (red, green, blue, 0)
            if x > 0:
                stack.append((x - 1, y))
            if x + 1 < width:
                stack.append((x + 1, y))
            if y > 0:
                stack.append((x, y - 1))
            if y + 1 < height:
                stack.append((x, y + 1))
    return image


def frame_crop(animation: dict, direction_index: int, frame_index: int,
               *, clear_matte: bool = True) -> Image.Image:
    direction = animation["dirs"][direction_index]
    xmin, ymin, _, _ = direction["box"]
    frame = direction["frames"][frame_index]
    canvas = Image.new("RGBA", (direction["box"][2], direction["box"][3]), (0, 0, 0, 0))
    canvas.alpha_composite(
        dcc.frame_image(direction["bitmaps"][frame_index], frame["width"], frame["height"], PALETTE),
        (frame["xmin"] - xmin, frame["ymin"] - ymin),
    )
    mask = Image.new("L", canvas.size, 0)
    mask.paste(255, (frame["xmin"] - xmin, frame["ymin"] - ymin,
                     frame["xmin"] - xmin + frame["width"], frame["ymin"] - ymin + frame["height"]))
    canvas.putalpha(Image.composite(canvas.getchannel("A"), Image.new("L", canvas.size, 0), mask))
    return key_matte(canvas) if clear_matte else canvas


def fit_into(canvas: Image.Image, width: int, height: int) -> Image.Image:
    scale = min(width / canvas.width, height / canvas.height)
    target = (max(1, round(canvas.width * scale)), max(1, round(canvas.height * scale)))
    return canvas.resize(target, Image.LANCZOS if scale < 1 else Image.NEAREST)


def build(source: Path, species: str) -> str:
    code, out_name, columns, cell_width, cell_height, mode = SPECIES[species]
    monster_dir = source / "global" / "monsters" / code
    walk_path = find_animation(monster_dir, "wl") if monster_dir.is_dir() else None
    if walk_path is None:
        return f"skip {species}: {code} has no walk animation"
    walk = dcc.parse(walk_path.read_bytes())
    attack_path = find_animation(monster_dir, "a1")
    attack = dcc.parse(attack_path.read_bytes()) if attack_path else None

    directions = min(8, walk["directions"])
    rows = 16 if mode == "walk_attack" else min(4, directions)
    sheet = Image.new("RGBA", (columns * cell_width, rows * cell_height), (0, 0, 0, 0))

    def paste(image: Image.Image, column: int, row: int) -> None:
        scaled = fit_into(image, cell_width, cell_height)
        sheet.alpha_composite(scaled, (column * cell_width + (cell_width - scaled.width) // 2,
                                       row * cell_height + (cell_height - scaled.height) // 2))

    walk_frames = min(walk["frames_per_dir"], columns)
    for direction in range(directions if rows == 16 else rows):
        for frame in range(walk_frames):
            paste(frame_crop(walk, direction, frame), frame, direction)

    attack_frames = 0
    if mode == "walk_attack" and attack is not None:
        attack_frames = min(attack["frames_per_dir"], columns)
        for direction in range(min(directions, attack["directions"])):
            for frame in range(attack_frames):
                paste(frame_crop(attack, direction, frame), frame, 8 + direction)

    destination = ASSET_ROOT / out_name
    sheet.save(destination)
    return (f"{species:16s} {code:3s} {out_name:24s} {sheet.width}x{sheet.height} "
            f"cell {cell_width}x{cell_height} rows {rows} walk {walk_frames}f attack {attack_frames}f")


def build_sentry(source: Path) -> str:
    """Two rows of turret cels: idle above firing."""
    code, out_name, columns, cell_width, cell_height = SENTRY
    monster_dir = source / "global" / "monsters" / code
    sheet = Image.new("RGBA", (columns * cell_width, 2 * cell_height), (0, 0, 0, 0))
    written = []
    for row, sequence in enumerate(("nu", "s1")):
        path = find_animation(monster_dir, sequence) if monster_dir.is_dir() else None
        if path is None:
            written.append(0)
            continue
        animation = dcc.parse(path.read_bytes())
        frames = min(animation["frames_per_dir"], columns)
        for frame in range(frames):
            image = fit_into(frame_crop(animation, 0, frame), cell_width, cell_height)
            sheet.alpha_composite(image, (frame * cell_width + (cell_width - image.width) // 2,
                                          row * cell_height + (cell_height - image.height) // 2))
        written.append(frames)
    sheet.save(ASSET_ROOT / out_name)
    return (f"sentry           {code:3s} {out_name:24s} {sheet.width}x{sheet.height} "
            f"cell {cell_width}x{cell_height} idle {written[0]}f fire {written[1]}f")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--only", nargs="*", default=None)
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--sentry", action="store_true",
                        help="build the Assassin sentry turret sheet instead of the pets")
    args = parser.parse_args(argv)

    if args.list:
        for species in sorted(SPECIES):
            print(species, SPECIES[species][0], SPECIES[species][5])
        return 0

    global PALETTE
    PALETTE = dcc.load_palette(args.source / "global" / "palette" / "units" / "pal.dat")
    if args.sentry:
        print(build_sentry(args.source))
        return 0
    wanted = sorted(SPECIES) if not args.only else [name for name in args.only if name in SPECIES]
    failures = 0
    for species in wanted:
        message = build(args.source, species)
        print(message)
        if message.startswith("skip"):
            failures += 1
    print(f"built {len(wanted) - failures}/{len(wanted)} summon atlases")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
