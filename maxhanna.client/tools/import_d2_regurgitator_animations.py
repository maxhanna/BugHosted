"""Import the Regurgitator sprite page as an 8-direction walk + attack atlas.

The supplied page ("Regurgitator.gif" in Desktop/d2/d2 enemies) is the usual
atlas collage: flat grey cels separated by white gutters, 8 direction rows per
animation block, and a label strip above each block. Reading them gives:

  band 0  Death            (y 0)
  band 1  Attack 1 (16)    Attack 2 (16)   Get Hit
  band 2  (unlabelled)     Dead
  band 3  Walk (12)        Special 1

Only Walk and Attack 1 are imported. The two blocks sit at slightly different
pitches and row heights, so each is declared here instead of guessed, and both
are normalised to one body size before being written with a shared transform:

  rows 0-7   walk,   8 directions x 12 frames
  rows 8-15  attack, 8 directions x 16 frames

The shipped enemies/regurgitator.png was a downscaled copy of this same page
(170x180, unreadable at any in-game size), so this replaces it with a real atlas.

Run from the client directory:
  python tools/import_d2_regurgitator_animations.py
"""

import argparse
from pathlib import Path

from PIL import Image

CLIENT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT = CLIENT_ROOT / "src" / "assets" / "d2survivors" / "enemies" / "animated" / "regurgitator.png"
PREVIEW_DIR = CLIENT_ROOT / "probe"
DEFAULT_SOURCE = Path(r"C:\Users\Saint\Desktop\d2\d2 enemies") / (
    "PC _ Computer - Diablo 2 _ Diablo 2_ Lord of Destruction - Enemies & Bosses - Regurgitator.gif"
)

DIRECTIONS = 8
COLUMNS = 16
CELL_OUT = 128
BODY_PIXELS = 110

# (name, first row y, last row y, pitch, frames, x_min, x_max)
BLOCKS = [
    ("walk", 3453, 4362, 170.5, 12, 0, 2088),
    ("attack", 1250, 2240, 172.5, 16, 0, 2736),
]


def is_background(colour: tuple[int, int, int]) -> bool:
    red, green, blue = colour
    # The page's flat atlas grey and the white gutters between blocks.
    if max(abs(red - 170), abs(green - 170), abs(blue - 170)) <= 14:
        return True
    # Caption strips are a pale yellow, gutters are near white.
    return red > 232 and green > 226 and blue > 128


def row_runs(pixels, width: int, y0: int, y1: int, x_min: int, x_max: int) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    start = previous = None
    for x in range(x_min, min(width, x_max)):
        hit = any(not is_background(pixels[x, y]) for y in range(y0, y1 + 1))
        if hit:
            if start is None:
                start = x
            previous = x
        elif start is not None:
            runs.append((start, previous))
            start = None
    if start is not None:
        runs.append((start, previous))
    return [run for run in runs if run[1] - run[0] >= 6]


def cell_bbox(pixels, x0: int, x1: int, y0: int, y1: int):
    left = right = top = bottom = None
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if is_background(pixels[x, y]):
                continue
            left = x if left is None else min(left, x)
            right = x if right is None else max(right, x)
            top = y if top is None else min(top, y)
            bottom = y if bottom is None else max(bottom, y)
    if left is None:
        return None
    return (left, top, right, bottom)


def block_phase(all_centres: list[float], pitch: float) -> float:
    """The collage cels sit on one lattice for the whole block: pick the phase
    that puts the most frame centres on a lattice point."""
    best = None
    for step in range(0, int(pitch)):
        error = 0.0
        for centre in all_centres:
            k = round((centre - step) / pitch)
            error += abs(centre - (step + pitch * k))
        if best is None or error < best[0]:
            best = (error, step)
    return best[1]


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
                # White gutters and the pale caption strips.
                pixels[x, y] = (0, 0, 0, 0)
            elif red > 230 and green > 222 and blue > 140 and red - blue > 30:
                pixels[x, y] = (0, 0, 0, 0)
    return out


