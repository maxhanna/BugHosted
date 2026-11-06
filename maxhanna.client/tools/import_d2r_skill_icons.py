"""Import the original Diablo II: Resurrected skill icons.

D2R keeps one HD icon sheet per class under
`hd/global/ui/spells/<class>/<prefix>skillicon.sprite`. Each sheet is a raw
BGRA texture with 60 horizontally tiled 130x130 frames: two frames per skill.
`skilldesc.txt` supplies the frame index (`IconCel`) and `skills.txt` supplies
the class, while `skills.json` resolves each skill's display name.

The generated icons are written under `assets/d2survivors/skills/<class>/` and
`d2-skill-icons.generated.ts` maps every class skill name to its icon.

Usage:
    python tools/import_d2r_skill_icons.py
    python tools/import_d2r_skill_icons.py --source "C:/path/to/d2r/data"
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import struct
from pathlib import Path

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "skills"
GENERATED_MAP = PROJECT_ROOT / "src" / "app" / "d2survivors" / "d2-skill-icons.generated.ts"
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"
SPRITE_HEADER = struct.Struct("<4sHHIIIIIIII")

CLASS_SHEETS = {
    "ama": ("amazon", "amskillicon.sprite"),
    "ass": ("assassin", "asskillicon.sprite"),
    "bar": ("barbarian", "baskillicon.sprite"),
    "dru": ("druid", "drskillicon.sprite"),
    "nec": ("necromancer", "neskillicon.sprite"),
    "pal": ("paladin", "paskillicon.sprite"),
    "sor": ("sorceress", "soskillicon.sprite"),
}

# The game's skill tree calls the barbarian's sword icon "Blade Mastery", while
# this project uses the later "Sword Mastery" name.
OUTPUT_NAME_OVERRIDES = {
    "Blade Mastery": "Sword Mastery",
    "Raise Skeletal Mage": "Skeletal Mage",
}


def read_tsv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="latin-1") as handle:
        return list(csv.DictReader(handle, delimiter="\t"))


def read_strings(path: Path) -> dict[str, str]:
    strings = json.loads(path.read_text(encoding="utf-8-sig"))
    return {
        entry["Key"].lower(): (entry.get("enUS") or "").strip()
        for entry in strings
        if entry.get("Key")
    }


def load_sprite(path: Path) -> tuple[int, int, Image.Image]:
    """Return the frame width, frame height and horizontally tiled BGRA atlas."""
    data = path.read_bytes()
    if len(data) < SPRITE_HEADER.size:
        raise ValueError(f"{path.name} is too short for a D2R sprite")
    (
        magic, pixel_format, height, width, frame_height, _reserved0,
        frame_count, _reserved1, _reserved2, byte_count, bytes_per_pixel,
    ) = SPRITE_HEADER.unpack_from(data)
    if magic != b"SpA1":
        raise ValueError(f"{path.name} has unexpected sprite magic {magic!r}")
    if pixel_format != 31 or bytes_per_pixel != 4:
        raise ValueError(f"{path.name} is not an uncompressed BGRA sprite")
    if height != frame_height or not frame_count or width % frame_count:
        raise ValueError(f"{path.name} has inconsistent frame dimensions")
    frame_width = width // frame_count
    pixels = data[SPRITE_HEADER.size:]
    if byte_count != len(pixels) or byte_count != width * height * bytes_per_pixel:
        raise ValueError(f"{path.name} has an inconsistent pixel payload")
    atlas = Image.frombytes("RGBA", (width, height), pixels, "raw", "BGRA")
    return frame_width, frame_height, atlas


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="D2R extracted data directory")
    parser.add_argument("--list", action="store_true", help="list the icons that would be imported")
    args = parser.parse_args()

    excel_root = args.source / "global" / "excel"
    spells_root = args.source / "hd" / "global" / "ui" / "spells"
    skills = read_tsv(excel_root / "skills.txt")
    skill_desc = {row["skilldesc"]: row for row in read_tsv(excel_root / "skilldesc.txt")}
    strings = read_strings(args.source / "local" / "lng" / "strings" / "skills.json")

    icons: list[tuple[str, str, str, Image.Image]] = []
    for class_id, (folder, sprite_name) in CLASS_SHEETS.items():
        class_skills = [row for row in skills if row["charclass"] == class_id]
        if len(class_skills) != 30:
            raise RuntimeError(f"{class_id} has {len(class_skills)} skills rather than 30")
        frame_width, frame_height, atlas = load_sprite(spells_root / folder / sprite_name)
        frames = atlas.width // frame_width
        for skill in class_skills:
            description = skill_desc.get(skill["skilldesc"])
            if not description:
                raise RuntimeError(f"{skill['skill']} has no skilldesc row")
            display_name = strings.get(description["str name"].lower(), skill["skill"])
            output_name = OUTPUT_NAME_OVERRIDES.get(display_name, display_name)
            icon_cel = int(description["IconCel"])
            if not 0 <= icon_cel < frames:
                raise RuntimeError(f"{display_name} points at icon frame {icon_cel}, sheet has {frames}")
            frame = atlas.crop((icon_cel * frame_width, 0, (icon_cel + 1) * frame_width, frame_height))
            icons.append((class_id, output_name, folder, frame))

    names = [name for _class_id, name, _folder, _frame in icons]
    duplicates = sorted({name for name in names if names.count(name) > 1})
    if duplicates:
        raise RuntimeError(f"duplicate skill icon names: {', '.join(duplicates)}")

    if args.list:
        for class_id, name, folder, _frame in icons:
            print(f"{class_id}\t{folder}\t{name}")
        print(f"{len(icons)} icons")
        return

    ASSET_ROOT.mkdir(parents=True, exist_ok=True)
    generated = [
        "// Generated by tools/import_d2r_skill_icons.py. Do not edit by hand.",
        "// Original Diablo II: Resurrected HD skill icons, keyed by skill name.",
        "export const D2_SKILL_ICON_PATHS: Readonly<Record<string, string>> = {",
    ]
    for _class_id, name, folder, frame in icons:
        relative = Path(folder) / f"{slug(name)}.webp"
        output = ASSET_ROOT / relative
        output.parent.mkdir(parents=True, exist_ok=True)
        frame.save(output, "WEBP", quality=92, method=6)
        generated.append(
            f'  {json.dumps(name)}: "assets/d2survivors/skills/{relative.as_posix()}",'
        )
    generated.extend(["};", ""])
    GENERATED_MAP.write_text("\n".join(generated), encoding="utf-8")
    print(f"Imported {len(icons)} skill icons into {ASSET_ROOT.relative_to(PROJECT_ROOT)}")
    print(f"Wrote {GENERATED_MAP.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
