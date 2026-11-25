"""Build the druid vine summon sheet from the original Diablo II vine art.

The three corpse vines (Poison Creeper, Carrion Vine, Solar Creeper) do not own
a monster animation: in Diablo II the ``vinecreature`` monster (token ``k9``) is
an invisible driver whose every cel is a 1x1 placeholder, and the art the player
sees is the ground-hugging vine missile

    global/missiles/expansion/vines.dcc   (missiles.txt row "vines")

an eight direction, twelve frame sprawl of thorned vines with red seed pods.
That is the look the summons are supposed to have.  The old
``poison-creeper.png`` was a black, cropped-out silhouette of the wrong art and
carried several animations stacked in one grid, which read as stray vine
sprouts left on the floor while attacking.

The sprawl's own tail is not an attack: nine of its twelve frames are the same
sprawl curling in place, so an attacking vine just twitched on the floor.  The
vine beast's raising strike is the art that rears out of the soil and whips
over, and it ships beside the sprawl as

    global/missiles/expansion/pod_attack_1.dcc

The runtime slices the sheet as eight direction rows of twelve columns
(``druidAnimationFrame`` in d2survivors.component.ts): columns 0-7 are the walk
loop from ``vines.dcc`` and columns 8-11 the lash from ``pod_attack_1.dcc``.
Every direction's frames share one crop box so the vine does not wobble between
cels, and each box is bottom-anchored in a uniform cell so the summon stands on
the floor line.

``pod_attack_1.dcc`` only ships four views against the sprawl's eight, and each
of them arches to screen-right.  ``POD_ATTACK_ROWS`` maps each facing row onto
the beast view that matches it, mirrored where the row faces the other way, so
the vine lashes towards whatever it is hitting instead of always to the right.

Usage:
    python tools/import_d2_creeper_atlas.py
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

import d2r_dcc as dcc

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUT_PATH = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "models" / "druid" / "animations" / "poison-creeper.png"
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"
VINES = Path("global/missiles/expansion/vines.dcc")
POD_ATTACK = Path("global/missiles/expansion/pod_attack_1.dcc")
COLUMNS = 12
ROWS = 8
CELL_PADDING = 4
# `vines.dcc` spends its first frames growing out of the ground and only then
# settles into the sprawl. A summon is already "grown" when it appears, so the
# walk loop starts at the first frame that shows the vine.
WALK_FRAMES = (5, 6, 7, 8, 9, 10, 11, 11)
# Four keys of the beast's fifty-one frame strike: the vine rears out of the
# soil, whips over and drives its head down beside the pod, then recovers.
POD_ATTACK_FRAMES = (6, 9, 13, 18)
# Sprite row -> (beast view, mirrored).  Rows run left, up-left, up, up-right,
# right, down-right, down, down-left (see `druidDirection`).  The narrow upright
# view is the beast seen end-on, so it carries the up and down rows.  Of the
# three side views two arch to screen-right (0 and 1) and one to screen-left
# (3), which is why the two lower-right rows take 3 flipped rather than plain.
POD_ATTACK_ROWS: tuple[tuple[int, bool], ...] = (
    (0, True),   # left
    (1, True),   # up-left
    (2, False),  # up
    (1, False),  # up-right
    (0, False),  # right
    (3, True),   # down-right
    (2, True),   # down
    (3, False),  # down-left
)


def direction_cels(animation: dict, palette: list[tuple[int, int, int]]) -> list[list[Image.Image]]:
    """One authored-offset canvas per frame, cropped to a shared box per direction."""
    rows: list[list[Image.Image]] = []
    for direction in animation["dirs"]:
        xmin, ymin, width, height = direction["box"]
        cels: list[Image.Image] = []
        for frame, bitmap in zip(direction["frames"], direction["bitmaps"]):
            canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
            cel = dcc.frame_image(bitmap, frame["width"], frame["height"], palette)
            canvas.alpha_composite(cel, (frame["xmin"] - xmin, frame["ymin"] - ymin))
            cels.append(canvas)
        box = None
        for cel in cels:
            cel_box = cel.getbbox()
            if cel_box:
                box = cel_box if box is None else (
                    min(box[0], cel_box[0]), min(box[1], cel_box[1]),
                    max(box[2], cel_box[2]), max(box[3], cel_box[3]),
                )
        rows.append([cel.crop(box) if box else cel for cel in cels])
    return rows


def pod_attack_cels(animation: dict, palette: list[tuple[int, int, int]]) -> list[list[Image.Image]]:
    """The four keys of the raising strike, per beast view, on the authored box.

    The whole box is kept rather than a tight crop: cropping every frame to its
    own contents would rescale the vine as the head travels, and the lash would
    read as a series of different plants instead of one strike.
    """
    rows: list[list[Image.Image]] = []
    for direction in animation["dirs"]:
        xmin, ymin, width, height = direction["box"]
        cels: list[Image.Image] = []
        for index in POD_ATTACK_FRAMES:
            frame = direction["frames"][index]
            canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
            canvas.alpha_composite(
                dcc.frame_image(direction["bitmaps"][index], frame["width"], frame["height"], palette),
                (frame["xmin"] - xmin, frame["ymin"] - ymin),
            )
            cels.append(canvas)
        rows.append(cels)
    return rows


def main() -> int:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    path = source / VINES
    if not path.is_file():
        raise SystemExit(f"vine art not found: {path}")
    # `units/pal.dat` stores BGR triples, so the channels are corrected before
    # the cels are painted; without the swap the vines come out blue-grey.
    palette = [(red, green, blue) for blue, green, red in dcc.load_palette(
        source / "global" / "palette" / "units" / "pal.dat",
    )]
    animation = dcc.parse(path.read_bytes())
    rows = direction_cels(animation, palette)
    if len(rows) != ROWS or any(len(cels) != COLUMNS for cels in rows):
        raise SystemExit(
            f"expected {ROWS} directions of {COLUMNS} frames, got "
            f"{len(rows)} x {[len(cels) for cels in rows]}",
        )

    pod_path = source / POD_ATTACK
    if not pod_path.is_file():
        raise SystemExit(f"vine beast attack art not found: {pod_path}")
    pod = pod_attack_cels(dcc.parse(pod_path.read_bytes()), palette)
    if len(pod) < 4 or any(len(cels) < len(POD_ATTACK_FRAMES) for cels in pod):
        raise SystemExit(
            f"expected at least 4 beast views of {len(POD_ATTACK_FRAMES)} frames, got "
            f"{len(pod)} x {[len(cels) for cels in pod]}",
        )

    cell_width = max(cel.width for cels in rows for cel in cels) + CELL_PADDING
    cell_height = max(cel.height for cels in rows for cel in cels) + CELL_PADDING
    sheet = Image.new("RGBA", (COLUMNS * cell_width, ROWS * cell_height), (0, 0, 0, 0))
    for row, cels in enumerate(rows):
        ordered = [cels[index] for index in WALK_FRAMES]
        for column, cel in enumerate(ordered):
            sheet.alpha_composite(
                cel,
                (column * cell_width + (cell_width - cel.width) // 2,
                 row * cell_height + cell_height - cel.height - 2),
            )
        # The strike is a different export at a different size, so fit it into
        # the walk's cell and anchor it on the floor line: the summon keeps one
        # drawn height and the lash is what moves.
        view, mirrored = POD_ATTACK_ROWS[row]
        for offset, cel in enumerate(pod[view]):
            if mirrored:
                cel = cel.transpose(Image.FLIP_LEFT_RIGHT)
            scale = min((cell_width - 2) / cel.width, (cell_height - 4) / cel.height)
            sized = cel.resize(
                (max(1, round(cel.width * scale)), max(1, round(cel.height * scale))),
                Image.LANCZOS if scale < 1 else Image.NEAREST,
            )
            sheet.alpha_composite(
                sized,
                ((len(WALK_FRAMES) + offset) * cell_width + (cell_width - sized.width) // 2,
                 row * cell_height + cell_height - sized.height - 2),
            )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT_PATH)
    print(f"wrote {OUT_PATH} {sheet.width}x{sheet.height} ({cell_width}x{cell_height} cells)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
