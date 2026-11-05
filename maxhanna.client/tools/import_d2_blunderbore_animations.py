"""Build the Blunderbore atlas from the supplied extracted D2 monster DCCs.

Run from the client directory:
  python tools/import_d2_blunderbore_animations.py

D2's Act 2/Act 3 brute ("yet" family) ships as the Y# desert variant, which is
the brown club-carrying Blunderbore. Rows 0-7 are the eight walking directions,
rows 8-15 the eight attack directions, so the renderer can pick a band per
animation state exactly like the other imported monsters.

The DCCs store palette indices, so the colours come from the extracted game
palette (256 BGR triplets). File00003598 is the global palette whose ramps match
the ripped Blunderbore art; the project's generic warm approximation palette
below turns the brute olive-green.
"""

import argparse
import struct
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

CLIENT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = CLIENT_ROOT / "src" / "assets" / "d2survivors"
OUTPUT = ASSET_ROOT / "enemies" / "animated" / "blunderbore.png"
DEFAULT_DATA = Path(r"C:\Users\Saint\Desktop\d2\Data")
DEFAULT_WORK = Path(r"C:\Users\Saint\Desktop\d2\Work")
DEFAULT_PALETTE = Path(r"C:\Users\Saint\Desktop\d2\d2data\File00003598.xxx")
CONVERTER = Path("maxhanna.client") / "dcc-converter-bin" / "dcc-convert.exe"
TOKEN = "Y#"
TOKEN_DIR = Path("Y#") / "tr"
VARIANT = "TRDES"
DIRECTIONS = 8
SEQUENCES = {
    # state: (sequence suffix, frames emitted by the DCC)
    "move": ("WL", 8),
    "attack": ("A1", 16),
}
COLUMNS = 16


def read_palette(path: Path) -> list[tuple[int, int, int]]:
    data = path.read_bytes()
    if len(data) != 256 * 3:
        raise ValueError(f"{path} is not a 256-entry BGR palette")
    return [(data[i + 2], data[i + 1], data[i]) for i in range(0, len(data), 3)]


def decode_sequence(data_root: Path, converter: Path, temp: Path, suffix: str, expected_frames: int, colors):
    source = data_root / "Global" / "Monsters" / TOKEN_DIR / f"{TOKEN}{VARIANT}{suffix}HTH.dcc"
    if not source.is_file():
        raise FileNotFoundError(f"Missing Blunderbore DCC: {source}")
    source_bytes = bytearray(source.read_bytes())
    if len(source_bytes) < 16 or source_bytes[0] != 0x74 or source_bytes[2] != DIRECTIONS or source_bytes[3] != expected_frames:
        raise ValueError(f"Unexpected Blunderbore DCC layout for {source.name}: {source_bytes[:4].hex()}")

    # These supplied monster files omit the four-byte decoder sanity word at
    # offset 7. Repair a temporary copy; never alter the original extraction.
    struct.pack_into("<I", source_bytes, 7, 1)
    temp.mkdir(parents=True, exist_ok=True)
    decoder_source = temp / source.name
    decoder_source.write_bytes(source_bytes)
    output_base = temp / f"decoded-{suffix}.png"
    result = subprocess.run(
        [str(converter), "-dcc", str(decoder_source), "-png", str(output_base)],
        check=True, capture_output=True, text=True,
    )
    if "sanity check failed" in result.stdout.lower():
        raise RuntimeError(f"DCC converter rejected Blunderbore sequence {source.name}: {result.stdout.strip()}")

    channels = [tuple(color[channel] for color in colors) for channel in range(3)]
    alpha_lut = [0] + [255] * 255
    frames_by_direction = []
    for direction in range(DIRECTIONS):
        frames = []
        for frame_index in range(expected_frames):
            frame_path = Path(f"{output_base.with_suffix('')}_d{direction}_f{frame_index}.png")
            if not frame_path.is_file():
                raise RuntimeError(f"DCC converter did not emit {frame_path.name}")
            with Image.open(frame_path) as decoded:
                gray = decoded.convert("L")
            rgb = [gray.point(channel) for channel in channels]
            frames.append(Image.merge("RGBA", (*rgb, gray.point(alpha_lut))))
        frames_by_direction.append(frames)
    return frames_by_direction


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA, help="extracted D2 Data directory")
    parser.add_argument("--work-dir", type=Path, default=DEFAULT_WORK, help="folder containing the DCC converter")
    parser.add_argument("--palette", type=Path, default=DEFAULT_PALETTE, help="256-entry BGR monster palette")
    args = parser.parse_args()
    converter = args.work_dir / CONVERTER
    if not converter.is_file():
        raise FileNotFoundError(f"Missing local DCC converter: {converter}")
    colors = read_palette(args.palette)

    with tempfile.TemporaryDirectory(prefix=".tmp-blunderbore-import-", dir=CLIENT_ROOT) as temp_name:
        temp = Path(temp_name)
        decoded = {
            state: decode_sequence(args.data_dir, converter, temp / state, suffix, count, colors)
            for state, (suffix, count) in SEQUENCES.items()
        }
        width = height = 1
        for frames in decoded.values():
            for direction in frames:
                for frame in direction:
                    width = max(width, frame.width)
                    height = max(height, frame.height)

        sheet = Image.new("RGBA", (COLUMNS * width, 2 * DIRECTIONS * height), (0, 0, 0, 0))
        for state_index, (state, (_, frame_count)) in enumerate(SEQUENCES.items()):
            for direction, frames in enumerate(decoded[state]):
                for column in range(COLUMNS):
                    frame = frames[min(column, frame_count - 1)]
                    x = column * width + (width - frame.width) // 2
                    y = (state_index * DIRECTIONS + direction) * height + height - frame.height
                    sheet.alpha_composite(frame, (x, y))
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(OUTPUT, optimize=True)
        print(f"{OUTPUT.relative_to(ASSET_ROOT)}: {sheet.size} (cell {width}x{height}, walk/attack bands, 8 directions)")


if __name__ == "__main__":
    main()
