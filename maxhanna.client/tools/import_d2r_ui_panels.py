"""Import D2R's original inventory and character-sheet panel art.

The HD panels are single-frame ``SpA1`` sprites.  The inventory background
contains the paperdoll frames and the 10x4 grid; the character background
contains the four attribute rows and the derived-stat wells.  Both are written
as transparent WebP so the component can use the game's actual framing instead
of redrawing it in CSS.

The in-game Exocet face is copied alongside them for the panel lettering.

Usage:
    python tools/import_d2r_ui_panels.py
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image

from import_d2r_cursors import decode_sprite

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "ui"
SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"

PANELS = {
    "character-panel": "hd/global/ui/panel/character_sheet/character_background.sprite",
    "inventory-panel": "hd/global/ui/panel/inventory/classic_background.sprite",
    # The window frame itself. Every D2R window (the skill tree included) is
    # drawn inside this bevelled metal border, so the skill tree can slice it
    # with border-image instead of faking the edge with a CSS shadow.
    "panel-frame": "hd/global/ui/panel/panel_bg.sprite",
}
FONT = "hd/ui/fonts/exocetblizzardot-medium.otf"


def main() -> int:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for output_name, source_name in PANELS.items():
        frames, frame_width, height = decode_sprite(SOURCE / source_name)
        if len(frames) != 1:
            raise ValueError(f"{source_name} should be a single-frame panel")
        target = OUTPUT / f"{output_name}.webp"
        frames[0].save(target, "WEBP", quality=90, method=6)
        manifest[output_name] = {
            "source": source_name,
            "width": frame_width,
            "height": height,
        }
        print(f"{output_name}: {frame_width}x{height} -> {target}")

    font_target = OUTPUT / "exocet-blizzard.otf"
    shutil.copyfile(SOURCE / FONT, font_target)
    manifest["exocet-font"] = {"source": FONT}
    print(f"exocet-font -> {font_target}")

    (OUTPUT / "panels.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
