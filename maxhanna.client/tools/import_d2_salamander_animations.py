"""Import the Salamander sprite page as an 8-direction walk + attack atlas.

The supplied page ("Salamander.gif" in Desktop/d2/d2 enemies) is the usual
collage: flat grey cels, pale caption strips and 8 direction rows per block, with
the block name printed at the left of the strip above it:

  band 0  Death
  band 1  Attack 1 (14 frames)
  band 2  Walk (16 frames)
  band 3  Attack 2

Only Walk and Attack 1 are imported. The two blocks have their own cel pitch and
row height, and their frames start flush at x=0, so the geometry is declared here
rather than guessed:

  rows 0-7   walk,   8 directions x 16 frames  (cel 201 x 110)
  rows 8-15  attack, 8 directions x 14 frames  (cel 285 x 140)

Both bands are normalised to one body size before being written with a shared
transform, so the lizard does not jump between crawling and striking.

The shipped enemies/salamander.png was a downscaled copy of this same page
(186x180, unreadable at any in-game size), so this replaces it with a real atlas.

Run from the client directory:
  python tools/import_d2_salamander_animations.py
"""

import argparse
from pathlib import Path

from PIL import Image

CLIENT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT = CLIENT_ROOT / "src" / "assets" / "d2survivors" / "enemies" / "animated" / "salamander.png"
PREVIEW_DIR = CLIENT_ROOT / "probe"
DEFAULT_SOURCE = Path(r"C:\Users\Saint\Desktop\d2\d2 enemies") / (
    "PC _ Computer - Diablo 2 _ Diablo 2_ Lord of Destruction - Enemies & Bosses - Salamander.gif"
)

DIRECTIONS = 8
COLUMNS = 16
CELL_OUT = 128
BODY_PIXELS = 74

# (name, first row y, last row y, cel width, cel height, frames)
BLOCKS = [
    ("walk", 2642, 3517, 201, 110, 16),
    ("attack", 1525, 2640, 285, 140, 14),
]


def is_background(colour: tuple[int, int, int]) -> bool:
    red, green, blue = colour
    if max(abs(red - 170), abs(green - 170), abs(blue - 170)) <= 14:
        return True
    # White gutters and the pale yellow caption strips.
    return red > 232 and green > 226 and blue > 128


def cell_art(image: Image.Image, left: int, top: int, width: int, height: int):
    """Crop one cel and report its art box relative to the cel's centre and floor."""
    pixels = image.load()
    min_x, min_y = left + width, top + height
    max_x, max_y = -1, -1
    for y in range(top + 1, top + height - 1):
        for x in range(left + 1, left + width - 1):
            if is_background(pixels[x, y]):
                continue
            if x < min_x:
                min_x = x
            if y < min_y:
                min_y = y
            if x > max_x:
                max_x = x
            if y > max_y:
                max_y = y
    if max_x < 0:
        return None
    art = image.crop((min_x, min_y, max_x + 1, max_y + 1)).convert("RGBA")
    return art, (min_x + max_x) / 2 - (left + width / 2), max_y - (top + height - 1)


def key(crop: Image.Image) -> Image.Image:
    out = crop.convert("RGBA")
    pixels = out.load()
    for y in range(out.height):
        for x in range(out.width):
            red, green, blue, alpha = pixels[x, y]
            if not alpha:
                continue
            if max(abs(red - 170), abs(green - 170), abs(blue - 170)) <= 16:
                pixels[x, y] = (0, 0, 0, 0)
            elif red > 236 and green > 230 and blue > 200:
                pixels[x, y] = (0, 0, 0, 0)
            elif red > 230 and green > 222 and blue > 140 and red - blue > 30:
                pixels[x, y] = (0, 0, 0, 0)
    return out


