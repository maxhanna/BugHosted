"""Build the barbarian warcry ring sheets from the D2R overlay extraction.

Every warcry in Diablo II paints an animated overlay around the barbarian. The
legacy DCCs under ``global/overlays`` hold those frames:

* Shout, Battle Orders and Battle Command all send out a flame ring; the game
  authors one ring per warcry (Shout's own art, Battle Orders' and Battle
  Command's), which is why each skill gets its own sheet.
* Howl and Taunt have no ring of their own in the game files. They reuse the
  Shout ring, graded cold for Howl's fear and red for Taunt's anger.
* Battle Cry and War Cry ship head-height bursts. Both are re-anchored to the
  barbarian's feet so the effect still reads as a ring coming off the hero.

Shout's source art carries the same flame as the ring in the reference
screenshot, but its palette lands on a deep red. It is graded toward the warm
gold the game's screenshot shows so the ring reads as Shout, not a fire spell.

Run with:
    python tools/import_d2r_barbarian_auras.py
    python tools/import_d2r_barbarian_auras.py --source "C:/path/to/d2r extract/data"
"""

from __future__ import annotations

import argparse
import colorsys
import json
import sys
from pathlib import Path

from PIL import Image

import d2r_dcc as dcc

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "auras" / "barbarian"
METADATA = PROJECT_ROOT / "src" / "app" / "d2survivors" / "d2-barbarian-auras.generated.ts"
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"

# The widest ring (War Cry's shockwave) plus room for the tallest burst keeps
# every frame inside one cell; the sheet is drawn back at 1.25x by the runtime.
SOURCE_CELL = 160
SOURCE_ORIGIN = (80, 100)
OUTPUT_CELL = 128
# The sheet is drawn a little wider than its cell: the ring in the reference
# screenshot spreads well past the hero instead of hugging their feet.
DRAW_SCALE = 1.75
# Bump when the generated sheets change so cached art is refetched.
ASSET_VERSION = 1

# skill, output slug, overlay stem, animation rate, tint, anchor shift (unit px)
AURAS = (
    ("Shout", "shout", "shout", 8, "gold", 0),
    ("Howl", "howl", "shout", 8, "cold", 0),
    ("Taunt", "taunt", "shout", 16, "crimson", 0),
    ("Battle Cry", "battle-cry", "battlecry", 8, "blood", 92),
    ("Battle Orders", "battle-orders", "battleorders", 8, None, 0),
    ("Battle Command", "battle-command", "battlecommand", 8, None, 0),
    ("War Cry", "war-cry", "warcryhit", 16, None, 68),
)


# Combat skills paint themselves on the barbarian: Frenzy's trail, the Berserk
# haze and the Whirlwind spin. Each is an overlay with one direction.
COMBAT_EFFECTS = (
    ("Frenzy", "frenzy", "frenzy", 16, 0),
    ("Berserk", "berserk", "berserkoverlay", 16, 8),
    ("Whirlwind", "whirlwind-spin", "bawhirlwind01", 12, 0),
)

# Grim Ward is a missile in the game files rather than an overlay: three static
# totems, one per rank tier, drawn on the floor where the corpse was spent.
COMBAT_FRAMES: dict[str, int] = {}

