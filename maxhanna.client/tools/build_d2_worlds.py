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

import numpy as np
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
            if not cell or cell & 0x80000000:
                continue
            # A roof hangs over the floor instead of standing on it.
            if layer.orientations and (layer.orientations[index] & 0xFF) == 15:
                continue
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
    #: Flat art colour of open water: impassable except where a bridge is painted
    #: over it.
    water: tuple[int, int, int] | None = None
    #: Build the mask out of the wall art instead of whole cells: every upper
    #: wall's drawn pixels inside its own cell, stamped from the sprites the wall
    #: atlas packs, with no share-of-the-cell threshold and no body margin (the
    #: client's nine-point probe is the body radius).  A room's walls fill their
    #: cell and stay solid either way; the sewer chunks are thin railings, arch
    #: bases and rubble standing on open floor, and fencing their cells put
    #: invisible walls across ground the hero can plainly see.
    wall_footprint: bool = False


def ds1(folder: str, *names: str) -> tuple[str, ...]:
    """Chunk presets as paths relative to the extraction's ``data`` folder."""
    return tuple(f"global/tiles/{folder}/{name}.ds1" for name in names)


# Every campaign area is built from the real chunk presets for its act.  The
# presets are laid out in a fixed order (no random rolls), so an area renders the
# same world every run.  Each set offers one chunk size per world: the 9-cell
# desert and snowfield pieces tile into 5x5, the 17-cell outdoor and ice chunks
# into 3x3 (51x51 tiles), and the 13-cell rooms into 3x3 where they offer a
# four-way junction room.  The large single preset set pieces (25 cells and up)
# are still used one at a time, so the exported backdrops stay in proportion to
# Act I's.
ACT1_WORLDS: tuple[WorldSpec, ...] = (
    WorldSpec("Blood Moor", "a1-blood-moor", 1,
              ds1("act1/outdoors", "wild1", "trees2", "wild2",
                  "wild4", "ruin2", "wild3",
                  "bivouac", "wild1", "trees3"), 3, 3),
    WorldSpec("Cold Plains", "a1-cold-plains", 1,
              ds1("act1/outdoors", "wild2", "wild3", "wild4",
                  "bivouac", "wild1", "trees2",
                  "wild3", "ruin2", "wild4"), 3, 3),
    WorldSpec("Stony Field", "a1-stony-field", 1,
              ds1("act1/outdoors", "wild3", "ruin2", "wild1",
                  "wild2", "trees3", "wild4",
                  "wild1", "bivouac", "wild2"), 3, 3),
    WorldSpec("Dark Wood", "a1-dark-wood", 1,
              ds1("act1/outdoors", "wild4", "trees3", "trees2",
                  "wild1", "wild4", "wild3",
                  "ruin2", "wild2", "wild1"), 3, 3),
    WorldSpec("Tamoe Highland", "a1-tamoe-highland", 1,
              ds1("act1/outdoors", "wild1", "wild4", "wild2",
                  "trees2", "wild3", "bivouac",
                  "wild4", "wild1", "trees3"), 3, 3),
    # Catacomb rooms are single room presets pinned to a 13x13 grid, and their
    # walls run inside that grid, so a grid only joins up when every piece has a
    # doorway on all four sides: catnsew is that junction room. The corner
    # presets (catnw, catse, ...) close two sides each, and laid out against one
    # another they walled the map's centre - where the hero spawns - into a
    # black, sealed gap.
    #
    # The junction room is a warren of arches and pens, so the middle of the 3x3
    # is the open chamber preset instead: it still joins every neighbour (one
    # connected region) and gives the hero a hall to start in rather than a gap
    # between two wall runs.
    WorldSpec("Catacombs", "a1-catacombs", 1,
              ds1("act1/catacomb", "catnsew", "catnsew", "catnsew",
                  "catnsew", "cate", "catnsew",
                  "catnsew", "catnsew", "catnsew"), 3, 3),
)

