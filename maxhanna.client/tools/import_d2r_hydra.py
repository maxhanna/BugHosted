"""Bake the original Diablo II Hydra animation into a summon atlas.

The sorceress's Hydra is monster code `HX` (`monstasts.txt`: hydra1). Its
`tr` body and `s1` fire overlay live in
`global/monsters/HX/{tr,s1}/*.dcc`; the COFs name both layers. The neutral
(`hxnuhth.cof`) and attack (`hxa1hth.cof`) clips are twelve frames in each of
the eight facings, which matches the runtime's two-band summon atlas layout:

* rows 0-7  - neutral loop, one row per facing
* rows 8-15 - attack clip, one row per facing

Every layer is composited with the DCC direction offsets, and the additive
`s1` fire is keyed from luminance so it does not paint an opaque black box over
the heads. `units/pal.dat` is BGR, so it is converted before painting.

Usage:
    python tools/import_d2r_hydra.py
    python tools/import_d2r_hydra.py --source "C:/path/to/d2r extract/data"
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image

import d2r_dcc as dcc

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "enemies" / "animated"
METADATA = PROJECT_ROOT / "src" / "app" / "d2survivors" / "d2-hydra.generated.ts"
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"

# A Hydra cast is three independent heads, so the three original monster
# variants are baked as separate atlases.
MONSTER_CODES = ("HX", "HY", "HZ")
PALETTE_PATH = ("global", "palette", "units", "pal.dat")
COMPOSIT_ROWS = ("hd", "tr", "lg", "ra", "la", "rh", "lh", "sh",
                 "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8")
# The fire overlay is drawn additively in D2, so its black matte becomes alpha.
ADDITIVE_LAYERS = frozenset({8})
COLUMNS = 12
FRAME_RATE = 15


def parse_cof(path: Path) -> dict:
    data = path.read_bytes()
    if len(data) < 28:
        raise RuntimeError(f"{path} is too short for a COF")
    layers, frames, directions = data[0], data[1], data[2]
    records = []
    for index in range(layers):
        start = 28 + index * 9
        records.append((data[start], data[start + 5:start + 8].decode("ascii", "replace")))
    order_length = directions * frames * layers
    order_start = len(data) - order_length
    return {
        "layers": records,
        "frames": frames,
        "directions": directions,
        "order": list(data[order_start:]),
    }


def find_layer(monster_dir: Path, code: str, component: int, mode: str, wclass: str) -> dict:
    layer = COMPOSIT_ROWS[component]
    prefix = f"{code.lower()}{layer.lower()}"
    suffix = f"{wclass.lower()}.dcc"
    candidates = []
    for path in sorted((monster_dir / layer).glob("*.dcc")):
        name = path.name.lower()
        if not name.startswith(prefix) or mode not in name or not name.endswith(suffix):
            continue
        candidates.append((0 if "lit" in name else 1, name, path))
    if not candidates:
        raise RuntimeError(f"missing {layer}/{prefix}*{mode}*{suffix}")
    path = sorted(candidates)[0][2]
    return {"path": path, "animation": dcc.parse(path.read_bytes())}


def load_clip(monster_dir: Path, code: str, cof_name: str, mode: str) -> dict:
    cof = parse_cof(monster_dir / "cof" / cof_name)
    layers = {
        component: find_layer(monster_dir, code, component, mode, wclass)
        for component, wclass in cof["layers"]
    }
    frames = min([cof["frames"]] + [layer["animation"]["frames_per_dir"] for layer in layers.values()])
    directions = min([cof["directions"]] + [layer["animation"]["directions"] for layer in layers.values()])
    return {"cof": cof, "layers": layers, "frames": frames, "directions": directions}


def key_additive_glow(image: Image.Image) -> Image.Image:
    result = image.copy()
    pixels = result.load()
    for y in range(result.height):
        for x in range(result.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                continue
            high = max(red, green, blue)
            pixels[x, y] = (0, 0, 0, 0) if high == 0 else (red, green, blue, high)
    return result


def layer_box(clip: dict, direction: int) -> tuple[int, int, int, int] | None:
    boxes = []
    for entry in clip["layers"].values():
        animation = entry["animation"]
        if direction < animation["directions"]:
            boxes.append(animation["dirs"][direction]["box"])
    if not boxes:
        return None
    xmin = min(box[0] for box in boxes)
    ymin = min(box[1] for box in boxes)
    xmax = max(box[0] + box[2] for box in boxes)
    ymax = max(box[1] + box[3] for box in boxes)
    return xmin, ymin, xmax - xmin, ymax - ymin


def composite_frame(clip: dict, palette: list[tuple[int, int, int]], direction: int,
                    frame_index: int, origin: tuple[int, int]) -> Image.Image:
    cof = clip["cof"]
    layer_count = len(cof["layers"])
    order_start = (direction * cof["frames"] + frame_index) * layer_count
    order = cof["order"][order_start:order_start + layer_count]
    rows = []
    for component in order:
        entry = clip["layers"].get(component)
        if entry is None:
            continue
        animation = entry["animation"]
        if direction >= animation["directions"]:
            continue
        rows.append((component, entry, animation))
    xmin = min(row[2]["dirs"][direction]["box"][0] for row in rows)
    ymin = min(row[2]["dirs"][direction]["box"][1] for row in rows)
    xmax = max(row[2]["dirs"][direction]["box"][0] + row[2]["dirs"][direction]["box"][2] for row in rows)
    ymax = max(row[2]["dirs"][direction]["box"][1] + row[2]["dirs"][direction]["box"][3] for row in rows)
    canvas = Image.new("RGBA", (xmax - xmin, ymax - ymin), (0, 0, 0, 0))
    for component, entry, animation in rows:
        direction_animation = animation["dirs"][direction]
        box = direction_animation["box"]
        index = min(frame_index, animation["frames_per_dir"] - 1)
        frame = direction_animation["frames"][index]
        cel = dcc.frame_image(direction_animation["bitmaps"][index], frame["width"], frame["height"], palette)
        if component in ADDITIVE_LAYERS:
            cel = key_additive_glow(cel)
        canvas.alpha_composite(cel, (box[0] - xmin, box[1] - ymin))

    cell = Image.new("RGBA", (origin[2], origin[3]), (0, 0, 0, 0))
    cell.alpha_composite(canvas, (xmin - origin[0], ymin - origin[1]))
    return cell


def build_sheet(source: Path, code: str) -> tuple[Image.Image, int, int, int, int]:
    monster_dir = source / "global" / "monsters" / code
    prefix = code.lower()
    palette = [(red, green, blue) for blue, green, red in dcc.load_palette(source.joinpath(*PALETTE_PATH))]
    clips = [
        load_clip(monster_dir, code, f"{prefix}nuhth.cof", "nu"),
        load_clip(monster_dir, code, f"{prefix}a1hth.cof", "a1"),
    ]
    boxes = []
    for clip in clips:
        for direction in range(8):
            box = layer_box(clip, direction)
            if box:
                boxes.append(box)
    xmin = min(box[0] for box in boxes)
    ymin = min(box[1] for box in boxes)
    xmax = max(box[0] + box[2] for box in boxes)
    ymax = max(box[1] + box[3] for box in boxes)
    origin = (xmin, ymin, xmax - xmin, ymax - ymin)
    rows = 16
    sheet = Image.new("RGBA", (COLUMNS * origin[2], rows * origin[3]), (0, 0, 0, 0))
    for band, clip in enumerate(clips):
        for direction in range(clip["directions"]):
            for frame_index in range(clip["frames"]):
                frame = composite_frame(clip, palette, direction, frame_index, origin)
                sheet.alpha_composite(frame, (frame_index * origin[2], (band * 8 + direction) * origin[3]))
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    sheet.save(OUTPUT_DIR / f"hydra-{MONSTER_CODES.index(code) + 1}.png", "PNG", optimize=True)
    sheet.crop((0, 0, COLUMNS * origin[2], 2 * origin[3])).save(PROJECT_ROOT / "tools" / f".hydra-preview-{code}.png", "PNG")
    return sheet, COLUMNS, rows, origin[2], origin[3]


def write_metadata(records: list[dict]) -> None:
    lines = [
        "/* Generated by tools/import_d2r_hydra.py. Do not edit by hand. */",
        "",
        "export interface HydraArt {",
        "  path: string;",
        "  columns: number;",
        "  rows: number;",
        "  cellWidth: number;",
        "  cellHeight: number;",
        "  frameRate: number;",
        "}",
        "",
        "export const HYDRA_ART: Record<\"hydra1\" | \"hydra2\" | \"hydra3\", HydraArt> = {",
    ]
    for record in records:
        lines.append(
            f"  {json.dumps(record['species'])}: {{ path: {json.dumps(record['path'])}, "
            f"columns: {record['columns']}, rows: {record['rows']}, "
            f"cellWidth: {record['cell_width']}, cellHeight: {record['cell_height']}, "
            f"frameRate: {FRAME_RATE} }},"
        )
    lines.extend(["};", ""])
    METADATA.write_text("\n".join(lines), encoding="utf-8")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    args = parser.parse_args(argv)

    records = []
    for index, code in enumerate(MONSTER_CODES):
        sheet, columns, rows, cell_width, cell_height = build_sheet(args.source, code)
        species = f"hydra{index + 1}"
        records.append({
            "species": species,
            "path": f"assets/d2survivors/enemies/animated/hydra-{index + 1}.png",
            "columns": columns,
            "rows": rows,
            "cell_width": cell_width,
            "cell_height": cell_height,
        })
        print(f"{species}  {columns}x{rows} frames  {sheet.width}x{sheet.height}  cell {cell_width}x{cell_height}")
        print(f"wrote src/assets/d2survivors/enemies/animated/hydra-{index + 1}.png")
    write_metadata(records)
    print(f"wrote {METADATA.relative_to(PROJECT_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
