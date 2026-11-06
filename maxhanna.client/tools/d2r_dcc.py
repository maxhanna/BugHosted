"""Decoder for Diablo II `.dcc` animation files (DCC version 6).

The D2R extraction under `Desktop/d2/d2r extract/data` ships every animation
under its original name (`global/monsters/PN/tr/pntrlita1hth.dcc` and so on),
so enemy, missile and player art can be imported by *name* instead of guessing
which unnamed `File########.xxx` dump holds which monster.

A DCC file holds one animation of one unit layer: `directions` directions of
`frames_per_dir` frames of 8-bit palette indices, compressed per direction into
LSB-first bit streams that fill a grid of 4x4 pixel cells. Index 0 is
transparent.

Usage:
    python tools/d2r_dcc.py info    <file.dcc>
    python tools/d2r_dcc.py render  <file.dcc> <out_dir> [--palette PATH]

`render` writes `<out_dir>/<d><f>.png`, one file per direction and frame,
cropped to the frame box the file declares.
"""

from __future__ import annotations

import struct
from pathlib import Path

from PIL import Image

SIGNATURE = 0x74
# 4-bit width code -> bit width of the matching frame header field.
WIDTHS = (0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 26, 28, 30, 32)
FIELDS = ("variable0", "width", "height", "offset_x", "offset_y", "optional_bytes", "coded_bytes")
SIGNED = ("offset_x", "offset_y")


class DCCError(ValueError):
    pass


class Bits:
    """LSB-first bit reader over `data[pos:end]` expressed in bits."""

    __slots__ = ("data", "pos", "end")

    def __init__(self, data: bytes, pos: int = 0, end: int | None = None) -> None:
        self.data = data
        self.pos = pos
        self.end = len(data) * 8 if end is None else end

    def read(self, count: int) -> int:
        if count == 0:
            return 0
        start = self.pos
        if start + count > self.end:
            raise DCCError(f"read past end of stream ({start}+{count} > {self.end})")
        byte = start >> 3
        span = ((start & 7) + count + 7) >> 3
        value = int.from_bytes(self.data[byte:byte + span], "little") >> (start & 7)
        self.pos = start + count
        return value & ((1 << count) - 1)


def parse_header(data: bytes) -> dict:
    if len(data) < 15:
        raise DCCError("file shorter than header")
    signature, version, directions, frames, tag, total = struct.unpack_from("<BBBIII", data, 0)
    if signature != SIGNATURE:
        raise DCCError(f"signature {signature:#x}")
    if not directions or not frames:
        raise DCCError("no directions or frames")
    offsets = list(struct.unpack_from("<%dI" % directions, data, 15))
    header_end = 15 + 4 * directions
    if offsets[0] != header_end:
        raise DCCError(f"first direction at {offsets[0]}, header ends at {header_end}")
    ends = offsets[1:] + [len(data)]
    for start, end in zip(offsets, ends):
        if not start < end <= len(data):
            raise DCCError(f"direction bounds {start}..{end}")
    return {
        "signature": signature,
        "version": version,
        "directions": directions,
        "frames_per_dir": frames,
        "tag": tag,
        "total": total,
        "dir_bounds": list(zip(offsets, ends)),
    }


def _cells(start: int, size: int, absorb: int = 1) -> list[tuple[int, int]]:
    """Split `[start, start+size)` into 4-pixel grid cells (direction coordinates)."""
    first = 4 - (start % 4)
    if size - first <= absorb:
        return [(start, size)]
    out = [(start, first)]
    pos, rest = start + first, size - first
    while rest > 4:
        if rest - 4 <= absorb:
            break
        out.append((pos, 4))
        pos += 4
        rest -= 4
    out.append((pos, rest))
    return out


