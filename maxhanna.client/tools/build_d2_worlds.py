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

from PIL import Image, ImageChops, ImageDraw, ImageFilter

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

# Diablo II marks the space outside a preset's rooms with its "blank" tile: main
# index 30 of the shared outdoor blank.dt1, a flat black diamond.  Every catacomb
# and tomb preset sets lvlprest's FillBlanks for it, and their own tilesets never
# define the table, so those cells drew as black holes between the rooms.  They
# are filled with the area's own floor instead.
VOID_MAIN_INDEX = 30


def is_void_cell(cell: int) -> bool:
    return bool(cell) and not cell & 0x80000000 and (cell >> 20) & 0x3F == VOID_MAIN_INDEX


def floor_cells(layers: list[tristram.Layer], count: int) -> bytearray:
    """Cells painted with real floor art: not the blank void tile, not hidden."""
    covered = bytearray(count)
    for layer in layers:
        if layer.kind != "floor":
            continue
        for index, cell in enumerate(layer.cells):
            if cell and not cell & 0x80000000 and not is_void_cell(cell):
                covered[index] = 1
    return covered


def wall_cells(layers: list[tristram.Layer], count: int) -> set[int]:
    """Cells with something built on them; the flood below cannot pass them."""
    walls = set()
    for layer in layers:
        if layer.kind != "wall":
            continue
        for index, cell in enumerate(layer.cells):
            if cell and not cell & 0x80000000:
                walls.add(index)
    return walls


def outside_cells(covered: bytearray, walls: set[int], width: int, height: int) -> bytearray:
    """Cells with no floor that a flood from the map border can reach.

    Those are the black rock a preset leaves outside its rooms.  A gap the flood
    cannot reach is a hole *inside* the level (the notch where four rooms meet),
    and that one does have to be paved over.
    """
    outside = bytearray(len(covered))
    stack: list[int] = []
    for index in range(len(covered)):
        row, column = divmod(index, width)
        border = row == 0 or row == height - 1 or column == 0 or column == width - 1
        if border and not covered[index] and index not in walls:
            outside[index] = 1
            stack.append(index)
    while stack:
        index = stack.pop()
        row, column = divmod(index, width)
        for next_row, next_column in ((row - 1, column), (row + 1, column),
                                      (row, column - 1), (row, column + 1)):
            if not (0 <= next_row < height and 0 <= next_column < width):
                continue
            neighbour = next_row * width + next_column
            if covered[neighbour] or outside[neighbour] or neighbour in walls:
                continue
            outside[neighbour] = 1
            stack.append(neighbour)
    return outside


