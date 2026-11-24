"""Build Diablo II campaign worlds out of the game's own DS1 map chunks.

Diablo II does not paint its ground from a swatch of loose diamonds: each area is
assembled from hand-authored ``.ds1`` chunks laid on the level grid (the ``wild``
and ``cate`` presets for Act I, the desert, sewer, tomb and sanctuary rooms for
Act II, the jungle and Kurast city chunks for Act III, the mesa and lava set
pieces for Act IV, and the expansion's snowfield, ice cave and Baal's-lair chunks
for Act V), and every chunk cell names a tile in the DT1 sets its DS1 lists.
Each floor entry is already a 5x5 blend family, so the transitions between grass,
dirt and stone come straight out of the preset instead of being faked at runtime.

This tool reproduces that build deterministically (chunk N at grid cell N, no
random rolls) so every area renders the same world every run, then exports what
the client needs to draw it exactly as the editor would:

    <slug>-ground.png       floors, shadows and lower walls, in tile order
    <slug>-walls.png        packed upper walls / solid props for depth sorting
    <slug>-walls.json       backdrop-relative placements for those strips
    <slug>-walls-collision.png   wall-footprint mask in the same pixel space

Usage:
    python tools/build_d2_worlds.py                 # every campaign act
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

# Diablo II fills the space outside a preset's rooms with its "blank" tile: a
# solid black diamond at main index 30.  The catacomb and tomb presets reference
# that table even though the tilesets they list do not define it, so every world
# loads the shared fill; without it those cells exported as transparent holes.
BLANK_TILESET = "global/tiles/act1/outdoors/blank.dt1"


def blank_tiles(source: Path) -> list[tristram.Tile]:
    """The shared blank-space fill tiles, or none when the extraction lacks them."""
    path = source / BLANK_TILESET
    return tristram.read_dt1(path) if path.is_file() else []


def blank_keys(source: Path) -> frozenset[tuple[int, int, int]]:
    return frozenset((tile.orientation, tile.main, tile.sub) for tile in blank_tiles(source))


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


def ds1(folder: str, *names: str) -> tuple[str, ...]:
    """Chunk presets as paths relative to the extraction's ``data`` folder."""
    return tuple(f"global/tiles/{folder}/{name}.ds1" for name in names)


# Every campaign area is built from the real chunk presets for its act.  The
# presets are laid out in a fixed order (no random rolls), so an area renders the
# same world every run.  Each set offers one chunk size per world: the small
# outdoor chunks tile into a 3x3 grid, the 13/17-cell room chunks into 2x2, and
# the large single-room presets (25 cells and up) are used one at a time so the
# exported backdrop stays the same scale as Act I's.
ACT1_WORLDS: tuple[WorldSpec, ...] = (
    WorldSpec("Blood Moor", "a1-blood-moor", 1,
              ds1("act1/outdoors", "wild1", "wild2", "wild3", "wild4"), 2, 2),
    WorldSpec("Cold Plains", "a1-cold-plains", 1,
              ds1("act1/outdoors", "wild2", "wild3", "wild1", "wild4"), 2, 2),
    WorldSpec("Stony Field", "a1-stony-field", 1,
              ds1("act1/outdoors", "wild3", "wild1", "wild4", "wild2"), 2, 2),
    WorldSpec("Dark Wood", "a1-dark-wood", 1,
              ds1("act1/outdoors", "wild4", "wild2", "wild3", "wild1"), 2, 2),
    WorldSpec("Tamoe Highland", "a1-tamoe-highland", 1,
              ds1("act1/outdoors", "wild1", "wild4", "wild2", "wild3"), 2, 2),
    WorldSpec("Catacombs", "a1-catacombs", 1,
              ds1("act1/catacomb", "cate", "cate2", "catew", "catew2"), 2, 2),
)

