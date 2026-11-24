"""Build Diablo II campaign worlds out of the game's own DS1 map chunks.

Diablo II does not paint its ground from a swatch of loose diamonds: each area is
assembled from hand-authored ``.ds1`` chunks (``wild1.ds1`` .. ``wild9.ds1`` for
Act I's wilderness, ``cate.ds1`` .. for the Catacombs) laid on the level grid, and
every chunk cell names a tile in the DT1 sets its DS1 lists.  Each floor entry is
already a 5x5 blend family, so the transitions between grass, dirt and stone come
Straight out of the preset instead of being faked at runtime.

This tool reproduces that build deterministically (chunk N at grid cell N, no
random rolls) so every area renders the same world every run, then exports what
the client needs to draw it exactly as the editor would:

    <slug>-ground.png       floors, shadows and lower walls, in tile order
    <slug>-walls.png        packed upper walls / solid props for depth sorting
    <slug>-walls.json       backdrop-relative placements for those strips
    <slug>-walls-collision.png   wall-footprint mask in the same pixel space

Usage:
    python tools/build_d2_worlds.py --act 1
    python tools/build_d2_worlds.py --act 1 --preview .tmp-a1-blood-moor.png
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw

import render_d2r_tristram as tristram

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "maps" / "worlds"
GENERATED_TS = PROJECT_ROOT / "src" / "app" / "d2survivors" / "d2-worlds.generated.ts"
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"

TILE_WIDTH = tristram.TILE_WIDTH
TILE_HEIGHT = tristram.TILE_HEIGHT
WALL_Y_OFFSET = tristram.WALL_Y_OFFSET
BACKDROP_GAMMA = tristram.BACKDROP_GAMMA
ARENA_BACKGROUND = tristram.ARENA_BACKGROUND

# A strip of empty tiles kept above the assembled chunks so tall walls from the
# top row are not clipped by the exported image.
TOP_MARGIN = 256


@dataclass(frozen=True)
class WorldSpec:
    """One campaign area and the DS1 chunks that build it."""

    area: str
    slug: str
    #: Palette act number, 1-based, exactly as the presets reference it.
    act: int
    #: Chunk presets, relative to the extraction's ``data`` folder, in grid order.
    chunks: tuple[str, ...]
    #: Chunk layout; the chunk count must equal ``columns * rows``.
    columns: int
    rows: int


def wilderness(*names: str) -> tuple[str, ...]:
    return tuple(f"global/tiles/act1/outdoors/{name}.ds1" for name in names)


def catacombs(*names: str) -> tuple[str, ...]:
    return tuple(f"global/tiles/act1/catacomb/{name}.ds1" for name in names)


# Act I's six areas, built from the real Act I chunk sets.  Diablo II lays these
# presets on the level grid; the wilderness chunks that fit one grid are the
# 17x17 ones (wild1..wild4), and every Catacombs chunk is 13x13, so each area is
# a fixed 2x2 world of four different chunks in a fixed order.
ACT1_WORLDS: tuple[WorldSpec, ...] = (
    WorldSpec("Blood Moor", "a1-blood-moor", 1,
              wilderness("wild1", "wild2", "wild3", "wild4"), 2, 2),
    WorldSpec("Cold Plains", "a1-cold-plains", 1,
              wilderness("wild2", "wild3", "wild1", "wild4"), 2, 2),
    WorldSpec("Stony Field", "a1-stony-field", 1,
              wilderness("wild3", "wild1", "wild4", "wild2"), 2, 2),
    WorldSpec("Dark Wood", "a1-dark-wood", 1,
              wilderness("wild4", "wild2", "wild3", "wild1"), 2, 2),
    WorldSpec("Tamoe Highland", "a1-tamoe-highland", 1,
              wilderness("wild1", "wild4", "wild2", "wild3"), 2, 2),
    WorldSpec("Catacombs", "a1-catacombs", 1,
              catacombs("cate", "cate2", "catew", "catew2"), 2, 2),
)

WORLDS: dict[int, tuple[WorldSpec, ...]] = {
    1: ACT1_WORLDS,
}


def load_palette(source: Path, act: int) -> list[tuple[int, int, int, int]]:
    return tristram.load_palette(source / "global" / "palette" / f"act{act}" / "pal.dat")


def assemble(spec: WorldSpec, source: Path) -> tuple[tristram.Scene, dict[tuple[int, int, int], tristram.Tile]]:
    """Lay the spec's DS1 chunks on the level grid, the way the editor does.

    Each chunk is copied into one virtual scene at its grid cell, so the floors,
    walls and shadows of neighbouring chunks keep the exact adjacency the game
    builds them with.  Nothing is random: the same chunk list always produces the
    same world.
    """
    if len(spec.chunks) != spec.columns * spec.rows:
        raise SystemExit(f"{spec.area} lists {len(spec.chunks)} chunks for a "
                         f"{spec.columns}x{spec.rows} grid")
    catalogue: dict[tuple[int, int, int], tristram.Tile] = {}
    grid: list[tuple[tristram.Scene, int, int]] = []
    chunk_width = chunk_height = None
    for index, relative in enumerate(spec.chunks):
        path = source / relative
        if not path.is_file():
            raise SystemExit(f"Missing DS1 chunk {relative}")
        scene = tristram.read_scene(path)
        if chunk_width is None:
            chunk_width, chunk_height = scene.width, scene.height
        elif (scene.width, scene.height) != (chunk_width, chunk_height):
            raise SystemExit(
                f"{relative} is {scene.width}x{scene.height}; every chunk in {spec.area} "
                f"must be {chunk_width}x{chunk_height}")
        for name in scene.tilesets:
            tile_path = tristram.resolve_path(source, name)
            if not tile_path and name.lower().endswith(".tg1"):
                # The presets spell their DT1 sets ".tg1"; the extraction keeps
                # them as ".dt1".
                tile_path = tristram.resolve_path(source, name[:-4] + ".dt1")
            if not tile_path:
                raise SystemExit(f"Missing tileset {name} named by {relative}")
            for tile in tristram.read_dt1(tile_path):
                catalogue.setdefault((tile.orientation, tile.main, tile.sub), tile)
        grid.append((scene, (index % spec.columns) * chunk_width,
                     (index // spec.columns) * chunk_height))

    width = chunk_width * spec.columns
    height = chunk_height * spec.rows
    cells = width * height
    wall_layers = max(len([layer for layer in scene.layers if layer.kind == "wall"])
                      for scene, _, _ in grid)
    floor_layers = max(len([layer for layer in scene.layers if layer.kind == "floor"])
                       for scene, _, _ in grid)

    def copy_layer(kind: str, layer_index: int, with_orientation: bool):
        cells_out = [0] * cells
        orientations_out = [0] * cells
        for scene, offset_x, offset_y in grid:
            matching = [layer for layer in scene.layers if layer.kind == kind]
            if layer_index >= len(matching):
                continue
            layer = matching[layer_index]
            for row in range(scene.height):
                for column in range(scene.width):
                    source_index = row * scene.width + column
                    target = (offset_y + row) * width + offset_x + column
                    cells_out[target] = layer.cells[source_index]
                    if with_orientation and layer.orientations:
                        orientations_out[target] = layer.orientations[source_index]
        return cells_out, orientations_out

    layers: list[tristram.Layer] = []
    for layer_index in range(wall_layers):
        cells_out, orientations_out = copy_layer("wall", layer_index, True)
        layers.append(tristram.Layer("wall", tuple(cells_out), tuple(orientations_out)))
    for layer_index in range(floor_layers):
        cells_out, _ = copy_layer("floor", layer_index, False)
        layers.append(tristram.Layer("floor", tuple(cells_out), None))
    shadow_cells, _ = copy_layer("shadow", 0, False)
    layers.append(tristram.Layer("shadow", tuple(shadow_cells), None))

    scene = tristram.Scene(width, height, layers, [], max(0, spec.act - 1))
    return scene, catalogue


def render_world(spec: WorldSpec, source: Path,
                 palette: list[tuple[int, int, int, int]]
                 ) -> tuple[Image.Image, tristram.Scene, dict[tuple[int, int, int], tristram.Tile]]:
    """Render the assembled chunks with the editor's layer order."""
    scene, catalogue = assemble(spec, source)
    image = tristram.render_scene(scene, catalogue, palette, None, True)
    return image, scene, catalogue


