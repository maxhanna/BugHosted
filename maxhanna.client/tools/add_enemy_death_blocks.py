"""Append every monster's Diablo II death (`dt`) clip to its atlas.

The runtime plays three blocks when a monster lives (walk, attack and the neutral
idle appended by `add_enemy_idle_blocks.py`).  Nothing on disk held the death
animation, so a slain monster simply vanished.  This tool appends the monster's
own `dt` animation as a new block of eight direction rows at the bottom of its
existing sheet, leaving every current row untouched:

    rows 0 .. n-1   walk / attack / idle (unchanged)
    rows n .. n+7   death, one row per facing (added here)

Cells keep the atlas's existing size, so ENEMY_SPRITE_CELLS and every cels'
scale stay valid; only ENEMY_SPRITE_LAYOUTS.grow and ENEMY_DEATH_SPECIES in
d2survivors.component.ts change.

Each death block is packed with one scale per facing (the union of that facing's
frames), centred in the cell and planted on its bottom edge, so the body stays put
while it falls instead of jumping between frames.  Where the real clip has fewer
cel columns than the atlas reserves, the final pose is repeated: an animation
that loops back to "standing" would raise the corpse again.

Usage:
    python tools/add_enemy_death_blocks.py
    python tools/add_enemy_death_blocks.py --only goatman fallen
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

import add_enemy_idle_blocks as idle_tool
import d2r_dc6 as dc6
import d2r_dcc as dcc
import import_d2r_enemy_atlases as tool

ASSET_ROOT = tool.ASSET_ROOT
DEFAULT_SOURCE = tool.DEFAULT_SOURCE

DIRECTIONS = 8
BORDER = 2

# species -> (monster code, atlas, columns, rows before this tool, cell width,
#             cell height, death COF when the extraction has no flat dt DCC)
SPECIES: dict[str, tuple[str, str, int, int, int, int, str | None]] = {
    "fallen": ("FA", "fallen.png", 13, 1, 91, 75, None),
    "goatman": ("GM", "goatman-walk.png", 14, 24, 170, 158, None),
    # skeleton and skeletonWarrior share this atlas, so it is appended once.
    "skeletonWarrior": ("SK", "skeleton-warrior.png", 16, 24, 123, 105, None),
    "skeletalMageCold": ("SK", "skeletal-mage-cold.png", 16, 24, 158, 109, None),
    "skeletalMageFire": ("SK", "skeletal-mage-fire.png", 16, 24, 158, 109, None),
    "skeletalMageLightning": ("SK", "skeletal-mage-lightning.png", 16, 24, 158, 109, None),
    "skeletalMagePoison": ("SK", "skeletal-mage-poison.png", 16, 24, 158, 109, None),
    "golem": ("G1", "golem.png", 16, 24, 91, 102, None),
    "sandRaider": ("SR", "raider.png", 21, 24, 120, 120, None),
    "sandMaggot": ("SM", "maggot.png", 18, 32, 120, 120, None),
    "sandMaggotYoung": ("SB", "sand-maggot-young.png", 18, 24, 128, 128, None),
    "scarab": ("SC", "scarab.png", 16, 24, 128, 128, None),
    "leaper": ("SL", "leaper.png", 20, 24, 120, 120, None),
    "blunderbore": ("PN", "blunderbore.png", 16, 24, 85, 117, None),
    "fetish": ("FE", "fetish.png", 13, 24, 91, 101, None),
    "boneFetish": ("FK", "bone-fetish.png", 13, 24, 91, 101, None),
    "fetishShaman": ("FS", "fetish-shaman.png", 17, 24, 112, 96, None),
    "council": ("HP", "council.png", 20, 24, 104, 105, None),
    "balrog": ("DM", "balrog.png", 16, 24, 224, 152, None),
    "vileChild": ("VC", "vile-child.png", 10, 24, 120, 80, None),
    "vileMother": ("VM", "vile-mother.png", 17, 24, 152, 112, None),
    "bloodLord": ("L3", "blood-lord.png", 16, 24, 64, 64, None),
    "minotaur": ("L3", "minotaur.png", 16, 24, 128, 128, None),
    "nihlathak": ("XU", "nihlathak.png", 14, 24, 128, 128, None),
    "painWorm": ("46", "pain-worm.png", 9, 24, 120, 120, None),
    "regurgitator": ("45", "regurgitator.png", 16, 24, 128, 128, None),
    "salamander": ("SD", "salamander.png", 16, 24, 128, 128, None),
    "siegeBeast": ("OX", "siege-beast.png", 18, 24, 144, 144, None),
    "spiderDemon": ("SP", "spider-demon.png", 12, 24, 160, 128, None),
    "spikeFiend": ("SI", "spike-fiend.png", 16, 24, 96, 80, None),
    "deathMauler": ("M5", "death-mauler.png", 12, 8, 112, 100, None),
    "wendigo": ("YE", "wendigo.png", 12, 8, 161, 100, None),
    "andariel": ("AN", "andariel.png", 12, 8, 240, 260, None),
    "diablo": ("DI", "diablo.png", 14, 8, 192, 182, "didthth.cof"),
    "duriel": ("DU", "duriel.png", 16, 24, 256, 240, None),
    "mephisto": ("MP", "mephisto.png", 18, 24, 307, 309, "mpdthth.cof"),
    "baalsMinion": ("43", "baals-minion.png", 16, 24, 94, 106, None),
    "baal": ("42", "baal.png", 14, 24, 184, 179, "42dthth.cof"),
    "wolf": ("WF", "wolf.png", 13, 24, 96, 80, None),
    "grizzly": ("B7", "grizzly.png", 13, 24, 128, 104, None),
    "bloodGolem": ("G2", "blood-golem.png", 16, 24, 112, 88, None),
    "fireGolem": ("G3", "fire-golem.png", 17, 24, 96, 104, None),
    "ironGolem": ("G4", "iron-golem.png", 16, 24, 96, 112, None),
}


def find_dc6(monster_dir: Path, sequence: str) -> Path | None:
    """The best `.dc6` for `sequence`, in the same variant order as the DCCs."""
    candidates: list[tuple[int, str, Path]] = []
    for variant_dir in sorted(p for p in monster_dir.iterdir() if p.is_dir()):
        rank = (tool.VARIANT_PREFERENCE.index(variant_dir.name)
                if variant_dir.name in tool.VARIANT_PREFERENCE else len(tool.VARIANT_PREFERENCE))
        for path in sorted(variant_dir.glob("*.dc6")):
            if sequence in path.name.lower():
                bonus = 0 if "hth" in path.name.lower() else 1
                candidates.append((rank * 10 + bonus, path.name, path))
    return sorted(candidates)[0][2] if candidates else None


def load_clip(source: Path, code: str, cof_name: str | None):
    """Return (kind, clip) for the monster's death animation.

    The flat `dt` DCC is preferred, but several families only ship the animation
    as a layered COF (the golems' flat cel is one-directional) or as DC6 cels
    (Diablo, Mephisto and Baal), so those are the fallbacks in that order.
    """
    monster_dir = source / "global" / "monsters" / code
    path = tool.find_animation(monster_dir, "dt")
    flat = dcc.parse(path.read_bytes()) if path is not None else None
    if flat is not None and flat["directions"] >= DIRECTIONS:
        return "dcc", flat

    cof = tool.load_cof_animation(monster_dir, code, "dt", cof_name) if cof_name else None
    if cof is None:
        cof_dir = monster_dir / "cof"
        for candidate in sorted(cof_dir.glob("*dt*.cof")) if cof_dir.is_dir() else []:
            cof = tool.load_cof_animation(monster_dir, code, "dt", candidate.name)
            if cof is not None:
                break
    if cof is not None:
        return "cof", cof

    dc6_path = find_dc6(monster_dir, "dt")
    if dc6_path is not None:
        animation = dc6.parse(dc6_path.read_bytes())
        # Re-index the direction-major cels so each facing knows its union box,
        # exactly like a DCC direction, which keeps the fall planted in the cell.
        dirs = []
        for direction in range(animation["directions"]):
            start = direction * animation["frames_per_dir"]
            frames = animation["frames"][start:start + animation["frames_per_dir"]]
            x0 = min(frame["offsetX"] for frame in frames)
            y0 = min(frame["offsetY"] for frame in frames)
            x1 = max(frame["offsetX"] + frame["width"] for frame in frames)
            y1 = max(frame["offsetY"] + frame["height"] for frame in frames)
            dirs.append({"frames": frames, "box": (x0, y0, x1 - x0, y1 - y0)})
        return "dc6", {
            "directions": animation["directions"],
            "frames_per_dir": animation["frames_per_dir"],
            "dirs": dirs,
        }
    if flat is not None:
        return "dcc", flat
    return None, None


def direction_frame(kind: str, clip, direction: int, frame: int):
    """One death cel plus the source box it was drawn in."""
    if kind == "cof":
        return tool.composite_frame(clip, direction, frame, with_box=True)
    if kind == "dc6":
        source = clip["dirs"][direction]
        cel = source["frames"][frame]
        return (dc6.frame_image(cel, tool.CURRENT_PALETTE),
                (cel["offsetX"] - source["box"][0], cel["offsetY"] - source["box"][1],
                 cel["width"], cel["height"]))
    return tool.frame_crop(clip, direction, frame), clip["dirs"][direction]["box"]


def choose_palette(species: str, sheet: Image.Image, cell_width: int, cell_height: int,
                   source: Path, code: str):
    """The palette this sheet was drawn with, so a corpse matches the body."""
    monster_dir = source / "global" / "monsters" / code
    walk_path = tool.find_animation(monster_dir, "wl")
    if walk_path is not None:
        walk = dcc.parse(walk_path.read_bytes())
        return idle_tool.choose_palette(species, walk, sheet, cell_width, cell_height, source)
    legacy, units = idle_tool.palettes(source)
    return units if species in tool.BGR_FIXED_SPECIES else legacy


def build(source: Path, species: str) -> str:
    code, out_name, columns, rows, cell_width, cell_height, cof_name = SPECIES[species]
    sheet_path = ASSET_ROOT / out_name
    if not sheet_path.is_file():
        return f"skip {species}: {out_name} is missing"
    sheet = Image.open(sheet_path).convert("RGBA")
    if (sheet.width, sheet.height) != (columns * cell_width, rows * cell_height):
        return (f"skip {species}: {out_name} is {sheet.width}x{sheet.height}, "
                f"expected {columns * cell_width}x{rows * cell_height} before the death block")

    kind, clip = load_clip(source, code, cof_name)
    if clip is None:
        return f"skip {species}: {code} has no readable death animation"

    tool.CURRENT_PALETTE = choose_palette(species, sheet, cell_width, cell_height, source, code)
    directions = min(DIRECTIONS, clip["directions"])
    if directions < 1:
        return f"skip {species}: death animation has no directions"
    # A flat DCC reports its own frame count; a COF clip reports `frames`.
    frames = max(1, min(columns, clip.get("frames_per_dir", clip.get("frames", columns))))

    # Every direction is packed from the union of its own death frames, which is
    # the minimal box that holds the whole fall.  One scale and one ground line
    # per facing keep the body planted while it collapses.
    packed: dict[int, tuple[tuple[int, int, int, int], float, list[tuple[int, Image.Image, tuple[int, int, int, int]]]]] = {}
    for direction in range(directions):
        cels = []
        bounds = []
        for column in range(columns):
            image, box = direction_frame(kind, clip, direction, min(frames - 1, column))
            cels.append((column, image, box))
            bounds.append((box[0], box[1], box[0] + box[2], box[1] + box[3]))
        union = (min(b[0] for b in bounds), min(b[1] for b in bounds),
                 max(b[2] for b in bounds), max(b[3] for b in bounds))
        union_width = max(1, union[2] - union[0])
        union_height = max(1, union[3] - union[1])
        scale = min((cell_width - BORDER * 2) / union_width,
                    (cell_height - BORDER * 2) / union_height)
        packed[direction] = (union, scale, cels)

    height = (rows + DIRECTIONS) * cell_height
    painted = Image.new("RGBA", (sheet.width, height), (0, 0, 0, 0))
    painted.alpha_composite(sheet, (0, 0))
    for direction in range(directions):
        union, scale, cels = packed[direction]
        union_width = max(1, union[2] - union[0])
        union_height = max(1, union[3] - union[1])
        row = rows + direction
        offset_x = (cell_width - union_width * scale) / 2
        offset_y = cell_height - BORDER - union_height * scale
        for column, image, box in cels:
            target_width = max(1, round(box[2] * scale))
            target_height = max(1, round(box[3] * scale))
            cel = image.resize((target_width, target_height),
                               Image.NEAREST if scale >= 1 else Image.LANCZOS)
            left = round(column * cell_width + offset_x + (box[0] - union[0]) * scale)
            top = round(row * cell_height + offset_y + (box[1] - union[1]) * scale)
            left = max(column * cell_width, min((column + 1) * cell_width - cel.width, left))
            top = max(row * cell_height, min((row + 1) * cell_height - cel.height, top))
            painted.alpha_composite(cel, (left, top))
    # Facings the clip does not carry (a four-direction monster death) repeat the
    # first row so no direction of the block is blank.
    for direction in range(directions, DIRECTIONS):
        first = rows
        row = rows + direction
        painted.alpha_composite(
            painted.crop((0, first * cell_height, sheet.width, (first + 1) * cell_height)),
            (0, row * cell_height),
        )

    painted.save(sheet_path, optimize=True)
    written = Image.open(sheet_path)
    assert written.size == (sheet.width, height), f"{out_name} saved {written.size}"
    return (f"{species:20s} {code:3s} {out_name:24s} {written.width}x{written.height} "
            f"death rows {rows}-{rows + DIRECTIONS - 1} {frames}f x {directions} dirs "
            f"({kind.upper()})")


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
    print(f"added death blocks to {len(wanted) - failures}/{len(wanted)} atlases")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
