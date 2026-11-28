"""Import D2R's class portraits for the co-op party frames.

D2R paints one 120x120 portrait per class inside its own blue portrait frame,
shipped as single-frame ``SpA1`` sprites beside the hireling icons.  The party
panel wears the same art, so a hero standing in your area is drawn with the
face the game itself uses for them.

Written as lossless WebP: the frame's bevel is the part that would smear under
palette compression.

Usage:
    python tools/import_d2r_class_portraits.py
"""

from __future__ import annotations

import json
from pathlib import Path

from import_d2r_cursors import decode_sprite

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "ui" / "portraits"
SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data" / "hd" / "global" / "ui" / "hireables"

CLASSES = ("amazon", "assassin", "barbarian", "druid", "necromancer", "paladin", "sorceress")


def main() -> int:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for class_id in CLASSES:
        source_name = f"{class_id}icon.sprite"
        frames, width, height = decode_sprite(SOURCE / source_name)
        if len(frames) != 1:
            raise ValueError(f"{source_name} should hold one portrait, found {len(frames)}")
        target = OUTPUT / f"{class_id}.webp"
        frames[0].save(target, "WEBP", lossless=True, method=6)
        manifest[class_id] = {
            "source": f"hd/global/ui/hireables/{source_name}",
            "width": width,
            "height": height,
        }
        print(f"{class_id}: {width}x{height} -> {target}")

    (OUTPUT / "portraits.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
