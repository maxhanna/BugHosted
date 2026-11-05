"""Import the Siege Beast sprite page as an 8-direction walk + strike atlas.

The supplied page ("Seige Beast.png" in Desktop/d2/d2 enemies) is a chroma-key
collage rather than the grey-cel sheets used by most of the other monsters:
three blocks of 8 direction rows, 18 columns of 352x272 cels, the beast keyed
against flat pure green (0, 255, 0) with teal (0, 128, 128) grid lines and a
caption strip under each block.

  band 0  y   16  walk      18 frames  (its caption was cut off at the top)
  band 1  y 2210  idle      18 frames  (caption "idle" at y 2192)
  band 2  y 4404  get hit   15 frames  (caption "get hit" at y 4386)

The page carries no attack cycle, so the shipped atlas keeps the walk exactly as
imported and builds the strike from that same walk: the beast rears back on the
frames where it lifts its head and claws (14-16), thrusts through the reach
frames (3-6) while sliding toward the direction it is facing, then settles back
through 7-11. Every pixel is the original rip; only the placement of the frames
inside the cel is authored here, which is how the D2 attack reads anyway - a
heavy lunge rather than a weapon swing.

The atlas is written as:

  rows 0-7   walk,   8 directions x 18 frames
  rows 8-15  strike, 8 directions x 12 frames

The beast also carries its baked ground shadow, which is kept: all frames are
aligned on that shadow's contact point, so the body can bob without the shadow
sliding out from under it.

Run from the client directory:
  python tools/import_d2_siege_beast_animations.py --preview
"""

import argparse
import math
from pathlib import Path

from PIL import Image

CLIENT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT = CLIENT_ROOT / "src" / "assets" / "d2survivors" / "enemies" / "animated" / "siege-beast.png"
PREVIEW_DIR = CLIENT_ROOT / "probe"
DEFAULT_SOURCE = Path(r"C:\Users\Saint\Desktop\d2\d2 enemies") / (
    "PC _ Computer - Diablo 2 _ Diablo 2_ Lord of Destruction - Enemies & Bosses - Seige Beast.png"
)

DIRECTIONS = 8
COLUMNS = 18
CELL_OUT = 144
BODY_PIXELS = 100
GROUND = 0.78
BORDER = 4

# Cel grid of the supplied page.
CEL_W = 352
CEL_H = 272
WALK_TOP = 16

# (walk frame, forward slide in source px, dip in source px)
STRIKE = [
    (14, -8, 0),
    (15, -14, 0),
    (16, -14, 0),
    (3, 10, 0),
    (4, 28, 3),
    (5, 40, 5),
    (6, 38, 5),
    (7, 26, 3),
    (8, 14, 2),
    (9, 6, 1),
    (10, 2, 0),
    (11, 0, 0),
]


def key(crop: Image.Image) -> Image.Image:
    """Remove the green screen, feathering the edge and killing the spill."""
    out = crop.convert("RGBA")
    pixels = out.load()
    for y in range(out.height):
        for x in range(out.width):
            red, green, blue, alpha = pixels[x, y]
            if not alpha:
                continue
            if red < 24 and (blue < 24 and green >= 90 or 100 <= green <= 165 and 100 <= blue <= 165):
                # Flat green screen and the teal grid/caption lines.
                pixels[x, y] = (0, 0, 0, 0)
                continue
            dominance = green - max(red, blue)
            if dominance <= 4:
                continue
            if dominance >= 70:
                pixels[x, y] = (0, 0, 0, 0)
                continue
            # Partially covered pixel: keep it but pull the green back down to
            # the neighbouring channels so no bright fringe survives.
            pixels[x, y] = (red, green - int(dominance * 0.8), blue, round(255 * (1 - (dominance - 4) / 66)))
    return out


def frame(image: Image.Image, direction: int, index: int):
    """Crop one cel and report its art, its cel-relative centre and its feet."""
    left = BORDER + index * CEL_W
    top = WALK_TOP + direction * CEL_H + BORDER
    art = key(image.crop((left, top, left + CEL_W - BORDER * 2, top + CEL_H - BORDER * 2)))
    box = art.getbbox()
    if not box:
        return None
    art = art.crop(box)
    centre = (box[0] + box[2]) / 2 - (CEL_W - BORDER * 2) / 2
    # Height of the art's contact row above the cel's bottom edge.
    feet = (CEL_H - BORDER * 2) - box[3]
    return art, centre, feet


