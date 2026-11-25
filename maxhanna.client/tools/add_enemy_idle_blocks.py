"""Append a real idle (neutral, `nu`) block to the enemy atlases that lack one.

Most of the animated monster sheets were imported with two blocks of eight
direction rows: walk above attack.  Standing still therefore held one walk cel,
so a waiting monster was a still picture.  This tool renders the monster's own
Diablo II neutral animation and appends it as a third block below them:

    rows 0-7     walk          (unchanged)
    rows 8-15    attack        (unchanged)
    rows 16-23   idle          (added here)

The runtime's ENEMY_SPRITE_LAYOUTS rows, enemySpriteDirectionRow() and
ENEMY_IDLE_TAIL_FRAMES mirror this layout (`idle` is block 2 for these species),
and each appended cel is scaled to the walk band so a monster does not draw
larger standing still than walking (see normalize_enemy_atlas_blocks.py, which
does that final pass on the written sheet).

The sheet's palette is detected per species by rendering the walk clip with each
palette the importer uses and keeping the one that matches the cels already on
disk, so an appended block is tinted like the rest of its sheet.

Usage:
    python tools/add_enemy_idle_blocks.py             # every configured species
    python tools/add_enemy_idle_blocks.py --only goatman scarab
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

import import_d2r_enemy_atlases as tool
import normalize_enemy_atlas_blocks as normalizer

ASSET_ROOT = tool.ASSET_ROOT
DEFAULT_SOURCE = tool.DEFAULT_SOURCE

# species -> (monster code, sheet, columns, walk+attack rows, cell height)
#
# The columns and cell height mirror the atlas the importer writes (the runtime
# slices by naturalWidth / columns and naturalHeight / rows), and the monster
# code is the `monstats` code its walk and attack blocks came from.  The cell
# height is recorded here rather than re-derived from the sheet so a sheet that
# already carries its idle block is recognised instead of appended to twice.
SPECIES: dict[str, tuple[str, str, int, int, int]] = {
    "goatman": ("GM", "goatman-walk.png", 14, 16, 158),
    "skeletonWarrior": ("SK", "skeleton-warrior.png", 16, 16, 105),
    "golem": ("G1", "golem.png", 16, 16, 102),
    "sandRaider": ("SR", "raider.png", 21, 16, 120),
    "sandMaggotYoung": ("SB", "sand-maggot-young.png", 18, 16, 128),
    "spikeFiend": ("SI", "spike-fiend.png", 16, 16, 80),
    "scarab": ("SC", "scarab.png", 16, 16, 128),
    "leaper": ("SL", "leaper.png", 20, 16, 120),
    "blunderbore": ("PN", "blunderbore.png", 16, 16, 117),
    "nihlathak": ("XU", "nihlathak.png", 14, 16, 128),
    "painWorm": ("46", "pain-worm.png", 9, 16, 120),
    "regurgitator": ("45", "regurgitator.png", 16, 16, 128),
    "salamander": ("SD", "salamander.png", 16, 16, 128),
    "siegeBeast": ("OX", "siege-beast.png", 18, 16, 144),
    "balrog": ("DM", "balrog.png", 16, 16, 152),
    "bloodLord": ("L3", "blood-lord.png", 16, 16, 64),
    "spiderDemon": ("SP", "spider-demon.png", 12, 16, 128),
    "fetishShaman": ("FS", "fetish-shaman.png", 17, 16, 96),
    "minotaur": ("L3", "minotaur.png", 16, 16, 128),
    "vileChild": ("VC", "vile-child.png", 10, 16, 80),
    "vileMother": ("VM", "vile-mother.png", 17, 16, 112),
    # Druid pets, the necromancer's other golems and Duriel came from the D2R
    # summon importer; their walk and attack blocks are the same two-band layout.
    "wolf": ("WF", "wolf.png", 13, 16, 80),
    "grizzly": ("B7", "grizzly.png", 13, 16, 104),
    "bloodGolem": ("G2", "blood-golem.png", 16, 16, 88),
    "fireGolem": ("G3", "fire-golem.png", 17, 16, 104),
    "ironGolem": ("G4", "iron-golem.png", 16, 16, 112),
    "duriel": ("DU", "duriel.png", 16, 16, 240),
}

IDLE_BLOCK = 2
DIRECTIONS = 8


def palettes(source: Path) -> tuple[list[tuple[int, int, int]], list[tuple[int, int, int]]]:
    path = source / "global" / "palette" / "units" / "pal.dat"
    import d2r_dcc as dcc

    return dcc.load_palette(path), tool.load_units_palette(path)


def cell_of(sheet: Image.Image, cell_width: int, cell_height: int) -> Image.Image:
    """Frame 0 of direction 0, as the runtime slices it."""
    return sheet.crop((0, 0, cell_width, cell_height)).convert("RGBA")


def content_height(cel: Image.Image) -> int:
    """Visible height of a cel, the measure the runtime sizes a sheet by."""
    box = cel.getchannel("A").getbbox()
    return box[3] - box[1] if box else 0


def walk_band_content_height(sheet: Image.Image, columns: int, rows: int,
                             cell_width: int, cell_height: int) -> int:
    """Tallest cel of the walk band (rows 0-7), which sets the sheet's scale."""
    tallest = 0
    for row in range(min(DIRECTIONS, rows)):
        for column in range(columns):
            cel = sheet.crop((column * cell_width, row * cell_height,
                              (column + 1) * cell_width, (row + 1) * cell_height))
            tallest = max(tallest, content_height(cel))
    return tallest


