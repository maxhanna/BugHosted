"""Import the Leaper sprite page as an 8-direction walk + attack atlas.

The supplied page ("Leaper.gif" in Desktop/d2/d2 enemies) is a collage of
labelled animation blocks - Death, Attack 1, Get Hit, Attack 2 - plus two
uncaptioned panels that hold the walk and neutral cycles. Only the blocks the
renderer needs are declared here:

  walk    the right-hand panel of the "Get Hit" row: 8 directions x 9 frames
  attack  the "Attack 1" block: 8 directions x 20 frames

Every block sits at its own offset, cell pitch and zoom, so its geometry is
declared instead of guessed. Frames keep the offset they have inside their own
cell so the hop and the lunge the artist drew survive, and both bands are
normalised to one body size so the creature does not change scale when it
switches animation.

  rows 0-7   walk,   8 directions x 9 frames
  rows 8-15  attack, 8 directions x 20 frames

Run from the client directory:
  python tools/import_d2_leaper_animations.py
"""

import argparse
import os

from PIL import Image

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ATLAS_DIR = r"C:\Users\Saint\Desktop\d2\d2 enemies"
OUT_DIR = os.path.join(HERE, "src", "assets", "d2survivors", "enemies", "animated")
PREVIEW_DIR = os.path.join(HERE, "probe")
ATLAS = "PC _ Computer - Diablo 2 _ Diablo 2_ Lord of Destruction - Enemies & Bosses - Leaper.gif"

DIRECTIONS = 8
CELL_OUT = 120
BODY_PIXELS = 76

# y runs are the full 8-row band of a block; pitch and cols come from the
# evenly spaced frame lattice measured inside it.
SPECIES = {
    "leaper": {
        "atlas": ATLAS,
        "move": {"y": (1408, 1905), "pitch": 90.8, "cols": 9, "x_min": 1232, "x_max": 2020},
        "attack": {"y": (620, 1392), "pitch": 80.9, "cols": 20, "x_min": 0, "x_max": 1640},
    },
}


def atlas_path(name):
    return os.path.join(ATLAS_DIR, name)


def is_background(colour):
    red, green, blue = colour
    if max(abs(red - 170), abs(green - 170), abs(blue - 170)) <= 14:
        return True
    # caption bands, gutters and the pale page background
    return red > 232 and green > 226 and blue > 128


def row_runs(pixels, width, y0, y1, x_min, x_max):
    runs = []
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


def cell_bbox(pixels, x0, x1, y0, y1):
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


def block_phase(all_centres, pitch):
    """The collage cells sit on one lattice per block: pick the phase that puts
    the most frame centres on a lattice point."""
    best = None
    for step in range(0, int(pitch)):
        error = 0.0
        for centre in all_centres:
            k = round((centre - step) / pitch)
            error += abs(centre - (step + pitch * k))
        if best is None or error < best[0]:
            best = (error, step)
    return best[1]


def direction_bands(pixels, block):
    """Find the eight direction rows by their ink, which cleanly separates them
    inside the panel; an even split of the panel height drifts by a few pixels
    and shaves the top frame of some rows."""
    y0, y1 = block["y"]
    x_min, x_max = block.get("x_min", 0), block["x_max"]
    bands = []
    start = None
    for y in range(y0, y1 + 1):
        hit = any(not is_background(pixels[x, y]) for x in range(x_min, x_max, 2))
        if hit:
            if start is None:
                start = y
            last = y
        elif start is not None:
            bands.append((start, last))
            start = None
    if start is not None:
        bands.append((start, last))
    # stray caption pixels above the panel are not a direction row
    bands = [band for band in bands if band[1] - band[0] >= 4]
    if len(bands) != DIRECTIONS:
        raise SystemExit(f"expected {DIRECTIONS} direction rows, found {len(bands)}: {bands}")
    return bands


