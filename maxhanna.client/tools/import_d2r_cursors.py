"""Import D2R's animated gauntlet cursor.

The HD cursor files under ``hd/global/ui/cursor`` are ``SpA1`` sprites: a
40-byte header followed by a horizontal strip of BGRA frames.  ``ohand`` is the
idle gauntlet and ``ppress`` is its mouse-down animation; both are 16 frames at
138x128.  They are written as lossless WebP strips for the runtime cursor.

Usage:
    python tools/import_d2r_cursors.py
"""

from __future__ import annotations

import json
import struct
from pathlib import Path

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "ui"
SOURCE = (
    Path.home()
    / "Desktop"
    / "d2"
    / "d2r extract"
    / "data"
    / "hd"
    / "global"
    / "ui"
    / "cursor"
)

CURSORS = {
    "cursor-idle": ("ohand", None),
    "cursor-press": ("ppress", None),
    # buysell is a ten-icon sheet, not an animation; frame 0 is the buy/sell
    # arrow used over Gheed's stock.
    "cursor-shop": ("buysell", 0),
    "cursor-rotate": ("orotate", None),
}
# The gauntlet points up-right; the fingertip is the click point.
HOTSPOT = (126, 19)


def decode_sprite(path: Path) -> tuple[list[Image.Image], int, int]:
    data = path.read_bytes()
    if data[:4] not in (b"SpA1", b"SPa1"):
        raise ValueError(f"{path.name} is not an SpA1 sprite")
    header = struct.unpack_from("<4sHHIIIIIIII", data, 0)
    frame_width, total_width, height = header[2], header[3], header[4]
    frames, size = header[6], header[9]
    if frame_width * frames > total_width:
        raise ValueError(f"{path.name} frame strip is too short")
    if total_width * height * 4 != size:
        raise ValueError(f"{path.name} pixel size does not match its header")
    strip = Image.frombytes("RGBA", (total_width, height), data[40:40 + size], "raw", "BGRA")
    return [
        strip.crop((index * frame_width, 0, (index + 1) * frame_width, height))
        for index in range(frames)
    ], frame_width, height


def main() -> int:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for output_name, (source_name, frame_index) in CURSORS.items():
        source_path = SOURCE / f"{source_name}.sprite"
        frames, frame_width, height = decode_sprite(source_path)
        if frame_index is not None:
            frames = [frames[frame_index]]
        strip = Image.new("RGBA", (frame_width * len(frames), height), (0, 0, 0, 0))
        for index, frame in enumerate(frames):
            strip.alpha_composite(frame, (index * frame_width, 0))
        target = OUTPUT / f"{output_name}.webp"
        strip.save(target, "WEBP", lossless=True, method=6)
        manifest[output_name] = {
            "source": f"hd/global/ui/cursor/{source_name}.sprite",
            "frames": len(frames),
            "frameWidth": frame_width,
            "height": height,
            "hotspotX": HOTSPOT[0],
            "hotspotY": HOTSPOT[1],
        }
        if output_name == "cursor-shop":
            # The buy/sell arrow points at its upper-left corner.
            manifest[output_name]["hotspotX"] = 8
            manifest[output_name]["hotspotY"] = 8
        elif output_name == "cursor-rotate":
            # The rotation hand points left instead of up-right.
            manifest[output_name]["hotspotX"] = 14
            manifest[output_name]["hotspotY"] = 18
        print(f"{output_name}: {len(frames)} frames {frame_width}x{height} -> {target}")
    (OUTPUT / "cursor.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