def frame_difference(left: Image.Image, right: Image.Image) -> float:
    """Mean absolute RGBA difference of two cels, so palettes can be compared."""
    size = (min(left.width, right.width), min(left.height, right.height))
    a = np.asarray(left.resize(size, Image.NEAREST)).astype(np.int16)
    b = np.asarray(right.resize(size, Image.NEAREST)).astype(np.int16)
    return float(np.abs(a - b).mean())


def choose_palette(species: str, walk: dict, sheet: Image.Image, cell_width: int,
                   cell_height: int, source: Path) -> list[tuple[int, int, int]]:
    """The palette the sheet on disk was drawn with."""
    reference = cell_of(sheet, cell_width, cell_height)
    legacy, units = palettes(source)
    samples = []
    for palette in (legacy, units):
        tool.CURRENT_PALETTE = palette
        frame = tool.frame_crop(walk, 0, 0)
        samples.append(frame_difference(tool.fit_into(frame, reference.width, reference.height), reference))
    best = legacy if samples[0] <= samples[1] else units
    if species in tool.BGR_FIXED_SPECIES:
        best = units
    return best


# The melee skeleton is drawn from the ten-layer SK COF composite, so its idle
# clip has to be composited and placed on the same origin as its walk band.
# SK's neutral clip comes in three weapon variants: hth (bare), bow and 1hs. The
# warrior carries a sword and buckler in its walk band, so its idle must be the
# 1hs neutral or it would stand bare-handed and grow a sword when it walks.
SKELETON_COFS = {"walk": ("wl", "skwl1hs.cof"), "attack": ("a1", "ska11hs.cof"), "idle": ("nu", "sknu1hs.cof")}
SKELETON_BORDER = 4
# The shared SK neutral COFs also carry the mage's S4/S5 hand-glow layers, which
# draw as black discs on a warrior; the mage atlases key them out instead.
SKELETON_GLOW_COMPONENTS = frozenset({11, 12})


