"""Import the original Diablo II town portal as a red portal sheet.

The red portal the game opens between acts is not a new drawing: it is the
original D2R town-portal animation (`tp`, HD lit/open loop) recoloured to red.
The town portal's blue body is a good fit for the red portal's shape and motion,
and keeping the real 15-frame loop means the flames animate exactly like the
object in the game instead of being approximated with canvas shapes.

The units palette is stored as BGR triples in the extraction, so it is swapped
back to RGB before the hue is moved to red. Hue is reset while saturation and
value are preserved, which keeps the white-hot core and the shaded flame edges.
The HD frame also carries an opaque black matte that D2 renders transparent, so
that connected edge is keyed out without erasing the portal's enclosed shadows.

Outputs:

* `assets/d2survivors/objects/red-portal.png` - a horizontal 15-frame sheet;
* `src/app/d2survivors/d2-portal-assets.generated.ts` - path, cell size and
  the object origin within each cell.

Usage:
    python tools/import_d2r_portal_art.py
"""

from __future__ import annotations

import colorsys
import sys
from collections import deque
from pathlib import Path

import d2r_dcc as dcc
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSET_PATH = Path("assets/d2survivors/objects/red-portal.png")
GENERATED_MAP = PROJECT_ROOT / "src" / "app" / "d2survivors" / "d2-portal-assets.generated.ts"
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"

PORTAL_ANIMATION = ("global", "objects", "tp", "hd", "tphdlitonhth.dcc")
# The HD render bakes an opaque black matte around the portal. D2 treats that
# matte as transparent; key the near-black pixels connected to the transparent
# edge while preserving any enclosed dark shading inside the portal.
BLACK_KEY_THRESHOLD = 64


def load_palette(path: Path) -> list[tuple[int, int, int]]:
    """Read a D2 palette, whose on-disk triples are BGR, as RGB."""
    return [(blue, green, red) for red, green, blue in dcc.load_palette(path)]


def redden(palette: list[tuple[int, int, int]]) -> list[tuple[int, int, int]]:
    """Move every palette colour to the red hue, keeping its light and shade."""
    recoloured = []
    for red, green, blue in palette:
        _, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
        out_red, out_green, out_blue = colorsys.hsv_to_rgb(0.0, saturation, min(1.0, value * 1.05))
        recoloured.append((round(out_red * 255), round(out_green * 255), round(out_blue * 255)))
    return recoloured


def key_out_outer_black(image: Image.Image, threshold: int = BLACK_KEY_THRESHOLD) -> Image.Image:
    """Remove the opaque black matte connected to the frame's transparency."""
    pixels = image.load()
    width, height = image.size
    outside = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()
    for y in range(height):
        for x in range(width):
            if pixels[x, y][3] != 0:
                continue
            outside[y * width + x] = 1
            queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        for next_x, next_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if not (0 <= next_x < width and 0 <= next_y < height):
                continue
            index = next_y * width + next_x
            if outside[index]:
                continue
            red, green, blue, alpha = pixels[next_x, next_y]
            if alpha == 0 or max(red, green, blue) > threshold:
                outside[index] = 1
                continue
            pixels[next_x, next_y] = (red, green, blue, 0)
            outside[index] = 1
            queue.append((next_x, next_y))

    return image


def build_sheet(source: Path) -> tuple[Image.Image, dict[str, int]]:
    animation = dcc.parse(source.joinpath(*PORTAL_ANIMATION).read_bytes())
    direction = animation["dirs"][0]
    palette = redden(load_palette(source / "global" / "palette" / "units" / "pal.dat"))

    box_x, box_y, cell_width, cell_height = direction["box"]
    frames = len(direction["frames"])
    sheet = Image.new("RGBA", (cell_width * frames, cell_height), (0, 0, 0, 0))
    for index, (frame, bitmap) in enumerate(zip(direction["frames"], direction["bitmaps"])):
        image = key_out_outer_black(dcc.frame_image(bitmap, frame["width"], frame["height"], palette))
        sheet.alpha_composite(image, (index * cell_width + frame["xmin"] - box_x,
                                      frame["ymin"] - box_y))

    return sheet, {
        "frameWidth": cell_width,
        "frameHeight": cell_height,
        "frames": frames,
        "anchorX": -box_x,
        "anchorY": -box_y,
    }


def main() -> int:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    sheet, meta = build_sheet(source)

    output = PROJECT_ROOT / "src" / ASSET_PATH
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, "PNG", optimize=True)

    lines = [
        "// Generated by tools/import_d2r_portal_art.py. Do not edit by hand.",
        "// Original D2R town-portal loop, recoloured red for the act portal.",
        "",
        "export const D2_PORTAL_ART = {",
        f'  path: "{ASSET_PATH.as_posix()}",',
        f'  frameWidth: {meta["frameWidth"]},',
        f'  frameHeight: {meta["frameHeight"]},',
        f'  frames: {meta["frames"]},',
        f'  anchorX: {meta["anchorX"]},',
        f'  anchorY: {meta["anchorY"]},',
        "} as const;",
        "",
    ]
    GENERATED_MAP.write_text("\n".join(lines), encoding="utf-8")

    print(f"portal: {meta['frames']} frames of {meta['frameWidth']}x{meta['frameHeight']} "
          f"-> {ASSET_PATH.as_posix()} ({sheet.width}x{sheet.height})")
    print(f"origin: {meta['anchorX']},{meta['anchorY']} within each frame")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