def extract(image, block):
    """rows[direction][frame] = (crop, dx, dy), dx from the frame's cell origin
    and dy from the row's ground line."""
    pixels = image.load()
    width = image.width
    pitch = block["pitch"]
    detected = direction_bands(pixels, block)
    centres = []
    for direction, (top, bottom) in enumerate(detected):
        runs = row_runs(pixels, width, top, bottom, block.get("x_min", 0), block["x_max"])
        if not runs:
            raise SystemExit(f"no art in direction {direction} of {block}")
        centres.extend((run[0] + run[1]) / 2 for run in runs)
    phase = block_phase(centres, pitch)
    first = phase + pitch * round((min(centres) - phase) / pitch)
    rows = []
    for direction, (top, bottom) in enumerate(detected):
        cells = []
        for index in range(block["cols"]):
            centre = first + pitch * index
            x0 = int(round(centre - pitch / 2))
            x1 = int(round(centre + pitch / 2))
            cells.append((cell_bbox(pixels, x0 + 2, x1 - 2, top, bottom), x0))
        # Offsets are measured against each frame's own cell centre and the row's
        # ground line, so the motion the artist drew survives instead of the
        # padding, which differs cell to cell.
        deviations = [(box[0] + box[2]) / 2 - (x0 + pitch / 2) for box, x0 in cells if box]
        bias = sorted(deviations)[len(deviations) // 2] if deviations else 0
        bottoms = [box[3] for box, _ in cells if box]
        ground = max(bottoms) if bottoms else bottom
        row = []
        for (box, x0) in cells:
            if box is None:
                row.append(None)
                continue
            crop = image.crop((box[0], box[1], box[2] + 1, box[3] + 1))
            row.append((crop, (box[0] + box[2]) / 2 - (x0 + pitch / 2) - bias, box[3] - ground))
        stride = block.get("stride", 1)
        rows.append([cell for index, cell in enumerate(row) if index % stride == 0])
        print(f"   dir {direction} y{top}-{bottom} phase {first} -> {len(rows[-1])} frames")
    return rows


def key(crop):
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


def normalise(rows):
    """Scale one block so its body measures BODY_PIXELS tall, with offsets
    scaled to match."""
    heights = [cell[0].height for row in rows for cell in row if cell]
    scale = BODY_PIXELS / sorted(heights)[len(heights) // 2]
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    for species, config in SPECIES.items():
        image = Image.open(atlas_path(config["atlas"])).convert("RGB")
        bands = {}
        for band in ("move", "attack"):
            print(f"== {species} {band}")
            rows = extract(image, config[band])
            bands[band], scale = normalise(rows)
            print(f"   normalised x{scale:.2f} -> {len(rows[0])} frames")
        offsets = [cell for rows in bands.values() for row in rows for cell in row if cell]
        left = min(cx - art.width / 2 for art, cx, _ in offsets)
        right = max(cx + art.width / 2 for art, cx, _ in offsets)
        up = min(dy - art.height for art, _, dy in offsets)
        span_w, span_h = right - left, -up
        fit = min(CELL_OUT * 0.98 / span_w, CELL_OUT * 0.98 / span_h)
        columns = max(len(rows[0]) for rows in bands.values())
        sheet = Image.new("RGBA", (columns * CELL_OUT, DIRECTIONS * 2 * CELL_OUT), (0, 0, 0, 0))
        for band_index, band in enumerate(("move", "attack")):
            for direction, row in enumerate(bands[band]):
                for index, cell in enumerate(row):
                    if cell is None:
                        continue
                    art, cx, dy = cell
                    art = art.resize((max(1, round(art.width * fit)), max(1, round(art.height * fit))), Image.LANCZOS)
                    x = index * CELL_OUT + round((cx - left) * fit + (CELL_OUT - span_w * fit) / 2 - art.width / 2)
                    y = (band_index * DIRECTIONS + direction) * CELL_OUT + round((dy - up) * fit + (CELL_OUT - span_h * fit) / 2 - art.height)
                    sheet.alpha_composite(art, (x, y))
        path = os.path.join(OUT_DIR, f"{species}.png")
        sheet.save(path)
        print(f"== {path} {sheet.size} columns {columns}")
        preview = Image.new("RGBA", (DIRECTIONS * CELL_OUT, 2 * CELL_OUT), (24, 24, 24, 255))
        for band_index in range(2):
            for direction in range(DIRECTIONS):
                box = (0, (band_index * DIRECTIONS + direction) * CELL_OUT, CELL_OUT, (band_index * DIRECTIONS + direction + 1) * CELL_OUT)
                preview.alpha_composite(sheet.crop(box), (direction * CELL_OUT, band_index * CELL_OUT))
        preview.save(os.path.join(PREVIEW_DIR, f"{species}-directions.png"))
        strip = Image.new("RGBA", (columns * CELL_OUT, 2 * CELL_OUT), (24, 24, 24, 255))
        for band_index in range(2):
            for index in range(columns):
                box = (index * CELL_OUT, (band_index * DIRECTIONS + 4) * CELL_OUT, (index + 1) * CELL_OUT, (band_index * DIRECTIONS + 5) * CELL_OUT)
                strip.alpha_composite(sheet.crop(box), (index * CELL_OUT, band_index * CELL_OUT))
        strip.save(os.path.join(PREVIEW_DIR, f"{species}-frames.png"))


if __name__ == "__main__":
    main()