# Act II: the desert chunks are 9-cell squares, the sewers, tombs and sanctuary
# are 13 to 17-cell rooms, and the oasis presets are the larger 17-cell squares.
ACT2_WORLDS: tuple[WorldSpec, ...] = (
    WorldSpec("Sewers", "a2-sewers", 2,
              ds1("act2/sewer", "sewnw", "sewne", "sewsw", "sewse"), 2, 2),
    WorldSpec("Rocky Waste", "a2-rocky-waste", 2,
              ds1("act2/outdoors", "desert1", "desert2", "desert3",
                  "desert4", "desert5", "desert6", "desert7", "desert8", "desert9"), 3, 3),
    WorldSpec("Dry Hills", "a2-dry-hills", 2,
              ds1("act2/outdoors", "desert10", "desert2", "desert4",
                  "desert6", "desert8", "ruin4", "ruin5", "ruin6", "ruin7"), 3, 3),
    WorldSpec("Far Oasis", "a2-far-oasis", 2,
              ds1("act2/outdoors", "oasis5", "oasis6", "oasis7", "oasis8"), 2, 2),
    WorldSpec("Lost City", "a2-lost-city", 2,
              ds1("act2/ruin", "ruin1", "ruin2", "ruin3", "ruin4", "ruin5",
                  "ruin6", "ruin7", "ruin8", "ruin9"), 3, 3),
    WorldSpec("Valley of Snakes", "a2-valley-of-snakes", 2,
              ds1("act2/outdoors", "viper1", "oasis9", "oasis10", "oasis11"), 2, 2),
    WorldSpec("Claw Viper Temple", "a2-claw-viper-temple", 2,
              ds1("act2/tomb", "serpent1", "tombnw", "tombne", "tombnse"), 2, 2),
    WorldSpec("Arcane Sanctuary", "a2-arcane-sanctuary", 2,
              ds1("act2/arcane", "sanctnw", "sanctne", "sanctsw", "sanctse"), 2, 2),
    WorldSpec("Tal Rasha's Tomb", "a2-tal-rashas-tomb", 2,
              ds1("act2/tomb", "talrasha", "tombetalrasha", "tombntalrasha", "tombstalrasha"), 2, 2),
)

# Act III: the jungle chunks are 33-cell presets, so each jungle area uses one
# full preset; Kurast's city chunks are 17-cell rooms and Travincal's temple
# chunks are 13-cell rooms.
ACT3_WORLDS: tuple[WorldSpec, ...] = (
    WorldSpec("Spider Forest", "a3-spider-forest", 3,
              ds1("act3/jungle", "spidnw"), 1, 1),
    WorldSpec("Great Marsh", "a3-great-marsh", 3,
              ds1("act3/jungle", "bognw"), 1, 1),
    WorldSpec("Flayer Jungle", "a3-flayer-jungle", 3,
              ds1("act3/jungle", "pygnw"), 1, 1),
    WorldSpec("Lower Kurast", "a3-lower-kurast", 3,
              ds1("act3/kurast", "slums16x16_0", "slums16x16_1",
                  "slums16x16_2", "metro16x16_6"), 2, 2),
    WorldSpec("Kurast Bazaar", "a3-kurast-bazaar", 3,
              ds1("act3/kurast", "metro16x16_0", "metro16x16_1",
                  "metro16x16_2", "metro16x16_3"), 2, 2),
    WorldSpec("Upper Kurast", "a3-upper-kurast", 3,
              ds1("act3/kurast", "burbs16x16_0", "burbs16x16_1",
                  "burbs16x16_2", "burbs16x16_3"), 2, 2),
    WorldSpec("Kurast Causeway", "a3-kurast-causeway", 3,
              ds1("act3/kurast", "bridge"), 1, 1),
    WorldSpec("Travincal", "a3-travincal", 3,
              ds1("act3/travincal", "travs"), 1, 1),
    WorldSpec("Durance of Hate", "a3-durance-of-hate", 3,
              ds1("act3/travincal", "mephnw", "mephne", "mephsw", "mephse"), 2, 2),
)

