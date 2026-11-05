"""Import the Minotaur sprite page as an 8-direction walk + attack atlas.

The supplied page ("Minotaur.png" in Desktop/d2/d2 enemies) is a grid of 240x230
cels separated by 2px teal rules, laid out as labelled animation blocks. Each
block's first cel carries its name in the top-left corner:

  band 0  attack 1 (16 frames)   attack 2 (21 frames)
  band 1  death (16)             get hit (7)   idle (8)   walk (8)

Only walk and attack 1 are needed. The renderer expects walk in rows 0-7 and the
attack in rows 8-15, so the page bands are mapped onto that layout:

  rows 0-7   walk,   8 directions x 8 frames   (band 1, from column 30)
  rows 8-15  attack, 8 directions x 16 frames  (band 0, from column 0)

The previous minotaur.png was an unreadable noise sheet, so this replaces it.

Run from the client directory:
  python tools/import_d2_minotaur_animations.py
"""

import argparse
from collections import deque
from pathlib import Path

from PIL import Image

CLIENT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT = CLIENT_ROOT / "src" / "assets" / "d2survivors" / "enemies" / "animated" / "minotaur.png"
PREVIEW_DIR = CLIENT_ROOT / "probe"
DEFAULT_SOURCE = Path(r"C:\Users\Saint\Desktop\d2\d2 enemies") / (
    "PC _ Computer - Diablo 2 _ Diablo 2_ Lord of Destruction - Enemies & Bosses - Minotaur.png"
)

# The sheet is a grid of 240x230 cels separated by 2px teal rules.
CELL_W = 240
CELL_H = 230
PITCH_X = 242
PITCH_Y = 232
DIRECTIONS = 8
COLUMNS = 16
CELL_OUT = 128

# (band, first column, columns) in page order; walk is written to rows 0-7 and
# the attack to rows 8-15.
BLOCKS = [
    ("walk", 1, 30, 8),
    ("attack", 0, 0, 16),
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
    # Teal cell rules and block gutters.
    return red < 70 and 100 < green < 155 and 100 < blue < 155


def keyed_cell(source: Image.Image, left: int, top: int, caption_band: int = 0) -> Image.Image:
    """Transparent out only the background connected to the cel's border."""
    cell = source.crop((left, top, left + CELL_W, top + CELL_H)).convert("RGBA")
    pixels = cell.load()
    if caption_band:
        # The page paints a block name over its first cel; the art never reaches
        # that band, so drop it before looking for sprite pixels.
        for y in range(caption_band):
            for x in range(CELL_W):
                pixels[x, y] = (0, 0, 0, 0)
    seen = bytearray(CELL_W * CELL_H)
    queue = deque()
    for x in range(CELL_W):
        queue.extend(((x, 0), (x, CELL_H - 1)))
    for y in range(CELL_H):
        queue.extend(((0, y), (CELL_W - 1, y)))
    while queue:
        x, y = queue.popleft()
        index = y * CELL_W + x
        if seen[index]:
            continue
        seen[index] = 1
        pixel = pixels[x, y]
        if not is_flat_background(pixel):
            continue
        pixels[x, y] = (pixel[0], pixel[1], pixel[2], 0)
        if x > 0:
            queue.append((x - 1, y))
        if x + 1 < CELL_W:
            queue.append((x + 1, y))
        if y > 0:
            queue.append((x, y - 1))
        if y + 1 < CELL_H:
            queue.append((x, y + 1))
    # Background trapped between the legs and under the axe is never reachable
    # from the cel border, so clear the flat atlas grey wherever it survives.
    for y in range(CELL_H):
        for x in range(CELL_W):
            red, green, blue, alpha = pixels[x, y]
            if alpha and abs(red - GREY[0]) <= KEY_TOLERANCE and abs(green - GREY[1]) <= KEY_TOLERANCE \
                    and abs(blue - GREY[2]) <= KEY_TOLERANCE:
                pixels[x, y] = (0, 0, 0, 0)
    return cell


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="supplied Minotaur sprite sheet")
    args = parser.parse_args()
    if not args.source.is_file():
        raise FileNotFoundError(f"Missing Minotaur sprite sheet: {args.source}")

    source = Image.open(args.source).convert("RGBA")

    frames: dict[str, list[list[Image.Image]]] = {}
    bounds: tuple[int, int, int, int] | None = None
    for name, band, first_column, columns in BLOCKS:
        rows: list[list[Image.Image]] = []
        for direction in range(DIRECTIONS):
            row_frames = []
            for column in range(columns):
                caption_band = 44 if column == 0 and direction == 0 else 0
                cell = keyed_cell(
                    source,
                    (first_column + column) * PITCH_X + 1,
                    (band * DIRECTIONS + direction) * PITCH_Y + 1,
                    caption_band,
                )
                box = cell.split()[3].getbbox()
                if box:
                    bounds = box if bounds is None else (
                        min(bounds[0], box[0]), min(bounds[1], box[1]),
                        max(bounds[2], box[2]), max(bounds[3], box[3]),
                    )
                row_frames.append(cell)
            rows.append(row_frames)
        frames[name] = rows
    if bounds is None:
        raise RuntimeError("No sprite pixels found in the supplied sheet")

    # One scale and one anchor for every frame of both animations: the union
    # bounds of the sprite art are centred in the output cel and scaled up.
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
    pad = CELL_W * 2

    sheet = Image.new("RGBA", (COLUMNS * CELL_OUT, 2 * DIRECTIONS * CELL_OUT), (0, 0, 0, 0))
    for band_index, (name, _, _, columns) in enumerate(BLOCKS):
        for direction, row_frames in enumerate(frames[name]):
            for column, cell in enumerate(row_frames):
                padded = Image.new("RGBA", (CELL_W + pad * 2, CELL_H + pad * 2), (0, 0, 0, 0))
                padded.paste(cell, (pad, pad))
                window_image = padded.crop((pad + box[0], pad + box[1], pad + box[2], pad + box[3]))
                scaled = window_image.resize((CELL_OUT, CELL_OUT), Image.LANCZOS)
                sheet.alpha_composite(scaled, (column * CELL_OUT, (band_index * DIRECTIONS + direction) * CELL_OUT))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUTPUT, optimize=True)
    print(f"{OUTPUT.relative_to(CLIENT_ROOT)}: {sheet.size}; walk/attack x {DIRECTIONS} directions x {COLUMNS} frames")

    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    preview = Image.new("RGBA", (DIRECTIONS * CELL_OUT, 2 * CELL_OUT), (24, 24, 24, 255))
    for band_index in range(2):
        for direction in range(DIRECTIONS):
            preview.alpha_composite(
                sheet.crop((0, (band_index * DIRECTIONS + direction) * CELL_OUT,
                            CELL_OUT, (band_index * DIRECTIONS + direction + 1) * CELL_OUT)),
                (direction * CELL_OUT, band_index * CELL_OUT),
            )
    preview.save(PREVIEW_DIR / "minotaur-directions.png")
    strip = Image.new("RGBA", (COLUMNS * CELL_OUT, 2 * CELL_OUT), (24, 24, 24, 255))
    for band_index in range(2):
        for column in range(COLUMNS):
            strip.alpha_composite(
                sheet.crop((column * CELL_OUT, (band_index * DIRECTIONS + 4) * CELL_OUT,
                            (column + 1) * CELL_OUT, (band_index * DIRECTIONS + 5) * CELL_OUT)),
                (column * CELL_OUT, band_index * CELL_OUT),
            )
    strip.save(PREVIEW_DIR / "minotaur-frames.png")


if __name__ == "__main__":
    main()