# Act II: the desert and city chunks are 9-cell squares, so their areas are 5x5;
# the oasis and the tomb presets are 17-cell squares; and the sewers, Sanctuary
# and Durance rooms are 13-cell presets whose only piece with a doorway on all
# four sides is their junction room (sewnsew, sanctnsew, mephnsew), so those
# areas repeat it.  The tomb preset set works the same way: most pieces are
# sealed rooms with a single doorway (tombn, tombe, tombstalrasha, ...), and
# Diablo II joins them with corridors laid out at run time.  The four nsew
# variants are the set's four-way rooms: their doorways all sit on the same
# boundary cells, so a 3x3 grid of them joins every hall to its neighbours and
# the level is one connected tomb instead of a scatter of sealed chambers around
# black rock.  Their collision comes from the wall art itself, because fencing
# whole cells put invisible walls across doorway cells the ground clearly opens.
# The Claw Viper Temple keeps its 2x2 quad of separately themed rooms.
ACT2_WORLDS: tuple[WorldSpec, ...] = (
    WorldSpec("Sewers", "a2-sewers", 2,
              ds1("act2/sewer", "sewnsew", "sewnsew2", "sewnsew",
                  "sewnsewtheme", "sewnsew", "sewnsew2",
                  "sewnsew", "sewnsewtheme", "sewnsew"), 3, 3,
              wall_footprint=True),
    WorldSpec("Rocky Waste", "a2-rocky-waste", 2,
              ds1("act2/outdoors", "desert1", "desert2", "desert3", "desert4", "desert5",
                  "desert6", "desert7", "desert8", "desert9", "desert10",
                  "desert2", "desert4", "desert6", "desert8", "desert1",
                  "desert3", "desert5", "desert7", "desert9", "desert10",
                  "ruin4", "ruin5", "ruin6", "ruin7", "desert1"), 5, 5),
    WorldSpec("Dry Hills", "a2-dry-hills", 2,
              ds1("act2/outdoors", "desert10", "desert2", "desert4", "desert6", "desert8",
                  "ruin4", "ruin5", "ruin6", "ruin7", "desert1",
                  "desert3", "desert5", "desert7", "desert9", "desert2",
                  "ruin5", "ruin4", "ruin7", "ruin6", "desert10",
                  "desert1", "desert3", "desert5", "desert7", "desert9"), 5, 5),
    WorldSpec("Far Oasis", "a2-far-oasis", 2,
              ds1("act2/outdoors", "oasis5", "oasis6", "oasis7",
                  "oasis8", "oasis9", "oasis10",
                  "oasis11", "oasis12", "oasis6"), 3, 3),
    WorldSpec("Lost City", "a2-lost-city", 2,
              ds1("act2/ruin", "ruin1", "ruin2", "ruin3", "ruin4", "ruin5",
                  "ruin6", "ruin7", "ruin8", "ruin9", "ruin10",
                  "ruin1", "ruin2", "ruin3", "ruin4", "ruin5",
                  "ruin6", "ruin7", "ruin8", "ruin9", "ruin10",
                  "ruin3", "ruin5", "ruin7", "ruin9", "ruin2"), 5, 5),
    WorldSpec("Valley of Snakes", "a2-valley-of-snakes", 2,
              ds1("act2/outdoors", "oasis9", "oasis10", "oasis11",
                  "oasis12", "viper1", "oasis5",
                  "oasis6", "oasis7", "oasis8"), 3, 3),
    WorldSpec("Claw Viper Temple", "a2-claw-viper-temple", 2,
              ds1("act2/tomb", "serpent1", "tombnw", "tombne", "tombnse"), 2, 2),
    WorldSpec("Arcane Sanctuary", "a2-arcane-sanctuary", 2,
              ds1("act2/arcane", "sanctnsew", "sanctnsew", "sanctnsew",
                  "sanctnsew", "sanctnsew", "sanctnsew",
                  "sanctnsew", "sanctnsew", "sanctnsew"), 3, 3),
    WorldSpec("Tal Rasha's Tomb", "a2-tal-rashas-tomb", 2,
              ds1("act2/tomb", "tombnsew", "tombnsew2", "tombnsew3",
                  "tombnsewtheme", "tombnsew2", "tombnsew",
                  "tombnsew3", "tombnsewtheme", "tombnsew2"), 3, 3,
              wall_footprint=True),
)

# Act III: the jungle quarters are 33-cell presets, so each jungle area is the
# four quarters of its own set (66x66 tiles); Kurast's city chunks are 17-cell
# rooms laid out 3x3, Travincal is one authored square, and the Durance repeats
# its four-way junction room like the other 13-cell dungeons.
ACT3_WORLDS: tuple[WorldSpec, ...] = (
    WorldSpec("Spider Forest", "a3-spider-forest", 3,
              ds1("act3/jungle", "spidnw", "spidne", "spidsw", "spidse"), 2, 2),
    WorldSpec("Great Marsh", "a3-great-marsh", 3,
              ds1("act3/jungle", "bognw", "bogne", "bogsw", "bogse"), 2, 2),
    WorldSpec("Flayer Jungle", "a3-flayer-jungle", 3,
              ds1("act3/jungle", "pygnw", "pygne", "pygsw", "pygse"), 2, 2),
    WorldSpec("Lower Kurast", "a3-lower-kurast", 3,
              ds1("act3/kurast", "slums16x16_0", "slums16x16_1", "slums16x16_2",
                  "metro16x16_6", "slums16x16_0", "metro16x16_0",
                  "metrogaten", "slums16x16_1", "slums16x16_2"), 3, 3),
    WorldSpec("Kurast Bazaar", "a3-kurast-bazaar", 3,
              ds1("act3/kurast", "metro16x16_0", "metro16x16_1", "metro16x16_2",
                  "metro16x16_3", "metro16x16_4", "metro16x16_5",
                  "metro16x16_6", "metrogaten", "metro16x16_0"), 3, 3),
    WorldSpec("Upper Kurast", "a3-upper-kurast", 3,
              ds1("act3/kurast", "burbs16x16_0", "burbs16x16_1", "burbs16x16_2",
                  "burbs16x16_3", "burbstemple2", "burbs16x16_0",
                  "burbs16x16_1", "burbstemple3", "burbs16x16_3"), 3, 3),
    WorldSpec("Kurast Causeway", "a3-kurast-causeway", 3,
              ds1("act3/kurast", "metro16x16_4", "metro16x16_5", "metro16x16_6",
                  "metrogaten", "metro16x16_4", "metro16x16_5",
                  "metro16x16_6", "metro16x16_4", "metrogaten"), 3, 3),
    WorldSpec("Travincal", "a3-travincal", 3,
              ds1("act3/travincal", "travs"), 1, 1),
    WorldSpec("Durance of Hate", "a3-durance-of-hate", 3,
              ds1("act3/travincal", "mephnsew", "mephnsew", "mephnsew",
                  "mephnsew", "mephnsew", "mephnsew",
                  "mephnsew", "mephnsew", "mephnsew"), 3, 3),
)