def decode_direction(data: bytes, start: int, end: int, frames_per_dir: int, pixels: bool = True) -> dict:
    """Decode one direction's bit stream, returning frame headers and optional bitmaps."""
    stream = Bits(data[start:end])
    direction = {"outsize_coded": stream.read(32), "compression": stream.read(2)}
    codes = [stream.read(4) for _ in FIELDS]
    bit_widths = [WIDTHS[code] for code in codes]
    direction["field_bits"] = bit_widths

    frames = []
    for index in range(frames_per_dir):
        frame = {}
        for name, width in zip(FIELDS, bit_widths):
            value = stream.read(width)
            if name in SIGNED and width and value & (1 << (width - 1)):
                value -= 1 << width
            frame[name] = value
        frame["bottom_up"] = stream.read(1)
        if frame["width"] == 0 or frame["height"] == 0:
            raise DCCError(f"frame {index} has zero size")
        frame["xmin"] = frame["offset_x"]
        frame["xmax"] = frame["xmin"] + frame["width"] - 1
        if frame["bottom_up"]:
            frame["ymin"] = frame["offset_y"]
            frame["ymax"] = frame["ymin"] + frame["height"] - 1
        else:
            frame["ymax"] = frame["offset_y"]
            frame["ymin"] = frame["ymax"] - frame["height"] + 1
        frames.append(frame)
    direction["frames"] = frames

    if any(frame["optional_bytes"] for frame in frames):
        stream.read((-stream.pos) % 8)
        for frame in frames:
            stream.read(8 * frame["optional_bytes"])

    compression = direction["compression"]
    sizes = {"equal_cell": stream.read(20) if compression & 2 else None, "pixel_mask": stream.read(20)}
    if compression & 1:
        sizes["encoding_type"] = stream.read(20)
        sizes["raw_pixel"] = stream.read(20)
    else:
        sizes["encoding_type"] = sizes["raw_pixel"] = None
    key = [index for index in range(256) if stream.read(1)]

    position = stream.pos
    streams = {}
    for name in ("equal_cell", "pixel_mask", "encoding_type", "raw_pixel"):
        length = sizes[name]
        if length is None:
            continue
        streams[name] = Bits(stream.data, position, position + length)
        position += length
    if position > stream.end:
        raise DCCError(f"stream sizes overrun the direction ({position} > {stream.end})")
    streams["pixel_code"] = Bits(stream.data, position, stream.end)

    xmin = min(frame["xmin"] for frame in frames)
    xmax = max(frame["xmax"] for frame in frames)
    ymin = min(frame["ymin"] for frame in frames)
    ymax = max(frame["ymax"] for frame in frames)
    width, height = xmax - xmin + 1, ymax - ymin + 1
    cell_columns = 1 + (width - 1) // 4
    cell_rows = 1 + (height - 1) // 4
    for frame in frames:
        frame["cols"] = _cells(frame["xmin"] - xmin, frame["width"])
        frame["rows"] = _cells(frame["ymin"] - ymin, frame["height"])

    equal = streams.get("equal_cell")
    mask_stream = streams["pixel_mask"]
    encoding = streams.get("encoding_type")
    raw = streams.get("raw_pixel")
    codes_stream = streams["pixel_code"]

    # Stage 1: each cell of each frame resolves to four palette-key indices.
    last = [None] * (cell_columns * cell_rows)
    entries = []
    for frame in frames:
        frame_entries = []
        for y0, cell_height in frame["rows"]:
            cell_y = y0 // 4
            for x0, _ in frame["cols"]:
                cell = x0 // 4 + cell_y * cell_columns
                previous = last[cell]
                if previous is not None:
                    if equal is not None and equal.read(1):
                        frame_entries.append(None)
                        continue
                    mask = mask_stream.read(4)
                else:
                    mask = 0xF
                count = bin(mask).count("1")
                use_raw = encoding.read(1) if (count and encoding is not None) else 0
                values = []
                last_value = 0
                for _ in range(count):
                    if use_raw:
                        value = raw.read(8)
                    else:
                        value = last_value
                        delta = codes_stream.read(4)
                        value += delta
                        while delta == 15:
                            delta = codes_stream.read(4)
                            value += delta
                    if value == last_value:
                        break
                    values.append(value)
                    last_value = value
                slots = [0, 0, 0, 0]
                ordered = values[::-1]
                taken = 0
                for slot in range(4):
                    if mask & (1 << slot):
                        if taken < len(ordered):
                            slots[slot] = ordered[taken]
                            taken += 1
                    else:
                        slots[slot] = previous[slot]
                last[cell] = slots
                frame_entries.append(slots)
        entries.append(frame_entries)

    key_size = len(key)
    for frame_entries in entries:
        for slots in frame_entries:
            if slots is not None:
                for value in slots:
                    if value >= key_size:
                        raise DCCError(f"pixel value {value} beyond key size {key_size}")

    # Stage 2: paint the cells into a direction-sized canvas.
    canvas = bytearray(width * height)
    geometry = [None] * (cell_columns * cell_rows)
    bitmaps = []
    for frame, frame_entries in zip(frames, entries):
        index = 0
        for y0, cell_height in frame["rows"]:
            cell_y = y0 // 4
            for x0, cell_width in frame["cols"]:
                cell = x0 // 4 + cell_y * cell_columns
                slots = frame_entries[index]
                index += 1
                if slots is None:
                    last_x, last_y, last_w, last_h = geometry[cell]
                    if (last_w, last_h) == (cell_width, cell_height):
                        rows = [bytes(canvas[(last_y + row) * width + last_x:(last_y + row) * width + last_x + cell_width])
                                for row in range(cell_height)]
                        for row in range(cell_height):
                            at = (y0 + row) * width + x0
                            canvas[at:at + cell_width] = rows[row]
                    else:
                        for row in range(cell_height):
                            at = (y0 + row) * width + x0
                            canvas[at:at + cell_width] = bytes(cell_width)
                else:
                    colours = [key[value] for value in slots]
                    if slots[0] == slots[1]:
                        line = bytes([colours[0]]) * cell_width
                        for row in range(cell_height):
                            at = (y0 + row) * width + x0
                            canvas[at:at + cell_width] = line
                    else:
                        bit_count = 1 if slots[1] == slots[2] else 2
                        mask_value = (1 << bit_count) - 1
                        for row in range(cell_height):
                            bits = codes_stream.read(bit_count * cell_width)
                            out = bytearray(cell_width)
                            for column in range(cell_width):
                                out[column] = colours[bits & mask_value]
                                bits >>= bit_count
                            at = (y0 + row) * width + x0
                            canvas[at:at + cell_width] = out
                geometry[cell] = (x0, y0, cell_width, cell_height)
        if pixels:
            frame_x = frame["xmin"] - xmin
            frame_y = frame["ymin"] - ymin
            frame_width, frame_height = frame["width"], frame["height"]
            bitmap = bytearray(frame_width * frame_height)
            for row in range(frame_height):
                source = (frame_y + row) * width + frame_x
                bitmap[row * frame_width:(row + 1) * frame_width] = canvas[source:source + frame_width]
            bitmaps.append(bitmap)

    direction["bitmaps"] = bitmaps
    direction["box"] = (xmin, ymin, width, height)
    direction["pixel_values"] = key
    return direction