def composite_without(animation: dict, direction_index: int, frame_index: int, skip: frozenset[int]):
    """Flatten one COF frame like the importer, minus a few layers."""
    cof = animation["cof"]
    layers = animation["layers"]
    frame_index = min(frame_index, animation["frames"] - 1)
    layer_count = len(cof["layers"])
    order_start = (direction_index * cof["frames"] + frame_index) * layer_count
    order = cof["order"][order_start:order_start + layer_count]
    parts = []
    for component in order:
        layer = layers.get(component)
        if component in skip or layer is None or direction_index >= layer["directions"]:
            continue
        box = layer["dirs"][direction_index]["box"]
        parts.append((box, tool.frame_crop(layer, direction_index,
                                           min(frame_index, layer["frames_per_dir"] - 1))))
    if not parts:
        return None
    xmin = min(box[0] for box, _ in parts)
    ymin = min(box[1] for box, _ in parts)
    xmax = max(box[0] + box[2] for box, _ in parts)
    ymax = max(box[1] + box[3] for box, _ in parts)
    canvas = Image.new("RGBA", (xmax - xmin, ymax - ymin), (0, 0, 0, 0))
    for box, cel in parts:
        canvas.alpha_composite(cel, (box[0] - xmin, box[1] - ymin))
    return canvas, (xmin, ymin, xmax - xmin, ymax - ymin)


def append_skeleton_idle(source: Path, sheet_path: Path, columns: int, rows: int,
                         cell_height: int) -> str:
    """Append SK's neutral clip using the composite geometry of its walk band."""
    monster_dir = source / "global" / "monsters" / "SK"
    tool.CURRENT_PALETTE = tool.load_units_palette(source / "global" / "palette" / "units" / "pal.dat")
    clips = {name: tool.load_cof_animation(monster_dir, "SK", mode, cof)
             for name, (mode, cof) in SKELETON_COFS.items()}
    if any(clip is None for clip in clips.values()):
        return "skip skeletonWarrior: SK idle/walk/attack COF is incomplete"
    frames: dict[str, int] = {}
    boxes = []
    for name in ("walk", "attack"):
        frames[name] = min(columns, clips[name]["frames"])
        for direction in range(DIRECTIONS):
            for frame in range(frames[name]):
                _, box = tool.composite_frame(clips[name], direction, frame, with_box=True)
                boxes.append((box[0], box[1], box[0] + box[2], box[1] + box[3]))
    xmin = min(box[0] for box in boxes)
    ymin = min(box[1] for box in boxes)
    occluded = Image.open(sheet_path).convert("RGBA")
    cell_width = occluded.width // columns
    if occluded.height not in (rows * cell_height, (rows + DIRECTIONS) * cell_height):
        return f"skip skeletonWarrior: unexpected atlas height {occluded.height}"

    frames["idle"] = min(columns, clips["idle"]["frames"])
    height = (rows + DIRECTIONS) * cell_height
    painted = Image.new("RGBA", (occluded.width, height), (0, 0, 0, 0))
    painted.alpha_composite(occluded.crop((0, 0, occluded.width, rows * cell_height)), (0, 0))
    pad = 512
    for direction in range(DIRECTIONS):
        for column in range(columns):
            frame = composite_without(clips["idle"], direction, column % frames["idle"],
                                      SKELETON_GLOW_COMPONENTS)
            if frame is None:
                continue
            image, box = frame
            canvas = Image.new("RGBA", (cell_width + pad * 2, cell_height + pad * 2), (0, 0, 0, 0))
            canvas.alpha_composite(image, (pad + (box[0] - xmin) + SKELETON_BORDER,
                                           pad + (box[1] - ymin) + SKELETON_BORDER))
            cel = canvas.crop((pad, pad, pad + cell_width, pad + cell_height))
            painted.alpha_composite(cel, (column * cell_width, (rows + direction) * cell_height))
    painted.save(sheet_path, optimize=True)
    written = Image.open(sheet_path)
    assert written.size == (occluded.width, height), f"skeleton-warrior.png saved {written.size}"
    return (f"{'skeletonWarrior':16s} SK  skeleton-warrior.png      {written.width}x{written.height} "
            f"idle {frames['idle']}f x {DIRECTIONS} dirs")


