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
    python tools/import_d2r_enemy_atlases.py --mage
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

import d2r_dc6 as dc6
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
    "sandMaggot": ("SM", "maggot.png", 18, 32),
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
    "nihlathak": ("XU", "nihlathak.png", 14, 16),
    "painWorm": ("46", "pain-worm.png", 9, 16),
    "regurgitator": ("45", "regurgitator.png", 16, 16),
    "salamander": ("SD", "salamander.png", 16, 16),
    "siegeBeast": ("OX", "siege-beast.png", 18, 16),
    "deathMauler": ("M5", "death-mauler.png", 12, 8),
    "wendigo": ("YE", "wendigo.png", 12, 8),
    "andariel": ("AN", "andariel.png", 12, 8),
    "duriel": ("DU", "duriel.png", 16, 16),
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
    # The Act V minotaur is the Blood Lord composite (L3), including its axes.
    # TH is a Thorned Hulk and was producing a completely different creature.
    "minotaur": ("L3", "minotaur.png", 16, 128, 128),
    # Act 4 flesh beasts: the flat 49x50 and 42x48 rips lost their animation,
    # while VC and VM both have eight-direction walk and attack DCCs.
    "vileChild": ("VC", "vile-child.png", 10, 120, 80),
    "vileMother": ("VM", "vile-mother.png", 17, 152, 112),
}

# `composit.txt` row order: component 0 is HD, 1 TR, 2 LG, 3 RA, 4 LA,
# 5 RH, 6 LH, 7 SH, and 8..15 are S1..S8. A COF lists which of these layers
# form one animation and the per-frame back-to-front draw order.
COMPOSIT_ROWS = ("hd", "tr", "lg", "ra", "la", "rh", "lh", "sh",
                 "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8")
# Species built from layered COFs instead of the flat `tr` body DCC.
COF_SPECIES = {
    "vileChild", "vileMother", "minotaur", "baalsMinion",
    # Fetish and Bone Fetish keep their weapon in the `rh` layer, and the
    # Council's idle/walk/attack clips have different lengths. Flattening the
    # COFs keeps every part and its original timing.
    "fetish", "boneFetish", "council",
}

