"""Extract the original Holy Shield shield design from the D2R effect art.

The Holy Shield VFX mesh uses ``holyshield_alb.texture`` as an emissive mask:
its RGB is black and the shield design is stored in the alpha channel.  The
texture is a UV atlas with the front shield in its top-left corner, so this
script crops that shield, masks away the surrounding atlas, and writes a
transparent PNG that the character renderer can mount over an equipped shield
while the buff is active.

Usage:
    python tools/import_d2r_holy_shield.py
    python tools/import_d2r_holy_shield.py --source "C:/path/to/d2r extract/data"
"""

from __future__ import annotations

import argparse
import io
import math
import struct
from pathlib import Path

from PIL import Image, ImageDraw

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "auras" / "paladin" / "holy-shield.png"
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"
TEXTURE_RELATIVE = Path("hd/vfx/meshes/lit_mesh/holyshield/holyshield_alb.texture")

# D2R .texture compression code -> DXGI format and bytes per 4x4 block.
COMPRESSION = {
    58: (71, 8),   # BC1
    62: (77, 16),  # BC3
    63: (80, 8),   # BC4
    64: (83, 16),  # BC5
    98: (98, 16),  # BC7
    99: (99, 16),  # BC7 sRGB
}
DDS_FLAGS = 0x1 | 0x2 | 0x4 | 0x1000 | 0x80000

# Shield silhouette in the 512px reference layout. It includes the ornate rim
# and excludes the neighbouring atlas islands on the left and right.
SHIELD_POLYGON = (
    (34, 0), (250, 0), (266, 30), (282, 75), (288, 120), (284, 165),
    (270, 205), (248, 240), (215, 266), (170, 288), (128, 288),
    (92, 267), (58, 240), (34, 207), (18, 170), (8, 128), (10, 82), (20, 35),
)
REFERENCE_SIZE = 512
CROP_BOX = (0, 0, 298, 296)
OUTPUT_SIZE = 320
OUTPUT_MARGIN = 4


def decode_texture(path: Path) -> Image.Image:
    """Decode mip 0 of a D2R .texture into an RGBA image."""
    raw = path.read_bytes()
    if raw[:4] != b"<DE(":
        raise ValueError(f"{path}: not a D2R texture")
    code = struct.unpack_from("<H", raw, 4)[0]
    mip_count = raw[7]
    width, height = struct.unpack_from("<II", raw, 8)
    compression = COMPRESSION.get(code)
    if compression is None:
        raise ValueError(f"{path}: unsupported D2R texture compression code {code}")
    dxgi, block_bytes = compression

    data_start = 0x24 + mip_count * 8
    mip_bytes = math.ceil(width / 4) * math.ceil(height / 4) * block_bytes
    if data_start + mip_bytes > len(raw):
        raise ValueError(f"{path}: mip 0 does not fit in the file")
    pixels = raw[data_start : data_start + mip_bytes]

    header = bytearray(128)
    header[0:4] = b"DDS "
    struct.pack_into("<I", header, 4, 124)
    struct.pack_into("<I", header, 8, DDS_FLAGS)
    struct.pack_into("<I", header, 12, height)
    struct.pack_into("<I", header, 16, width)
    struct.pack_into("<I", header, 20, mip_bytes)
    struct.pack_into("<I", header, 28, 1)
    struct.pack_into("<I", header, 76, 32)
    struct.pack_into("<I", header, 80, 4)
    header[84:88] = b"DX10"
    struct.pack_into("<I", header, 108, 0x1000)
    dds = bytes(header) + struct.pack("<IIIII", dxgi, 3, 0, 1, 0) + pixels
    with Image.open(io.BytesIO(dds)) as image:
        return image.convert("RGBA")


def build_asset(source: Path, destination: Path) -> None:
    texture = decode_texture(source / TEXTURE_RELATIVE)
    reference_scale = texture.width / REFERENCE_SIZE

    # The design lives in alpha; RGB is intentionally black in this VFX mask.
    design = texture.getchannel("A")

    mask = Image.new("L", (texture.width * 4, texture.height * 4), 0)
    ImageDraw.Draw(mask).polygon(
        [(x * reference_scale * 4, y * reference_scale * 4) for x, y in SHIELD_POLYGON],
        fill=255,
    )
    mask = mask.resize(texture.size, Image.Resampling.LANCZOS)

    box = tuple(round(value * reference_scale) for value in CROP_BOX)
    design = design.crop(box)
    mask = mask.crop(box)
    width, height = design.size
    scale = min((OUTPUT_SIZE - OUTPUT_MARGIN * 2) / width, (OUTPUT_SIZE - OUTPUT_MARGIN * 2) / height)
    scaled = (max(1, round(width * scale)), max(1, round(height * scale)))
    design = design.resize(scaled, Image.Resampling.LANCZOS)
    mask = mask.resize(scaled, Image.Resampling.LANCZOS)

    rgba = Image.merge("RGBA", (design, design, design, mask))
    canvas = Image.new("RGBA", (OUTPUT_SIZE, OUTPUT_SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(rgba, ((OUTPUT_SIZE - scaled[0]) // 2, (OUTPUT_SIZE - scaled[1]) // 2))
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination, "PNG", optimize=True)
    print(f"texture {texture.size[0]}x{texture.size[1]} -> {destination} ({destination.stat().st_size:,} bytes)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="D2R extract data directory")
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH, help="destination PNG")
    args = parser.parse_args()
    build_asset(args.source, args.output)


if __name__ == "__main__":
    main()
