"""Import the HD Diablo II: Resurrected charm inventory icons.

D2R calls the three charm sizes `charm_small`, `charm_medium` and
`charm_large`; the middle and large files are the 1x2 large charm and 1x3
grand charm used by Diablo II. They are uncompressed BGRA sprites, like the
skill-icon sheets, and are much clearer than the scroll-like legacy `invchm`
cel.

Outputs:

* `assets/d2survivors/items/small-charm.png`
* `assets/d2survivors/items/large-charm.png`
* `assets/d2survivors/items/grand-charm.png`

Usage:
    python tools/import_d2r_charm_icons.py
"""

from __future__ import annotations

import argparse
import struct
from pathlib import Path

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "items"
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"
SPRITE_HEADER = struct.Struct("<4sHHIIIIIIII")

CHARMS = {
    "small-charm.png": "charm_small.sprite",
    "large-charm.png": "charm_medium.sprite",
    "grand-charm.png": "charm_large.sprite",
}


def load_sprite(path: Path) -> Image.Image:
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
    if frame_count != 1:
        raise ValueError(f"{path.name} is not a single-frame charm icon")
    pixels = data[SPRITE_HEADER.size:]
    # Taller charms store their full height in `frame_height` (196 for a large
    # charm, 294 for a grand charm) while `height` remains the 98px cell width
    # used by the square small-charm icon. The payload length disambiguates it.
    image_height = max(height, frame_height)
    if byte_count != len(pixels) or byte_count != width * image_height * bytes_per_pixel:
        raise ValueError(f"{path.name} has an inconsistent pixel payload")
    image = Image.frombytes("RGBA", (width, image_height), pixels, "raw", "BGRA")
    if image.getbbox() is None:
        raise ValueError(f"{path.name} has no visible pixels")
    return image


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="D2R extracted data directory")
    args = parser.parse_args()

    source = args.source / "hd" / "global" / "ui" / "items" / "misc" / "charm"
    ASSET_ROOT.mkdir(parents=True, exist_ok=True)
    for filename, sprite_name in CHARMS.items():
        image = load_sprite(source / sprite_name)
        image.save(ASSET_ROOT / filename, "PNG", optimize=True)
        print(f"imported {filename} from {sprite_name} ({image.width}x{image.height})")


if __name__ == "__main__":
    main()