def fill_ground_holes(layers: list[tristram.Layer], width: int, height: int) -> int:
    """Pave the void cells a preset leaves *inside* its rooms.

    Returns the number of cells filled.  A layer keeps one floor tile per world
    (its most common one), so the filler matches the room floor the preset
    painted around it.  The black rock beyond the rooms is left alone: that is
    the area's edge, and collision keeps the hero off it, so paving it turned
    every catacomb level into one flat sheet of repeated tiles.
    """
    count = max(len(layer.cells) for layer in layers)
    covered = floor_cells(layers, count)
    walls = wall_cells(layers, count)
    outside = outside_cells(covered, walls, width, height)
    filled = 0
    pave_blank = True
    for layer in layers:
        if layer.kind != "floor":
            continue
        counts: dict[int, int] = {}
        for cell in layer.cells:
            if not cell or cell & 0x80000000 or is_void_cell(cell):
                continue
            counts[cell] = counts.get(cell, 0) + 1
        if not counts:
            continue
        fill = max(counts.items(), key=lambda item: item[1])[0]
        cells = list(layer.cells)
        for index, cell in enumerate(cells):
            if covered[index] or outside[index]:
                continue
            if is_void_cell(cell) or (cell & 0x80000000 and index not in walls):
                cells[index] = fill
                filled += 1
            elif not cell and pave_blank:
                # A cell the preset leaves completely blank inside its walls is
                # still part of the room; the one at the junction of four rooms
                # is where an area change drops the hero.
                cells[index] = fill
                filled += 1
        layer.cells = tuple(cells)
        pave_blank = False
    return filled


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
    # Catacomb rooms are single room presets pinned to a 13x13 grid, and their
    # walls run inside that grid, so a 2x2 only joins up when every piece has a
    # doorway on all four sides: catnsew is that junction room. The corner
    # presets (catnw, catse, ...) close two sides each, and laid out against one
    # another they walled the map's centre - where the hero spawns - into a
    # black, sealed gap.
    WorldSpec("Catacombs", "a1-catacombs", 1,
              ds1("act1/catacomb", "catnsew", "catnsew",
                  "catnsew", "catnsew"), 2, 2),
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
# chunks are 13-cell rooms.  The Causeway uses the city quarter set: the single
# bridge cross leaves most of its map as empty, unwalkable void.
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
              ds1("act3/kurast", "metro16x16_4", "metro16x16_5",
                  "metro16x16_6", "metrogaten"), 2, 2),
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
# their 17-cell passages, and the Summit is a single authored preset.  Nihlathak's
# temple and the Halls of Vaught use the siege prison yards instead of Baal's
# lair: those quarters are 89% floor in one connected piece, where the lair's
# leave half the map as empty void and split it into a dozen islands.  The Throne
# (and the Keep) still use Baal's lair quarters.
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
              ds1("expansion/siege", "prisonaa", "prisonab",
                  "prisonba", "prisonbb"), 2, 2),
    WorldSpec("Halls of Vaught", "a5-halls-of-vaught", 5,
              ds1("expansion/siege", "prisoncc", "prisoncd",
                  "prisondc", "prisondd"), 2, 2),
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
              ds1("expansion/baallair", "baalnw02", "baalne02",
                  "baalsw02", "baalse02"), 2, 2),
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

    void_cells = fill_ground_holes(layers, width, height)
    scene = tristram.Scene(width, height, layers, [], max(0, spec.act - 1))
    return scene, catalogue, void_cells


def render_world(spec: WorldSpec, source: Path,
                 palette: list[tuple[int, int, int, int]]
                 ) -> tuple[Image.Image, tristram.Scene, dict[tuple[int, int, int], tristram.Tile]]:
    """Render the assembled chunks with the editor's layer order."""
    scene, catalogue, _ = assemble(spec, source)
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


def export_ground(scene: tristram.Scene, catalogue: dict[tuple[int, int, int], tristram.Tile],
                  palette: list[tuple[int, int, int, int]]) -> Image.Image:
    """Crop the shared base terrain pass and flatten it for the client.

    ``render_scene`` already paints the base terrain in the editor's order
    (lower walls first, then floors, then shadows) and leaves every upper wall
    to the depth-sorted sprites.  This tool only adds the crop and the client's
    flattening, so there is no second renderer to keep in sync with it.
    """
    left, top, width, height = crop_origin(scene)
    cropped = tristram.render_scene(scene, catalogue, palette, None, False).crop(
        (left, top, left + width, top + height))
    background = Image.new("RGBA", cropped.size, ARENA_BACKGROUND)
    background.alpha_composite(cropped)
    rgb = background.convert("RGB")
    brightened = rgb.point(lambda value: round(255 * (value / 255) ** BACKDROP_GAMMA))
    return brightened.quantize(colors=256, method=Image.Quantize.FASTOCTREE,
                               dither=Image.Dither.NONE)


