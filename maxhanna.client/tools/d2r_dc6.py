"""Minimal Diablo II DC6 decoder.

DC6 is the classic inventory/UI sprite format. Layout, verified against real
files from the D2R extraction:

* 24-byte file header: version (6), flags (1), encoding (0), uninitialised
  termination dword, directions, frames per direction;
* a direction-major table of u32 frame offsets at byte 24;
* per frame a 32-byte record (flip, width, height, offsetX, offsetY, unknown,
  nextBlock, length), then `length` bytes of scanline data, then 3 slack bytes.

Scanline opcodes: 0x01-0x7F copy that many palette indices, 0x80 ends the
scanline, 0x81-0xFF skip `opcode & 0x7F` transparent pixels. Rows are stored
bottom-up, so they are flipped when the image is built. Index 0 is transparent.
"""

from __future__ import annotations

import struct
from pathlib import Path

from PIL import Image

HEADER_SIZE = 24
FRAME_HEADER_SIZE = 32


def load_palette(path: Path) -> list[tuple[int, int, int]]:
    data = path.read_bytes()
    if len(data) < 768:
        raise ValueError(f"palette {path} is {len(data)} bytes, expected 768")
    return [tuple(data[index * 3:index * 3 + 3]) for index in range(256)]


def decode_scanlines(payload: bytes, width: int, height: int) -> bytes:
    """Expand a frame's opcode stream into top-down palette indices."""
    rows: list[bytes] = []
    row = bytearray(width)
    x = 0
    cursor = 0
    while cursor < len(payload) and len(rows) < height:
        opcode = payload[cursor]
        cursor += 1
        if opcode == 0x80:
            rows.append(bytes(row))
            row = bytearray(width)
            x = 0
        elif opcode & 0x80:
            x += opcode & 0x7F
        else:
            chunk = payload[cursor:cursor + opcode]
            cursor += opcode
            for value in chunk:
                if x < width:
                    row[x] = value
                x += 1
    while len(rows) < height:
        rows.append(bytes(width))
    # The first scanline on disk is the lowest row on screen.
    return b"".join(reversed(rows))


def parse(data: bytes) -> dict:
    if len(data) < HEADER_SIZE:
        raise ValueError("dc6 is too short")
    version, _flags, _encoding = struct.unpack_from("<III", data, 0)
    if version != 6:
        raise ValueError(f"unsupported dc6 version {version}")
    directions, frames_per_dir = struct.unpack_from("<II", data, 16)
    count = directions * frames_per_dir
    if not 1 <= count <= 0x4000:
        raise ValueError(f"dc6 declares {count} frames")
    table = HEADER_SIZE
    offsets = struct.unpack_from(f"<{count}I", data, table)
    frames = []
    for offset in offsets:
        if offset + FRAME_HEADER_SIZE > len(data):
            raise ValueError(f"frame offset {offset} outside the file")
        width, height = struct.unpack_from("<II", data, offset + 4)
        length = struct.unpack_from("<I", data, offset + 28)[0]
        if width == 0 or height == 0 or width > 1024 or height > 1024:
            raise ValueError(f"implausible frame {width}x{height} at {offset}")
        if offset + FRAME_HEADER_SIZE + length > len(data):
            raise ValueError(f"frame at {offset} declares {length} bytes past the file")
        start = offset + FRAME_HEADER_SIZE
        frames.append({
            "width": width,
            "height": height,
            "indices": decode_scanlines(data[start:start + length], width, height),
        })
    return {"directions": directions, "frames_per_dir": frames_per_dir, "frames": frames}


def frame_image(frame: dict, palette: list[tuple[int, int, int]]) -> Image.Image:
    width, height = frame["width"], frame["height"]
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    pixels = image.load()
    indices = frame["indices"]
    for y in range(height):
        row = y * width
        for x in range(width):
            value = indices[row + x]
            if value == 0:
                continue
            red, green, blue = palette[value]
            pixels[x, y] = (red, green, blue, 255)
    return image


def render(path: Path, palette: list[tuple[int, int, int]]) -> Image.Image:
    """First cel of a dc6, cropped to its visible pixels."""
    animation = parse(path.read_bytes())
    image = frame_image(animation["frames"][0], palette)
    box = image.getbbox()
    return image.crop(box) if box else image