def median(values: list[float]) -> float:
    ordered = sorted(values)
    return ordered[len(ordered) // 2]


def extract(image: Image.Image, name: str, y0: int, y1: int, pitch: float, columns: int,
            x_min: int, x_max: int):
    """Return rows[direction][frame] = (crop, dx, dy); dx is measured from the
    frame's cel centre, dy from the row's ground line."""
    pixels = image.load()
    height = (y1 - y0 + 1) / DIRECTIONS
    bands = []
    centres = []
    for direction in range(DIRECTIONS):
        top = int(round(y0 + direction * height))
        bottom = int(round(y0 + (direction + 1) * height)) - 1
        runs = row_runs(pixels, image.width, top, bottom, x_min, x_max)
        if len(runs) < columns:
            raise SystemExit(f"{name}: direction {direction} has {len(runs)} frames, expected {columns}")
        bands.append((top, bottom))
        centres.extend((run[0] + run[1]) / 2 for run in runs)
    phase = block_phase(centres, pitch)
    first = phase + pitch * round((min(centres) - phase) / pitch)
    rows = []
    for direction, (top, bottom) in enumerate(bands):
        cells = []
        for index in range(columns):
            centre = first + pitch * index
            x0 = int(round(centre - pitch / 2))
            x1 = int(round(centre + pitch / 2))
            cells.append((cell_bbox(pixels, x0 + 2, x1 - 2, top, bottom), x0))
        deviations = [(box[0] + box[2]) / 2 - (x0 + pitch / 2) for box, x0 in cells if box]
        bias = median(deviations) if deviations else 0
        bottoms = [box[3] for box, _ in cells if box]
        ground = max(bottoms) if bottoms else bottom
        row = []
        for box, x0 in cells:
            if box is None:
                row.append(None)
                continue
            crop = image.crop((box[0], box[1], box[2] + 1, box[3] + 1))
            row.append((crop, (box[0] + box[2]) / 2 - (x0 + pitch / 2) - bias, box[3] - ground))
        rows.append(row)
        print(f"  {name} dir {direction} y{top}-{bottom}: {len(row)} frames")
    return rows


def normalise(rows):
    """Scale one block so its body measures BODY_PIXELS tall."""
    heights = [cell[0].height for row in rows for cell in row if cell]
    scale = BODY_PIXELS / median(heights)
    scaled = []
    for row in rows:
        out = []
        for cell in row:
            if cell is None:
                out.append(None)
                continue
            crop, dx, dy = cell
            art = key(crop)
            art = art.resize((max(1, round(art.width * scale)), max(1, round(art.height * scale))), Image.LANCZOS)
            out.append((art, dx * scale, dy * scale))
        scaled.append(out)
    return scaled, scale


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="supplied Regurgitator sprite page")
    args = parser.parse_args()
    if not args.source.is_file():
        raise FileNotFoundError(f"Missing Regurgitator sprite page: {args.source}")

    image = Image.open(args.source).convert("RGB")

    bands: dict[str, list[list[tuple[Image.Image, float, float] | None]]] = {}
    for name, y0, y1, pitch, columns, x_min, x_max in BLOCKS:
        rows = extract(image, name, y0, y1, pitch, columns, x_min, x_max)
        bands[name], scale = normalise(rows)
        print(f"{name}: 8 directions x {columns} frames, normalised x{scale:.2f}")

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
    preview.save(PREVIEW_DIR / "regurgitator-directions.png")
    strip = Image.new("RGBA", (COLUMNS * CELL_OUT, 2 * CELL_OUT), (24, 24, 24, 255))
    for band_index in range(2):
        for index in range(COLUMNS):
            strip.alpha_composite(
                sheet.crop((index * CELL_OUT, (band_index * DIRECTIONS + 4) * CELL_OUT,
                            (index + 1) * CELL_OUT, (band_index * DIRECTIONS + 5) * CELL_OUT)),
                (index * CELL_OUT, band_index * CELL_OUT),
            )
    strip.save(PREVIEW_DIR / "regurgitator-frames.png")


if __name__ == "__main__":
    main()