def crop_origin(scene: tristram.Scene) -> tuple[int, int, int, int]:
    """Image-space crop: the whole assembled world plus a wall margin on top."""
    origin_x = scene.height * TILE_WIDTH // 2
    origin_y = 512
    left = origin_x
    top = origin_y - TOP_MARGIN
    width = (scene.width + scene.height) * TILE_WIDTH // 2
    height = (scene.width + scene.height) * TILE_HEIGHT // 2 + TOP_MARGIN
    return left, top, width, height


def export_ground(image: Image.Image, scene: tristram.Scene) -> Image.Image:
    left, top, width, height = crop_origin(scene)
    cropped = image.crop((left, top, left + width, top + height))
    background = Image.new("RGBA", cropped.size, ARENA_BACKGROUND)
    background.alpha_composite(cropped)
    rgb = background.convert("RGB")
    brightened = rgb.point(lambda value: round(255 * (value / 255) ** BACKDROP_GAMMA))
    return brightened.quantize(colors=256, method=Image.Quantize.FASTOCTREE,
                               dither=Image.Dither.NONE)


def export_walls(scene: tristram.Scene, catalogue: dict[tuple[int, int, int], tristram.Tile],
                 palette: list[tuple[int, int, int, int]]) -> tuple[Image.Image, dict]:
    """Pack every upper-wall tile once and list the cells that use it."""
    left, top, width, height = crop_origin(scene)
    origin_x = scene.height * TILE_WIDTH // 2
    origin_y = 512

    placements_by_cell: list[tuple[float, float, tuple[int, int, int], int, int]] = []
    for layer_index, layer in enumerate(scene.layers):
        if layer.kind != "wall" or not layer.orientations:
            continue
        for index, cell in enumerate(layer.cells):
            if cell & 0x80000000 or cell & 0xFF == 0:
                continue
            orientation = layer.orientations[index] & 0xFF
            if orientation >= 16 or orientation == 15:
                continue
            key = tristram.cell_key(cell, orientation)
            if key not in catalogue:
                continue
            column, row = index % scene.width, index // scene.width
            placements_by_cell.append((float(row + column), float(column), key, column, row))
    placements_by_cell.sort(key=lambda entry: entry[:2])

    sprites: dict[tuple[int, int, int], Image.Image] = {}
    boxes: dict[tuple[int, int, int], tuple[int, int, int, int]] = {}
    for _, _, key, _, _ in placements_by_cell:
        if key in sprites:
            continue
        sprite, bbox = tristram.render_wall_sprite(catalogue[key], palette)
        sprites[key] = sprite
        boxes[key] = bbox

    atlas_width = 1024
    positions: dict[tuple[int, int, int], tuple[int, int]] = {}
    cursor_x = cursor_y = row_height = 0
    for key, sprite in sorted(sprites.items(), key=lambda item: (-item[1].height, -item[1].width, item[0])):
        if cursor_x + sprite.width > atlas_width:
            cursor_x = 0
            cursor_y += row_height
            row_height = 0
        positions[key] = (cursor_x, cursor_y)
        cursor_x += sprite.width
        row_height = max(row_height, sprite.height)
    atlas = Image.new("RGBA", (atlas_width, cursor_y + row_height), (0, 0, 0, 0))
    for key, sprite in sprites.items():
        atlas.alpha_composite(sprite, positions[key])

    instances = []
    for order, (_, _, key, column, row) in enumerate(placements_by_cell):
        x0, y0, sprite_width, sprite_height = boxes[key]
        atlas_x, atlas_y = positions[key]
        tile_x = origin_x + (column - row) * TILE_WIDTH // 2
        tile_y = origin_y + (column + row) * TILE_HEIGHT // 2
        instances.append({
            "x": tile_x - left + x0,
            "y": tile_y - top + y0,
            "w": sprite_width,
            "h": sprite_height,
            "sx": atlas_x,
            "sy": atlas_y,
            "depth": tile_y - top + TILE_HEIGHT,
            "order": order,
        })

    layout = {
        "atlasWidth": atlas.width,
        "atlasHeight": atlas.height,
        "backdropWidth": width,
        "backdropHeight": height,
        "imageWidth": width,
        "imageHeight": height,
        "tileWidth": TILE_WIDTH,
        "tileHeight": TILE_HEIGHT,
        "instances": instances,
    }
    return atlas, layout


