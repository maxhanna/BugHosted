"""Build the Diablo II summon and pet atlases from the D2R extraction.

The necromancer golems, the druid's wolf, bear and spirits and their D2
animation names live in `Desktop/d2/d2r extract/data/global/monsters`, so each
summon can stop borrowing an unrelated monster sheet:

    G1 clay golem (already on `golem.png`), G2 blood, G3 fire, G4 iron
    WF fenris (Spirit Wolf, Dire Wolf), B7 druid bear (Grizzly)
    XW Oak Sage, X3 Heart of Wolverine, X4 Spirit of Barbs

Two layouts are produced, matching `enemySpriteDirectionRow`:

* `walk_attack` - sixteen rows: eight walk directions above eight attack rows,
* `walk_only`   - eight rows, one per direction, for the stationary spirits.
  Their DCCs only ship front, left, back and right, so the four diagonals are
  turned from the neighbouring cardinals (see `WALK_ONLY_ROWS`).

Usage:
    python tools/import_d2r_summon_atlases.py
    python tools/import_d2r_summon_atlases.py --only wolf grizzly
    python tools/import_d2r_summon_atlases.py --list
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageFilter

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

# Eight-row spirit layout, in the game's own direction order:
#   0 left, 1 up-left, 2 up, 3 up-right, 4 right, 5 down-right, 6 down, 7 down-left
# Each entry is (vertical view, side view).  The D2 spirits only ship four
# directions (0 front, 1 left, 2 back, 3 right), so a diagonal is composed from
# the vertical view of that direction plus the side view it leans towards: the
# pair is squeezed horizontally, which reads as a three-quarter turn instead of
# snapping back to the front or back row.
WALK_ONLY_ROWS: tuple[tuple[int, int | None], ...] = (
    (1, None),  # left
    (2, 1),     # up-left
    (2, None),  # up
    (2, 3),     # up-right
    (3, None),  # right
    (0, 3),     # down-right
    (0, None),  # down
    (0, 1),     # down-left
)
# How far a diagonal's side view is squeezed before it joins the turn, and how
# much of it is laid over the vertical view.  A lighter overlay keeps the orb
# crisp; at full opacity the two views read as a double exposure.
WALK_ONLY_TURN_SQUEEZE = 0.8
WALK_ONLY_TURN_WEIGHT = 0.6

# The assassin's two doubles have no usable legacy art in this extraction: the
# `k9` (Shadow Warrior / Shadow Master) monster cels are 1x1 placeholders and
# D2R only ships the minions as HD models. D2 renders both shadows from the
# assassin's own body, so the sheets composite her light-armour player layers
# (torso, legs, arms, head) and grade the result into a shadow. Rows keep the
# source DCC direction order, like every other monster atlas.
# species -> (character code, output file, rim light colour)
SHADOWS: dict[str, tuple[str, str, str]] = {
    "shadowWarrior": ("ai", "shadow-warrior.png", "#7fd8ff"),
    "shadowMaster": ("ai", "shadow-master.png", "#c39bff"),
}
# Player layers composited bottom-up, in (folder, DCC name prefix) order.
SHADOW_LAYERS: tuple[tuple[str, str], ...] = (
    ("tr", "trlit"), ("lg", "lglit"), ("la", "lalit"), ("ra", "ralit"), ("hd", "hdbhm"),
)
# The picked-up cels are small player art, so bake them at double size; the
# columns cover the twelve-frame A2 attack while the eight-frame walk leaves the
# tail empty, which `ENEMY_ROW_BLOCK_FRAMES` in the game already accounts for.
SHADOW_COLUMNS = 12
SHADOW_SCALE = 2

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


def turn_view(vertical: Image.Image, side: Image.Image) -> Image.Image:
    """Compose a three-quarter view from a vertical and a side cardinal.

    The side view is squeezed, faded and laid over the vertical one, so the
    diagonal frame carries both the facing of the vertical view and the profile
    edge of the side view.  The spirit art is soft glowing wisps, so the two
    layers read as one turned shape rather than a double image.
    """
    turned = vertical.copy()
    squeezed = side.resize((max(1, round(side.width * WALK_ONLY_TURN_SQUEEZE)), side.height),
                           Image.LANCZOS)
    squeezed.putalpha(squeezed.getchannel("A").point(lambda value: round(value * WALK_ONLY_TURN_WEIGHT)))
    turned.alpha_composite(squeezed, ((turned.width - squeezed.width) // 2, 0))
    return turned


def shadow_grade(image: Image.Image, rim: str) -> Image.Image:
    """Bake a shadow silhouette: dark violet body under a glowing rim.

    The living assassin's cels are her normal reds and greys; a shadow minion in
    D2 is the same model rendered as a dark, translucent afterimage. The body is
    graded down to a violet near-black that keeps the pose readable, and the
    border pixels that touch transparency take the species' rim light so the
    figure still separates from a dark arena floor.
    """
    pixels = image.load()
    alpha = image.getchannel("A")
    # Erode the coverage mask so the rim lands on the outer shell of the figure
    # rather than only on pixels with a fully transparent neighbour, which the
    # soft player cels almost never have.
    interior = alpha.filter(ImageFilter.MinFilter(3)).load()
    coverage = alpha.load()
    width, height = image.size
    rim_colour = tuple(int(rim[index:index + 2], 16) for index in (1, 3, 5))
    for y in range(height):
        for x in range(width):
            visible = coverage[x, y]
            if visible == 0:
                continue
            red, green, blue = pixels[x, y][:3]
            luma = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
            # A violet afterimage: dark enough to read as a shadow, bright enough
            # that the hood, sash and claws still separate from one another.
            body = (int(30 + 86 * luma), int(20 + 60 * luma), int(56 + 120 * luma))
            if interior[x, y] < 40:
                body = tuple(int(body[channel] * 0.2 + rim_colour[channel] * 0.8) for channel in range(3))
            pixels[x, y] = (*body, min(visible, 235))
    return image


def composite_player_frame(layers: list[dict], direction: int, frame_index: int) -> Image.Image:
    """Stack the assassin's body layers for one direction and frame.

    Every layer's cel carries its own position in the shared D2 unit space, so
    the parts line up when each one is drawn at its own `xmin`/`ymin` offset.
    """
    canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    for animation in layers:
        direction_data = animation["dirs"][direction]
        frame = direction_data["frames"][frame_index]
        image = dcc.frame_image(direction_data["bitmaps"][frame_index], frame["width"], frame["height"], PALETTE)
        canvas.alpha_composite(image, (frame["xmin"] + 256, frame["ymin"] + 256))
    return canvas


def build_shadow(source: Path, species: str) -> str:
    code, out_name, rim = SHADOWS[species]
    character_dir = source / "global" / "chars" / code

    def load(folder: str, prefix: str, sequence: str) -> dict:
        path = character_dir / folder / f"ai{prefix}{sequence}.dcc"
        if not path.exists():
            raise FileNotFoundError(path)
        return dcc.parse(path.read_bytes())

    try:
        walk_layers = [load(folder, prefix, "wlhth") for folder, prefix in SHADOW_LAYERS]
        # MonStats gives both shadows the A2 attack, which is the assassin's
        # unarmed strike rather than the claw swing.
        attack_layers = [load(folder, prefix, "a2hth") for folder, prefix in SHADOW_LAYERS]
    except FileNotFoundError as error:
        return f"skip {species}: {error.filename} is missing"

    directions = min(8, *(animation["directions"] for animation in walk_layers + attack_layers))
    walk_frames = min(animation["frames_per_dir"] for animation in walk_layers)
    attack_frames = min(animation["frames_per_dir"] for animation in attack_layers)
    if not directions or not walk_frames or not attack_frames:
        return f"skip {species}: the assassin layers carry an empty animation"
    columns = max(SHADOW_COLUMNS, walk_frames, attack_frames)

    # One crop window for the whole sheet keeps the figure from jittering between
    # cels: the union of every composited frame the two clips use.
    frames: dict[str, list[list[Image.Image]]] = {}
    union: tuple[int, int, int, int] | None = None
    for name, layers, counts in (("walk", walk_layers, walk_frames), ("attack", attack_layers, attack_frames)):
        clip: list[list[Image.Image]] = []
        for direction in range(directions):
            row = []
            for frame_index in range(counts):
                image = composite_player_frame(layers, direction, frame_index)
                bounds = image.getbbox()
                if bounds:
                    union = bounds if union is None else (
                        min(union[0], bounds[0]), min(union[1], bounds[1]),
                        max(union[2], bounds[2]), max(union[3], bounds[3]))
                row.append(image)
            clip.append(row)
        frames[name] = clip
    if union is None:
        return f"skip {species}: the composited layers are empty"

    box_w, box_h = union[2] - union[0], union[3] - union[1]
    cell_width, cell_height = box_w * SHADOW_SCALE + 8, box_h * SHADOW_SCALE + 8
    sheet = Image.new("RGBA", (columns * cell_width, 16 * cell_height), (0, 0, 0, 0))

    def paste(image: Image.Image, column: int, row: int) -> None:
        cel = image.crop(union)
        cel = cel.resize((cel.width * SHADOW_SCALE, cel.height * SHADOW_SCALE), Image.LANCZOS)
        sheet.alpha_composite(cel, (column * cell_width + (cell_width - cel.width) // 2,
                                    row * cell_height + (cell_height - cel.height) // 2))

    for direction in range(directions):
        for frame_index in range(walk_frames):
            paste(frames["walk"][direction][frame_index], frame_index, direction)
        for frame_index in range(attack_frames):
            paste(frames["attack"][direction][frame_index], frame_index, 8 + direction)

    sheet = shadow_grade(sheet, rim)
    destination = ASSET_ROOT / out_name
    sheet.save(destination)
    return (f"{species:16s} {code:3s} {out_name:24s} {sheet.width}x{sheet.height} "
            f"cell {cell_width}x{cell_height} rows 16 walk {walk_frames}f attack {attack_frames}f")


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
    rows = 16 if mode == "walk_attack" else len(WALK_ONLY_ROWS)
    # Only the stationary druid spirits are painted on an opaque dark disk. The
    # golem/wolf/bear DCCs already carry real transparency, and keying their dark
    # body pixels punches holes through the creature.
    clear_matte = mode == "walk_only"
    sheet = Image.new("RGBA", (columns * cell_width, rows * cell_height), (0, 0, 0, 0))

    def paste(image: Image.Image, column: int, row: int) -> None:
        scaled = fit_into(image, cell_width, cell_height)
        sheet.alpha_composite(scaled, (column * cell_width + (cell_width - scaled.width) // 2,
                                       row * cell_height + (cell_height - scaled.height) // 2))

    walk_frames = min(walk["frames_per_dir"], columns)
    if mode == "walk_attack":
        for direction in range(directions):
            for frame in range(walk_frames):
                paste(frame_crop(walk, direction, frame, clear_matte=clear_matte), frame, direction)
    else:
        for row, (vertical, side) in enumerate(WALK_ONLY_ROWS):
            for frame in range(walk_frames):
                image = frame_crop(walk, vertical, frame, clear_matte=True)
                if side is not None:
                    image = turn_view(image, frame_crop(walk, side, frame, clear_matte=True))
                paste(image, frame, row)

    attack_frames = 0
    if mode == "walk_attack" and attack is not None:
        attack_frames = min(attack["frames_per_dir"], columns)
        for direction in range(min(directions, attack["directions"])):
            for frame in range(attack_frames):
                paste(frame_crop(attack, direction, frame, clear_matte=clear_matte), frame, 8 + direction)

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
        for species in sorted(SHADOWS):
            print(species, SHADOWS[species][0], "player shadow")
        return 0

    global PALETTE
    # `units/pal.dat` stores BGR triples; leaving them unswapped turns the red
    # Blood Golem blue and only the runtime filter hides the mistake.
    PALETTE = [(red, green, blue) for blue, green, red in
               dcc.load_palette(args.source / "global" / "palette" / "units" / "pal.dat")]
    if args.sentry:
        print(build_sentry(args.source))
        return 0
    names = sorted(SPECIES) + sorted(SHADOWS)
    wanted = names if not args.only else [name for name in args.only if name in names]
    failures = 0
    for species in wanted:
        message = build_shadow(args.source, species) if species in SHADOWS else build(args.source, species)
        print(message)
        if message.startswith("skip"):
            failures += 1
    print(f"built {len(wanted) - failures}/{len(wanted)} summon atlases")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