def median(values: list[float]) -> float:
    ordered = sorted(values)
    return ordered[len(ordered) // 2]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="supplied Siege Beast sprite page")
    parser.add_argument("--preview", action="store_true", help="write probe/siege-beast-*.png contact sheets")
    args = parser.parse_args()
    if not args.source.is_file():
        raise FileNotFoundError(f"Missing Siege Beast sprite page: {args.source}")

    image = Image.open(args.source).convert("RGB")

    walk = [[frame(image, direction, index) for index in range(COLUMNS)] for direction in range(DIRECTIONS)]
    walk_frames = [cell for row in walk for cell in row if cell]
    scale = BODY_PIXELS / median([cell[0].height for cell in walk_frames])
    feet_reference = median([cell[2] for cell in walk_frames])

    # Forward vector of each direction row, matching enemySpriteRow():
    # row = round((angle + pi) / (pi / 4)) mod 8, with screen-down positive y.
    forward = [(math.cos(d * math.pi / 4 - math.pi), math.sin(d * math.pi / 4 - math.pi)) for d in range(DIRECTIONS)]

    # A cell is (art, cel-relative centre, feet, unused, heading) where the last
    # field is 0 for both bands: the strike already folds its slide and dip into
    # the centre/feet, so every frame is placed by the same rule.
    banks: dict[str, list[list[tuple | None]]] = {"walk": []}
    for row in walk:
        banks["walk"].append([(*cell, 0) if cell else None for cell in row])

    strike: list[list[tuple | None]] = []
    for direction, (cos, sin) in enumerate(forward):
        row: list[tuple | None] = []
        for source, slide, dip in STRIKE:
            cell = walk[direction][source]
            if cell is None:
                row.append(None)
                continue
            art, centre, feet = cell
            row.append((art, centre + cos * slide, feet - sin * slide - dip, 0))
        strike.append(row)
    banks["strike"] = strike

    # Fit both bands into one cell box: GROUND of the cell above the baseline,
    # the rest below it.
    placed = [cell for rows in banks.values() for row in rows for cell in row if cell]
    left = min(centre - art.width / 2 for art, centre, _, _ in placed)
    right = max(centre + art.width / 2 for art, centre, _, _ in placed)
    above = max(art.height + feet - feet_reference for art, _, feet, _ in placed)
    below = max(feet_reference - feet for _, _, feet, _ in placed)
    fit = min(
        CELL_OUT * 0.96 / ((right - left) * scale),
        CELL_OUT * (GROUND - 0.02) / (above * scale),
        CELL_OUT * (1 - GROUND - 0.02) / (below * scale),
    )

    sheet = Image.new("RGBA", (COLUMNS * CELL_OUT, 2 * DIRECTIONS * CELL_OUT), (0, 0, 0, 0))
    baseline = round(CELL_OUT * GROUND)
    for band, name in enumerate(("walk", "strike")):
        for direction, row in enumerate(banks[name]):
            for index, cell in enumerate(row):
                if cell is None:
                    continue
                art, centre, feet, _ = cell
                art = art.resize(
                    (max(1, round(art.width * scale * fit)), max(1, round(art.height * scale * fit))), Image.LANCZOS
                )
                x = index * CELL_OUT + round(CELL_OUT / 2 + centre * scale * fit - art.width / 2)
                y = (band * DIRECTIONS + direction) * CELL_OUT + round(
                    baseline - (feet - feet_reference) * scale * fit - art.height
                )
                sheet.alpha_composite(art, (x, y))
        print(f"{name}: {DIRECTIONS} directions x {len(banks[name][0])} frames (scale x{scale * fit:.2f})")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUTPUT, optimize=True)
    print(f"{OUTPUT.relative_to(CLIENT_ROOT)}: {sheet.size}")

    if args.preview:
        PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
        directions = Image.new("RGBA", (DIRECTIONS * CELL_OUT, 2 * CELL_OUT), (26, 24, 20, 255))
        frames = Image.new("RGBA", (COLUMNS * CELL_OUT, 2 * CELL_OUT), (26, 24, 20, 255))
        for band in range(2):
            for direction in range(DIRECTIONS):
                top = (band * DIRECTIONS + direction) * CELL_OUT
                directions.alpha_composite(sheet.crop((0, top, CELL_OUT, top + CELL_OUT)), (direction * CELL_OUT, band * CELL_OUT))
            for index in range(COLUMNS):
                top = (band * DIRECTIONS + 2) * CELL_OUT
                frames.alpha_composite(
                    sheet.crop((index * CELL_OUT, top, (index + 1) * CELL_OUT, top + CELL_OUT)),
                    (index * CELL_OUT, band * CELL_OUT),
                )
        directions.save(PREVIEW_DIR / "siege-beast-directions.png")
        frames.save(PREVIEW_DIR / "siege-beast-frames.png")


if __name__ == "__main__":
    main()
