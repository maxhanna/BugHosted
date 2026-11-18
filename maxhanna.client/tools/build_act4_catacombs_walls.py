"""Split Act IV's catacombs walls out of the painted backdrop.

The Chaos Sanctuary preset is one flat image, so the hero was drawn over every
wall and could walk straight through them.  This tool cuts the four wall faces
into narrow sprites (packed into one atlas) and writes a collision mask from the
same opaque wall pixels.  The runtime draws each sprite at its own depth and uses
the mask for movement, so a wall occludes an actor standing behind it and blocks
the hero at its base.

Usage:
    python tools/build_act4_catacombs_walls.py
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "maps"
BACKDROP = ASSET_ROOT / "act4-catacombs.png"
ATLAS = ASSET_ROOT / "act4-catacombs-walls.png"
LAYOUT = ASSET_ROOT / "act4-catacombs-walls.json"
COLLISION = ASSET_ROOT / "act4-catacombs-walls-collision.png"

# Screen-space wall faces in the 600x300 backdrop.  Each polygon follows the
# authored stone face: the far pair rises above the floor, the near pair rises
# from the bottom vertex.  Overlaps at the corners are intentional; the depth
# sort resolves them.
WALL_BANDS = (
    [(122, 135), (274, 82), (300, 26), (150, 82)],
    [(300, 26), (450, 82), (478, 135), (326, 82)],
    [(60, 145), (282, 242), (300, 287), (60, 196)],
    [(540, 145), (318, 244), (300, 287), (540, 196)],
)
STRIP_WIDTH = 32


def band_mask(size: tuple[int, int], polygon: list[tuple[int, int]]) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    return mask


def build_collision(source: Image.Image) -> Image.Image:
    """Keep the backdrop's opaque stone inside each wall face."""
    alpha = source.getchannel("A")
    collision = Image.new("L", source.size, 0)
    for polygon in WALL_BANDS:
        collision.paste(alpha, (0, 0), band_mask(source.size, polygon))
    # Join the art's one-pixel gaps so the hero cannot slip between wall
    # blocks, without growing the footprint into the open floor.
    return collision.filter(ImageFilter.MaxFilter(3))


def main() -> int:
    source = Image.open(BACKDROP).convert("RGBA")
    width, height = source.size
    collision = build_collision(source)
    collision.save(COLLISION)

    top = min(y for polygon in WALL_BANDS for _, y in polygon)
    bottom = max(y for polygon in WALL_BANDS for _, y in polygon)

    # One sprite per vertical strip of each wall face.  Strips avoid a single
    # wall spanning the whole room at one depth, which would hide actors
    # standing well in front of the far end of that wall.
    sprites: list[tuple[Image.Image, dict]] = []
    for band_index, polygon in enumerate(WALL_BANDS):
        band = band_mask((width, height), polygon)
        band_left = min(x for x, _ in polygon)
        band_right = max(x for x, _ in polygon)
        x = band_left
        while x < band_right:
            strip_width = min(STRIP_WIDTH, band_right - x)
            bounds = (x, top, x + strip_width, bottom)
            cut = source.crop(bounds)
            strip_band = band.crop(bounds)
            alpha = Image.new("L", cut.size, 0)
            alpha.paste(cut.getchannel("A"), (0, 0), strip_band)
            if alpha.getbbox():
                sprite = cut.copy()
                sprite.putalpha(alpha)
                depth_bbox = alpha.getbbox() or (0, 0, strip_width, bottom - top)
                sprites.append((sprite, {
                    "x": x,
                    "y": top,
                    "w": sprite.width,
                    "h": sprite.height,
                    "depth": top + depth_bbox[3],
                    "order": band_index * 100 + x,
                }))
            x += STRIP_WIDTH

    atlas_width = 512
    cursor_x = cursor_y = row_height = 0
    placements: list[tuple[int, int]] = []
    for sprite, _ in sprites:
        if cursor_x + sprite.width > atlas_width:
            cursor_x = 0
            cursor_y += row_height
            row_height = 0
        placements.append((cursor_x, cursor_y))
        cursor_x += sprite.width
        row_height = max(row_height, sprite.height)
    atlas = Image.new("RGBA", (atlas_width, cursor_y + row_height), (0, 0, 0, 0))
    instances = []
    for (sprite, instance), (sx, sy) in zip(sprites, placements):
        atlas.alpha_composite(sprite, (sx, sy))
        instance["sx"] = sx
        instance["sy"] = sy
        instances.append(instance)
    atlas.save(ATLAS)

    layout = {
        "atlasWidth": atlas.width,
        "atlasHeight": atlas.height,
        "backdropWidth": width,
        "backdropHeight": height,
        "instances": sorted(instances, key=lambda instance: instance["order"]),
    }
    LAYOUT.write_text(json.dumps(layout, separators=(",", ":")), encoding="utf-8")
    print(f"backdrop {width}x{height}")
    print(f"atlas {atlas.width}x{atlas.height}, {len(instances)} wall strips -> {ATLAS}")
    print(f"collision -> {COLLISION}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