# Act IV: the steppes and city are 17-cell mesa chunks laid out 3x3; the River of
# Flame and the Chaos Sanctuary are single 25-cell set pieces (the lava river and
# the pentagram), whose quarters are complete scenes and so cannot be joined.
ACT4_WORLDS: tuple[WorldSpec, ...] = (
    WorldSpec("Outer Steppes", "a4-outer-steppes", 4,
              ds1("act4/mesa", "outer16x16_0", "outer16x16_1", "outer16x16_2",
                  "outer16x16_3", "outer16x16_4", "outer16x16_0",
                  "outer16x16_1", "outer16x16_2", "outer16x16_3"), 3, 3),
    WorldSpec("Plains of Despair", "a4-plains-of-despair", 4,
              ds1("act4/mesa", "mid16x16_0", "mid16x16_1", "mid16x16_2",
                  "mid16x16_3", "mid16x16_4", "mid16x16_0",
                  "mid16x16_1", "mid16x16_2", "mid16x16_3"), 3, 3),
    WorldSpec("City of the Damned", "a4-city-of-the-damned", 4,
              ds1("act4/mesa", "midpit16x16_0", "midpit16x16_1", "midpit16x16_2",
                  "outpit16x16_0", "chaos16x16_0", "outpit16x16_1",
                  "midpit16x16_0", "outpit16x16_2", "midpit16x16_1"), 3, 3),
    WorldSpec("River of Flame", "a4-river-of-flame", 4,
              ds1("act4/lava", "lavanew2"), 1, 1),
    WorldSpec("Chaos Sanctuary", "a4-chaos-sanctuary", 4,
              ds1("act4/diab", "heart"), 1, 1),
)

# Act V: the snowfield areas are the siege set's 9-cell ground pieces laid out
# 5x5 (its 17-cell border chunks are cliff faces that leave a level 15% floor and
# split it into islands when more than a quad is used); the ice caves are their
# 17-cell passages 3x3; and the Summit is a single authored preset.  Nihlathak's
# temple and the Halls of Vaught use the siege prison yards instead of Baal's
# lair: those quarters are 89% floor in one connected piece.  The Keep and the
# Throne use Baal's lair's four-way junction rooms.
ACT5_WORLDS: tuple[WorldSpec, ...] = (
    WorldSpec("Bloody Foothills", "a5-bloody-foothills", 5,
              ds1("expansion/siege", "farm1", "cliff2", "lake1", "landmark1", "farm2",
                  "cliff3", "farm3", "lake2", "landmark2", "cliff6",
                  "farm4", "lake3", "landmark3", "farm5", "cliff10",
                  "farm6", "lake4", "landmark4", "farm1a", "cliff3a",
                  "farm2a", "lake5", "landmark5", "farm3a", "lake6"), 5, 5),
    WorldSpec("Frigid Highlands", "a5-frigid-highlands", 5,
              ds1("expansion/siege", "cliff2", "lake7", "landmark1a", "farm4a", "cliff6",
                  "lake8", "landmark2a", "cliff3", "farm5a", "lake1",
                  "landmark3", "cliff10", "farm6a", "lake2", "landmark4",
                  "cliff3a", "farm1", "lake3", "landmark5", "cliff2",
                  "farm2", "lake4", "landmark2", "cliff6", "farm3"), 5, 5),
    WorldSpec("Arreat Plateau", "a5-arreat-plateau", 5,
              ds1("expansion/siege", "farm6", "cliff10", "landmark5", "lake5", "cliff3a",
                  "landmark4", "farm3a", "cliff6", "lake6", "farm1a",
                  "cliff2", "landmark3", "farm4", "lake7", "cliff3",
                  "landmark2a", "farm2a", "cliff10", "lake8", "farm5a",
                  "cliff6", "landmark1", "farm6a", "lake1", "farm1"), 5, 5),
    WorldSpec("Crystalline Passage", "a5-crystalline-passage", 5,
              ds1("expansion/icecave", "icensew01", "icensew01", "icensew01",
                  "icensew01", "icensew01", "icensew01",
                  "icensew01", "icensew01", "icensew01"), 3, 3),
    # The Frozen River preset lays its river down as flat, unshaded floor, the
    # same layer as the ground, so nothing in the chunk says the water is water:
    # the hero walked across it and the bridges were decoration.  Its exact art
    # colour is the shoreline.
    WorldSpec("Frozen River", "a5-frozen-river", 5,
              ds1("expansion/icecave", "poolroom01"), 1, 1, water=(67, 81, 81)),
    WorldSpec("Nihlathak's Temple", "a5-nihlathaks-temple", 5,
              ds1("expansion/siege", "prisonaa", "prisonab", "prisonaa",
                  "prisonba", "prisonbb", "prisonba",
                  "prisoncc", "prisoncd", "prisoncc"), 3, 3),
    WorldSpec("Halls of Vaught", "a5-halls-of-vaught", 5,
              ds1("expansion/siege", "prisonaa", "prisonab", "prisonab",
                  "prisonba", "prisonbb", "prisonbb",
                  "prisoncc", "prisoncd", "prisoncd"), 3, 3),
    WorldSpec("Glacial Trail", "a5-glacial-trail", 5,
              ds1("expansion/icecave", "icensew01", "icensew03", "icensew01",
                  "icensew03", "icensew01", "icensew03",
                  "icensew01", "icensew03", "icensew01"), 3, 3),
    WorldSpec("Frozen Tundra", "a5-frozen-tundra", 5,
              ds1("expansion/siege", "lake1", "farm2", "cliff3", "landmark2", "lake8",
                  "farm6", "cliff6", "landmark1a", "lake7", "cliff2",
                  "landmark5", "farm3", "lake4", "cliff3a", "farm1a",
                  "cliff10", "landmark4", "farm5", "lake2", "farm2a",
                  "cliff6", "lake3", "landmark3", "farm4a", "lake5"), 5, 5),
    WorldSpec("Ancients' Way", "a5-ancients-way", 5,
              ds1("expansion/icecave", "icensew03", "icensew01", "icensew03",
                  "icensew01", "icensew03", "icensew01",
                  "icensew03", "icensew01", "icensew03"), 3, 3),
    WorldSpec("Arreat Summit", "a5-arreat-summit", 5,
              ds1("expansion/mountaintop", "mtntop"), 1, 1),
    WorldSpec("Worldstone Keep", "a5-worldstone-keep", 5,
              ds1("expansion/baallair", "baalnsew02", "baalnsew02", "baalnsew02",
                  "baalnsew02", "baalnsew02", "baalnsew02",
                  "baalnsew02", "baalnsew02", "baalnsew02"), 3, 3),
    WorldSpec("Throne of Destruction", "a5-throne-of-destruction", 5,
              ds1("expansion/baallair", "baalnsew01", "baalnsew01", "baalnsew01",
                  "baalnsew01", "baalnsew01", "baalnsew01",
                  "baalnsew01", "baalnsew01", "baalnsew01"), 3, 3),
)

