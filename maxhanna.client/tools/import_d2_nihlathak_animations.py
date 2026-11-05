"""Import the Nihlathak sprite page as an 8-direction walk + attack atlas.

The supplied page ("Nihlathak.png" in Desktop/d2/d2 enemies) is a green-screen
rip laid out as labelled animation blocks: 8 direction rows per block, and the
block name printed in the band above the animation's first column.

  band 0  attack 1 (14 frames)   idle (8)
  band 1  attack 2 (14)          walk (8)
  band 2  death (16)             get hit (5)
  band 3  taunt (14)

Only walk and attack 1 are needed. The renderer expects walk in rows 0-7 and the
attack in rows 8-15, so the page bands are mapped onto that layout:

  rows 0-7   walk,   8 directions x 8 frames   (band 1, right-hand block)
  rows 8-15  attack, 8 directions x 14 frames  (band 0, leftmost block)

The page's background is a pure green matte rather than the atlas grey used by
the other rips, so every cel is keyed by green dominance and the surviving green
spill on antialiased edges is pulled back to the pixel's red/blue level. The
shipped enemies/nihlathak.png was a downscaled copy of this same page (182x180,
unreadable at any in-game size), so this replaces it with a real atlas.

Run from the client directory:
  python tools/import_d2_nihlathak_animations.py
"""

import argparse
from pathlib import Path

from PIL import Image

CLIENT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT = CLIENT_ROOT / "src" / "assets" / "d2survivors" / "enemies" / "animated" / "nihlathak.png"
PREVIEW_DIR = CLIENT_ROOT / "probe"
DEFAULT_SOURCE = Path(r"C:\Users\Saint\Desktop\d2\d2 enemies") / (
    "PC _ Computer - Diablo 2 _ Diablo 2_ Lord of Destruction - Enemies & Bosses - Nihlathak.png"
)

# Horizontal cel pitch and row pitch. The left-hand block starts at x=2 and the
# right-hand block is pushed past a 4px block gutter, hence the separate origins.
CELL_W = 197
CELL_H = 137
PITCH_X = 202
PITCH_Y = 142
DIRECTIONS = 8
COLUMNS = 14
CELL_OUT = 128

# (name, first row band top, first column x, frames); walk lands in rows 0-7 and
# the attack in rows 8-15.
BLOCKS = [
    ("walk", 1169, 2834, 8),
    ("attack", 16, 2, 14),
]


def key_green(cell: Image.Image) -> Image.Image:
    """Key the green matte out of a cel, keeping soft, de-spilled edges."""
    cell = cell.convert("RGBA")
    pixels = cell.load()
    width, height = cell.size
    for y in range(height):
        for x in range(width):
            red, green, blue, _alpha = pixels[x, y]
            # Teal cel rules and block gutters are neutral to the green test.
            if red < 50 and 100 < green < 160 and 100 < blue < 160:
                pixels[x, y] = (0, 0, 0, 0)
                continue
            spill = green - max(red, blue)
            if spill <= 12:
                continue
            if spill >= 60:
                pixels[x, y] = (0, 0, 0, 0)
                continue
            # A blended edge pixel: fade it out and pull its green back down so
            # the sprite does not carry a green halo onto the dark arena floor.
            alpha = round(255 * (1 - (spill - 12) / 48))
            pixels[x, y] = (red, max(red, blue), blue, alpha)
    return cell


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="supplied Nihlathak sprite page")
    args = parser.parse_args()
    if not args.source.is_file():
        raise FileNotFoundError(f"Missing Nihlathak sprite page: {args.source}")

    source = Image.open(args.source).convert("RGBA")

    frames: dict[str, list[list[Image.Image]]] = {}
    bounds: tuple[int, int, int, int] | None = None
    for name, band_top, first_column, columns in BLOCKS:
        rows: list[list[Image.Image]] = []
        for direction in range(DIRECTIONS):
            row_frames = []
            for column in range(columns):
                left = first_column + column * PITCH_X + 2
                top = band_top + direction * PITCH_Y + 2
                cell = key_green(source.crop((left, top, left + CELL_W, top + CELL_H)))
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

    # One scale and one anchor for every frame of both animations so the walk and
    # the attack share a ground line when the renderer swaps between them.
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
    print(f"art bounds {width}x{height} at {bounds[:2]}; scale {scale:.2f}")

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
    preview.save(PREVIEW_DIR / "nihlathak-directions.png")
    strip = Image.new("RGBA", (COLUMNS * CELL_OUT, 2 * CELL_OUT), (24, 24, 24, 255))
    for band_index in range(2):
        for column in range(COLUMNS):
            strip.alpha_composite(
                sheet.crop((column * CELL_OUT, (band_index * DIRECTIONS + 4) * CELL_OUT,
                            (column + 1) * CELL_OUT, (band_index * DIRECTIONS + 5) * CELL_OUT)),
                (column * CELL_OUT, band_index * CELL_OUT),
            )
    strip.save(PREVIEW_DIR / "nihlathak-frames.png")


if __name__ == "__main__":
    main()