def spawn_anchor(scene: tristram.Scene) -> tuple[int, int]:
    """Grid cell the hero should start on: the walkable cell nearest the middle.

    An area change drops the hero on the middle of the map, but a level built
    from room presets can have a walled-off pocket exactly there - the catacomb
    rooms close up the corner where four of them meet.  Only the largest
    connected run of floor counts, so the hero always lands somewhere they can
    walk out of.
    """
    width, height = scene.width, scene.height
    count = width * height
    covered = floor_cells(scene.layers, count)
    walls = wall_cells(scene.layers, count)
    walkable = [bool(covered[index]) and index not in walls for index in range(count)]
    region = [-1] * count
    best_region = -1
    best_cells: list[int] = []
    for index in range(count):
        if not walkable[index] or region[index] >= 0:
            continue
        region[index] = index
        stack = [index]
        cells = [index]
        while stack:
            current = stack.pop()
            row, column = divmod(current, width)
            for next_row, next_column in ((row - 1, column), (row + 1, column),
                                          (row, column - 1), (row, column + 1)):
                if not (0 <= next_row < height and 0 <= next_column < width):
                    continue
                neighbour = next_row * width + next_column
                if not walkable[neighbour] or region[neighbour] >= 0:
                    continue
                region[neighbour] = index
                stack.append(neighbour)
                cells.append(neighbour)
        if len(cells) > len(best_cells):
            best_region = index
            best_cells = cells
    if best_region < 0:
        return width // 2, height // 2
    middle_x, middle_y = (width - 1) / 2, (height - 1) / 2
    row, column = min(
        (divmod(index, width) for index in best_cells),
        key=lambda cell: abs(cell[1] - middle_x) + abs(cell[0] - middle_y),
    )
    return column, row