# Act IV: the steppes and city are mesa chunks; the River of Flame and the Chaos
# Sanctuary are single 25-cell set pieces (the lava river and the pentagram).
ACT4_WORLDS: tuple[WorldSpec, ...] = (
    WorldSpec("Outer Steppes", "a4-outer-steppes", 4,
              ds1("act4/mesa", "outer16x16_0", "outer16x16_1",
                  "outer16x16_2", "outer16x16_3"), 2, 2),
    WorldSpec("Plains of Despair", "a4-plains-of-despair", 4,
              ds1("act4/mesa", "mid16x16_0", "mid16x16_1",
                  "mid16x16_2", "mid16x16_3"), 2, 2),
    WorldSpec("City of the Damned", "a4-city-of-the-damned", 4,
              ds1("act4/mesa", "midpit16x16_0", "midpit16x16_1",
                  "midpit16x16_2", "chaos16x16_0"), 2, 2),
    WorldSpec("River of Flame", "a4-river-of-flame", 4,
              ds1("act4/lava", "lavanew2"), 1, 1),
    WorldSpec("Chaos Sanctuary", "a4-chaos-sanctuary", 4,
              ds1("act4/diab", "heart"), 1, 1),
)

# Act V: the snowfield fringe chunks are 17-cell 2x2 worlds, the ice caves use
# their 17-cell passages, and the set pieces (Nihlathak's temple, the Summit, the
# Throne) are single presets at their authored size.
ACT5_WORLDS: tuple[WorldSpec, ...] = (
    WorldSpec("Bloody Foothills", "a5-bloody-foothills", 5,
              ds1("expansion/siege", "brdr01r", "brdr02c", "brdr04r", "brdr05c"), 2, 2),
    WorldSpec("Frigid Highlands", "a5-frigid-highlands", 5,
              ds1("expansion/siege", "brdr_snow01c", "brdr_snow01r",
                  "brdr_snow02c", "brdr_snow03c"), 2, 2),
    WorldSpec("Arreat Plateau", "a5-arreat-plateau", 5,
              ds1("expansion/siege", "brdr05t", "brdr06c", "brdr07t", "brdr08r"), 2, 2),
    WorldSpec("Crystalline Passage", "a5-crystalline-passage", 5,
              ds1("expansion/icecave", "icenw01", "icene01", "icesw01", "icese01"), 2, 2),
    WorldSpec("Frozen River", "a5-frozen-river", 5,
              ds1("expansion/icecave", "poolroom01"), 1, 1),
    WorldSpec("Nihlathak's Temple", "a5-nihlathaks-temple", 5,
              ds1("expansion/wildtemple", "temple01"), 1, 1),
    WorldSpec("Halls of Vaught", "a5-halls-of-vaught", 5,
              ds1("expansion/wildtemple", "tempne01"), 1, 1),
    WorldSpec("Glacial Trail", "a5-glacial-trail", 5,
              ds1("expansion/icecave", "icenw02", "icene02", "icesw02", "icese02"), 2, 2),
    WorldSpec("Frozen Tundra", "a5-frozen-tundra", 5,
              ds1("expansion/siege", "brdr_snow05t", "brdr_snow06c",
                  "brdr_snow07t", "brdr_snow08r"), 2, 2),
    WorldSpec("Ancients' Way", "a5-ancients-way", 5,
              ds1("expansion/icecave", "icenw03", "icene03", "icesw03", "icese03"), 2, 2),
    WorldSpec("Arreat Summit", "a5-arreat-summit", 5,
              ds1("expansion/mountaintop", "mtntop"), 1, 1),
    WorldSpec("Worldstone Keep", "a5-worldstone-keep", 5,
              ds1("expansion/baallair", "baalnw01", "baalne01", "baalsw01", "baalse01"), 2, 2),
    WorldSpec("Throne of Destruction", "a5-throne-of-destruction", 5,
              ds1("expansion/baallair", "wthrone"), 1, 1),
)