GRIM_WARD_SIZES = (
    ("grimwardsmall", "small"),
    ("grimwardmedium", "medium"),
    ("grimwardlarge", "large"),
)
def build_grim_ward(source: Path, palette: list[tuple[int, int, int]]) -> Image.Image:
    """One sheet, one column per totem size, all sharing the floor anchor."""
    sheet = Image.new("RGBA", (len(GRIM_WARD_SIZES) * OUTPUT_CELL, OUTPUT_CELL), (0, 0, 0, 0))
    for index, (stem, _label) in enumerate(GRIM_WARD_SIZES):
        path = source / "global" / "missiles" / f"{stem}.dcc"
        if not path.exists():
            raise FileNotFoundError(f"missing grim ward art: {path}")
        animation = dcc.parse(path.read_bytes())
        direction = animation["dirs"][0]
        frame = direction["frames"][0]
        tile = Image.new("RGBA", (SOURCE_CELL, SOURCE_CELL), (0, 0, 0, 0))
        left = SOURCE_ORIGIN[0] + frame["xmin"]
        top = SOURCE_ORIGIN[1] + frame["ymin"]
        cell = dcc.frame_image(direction["bitmaps"][0], frame["width"], frame["height"], palette)
        tile.alpha_composite(cell, (left, top))
        sheet.alpha_composite(tile.resize((OUTPUT_CELL, OUTPUT_CELL), Image.Resampling.LANCZOS),
                              (index * OUTPUT_CELL, 0))
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    sheet.save(OUTPUT_DIR / "grim-ward.png", optimize=True)
    return sheet


def grade(image: Image.Image, tint: str | None) -> Image.Image:
    """Recolour one frame while keeping its alpha, like the armor aura importer."""
    if not tint:
        return image
    hue_target, saturation, value = {
        "gold": (0.115, 0.72, 1.55),
        "cold": (0.58, 0.55, 1.45),
        "crimson": (0.985, 0.85, 1.45),
        "blood": (0.995, 0.95, 1.35),
    }[tint]
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                continue
            hue, sat, val = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
            # Keep the flame's own shading; only pull its hue to the target and
            # lift it so the ring reads at the scale the hero is drawn.
            hue = hue_target
            sat = min(1.0, sat * saturation)
            val = min(1.0, val * value + 0.08)
            out = colorsys.hsv_to_rgb(hue, sat, val)
            pixels[x, y] = (round(out[0] * 255), round(out[1] * 255), round(out[2] * 255), alpha)
    return image


def build_sheet(source: Path, palette: list[tuple[int, int, int]], stem: str,
                slug: str, tint: str | None, shift: int) -> tuple[Image.Image, int]:
    path = source / "global" / "overlays" / f"{stem}.dcc"
    if not path.exists():
        raise FileNotFoundError(f"missing warcry overlay: {path}")
    animation = dcc.parse(path.read_bytes())
    direction = animation["dirs"][0]
    frames = direction["frames"]
    columns = len(frames)
    sheet = Image.new("RGBA", (columns * OUTPUT_CELL, OUTPUT_CELL), (0, 0, 0, 0))

    for index, (frame, bitmap) in enumerate(zip(frames, direction["bitmaps"])):
        tile = Image.new("RGBA", (SOURCE_CELL, SOURCE_CELL), (0, 0, 0, 0))
        left = SOURCE_ORIGIN[0] + frame["xmin"]
        top = SOURCE_ORIGIN[1] + frame["ymin"] + shift
        cell = grade(dcc.frame_image(bitmap, frame["width"], frame["height"], palette), tint)
        if left < 0 or top < 0 or left + frame["width"] > SOURCE_CELL or top + frame["height"] > SOURCE_CELL:
            raise ValueError(f"{slug}: frame {index} falls outside the {SOURCE_CELL}px source cell")
        tile.alpha_composite(cell, (left, top))
        sheet.alpha_composite(tile.resize((OUTPUT_CELL, OUTPUT_CELL), Image.Resampling.LANCZOS),
                              (index * OUTPUT_CELL, 0))

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    sheet.save(OUTPUT_DIR / f"{slug}.png", optimize=True)
    return sheet, columns