# Some monster families use numbered COF names (`fknu1hs.cof`) or label the
# hand-to-hand clips `hth` while still recording a 1hs weapon layer. Name the
# exact COF used by each rebuilt animation so those files are not guessed.
COF_NAMES: dict[str, dict[str, str]] = {
    "fetish": {"nu": "fenuhth.cof", "wl": "fewlhth.cof", "a1": "fea1hth.cof"},
    "boneFetish": {"nu": "fknu1hs.cof", "wl": "fkwl1hs.cof", "a1": "fka11hs.cof"},
    "council": {"nu": "hpnuhth.cof", "wl": "hpwlhth.cof", "a1": "hpa1hth.cof"},
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


def fade_pain_worm_matte(image: Image.Image) -> Image.Image:
    """Replace the Pain Worm's baked black silhouette with soft alpha.

    Its DCC paints an opaque black, body-shaped backdrop enclosed by transparent
    pixels, so the renderer's border clean-up never reaches it. Deriving alpha
    from luminance removes that silhouette while keeping the blue body and glow.
    """
    result = image.copy()
    pixels = result.load()
    for y in range(result.height):
        for x in range(result.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                continue
            high = max(red, green, blue)
            fade = max(0.0, min(1.0, (high - 20) / 75))
            fade = fade * fade * (3 - 2 * fade)
            out_alpha = min(255, round(alpha * fade * 1.15))
            if out_alpha == 0:
                pixels[x, y] = (0, 0, 0, 0)
            else:
                pixels[x, y] = (
                    min(255, round(red * 1.15 + 12)),
                    min(255, round(green * 1.15 + 12)),
                    min(255, round(blue * 1.15 + 12)),
                    out_alpha,
                )
    return result


def parse_cof(path: Path) -> dict:
    """Read a COF's layer records, frame count and per-frame draw order."""
    data = path.read_bytes()
    if len(data) < 28:
        raise ValueError(f"{path.name} is too short for a COF")
    layers, frames, directions = data[0], data[1], data[2]
    if not layers or not frames or not directions:
        raise ValueError(f"{path.name} has no layers, frames or directions")
    records = []
    for index in range(layers):
        start = 28 + index * 9
        records.append((data[start], data[start + 5:start + 8].decode("ascii", "replace")))
    order_length = directions * frames * layers
    if len(data) < 28 + 9 * layers + frames + order_length:
        raise ValueError(f"{path.name} is truncated")
    order_start = len(data) - order_length
    return {
        "layers": records,
        "frames": frames,
        "directions": directions,
        "order": list(data[order_start:]),
    }


def find_layer_dcc(monster_dir: Path, code: str, layer: str, mode: str, wclass: str,
                   element: str | None = None) -> Path | None:
    """Find the DCC for one COF component, preferring its lit variant."""
    layer_dir = monster_dir / layer
    if not layer_dir.is_dir():
        return None
    prefix = f"{code.lower()}{layer.lower()}"
    suffix = f"{wclass.lower()}.dcc"
    candidates: list[tuple[int, str, Path]] = []
    for path in layer_dir.glob("*.dcc"):
        name = path.name.lower()
        if not name.startswith(prefix) or mode not in name or not name.endswith(suffix):
            continue
        # s4/s5 hold the skeletal mage's four palette variants. The base
        # skeleton layers are shared by every element, so only those two layers
        # should be filtered by the cold/fire/lightning/poison code.
        if element and layer in {"s4", "s5"} and not name.startswith(prefix + element):
            continue
        candidates.append((0 if "lit" in name else 1, name, path))
    return sorted(candidates)[0][2] if candidates else None


def load_cof_animation(monster_dir: Path, code: str, mode: str,
                       cof_name: str | None = None, element: str | None = None) -> dict | None:
    """Load every DCC layer and the frame metadata for one COF animation."""
    cof_path = monster_dir / "cof" / (cof_name or f"{code.lower()}{mode}hth.cof")
    if not cof_path.is_file():
        return None
    try:
        cof = parse_cof(cof_path)
    except ValueError:
        return None
    layers = {}
    for component, wclass in cof["layers"]:
        if not 0 <= component < len(COMPOSIT_ROWS):
            return None
        path = find_layer_dcc(monster_dir, code, COMPOSIT_ROWS[component], mode, wclass, element)
        if path is None:
            return None
        try:
            layers[component] = dcc.parse(path.read_bytes())
        except dcc.DCCError:
            return None
    if not layers:
        return None
    frames = min([cof["frames"]] + [animation["frames_per_dir"] for animation in layers.values()])
    directions = min([cof["directions"]] + [animation["directions"] for animation in layers.values()])
    return {"cof": cof, "layers": layers, "frames": frames, "directions": directions}


def composite_frame(animation: dict, direction_index: int, frame_index: int,
                    with_box: bool = False):
    """Flatten one COF frame's layers in its recorded back-to-front order."""
    cof = animation["cof"]
    layers = animation["layers"]
    frame_index = min(frame_index, animation["frames"] - 1)
    layer_count = len(cof["layers"])
    order_start = (direction_index * cof["frames"] + frame_index) * layer_count
    order = cof["order"][order_start:order_start + layer_count]
    boxes = []
    for component in order:
        layer = layers.get(component)
        if layer is not None and direction_index < layer["directions"]:
            boxes.append(layer["dirs"][direction_index]["box"])
    if not boxes:
        empty = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
        return (empty, (0, 0, 1, 1)) if with_box else empty
    xmin = min(box[0] for box in boxes)
    ymin = min(box[1] for box in boxes)
    xmax = max(box[0] + box[2] for box in boxes)
    ymax = max(box[1] + box[3] for box in boxes)
    canvas = Image.new("RGBA", (xmax - xmin, ymax - ymin), (0, 0, 0, 0))
    for component in order:
        layer = layers.get(component)
        if layer is None or direction_index >= layer["directions"]:
            continue
        box = layer["dirs"][direction_index]["box"]
        cel = frame_crop(layer, direction_index, min(frame_index, layer["frames_per_dir"] - 1))
        canvas.alpha_composite(cel, (box[0] - xmin, box[1] - ymin))
    return (canvas, (xmin, ymin, xmax - xmin, ymax - ymin)) if with_box else canvas


def load_units_palette(path: Path) -> list[tuple[int, int, int]]:
    """Read the D2 units palette as RGB; the file stores BGR triples."""
    return [(red, green, blue) for blue, green, red in dcc.load_palette(path)]


CURRENT_PALETTE: list[tuple[int, int, int]] = []

# `units/pal.dat` stores its triples as BGR, but the historical importer read
# them straight into (red, green, blue). Every other sheet was generated that
# way and is tuned around it, so only the species below are rebuilt with the
# channels corrected. The swap turned Andariel's warm red-and-gold palette into
# blue; it did the same to the Fetish's brown skin, the Bone Fetish's leather
# straps and the Council's red robes.
BGR_FIXED_SPECIES = {"andariel", "duriel", "fetish", "boneFetish", "council", "mephisto"}


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
        if species == "painWorm":
            scaled = fade_pain_worm_matte(scaled)
        left = column * cell_width + (cell_width - scaled.width) // 2
        top = row * cell_height + (cell_height - scaled.height) // 2
        sheet.alpha_composite(scaled, (left, top))

    walk_frames = min(walk["frames_per_dir"], columns)
    for direction in range(directions):
        row = walk_block * 8 + direction
        for frame in range(columns):
            # Every column is filled. The Siege Beast's OX walk clip has only
            # eight real cels while the atlas reserves eighteen; leaving the
            # rest transparent made the monster vanish for most of its walk.
            paste(frame_crop(walk, direction, frame % walk_frames), frame, row)
        if blocks >= 3:
            # Idle block: the renderer reads rows 0-7 while standing still, so a
            # three-block sheet needs the neutral pose there as well.
            paste(frame_crop(walk, direction, 0), 0, direction)

    if attack is not None and rows >= 16:
        attack_frames = min(attack["frames_per_dir"], columns)
        for direction in range(min(directions, attack["directions"])):
            row = attack_block * 8 + direction
            for frame in range(columns):
                # Same guard for short attack clips: OX has nine strike cels,
                # so the unused atlas columns repeat the real animation.
                paste(frame_crop(attack, direction, frame % attack_frames), frame, row)

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


def build_composite_species(source: Path, species: str) -> str:
    """Build a sixteen-row atlas from a monster's layered COF animation."""
    code, out_name, columns, cell_width, cell_height = NEW_SPECIES[species]
    monster_dir = source / "global" / "monsters" / code
    walk = load_cof_animation(monster_dir, code, "wl")
    if walk is None:
        return f"skip {species}: no layered walk for {code}"
    attack = load_cof_animation(monster_dir, code, "a1")
    sheet = Image.new("RGBA", (columns * cell_width, 16 * cell_height), (0, 0, 0, 0))

    def paste(image: Image.Image, column: int, row: int) -> None:
        scaled = fit_into(image, cell_width, cell_height)
        left = column * cell_width + (cell_width - scaled.width) // 2
        top = row * cell_height + (cell_height - scaled.height) // 2
        sheet.alpha_composite(scaled, (left, top))

    directions = min(8, walk["directions"])
    walk_frames = min(walk["frames"], columns)
    for direction in range(directions):
        for frame in range(walk_frames):
            paste(composite_frame(walk, direction, frame), frame, direction)
    attack_frames = 0
    if attack is not None:
        attack_frames = min(attack["frames"], columns)
        for direction in range(min(directions, attack["directions"])):
            for frame in range(attack_frames):
                paste(composite_frame(attack, direction, frame), frame, 8 + direction)

    destination = ASSET_ROOT / out_name
    sheet.save(destination)
    return (f"{species:16s} {code:3s} {out_name:24s} {sheet.width}x{sheet.height} "
            f"cell {cell_width}x{cell_height} walk {walk_frames}f attack {attack_frames}f "
            f"cof {len(walk['cof']['layers'])}/{len(attack['cof']['layers']) if attack else 0} layers")


def build_composite_rebuild(source: Path, species: str) -> str:
    """Rebuild an existing multi-block sheet from its layered COF animations.

    The idle, walk and attack clips share one scale and one DCC-space origin per
    facing.  Without that shared origin each frame is centred independently and
    the creature visibly jitters as its weapon or limbs change the frame box.

    Every atlas column is filled.  A short clip repeats from its first cel once
    its real frames are exhausted, so a loop over the atlas width can never land
    on a transparent cel and make the monster disappear; the runtime separately
    loops only the real frame count.
    """
    code, out_name, columns, rows = SPECIES[species]
    destination = ASSET_ROOT / out_name
    if not destination.is_file():
        return f"skip {species}: missing existing {out_name}"
    existing = Image.open(destination).convert("RGBA")
    cell_width = existing.width // columns
    cell_height = existing.height // rows

    monster_dir = source / "global" / "monsters" / code
    cof_names = COF_NAMES.get(species, {})
    idle = load_cof_animation(monster_dir, code, "nu", cof_names.get("nu"))
    walk = load_cof_animation(monster_dir, code, "wl", cof_names.get("wl"))
    attack = load_cof_animation(monster_dir, code, "a1", cof_names.get("a1"))
    if walk is None:
        return f"skip {species}: no layered walk for {code}"
    idle_source = idle or walk

    blocks = max(1, rows // 8)
    walk_block = 1 if blocks >= 3 else 0
    attack_block = walk_block + 1 if blocks >= 2 else 0
    clips = [("idle", idle_source, 0 if blocks >= 3 else None)]
    clips.append(("walk", walk, walk_block * 8))
    if attack is not None and rows >= 16:
        clips.append(("attack", attack, attack_block * 8))

    # Union every clip's frame boxes per facing. The idle, walk and attack
    # blocks then share the same origin, so switching state cannot make the
    # sprite hop or slide inside its cel.
    directions = min(8, *(animation["directions"] for _, animation, _ in clips))
    if directions < 8:
        return f"skip {species}: {code} has only {directions} directions"
    direction_boxes = []
    for direction in range(directions):
        boxes = []
        for _, animation, _ in clips:
            for frame in range(min(animation["frames"], columns)):
                _, box = composite_frame(animation, direction, frame, with_box=True)
                boxes.append((box[0], box[1], box[0] + box[2], box[1] + box[3]))
        direction_boxes.append((
            min(box[0] for box in boxes), min(box[1] for box in boxes),
            max(box[2] for box in boxes), max(box[3] for box in boxes),
        ))

    border = 2
    widest = max(box[2] - box[0] for box in direction_boxes)
    tallest = max(box[3] - box[1] for box in direction_boxes)
    scale = min(
        (cell_width - border * 2) / widest,
        (cell_height - border * 2) / tallest,
    )
    if scale <= 0:
        return f"skip {species}: {code} frames do not fit {cell_width}x{cell_height}"

    sheet = Image.new("RGBA", existing.size, (0, 0, 0, 0))
    for clip_name, animation, row_start in clips:
        if row_start is None:
            continue
        frame_count = min(animation["frames"], columns)
        for direction in range(min(directions, animation["directions"])):
            xmin, ymin, xmax, ymax = direction_boxes[direction]
            offset_x = (cell_width - (xmax - xmin) * scale) / 2 - xmin * scale
            offset_y = (cell_height - border) - ymax * scale
            for column in range(columns):
                # Columns outside the real clip repeat from the beginning. This
                # keeps every cel of the sheet occupied, which is what stopped
                # the old Fetish/Council sheets blinking out mid-walk.
                frame = column % frame_count
                image, box = composite_frame(animation, direction, frame, with_box=True)
                width = max(1, round(image.width * scale))
                height = max(1, round(image.height * scale))
                image = image.resize(
                    (width, height),
                    Image.LANCZOS if scale < 1 else Image.NEAREST,
                )
                left = column * cell_width + round(box[0] * scale + offset_x)
                top = (row_start + direction) * cell_height + round(box[1] * scale + offset_y)
                if (left < column * cell_width or top < (row_start + direction) * cell_height
                        or left + width > (column + 1) * cell_width
                        or top + height > (row_start + direction + 1) * cell_height):
                    raise ValueError(f"{species} {clip_name} frame {column} does not fit its cell")
                sheet.alpha_composite(image, (left, top))

    sheet.save(destination, optimize=True)
    check = Image.open(destination).size
    assert check == existing.size, f"{out_name} changed size {existing.size} -> {check}"
    layer_counts = [len(animation["cof"]["layers"]) for _, animation, _ in clips]
    return (f"{species:16s} {code:3s} {out_name:24s} {check[0]}x{check[1]} cell {cell_width}x{cell_height} "
            f"idle {min(idle_source['frames'], columns)}f walk {min(walk['frames'], columns)}f "
            f"attack {min(attack['frames'], columns) if attack else 0}f "
            f"cof {'/'.join(str(count) for count in layer_counts)} layers")


MEPHISTO_COLUMNS = 18
MEPHISTO_CELL_WIDTH = 307
MEPHISTO_CELL_HEIGHT = 309
MEPHISTO_BORDER = 2
MEPHISTO_BLOCKS = (("nu", 0), ("wl", 8), ("a1", 16))


def find_layer_dc6(monster_dir: Path, code: str, layer: str, mode: str,
                   wclass: str) -> Path | None:
    """Find the DC6 for one COF component, preferring its lit variant.

    Mephisto is one of the classic monsters whose composite layers were never
    converted to DCC in the D2R extraction: `MP/tr`, `MP/ra` and `MP/la` hold
    DC6 clips instead. The COF still records the same layer order as a DCC
    monster, so the only difference is the decoder used for each layer.
    """
    layer_dir = monster_dir / layer
    if not layer_dir.is_dir():
        return None
    prefix = f"{code.lower()}{layer.lower()}"
    suffix = f"{wclass.lower()}.dc6"
    candidates: list[tuple[int, str, Path]] = []
    for path in layer_dir.glob("*.dc6"):
        name = path.name.lower()
        if not name.startswith(prefix) or mode not in name or not name.endswith(suffix):
            continue
        candidates.append((0 if "lit" in name else 1, name, path))
    return sorted(candidates)[0][2] if candidates else None


def load_cof_dc6_animation(monster_dir: Path, code: str, mode: str) -> dict | None:
    """Load one Mephisto COF whose layers are classic DC6 cels."""
    cof_path = monster_dir / "cof" / f"{code.lower()}{mode}hth.cof"
    if not cof_path.is_file():
        return None
    try:
        cof = parse_cof(cof_path)
    except ValueError:
        return None
    layers = {}
    for component, wclass in cof["layers"]:
        if not 0 <= component < len(COMPOSIT_ROWS):
            return None
        path = find_layer_dc6(monster_dir, code, COMPOSIT_ROWS[component], mode, wclass)
        if path is None:
            return None
        try:
            layers[component] = dc6.parse(path.read_bytes())
        except ValueError:
            return None
    if not layers:
        return None
    frames = min([cof["frames"]] + [layer["frames_per_dir"] for layer in layers.values()])
    directions = min([cof["directions"]] + [layer["directions"] for layer in layers.values()])
    return {"cof": cof, "layers": layers, "frames": frames, "directions": directions}


def composite_dc6_frame(animation: dict, direction_index: int, frame_index: int,
                        with_box: bool = False):
    """Flatten one DC6 COF frame in its recorded back-to-front order.

    DC6 stores a cel's top-left as `offsetX/offsetY`, so unlike the DCC path the
    layer boxes can be unioned directly. Index 0 is transparent.
    """
    cof = animation["cof"]
    layers = animation["layers"]
    frame_index = min(frame_index, animation["frames"] - 1)
    layer_count = len(cof["layers"])
    order_start = (direction_index * cof["frames"] + frame_index) * layer_count
    order = cof["order"][order_start:order_start + layer_count]
    boxes = []
    for component in order:
        layer = layers.get(component)
        if layer is not None and direction_index < layer["directions"]:
            frame = layer["frames"][direction_index * layer["frames_per_dir"] + frame_index]
            boxes.append((frame["offsetX"], frame["offsetY"],
                          frame["offsetX"] + frame["width"],
                          frame["offsetY"] + frame["height"]))
    if not boxes:
        empty = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
        return (empty, (0, 0, 1, 1)) if with_box else empty
    xmin = min(box[0] for box in boxes)
    ymin = min(box[1] for box in boxes)
    xmax = max(box[2] for box in boxes)
    ymax = max(box[3] for box in boxes)
    canvas = Image.new("RGBA", (xmax - xmin, ymax - ymin), (0, 0, 0, 0))
    for component in order:
        layer = layers.get(component)
        if layer is None or direction_index >= layer["directions"]:
            continue
        frame = layer["frames"][direction_index * layer["frames_per_dir"] + frame_index]
        image = dc6.frame_image(frame, CURRENT_PALETTE)
        canvas.alpha_composite(image, (frame["offsetX"] - xmin, frame["offsetY"] - ymin))
    return (canvas, (xmin, ymin, xmax - xmin, ymax - ymin)) if with_box else canvas


def build_mephisto(source: Path) -> str:
    """Rebuild Mephisto from the MP idle, walk and attack DC6 composites.

    The old sheet repeated one neutral pose in all thirteen walk columns, so the
    boss slid across the arena without a step cycle. MP keeps three layers
    (torso, right arm, left arm) as lit DC6 cels, not DCCs, so flatten every COF
    frame in its recorded order and keep the existing 18x24 geometry.
    """
    monster_dir = source / "global" / "monsters" / "MP"
    global CURRENT_PALETTE
    previous = CURRENT_PALETTE
    CURRENT_PALETTE = load_units_palette(source / "global" / "palette" / "units" / "pal.dat")
    try:
        animations = {}
        for mode in ("nu", "wl", "a1"):
            animation = load_cof_dc6_animation(monster_dir, "MP", mode)
            if animation is None:
                raise ValueError(f"Mephisto {mode} DC6 COF is incomplete")
            if animation["directions"] < 8:
                raise ValueError(f"Mephisto {mode} COF has {animation['directions']} directions")
            animations[mode] = animation

        # Union every clip per facing. The idle, walk and attack blocks then
        # share one DC6-space origin, so the arms cannot make the body jump from
        # frame to frame. Keep the native 1:1 scale: the source cels already fit
        # the 307x309 runtime cell and enlarging them would change his presence.
        direction_boxes = []
        for direction in range(8):
            boxes = []
            for animation in animations.values():
                for frame in range(animation["frames"]):
                    _, box = composite_dc6_frame(animation, direction, frame, with_box=True)
                    boxes.append((box[0], box[1], box[0] + box[2], box[1] + box[3]))
            direction_boxes.append((
                min(box[0] for box in boxes), min(box[1] for box in boxes),
                max(box[2] for box in boxes), max(box[3] for box in boxes),
            ))

        widest = max(box[2] - box[0] for box in direction_boxes)
        tallest = max(box[3] - box[1] for box in direction_boxes)
        scale = min(
            1.0,
            (MEPHISTO_CELL_WIDTH - MEPHISTO_BORDER * 2) / widest,
            (MEPHISTO_CELL_HEIGHT - MEPHISTO_BORDER * 2) / tallest,
        )

        sheet = Image.new("RGBA", (MEPHISTO_COLUMNS * MEPHISTO_CELL_WIDTH,
                                   24 * MEPHISTO_CELL_HEIGHT), (0, 0, 0, 0))
        for mode, row_start in MEPHISTO_BLOCKS:
            animation = animations[mode]
            frame_count = min(animation["frames"], MEPHISTO_COLUMNS)
            for direction, (xmin, ymin, xmax, ymax) in enumerate(direction_boxes):
                row = row_start + direction
                # Centre each facing horizontally and keep the original top
                # margin. The old sheet anchored its art at y=3, and the runtime
                # draws the cell as a whole, so preserving that anchor keeps his
                # feet at the same screen height.
                offset_x = (MEPHISTO_CELL_WIDTH - (xmax - xmin) * scale) / 2 - xmin * scale
                offset_y = MEPHISTO_BORDER - ymin * scale
                for column in range(MEPHISTO_COLUMNS):
                    image, box = composite_dc6_frame(animation, direction, column % frame_count,
                                                     with_box=True)
                    width = max(1, round(image.width * scale))
                    height = max(1, round(image.height * scale))
                    left = column * MEPHISTO_CELL_WIDTH + round(box[0] * scale + offset_x)
                    top = row * MEPHISTO_CELL_HEIGHT + round(box[1] * scale + offset_y)
                    if (left < column * MEPHISTO_CELL_WIDTH or top < row * MEPHISTO_CELL_HEIGHT
                            or left + width > (column + 1) * MEPHISTO_CELL_WIDTH
                            or top + height > (row + 1) * MEPHISTO_CELL_HEIGHT):
                        raise ValueError(f"Mephisto {mode} frame {column} does not fit its cell")
                    resample = Image.LANCZOS if scale < 1 else Image.NEAREST
                    sheet.alpha_composite(image.resize((width, height), resample), (left, top))

        destination = ASSET_ROOT / "mephisto.png"
        sheet.save(destination, optimize=True)
        return (f"{'mephisto':16s} MP  mephisto.png             {sheet.width}x{sheet.height} "
                f"cell {MEPHISTO_CELL_WIDTH}x{MEPHISTO_CELL_HEIGHT} "
                f"idle {min(animations['nu']['frames'], MEPHISTO_COLUMNS)}f "
                f"walk {min(animations['wl']['frames'], MEPHISTO_COLUMNS)}f "
                f"attack {min(animations['a1']['frames'], MEPHISTO_COLUMNS)}f "
                f"cof {len(animations['wl']['cof']['layers'])} dc6 layers")
    finally:
        CURRENT_PALETTE = previous


DIABLO_COLUMNS = 14
DIABLO_CELL_WIDTH = 192
DIABLO_CELL_HEIGHT = 182
DIABLO_BORDER = 2


def build_diablo(source: Path) -> str:
    """Rebuild Diablo from the full layered walk COF.

    The old sheet was cut from the ``TR`` DCC alone. In Diablo II's composite
    system that file is only the torso, which is why the arena drew a horned
    torso with no arms, legs or tail. The D2R extraction keeps those parts as
    the ``ra``, ``la`` and ``lg`` layers the walk COF lists, so every frame is
    flattened in the COF's recorded back-to-front order instead.

    One shared DCC-space origin keeps the walk from jittering, and the cell is
    the 192x182 size the runtime declares for Diablo.
    """
    monster_dir = source / "global" / "monsters" / "DI"
    global CURRENT_PALETTE
    previous = CURRENT_PALETTE
    CURRENT_PALETTE = load_units_palette(source / "global" / "palette" / "units" / "pal.dat")
    try:
        walk = load_cof_animation(monster_dir, "DI", "wl", "diwlhth.cof")
        if walk is None:
            raise ValueError("DI walk COF is incomplete")
        if walk["directions"] < 8:
            raise ValueError(f"DI walk COF has {walk['directions']} directions")

        frame_count = walk["frames"]
        # Frame boxes are in DCC space; every direction has its own view extents,
        # so union the frames per direction instead of across all eight views.
        direction_boxes = []
        for direction in range(8):
            boxes = []
            for frame in range(frame_count):
                _, box = composite_frame(walk, direction, frame, with_box=True)
                boxes.append((box[0], box[1], box[0] + box[2], box[1] + box[3]))
            direction_boxes.append((
                min(box[0] for box in boxes), min(box[1] for box in boxes),
                max(box[2] for box in boxes), max(box[3] for box in boxes),
            ))
        # One shared scale keeps every facing the same size; the widest view and
        # the tallest view decide how much of the cell the sprite can use.
        widest = max(box[2] - box[0] for box in direction_boxes)
        tallest = max(box[3] - box[1] for box in direction_boxes)
        scale = min(
            (DIABLO_CELL_WIDTH - DIABLO_BORDER * 2) / widest,
            (DIABLO_CELL_HEIGHT - DIABLO_BORDER * 2) / tallest,
        )

        sheet = Image.new("RGBA", (DIABLO_COLUMNS * DIABLO_CELL_WIDTH, 8 * DIABLO_CELL_HEIGHT),
                          (0, 0, 0, 0))
        for direction, (xmin, ymin, xmax, ymax) in enumerate(direction_boxes):
            # Centre each facing horizontally and stand it on the cell's baseline
            # so the walk cycle keeps its feet planted.
            offset_x = (DIABLO_CELL_WIDTH - (xmax - xmin) * scale) / 2 - xmin * scale
            offset_y = (DIABLO_CELL_HEIGHT - DIABLO_BORDER) - ymax * scale
            for column in range(DIABLO_COLUMNS):
                image, box = composite_frame(walk, direction, column % frame_count, with_box=True)
                width = max(1, round(image.width * scale))
                height = max(1, round(image.height * scale))
                left = column * DIABLO_CELL_WIDTH + round(box[0] * scale + offset_x)
                top = direction * DIABLO_CELL_HEIGHT + round(box[1] * scale + offset_y)
                if (left < column * DIABLO_CELL_WIDTH or top < direction * DIABLO_CELL_HEIGHT
                        or left + width > (column + 1) * DIABLO_CELL_WIDTH
                        or top + height > (direction + 1) * DIABLO_CELL_HEIGHT):
                    raise ValueError("Diablo frame does not fit its cell")
                sheet.alpha_composite(image.resize((width, height), Image.LANCZOS), (left, top))

        destination = ASSET_ROOT / "diablo.png"
        sheet.save(destination, optimize=True)
        return (f"{'diablo':16s} DI  diablo.png               {sheet.width}x{sheet.height} "
                f"cell {DIABLO_CELL_WIDTH}x{DIABLO_CELL_HEIGHT} walk {frame_count}f "
                f"cof {len(walk['cof']['layers'])} layers")
    finally:
        CURRENT_PALETTE = previous


BAAL_COLUMNS = 14
BAAL_CELL_WIDTH = 184
BAAL_CELL_HEIGHT = 179
BAAL_BORDER = 2
BAAL_FRAME_COUNTS = {"nu": 12, "wl": 12, "a1": 14}
BAAL_BLOCKS = (("nu", 0), ("wl", 8), ("a1", 16))


def build_baal(source: Path) -> str:
    """Rebuild Baal from his layered idle, walk and attack COFs.

    The old sheet was decoded from ``42TR...dcc`` alone. In the composite
    system that file is only the torso, so the arena drew a floating blue body
    with detached limbs and no bone crown. His COFs list six layers - torso,
    head, legs, both arms and an overlay - so flatten them in the recorded
    back-to-front order with one shared scale and one DCC-space origin per
    facing to keep the walk planted and jitter-free.
    """
    monster_dir = source / "global" / "monsters" / "42"
    global CURRENT_PALETTE
    previous = CURRENT_PALETTE
    CURRENT_PALETTE = load_units_palette(source / "global" / "palette" / "units" / "pal.dat")
    try:
        animations = {}
        for mode in ("nu", "wl", "a1"):
            animation = load_cof_animation(monster_dir, "42", mode)
            if animation is None:
                raise ValueError(f"Baal {mode} COF is incomplete")
            if animation["directions"] < 8:
                raise ValueError(f"Baal {mode} COF has {animation['directions']} directions")
            animations[mode] = animation

        # Frame boxes are in DCC space; union each facing across idle, walk and
        # attack so the three blocks share one origin.
        direction_boxes = []
        for direction in range(8):
            boxes = []
            for mode, count in BAAL_FRAME_COUNTS.items():
                animation = animations[mode]
                for frame in range(min(count, animation["frames"])):
                    _, box = composite_frame(animation, direction, frame, with_box=True)
                    boxes.append((box[0], box[1], box[0] + box[2], box[1] + box[3]))
            direction_boxes.append((
                min(box[0] for box in boxes), min(box[1] for box in boxes),
                max(box[2] for box in boxes), max(box[3] for box in boxes),
            ))
        # One shared scale keeps every facing the same size; the widest view and
        # the tallest view decide how much of the cell the sprite can use.
        widest = max(box[2] - box[0] for box in direction_boxes)
        tallest = max(box[3] - box[1] for box in direction_boxes)
        scale = min(
            (BAAL_CELL_WIDTH - BAAL_BORDER * 2) / widest,
            (BAAL_CELL_HEIGHT - BAAL_BORDER * 2) / tallest,
        )

        sheet = Image.new("RGBA", (BAAL_COLUMNS * BAAL_CELL_WIDTH, 24 * BAAL_CELL_HEIGHT),
                          (0, 0, 0, 0))
        for mode, row_start in BAAL_BLOCKS:
            animation = animations[mode]
            frame_count = min(BAAL_FRAME_COUNTS[mode], animation["frames"], BAAL_COLUMNS)
            for direction, (xmin, ymin, xmax, ymax) in enumerate(direction_boxes):
                row = row_start + direction
                # Centre each facing horizontally and stand it on the cell's
                # baseline so the walk cycle keeps its feet planted.
                offset_x = (BAAL_CELL_WIDTH - (xmax - xmin) * scale) / 2 - xmin * scale
                offset_y = (BAAL_CELL_HEIGHT - BAAL_BORDER) - ymax * scale
                for column in range(frame_count):
                    image, box = composite_frame(animation, direction, column, with_box=True)
                    width = max(1, round(image.width * scale))
                    height = max(1, round(image.height * scale))
                    left = column * BAAL_CELL_WIDTH + round(box[0] * scale + offset_x)
                    top = row * BAAL_CELL_HEIGHT + round(box[1] * scale + offset_y)
                    if (left < column * BAAL_CELL_WIDTH or top < row * BAAL_CELL_HEIGHT
                            or left + width > (column + 1) * BAAL_CELL_WIDTH
                            or top + height > (row + 1) * BAAL_CELL_HEIGHT):
                        raise ValueError(f"Baal {mode} frame {column} does not fit its cell")
                    sheet.alpha_composite(image.resize((width, height), Image.LANCZOS), (left, top))

        destination = ASSET_ROOT / "baal.png"
        sheet.save(destination, optimize=True)
        return (f"{'baal':16s} 42  baal.png                {sheet.width}x{sheet.height} "
                f"cell {BAAL_CELL_WIDTH}x{BAAL_CELL_HEIGHT} "
                f"idle {BAAL_FRAME_COUNTS['nu']}f walk {BAAL_FRAME_COUNTS['wl']}f "
                f"attack {BAAL_FRAME_COUNTS['a1']}f "
                f"cof {len(animations['wl']['cof']['layers'])} layers")
    finally:
        CURRENT_PALETTE = previous


DURIEL_COLUMNS = 16
DURIEL_CELL_WIDTH = 256
DURIEL_CELL_HEIGHT = 240
DURIEL_BORDER = 4
DURIEL_FRAME_COUNTS = {"wl": 16, "a1": 10}
DURIEL_BLOCKS = (("wl", 0), ("a1", 8))


def build_duriel(source: Path) -> str:
    """Rebuild Duriel from his layered walk and attack COFs.

    The old six-frame sheet was not Duriel at all. His DU COFs keep the
    four-layer creature - torso, both scythe arms and the pale abdomen - so
    flatten every frame in the recorded back-to-front order. The walk has
    sixteen frames and the attack ten, giving the arena the real eight-direction
    boss animation instead of a generic six-frame strip.
    """
    monster_dir = source / "global" / "monsters" / "DU"
    global CURRENT_PALETTE
    previous = CURRENT_PALETTE
    CURRENT_PALETTE = load_units_palette(source / "global" / "palette" / "units" / "pal.dat")
    try:
        animations = {}
        for mode in ("wl", "a1"):
            animation = load_cof_animation(monster_dir, "DU", mode)
            if animation is None:
                raise ValueError(f"Duriel {mode} COF is incomplete")
            if animation["directions"] < 8:
                raise ValueError(f"Duriel {mode} COF has {animation['directions']} directions")
            animations[mode] = animation

        # Frame boxes are in DCC space; union each facing across walk and attack
        # so both blocks share one origin and the boss does not jump on a swing.
        direction_boxes = []
        for direction in range(8):
            boxes = []
            for mode, count in DURIEL_FRAME_COUNTS.items():
                animation = animations[mode]
                for frame in range(min(count, animation["frames"])):
                    _, box = composite_frame(animation, direction, frame, with_box=True)
                    boxes.append((box[0], box[1], box[0] + box[2], box[1] + box[3]))
            direction_boxes.append((
                min(box[0] for box in boxes), min(box[1] for box in boxes),
                max(box[2] for box in boxes), max(box[3] for box in boxes),
            ))

        widest = max(box[2] - box[0] for box in direction_boxes)
        tallest = max(box[3] - box[1] for box in direction_boxes)
        scale = min(
            (DURIEL_CELL_WIDTH - DURIEL_BORDER * 2) / widest,
            (DURIEL_CELL_HEIGHT - DURIEL_BORDER * 2) / tallest,
        )

        sheet = Image.new("RGBA", (DURIEL_COLUMNS * DURIEL_CELL_WIDTH,
                                   16 * DURIEL_CELL_HEIGHT), (0, 0, 0, 0))
        for mode, row_start in DURIEL_BLOCKS:
            animation = animations[mode]
            frame_count = min(DURIEL_FRAME_COUNTS[mode], animation["frames"], DURIEL_COLUMNS)
            for direction, (xmin, ymin, xmax, ymax) in enumerate(direction_boxes):
                row = row_start + direction
                # Centre each facing horizontally and stand it on the cell's
                # baseline so the walk cycle keeps its feet planted.
                offset_x = (DURIEL_CELL_WIDTH - (xmax - xmin) * scale) / 2 - xmin * scale
                offset_y = (DURIEL_CELL_HEIGHT - DURIEL_BORDER) - ymax * scale
                for column in range(frame_count):
                    image, box = composite_frame(animation, direction, column, with_box=True)
                    width = max(1, round(image.width * scale))
                    height = max(1, round(image.height * scale))
                    left = column * DURIEL_CELL_WIDTH + round(box[0] * scale + offset_x)
                    top = row * DURIEL_CELL_HEIGHT + round(box[1] * scale + offset_y)
                    if (left < column * DURIEL_CELL_WIDTH or top < row * DURIEL_CELL_HEIGHT
                            or left + width > (column + 1) * DURIEL_CELL_WIDTH
                            or top + height > (row + 1) * DURIEL_CELL_HEIGHT):
                        raise ValueError(f"Duriel {mode} frame {column} does not fit its cell")
                    sheet.alpha_composite(image.resize((width, height), Image.LANCZOS), (left, top))

        destination = ASSET_ROOT / "duriel.png"
        sheet.save(destination, optimize=True)
        return (f"{'duriel':16s} DU  duriel.png               {sheet.width}x{sheet.height} "
                f"cell {DURIEL_CELL_WIDTH}x{DURIEL_CELL_HEIGHT} "
                f"walk {DURIEL_FRAME_COUNTS['wl']}f attack {DURIEL_FRAME_COUNTS['a1']}f "
                f"cof {len(animations['wl']['cof']['layers'])} layers")
    finally:
        CURRENT_PALETTE = previous


SAND_MAGGOT_COLUMNS = 18
SAND_MAGGOT_CELL = 120
SAND_MAGGOT_BLOCKS = (("wl", 8, 0), ("a1", 18, 8), ("a2", 10, 16), ("s1", 12, 24))


def build_sand_maggot(source: Path) -> str:
    """Rebuild the Sand Maggot with its bite, poison spit and burrow bands.

    The old sheet held only the walk and ``a1`` bite, so the arena had no
    original art for either the goo spit or the ``s1`` burrow.  Diablo II keeps
    those as separate COF/DCC animations; stack all four sequences into one
    thirty-two-row atlas so the runtime can select a block without swapping
    images.  ``s1`` is a layered COF (body plus the dirt spray), so it is
    flattened the same way as the boss composites above.
    """
    monster_dir = source / "global" / "monsters" / "sm"
    global CURRENT_PALETTE
    previous = CURRENT_PALETTE
    CURRENT_PALETTE = dcc.load_palette(source / "global" / "palette" / "units" / "pal.dat")
    try:
        animations = {
            "wl": dcc.parse((monster_dir / "tr" / "smtrlitwlhth.dcc").read_bytes()),
            "a1": dcc.parse((monster_dir / "tr" / "smtrlita1hth.dcc").read_bytes()),
            "a2": dcc.parse((monster_dir / "tr" / "smtrlita2hth.dcc").read_bytes()),
            "s1": load_cof_animation(monster_dir, "SM", "s1"),
        }
        if animations["s1"] is None:
            raise ValueError("SM burrow COF is incomplete")

        sheet = Image.new(
            "RGBA",
            (SAND_MAGGOT_COLUMNS * SAND_MAGGOT_CELL, 32 * SAND_MAGGOT_CELL),
            (0, 0, 0, 0),
        )

        def paste(image: Image.Image, column: int, row: int) -> None:
            scaled = fit_into(image, SAND_MAGGOT_CELL, SAND_MAGGOT_CELL)
            left = column * SAND_MAGGOT_CELL + (SAND_MAGGOT_CELL - scaled.width) // 2
            top = row * SAND_MAGGOT_CELL + (SAND_MAGGOT_CELL - scaled.height) // 2
            sheet.alpha_composite(scaled, (left, top))

        frame_counts = {}
        for mode, frame_count, row_start in SAND_MAGGOT_BLOCKS:
            animation = animations[mode]
            directions = min(8, animation["directions"])
            frames = min(frame_count, animation["frames"] if mode == "s1" else animation["frames_per_dir"])
            frame_counts[mode] = frames
            for direction in range(directions):
                for frame in range(frames):
                    cel = (composite_frame(animation, direction, frame)
                           if mode == "s1" else frame_crop(animation, direction, frame))
                    paste(cel, frame, row_start + direction)

        destination = ASSET_ROOT / "maggot.png"
        sheet.save(destination, optimize=True)
        return (f"{'sandMaggot':16s} SM  maggot.png              {sheet.width}x{sheet.height} "
                f"cell {SAND_MAGGOT_CELL}x{SAND_MAGGOT_CELL} "
                f"walk {frame_counts['wl']}f bite {frame_counts['a1']}f "
                f"spit {frame_counts['a2']}f burrow {frame_counts['s1']}f")
    finally:
        CURRENT_PALETTE = previous


def build_maggot_egg(source: Path) -> str:
    """Build the Sand Maggot Egg atlas from the original ``eg`` composite.

    ``egnuhth`` is the egg's neutral ten-frame pulse, flattened from the torso
    and the glowing membrane layer.  Eight direction rows are kept even though
    the egg is symmetric, matching every other enemy sheet in the arena.
    """
    egg_dir = source / "global" / "monsters" / "eg"
    global CURRENT_PALETTE
    previous = CURRENT_PALETTE
    CURRENT_PALETTE = dcc.load_palette(source / "global" / "palette" / "units" / "pal.dat")
    try:
        animation = load_cof_animation(egg_dir, "eg", "nu", "egnuhth.cof")
        if animation is None:
            raise ValueError("EG neutral COF is incomplete")
        columns = 12
        cell = 120
        frames = min(10, animation["frames"], columns)
        sheet = Image.new("RGBA", (columns * cell, 8 * cell), (0, 0, 0, 0))
        for direction in range(min(8, animation["directions"])):
            for frame in range(frames):
                image = composite_frame(animation, direction, frame)
                scaled = fit_into(image, cell, cell)
                left = frame * cell + (cell - scaled.width) // 2
                top = direction * cell + (cell - scaled.height) // 2
                sheet.alpha_composite(scaled, (left, top))
        destination = ASSET_ROOT / "maggot-egg.png"
        sheet.save(destination, optimize=True)
        return (f"{'maggotEgg':16s} EG  maggot-egg.png          {sheet.width}x{sheet.height} "
                f"cell {cell}x{cell} neutral {frames}f")
    finally:
        CURRENT_PALETTE = previous

SKELETON_WALK_COF = "skwl1hs.cof"
SKELETON_ATTACK_COF = "ska11hs.cof"
SKELETON_SCALE = 1
SKELETON_BORDER = 4


def build_skeleton_warrior(source: Path) -> str:
    """Rebuild the melee skeleton from D2R's full SK COF composite.

    `skeleton-warrior.png` serves both the Act I skeleton enemy and the
    necromancer's Raise Skeleton summon. The old sheet came from a magenta-matte
    JPEG rip with only eight walk frames in a sixteen-column atlas. Using only
    the `tr` DCC is not enough either: that is the torso layer, so the runtime
    drew a headless, limbless blob. Load the walk and 1hs attack COFs, composite
    all ten layers (head, torso, legs, arms, weapon and buckler), and use one
    fixed scale and one shared DCC-space origin for both animations.
    """
    monster_dir = source / "global" / "monsters" / "SK"
    global CURRENT_PALETTE
    previous = CURRENT_PALETTE
    CURRENT_PALETTE = load_units_palette(source / "global" / "palette" / "units" / "pal.dat")
    try:
        walk = load_cof_animation(monster_dir, "SK", "wl", SKELETON_WALK_COF)
        attack = load_cof_animation(monster_dir, "SK", "a1", SKELETON_ATTACK_COF)
        if walk is None or attack is None:
            raise ValueError("SK walk/attack COF is incomplete")
        if walk["directions"] < 8 or attack["directions"] < 8:
            raise ValueError("SK walk/attack does not have eight directions")

        records = []
        boxes = []
        frame_counts = []
        for block, animation in enumerate((walk, attack)):
            frames = min(16, animation["frames"])
            frame_counts.append(frames)
            for direction_index in range(8):
                for frame_index in range(frames):
                    image, box = composite_frame(animation, direction_index, frame_index, with_box=True)
                    records.append((block, direction_index, frame_index, image, box))
                    boxes.append((box[0], box[1], box[0] + box[2], box[1] + box[3]))

        xmin = min(box[0] for box in boxes)
        ymin = min(box[1] for box in boxes)
        xmax = max(box[2] for box in boxes)
        ymax = max(box[3] for box in boxes)
        cell_width = (xmax - xmin) * SKELETON_SCALE + SKELETON_BORDER * 2
        cell_height = (ymax - ymin) * SKELETON_SCALE + SKELETON_BORDER * 2
        sheet = Image.new("RGBA", (16 * cell_width, 16 * cell_height), (0, 0, 0, 0))
        for block, direction_index, frame_index, image, box in records:
            if SKELETON_SCALE != 1:
                image = image.resize((image.width * SKELETON_SCALE, image.height * SKELETON_SCALE),
                                     Image.NEAREST)
            left = (box[0] - xmin) * SKELETON_SCALE + SKELETON_BORDER
            top = (box[1] - ymin) * SKELETON_SCALE + SKELETON_BORDER
            if left < 0 or top < 0 or left + image.width > cell_width or top + image.height > cell_height:
                raise ValueError(f"skeleton frame outside {cell_width}x{cell_height} cell")
            sheet.alpha_composite(image, (frame_index * cell_width + left,
                                          (block * 8 + direction_index) * cell_height + top))
        destination = ASSET_ROOT / "skeleton-warrior.png"
        sheet.save(destination)
        return (f"skeletonWarrior  SK  skeleton-warrior.png  {sheet.width}x{sheet.height} "
                f"cell {cell_width}x{cell_height} walk {frame_counts[0]}f attack {frame_counts[1]}f "
                f"cof 10/10 layers")
    finally:
        CURRENT_PALETTE = previous


SKELETAL_MAGE_COLUMNS = 16
SKELETAL_MAGE_SCALE = 1
SKELETAL_MAGE_BORDER = 4
SKELETAL_MAGE_ELEMENTS = {
    "cold": ("cld", "skeletal-mage-cold.png"),
    "fire": ("fir", "skeletal-mage-fire.png"),
    "lightning": ("lht", "skeletal-mage-lightning.png"),
    "poison": ("pos", "skeletal-mage-poison.png"),
}


def build_skeletal_mages(source: Path) -> list[str]:
    """Build the four elemental skeletal mage atlases from the SK COF composite.

    The mage shares the skeleton body with the warrior, but its s4/s5 layers are
    the colored spell energy that makes it read as a caster. Those layers exist
    in four palette variants, so build one complete walk/attack atlas per
    element instead of recoloring a single sheet at runtime.
    """
    monster_dir = source / "global" / "monsters" / "SK"
    global CURRENT_PALETTE
    previous = CURRENT_PALETTE
    CURRENT_PALETTE = load_units_palette(source / "global" / "palette" / "units" / "pal.dat")
    try:
        records: dict[str, list[tuple[int, int, int, Image.Image, tuple[int, int, int, int]]]] = {}
        boxes: list[tuple[int, int, int, int]] = []
        frame_counts: dict[str, tuple[int, int]] = {}
        for element, (code, _) in SKELETAL_MAGE_ELEMENTS.items():
            walk = load_cof_animation(monster_dir, "SK", "wl", "skwlhth.cof", code)
            attack = load_cof_animation(monster_dir, "SK", "a1", "ska1hth.cof", code)
            if walk is None or attack is None:
                raise ValueError(f"SK {element} walk/attack COF is incomplete")
            element_records = []
            counts = []
            for block, animation in enumerate((walk, attack)):
                frames = min(SKELETAL_MAGE_COLUMNS, animation["frames"])
                counts.append(frames)
                for direction_index in range(8):
                    for frame_index in range(frames):
                        image, box = composite_frame(animation, direction_index, frame_index, with_box=True)
                        element_records.append((block, direction_index, frame_index, image, box))
                        boxes.append((box[0], box[1], box[0] + box[2], box[1] + box[3]))
            records[element] = element_records
            frame_counts[element] = (counts[0], counts[1])

        xmin = min(box[0] for box in boxes)
        ymin = min(box[1] for box in boxes)
        xmax = max(box[2] for box in boxes)
        ymax = max(box[3] for box in boxes)
        cell_width = (xmax - xmin) * SKELETAL_MAGE_SCALE + SKELETAL_MAGE_BORDER * 2
        cell_height = (ymax - ymin) * SKELETAL_MAGE_SCALE + SKELETAL_MAGE_BORDER * 2
        messages = []
        for element, (_, out_name) in SKELETAL_MAGE_ELEMENTS.items():
            sheet = Image.new("RGBA", (SKELETAL_MAGE_COLUMNS * cell_width, 16 * cell_height), (0, 0, 0, 0))
            for block, direction_index, frame_index, image, box in records[element]:
                if SKELETAL_MAGE_SCALE != 1:
                    image = image.resize((image.width * SKELETAL_MAGE_SCALE,
                                          image.height * SKELETAL_MAGE_SCALE), Image.NEAREST)
                left = (box[0] - xmin) * SKELETAL_MAGE_SCALE + SKELETAL_MAGE_BORDER
                top = (box[1] - ymin) * SKELETAL_MAGE_SCALE + SKELETAL_MAGE_BORDER
                if left < 0 or top < 0 or left + image.width > cell_width or top + image.height > cell_height:
                    raise ValueError(f"skeletal mage {element} frame outside {cell_width}x{cell_height} cell")
                sheet.alpha_composite(image, (frame_index * cell_width + left,
                                              (block * 8 + direction_index) * cell_height + top))
            destination = ASSET_ROOT / out_name
            sheet.save(destination, optimize=True)
            messages.append(
                f"skeletalMage{element.capitalize():8s} SK  {out_name:28s} {sheet.width}x{sheet.height} "
                f"cell {cell_width}x{cell_height} walk {frame_counts[element][0]}f attack {frame_counts[element][1]}f"
            )
        return messages
    finally:
        CURRENT_PALETTE = previous


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--only", nargs="*", default=None)
    parser.add_argument("--new", action="store_true",
                        help="build the fresh sixteen-row atlases instead of rebuilding")
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--mage", action="store_true",
                        help="build the four elemental skeletal mage atlases")
    parser.add_argument("--maggot", action="store_true",
                        help="build the Sand Maggot walk/bite/spit/burrow atlas and egg atlas")
    args = parser.parse_args(argv)

    if args.list:
        for species in sorted(SPECIES):
            print(species, SPECIES[species][0])
        for species in sorted(NEW_SPECIES):
            print(species, NEW_SPECIES[species][0], "new atlas")
        for element, (_, out_name) in SKELETAL_MAGE_ELEMENTS.items():
            print(f"skeletalMage{element.capitalize()}", "SK", out_name, "mage atlas")
        return 0

    if args.mage:
        messages = build_skeletal_mages(args.source)
        for message in messages:
            print(message)
        print(f"built {len(messages)}/4 skeletal mage atlases")
        return 0

    if args.maggot:
        messages = [build_sand_maggot(args.source), build_maggot_egg(args.source)]
        for message in messages:
            print(message)
        print(f"built {len(messages)}/2 sand maggot atlases")
        return 0

    global CURRENT_PALETTE
    palette_path = args.source / "global" / "palette" / "units" / "pal.dat"
    legacy_palette = dcc.load_palette(palette_path)
    CURRENT_PALETTE = legacy_palette
    if args.new:
        wanted = sorted(NEW_SPECIES) if not args.only else [name for name in args.only if name in NEW_SPECIES]
        failures = 0
        for species in wanted:
            message = (build_composite_species(args.source, species)
                       if species in COF_SPECIES else build_new_species(args.source, species))
            print(message)
            if message.startswith("skip"):
                failures += 1
        print(f"built {len(wanted) - failures}/{len(wanted)} new atlases")
        return 1 if failures else 0
    wanted = sorted(SPECIES) if not args.only else [name for name in args.only if name in SPECIES]
    failures = 0
    units_palette = load_units_palette(palette_path)
    for species in wanted:
        CURRENT_PALETTE = units_palette if species in BGR_FIXED_SPECIES else legacy_palette
        if species == "sandMaggot":
            message = build_sand_maggot(args.source)
        elif species == "skeletonWarrior":
            message = build_skeleton_warrior(args.source)
        elif species == "diablo":
            message = build_diablo(args.source)
        elif species == "baal":
            message = build_baal(args.source)
        elif species == "duriel":
            message = build_duriel(args.source)
        elif species == "mephisto":
            message = build_mephisto(args.source)
        elif species in COF_SPECIES:
            message = build_composite_rebuild(args.source, species)
        else:
            message = build_species(args.source, species)
        print(message)
        if message.startswith("skip"):
            failures += 1
    print(f"rebuilt {len(wanted) - failures}/{len(wanted)} atlases")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
