"""Split Act I's monastery courtyard walls out of the painted backdrop.

The Act I preset is a single flat image, so the player was drawn over every
wall and could walk straight through them.  This tool cuts the four wall bands
into narrow sprites (packed into one atlas) and writes a collision mask from the
same opaque wall pixels.  The runtime draws each sprite at its own depth and
uses the mask for movement, so a wall occludes an actor standing behind it and
blocks the hero at its base.  The courtyard gate at the bottom vertex stays
passable because the source art is transparent there.

Usage:
    python tools/build_act1_monastery_walls.py
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "maps"
BACKDROP = ASSET_ROOT / "act1-barracks.png"
ATLAS = ASSET_ROOT / "act1-monastery-walls.png"
LAYOUT = ASSET_ROOT / "act1-monastery-walls.json"
COLLISION = ASSET_ROOT / "act1-monastery-walls-collision.png"

# Screen-space wall bands in the 520x300 backdrop.  They follow the authored
# outer faces and include the taller rear wall pieces that rise above the roof
# line.  Overlaps at the corners are intentional; the depth sort resolves them.
WALL_BANDS = (
    [(42, 0), (272, 0), (272, 76), (42, 178)],
    [(252, 0), (478, 0), (478, 178), (252, 76)],
    [(42, 164), (274, 244), (274, 305), (42, 212)],
    [(252, 244), (478, 164), (478, 212), (252, 305)],
)
STRIP_WIDTH = 32

# The gate walkway is keyed out of the backdrop (transparent floor tiles) inside
# this small screen-space area.  The whole rectangle is *not* walkable: only the
# transparent tiles within it form the diagonal gate path.
GATE_CARVE_AREA = (186, 260, 256, 300)


def wall_mask(size: tuple[int, int]) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    for polygon in WALL_BANDS:
        draw.polygon(polygon, fill=255)
    return mask


def build_collision(source: Image.Image, bands: Image.Image) -> Image.Image:
    """Keep opaque wall pixels inside the bands, closing small window holes."""
    alpha = source.getchannel("A")
    collision = Image.new("L", source.size, 0)
    collision.paste(alpha, (0, 0), bands)
    # Join the art's one-pixel gaps without sealing the courtyard gate.
    collision = collision.filter(ImageFilter.MaxFilter(5))
    # MaxFilter grows the surrounding wall over the narrow keyed tiles, so
    # re-open only the keyed path inside the gate area.  The transparent
    # walkway tiles are separated by one-pixel paving seams; close those seams
    # so the corridor stays continuous, while the thick gateposts and wall
    # faces remain blocked instead of being cut open by a rectangle.
    gate_area = Image.new("L", source.size, 0)
    ImageDraw.Draw(gate_area).rectangle(GATE_CARVE_AREA, fill=255)
    transparent = alpha.point(lambda value: 255 if value == 0 else 0)
    keyed_path = ImageChops.multiply(gate_area, transparent)
    keyed_path = keyed_path.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    collision = ImageChops.subtract(collision, keyed_path)
    # Guard both halves of the gate alignment: the door's anchor pixel must be
    # walkable, and the old shortcut through the painted wall face must not be.
    if collision.getpixel((228, 274)) > 127:
        raise SystemExit("Act I gate anchor is not walkable")
    if collision.getpixel((260, 252)) <= 127:
        raise SystemExit("Act I wall face is open")
    if collision.getpixel((242, 260)) > 127:
        raise SystemExit("Act I gate walkway is not open")
    if collision.getpixel((224, 260)) <= 127:
        raise SystemExit("Act I opaque gatepost is open")
    return collision


def main() -> int:
    source = Image.open(BACKDROP).convert("RGBA")
    width, height = source.size
    bands = wall_mask((width, height))
    collision = build_collision(source, bands)
    collision.save(COLLISION)

    left = top = 10**9
    right = bottom = 0
    for polygon in WALL_BANDS:
        for x, y in polygon:
            left, top = min(left, x), min(top, y)
            right, bottom = max(right, x), max(bottom, y)
    left, top = max(0, left), max(0, top)
    right, bottom = min(width, right), min(height, bottom)

    # One sprite per vertical strip of each wall band.  Strips avoid a single
    # wall spanning the whole courtyard at one depth, which would hide actors
    # standing well in front of the far end of that wall.
    sprites: list[tuple[Image.Image, dict]] = []
    for band_index, polygon in enumerate(WALL_BANDS):
        band = Image.new("L", (width, height), 0)
        ImageDraw.Draw(band).polygon(polygon, fill=255)
        band_left = min(x for x, _ in polygon)
        band_right = max(x for x, _ in polygon)
        x = band_left
        while x < band_right:
            strip_width = min(STRIP_WIDTH, band_right - x)
            bounds = (x, top, x + strip_width, bottom)
            cut = source.crop(bounds)
            cut_alpha = cut.getchannel("A")
            strip_band = band.crop(bounds)
            alpha = Image.new("L", cut.size, 0)
            alpha.paste(cut_alpha, (0, 0), strip_band)
            if alpha.getbbox():
                sprite = cut.copy()
                sprite.putalpha(alpha)
                depth_pixels = alpha.crop((0, 0, alpha.width, alpha.height))
                depth_bbox = depth_pixels.getbbox() or (0, 0, strip_width, bottom - top)
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