def write_metadata(records: list[dict]) -> None:
    lines = [
        "/* Generated by tools/import_d2r_barbarian_auras.py. Do not edit by hand. */",
        "",
        "export interface BarbarianWarcryAuraArt {",
        "  path: string;",
        "  columns: number;",
        "  rows: number;",
        "  frameRate: number;",
        "  cell: number;",
        "  originX: number;",
        "  originY: number;",
        "  scale: number;",
        "}",
        "",
        "export const BARBARIAN_WARCRY_AURA_ART: Record<string, BarbarianWarcryAuraArt> = {",
    ]
    for record in sorted(records, key=lambda entry: entry["skill"]):
        lines.append(
            "  "
            + json.dumps(record["skill"])
            + ": { path: "
            + json.dumps(record["path"])
            + f", columns: {record['columns']}, rows: 1, frameRate: {record['frameRate']}"
            + f", cell: {OUTPUT_CELL}, originX: {round(SOURCE_ORIGIN[0] * OUTPUT_CELL / SOURCE_CELL)}"
            + f", originY: {round(SOURCE_ORIGIN[1] * OUTPUT_CELL / SOURCE_CELL)}, scale: {DRAW_SCALE:.2f} }},"
        )
    lines.append("};")
    lines.append("")
    lines.append("/** The combat skills' own overlays on the barbarian. */")
    lines.append("export const BARBARIAN_COMBAT_EFFECT_ART: Record<string, BarbarianWarcryAuraArt> = {")
    for skill, slug, _stem, rate, _shift in COMBAT_EFFECTS:
        lines.append(
            "  " + json.dumps(skill) + ": { path: "
            + json.dumps(f"assets/d2survivors/auras/barbarian/{slug}.png?v={ASSET_VERSION}")
            + f", columns: {COMBAT_FRAMES[slug]}, rows: 1, frameRate: {rate}, cell: {OUTPUT_CELL},"
            f" originX: {round(SOURCE_ORIGIN[0] * OUTPUT_CELL / SOURCE_CELL)},"
            f" originY: {round(SOURCE_ORIGIN[1] * OUTPUT_CELL / SOURCE_CELL)}, scale: {DRAW_SCALE:.2f} }},"
        )
    lines.append("};")
    lines.append("")
    lines.append("/** The corpse totem Grim Ward plants, one column per rank tier. */")
    lines.append("export const GRIM_WARD_ART: BarbarianWarcryAuraArt = {")
    lines.append(
        f'  path: "assets/d2survivors/auras/barbarian/grim-ward.png?v={ASSET_VERSION}",'
        f" columns: {len(GRIM_WARD_SIZES)}, rows: 1, frameRate: 1, cell: {OUTPUT_CELL},"
        f" originX: {round(SOURCE_ORIGIN[0] * OUTPUT_CELL / SOURCE_CELL)},"
        f" originY: {round(SOURCE_ORIGIN[1] * OUTPUT_CELL / SOURCE_CELL)}, scale: {DRAW_SCALE:.2f} }};"
    )
    lines.append("")
    METADATA.parent.mkdir(parents=True, exist_ok=True)
    METADATA.write_text("\n".join(lines), encoding="utf-8")


def build(source: Path) -> None:
    palette = [(red, green, blue) for blue, green, red in
               dcc.load_palette(source / "global" / "palette" / "units" / "pal.dat")]
    records = []
    for skill, slug, stem, frame_rate, tint, shift in AURAS:
        sheet, columns = build_sheet(source, palette, stem, slug, tint, shift)
        records.append({
            "skill": skill,
            "path": f"assets/d2survivors/auras/barbarian/{slug}.png?v={ASSET_VERSION}",
            "columns": columns,
            "frameRate": frame_rate,
        })
        print(f"{slug:16} {sheet.width:4}x{sheet.height:<4} {columns:2} frames from {stem}.dcc")
    for skill, slug, stem, _rate, shift in COMBAT_EFFECTS:
        sheet, columns = build_sheet(source, palette, stem, slug, None, shift)
        COMBAT_FRAMES[slug] = columns
        print(f"{slug:16} {sheet.width:4}x{sheet.height:<4} {columns:2} frames from {stem}.dcc")
    ward = build_grim_ward(source, palette)
    print(f"{'grim-ward':16} {ward.width:4}x{ward.height:<4} {len(GRIM_WARD_SIZES)} totem size(s)")
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
