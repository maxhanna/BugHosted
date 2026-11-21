"""Build a distinct Chaos Sanctuary room from the Worldstone wall set.

Act IV's catacombs backdrop is a small, low-detail room.  Stretched across the
arena it reads as a few flat slabs, and its thin painted wall faces leave the
sanctuary without readable architecture.  The Worldstone wall set already has
the right cathedral structure (buttresses, arches, wall caps and depth-sorted
strips), so this tool grades that set toward the sanctuary's red-black stone and
writes a self-contained copy for Act IV.  The floor, layout and collision mask
stay in the same 600x340 authored space as the source, which keeps the runtime
wall sorting and movement footprint aligned.

Usage:
    python tools/build_act4_chaos_sanctuary.py
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "maps"

SOURCE_BACKDROP = ASSET_ROOT / "act5-worldstone.png"
SOURCE_ATLAS = ASSET_ROOT / "act5-worldstone-walls.png"
SOURCE_LAYOUT = ASSET_ROOT / "act5-worldstone-walls.json"
SOURCE_COLLISION = ASSET_ROOT / "act5-worldstone-walls-collision.png"

BACKDROP = ASSET_ROOT / "act4-chaos-sanctuary.png"
ATLAS = ASSET_ROOT / "act4-chaos-sanctuary-walls.png"
LAYOUT = ASSET_ROOT / "act4-chaos-sanctuary-walls.json"
COLLISION = ASSET_ROOT / "act4-chaos-sanctuary-walls-collision.png"


def chaos_grade(source: Image.Image) -> Image.Image:
    """Warm the stone toward the sanctuary's red-black palette.

    Alpha is restored after blending so wall cut-outs stay transparent; the
    runtime depends on those holes for its depth-sorted strips.
    """
    base = source.convert("RGBA")
    alpha = base.getchannel("A")
    # Deep dried-blood stone.
    warmed = Image.blend(base, Image.new("RGBA", base.size, (165, 55, 38, 255)), 0.30)
    # Lift the edges and buttresses with ember light instead of flattening them.
    warmed = Image.blend(warmed, Image.new("RGBA", base.size, (255, 140, 95, 255)), 0.10)
    warmed.putalpha(alpha)
    return warmed


def main() -> int:
    backdrop = chaos_grade(Image.open(SOURCE_BACKDROP))
    atlas = chaos_grade(Image.open(SOURCE_ATLAS))
    collision = Image.open(SOURCE_COLLISION).convert("L")
    layout = json.loads(SOURCE_LAYOUT.read_text(encoding="utf-8"))

    backdrop.save(BACKDROP)
    atlas.save(ATLAS)
    collision.save(COLLISION)
    LAYOUT.write_text(json.dumps(layout, separators=(",", ":")), encoding="utf-8")

    print(f"backdrop {backdrop.width}x{backdrop.height} -> {BACKDROP}")
    print(f"atlas {atlas.width}x{atlas.height} -> {ATLAS}")
    print(f"layout -> {LAYOUT}")
    print(f"collision {collision.width}x{collision.height} -> {COLLISION}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
