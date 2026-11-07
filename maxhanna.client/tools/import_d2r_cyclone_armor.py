"""Build the Cyclone Armor aura sheet from the D2R overlay extraction.

Cyclone Armor is drawn in Diablo II as six overlay layers in
`Desktop/d2/d2r extract/data/global/overlays/expansion`: three wind bands (a, b,
c), each split into a back and a front half. Every layer is a single-direction
eleven-frame DCC whose frames are positioned in unit space, with the
character's feet at (0, 0), so this importer composites all six layers onto one
shared cell and publishes them as a six-row atlas the runtime plays in step,
drawing the even rows behind the druid and the odd rows in front.

The source cels are a near-grayscale palette. They are recoloured here to the
pale blue-white of the in-game aura, with dark outlines kept translucent, so
the runtime can draw the sheet additively around the druid.

Usage:
    python tools/import_d2r_cyclone_armor.py
    python tools/import_d2r_cyclone_armor.py --out probe/cyclone-armor.png
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

import d2r_dcc as dcc

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "auras" / "cyclone-armor.png"
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"

# Even rows are the back halves and odd rows the front halves, matching the
# order the original game draws them around the character.
LAYERS = (
    "cyclonearmoraback", "cyclonearmorafront",
    "cyclonearmorbback", "cyclonearmorbfront",
    "cyclonearmorcback", "cyclonearmorcfront",
)
FRAME_COUNT = 11
# A 96px square holds the whole 70x68 unit-space box with a small margin. The
# origin marks where the character's feet sit inside every cel, so all rows line
# up when the runtime draws them at the same ground point.
CELL = 96
ORIGIN = (48, 78)


def tint(image: Image.Image) -> Image.Image:
    """Recolour the grayscale wind streaks to the aura's pale blue-white."""
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                continue
            luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
            pixels[x, y] = (
                round(90 + 165 * luminance),
                round(160 + 95 * luminance),
                round(200 + 55 * luminance),
                # Fade the dark cel outlines so additive blending keeps the
                # streaks airy instead of reading as solid tubes.
                round(alpha * (0.45 + 0.55 * luminance)),
            )
    return image


def build_layer(path: Path, palette: list[tuple[int, int, int]]) -> list[Image.Image]:
    """Composite one overlay DCC's frames at their unit-space offsets."""
    animation = dcc.parse(path.read_bytes())
    direction = animation["dirs"][0]
    if len(direction["frames"]) < FRAME_COUNT:
        raise ValueError(f"{path.name} has {len(direction['frames'])} frames, expected {FRAME_COUNT}")
    frames: list[Image.Image] = []
    for index, frame in enumerate(direction["frames"][:FRAME_COUNT]):
        cel = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        cel.alpha_composite(
            dcc.frame_image(direction["bitmaps"][index], frame["width"], frame["height"], palette),
            (ORIGIN[0] + frame["xmin"], ORIGIN[1] + frame["ymin"]),
        )
        frames.append(cel)
    return frames


def build(source: Path, output: Path) -> str:
    overlay_dir = source / "global" / "overlays" / "expansion"
    palette = dcc.load_palette(source / "global" / "palette" / "units" / "pal.dat")
    sheet = Image.new("RGBA", (FRAME_COUNT * CELL, len(LAYERS) * CELL), (0, 0, 0, 0))
    for row, name in enumerate(LAYERS):
        frames = build_layer(overlay_dir / f"{name}.dcc", palette)
        for column, cel in enumerate(frames):
            sheet.alpha_composite(tint(cel), (column * CELL, row * CELL))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output)
    return f"{output.relative_to(PROJECT_ROOT)}: {sheet.width}x{sheet.height}, cell {CELL}x{CELL}, " \
           f"{FRAME_COUNT} frames x {len(LAYERS)} layers"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--out", type=Path, default=OUTPUT)
    args = parser.parse_args(argv)
    if not (args.source / "global" / "overlays" / "expansion").is_dir():
        print(f"missing overlay extraction: {args.source / 'global' / 'overlays' / 'expansion'}")
        return 1
    print(build(args.source, args.out))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