WORLDS: dict[int, tuple[WorldSpec, ...]] = {
    1: ACT1_WORLDS,
    2: ACT2_WORLDS,
    3: ACT3_WORLDS,
    4: ACT4_WORLDS,
    5: ACT5_WORLDS,
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

    # The world's own tilesets resolve first; the blank fill only fills the
    # table entries no preset tileset defines.
    for tile in blank_tiles(source):
        catalogue.setdefault((tile.orientation, tile.main, tile.sub), tile)

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
    # Tile (0, 0) sits at origin_x; the world's leftmost diamond is the one in
    # the last row, so the crop has to start one half-width per row before it.
    left = origin_x - (scene.height - 1) * TILE_WIDTH // 2
    top = origin_y - TOP_MARGIN
    width = (scene.width + scene.height) * TILE_WIDTH // 2
    height = (scene.width + scene.height) * TILE_HEIGHT // 2 + TOP_MARGIN
    return left, top, width, height


def ground_cells(scene: tristram.Scene, kind: str):
    """Yield ``(index, cell, orientation)`` for the cells the ground draws.

    Lower walls are part of the terrain: the stairs and stone ledges a preset
    builds into a level are stored in the wall layers with an orientation of 16
    or more, and the editor paints them before the floor diamonds.  Everything
    with an orientation below 16 is an upper wall or prop, which this tool
    exports as a depth-sorted sprite instead.
    """
    for layer in scene.layers:
        if layer.kind != kind:
            continue
        if kind == "wall" and not layer.orientations:
            continue
        for index, cell in enumerate(layer.cells):
            if cell & 0x80000000 or cell & 0xFF == 0:
                continue
            if kind == "wall":
                orientation = layer.orientations[index] & 0xFF
                if orientation < 16:
                    continue
            elif kind == "floor":
                orientation = 0
            else:
                orientation = 13
            yield index, cell, orientation


def render_ground(scene: tristram.Scene, catalogue: dict[tuple[int, int, int], tristram.Tile],
                  palette: list[tuple[int, int, int, int]]) -> Image.Image:
    """Paint the terrain in the editor's layer order: lower walls, floors, shadows."""
    left, top, width, height = crop_origin(scene)
    origin_x = scene.height * TILE_WIDTH // 2
    origin_y = 512
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    for kind in ("wall", "floor", "shadow"):
        for index, cell, orientation in ground_cells(scene, kind):
            tile = catalogue.get(tristram.cell_key(cell, orientation))
            if not tile or not tile.blocks:
                continue
            column, row = index % scene.width, index // scene.width
            tristram.draw_tile(
                image, tile,
                origin_x + (column - row) * TILE_WIDTH // 2 - left,
                origin_y + (column + row) * TILE_HEIGHT // 2 - top,
                palette,
            )
    return image


def export_ground(scene: tristram.Scene, catalogue: dict[tuple[int, int, int], tristram.Tile],
                  palette: list[tuple[int, int, int, int]]) -> Image.Image:
    cropped = render_ground(scene, catalogue, palette)
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
    if sprites:
        atlas = Image.new("RGBA", (atlas_width, cursor_y + row_height), (0, 0, 0, 0))
        for key, sprite in sprites.items():
            atlas.alpha_composite(sprite, positions[key])
    else:
        # A preset whose walls are all lower walls (the Arcane Sanctuary) has no
        # depth-sorted strips; keep a 1x1 atlas so the client can still load it.
        atlas = Image.new("RGBA", (1, 1), (0, 0, 0, 0))

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

    # The union of the assembled grid's cells is one big diamond.  The client
    # fences the hero inside it (and draws its rim) so an area can never be
    # walked off the tiles, however open the chunk presets are.
    half_step_x = TILE_WIDTH // 2
    half_step_y = TILE_HEIGHT // 2
    left_apex_x = origin_x - (scene.height - 1) * half_step_x - left
    right_apex_x = origin_x + (scene.width - 1) * half_step_x + half_step_x - left
    walkable = {
        "x": (left_apex_x + right_apex_x) / 2,
        "y": origin_y + (scene.height - 1) * half_step_y + half_step_y - top,
        "halfWidth": (right_apex_x - left_apex_x) / 2,
        "halfHeight": (scene.width + scene.height) * half_step_y / 2,
    }

    layout = {
        "atlasWidth": atlas.width,
        "atlasHeight": atlas.height,
        "backdropWidth": width,
        "backdropHeight": height,
        "imageWidth": width,
        "imageHeight": height,
        "tileWidth": TILE_WIDTH,
        "tileHeight": TILE_HEIGHT,
        "walkable": walkable,
        "instances": instances,
    }
    return atlas, layout


def draw_diamond(draw: ImageDraw.ImageDraw, tile_x: int, tile_y: int) -> None:
    """Fill one isometric cell footprint in a mask's pixel space."""
    draw.polygon([
        (tile_x + TILE_WIDTH // 2, tile_y),
        (tile_x + TILE_WIDTH, tile_y + TILE_HEIGHT // 2),
        (tile_x + TILE_WIDTH // 2, tile_y + TILE_HEIGHT),
        (tile_x, tile_y + TILE_HEIGHT // 2),
    ], fill=255)


def export_collision(scene: tristram.Scene, catalogue: dict[tuple[int, int, int], tristram.Tile],
                     blank: frozenset[tuple[int, int, int]] = frozenset()) -> Image.Image:
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
            draw_diamond(draw, tile_x, tile_y)
    # The blank fill behind the walls is void, not floor: mark it solid so the
    # hero cannot walk into the black space a room's walls leave behind.
    for layer in scene.layers:
        if layer.kind != "floor":
            continue
        for index, cell in enumerate(layer.cells):
            if cell & 0x80000000 or cell & 0xFF == 0:
                continue
            if tristram.cell_key(cell, 0) not in blank:
                continue
            column, row = index % scene.width, index // scene.width
            tile_x = origin_x + (column - row) * TILE_WIDTH // 2 - left
            tile_y = origin_y + (column + row) * TILE_HEIGHT // 2 - top
            draw_diamond(draw, tile_x, tile_y)
    return mask


def write_world(spec: WorldSpec, source: Path, preview: Path | None) -> dict:
    palette = load_palette(source, spec.act)
    scene, catalogue = assemble(spec, source)
    if preview:
        image, _, _ = render_world(spec, source, palette)
        preview.parent.mkdir(parents=True, exist_ok=True)
        image.save(preview, optimize=True)
        print(f"preview {preview} {image.width}x{image.height}")

    ASSET_ROOT.mkdir(parents=True, exist_ok=True)
    ground = export_ground(scene, catalogue, palette)
    ground.save(ASSET_ROOT / f"{spec.slug}-ground.png", optimize=True)
    walls, layout = export_walls(scene, catalogue, palette)
    walls.save(ASSET_ROOT / f"{spec.slug}-walls.png", optimize=True)
    with (ASSET_ROOT / f"{spec.slug}-walls.json").open("w", encoding="utf-8") as handle:
        json.dump(layout, handle, separators=(",", ":"))
    blank = blank_keys(source)
    collision = export_collision(scene, catalogue, blank)
    collision.save(ASSET_ROOT / f"{spec.slug}-walls-collision.png", optimize=True)

    blank_cells = sum(
        1 for layer in scene.layers if layer.kind == "floor"
        for cell in layer.cells
        if not (cell & 0x80000000) and cell & 0xFF
        and tristram.cell_key(cell, 0) in blank
    )
    lower_walls = sum(1 for _ in ground_cells(scene, "wall"))
    print(f"{spec.area}: {scene.width}x{scene.height} tiles, "
          f"ground {ground.width}x{ground.height}, {len(layout['instances'])} wall strips, "
          f"{lower_walls} lower-wall tiles, {blank_cells} blank fill tiles")
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