def parse(data: bytes, pixels: bool = True) -> dict:
    header = parse_header(data)
    header["dirs"] = [decode_direction(data, start, end, header["frames_per_dir"], pixels)
                      for start, end in header["dir_bounds"]]
    return header


def load_palette(path: str | Path) -> list[tuple[int, int, int]]:
    """Read a Diablo II `.dat` palette (256 RGB triples)."""
    raw = Path(path).read_bytes()
    if len(raw) < 768:
        raise DCCError(f"palette {path} is {len(raw)} bytes, expected 768")
    return [tuple(raw[index * 3:index * 3 + 3]) for index in range(256)]


def frame_image(bitmap: bytearray, width: int, height: int,
                palette: list[tuple[int, int, int]]) -> Image.Image:
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    pixels = image.load()
    for y in range(height):
        row = y * width
        for x in range(width):
            index = bitmap[row + x]
            if index == 0:
                continue
            red, green, blue = palette[index]
            pixels[x, y] = (red, green, blue, 255)
    return image


def render(path: str | Path, out_dir: str | Path, palette: list[tuple[int, int, int]],
           directions: set[int] | None = None) -> dict:
    data = Path(path).read_bytes()
    header = parse(data)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for direction_index, direction in enumerate(header["dirs"]):
        if directions is not None and direction_index not in directions:
            continue
        for frame_index, (frame, bitmap) in enumerate(zip(direction["frames"], direction["bitmaps"])):
            image = frame_image(bitmap, frame["width"], frame["height"], palette)
            image.save(out / f"{direction_index}_{frame_index}.png")
    return header


def main(argv: list[str]) -> int:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    info = sub.add_parser("info", help="print the header and frame boxes")
    info.add_argument("file")
    render_cmd = sub.add_parser("render", help="write one PNG per frame")
    render_cmd.add_argument("file")
    render_cmd.add_argument("out_dir")
    render_cmd.add_argument("--palette", required=True)
    render_cmd.add_argument("--directions", default="")
    args = parser.parse_args(argv)

    if args.command == "info":
        header = parse(Path(args.file).read_bytes(), pixels=False)
        print(f"version {header['version']} directions {header['directions']} "
              f"frames {header['frames_per_dir']} tag {header['tag']}")
        for index, direction in enumerate(header["dirs"]):
            boxes = ", ".join(f"{f['width']}x{f['height']}@({f['offset_x']},{f['offset_y']})"
                              for f in direction["frames"])
            print(f"dir {index}: box {direction['box']} {boxes}")
        return 0

    chosen = {int(value) for value in args.directions.split(",") if value.strip()} or None
    render(args.file, args.out_dir, load_palette(args.palette), chosen)
    print(f"rendered {args.file} -> {args.out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(__import__("sys").argv[1:]))
