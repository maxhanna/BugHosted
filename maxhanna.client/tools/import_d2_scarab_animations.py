"""Rebuild the Sand Scarab atlas with a walk cycle and an attack cycle.

The previous scarab.png held a single 8-direction animation (the spit attack)
and the renderer played it for walking as well, so scarabs appeared to attack
while closing distance. This imports the labelled "walk" and "attack 1" blocks
from the supplied Scarab Demon sprite sheet as two animation bands:

  rows 0-7   walk, 8 directions x 14 frames (last column padded)
  rows 8-15  attack, 8 directions x 16 frames

Every frame keeps its position inside the source cell and shares one uniform
scale, so the body stays anchored across the cycle and the monster keeps its
size when it switches animations.

Run from the client directory:
  python tools/import_d2_scarab_animations.py
"""

import argparse
from collections import deque
from pathlib import Path

from PIL import Image

CLIENT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT = CLIENT_ROOT / "src" / "assets" / "d2survivors" / "enemies" / "animated" / "scarab.png"
DEFAULT_SOURCE = Path(r"C:\Users\Saint\Desktop\d2\d2 enemies") / (
    "PC _ Computer - Diablo 2 _ Diablo 2_ Lord of Destruction - Enemies & Bosses - "
    "Scarab Demon (Light Armor, Heavy Weapon).png"
)

# The sheet is a grid of 240px cells separated by 2px cyan rules.
CELL = 240
PITCH = 242
DIRECTIONS = 8
COLUMNS = 16
CELL_OUT = 128

# (name, first column, columns) of each block, all starting on direction row 0.
BLOCKS = [
    ("walk", 16, 14),
    ("attack", 0, 16),
]

GREY = (170, 170, 170)
KEY_TOLERANCE = 12


def is_flat_background(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    if alpha == 0:
        return True
    if max(abs(red - GREY[0]), abs(green - GREY[1]), abs(blue - GREY[2])) <= KEY_TOLERANCE:
        return True
    if red > 235 and green > 235 and blue > 235:
        return True
    # Cyan cell rules and block gutters.
    return red < 70 and 100 < green < 155 and 100 < blue < 155


def keyed_cell(source: Image.Image, left: int, top: int, caption_band: int = 0) -> Image.Image:
    """Transparent out only the background connected to the cell's border."""
    cell = source.crop((left, top, left + CELL, top + CELL)).convert("RGBA")
    pixels = cell.load()
    if caption_band:
        # The sheet paints a block name over the first cell; the sprite art never
        # reaches that band, so drop it before looking for sprite pixels.
        for y in range(caption_band):
            for x in range(CELL):
                pixels[x, y] = (0, 0, 0, 0)
    seen = bytearray(CELL * CELL)
    queue = deque()
    for x in range(CELL):
        queue.extend(((x, 0), (x, CELL - 1)))
    for y in range(CELL):
        queue.extend(((0, y), (CELL - 1, y)))
    while queue:
        x, y = queue.popleft()
        index = y * CELL + x
        if seen[index]:
            continue
        seen[index] = 1
        pixel = pixels[x, y]
        if not is_flat_background(pixel):
            continue
        pixels[x, y] = (pixel[0], pixel[1], pixel[2], 0)
        if x > 0:
            queue.append((x - 1, y))
        if x + 1 < CELL:
            queue.append((x + 1, y))
        if y > 0:
            queue.append((x, y - 1))
        if y + 1 < CELL:
            queue.append((x, y + 1))
    # Background trapped between legs and under the body is never reachable from
    # the cell border, so clear the flat atlas grey anywhere it survives. The
    # sprite itself is dark red and black, so this cannot bite into the art.
    for y in range(CELL):
        for x in range(CELL):
            red, green, blue, alpha = pixels[x, y]
            if alpha and abs(red - GREY[0]) <= KEY_TOLERANCE and abs(green - GREY[1]) <= KEY_TOLERANCE \
                    and abs(blue - GREY[2]) <= KEY_TOLERANCE:
                pixels[x, y] = (0, 0, 0, 0)
    return cell


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="supplied Scarab Demon sprite sheet")
    args = parser.parse_args()
    if not args.source.is_file():
        raise FileNotFoundError(f"Missing Scarab Demon sprite sheet: {args.source}")

    source = Image.open(args.source).convert("RGBA")

    frames: dict[str, list[list[Image.Image]]] = {}
    bounds: tuple[int, int, int, int] | None = None
    for name, first_column, columns in BLOCKS:
        band: list[list[Image.Image]] = []
        for direction in range(DIRECTIONS):
            row_frames = []
            for column in range(columns):
                caption_band = 40 if column == 0 and direction == 0 else 0
                cell = keyed_cell(
                    source, (first_column + column) * PITCH + 1, direction * PITCH + 1, caption_band,
                )
                box = cell.split()[3].getbbox()
                if box:
                    bounds = box if bounds is None else (
                        min(bounds[0], box[0]), min(bounds[1], box[1]),
                        max(bounds[2], box[2]), max(bounds[3], box[3]),
                    )
                row_frames.append(cell)
            band.append(row_frames)
        frames[name] = band
    if bounds is None:
        raise RuntimeError("No sprite pixels found in the supplied sheet")

    # One scale and one anchor for every frame of both animations: the union
    # bounds of the sprite art are centred in the output cell and scaled up.
    width = bounds[2] - bounds[0]
    height = bounds[3] - bounds[1]
    scale = (CELL_OUT - 2) / max(width, height)
    window = CELL_OUT / scale
    centre_x = (bounds[0] + bounds[2]) / 2
    centre_y = (bounds[1] + bounds[3]) / 2
    box = (
        round(centre_x - window / 2), round(centre_y - window / 2),
        round(centre_x + window / 2), round(centre_y + window / 2),
    )
    pad = CELL * 2

    rows = len(BLOCKS) * DIRECTIONS
    sheet = Image.new("RGBA", (COLUMNS * CELL_OUT, rows * CELL_OUT), (0, 0, 0, 0))
    for band_index, (name, _, columns) in enumerate(BLOCKS):
        for direction in range(DIRECTIONS):
            for column in range(COLUMNS):
                cell = frames[name][direction][min(column, columns - 1)]
                padded = Image.new("RGBA", (CELL + 2 * pad, CELL + 2 * pad), (0, 0, 0, 0))
                padded.paste(cell, (pad, pad))
                placed = padded.crop((box[0] + pad, box[1] + pad, box[2] + pad, box[3] + pad))
                placed = placed.resize((CELL_OUT, CELL_OUT), Image.LANCZOS)
                sheet.alpha_composite(
                    placed,
                    (column * CELL_OUT, (band_index * DIRECTIONS + direction) * CELL_OUT),
                )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUTPUT, optimize=True)
    print(
        f"{OUTPUT.relative_to(CLIENT_ROOT)}: {sheet.size}; "
        + ", ".join(f"{name} rows {index * DIRECTIONS}-{index * DIRECTIONS + DIRECTIONS - 1} ({columns} frames)"
                    for index, (name, _, columns) in enumerate(BLOCKS))
        + f"; art {width}x{height} scaled {scale:.3f}"
    )


if __name__ == "__main__":
    main()
