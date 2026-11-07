"""Build the paladin aura sheets from the D2R overlay extraction.

Every paladin aura in the game is drawn from the legacy overlay DCCs under
``data/global/overlays``. Most auras are split into a back and a front layer so
the character can stand inside the effect; Fanaticism, Conviction, Holy Freeze,
Meditation, Redemption and the three single-element resist auras ship as one
combined overlay.

Each output sheet uses one 128px cell per frame. The source DCCs are composited
at their unit-space offsets with the character's feet at (64, 80), then scaled
to 0.8 so a 30-frame animation stays under the common 4096px texture limit. The
runtime multiplies the cell by 1.25 again, preserving the original on-screen
scale.

Usage:
    python tools/import_d2r_paladin_auras.py
    python tools/import_d2r_paladin_auras.py --source "C:/path/to/d2r extract/data"
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image

import d2r_dcc as dcc

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "auras" / "paladin"
METADATA = PROJECT_ROOT / "src" / "app" / "d2survivors" / "d2-paladin-auras.generated.ts"
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"

# The source overlays are authored around the character's feet. Keep enough
# room for the widest/tallest frame (Concentration at x=61 and Fanaticism at
# y=-90) and then downscale the whole cell uniformly.
SOURCE_CELL = 160
SOURCE_ORIGIN = (80, 100)
OUTPUT_CELL = 128
DRAW_SCALE = SOURCE_CELL / OUTPUT_CELL

# skill, output slug, overlay animation rate (frames/sec), layers.
# A layer is (DCC stem, "back" | "front"), in draw order.
AURAS = (
    ("Might", "might", 16, (("auramightback", "back"), ("auramightfront", "front"))),
    ("Holy Fire", "holy-fire", 16, (("auraholyfireback", "back"), ("auraholyfirefront", "front"))),
    ("Holy Freeze", "holy-freeze", 8, (("holyfreeze", "back"),)),
    ("Holy Shock", "holy-shock", 16, (("holyshock_back", "back"), ("holyshock_front", "front"))),
    ("Concentration", "concentration", 3, (("concentration_back", "back"), ("concentration_front", "front"))),
    ("Fanaticism", "fanaticism", 16, (("aurafanatic", "back"),)),
    ("Conviction", "conviction", 6, (("conviction", "back"),)),
    ("Thorns", "thorns", 16, (("aurathornsback", "back"), ("aurathornsfront", "front"))),
    ("Blessed Aim", "blessed-aim", 8, (("blessedaim_back", "back"), ("blessedaim_front", "front"))),
    ("Vigor", "vigor", 8, (("stamina_back", "back"), ("stamina_front", "front"))),
    ("Defiance", "defiance", 8, (("auradefianceback", "back"), ("auradefiancefront", "front"))),
    ("Prayer", "prayer", 8, (("auraprayerback", "back"), ("auraprayerfront", "front"))),
    ("Resist Fire", "resist-fire", 16, (("auraresistfirefront", "front"),)),
    ("Resist Cold", "resist-cold", 16, (("auraresistcoldback", "back"),)),
    ("Resist Lightning", "resist-lightning", 16, (("auraresistlightningback", "back"),)),
    ("Salvation", "salvation", 16, (("auraresistallback", "back"), ("auraresistallfront", "front"))),
    ("Cleansing", "cleansing", 8, (("cleansing_back", "back"), ("cleansing_front", "front"))),
    ("Meditation", "meditation", 16, (("meditation", "front"),)),
    ("Redemption", "redemption", 16, (("redemption", "back"),)),
    ("Sanctuary", "sanctuary", 16, (("sanctuaryaura_back", "back"), ("sanctuaryaura_front", "front"))),
)


def build_sheet(source: Path, palette: list[tuple[int, int, int]], layers: tuple[tuple[str, str], ...], slug: str) -> tuple[Image.Image, int]:
    parsed: list[tuple[dict, int]] = []
    for stem, _half in layers:
        path = source / "global" / "overlays" / f"{stem}.dcc"
        if not path.exists():
            raise FileNotFoundError(f"missing aura overlay: {path}")
        animation = dcc.parse(path.read_bytes())
        direction = animation["dirs"][0]
        parsed.append((direction, len(direction["frames"])))

    frame_counts = {count for _, count in parsed}
    if len(frame_counts) != 1:
        raise ValueError(f"{slug}: layers have mismatched frame counts: {sorted(frame_counts)}")
    columns = frame_counts.pop()
    sheet = Image.new("RGBA", (columns * OUTPUT_CELL, len(layers) * OUTPUT_CELL), (0, 0, 0, 0))

    for row, (direction, _count) in enumerate(parsed):
        for index, (frame, bitmap) in enumerate(zip(direction["frames"], direction["bitmaps"])):
            tile = Image.new("RGBA", (SOURCE_CELL, SOURCE_CELL), (0, 0, 0, 0))
            tile.alpha_composite(
                dcc.frame_image(bitmap, frame["width"], frame["height"], palette),
                (SOURCE_ORIGIN[0] + frame["xmin"], SOURCE_ORIGIN[1] + frame["ymin"]),
            )
            left = SOURCE_ORIGIN[0] + frame["xmin"]
            top = SOURCE_ORIGIN[1] + frame["ymin"]
            if left < 0 or top < 0 or left + frame["width"] > SOURCE_CELL or top + frame["height"] > SOURCE_CELL:
                raise ValueError(f"{slug}: frame {index} falls outside the {SOURCE_CELL}px source cell")
            tile = tile.resize((OUTPUT_CELL, OUTPUT_CELL), Image.Resampling.LANCZOS)
            sheet.alpha_composite(tile, (index * OUTPUT_CELL, row * OUTPUT_CELL))

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    sheet.save(OUTPUT_DIR / f"{slug}.png", optimize=True)
    return sheet, columns


def write_metadata(records: list[dict]) -> None:
    lines = [
        "/* Generated by tools/import_d2r_paladin_auras.py. Do not edit by hand. */",
        "",
        "export interface PaladinAuraArt {",
        "  path: string;",
        "  columns: number;",
        "  rows: number;",
        "  frameRate: number;",
        "  cell: number;",
        "  originX: number;",
        "  originY: number;",
        "  scale: number;",
        "  backRow: number | null;",
        "  frontRow: number | null;",
        "}",
        "",
        "export const PALADIN_AURA_ART: Record<string, PaladinAuraArt> = {",
    ]
    for record in sorted(records, key=lambda entry: entry["skill"]):
        lines.append(
            "  "
            + json.dumps(record["skill"])
            + ": { path: "
            + json.dumps(record["path"])
            + f", columns: {record['columns']}, rows: {record['rows']}, frameRate: {record['frameRate']}"
            + f", cell: {OUTPUT_CELL}, originX: {round(SOURCE_ORIGIN[0] * OUTPUT_CELL / SOURCE_CELL)}"
            + f", originY: {round(SOURCE_ORIGIN[1] * OUTPUT_CELL / SOURCE_CELL)}, scale: {DRAW_SCALE:.2f}"
            + f", backRow: {record['backRow'] if record['backRow'] is not None else 'null'}"
            + f", frontRow: {record['frontRow'] if record['frontRow'] is not None else 'null'} }},",
        )
    lines.append("};")
    lines.append("")
    METADATA.parent.mkdir(parents=True, exist_ok=True)
    METADATA.write_text("\n".join(lines), encoding="utf-8")


def build(source: Path) -> None:
    palette = dcc.load_palette(source / "global" / "palette" / "units" / "pal.dat")
    records = []
    for skill, slug, frame_rate, layers in AURAS:
        sheet, columns = build_sheet(source, palette, layers, slug)
        back_row = next((index for index, (_stem, half) in enumerate(layers) if half == "back"), None)
        front_row = next((index for index, (_stem, half) in enumerate(layers) if half == "front"), None)
        records.append({
            "skill": skill,
            "path": f"assets/d2survivors/auras/paladin/{slug}.png",
            "columns": columns,
            "rows": len(layers),
            "frameRate": frame_rate,
            "backRow": back_row,
            "frontRow": front_row,
        })
        print(f"{slug:16} {sheet.width:4}x{sheet.height:<4} {columns:2} frames x {len(layers)} layer(s)")
    write_metadata(records)
    print(f"wrote {METADATA.relative_to(PROJECT_ROOT)}")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    args = parser.parse_args(argv)
    if not (args.source / "global" / "overlays").is_dir():
        print(f"missing overlay extraction: {args.source / 'global' / 'overlays'}")
        return 1
    build(args.source)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