def median(values: list[float]) -> float:
    ordered = sorted(values)
    return ordered[len(ordered) // 2]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="supplied Salamander sprite page")
    args = parser.parse_args()
    if not args.source.is_file():
        raise FileNotFoundError(f"Missing Salamander sprite page: {args.source}")

    image = Image.open(args.source).convert("RGB")

    bands: dict[str, list[list[tuple[Image.Image, float, float] | None]]] = {}
    for name, y0, y1, cel_w, cel_h, columns in BLOCKS:
        rows = []
        for direction in range(DIRECTIONS):
            top = y0 + direction * cel_h
            row = []
            for column in range(columns):
                row.append(cell_art(image, column * cel_w, top, cel_w, cel_h))
            heights = [cell[0].height for cell in row if cell]
            scale = BODY_PIXELS / median(heights)
            scaled = []
            for cell in row:
                if cell is None:
                    scaled.append(None)
                    continue
                art, centre, bottom = cell
                art = key(art).resize(
                    (max(1, round(art.width * scale)), max(1, round(art.height * scale))),
                    Image.LANCZOS,
                )
                scaled.append((art, centre * scale, bottom * scale))
            rows.append(scaled)
        bands[name] = rows
        print(f"{name}: 8 directions x {columns} frames of {cel_w}x{cel_h}, normalised x{scale:.2f}")

    placed = [cell for rows in bands.values() for row in rows for cell in row if cell]
    left = min(centre - art.width / 2 for art, centre, _ in placed)
    right = max(centre + art.width / 2 for art, centre, _ in placed)
    up = min(bottom - art.height for art, _, bottom in placed)
    span_w, span_h = right - left, -up
    fit = min(CELL_OUT * 0.98 / span_w, CELL_OUT * 0.98 / span_h)

    sheet = Image.new("RGBA", (COLUMNS * CELL_OUT, 2 * DIRECTIONS * CELL_OUT), (0, 0, 0, 0))
    for band_index, name in enumerate(("walk", "attack")):
        for direction, row in enumerate(bands[name]):
            for index, cell in enumerate(row):
                if cell is None:
                    continue
                art, centre, bottom = cell
                art = art.resize((max(1, round(art.width * fit)), max(1, round(art.height * fit))), Image.LANCZOS)
                x = index * CELL_OUT + round((centre - left) * fit + (CELL_OUT - span_w * fit) / 2 - art.width / 2)
                y = (band_index * DIRECTIONS + direction) * CELL_OUT + round(
                    (bottom - up) * fit + (CELL_OUT - span_h * fit) / 2 - art.height)
                sheet.alpha_composite(art, (x, y))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUTPUT, optimize=True)
    print(f"{OUTPUT.relative_to(CLIENT_ROOT)}: {sheet.size}; walk/attack x {DIRECTIONS} directions")

    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    preview = Image.new("RGBA", (DIRECTIONS * CELL_OUT, 2 * CELL_OUT), (24, 24, 24, 255))
    for band_index in range(2):
        for direction in range(DIRECTIONS):
            preview.alpha_composite(
                sheet.crop((0, (band_index * DIRECTIONS + direction) * CELL_OUT,
                            CELL_OUT, (band_index * DIRECTIONS + direction + 1) * CELL_OUT)),
                (direction * CELL_OUT, band_index * CELL_OUT),
            )
    preview.save(PREVIEW_DIR / "salamander-directions.png")
    strip = Image.new("RGBA", (COLUMNS * CELL_OUT, 2 * CELL_OUT), (24, 24, 24, 255))
    for band_index in range(2):
        for index in range(COLUMNS):
            strip.alpha_composite(
                sheet.crop((index * CELL_OUT, (band_index * DIRECTIONS + 4) * CELL_OUT,
                            (index + 1) * CELL_OUT, (band_index * DIRECTIONS + 5) * CELL_OUT)),
                (index * CELL_OUT, band_index * CELL_OUT),
            )
    strip.save(PREVIEW_DIR / "salamander-frames.png")


if __name__ == "__main__":
    main()
