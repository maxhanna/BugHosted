"""Build Act V's per-area floor atlases from the D2R expansion DT1 sets.

The campaign draws a 4x4 atlas of 160x80 isometric floor tiles per area. Act V
used one dark, sixteen-cell atlas for Bloody Foothills, Crystalline Passage and
the Throne of Destruction, and the runner only sampled its first cell, so the
whole act looked like one repeating patch of rock.

The D2R extraction names the real Act V tile sets under
``data/global/tiles/expansion``. Each DT1 is a catalogue of orientation-0 floor
tiles made of twenty-five 32x15 isometric blocks. This script decodes those
blocks with the Act V palette, keeps only complete undecorated floors, and
fills one atlas per area from the sets that belong to it:

* Bloody Foothills: sieged ground, snow and the rocky cliff floor,
* Crystalline Passage: the ice cave's interior and exterior floors,
* Throne of Destruction: the Worldstone lair floors with a few throne and
  underfloor accents.

Selection is deterministic: candidates are ranked by a hash of the area seed
and their pixels, so rerunning the tool produces the same atlases.

Usage:
    python tools/import_d2r_act5_tiles.py
    python tools/import_d2r_act5_tiles.py --only a5-crystalline-passage
"""

from __future__ import annotations

import argparse
import hashlib
import struct
import sys
from pathlib import Path

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "maps" / "tiles"
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"

TILE_WIDTH = 160
TILE_HEIGHT = 80
ATLAS_COLUMNS = 4
ATLAS_CELLS = ATLAS_COLUMNS * ATLAS_COLUMNS

# A DT1 orientation-0 floor is a 160x128 canvas whose 25 isometric blocks fill
# the top 160x80 diamond; the extra canvas rows stay transparent.
FLOOR_CROP_TOP = 0
FLOOR_ROW_WIDTHS = (4, 8, 12, 16, 20, 24, 28, 32, 28, 24, 20, 16, 12, 8, 4)

# key -> (seed, [(DT1 path under expansion/, tile quota)])
AREAS: dict[str, tuple[str, list[tuple[str, int]]]] = {
    "a5-bloody-foothills": (
        "bloody-foothills",
        [
            ("siege/snow.dt1", 9),
            ("siege/ground.dt1", 4),
            ("siege/rockclifffloor.dt1", 3),
        ],
    ),
    "a5-crystalline-passage": (
        "crystalline-passage",
        [
            ("icecave/interior.dt1", 12),
            ("icecave/exterior.dt1", 4),
        ],
    ),
    "a5-throne-of-destruction": (
        "throne-of-destruction",
        [
            ("baallair/floor.dt1", 14),
            ("baallair/underflr.dt1", 1),
            ("baallair/worldstone.dt1", 1),
        ],
    ),
}


def load_palette(path: Path) -> list[tuple[int, int, int, int]]:
    """Read an Act palette; pal.dat stores BGR triples, index 0 is transparent."""
    data = path.read_bytes()
    if len(data) != 768:
        raise ValueError(f"{path} is not a 256-colour pal.dat")
    return [(data[index + 2], data[index + 1], data[index], 255) for index in range(0, 768, 3)]


def decode_block(data: bytes, offset: int, fmt: int, length: int,
                 palette: list[tuple[int, int, int, int]]) -> Image.Image:
    """Decode one 32-pixel-wide DT1 block."""
    block = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    pixels = block.load()
    if fmt == 0x0001:
        if length != 256:
            raise ValueError(f"isometric block has {length} bytes, expected 256")
        cursor = offset
        for row, width in enumerate(FLOOR_ROW_WIDTHS):
            left = (32 - width) // 2
            for column in range(width):
                index = data[cursor]
                cursor += 1
                if index:
                    pixels[left + column, row] = palette[index]
        return block

    # 0x1001 is a 32-row wall block; 0x2005 is a 15-row decorative floor block.
    rows = 32 if fmt == 0x1001 else 15
    cursor = offset
    end = offset + length
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
    return block


def read_dt1(path: Path) -> list[dict]:
    data = path.read_bytes()
    major, minor = struct.unpack_from("<ii", data, 0)
    if (major, minor) != (7, 6):
        raise ValueError(f"{path.name} is version {major}.{minor}, expected 7.6")
    tile_count, tile_pointer = struct.unpack_from("<ii", data, 268)
    tiles = []
    for index in range(tile_count):
        record = tile_pointer + index * 96
        _, _, _, _, height, width = struct.unpack_from("<ihBBii", data, record)
        orientation, main_index, sub_index, rarity = struct.unpack_from("<iiii", data, record + 0x14)
        block_pointer, block_length, block_count = struct.unpack_from("<iii", data, record + 0x48)
        blocks = []
        for block_index in range(block_count):
            x, y, grid_x, grid_y, fmt, length, data_offset = struct.unpack_from(
                "<hh2xBBHi2xi", data, block_pointer + block_index * 20)
            blocks.append({
                "x": x, "y": y, "grid_x": grid_x, "grid_y": grid_y,
                "format": fmt, "length": length,
                "offset": block_pointer + data_offset,
            })
        tiles.append({
            "width": width, "height": height, "orientation": orientation,
            "key": (orientation, main_index, sub_index, rarity),
            "blocks": blocks, "block_length": block_length, "data": data,
        })
    return tiles


