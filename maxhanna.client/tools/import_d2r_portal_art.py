"""Import the original Diablo II town portal as red and blue portal sheets.

Neither portal is a new drawing: both are the original D2R town-portal animation
(`tp`, HD lit/open loop). The red sheet is the act portal the game opens between
acts, and the blue sheet is the area portal the hero crosses from one zone to the
next. Keeping the real 15-frame loop means the flames animate exactly like the
object in the game instead of being approximated with canvas shapes.

The units palette is stored as BGR triples in the extraction, so it is swapped
back to RGB before the hue is moved. Hue is reset while saturation and value are
preserved, which keeps the white-hot core and the shaded flame edges.
The HD frame also carries an opaque black matte that D2 renders transparent, so
that connected edge is keyed out without erasing the portal's enclosed shadows.

Outputs:

* `assets/d2survivors/objects/red-portal.png` - a horizontal 15-frame sheet;
* `assets/d2survivors/objects/blue-portal.png` - the same loop in blue;
* `src/app/d2survivors/d2-portal-assets.generated.ts` - both paths, cell size and
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

# (constant, asset path, hue) per sheet. 0.0 is red, 0.58 is the town portal's blue.
PORTAL_VARIANTS = (
    ("D2_PORTAL_ART", Path("assets/d2survivors/objects/red-portal.png"), 0.0),
    ("D2_BLUE_PORTAL_ART", Path("assets/d2survivors/objects/blue-portal.png"), 0.58),
)
PROJECT_ROOT = Path(__file__).resolve().parents[1]
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


def recolour(palette: list[tuple[int, int, int]], hue: float) -> list[tuple[int, int, int]]:
    """Move every palette colour to `hue`, keeping its light and shade."""
    recoloured = []
    for red, green, blue in palette:
        _, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
        out_red, out_green, out_blue = colorsys.hsv_to_rgb(hue, saturation, min(1.0, value * 1.05))
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


def build_sheet(source: Path, hue: float) -> tuple[Image.Image, dict[str, int]]:
    animation = dcc.parse(source.joinpath(*PORTAL_ANIMATION).read_bytes())
    direction = animation["dirs"][0]
    palette = recolour(load_palette(source / "global" / "palette" / "units" / "pal.dat"), hue)

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
    lines = [
        "// Generated by tools/import_d2r_portal_art.py. Do not edit by hand.",
        "// Original D2R town-portal loop, recoloured red for the act portal and blue for",
        "// the area portal that carries the hero from one zone to the next.",
        "",
    ]
    for constant, asset_path, hue in PORTAL_VARIANTS:
        sheet, meta = build_sheet(source, hue)
        output = PROJECT_ROOT / "src" / asset_path
        output.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(output, "PNG", optimize=True)
        lines.extend([
            f"export const {constant} = {{",
            f'  path: "{asset_path.as_posix()}",',
            f'  frameWidth: {meta["frameWidth"]},',
            f'  frameHeight: {meta["frameHeight"]},',
            f'  frames: {meta["frames"]},',
            f'  anchorX: {meta["anchorX"]},',
            f'  anchorY: {meta["anchorY"]},',
            "} as const;",
            "",
        ])
        print(f"portal {constant}: {meta['frames']} frames of "
              f"{meta['frameWidth']}x{meta['frameHeight']} -> {asset_path.as_posix()} "
              f"({sheet.width}x{sheet.height})")
        print(f"origin: {meta['anchorX']},{meta['anchorY']} within each frame")
    GENERATED_MAP.write_text("\n".join(lines), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
