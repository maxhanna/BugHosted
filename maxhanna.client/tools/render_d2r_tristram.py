"""Render Diablo II's original Tristram map with the D2R classic tile data.

Act 8 previously reused an Act I outdoor floor atlas and the Barracks artwork,
which is why Uber Tristram did not read as Tristram.  The D2R extraction ships
the real ``tri_town4.ds1`` preset and the DT1 sets it names, including
``act1/tristram/town.dt1``.  This tool decodes those classic tiles with the Act I
palette and renders a cropped region of the town for use as the Act 8 backdrop.
It also writes a 4x4 fallback atlas from the same map's most common floors and
a packed upper-wall atlas plus backdrop-relative placements so the runtime can
depth-sort the town walls over actors.

The renderer follows the layer order used by the game's editor: lower walls,
floors, shadows, upper walls/objects, and roofs.  It also composites the
DS1 object list's solid props (the gibbet, corpses and other landmarks) from
their original DCC art; the central fountain is part of the town tile set.

Usage:
    python tools/render_d2r_tristram.py
    python tools/render_d2r_tristram.py --preview .tmp-tristram-full.png
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import struct
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

import d2r_dcc

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "maps"
TILE_ROOT = ASSET_ROOT / "tiles"
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"

DS1_RELATIVE = Path("global/tiles/act1/tristram/tri_town4.ds1")
OBJECT_PRESET_RELATIVE = Path("global/excel/objpreset.txt")
OBJECT_TYPE_RELATIVE = Path("global/excel/objtype.txt")
OBJECT_ART_RELATIVE = Path("global/objects")
OBJECT_PALETTE_RELATIVE = Path("global/palette/units/pal.dat")
TILE_WIDTH = 160
TILE_HEIGHT = 80
WALL_Y_OFFSET = 96
ATLAS_COLUMNS = 4
ATLAS_CELLS = ATLAS_COLUMNS * ATLAS_COLUMNS

# The central 24x24 tile window contains the town square and the surrounding
# buildings.  The map is 44x49, so this leaves a wide margin around the arena.
CROP_COLUMN = 10
CROP_ROW = 14
CROP_COLUMNS = 24
CROP_ROWS = 24
# Room above the crop for tall building walls.
CROP_TOP_MARGIN = 384
BACKDROP_GAMMA = 0.72
ARENA_BACKGROUND = (8, 9, 13, 255)

FLOOR_ROW_WIDTHS = (4, 8, 12, 16, 20, 24, 28, 32, 28, 24, 20, 16, 12, 8, 4)


@dataclass
class Block:
    x: int
    y: int
    format: int
    length: int
    offset: int


@dataclass
class Tile:
    orientation: int
    main: int
    sub: int
    width: int
    height: int
    blocks: list[Block]
    data: bytes


@dataclass
class Layer:
    kind: str
    cells: tuple[int, ...]
    orientations: tuple[int, ...] | None


@dataclass
class SceneObject:
    kind: int
    object_id: int
    x: int
    y: int
    flags: int


@dataclass
class ObjectSprite:
    column: float
    row: float
    x: int
    y: int
    image: Image.Image


@dataclass
class Scene:
    width: int
    height: int
    layers: list[Layer]
    tilesets: list[str]
    act: int = 0
    objects: tuple[SceneObject, ...] = ()


def load_palette(path: Path) -> list[tuple[int, int, int, int]]:
    """Read an Act palette; pal.dat stores BGR triples, index 0 is transparent."""
    data = path.read_bytes()
    if len(data) != 768:
        raise ValueError(f"{path} is not a 256-colour pal.dat")
    return [(data[index + 2], data[index + 1], data[index], 255) for index in range(0, 768, 3)]


def load_object_palette(source: Path, fallback: list[tuple[int, int, int, int]]) -> list[tuple[int, int, int]]:
    """Objects and missiles use the BGR ``units`` palette, not an act palette."""
    path = source / OBJECT_PALETTE_RELATIVE
    if path.is_file():
        try:
            return [color[:3] for color in load_palette(path)]
        except ValueError:
            pass
    return [color[:3] for color in fallback]


def read_dt1(path: Path) -> list[Tile]:
    data = path.read_bytes()
    major, minor = struct.unpack_from("<ii", data, 0)
    if (major, minor) != (7, 6):
        return []
    tile_count, tile_pointer = struct.unpack_from("<ii", data, 268)
    tiles: list[Tile] = []
    for index in range(tile_count):
        record = tile_pointer + index * 96
        _, _, _, _, height, width = struct.unpack_from("<ihBBii", data, record)
        orientation, main_index, sub_index, _ = struct.unpack_from("<iiii", data, record + 0x14)
        block_pointer, _, block_count = struct.unpack_from("<iii", data, record + 0x48)
        blocks: list[Block] = []
        for block_index in range(block_count):
            x, y, _, _, fmt, length, data_offset = struct.unpack_from(
                "<hh2xBBHi2xi", data, block_pointer + block_index * 20)
            blocks.append(Block(x, y, fmt, length, block_pointer + data_offset))
        tiles.append(Tile(orientation, main_index, sub_index, width, height, blocks, data))
    return tiles


def resolve_path(source: Path, value: str) -> Path | None:
    clean = value.lstrip("\\").replace("\\", "/")
    if clean.lower().startswith("d2/"):
        clean = clean[3:]
    for root in (source.parent, source):
        candidate = root / clean
        if candidate.is_file():
            return candidate
    return None


def read_scene(path: Path) -> Scene:
    data = path.read_bytes()
    cursor = 0

    def read_int() -> int:
        nonlocal cursor
        value = struct.unpack_from("<i", data, cursor)[0]
        cursor += 4
        return value

    def read_string() -> str:
        nonlocal cursor
        end = data.index(b"\0", cursor)
        value = data[cursor:end].decode("latin-1")
        cursor = end + 1
        return value

    version = read_int()
    width = read_int() + 1
    height = read_int() + 1
    act = read_int() if version >= 8 else 0
    tag_type = read_int() if version >= 10 else 0
    tilesets: list[str] = []
    if version >= 3:
        tilesets = [read_string() for _ in range(read_int())]
    if 9 <= version <= 13:
        cursor += 8
    wall_layers = read_int() if version >= 4 else 1
    floor_layers = read_int() if version >= 16 else 1

    cell_count = width * height
    layers: list[Layer] = []
    if version >= 4:
        for index in range(wall_layers):
            cells = struct.unpack_from(f"<{cell_count}i", data, cursor)
            cursor += cell_count * 4
            orientations = struct.unpack_from(f"<{cell_count}i", data, cursor)
            cursor += cell_count * 4
            layers.append(Layer("wall", cells, orientations))
        for index in range(floor_layers):
            cells = struct.unpack_from(f"<{cell_count}i", data, cursor)
            cursor += cell_count * 4
            layers.append(Layer("floor", cells, None))
        cells = struct.unpack_from(f"<{cell_count}i", data, cursor)
        cursor += cell_count * 4
        layers.append(Layer("shadow", cells, None))
        if tag_type in (1, 2):
            cursor += cell_count * 4
    else:
        raise ValueError("Only version 4+ DS1 presets are supported")

    objects: list[SceneObject] = []
    if version >= 2:
        object_count = struct.unpack_from("<i", data, cursor)[0]
        cursor += 4
        for _ in range(object_count):
            if version >= 6:
                kind, object_id, x, y, flags = struct.unpack_from("<iiiii", data, cursor)
                cursor += 20
            else:
                kind, object_id, x, y = struct.unpack_from("<iiii", data, cursor)
                cursor += 16
                flags = 0
            objects.append(SceneObject(kind, object_id, x, y, flags))
    if version >= 12 and tag_type in (1, 2):
        if version >= 18:
            cursor += 4
        group_count = struct.unpack_from("<i", data, cursor)[0]
        cursor += 4
        cursor += group_count * (20 if version >= 13 else 16)
    if version >= 14:
        npc_count = struct.unpack_from("<i", data, cursor)[0]
        cursor += 4
        for _ in range(npc_count):
            point_count = struct.unpack_from("<i", data, cursor)[0]
            cursor += 4
            cursor += 8 + point_count * (12 if version >= 15 else 8)

    if cursor != len(data):
        raise ValueError(f"DS1 parse ended at {cursor}, expected {len(data)}")
    return Scene(width, height, layers, tilesets, act, tuple(objects))


def read_tsv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="latin-1") as handle:
        return [dict(row) for row in csv.DictReader(handle, delimiter="\t")]


def normalize_object_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


# A few DS1 preset names are not spelled the same way as their ObjType row.
OBJECT_TYPE_ALIASES = {
    "roguestakedcorpse1": "roguestaked1",
    "roguestakedcorpse2": "roguestaked2",
    "burnedbody1act1": "burningbody",
    "burningbody2act1": "burningbody2",
    "explodingcow": "cowa",
    "wirt": "wirtscorpse",
}

# These are animated ambient effects rather than solid props.  There are 74 of
# them in tri_town4 and they wash out the static arena backdrop.
AMBIENT_EFFECT_CLASSES = {"firesmall", "firemedium", "firelarge"}


def load_object_mappings(source: Path) -> tuple[dict[tuple[int, int], str], dict[str, str]]:
    """Read D2R's per-act object presets and its ObjType token table."""
    preset_path = source / OBJECT_PRESET_RELATIVE
    type_path = source / OBJECT_TYPE_RELATIVE
    if not preset_path.is_file() or not type_path.is_file():
        raise SystemExit(f"Missing D2R object tables under {source}")

    presets: dict[tuple[int, int], str] = {}
    for row in read_tsv(preset_path):
        act = (row.get("Act") or "").strip()
        index = (row.get("Index") or "").strip()
        name = (row.get("ObjectClass") or "").strip()
        if act.isdigit() and index.isdigit() and name:
            presets[(int(act), int(index))] = normalize_object_name(name)

    tokens: dict[str, str] = {}
    for row in read_tsv(type_path):
        name = (row.get("Name") or "").strip()
        token = (row.get("Token") or "").strip()
        if name and token:
            tokens.setdefault(normalize_object_name(name), token)
    return presets, tokens