def export_walls(scene: tristram.Scene, catalogue: dict[tuple[int, int, int], tristram.Tile],
                 palette: list[tuple[int, int, int, int]]) -> tuple[Image.Image, dict]:
    """Pack every upper-wall tile once and list the cells that use it.

    Orientation 15 is a wall tile that faces no direction (the stone faces and
    railings Kurast builds along its streets).  It is a full-height sprite like
    any other upper wall, so it is packed here instead of being dropped.
    """
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
            if orientation >= 16:
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

    # Where the hero starts, in the same pixel space: the middle of a cell that
    # belongs to the level's largest walkable region.
    spawn_column, spawn_row = spawn_anchor(scene)
    spawn = {
        "x": origin_x + (spawn_column - spawn_row) * half_step_x - left + half_step_x,
        "y": origin_y + (spawn_column + spawn_row) * half_step_y - top + half_step_y,
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
        "spawn": spawn,
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


# Chunk folders whose areas are natural terrain: trees, rocks and clifftops.  There a
# DS1 wall cell only means "something stands here", and its art covers part of the
# diamond, so filling the whole diamond stops the hero on open grass a cell away from
# the tree.  Dungeons, tombs and towns keep cell-sized walls whose sprite seams would
# let a hero squeeze through if the mask followed the art, so only open ground is
# art-shaped.
OPEN_GROUND_FOLDERS = frozenset({"outdoors", "jungle", "mesa", "lava", "siege", "mountaintop"})
# In open ground a cell whose art nearly fills the diamond is solid wall to wall.
CELL_SOLID_SHARE = 0.85
# Alpha a wall sprite needs before its pixels count as something in the way.
WALL_ART_ALPHA = 96
# The hero's body stops this far short of the art, so it never clips into it.
WALL_BODY_MARGIN = 6

_CELL_DIAMOND: Image.Image | None = None


def cell_diamond() -> Image.Image:
    """Mask of one isometric cell, matching ``draw_diamond``."""
    global _CELL_DIAMOND
    if _CELL_DIAMOND is None:
        diamond = Image.new("L", (TILE_WIDTH, TILE_HEIGHT), 0)
        ImageDraw.Draw(diamond).polygon([
            (TILE_WIDTH // 2, 0),
            (TILE_WIDTH, TILE_HEIGHT // 2),
            (TILE_WIDTH // 2, TILE_HEIGHT),
            (0, TILE_HEIGHT // 2),
        ], fill=255)
        _CELL_DIAMOND = diamond
    return _CELL_DIAMOND


def wall_cell_stamp(tile: tristram.Tile,
                    palette: list[tuple[int, int, int, int]]) -> tuple[Image.Image, float]:
    """Wall pixels a tile paints inside its own cell, and the share of the cell it hides."""
    pad = 256
    canvas = Image.new("RGBA", (TILE_WIDTH + pad * 2, TILE_HEIGHT + pad * 2), (0, 0, 0, 0))
    tristram.draw_tile(canvas, tile, pad, pad, palette)
    cell = canvas.crop((pad, pad, pad + TILE_WIDTH, pad + TILE_HEIGHT))
    art = cell.getchannel("A").point(lambda alpha: 255 if alpha > WALL_ART_ALPHA else 0)
    stamp = ImageChops.multiply(art, cell_diamond())
    hidden = stamp.histogram()[255] / (TILE_WIDTH * TILE_HEIGHT / 2)
    grown = stamp.filter(ImageFilter.MaxFilter(2 * WALL_BODY_MARGIN + 1))
    return ImageChops.darker(grown, cell_diamond()), hidden


def is_open_ground(spec: WorldSpec) -> bool:
    """Whether an area is outdoor terrain rather than a built interior."""
    return all(chunk.split("/")[3] in OPEN_GROUND_FOLDERS for chunk in spec.chunks)


def export_collision(scene: tristram.Scene,
                     catalogue: dict[tuple[int, int, int], tristram.Tile],
                     palette: list[tuple[int, int, int, int]],
                     open_ground: bool) -> Image.Image:
    left, top, width, height = crop_origin(scene)
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    solid = Image.new("L", (TILE_WIDTH, TILE_HEIGHT), 255)
    stamps: dict[tuple[int, int, int], tuple[Image.Image, float]] = {}
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
            key = tristram.cell_key(cell, orientation)
            tile = catalogue.get(key)
            if tile is None:
                continue
            stamp = stamps.get(key)
            if stamp is None:
                stamp = stamps[key] = wall_cell_stamp(tile, palette)
            column, row = index % scene.width, index // scene.width
            tile_x = origin_x + (column - row) * TILE_WIDTH // 2 - left
            tile_y = origin_y + (column + row) * TILE_HEIGHT // 2 - top
            if not open_ground or stamp[1] >= CELL_SOLID_SHARE:
                draw_diamond(draw, tile_x, tile_y)
            else:
                mask.paste(solid, (tile_x, tile_y), stamp[0])
    # A cell with no floor is not floor: the black rock a preset keeps outside its
    # rooms must be solid, or the hero (and every monster) can walk out of the
    # level and stand in the void.
    covered = floor_cells(scene.layers, scene.width * scene.height)
    for index, painted in enumerate(covered):
        if painted:
            continue
        column, row = index % scene.width, index // scene.width
        draw_diamond(draw, origin_x + (column - row) * TILE_WIDTH // 2 - left,
                     origin_y + (column + row) * TILE_HEIGHT // 2 - top)
    return mask


def write_world(spec: WorldSpec, source: Path, preview: Path | None) -> dict:
    palette = load_palette(source, spec.act)
    scene, catalogue, void_cells = assemble(spec, source)
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
    collision = export_collision(scene, catalogue, palette, is_open_ground(spec))
    collision.save(ASSET_ROOT / f"{spec.slug}-walls-collision.png", optimize=True)
    lower_walls = sum(
        1 for layer in scene.layers if layer.kind == "wall" and layer.orientations
        for cell, orientation in zip(layer.cells, layer.orientations)
        if cell and not cell & 0x80000000 and cell & 0xFF and (orientation & 0xFF) >= 16
    )
    print(f"{spec.area}: {scene.width}x{scene.height} tiles, "
          f"ground {ground.width}x{ground.height}, {len(layout['instances'])} wall strips, "
          f"{lower_walls} lower-wall tiles, {void_cells} ground cells filled")
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
