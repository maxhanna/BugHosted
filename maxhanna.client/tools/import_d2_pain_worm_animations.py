"""Import the Pain Worm sprite page as an 8-direction walk + attack atlas.

The supplied page ("Pain Worm.png" in Desktop/d2/d2 enemies) is a transparent
collage: every animation block is 8 direction rows of evenly spaced frames, and
each block was captured at its own zoom, so the geometry is declared per block:

  band 0  attack  8 rows x 8 frames   (cel 213x125, block at x 0, y 16)
  band 3  walk    8 rows x 9 frames   (cel 121x97,  block at x 0, y 2877)
          idle    8 rows x 5 frames   beside it, not imported

The page is an RGBA cut-out rather than a colour-keyed rip: the worms are drawn
as glowing flesh beasts, so their soft alpha halo is part of the art and is kept
instead of being keyed away. The two blocks are captured at different zooms, so
each band is normalised to one body size before both are placed with a shared
transform, and the walk lands in rows 0-7 with the attack in rows 8-15.

The shipped enemies/pain-worm.png was a downscaled copy of this same page
(94x180, unreadable at any in-game size), so this replaces it with a real atlas.

Run from the client directory:
  python tools/import_d2_pain_worm_animations.py
"""

import argparse
from pathlib import Path

from PIL import Image

CLIENT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT = CLIENT_ROOT / "src" / "assets" / "d2survivors" / "enemies" / "animated" / "pain-worm.png"
PREVIEW_DIR = CLIENT_ROOT / "probe"
DEFAULT_SOURCE = Path(r"C:\Users\Saint\Desktop\d2\d2 enemies") / (
    "PC _ Computer - Diablo 2 _ Diablo 2_ Lord of Destruction - Enemies & Bosses - Pain Worm.png"
)

DIRECTIONS = 8
COLUMNS = 9
CELL_OUT = 120
# Every block is captured at its own zoom; this is the body height both bands are
# scaled to so the creature does not change size between walking and spitting.
BODY_PIXELS = 40
# Pixels of floor kept under the lowest frame so the shadow line reads.
GROUND_PAD = 14
# The page paints a wide, very faint halo around each worm. Keep the bright body
# and drop the outer haze, which would otherwise read as a fuzzy orange cloud at
# arena scale, then firm up what is left of the worm's own translucency.
HALO_ALPHA = 128
ALPHA_GAIN = 1.35

# (name, first column x, first row y, cel width, cel height, frames)
BLOCKS = [
    ("walk", 0, 2877, 121, 97, 9),
    ("attack", 0, 16, 213, 125, 8),
]


def cell_art(source: Image.Image, left: int, top: int, width: int, height: int) -> tuple[Image.Image, int, int] | None:
    """Crop one cel, drop the cyan cel rules, and report its offset from the
    cel's horizontal centre and its bottom edge."""
    cell = source.crop((left + 2, top + 2, left + width - 2, top + height - 2)).convert("RGBA")
    pixels = cell.load()
    for y in range(cell.height):
        for x in range(cell.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha < HALO_ALPHA or (red < 50 and green > 200 and blue > 200):
                pixels[x, y] = (0, 0, 0, 0)
            else:
                pixels[x, y] = (red, green, blue, min(255, round(alpha * ALPHA_GAIN)))
    box = cell.split()[3].getbbox()
    if box is None:
        return None
    art = cell.crop(box)
    centre = (box[0] + box[2]) / 2 - (width - 4) / 2
    return art, centre, box[3] - (height - 4)


def median(values: list[float]) -> float:
    ordered = sorted(values)
    return ordered[len(ordered) // 2]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="supplied Pain Worm sprite page")
    args = parser.parse_args()
    if not args.source.is_file():
        raise FileNotFoundError(f"Missing Pain Worm sprite page: {args.source}")

    source = Image.open(args.source).convert("RGBA")

    bands: dict[str, list[list[tuple[Image.Image, float, float] | None]]] = {}
    for name, first_x, first_y, width, height, columns in BLOCKS:
        rows = []
        for direction in range(DIRECTIONS):
            row = []
            for column in range(columns):
                row.append(cell_art(
                    source,
                    first_x + column * width,
                    first_y + direction * height,
                    width,
                    height,
                ))
            rows.append(row)
        art_heights = [cell[0].height for row in rows for cell in row if cell]
        scale = BODY_PIXELS / median(art_heights)
        scaled = []
        for row in rows:
            scaled_row = []
            for cell in row:
                if cell is None:
                    scaled_row.append(None)
                    continue
                art, centre, bottom = cell
                art = art.resize(
                    (max(1, round(art.width * scale)), max(1, round(art.height * scale))),
                    Image.LANCZOS,
                )
                scaled_row.append((art, centre * scale, bottom * scale))
            scaled.append(scaled_row)
        bands[name] = scaled
        print(f"{name}: {columns} frames, body {median(art_heights):.0f}px -> x{scale:.2f}")

    sheet = Image.new("RGBA", (COLUMNS * CELL_OUT, 2 * DIRECTIONS * CELL_OUT), (0, 0, 0, 0))
    for band_index, name in enumerate(("walk", "attack")):
        for direction, row in enumerate(bands[name]):
            # Frames in a row share one ground line, so the crawl stays level and
            # the attacker keeps its stance instead of bobbing cel to cel.
            ground = max((cell[2] for cell in row if cell), default=0)
            for index, cell in enumerate(row):
                if cell is None:
                    continue
                art, centre, bottom = cell
                offset = round(CELL_OUT / 2 - art.width / 2 + centre)
                offset = max(0, min(CELL_OUT - art.width, offset))
                x = index * CELL_OUT + offset
                y = (band_index * DIRECTIONS + direction) * CELL_OUT + round(CELL_OUT - GROUND_PAD - art.height + (bottom - ground))
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
    preview.save(PREVIEW_DIR / "pain-worm-directions.png")
    strip = Image.new("RGBA", (COLUMNS * CELL_OUT, 2 * CELL_OUT), (24, 24, 24, 255))
    for band_index in range(2):
        for index in range(COLUMNS):
            strip.alpha_composite(
                sheet.crop((index * CELL_OUT, (band_index * DIRECTIONS + 4) * CELL_OUT,
                            (index + 1) * CELL_OUT, (band_index * DIRECTIONS + 5) * CELL_OUT)),
                (index * CELL_OUT, band_index * CELL_OUT),
            )
    strip.save(PREVIEW_DIR / "pain-worm-frames.png")


if __name__ == "__main__":
    main()
