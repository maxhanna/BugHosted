"""Rebuild the D2 survivors enemy atlases from the D2R extraction.

Every animation in `Desktop/d2/d2r extract/data/global/monsters` keeps its
original name (`<code><variant><difficulty><sequence><weapon>.dcc`), so the
correct art for a monster is selected by its `monstats.txt` code instead of
guessing which unnamed `File########.xxx` dump belongs to it.

This replaces the old importers that drove `dcc-convert.exe` over the mod
overlay in `Desktop/d2/Data`, which is why the Blunderbore used to be drawn with
a Diablo 1 goatman sheet: `Y#` is not the Blunderbore, `PN` is.

Each sheet keeps the exact geometry it already has - the importer reads the
existing atlas to derive its cell size - so the runtime crops, the layout table
and every frame-index constant stay valid:

* walk frames fill the direction rows of the movement block,
* attack frames fill the same direction rows of the attack block,
* frames are anchored on the DCC direction box, which removes the jitter of the
  hand-assembled sheets.

Usage:
    python tools/import_d2r_enemy_atlases.py [--only blunderbore golem] [--list]
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

# species -> (monster code, output file, columns, rows)
#
# Only species drawn from an eight-direction atlas are listed: the ones still
# served by a flat single-cell rip already show real Diablo II art.
SPECIES: dict[str, tuple[str, str, int, int]] = {
    "fallen": ("FA", "fallen.png", 13, 1),
    "goatman": ("GM", "goatman-walk.png", 14, 16),
    "skeleton": ("SK", "skeleton.png", 16, 1),
    "skeletonWarrior": ("SK", "skeleton-warrior.png", 16, 16),
    "golem": ("G1", "golem.png", 16, 16),
    "sandRaider": ("SR", "raider.png", 21, 16),
    "sandMaggot": ("SM", "maggot.png", 18, 16),
    "sandMaggotYoung": ("SB", "sand-maggot-young.png", 18, 16),
    "sandMaggotQueen": ("MQ", "maggot-queen.png", 18, 16),
    "scarab": ("SC", "scarab.png", 16, 16),
    "spiderDemon": ("SP", "spider-demon.png", 18, 16),
    "spikeFiend": ("SI", "spike-fiend.png", 20, 16),
    "leaper": ("SL", "leaper.png", 20, 16),
    "blunderbore": ("PN", "blunderbore.png", 16, 16),
    "fetish": ("FE", "fetish.png", 13, 24),
    "boneFetish": ("FK", "bone-fetish.png", 13, 24),
    "council": ("HP", "council.png", 20, 24),
    "minotaur": ("TH", "minotaur.png", 16, 16),
    "nihlathak": ("XU", "nihlathak.png", 14, 16),
    "painWorm": ("46", "pain-worm.png", 9, 16),
    "regurgitator": ("45", "regurgitator.png", 16, 16),
    "salamander": ("SD", "salamander.png", 16, 16),
    "siegeBeast": ("OX", "siege-beast.png", 18, 16),
    "deathMauler": ("M5", "death-mauler.png", 12, 8),
    "wendigo": ("YE", "wendigo.png", 12, 8),
    "andariel": ("AN", "andariel.png", 12, 8),
    "duriel": ("DU", "duriel.png", 25, 8),
    "mephisto": ("MP", "mephisto.png", 18, 24),
    "diablo": ("DI", "diablo.png", 14, 8),
    "baalsMinion": ("43", "baals-minion.png", 16, 24),
    "baal": ("42", "baal.png", 14, 24),
}

# Species whose art was still a flat single-cell rip or a sheet borrowed from
# another monster. They get a brand new atlas instead of a rebuild, so the cell
# size and the frame count are chosen here and mirrored in
# ENEMY_SPRITE_LAYOUTS / ENEMY_SPRITE_CELLS in d2survivors.component.ts.
#
# species -> (monster code, output file, columns, cell width, cell height)
NEW_SPECIES: dict[str, tuple[str, str, int, int, int]] = {
    "balrog": ("DM", "balrog.png", 16, 224, 152),
    "bloodLord": ("L3", "blood-lord.png", 16, 64, 64),
    "spiderDemon": ("SP", "spider-demon.png", 12, 160, 128),
    "spikeFiend": ("SI", "spike-fiend.png", 16, 96, 80),
    "fetishShaman": ("FS", "fetish-shaman.png", 17, 112, 96),
}

# Variant folders in preference order: the plain "tr" animation is the one the
# game shows for ordinary monsters; the HD folders only hold some monsters.
VARIANT_PREFERENCE = ("tr", "hd", "ra", "rh", "la", "lg", "s1", "s2", "s3")


def find_animation(monster_dir: Path, sequence: str) -> Path | None:
    """Pick the best DCC for `sequence` ("wl" or "a1") for a monster code."""
    candidates: list[tuple[int, str, Path]] = []
    for variant_dir in sorted(p for p in monster_dir.iterdir() if p.is_dir()):
        rank = (VARIANT_PREFERENCE.index(variant_dir.name)
                if variant_dir.name in VARIANT_PREFERENCE else len(VARIANT_PREFERENCE))
        for path in sorted(variant_dir.glob("*.dcc")):
            name = path.name.lower()
            if sequence not in name:
                continue
            # Neutral hand-to-hand animations read best for a survivor monster.
            bonus = 0 if "hth" in name else 1
            candidates.append((rank * 10 + bonus, path.name, path))
    return sorted(candidates)[0][2] if candidates else None


def frame_crop(animation: dict, direction_index: int, frame_index: int) -> Image.Image:
    """One frame from a direction canvas, anchored where the DCC puts it."""
    direction = animation["dirs"][direction_index]
    xmin, ymin, _, _ = direction["box"]
    frame = direction["frames"][frame_index]
    canvas = Image.new("RGBA", (direction["box"][2], direction["box"][3]), (0, 0, 0, 0))
    bitmap = direction["bitmaps"][frame_index]
    canvas.alpha_composite(dcc.frame_image(bitmap, frame["width"], frame["height"],
                                           CURRENT_PALETTE),
                           (frame["xmin"] - xmin, frame["ymin"] - ymin))
    # Keep only this frame, but inside the direction canvas so the offsets hold.
    mask = Image.new("L", canvas.size, 0)
    mask.paste(255, (frame["xmin"] - xmin, frame["ymin"] - ymin,
                     frame["xmin"] - xmin + frame["width"], frame["ymin"] - ymin + frame["height"]))
    canvas.putalpha(Image.composite(canvas.getchannel("A"), Image.new("L", canvas.size, 0), mask))
    return canvas


CURRENT_PALETTE: list[tuple[int, int, int]] = []


def fit_into(canvas: Image.Image, width: int, height: int) -> Image.Image:
    scale = min(width / canvas.width, height / canvas.height)
    target = (max(1, round(canvas.width * scale)), max(1, round(canvas.height * scale)))
    resample = Image.LANCZOS if scale < 1 else Image.NEAREST
    return canvas.resize(target, resample)


def build_species(source: Path, species: str) -> str:
    code, out_name, columns, rows = SPECIES[species]
    destination = ASSET_ROOT / out_name
    if not destination.exists():
        return f"skip {species}: {out_name} is missing"
    existing = Image.open(destination)
    cell_width, cell_height = existing.width // columns, existing.height // rows

    monster_dir = source / "global" / "monsters" / code
    if not monster_dir.is_dir():
        return f"skip {species}: no monsters/{code}"
    walk_path = find_animation(monster_dir, "wl")
    attack_path = find_animation(monster_dir, "a1")
    if walk_path is None:
        return f"skip {species}: {code} has no walk animation"

    walk = dcc.parse(walk_path.read_bytes())
    attack = dcc.parse(attack_path.read_bytes()) if attack_path else None

    directions = min(8, walk["directions"])
    sheet = Image.new("RGBA", (existing.width, existing.height), (0, 0, 0, 0))
    # Row blocks, matching enemySpriteDirectionRow():
    #   1 block  (8 rows):  walk only
    #   2 blocks (16 rows): block 0 idle/walk, block 1 attack
    #   3 blocks (24 rows): block 0 idle, block 1 walk, block 2 attack
    blocks = max(1, rows // 8)
    walk_block = 1 if blocks >= 3 else 0
    attack_block = walk_block + 1 if blocks >= 2 else 0

    def paste(image: Image.Image, column: int, row: int) -> None:
        scaled = fit_into(image, cell_width, cell_height)
        left = column * cell_width + (cell_width - scaled.width) // 2
        top = row * cell_height + (cell_height - scaled.height) // 2
        sheet.alpha_composite(scaled, (left, top))

    walk_frames = min(walk["frames_per_dir"], columns)
    for direction in range(directions):
        row = walk_block * 8 + direction
        for frame in range(walk_frames):
            paste(frame_crop(walk, direction, frame), frame, row)
        if blocks >= 3:
            # Idle block: the renderer reads rows 0-7 while standing still, so a
            # three-block sheet needs the neutral pose there as well.
            paste(frame_crop(walk, direction, 0), 0, direction)

    if attack is not None and rows >= 16:
        attack_frames = min(attack["frames_per_dir"], columns)
        for direction in range(min(directions, attack["directions"])):
            row = attack_block * 8 + direction
            for frame in range(attack_frames):
                paste(frame_crop(attack, direction, frame), frame, row)

    expected = (existing.width, existing.height)
    sheet.save(destination)
    check = Image.open(destination).size
    assert check == expected, f"{out_name} changed size {expected} -> {check}"
    return (f"{species:16s} {code:3s} {out_name:24s} {check[0]}x{check[1]} cell {cell_width}x{cell_height} "
            f"walk {walk_path.parent.name}/{walk_path.name} ({walk['frames_per_dir']}f)"
            + (f" attack {attack_path.parent.name}/{attack_path.name} ({attack['frames_per_dir']}f)"
               if attack_path else " attack none"))


def build_new_species(source: Path, species: str) -> str:
    """Create a sixteen-row atlas: eight walk rows above eight attack rows."""
    code, out_name, columns, cell_width, cell_height = NEW_SPECIES[species]
    monster_dir = source / "global" / "monsters" / code
    walk_path = find_animation(monster_dir, "wl") if monster_dir.is_dir() else None
    if walk_path is None:
        return f"skip {species}: no walk animation for {code}"
    attack_path = find_animation(monster_dir, "a1")
    walk = dcc.parse(walk_path.read_bytes())
    attack = dcc.parse(attack_path.read_bytes()) if attack_path else None

    sheet = Image.new("RGBA", (columns * cell_width, 16 * cell_height), (0, 0, 0, 0))

    def paste(image: Image.Image, column: int, row: int) -> None:
        scaled = fit_into(image, cell_width, cell_height)
        left = column * cell_width + (cell_width - scaled.width) // 2
        top = row * cell_height + (cell_height - scaled.height) // 2
        sheet.alpha_composite(scaled, (left, top))

    directions = min(8, walk["directions"])
    walk_frames = min(walk["frames_per_dir"], columns)
    for direction in range(directions):
        for frame in range(walk_frames):
            paste(frame_crop(walk, direction, frame), frame, direction)
    attack_frames = 0
    if attack is not None:
        attack_frames = min(attack["frames_per_dir"], columns)
        for direction in range(min(directions, attack["directions"])):
            for frame in range(attack_frames):
                paste(frame_crop(attack, direction, frame), frame, 8 + direction)

    destination = ASSET_ROOT / out_name
    sheet.save(destination)
    return (f"{species:16s} {code:3s} {out_name:24s} {sheet.width}x{sheet.height} "
            f"cell {cell_width}x{cell_height} walk {walk_frames}f attack {attack_frames}f")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--only", nargs="*", default=None)
    parser.add_argument("--new", action="store_true",
                        help="build the fresh sixteen-row atlases instead of rebuilding")
    parser.add_argument("--list", action="store_true")
    args = parser.parse_args(argv)

    if args.list:
        for species in sorted(SPECIES):
            print(species, SPECIES[species][0])
        for species in sorted(NEW_SPECIES):
            print(species, NEW_SPECIES[species][0], "new atlas")
        return 0

    global CURRENT_PALETTE
    CURRENT_PALETTE = dcc.load_palette(args.source / "global" / "palette" / "units" / "pal.dat")
    if args.new:
        wanted = sorted(NEW_SPECIES) if not args.only else [name for name in args.only if name in NEW_SPECIES]
        failures = 0
        for species in wanted:
            message = build_new_species(args.source, species)
            print(message)
            if message.startswith("skip"):
                failures += 1
        print(f"built {len(wanted) - failures}/{len(wanted)} new atlases")
        return 1 if failures else 0
    wanted = sorted(SPECIES) if not args.only else [name for name in args.only if name in SPECIES]
    failures = 0
    for species in wanted:
        message = build_species(args.source, species)
        print(message)
        if message.startswith("skip"):
            failures += 1
    print(f"rebuilt {len(wanted) - failures}/{len(wanted)} atlases")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