def render_tile(tile: dict, palette: list[tuple[int, int, int, int]]) -> Image.Image:
    canvas = Image.new("RGBA", (tile["width"], max(1, abs(tile["height"]))), (0, 0, 0, 0))
    for block in tile["blocks"]:
        image = decode_block(tile["data"], block["offset"], block["format"],
                             block["length"], palette)
        canvas.alpha_composite(image, (block["x"], block["y"]))
    return canvas


def is_clean_floor(tile: dict) -> bool:
    """True for a complete undecorated orientation-0 floor diamond."""
    return (tile["orientation"] == 0
            and tile["width"] == TILE_WIDTH
            and abs(tile["height"]) == 128
            and len(tile["blocks"]) == 25
            and all(block["format"] == 0x0001 for block in tile["blocks"]))


def floor_candidates(path: Path, palette: list[tuple[int, int, int, int]]) -> list[dict]:
    """Return distinct, reasonably detailed floor diamonds from one DT1."""
    candidates = []
    seen = set()
    for tile in read_dt1(path):
        if not is_clean_floor(tile):
            continue
        image = render_tile(tile, palette).crop(
            (0, FLOOR_CROP_TOP, TILE_WIDTH, FLOOR_CROP_TOP + TILE_HEIGHT))
        if image.getchannel("A").getbbox() is None:
            continue
        pixels = image.tobytes()
        digest = hashlib.sha256(pixels).hexdigest()
        if digest in seen:
            continue
        seen.add(digest)

        values = [red + green + blue for red, green, blue, alpha in image.getdata() if alpha]
        if not values:
            continue
        mean = sum(values) / (3 * len(values))
        variance = sum((value / 3 - mean) ** 2 for value in values) / len(values)
        deviation = variance ** 0.5
        coverage = len(values) / (TILE_WIDTH * TILE_HEIGHT)
        # Reject blank matte, blown-out snow/ice, and flat colour fields that
        # would only repeat the old plain-rock look.
        if not 0.42 <= coverage <= 0.62 or not 24 <= mean <= 224 or deviation < 6:
            continue
        candidates.append({"image": image, "hash": digest, "deviation": deviation})
    return candidates


def rank(seed: str, value: str) -> int:
    digest = hashlib.sha256(f"{seed}:{value}".encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "little")


def build_atlas(key: str, source: Path, palette: list[tuple[int, int, int, int]]) -> Image.Image:
    seed, sources = AREAS[key]
    pools: list[tuple[str, int, list[dict]]] = []
    for relative, quota in sources:
        candidates = floor_candidates(source / "global" / "tiles" / "expansion" / relative, palette)
        # Prefer tactile floors, then shuffle the richer pool deterministically.
        candidates.sort(key=lambda candidate: candidate["deviation"], reverse=True)
        pool = candidates[:max(quota * 3, quota)]
        pool.sort(key=lambda candidate: rank(f"{seed}:{relative}", candidate["hash"]))
        pools.append((relative, quota, pool))

    chosen: list[dict] = []
    used: set[str] = set()
    for relative, quota, pool in pools:
        picked = 0
        for candidate in pool:
            if candidate["hash"] in used:
                continue
            candidate["source"] = relative
            chosen.append(candidate)
            used.add(candidate["hash"])
            picked += 1
            if picked == quota:
                break

    if len(chosen) < ATLAS_CELLS:
        # A set can run short after filtering; top up from every source.
        for relative, _, pool in pools:
            for candidate in pool:
                if len(chosen) == ATLAS_CELLS:
                    break
                if candidate["hash"] in used:
                    continue
                candidate["source"] = relative
                chosen.append(candidate)
                used.add(candidate["hash"])
    if len(chosen) < ATLAS_CELLS:
        raise SystemExit(f"{key}: only {len(chosen)} usable floor tiles")

    chosen = chosen[:ATLAS_CELLS]
    # The first cell doubles as the area's base/transition tile. Keep it in the
    # area's primary set so a red Worldstone accent or an ice arch can never
    # become the common ground, and pick the calmest floor from that set.
    primary = sources[0][0]
    primary_candidates = [candidate for candidate in chosen if candidate.get("source") == primary]
    base = min(primary_candidates or chosen, key=lambda candidate: candidate["deviation"])
    rest = [candidate for candidate in chosen if candidate is not base]
    rest.sort(key=lambda candidate: rank(f"{seed}:order", candidate["hash"]))
    ordered = [base] + rest
    atlas = Image.new("RGBA", (TILE_WIDTH * ATLAS_COLUMNS, TILE_HEIGHT * ATLAS_COLUMNS),
                      (0, 0, 0, 0))
    for index, candidate in enumerate(ordered):
        atlas.alpha_composite(candidate["image"],
                              ((index % ATLAS_COLUMNS) * TILE_WIDTH,
                               (index // ATLAS_COLUMNS) * TILE_HEIGHT))
    return atlas


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--only", choices=sorted(AREAS), default=None)
    args = parser.parse_args(argv)

    if not args.source.is_dir():
        raise SystemExit(f"D2R extraction not found: {args.source}")
    palette = load_palette(args.source / "global" / "palette" / "act5" / "pal.dat")
    ASSET_ROOT.mkdir(parents=True, exist_ok=True)
    wanted = [args.only] if args.only else sorted(AREAS)
    for key in wanted:
        atlas = build_atlas(key, args.source, palette)
        destination = ASSET_ROOT / f"{key}-floor-tiles.png"
        atlas.save(destination, optimize=True)
        sources = ", ".join(f"{name} x{quota}" for name, quota in AREAS[key][1])
        print(f"{key:30s} {atlas.width}x{atlas.height} <- {sources}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
