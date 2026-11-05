"""Import the Mummy sprite page as an 8-direction walk + attack atlas.

The supplied page ("Mummy.png" in Desktop/d2/d2 enemies) is an unlabelled sheet:
every animation block is a grid of cels on a magenta colour key, and each block
was captured at its own zoom. The blocks were identified by their motion:

  walk    x 1690, y 850   8 directions x 6 frames, 90x74 cels
  attack  x 2,    y 18    8 directions x 9 frames, 194x98 cels
  death   x 2,    y 1770  (not imported; the engine has its own death effect)

Because the two blocks are drawn at different zooms, each band is normalised to
its own union bounds before being written, so the mummy keeps one size when it
switches from walking to striking.

  rows 0-7   walk,   8 directions x 6 frames
  rows 8-15  attack, 8 directions x 9 frames

Run from the client directory:
  python tools/import_d2_mummy_animations.py
"""

import argparse
from collections import deque
from pathlib import Path

from PIL import Image

CLIENT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT = CLIENT_ROOT / "src" / "assets" / "d2survivors" / "enemies" / "animated" / "mummy.png"
PREVIEW_DIR = CLIENT_ROOT / "probe"
DEFAULT_SOURCE = Path(r"C:\Users\Saint\Desktop\d2\d2 enemies") / (
    "PC _ Computer - Diablo 2 _ Diablo 2_ Lord of Destruction - Enemies & Bosses - Mummy.png"
)

DIRECTIONS = 8
COLUMNS = 9
CELL_OUT = 128

# (name, x, y, cell width, cell height, pitch x, pitch y, columns)
BLOCKS = [
    ("walk", 1690, 850, 90, 74, 94, 78, 6),
    ("attack", 2, 18, 194, 98, 198, 102, 9),
]

# The page's colour key is a pink-magenta, not a pure magenta.
MAGENTA = (255, 0, 153)
KEY_TOLERANCE = 30


def is_flat_background(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    if alpha == 0:
        return True
    if max(abs(red - MAGENTA[0]), abs(green - MAGENTA[1]), abs(blue - MAGENTA[2])) <= KEY_TOLERANCE:
        return True
    if red > 235 and green > 235 and blue > 235:
        return True
    # Teal block gutters.
    return red < 70 and 100 < green < 160 and 100 < blue < 160


def keyed_cell(source: Image.Image, left: int, top: int, width: int, height: int) -> Image.Image:
    """Transparent out the colour key, including the magenta trapped between limbs."""
    cell = source.crop((left, top, left + width, top + height)).convert("RGBA")
    pixels = cell.load()
    seen = bytearray(width * height)
    queue = deque()
    for x in range(width):
        queue.extend(((x, 0), (x, height - 1)))
    for y in range(height):
        queue.extend(((0, y), (width - 1, y)))
    while queue:
        x, y = queue.popleft()
        index = y * width + x
        if seen[index]:
            continue
        seen[index] = 1
        pixel = pixels[x, y]
        if not is_flat_background(pixel):
            continue
        pixels[x, y] = (pixel[0], pixel[1], pixel[2], 0)
        if x > 0:
            queue.append((x - 1, y))
        if x + 1 < width:
            queue.append((x + 1, y))
        if y > 0:
            queue.append((x, y - 1))
        if y + 1 < height:
            queue.append((x, y + 1))
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if alpha and max(abs(red - MAGENTA[0]), abs(green - MAGENTA[1]), abs(blue - MAGENTA[2])) <= KEY_TOLERANCE:
                pixels[x, y] = (0, 0, 0, 0)
    return cell


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="supplied Mummy sprite sheet")
    args = parser.parse_args()
    if not args.source.is_file():
        raise FileNotFoundError(f"Missing Mummy sprite sheet: {args.source}")

    source = Image.open(args.source).convert("RGBA")

    frames: dict[str, list[list[Image.Image]]] = {}
    for name, x, y, cell_w, cell_h, pitch_x, pitch_y, columns in BLOCKS:
        rows: list[list[Image.Image]] = []
        for direction in range(DIRECTIONS):
            row_frames = []
            for column in range(columns):
                row_frames.append(keyed_cell(
                    source,
                    x + column * pitch_x,
                    y + direction * pitch_y,
                    cell_w,
                    cell_h,
                ))
            rows.append(row_frames)
        frames[name] = rows

    sheet = Image.new("RGBA", (COLUMNS * CELL_OUT, 2 * DIRECTIONS * CELL_OUT), (0, 0, 0, 0))
    for band_index, (name, *_rest) in enumerate(BLOCKS):
        # One scale and one anchor per band: the blocks were captured at
        # different zooms, so a shared scale would shrink one of them.
        bounds = None
        for row_frames in frames[name]:
            for cell in row_frames:
                box = cell.split()[3].getbbox()
                if not box:
                    continue
                bounds = box if bounds is None else (
                    min(bounds[0], box[0]), min(bounds[1], box[1]),
                    max(bounds[2], box[2]), max(bounds[3], box[3]),
                )
        if bounds is None:
            raise RuntimeError(f"No sprite pixels found for {name}")
        # Scale by the median body height: an outstretched-arm or leap frame in
        # one direction must not shrink the whole band, and the engine sizes
        # sprites by height as well.
        heights = sorted(
            cell.split()[3].getbbox()[3] - cell.split()[3].getbbox()[1]
            for row_frames in frames[name]
            for cell in row_frames
            if cell.split()[3].getbbox()
        )
        scale = (CELL_OUT - 4) / heights[len(heights) // 2]
        for direction, row_frames in enumerate(frames[name]):
            for column, cell in enumerate(row_frames):
                art = cell.crop(cell.split()[3].getbbox())
                art = art.resize(
                    (max(1, round(art.width * scale)), max(1, round(art.height * scale))),
                    Image.LANCZOS,
                )
                # Centre horizontally and keep the feet on a shared ground line,
                # so a lunge reads as motion instead of a jump between cels.
                tile = Image.new("RGBA", (CELL_OUT, CELL_OUT), (0, 0, 0, 0))
                tile.paste(art, ((CELL_OUT - art.width) // 2, CELL_OUT - 2 - art.height), art)
                sheet.alpha_composite(tile, (column * CELL_OUT, (band_index * DIRECTIONS + direction) * CELL_OUT))

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
    preview.save(PREVIEW_DIR / "mummy-directions.png")
    strip = Image.new("RGBA", (COLUMNS * CELL_OUT, 2 * CELL_OUT), (24, 24, 24, 255))
    for band_index in range(2):
        for column in range(COLUMNS):
            strip.alpha_composite(
                sheet.crop((column * CELL_OUT, (band_index * DIRECTIONS + 4) * CELL_OUT,
                            (column + 1) * CELL_OUT, (band_index * DIRECTIONS + 5) * CELL_OUT)),
                (column * CELL_OUT, band_index * CELL_OUT),
            )
    strip.save(PREVIEW_DIR / "mummy-frames.png")


if __name__ == "__main__":
    main()