def load_object_frame(source: Path, token: str) -> tuple[dict, bytearray] | None:
    """Pick the most readable idle frame of an object's classic DCC."""
    folder = source / OBJECT_ART_RELATIVE / token.lower() / "tr"
    files = sorted(folder.glob("*.dcc")) if folder.is_dir() else []
    if not files:
        return None
    path = next((candidate for candidate in files if "nuhth" in candidate.name.lower()), files[0])
    try:
        animation = d2r_dcc.parse(path.read_bytes())
    except Exception:
        return None
    if not animation["dirs"]:
        return None
    direction = animation["dirs"][0]
    best: tuple[int, dict, bytearray] | None = None
    for frame, bitmap in zip(direction["frames"], direction["bitmaps"]):
        visible = sum(1 for value in bitmap if value)
        if visible and (best is None or visible > best[0]):
            best = (visible, frame, bitmap)
    if best is None:
        return None
    return best[1], best[2]


def object_screen_position(scene: Scene, obj: SceneObject) -> tuple[int, int]:
    """Convert a DS1 object's sub-tile position to the rendered map origin."""
    origin_x = scene.height * TILE_WIDTH // 2
    origin_y = 512
    return (origin_x + (obj.x - obj.y) * (TILE_WIDTH // 10),
            origin_y + (obj.x + obj.y) * (TILE_HEIGHT // 10))


def build_object_sprites(scene: Scene, source: Path,
                         palette: list[tuple[int, int, int]]) -> list[ObjectSprite]:
    """Render the DS1 object list's resolvable classic props over the map."""
    presets, tokens = load_object_mappings(source)
    act = min(max(scene.act, 0), 4) + 1
    art: dict[str, tuple[dict, Image.Image] | None] = {}
    sprites: list[ObjectSprite] = []
    for obj in scene.objects:
        if obj.kind != 2 or obj.object_id >= 150:
            continue
        class_name = presets.get((act, obj.object_id))
        if not class_name or class_name in AMBIENT_EFFECT_CLASSES:
            continue
        token = tokens.get(OBJECT_TYPE_ALIASES.get(class_name, class_name))
        if not token:
            continue
        key = token.lower()
        if key not in art:
            loaded = load_object_frame(source, token)
            art[key] = None if loaded is None else (
                loaded[0], d2r_dcc.frame_image(loaded[1], loaded[0]["width"], loaded[0]["height"], palette))
        rendered = art[key]
        if rendered is None:
            continue
        frame, image = rendered
        anchor_x, anchor_y = object_screen_position(scene, obj)
        sprites.append(ObjectSprite(obj.x / 5.0, obj.y / 5.0,
                                    anchor_x + frame["xmin"], anchor_y + frame["ymin"], image))
    sprites.sort(key=lambda sprite: (sprite.row + sprite.column, sprite.column))
    return sprites


def decode_block(data: bytes, block: Block, palette: list[tuple[int, int, int, int]]) -> Image.Image:
    """Decode one 32-pixel-wide DT1 block."""
    if block.format == 0x0001:
        if block.length != 256:
            raise ValueError(f"isometric block has {block.length} bytes, expected 256")
        image = Image.new("RGBA", (32, 15), (0, 0, 0, 0))
        pixels = image.load()
        cursor = block.offset
        for row, width in enumerate(FLOOR_ROW_WIDTHS):
            left = (32 - width) // 2
            for column in range(width):
                index = data[cursor]
                cursor += 1
                if index:
                    pixels[left + column, row] = palette[index]
        return image

    rows = 32 if block.format == 0x1001 else 15
    image = Image.new("RGBA", (32, rows), (0, 0, 0, 0))
    pixels = image.load()
    cursor = block.offset
    end = block.offset + block.length
    column = row = 0
    while cursor + 1 < end and row < rows:
        skip = data[cursor]
        count = data[cursor + 1]
        cursor += 2
        column += skip
        if skip == 0 and count == 0:
            column = 0
            row += 1
            continue
        for step in range(count):
            if cursor >= end:
                raise ValueError("truncated RLE block")
            index = data[cursor]
            cursor += 1
            if index and column + step < 32:
                pixels[column + step, row] = palette[index]
        column += count
    return image


def draw_tile(image: Image.Image, tile: Tile, x: int, y: int,
              palette: list[tuple[int, int, int, int]]) -> None:
    # Upper walls and standalone objects use a 96-pixel vertical offset; floors
    # and roofs begin at the tile's top-left diamond corner.
    y_add = 0 if tile.orientation in (0, 15) else WALL_Y_OFFSET
    for block in tile.blocks:
        fragment = decode_block(tile.data, block, palette)
        image.alpha_composite(fragment, (x + block.x, y + y_add + block.y))


def cell_key(cell: int, orientation: int) -> tuple[int, int, int]:
    return orientation, (cell >> 20) & 0x3F, (cell >> 8) & 0x3F


def render_scene(scene: Scene, catalogue: dict[tuple[int, int, int], Tile],
                 palette: list[tuple[int, int, int, int]],
                 object_sprites: list[ObjectSprite] | None = None) -> Image.Image:
    # Tile (0, 0) sits at (height * 80, WALL_MARGIN).  The extra rows/columns
    # keep negative-x diamonds and tall walls inside the canvas.
    origin_x = scene.height * TILE_WIDTH // 2
    origin_y = 512
    width = (scene.width + scene.height) * TILE_WIDTH // 2 + TILE_WIDTH
    height = (scene.width + scene.height) * TILE_HEIGHT // 2 + origin_y + TILE_HEIGHT
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    tile_origins = [
        (origin_x + (x - y) * TILE_WIDTH // 2,
         origin_y + (x + y) * TILE_HEIGHT // 2)
        for y in range(scene.height)
        for x in range(scene.width)
    ]

    def draw_layer(layer: Layer) -> None:
        for index, cell in enumerate(layer.cells):
            if cell & 0x80000000 or cell & 0xFF == 0:
                continue
            if layer.kind == "floor":
                orientation = 0
            elif layer.kind == "shadow":
                orientation = 13
            else:
                orientation = layer.orientations[index] & 0xFF
            tile = catalogue.get(cell_key(cell, orientation))
            if tile and tile.blocks:
                if layer.kind == "wall" and orientation >= 16:
                    continue
                if layer.kind == "wall" and orientation == 15:
                    continue
                draw_tile(image, tile, *tile_origins[index], palette)

    # Lower walls belong to the base terrain pass and are drawn before floors.
    for layer in scene.layers:
        if layer.kind != "wall":
            continue
        for index, cell in enumerate(layer.cells):
            if cell & 0x80000000 or cell & 0xFF == 0:
                continue
            orientation = layer.orientations[index] & 0xFF
            if orientation < 16:
                continue
            tile = catalogue.get(cell_key(cell, orientation))
            if tile and tile.blocks:
                draw_tile(image, tile, *tile_origins[index], palette)

    for layer in scene.layers:
        if layer.kind == "floor":
            draw_layer(layer)
    for layer in scene.layers:
        if layer.kind == "shadow":
            draw_layer(layer)

    # Painter's order: back rows first, then left to right.  Props share the
    # wall pass so one behind a building is hidden by its walls.
    stack: list[tuple[float, float, int, Tile | ObjectSprite, int, int]] = []
    for layer_index, layer in enumerate(scene.layers):
        if layer.kind != "wall":
            continue
        for index, cell in enumerate(layer.cells):
            if cell & 0x80000000 or cell & 0xFF == 0:
                continue
            orientation = layer.orientations[index] & 0xFF
            if orientation >= 16 or orientation == 15:
                continue
            tile = catalogue.get(cell_key(cell, orientation))
            if not tile or not tile.blocks:
                continue
            x, y = tile_origins[index]
            row = index // scene.width
            column = index % scene.width
            stack.append((float(row + column), float(column), layer_index, tile, x, y))
    for sprite in object_sprites or ():
        stack.append((sprite.row + sprite.column, sprite.column, 1000,
                      sprite, sprite.x, sprite.y))
    stack.sort(key=lambda entry: entry[:3])
    for _, _, _, item, x, y in stack:
        if isinstance(item, Tile):
            draw_tile(image, item, x, y, palette)
        else:
            image.alpha_composite(item.image, (x, y))

    for layer in scene.layers:
        if layer.kind != "wall":
            continue
        for index, cell in enumerate(layer.cells):
            if cell & 0x80000000 or cell & 0xFF == 0:
                continue
            if layer.orientations[index] & 0xFF != 15:
                continue
            tile = catalogue.get(cell_key(cell, 15))
            if tile and tile.blocks:
                draw_tile(image, tile, *tile_origins[index], palette)
    return image


def build_catalogue(scene: Scene, source: Path) -> dict[tuple[int, int, int], Tile]:
    catalogue: dict[tuple[int, int, int], Tile] = {}
    for name in scene.tilesets:
        path = resolve_path(source, name)
        if not path:
            raise SystemExit(f"Missing tileset named by {DS1_RELATIVE}: {name}")
        for tile in read_dt1(path):
            catalogue.setdefault((tile.orientation, tile.main, tile.sub), tile)
    return catalogue


def crop_scene(image: Image.Image, scene: Scene) -> Image.Image:
    origin_x = scene.height * TILE_WIDTH // 2
    origin_y = 512
    # Bounding box of the chosen tile window, including wall overhang above it.
    left = origin_x + (CROP_COLUMN - (CROP_ROW + CROP_ROWS - 1)) * TILE_WIDTH // 2
    top = origin_y + (CROP_COLUMN + CROP_ROW) * TILE_HEIGHT // 2 - CROP_TOP_MARGIN
    width = (CROP_COLUMNS + CROP_ROWS) * TILE_WIDTH // 2
    height = (CROP_COLUMNS + CROP_ROWS) * TILE_HEIGHT // 2 + CROP_TOP_MARGIN
    return image.crop((left, top, left + width, top + height))


def prepare_backdrop(image: Image.Image) -> Image.Image:
    """Flatten the render and match the runtime floor brightening."""
    background = Image.new("RGBA", image.size, ARENA_BACKGROUND)
    background.alpha_composite(image)
    rgb = background.convert("RGB")
    brightened = rgb.point(lambda value: round(255 * (value / 255) ** BACKDROP_GAMMA))
    # The classic tiles use fewer than 256 colours, so the palette PNG is
    # lossless while cutting the shipped asset from ~11 MB to under 3 MB.
    return brightened.quantize(colors=256, method=Image.Quantize.FASTOCTREE,
                               dither=Image.Dither.NONE)


def build_floor_atlas(scene: Scene, catalogue: dict[tuple[int, int, int], Tile],
                      palette: list[tuple[int, int, int, int]]) -> Image.Image:
    counts: dict[tuple[int, int, int], int] = {}
    images: dict[tuple[int, int, int], Image.Image] = {}
    for layer in scene.layers:
        if layer.kind != "floor":
            continue
        for cell in layer.cells:
            if cell & 0x80000000 or cell & 0xFF == 0:
                continue
            key = cell_key(cell, 0)
            tile = catalogue.get(key)
            if not tile or not tile.blocks or len(tile.blocks) != 25:
                continue
            if not all(block.format == 0x0001 for block in tile.blocks):
                continue
            counts[key] = counts.get(key, 0) + 1
            if key not in images:
                tile_image = Image.new("RGBA", (TILE_WIDTH, TILE_HEIGHT), (0, 0, 0, 0))
                draw_tile(tile_image, tile, 0, 0, palette)
                images[key] = tile_image
    if len(images) < ATLAS_CELLS:
        raise SystemExit(f"Only {len(images)} Tristram floor tiles found")
    ordered = sorted(images, key=lambda key: (-counts[key], key))[:ATLAS_CELLS]
    atlas = Image.new("RGBA", (TILE_WIDTH * ATLAS_COLUMNS, TILE_HEIGHT * ATLAS_COLUMNS),
                      (0, 0, 0, 0))
    for index, key in enumerate(ordered):
        atlas.alpha_composite(images[key], ((index % ATLAS_COLUMNS) * TILE_WIDTH,
                                            (index // ATLAS_COLUMNS) * TILE_HEIGHT))
    return atlas


def brighten_layer(image: Image.Image) -> Image.Image:
    """Apply the backdrop gamma while keeping the tile's transparency."""
    alpha = image.getchannel("A")
    rgb = image.convert("RGB").point(lambda value: round(255 * (value / 255) ** BACKDROP_GAMMA))
    rgb.putalpha(alpha)
    return rgb


def wall_tile_bbox(tile: Tile) -> tuple[int, int, int, int]:
    y_add = 0 if tile.orientation in (0, 15) else WALL_Y_OFFSET
    x0 = min(block.x for block in tile.blocks)
    y0 = min(block.y for block in tile.blocks) + y_add
    x1 = max(block.x + 32 for block in tile.blocks)
    y1 = max(block.y + (32 if block.format == 0x1001 else 15) for block in tile.blocks) + y_add
    return x0, y0, x1, y1


def render_wall_sprite(tile: Tile, palette: list[tuple[int, int, int, int]]) -> tuple[Image.Image, tuple[int, int, int, int]]:
    """Render one wall tile on its own so the runtime can depth-sort it."""
    x0, y0, x1, y1 = wall_tile_bbox(tile)
    image = Image.new("RGBA", (x1 - x0, y1 - y0), (0, 0, 0, 0))
    y_add = 0 if tile.orientation in (0, 15) else WALL_Y_OFFSET
    for block in tile.blocks:
        image.alpha_composite(decode_block(tile.data, block, palette),
                              (block.x - x0, block.y + y_add - y0))
    return brighten_layer(image), (x0, y0, x1 - x0, y1 - y0)


def build_wall_assets(scene: Scene, catalogue: dict[tuple[int, int, int], Tile],
                      palette: list[tuple[int, int, int, int]]) -> tuple[Image.Image, dict]:
    """Build a packed atlas and backdrop-relative placements for upper walls."""
    origin_x = scene.height * TILE_WIDTH // 2
    origin_y = 512
    crop_left = origin_x + (CROP_COLUMN - (CROP_ROW + CROP_ROWS - 1)) * TILE_WIDTH // 2
    crop_top = origin_y + (CROP_COLUMN + CROP_ROW) * TILE_HEIGHT // 2 - CROP_TOP_MARGIN

    entries: list[tuple[int, int, int, tuple[int, int, int], Tile, int, int]] = []
    for layer_index, layer in enumerate(scene.layers):
        if layer.kind != "wall":
            continue
        for index, cell in enumerate(layer.cells):
            if cell & 0x80000000 or cell & 0xFF == 0:
                continue
            column, row = index % scene.width, index // scene.width
            if not (CROP_COLUMN <= column < CROP_COLUMN + CROP_COLUMNS
                    and CROP_ROW <= row < CROP_ROW + CROP_ROWS):
                continue
            orientation = layer.orientations[index] & 0xFF
            if orientation >= 16:
                continue
            key = cell_key(cell, orientation)
            tile = catalogue.get(key)
            if not tile or not tile.blocks:
                continue
            entries.append((row + column, column, layer_index, key, tile, column, row))
    entries.sort(key=lambda entry: entry[:3])

    sprites: dict[tuple[int, int, int], Image.Image] = {}
    bboxes: dict[tuple[int, int, int], tuple[int, int, int, int]] = {}
    for _, _, _, key, tile, _, _ in entries:
        if key in sprites:
            continue
        sprite, bbox = render_wall_sprite(tile, palette)
        sprites[key] = sprite
        bboxes[key] = bbox

    atlas_width = 1024
    placements: dict[tuple[int, int, int], tuple[int, int]] = {}
    cursor_x = cursor_y = row_height = 0
    for key, sprite in sorted(sprites.items(), key=lambda item: (-item[1].height, -item[1].width, item[0])):
        if cursor_x + sprite.width > atlas_width:
            cursor_x = 0
            cursor_y += row_height
            row_height = 0
        placements[key] = (cursor_x, cursor_y)
        cursor_x += sprite.width
        row_height = max(row_height, sprite.height)
    atlas = Image.new("RGBA", (atlas_width, cursor_y + row_height), (0, 0, 0, 0))
    for key, sprite in sprites.items():
        atlas.alpha_composite(sprite, placements[key])

    instances = []
    for order, (_, _, _, key, _, column, row) in enumerate(entries):
        x0, y0, width, height = bboxes[key]
        atlas_x, atlas_y = placements[key]
        tile_x = origin_x + (column - row) * TILE_WIDTH // 2
        tile_y = origin_y + (column + row) * TILE_HEIGHT // 2
        instances.append({
            "x": tile_x - crop_left + x0,
            "y": tile_y - crop_top + y0,
            "w": width,
            "h": height,
            "sx": atlas_x,
            "sy": atlas_y,
            "order": order,
        })

    layout = {
        "atlasWidth": atlas.width,
        "atlasHeight": atlas.height,
        "backdropWidth": (CROP_COLUMNS + CROP_ROWS) * TILE_WIDTH // 2,
        "backdropHeight": (CROP_COLUMNS + CROP_ROWS) * TILE_HEIGHT // 2 + CROP_TOP_MARGIN,
        "instances": instances,
    }
    return atlas, layout


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--preview", type=Path, default=None,
                        help="Also write the uncropped map for inspection.")
    args = parser.parse_args(argv)

    if not args.source.is_dir():
        raise SystemExit(f"D2R extraction not found: {args.source}")
    scene = read_scene(args.source / DS1_RELATIVE)
    catalogue = build_catalogue(scene, args.source)
    palette = load_palette(args.source / "global" / "palette" / "act1" / "pal.dat")
    object_palette = load_object_palette(args.source, palette)
    object_sprites = build_object_sprites(scene, args.source, object_palette)
    rendered = render_scene(scene, catalogue, palette, object_sprites)
    print(f"object sprites {len(object_sprites)}")
    if args.preview:
        args.preview.parent.mkdir(parents=True, exist_ok=True)
        rendered.save(args.preview, optimize=True)
        print(f"preview {args.preview} {rendered.width}x{rendered.height}")

    backdrop = prepare_backdrop(crop_scene(rendered, scene))
    TILE_ROOT.mkdir(parents=True, exist_ok=True)
    backdrop.save(ASSET_ROOT / "a8-tristram-backdrop.png", optimize=True)
    atlas = build_floor_atlas(scene, catalogue, palette)
    atlas.save(TILE_ROOT / "a8-uber-tristram-floor-tiles.png", optimize=True)
    wall_atlas, wall_layout = build_wall_assets(scene, catalogue, palette)
    wall_atlas.save(ASSET_ROOT / "a8-tristram-walls.png", optimize=True)
    with (ASSET_ROOT / "a8-tristram-walls.json").open("w", encoding="utf-8") as handle:
        json.dump(wall_layout, handle, separators=(",", ":"))
    print(f"backdrop {backdrop.width}x{backdrop.height} -> {ASSET_ROOT / 'a8-tristram-backdrop.png'}")
    print(f"atlas {atlas.width}x{atlas.height} -> {TILE_ROOT / 'a8-uber-tristram-floor-tiles.png'}")
    print(f"wall atlas {wall_atlas.width}x{wall_atlas.height}, {len(wall_layout['instances'])} instances -> {ASSET_ROOT / 'a8-tristram-walls.png'}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