def build(source: Path, species: str) -> str:
    code, out_name, columns, rows, cell_height = SPECIES[species]
    sheet_path = ASSET_ROOT / out_name
    if species == "skeletonWarrior":
        if not sheet_path.is_file():
            return f"skip {species}: {out_name} is missing"
        return append_skeleton_idle(source, sheet_path, columns, rows, cell_height)
    monster_dir = source / "global" / "monsters" / code
    if not sheet_path.is_file() or not monster_dir.is_dir():
        return f"skip {species}: missing {out_name} or monsters/{code}"
    idle_path = tool.find_animation(monster_dir, "nu")
    if idle_path is None:
        return f"skip {species}: {code} has no neutral animation"

    sheet = Image.open(sheet_path).convert("RGBA")
    cell_width = sheet.width // columns
    walk_height = rows * cell_height
    if sheet.height not in (walk_height, (rows + DIRECTIONS) * cell_height):
        return (f"skip {species}: {out_name} is {sheet.width}x{sheet.height}, "
                f"expected {columns * cell_width}x{walk_height} with or without an idle block")
    walk = tool.dcc.parse(tool.find_animation(monster_dir, "wl").read_bytes())
    tool.CURRENT_PALETTE = choose_palette(species, walk, sheet, cell_width, cell_height, source)

    idle = tool.dcc.parse(idle_path.read_bytes())
    frames = min(idle["frames_per_dir"], columns)
    directions = min(DIRECTIONS, idle["directions"])
    walk_content = walk_band_content_height(sheet, columns, rows, cell_width, cell_height)

    # Keep the walk and attack blocks, then draw the idle block below them.
    # Re-running replaces an idle block this tool already appended.
    height = (rows + DIRECTIONS) * cell_height
    painted = Image.new("RGBA", (sheet.width, height), (0, 0, 0, 0))
    painted.alpha_composite(sheet.crop((0, 0, sheet.width, walk_height)), (0, 0))
    for direction in range(directions):
        row = IDLE_BLOCK * DIRECTIONS + direction
        for column in range(columns):
            # Every column holds art: a stale frame index then repeats the loop
            # instead of flickering transparent.
            cel = tool.fit_into(tool.frame_crop(idle, direction, column % frames), cell_width, cell_height)
            # The runtime divides every cel of a sheet by the walk band's height,
            # so an idle cel that happens to fill more of its cell (Duriel's does)
            # would draw the monster visibly larger standing than walking. Bring
            # the taller idle cels back to the walk band's tallest cel.
            cel_height = content_height(cel)
            if walk_content and cel_height > walk_content:
                scale = walk_content / cel_height
                cel = cel.resize((max(1, round(cel.width * scale)), max(1, round(cel.height * scale))),
                                 Image.NEAREST)
            left = column * cell_width + (cell_width - cel.width) // 2
            top = row * cell_height + (cell_height - cel.height) // 2
            painted.alpha_composite(cel, (left, top))
    painted.save(sheet_path, optimize=True)
    written = Image.open(sheet_path)
    expected = ((rows + DIRECTIONS) * cell_height)
    assert written.size == (sheet.width, expected), f"{out_name} saved {written.size}"
    return (f"{species:16s} {code:3s} {out_name:24s} {written.width}x{written.height} "
            f"idle {frames}f x {directions} dirs")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--only", nargs="*", default=None)
    args = parser.parse_args(argv)
    if not args.source.is_dir():
        raise SystemExit(f"D2R extraction not found: {args.source}")
    wanted = sorted(SPECIES) if not args.only else [name for name in args.only if name in SPECIES]
    if not wanted:
        raise SystemExit("No species selected")
    failures = 0
    for species in wanted:
        message = build(args.source, species)
        print(message)
        if message.startswith("skip"):
            failures += 1
    # The idle cels are packed from the raw `nu` frame boxes, which do not share
    # the walk band's scale (a cel with wide margins was blown up to fill its
    # cell). Re-scale the appended block onto the walk band's own median height
    # and foot line, otherwise a waiting monster draws visibly larger than the
    # same monster walking.
    for species in wanted:
        code, out_name, columns, rows, cell_height = SPECIES[species]
        path = ASSET_ROOT / out_name
        if not path.is_file():
            continue
        sheet = Image.open(path)
        cell_width = sheet.width // columns
        if sheet.height < (rows + DIRECTIONS) * cell_height:
            continue
        print(normalizer.normalise(path, cell_width, cell_height, DIRECTIONS, (IDLE_BLOCK,)))

    print(f"added idle blocks to {len(wanted) - failures}/{len(wanted)} atlases")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
