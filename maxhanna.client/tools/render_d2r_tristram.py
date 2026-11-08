"""Render Diablo II's original Tristram map with the D2R classic tile data.

Act 8 previously reused an Act I outdoor floor atlas and the Barracks artwork,
which is why Uber Tristram did not read as Tristram.  The D2R extraction ships
the real ``tri_town4.ds1`` preset and the DT1 sets it names, including
``act1/tristram/town.dt1``.  This tool decodes those classic tiles with the Act I
palette and renders a cropped region of the town for use as the Act 8 backdrop.
It also writes a 4x4 fallback atlas from the same map's most common floors.

The renderer follows the layer order used by the game's editor: lower walls,
floors, shadows, upper walls/objects, and roofs.  It intentionally skips the
DS1 object list (NPCs, chests and interactive objects), because those are
separate sprites rather than map tiles.

Usage:
    python tools/render_d2r_tristram.py
    python tools/render_d2r_tristram.py --preview .tmp-tristram-full.png
"""

from __future__ import annotations

import argparse
import struct
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "maps"
TILE_ROOT = ASSET_ROOT / "tiles"
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"

DS1_RELATIVE = Path("global/tiles/act1/tristram/tri_town4.ds1")
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
class Scene:
    width: int
    height: int
    layers: list[Layer]
    tilesets: list[str]


def load_palette(path: Path) -> list[tuple[int, int, int, int]]:
    """Read an Act palette; pal.dat stores BGR triples, index 0 is transparent."""
    data = path.read_bytes()
    if len(data) != 768:
        raise ValueError(f"{path} is not a 256-colour pal.dat")
    return [(data[index + 2], data[index + 1], data[index], 255) for index in range(0, 768, 3)]


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
    if version >= 8:
        read_int()
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

    if version >= 2:
        object_count = struct.unpack_from("<i", data, cursor)[0]
        cursor += 4
        cursor += object_count * (20 if version >= 6 else 16)
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
    return Scene(width, height, layers, tilesets)


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
                 palette: list[tuple[int, int, int, int]]) -> Image.Image:
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

    walls: list[tuple[int, int, int, int, Tile, int, int]] = []
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
            # Painter's order: back rows first, then left to right.  The layer
            # index breaks ties so a later overlay is drawn over its base tile.
            row = index // scene.width
            column = index % scene.width
            walls.append((row + column, column, layer_index, index, tile, x, y))
    walls.sort(key=lambda entry: entry[:3])
    for _, _, _, _, tile, x, y in walls:
        draw_tile(image, tile, x, y, palette)

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
    rendered = render_scene(scene, catalogue, palette)
    if args.preview:
        args.preview.parent.mkdir(parents=True, exist_ok=True)
        rendered.save(args.preview, optimize=True)
        print(f"preview {args.preview} {rendered.width}x{rendered.height}")

    backdrop = prepare_backdrop(crop_scene(rendered, scene))
    TILE_ROOT.mkdir(parents=True, exist_ok=True)
    backdrop.save(ASSET_ROOT / "a8-tristram-backdrop.png", optimize=True)
    atlas = build_floor_atlas(scene, catalogue, palette)
    atlas.save(TILE_ROOT / "a8-uber-tristram-floor-tiles.png", optimize=True)
    print(f"backdrop {backdrop.width}x{backdrop.height} -> {ASSET_ROOT / 'a8-tristram-backdrop.png'}")
    print(f"atlas {atlas.width}x{atlas.height} -> {TILE_ROOT / 'a8-uber-tristram-floor-tiles.png'}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