# Pandemonium event: Uber Duriel's Forgotten Sands is a level of its own in
# Diablo II (`Act 5 - Pandemonium 2`, level 134) and draws on the Act 2 desert
# set.  It used to fall back to the act's shared cave backdrop, so it rendered as
# a stretched picture of the act 2 map instead of an assembled world.  The chunk
# mix below is its own: ruined desert courtyards rather than the open dunes of
# Rocky Waste or the oasis of Far Oasis.
ACT6_WORLDS: tuple[WorldSpec, ...] = (
    WorldSpec("Forgotten Sands", "a6-forgotten-sands", 2,
              ds1("act2/outdoors", "ruin4", "desert3", "ruin5",
                  "desert7", "ruin6", "desert1",
                  "ruin7", "desert5", "ruin4"), 3, 3),
)

WORLDS: dict[int, tuple[WorldSpec, ...]] = {
    1: ACT1_WORLDS,
    2: ACT2_WORLDS,
    3: ACT3_WORLDS,
    4: ACT4_WORLDS,
    5: ACT5_WORLDS,
    6: ACT6_WORLDS,
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


def walkable_diamond(scene: tristram.Scene) -> dict[str, float]:
    """The diamond the assembled grid covers, in exported image pixels.

    The client fences the hero inside it (and draws its rim) so an area can
    never be walked off the tiles, however open the chunk presets are.  The
    spawn search has to use the same edge: outside the diamond is void, not floor.
    """
    left, top, _, _ = crop_origin(scene)
    origin_x = scene.height * TILE_WIDTH // 2
    origin_y = 512
    half_step_x = TILE_WIDTH // 2
    half_step_y = TILE_HEIGHT // 2
    left_apex_x = origin_x - (scene.height - 1) * half_step_x - left
    right_apex_x = origin_x + (scene.width - 1) * half_step_x + half_step_x - left
    return {
        "x": (left_apex_x + right_apex_x) / 2,
        "y": origin_y + (scene.height - 1) * half_step_y + half_step_y - top,
        "halfWidth": (right_apex_x - left_apex_x) / 2,
        "halfHeight": (scene.width + scene.height) * half_step_y / 2,
    }


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


CLEARANCE_STRIDE = 8


def clearance_depth(mask: Image.Image) -> np.ndarray:
    """Free space tagged with how many erosion steps fit inside it, by pixel.

    A doorway between two wall runs is free ground as much as a courtyard is, so
    connectivity alone cannot tell them apart.  The number of erosion steps a
    patch of floor survives is its distance to the nearest solid pixel, in
    ``CLEARANCE_STRIDE``-pixel units, which is what a hero standing in it feels.
    """
    small = np.asarray(mask.resize(
        (max(1, mask.width // CLEARANCE_STRIDE), max(1, mask.height // CLEARANCE_STRIDE)),
        Image.BOX,
    )) <= 127
    depth = np.zeros(small.shape, dtype=np.int16)
    current = small.copy()
    current[0, :] = current[-1, :] = False
    current[:, 0] = current[:, -1] = False
    steps = 0
    while current.any() and steps < 512:
        depth[current] = steps
        eroded = current.copy()
        eroded[1:, :] &= current[:-1, :]
        eroded[:-1, :] &= current[1:, :]
        eroded[:, 1:] &= current[:, :-1]
        eroded[:, :-1] &= current[:, 1:]
        current = eroded
        steps += 1
    return depth


def spawn_anchor(scene: tristram.Scene, mask: Image.Image | None = None) -> tuple[int, int]:
    """Grid cell the hero should start on: the open floor nearest the middle.

    An area change drops the hero on the middle of the map, but a level built
    from room presets can have a walled-off pocket exactly there - the catacomb
    rooms close up the corner where four of them meet.  Only the largest
    connected run of floor counts, so the hero always lands somewhere they can
    walk out of.

    Being in that region is not enough on its own: a junction cell is a gap in a
    wall band, and starting there reads as being boxed in even though every
    direction is technically walkable.  With the exported collision mask in hand
    the widest cell wins, measured by the clearance around it.
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
    candidates = [divmod(index, width) for index in best_cells]

    def to_middle(cell: tuple[int, int]) -> int:
        return -abs(cell[1] - middle_x) - abs(cell[0] - middle_y)

    if mask is None:
        row, column = max(candidates, key=to_middle)
        return column, row

    # Outside the tile diamond is void, not open floor, so the search has to see
    # the same wall the client fences the hero with; otherwise a corner of the
    # map scores as the widest space there is.
    diamond = walkable_diamond(scene)
    inside = Image.new("L", mask.size, 0)
    ImageDraw.Draw(inside).polygon([
        (diamond["x"], diamond["y"] - diamond["halfHeight"]),
        (diamond["x"] + diamond["halfWidth"], diamond["y"]),
        (diamond["x"], diamond["y"] + diamond["halfHeight"]),
        (diamond["x"] - diamond["halfWidth"], diamond["y"]),
    ], fill=255)
    depth = clearance_depth(ImageChops.lighter(mask, ImageChops.invert(inside)))
    left, top, _, _ = crop_origin(scene)
    origin_x = scene.height * TILE_WIDTH // 2
    origin_y = 512

    def clearance(cell: tuple[int, int]) -> int:
        row, column = cell
        x = origin_x + (column - row) * TILE_WIDTH // 2 - left + TILE_WIDTH // 2
        y = origin_y + (column + row) * TILE_HEIGHT // 2 - top + TILE_HEIGHT // 2
        row_index = min(depth.shape[0] - 1, max(0, y // CLEARANCE_STRIDE))
        column_index = min(depth.shape[1] - 1, max(0, x // CLEARANCE_STRIDE))
        return int(depth[row_index, column_index])

    # Stay near the middle of the area - an open corner would otherwise win - and
    # take the widest cell of that middle band.
    near_middle = [cell for cell in candidates
                   if abs(cell[1] - middle_x) <= width / 4
                   and abs(cell[0] - middle_y) <= height / 4]
    row, column = max(near_middle or candidates,
                      key=lambda cell: (clearance(cell), to_middle(cell)))
    return column, row


def spawn_point(scene: tristram.Scene, spawn_cell: tuple[int, int]) -> dict[str, float]:
    """The middle of a cell, in the exported image's pixel space.

    The spawn depends on the collision mask, while the mask for a footprint world
    is built out of the wall layout, so the layout is assembled first and its
    spawn filled in once the mask exists.
    """
    left, top, _, _ = crop_origin(scene)
    origin_x = scene.height * TILE_WIDTH // 2
    origin_y = 512
    half_step_x = TILE_WIDTH // 2
    half_step_y = TILE_HEIGHT // 2
    spawn_column, spawn_row = spawn_cell
    return {
        "x": origin_x + (spawn_column - spawn_row) * half_step_x - left + half_step_x,
        "y": origin_y + (spawn_column + spawn_row) * half_step_y - top + half_step_y,
    }


def export_walls(scene: tristram.Scene, catalogue: dict[tuple[int, int, int], tristram.Tile],
                 palette: list[tuple[int, int, int, int]],
                 spawn_cell: tuple[int, int]) -> tuple[Image.Image, dict]:
    """Pack every upper-wall tile once and list the cells that use it.

    Orientation 15 marks a roof: the thatch a hut hangs over its own floor.  It
    is a full-height sprite like any other upper wall, so it is packed here, but
    it is not drawn at its own cell's depth.  Sorting a roof by its own cell
    puts the hut's front wall over the thatch, which reads as a roof sunk into
    the house, so every roof cell takes the depth of the front-most cell of the
    cluster of touching roofs it belongs to.  The cluster id travels with the
    instance as well, so the client can lift one hut's roof while the hero is
    standing under it.
    """
    left, top, width, height = crop_origin(scene)
    origin_x = scene.height * TILE_WIDTH // 2
    origin_y = 512

    placements_by_cell: list[tuple[float, float, tuple[int, int, int], int, int, bool]] = []
    for layer in scene.layers:
        if layer.kind != "wall" or not layer.orientations:
            continue
        for index, cell in enumerate(layer.cells):
            if cell & 0x80000000 or cell & 0xFF == 0:
                continue
            orientation = layer.orientations[index] & 0xFF
            # A lower wall is drawn beneath the floor, never on it.
            if orientation >= 16:
                continue
            key = tristram.cell_key(cell, orientation)
            if key not in catalogue:
                continue
            column, row = index % scene.width, index // scene.width
            placements_by_cell.append((float(row + column), float(column), key, column, row,
                                       orientation == 15))
    placements_by_cell.sort(key=lambda entry: entry[:2])

    # Roofs are overhead, so a hut's thatch has to draw above every wall of that
    # hut instead of interleaving with them, and the roof of one hut has to come
    # off as a whole when the hero walks in.  Touching roof cells are one hut.
    roof_cells = {(column, row) for _, _, _, column, row, roof
                  in placements_by_cell if roof}
    hut_of: dict[tuple[int, int], int] = {}
    hut_base: dict[int, float] = {}
    for cell in sorted(roof_cells):
        if cell in hut_of:
            continue
        hut = len(hut_base)
        hut_of[cell] = hut
        stack = [cell]
        base = 0.0
        while stack:
            column, row = stack.pop()
            base = max(base, float(origin_y + (column + row) * TILE_HEIGHT // 2 - top + TILE_HEIGHT))
            for neighbour in ((column - 1, row), (column + 1, row),
                              (column, row - 1), (column, row + 1)):
                if neighbour in roof_cells and neighbour not in hut_of:
                    hut_of[neighbour] = hut
                    stack.append(neighbour)
        hut_base[hut] = base

    sprites: dict[tuple[int, int, int], Image.Image] = {}
    boxes: dict[tuple[int, int, int], tuple[int, int, int, int]] = {}
    for _, _, key, _, _, _ in placements_by_cell:
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
    for order, (_, _, key, column, row, roof) in enumerate(placements_by_cell):
        x0, y0, sprite_width, sprite_height = boxes[key]
        atlas_x, atlas_y = positions[key]
        tile_x = origin_x + (column - row) * TILE_WIDTH // 2
        tile_y = origin_y + (column + row) * TILE_HEIGHT // 2
        instance = {
            "x": tile_x - left + x0,
            "y": tile_y - top + y0,
            "w": sprite_width,
            "h": sprite_height,
            "sx": atlas_x,
            "sy": atlas_y,
            "depth": tile_y - top + TILE_HEIGHT,
            "order": order,
        }
        if roof:
            hut = hut_of[(column, row)]
            instance["roof"] = 1
            instance["hut"] = hut
            instance["depth"] = hut_base[hut]
            # The cell's diamond centre, in the layout's pixel space, so the
            # client can tell whether the hero is standing under this roof.
            instance["hx"] = tile_x - left + TILE_WIDTH // 2
            instance["hy"] = tile_y - top + TILE_HEIGHT // 2
            # Roof cells with roofs on all four sides are the hut's inside.  The
            # client takes a hut's roof off only for those, so brushing past the
            # eaves on the street does not make a roof flicker.
            inside = all((column + dc, row + dr) in roof_cells
                         for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)))
            if inside:
                instance["core"] = 1
        instances.append(instance)

    half_step_x = TILE_WIDTH // 2
    half_step_y = TILE_HEIGHT // 2
    walkable = walkable_diamond(scene)

    # Where the hero starts, in the same pixel space: the middle of a cell that
    # belongs to the level's largest walkable region.
    spawn = spawn_point(scene, spawn_cell)

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
# How far off a world's flat water colour still counts as water.
WATER_COLOUR_TOLERANCE = 6
# The dithered ice around deep water throws stray pixels of the water colour;
# a pool has to be at least this many pixels wide to count as water.
WATER_SPECKLE_RADIUS = 3
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


def water_collision(ground: Image.Image, colour: tuple[int, int, int]) -> Image.Image:
    """Mask of the flat water colour in a rendered ground.

    Deep water is drawn as one unshaded colour, so the exact art colour is a
    reliable shoreline; the bridge planks painted over it are timber and stay
    open.  The shore's blend tiles are slightly off the flat colour and stay
    walkable, which is where the hero's feet belong.
    """
    ground = ground.convert("RGB")
    difference = ImageChops.difference(ground, Image.new("RGB", ground.size, colour))
    near: Image.Image | None = None
    for band in difference.split():
        band = band.point(lambda value: 255 if value <= WATER_COLOUR_TOLERANCE else 0)
        near = band if near is None else ImageChops.multiply(near, band)
    assert near is not None
    # An opening keeps the pools and drops the speckle the ice texture shows in
    # the water's own colour, which would otherwise be invisible bumps all over
    # the walkable shore.
    speck = 2 * WATER_SPECKLE_RADIUS + 1
    return near.filter(ImageFilter.MinFilter(speck)).filter(ImageFilter.MaxFilter(speck))


def floor_void_mask(scene: tristram.Scene) -> Image.Image:
    """Cells with no floor art at all, as solid rock.

    The black rock a preset keeps outside its rooms carries no floor tile, so
    nothing is drawn there; leaving it open would let the hero walk out of the
    level and stand in the transparent void.
    """
    left, top, width, height = crop_origin(scene)
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    origin_x = scene.height * TILE_WIDTH // 2
    origin_y = 512
    covered = floor_cells(scene.layers, scene.width * scene.height)
    for index, painted in enumerate(covered):
        if painted:
            continue
        column, row = index % scene.width, index // scene.width
        draw_diamond(draw, origin_x + (column - row) * TILE_WIDTH // 2 - left,
                     origin_y + (column + row) * TILE_HEIGHT // 2 - top)
    return mask


def wall_footprint_collision(scene: tristram.Scene,
                             catalogue: dict[tuple[int, int, int], tristram.Tile],
                             palette: list[tuple[int, int, int, int]]) -> Image.Image:
    """Every wall's drawn pixels inside its own cell, and nothing else.

    Each upper wall is the sprite the atlas packs, drawn at its placement; the
    part standing on *its* cell is that wall's footprint, so the mask is the art
    instead of a guess about how much of a cell it covers.  The tall face a wall
    raises over the cells diagonally behind it is deliberately not included: the
    client depth-sorts the hero against those strips, so that floor is meant to
    be walked on, and clipping each sprite to its own cell keeps the mask on the
    ground the wall actually occupies.  The hero's body radius is the client's
    nine-point probe, so no margin is baked in here.
    """
    left, top, width, height = crop_origin(scene)
    mask = Image.new("L", (width, height), 0)
    solid = Image.new("L", (TILE_WIDTH, TILE_HEIGHT), 255)
    diamond = cell_diamond()
    origin_x = scene.height * TILE_WIDTH // 2
    origin_y = 512
    stamps: dict[tuple[int, int, int], Image.Image] = {}
    for layer in scene.layers:
        if layer.kind != "wall" or not layer.orientations:
            continue
        for index, cell in enumerate(layer.cells):
            if cell & 0x80000000 or cell & 0xFF == 0:
                continue
            orientation = layer.orientations[index] & 0xFF
            # A roof hangs over the floor and a lower wall is drawn beneath it;
            # neither stands on the ground the hero walks on.
            if orientation >= 16 or orientation == 15:
                continue
            key = tristram.cell_key(cell, orientation)
            tile = catalogue.get(key)
            if tile is None:
                continue
            drawn_in_cell = stamps.get(key)
            if drawn_in_cell is None:
                sprite, (x0, y0, _, _) = tristram.render_wall_sprite(tile, palette)
                drawn = sprite.getchannel("A").point(lambda alpha: 255 if alpha > 0 else 0)
                in_cell = Image.new("L", (TILE_WIDTH, TILE_HEIGHT), 0)
                in_cell.paste(drawn, (x0, y0), drawn)
                drawn_in_cell = stamps[key] = ImageChops.multiply(in_cell, diamond)
            if drawn_in_cell.getbbox() is None:
                continue
            column, row = index % scene.width, index // scene.width
            tile_x = origin_x + (column - row) * TILE_WIDTH // 2 - left
            tile_y = origin_y + (column + row) * TILE_HEIGHT // 2 - top
            mask.paste(solid, (tile_x, tile_y), drawn_in_cell)
    return mask


def audit_floor_collision(art: Image.Image, solid: Image.Image,
                          scene: tristram.Scene) -> None:
    """Report floor cells the finished mask blocks, and which of them are art.

    A wall sprite is taller than its cell and leans over the cells above it, so a
    floor cell the art covers is genuinely solid.  A blocked floor cell the art
    does *not* cover means the mask grew somewhere the picture shows no wall,
    which is the only kind of block this audit treats as wrong.
    """
    left, top, _, _ = crop_origin(scene)
    origin_x = scene.height * TILE_WIDTH // 2
    origin_y = 512
    # The audit looks one pixel inside the cell: neighbouring diamonds share
    # their rim, so a void cell's outline would otherwise read as a block on the
    # floor cell next to it.
    diamond = cell_diamond().filter(ImageFilter.MinFilter(3))
    covered = floor_cells(scene.layers, scene.width * scene.height)
    blocked = solid.load()
    art_pixels = art.load()
    area = diamond.histogram()[255]
    overhang = []
    unexplained = 0
    centre_blocked = 0
    for index, painted in enumerate(covered):
        if not painted:
            continue
        column, row = index % scene.width, index // scene.width
        tile_x = origin_x + (column - row) * TILE_WIDTH // 2 - left
        tile_y = origin_y + (column + row) * TILE_HEIGHT // 2 - top
        cell_art = ImageChops.multiply(
            art.crop((tile_x, tile_y, tile_x + TILE_WIDTH, tile_y + TILE_HEIGHT)), diamond)
        cell_solid = ImageChops.multiply(
            solid.crop((tile_x, tile_y, tile_x + TILE_WIDTH, tile_y + TILE_HEIGHT)), diamond)
        stray = ImageChops.subtract(cell_solid, cell_art).histogram()[255]
        unexplained += stray
        covered_share = cell_solid.histogram()[255] / area
        centre_x = min(solid.width - 1, tile_x + TILE_WIDTH // 2)
        centre_y = min(solid.height - 1, tile_y + TILE_HEIGHT // 2)
        if blocked[centre_x, centre_y] > 127:
            centre_blocked += 1
        if cell_art.histogram()[255] > 0:
            overhang.append((covered_share, column, row))
    overhang.sort(reverse=True)
    print(f"  collision audit: {sum(covered)} floor cells, "
          f"{len(overhang)} under wall art (of which {centre_blocked} lose their centre), "
          f"{unexplained} blocked pixels with no wall art over them")
    for share, column, row in overhang[:8]:
        print(f"    column {column:2d} row {row:2d}: {share * 100:5.1f}% of the cell under wall art")


def export_collision(scene: tristram.Scene,
                     catalogue: dict[tuple[int, int, int], tristram.Tile],
                     palette: list[tuple[int, int, int, int]],
                     block_full_cells: bool) -> Image.Image:
    left, top, width, height = crop_origin(scene)
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    solid = Image.new("L", (TILE_WIDTH, TILE_HEIGHT), 255)
    stamps: dict[tuple[int, int, int], tuple[Image.Image, float]] = {}
    origin_x = scene.height * TILE_WIDTH // 2
    origin_y = 512

    # The walls of a roofed hut.  Its doorway is painted as a gap in that wall
    # art, so those cells are stamped by their art instead of as whole cells:
    # the hero walks in through the door the picture shows.  Every wall the
    # roof does not belong to stays cell-sized, which is what keeps the seams
    # between street walls tight.
    roof_cells = set()
    for layer in scene.layers:
        if layer.kind != "wall" or not layer.orientations:
            continue
        for index, cell in enumerate(layer.cells):
            if cell and not cell & 0x80000000 and cell & 0xFF \
                    and (layer.orientations[index] & 0xFF) == 15:
                roof_cells.add(index)
    carries_roof: dict[int, bool] = {}

    def hut_wall(index: int) -> bool:
        if index not in carries_roof:
            row, column = divmod(index, scene.width)
            carries_roof[index] = any(
                nr * scene.width + nc in roof_cells
                for nr in range(max(0, row - 1), min(scene.height, row + 2))
                for nc in range(max(0, column - 1), min(scene.width, column + 2))
            )
        return carries_roof[index]
    for layer in scene.layers:
        if layer.kind != "wall" or not layer.orientations:
            continue
        for index, cell in enumerate(layer.cells):
            if cell & 0x80000000 or cell & 0xFF == 0:
                continue
            orientation = layer.orientations[index] & 0xFF
            # A roof hangs over the floor and a lower wall is drawn beneath it;
            # neither stands on the ground the hero walks on.
            if orientation >= 16 or orientation == 15:
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
            # A wall that fills its cell blocks the cell.  Anything thinner -
            # a railing, an arch top, a rubble pile - blocks only the body it
            # paints, so open floor beside it stays walkable.  A hut wall is the
            # same rule even in a town, because its door is a gap in the art.
            if hut_wall(index) and stamp[1] < CELL_SOLID_SHARE:
                mask.paste(solid, (tile_x, tile_y), stamp[0])
            elif block_full_cells or stamp[1] >= CELL_SOLID_SHARE:
                draw_diamond(draw, tile_x, tile_y)
            else:
                mask.paste(solid, (tile_x, tile_y), stamp[0])
    # A cell with no floor is not floor: the black rock a preset keeps outside its
    # rooms must be solid, or the hero (and every monster) can walk out of the
    # level and stand in the void.
    return ImageChops.lighter(mask, floor_void_mask(scene))


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
    # Walls first: a footprint area's mask is stamped out of the very atlas and
    # placements the client draws, so it cannot drift from the picture.
    walls, layout = export_walls(scene, catalogue, palette, (0, 0))
    if spec.wall_footprint:
        art = wall_footprint_collision(scene, catalogue, palette)
        collision = ImageChops.lighter(art, floor_void_mask(scene))
        audit_floor_collision(art, collision, scene)
    else:
        collision = export_collision(
            scene, catalogue, palette,
            block_full_cells=not is_open_ground(spec),
        )
    if spec.water is not None:
        collision = ImageChops.lighter(collision, water_collision(ground, spec.water))
    collision.save(ASSET_ROOT / f"{spec.slug}-walls-collision.png", optimize=True)
    # The mask is what the hero actually feels, so it decides where they start:
    # the open floor the mask leaves rather than a doorway gap.
    layout["spawn"] = spawn_point(scene, spawn_anchor(scene, collision))
    walls.save(ASSET_ROOT / f"{spec.slug}-walls.png", optimize=True)
    with (ASSET_ROOT / f"{spec.slug}-walls.json").open("w", encoding="utf-8") as handle:
        json.dump(layout, handle, separators=(",", ":"))
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
    everything = [spec for act, act_specs in sorted(WORLDS.items()) for spec in act_specs]
    if len(specs) == len(everything):
        write_manifest(entries)
    else:
        # A filtered run only knows the areas it built, so rewriting the manifest
        # from it would delete every other world from the generated table.
        print("manifest unchanged (filtered run; build every area to rewrite it)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