def export_collision(scene: tristram.Scene, catalogue: dict[tuple[int, int, int], tristram.Tile]) -> Image.Image:
    left, top, width, height = crop_origin(scene)
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    origin_x = scene.height * TILE_WIDTH // 2
    origin_y = 512
    for layer in scene.layers:
        if layer.kind != "wall" or not layer.orientations:
            continue
        for index, cell in enumerate(layer.cells):
            if cell & 0x80000000 or cell & 0xFF == 0:
                continue
            orientation = layer.orientations[index] & 0xFF
            if orientation >= 16:
                continue
            if tristram.cell_key(cell, orientation) not in catalogue:
                continue
            column, row = index % scene.width, index // scene.width
            tile_x = origin_x + (column - row) * TILE_WIDTH // 2 - left
            tile_y = origin_y + (column + row) * TILE_HEIGHT // 2 - top
            draw.polygon([
                (tile_x + TILE_WIDTH // 2, tile_y),
                (tile_x + TILE_WIDTH, tile_y + TILE_HEIGHT // 2),
                (tile_x + TILE_WIDTH // 2, tile_y + TILE_HEIGHT),
                (tile_x, tile_y + TILE_HEIGHT // 2),
            ], fill=255)
    return mask


def write_world(spec: WorldSpec, source: Path, preview: Path | None) -> dict:
    palette = load_palette(source, spec.act)
    image, scene, catalogue = render_world(spec, source, palette)
    if preview:
        preview.parent.mkdir(parents=True, exist_ok=True)
        image.save(preview, optimize=True)
        print(f"preview {preview} {image.width}x{image.height}")

    ASSET_ROOT.mkdir(parents=True, exist_ok=True)
    ground = export_ground(image, scene)
    ground.save(ASSET_ROOT / f"{spec.slug}-ground.png", optimize=True)
    walls, layout = export_walls(scene, catalogue, palette)
    walls.save(ASSET_ROOT / f"{spec.slug}-walls.png", optimize=True)
    with (ASSET_ROOT / f"{spec.slug}-walls.json").open("w", encoding="utf-8") as handle:
        json.dump(layout, handle, separators=(",", ":"))
    collision = export_collision(scene, catalogue)
    collision.save(ASSET_ROOT / f"{spec.slug}-walls-collision.png", optimize=True)

    print(f"{spec.area}: {scene.width}x{scene.height} tiles, "
          f"ground {ground.width}x{ground.height}, {len(layout['instances'])} wall strips")
    return {
        "area": spec.area,
        "slug": spec.slug,
        "columns": scene.width,
        "rows": scene.height,
        "ground": f"assets/d2survivors/maps/worlds/{spec.slug}-ground.png",
        "walls": f"assets/d2survivors/maps/worlds/{spec.slug}-walls.png",
        "layout": f"assets/d2survivors/maps/worlds/{spec.slug}-walls.json",
        "collision": f"assets/d2survivors/maps/worlds/{spec.slug}-walls-collision.png",
        "imageWidth": layout["imageWidth"],
        "imageHeight": layout["imageHeight"],
        "tileWidth": TILE_WIDTH,
        "tileHeight": TILE_HEIGHT,
    }


def write_manifest(entries: list[dict]) -> None:
    lines = [
        "// Generated by tools/build_d2_worlds.py -- do not edit by hand.",
        "// Each entry is an area assembled from Diablo II's own DS1 map chunks,",
        "// drawn at the preset's native 160x80 tile scale.",
        "",
        "export interface D2WorldEntry {",
        "  readonly area: string;",
        "  readonly slug: string;",
        "  readonly columns: number;",
        "  readonly rows: number;",
        "  readonly ground: string;",
        "  readonly walls: string;",
        "  readonly layout: string;",
        "  readonly collision: string;",
        "  readonly imageWidth: number;",
        "  readonly imageHeight: number;",
        "  readonly tileWidth: number;",
        "  readonly tileHeight: number;",
        "}",
        "",
        "export const D2_WORLDS_BY_AREA: Readonly<Record<string, D2WorldEntry>> = {",
    ]
    for entry in entries:
        lines.append(f"  {json.dumps(entry['area'])}: {{")
        for key in ("area", "slug", "columns", "rows", "ground", "walls", "layout",
                    "collision", "imageWidth", "imageHeight", "tileWidth", "tileHeight"):
            lines.append(f"    {key}: {json.dumps(entry[key])},")
        lines.append("  },")
    lines.append("};")
    lines.append("")
    GENERATED_TS.write_text("\n".join(lines), encoding="utf-8")
    print(f"manifest {GENERATED_TS} ({len(entries)} worlds)")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--act", type=int, default=None,
                        help="Only build one act's worlds (default: all configured).")
    parser.add_argument("--area", default=None, help="Only build one area by name.")
    parser.add_argument("--preview", type=Path, default=None,
                        help="Write the uncropped render for inspection.")
    args = parser.parse_args(argv)

    if not args.source.is_dir():
        raise SystemExit(f"D2R extraction not found: {args.source}")
    specs = [spec for act, act_specs in sorted(WORLDS.items()) for spec in act_specs]
    if args.act is not None:
        specs = [spec for spec in specs if spec.act == args.act]
    if args.area:
        specs = [spec for spec in specs if spec.area.lower() == args.area.lower()]
    if not specs:
        raise SystemExit("No worlds selected")

    entries = [write_world(spec, args.source, args.preview) for spec in specs]
    write_manifest(entries)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
