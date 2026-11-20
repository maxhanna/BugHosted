"""Split Act V's Worldstone Keep walls out of the painted backdrop.

The Frigid Highlands and the rest of Act V share one flat Worldstone backdrop,
so the hero was drawn over every wall and could walk straight through the
central courtyard's stone faces.  This tool cuts the authored wall structures
into narrow sprites (packed into one atlas) and writes a collision mask from the
floor edge of each wall.  The runtime draws each sprite at its own depth and
uses the mask for movement, so a wall occludes an actor standing behind it and
blocks the hero at its footprint without turning the whole projected wall face
into an invisible obstacle.

Usage:
    python tools/build_act5_worldstone_walls.py
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "maps"
BACKDROP = ASSET_ROOT / "act5-worldstone.png"
ATLAS = ASSET_ROOT / "act5-worldstone-walls.png"
LAYOUT = ASSET_ROOT / "act5-worldstone-walls.json"
COLLISION = ASSET_ROOT / "act5-worldstone-walls-collision.png"

# Screen-space wall faces in the 600x340 backdrop.  The central courtyard is
# bounded by the tall far wall, its two inner side walls and the lower corner
# battlements.  These bands cut the visual sprites; they are deliberately much
# taller than the collision footprint because a wall's face is vertical.
WALL_BANDS = (
    # Far wall and its pair of gate towers.
    [(160, 118), (166, 64), (178, 44), (206, 44), (216, 66), (252, 82),
     (268, 60), (300, 46), (332, 60), (348, 82), (384, 66), (394, 44),
     (422, 44), (434, 64), (440, 118), (440, 145), (160, 145)],
    # Inner left wall, running from the far corner down to the lower courtyard.
    [(148, 120), (214, 120), (214, 142), (208, 168), (202, 195),
     (192, 222), (175, 238), (148, 238)],
    # Inner right wall.
    [(386, 120), (452, 120), (452, 238), (425, 238), (408, 222),
     (398, 195), (392, 168), (386, 142)],
    # Outer left battlements and lower corner tower.
    [(80, 112), (160, 112), (168, 132), (160, 160), (150, 198),
     (155, 225), (140, 255), (95, 258), (80, 235), (85, 205), (78, 170)],
    # Outer right battlements and lower corner tower.
    [(440, 112), (520, 112), (522, 170), (515, 205), (520, 235),
     (505, 258), (460, 255), (445, 225), (450, 198), (440, 160), (432, 132)],
    # Lower-left buttress.
    [(130, 195), (170, 195), (180, 230), (165, 260), (115, 265),
     (90, 245), (100, 215)],
    # Lower-right buttress.
    [(430, 195), (470, 195), (500, 215), (510, 245), (485, 265),
     (435, 260), (420, 230)],
)
# The floor edge of each wall face, in the same 600x340 backdrop space.  These
# are the lines where the courtyard's walkable ground meets the stone.  Only
# these narrow footprints block movement: using the full face polygons would
# turn the projected wall into a large invisible obstacle over visible floor.
# The south side stays open as the courtyard entrance.
WALL_FLOOR_EDGES = (
    ((160, 140), (440, 140)),
    ((216, 140), (196, 230)),
    ((384, 140), (404, 230)),
    ((158, 220), (97, 254)),
    ((442, 220), (503, 254)),
)
STRIP_WIDTH = 32


def band_mask(size: tuple[int, int], polygon: list[tuple[int, int]]) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    return mask


def build_collision(source: Image.Image) -> Image.Image:
    """Draw only the floor edge of each wall, not its projected face."""
    collision = Image.new("L", source.size, 0)
    draw = ImageDraw.Draw(collision)
    for start, end in WALL_FLOOR_EDGES:
        draw.line([start, end], fill=255, width=6)
        # Seal the wall ends so the body cannot squeeze around a corner post.
        for x, y in (start, end):
            draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill=255)
    # Join the art's one-pixel gaps along the authored edge without growing the
    # footprint back into the courtyard.
    collision = collision.filter(ImageFilter.MaxFilter(3))
    if collision.getpixel((300, 170)) > 127:
        raise SystemExit("Act V courtyard spawn point is not walkable")
    if collision.getpixel((300, 138)) <= 127:
        raise SystemExit("Act V far wall footprint is open")
    if collision.getpixel((210, 170)) <= 127:
        raise SystemExit("Act V left wall footprint is open")
    if collision.getpixel((390, 170)) <= 127:
        raise SystemExit("Act V right wall footprint is open")
    if collision.getpixel((300, 245)) > 127:
        raise SystemExit("Act V courtyard entrance is blocked")
    return collision


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
