"""Build Diablo's 8-direction animation atlas from the supplied D! DCCs.

Run from the client directory:
  python tools/import_d2_diablo_animations.py
  python tools/import_d2_diablo_animations.py --data-dir 'C:/Users/Saint/Desktop/d2/Data'

The source DCCs omit the decoder's sanity word. A corrected copy is made only
inside a temporary project-local directory. The output rows are eight neutral,
eight walk, and eight attack directions, each with sixteen frame columns.
"""

import argparse
import struct
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

CLIENT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = CLIENT_ROOT / "src" / "assets" / "d2survivors"
OUTPUT = ASSET_ROOT / "enemies" / "animated" / "diablo.png"
DEFAULT_DATA = Path(r"C:\Users\Saint\Desktop\d2\Data")
DEFAULT_WORK = Path(r"C:\Users\Saint\Desktop\d2\Work")
CONVERTER = Path("maxhanna.client") / "dcc-converter-bin" / "dcc-convert.exe"
DIRECTIONS = 8
COLUMNS = 16
SEQUENCES = {"idle": ("NU", 16), "move": ("WL", 6), "attack": ("A1", 16)}


def read_approx_palette() -> list[tuple[int, int, int]]:
    data = (ASSET_ROOT / "monster-palette-approx.dat").read_bytes()
    if len(data) != 256 * 3:
        raise ValueError("Expected the existing 256-entry BGR monster palette")
    return [(data[i + 2], data[i + 1], data[i]) for i in range(0, len(data), 3)]


def decode_sequence(data_root: Path, converter: Path, temp: Path, suffix: str, expected_frames: int, colors):
    source = data_root / "Global" / "Monsters" / "D!" / "TR" / f"D!TRLIT{suffix}HTH.dcc"
    if not source.is_file():
        raise FileNotFoundError(f"Missing Diablo DCC sequence: {source}")
    source_bytes = bytearray(source.read_bytes())
    if len(source_bytes) < 16 or source_bytes[0] != 0x74 or source_bytes[2] != DIRECTIONS or source_bytes[3] != expected_frames:
        raise ValueError(f"Unexpected Diablo DCC layout for {source.name}: {source_bytes[:4].hex()}")

    # These supplied monster files omit the four-byte decoder sanity word at
    # offset 7. Repair a temporary copy; never alter the original extraction.
    struct.pack_into("<I", source_bytes, 7, 1)
    temp.mkdir(parents=True, exist_ok=True)
    decoder_source = temp / source.name
    decoder_source.write_bytes(source_bytes)
    output_base = temp / "decoded.png"
    result = subprocess.run(
        [str(converter), "-dcc", str(decoder_source), "-png", str(output_base)],
        check=True, capture_output=True, text=True,
    )
    if "sanity check failed" in result.stdout.lower():
        raise RuntimeError(f"DCC converter rejected Diablo sequence {source.name}: {result.stdout.strip()}")

    palette_channels = [tuple(color[channel] for color in colors) for channel in range(3)]
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
            channels = [gray.point(palette_channels[channel]) for channel in range(3)]
            frames.append(Image.merge("RGBA", (*channels, gray.point(alpha_lut))))
        frames_by_direction.append(frames)
    return frames_by_direction


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA, help="extracted D2 Data directory")
    parser.add_argument("--work-dir", type=Path, default=DEFAULT_WORK, help="folder containing the DCC converter")
    args = parser.parse_args()
    converter = args.work_dir / CONVERTER
    if not converter.is_file():
        raise FileNotFoundError(f"Missing local DCC converter: {converter}")
    colors = read_approx_palette()

    with tempfile.TemporaryDirectory(prefix=".tmp-diablo-import-", dir=CLIENT_ROOT) as temp_name:
        temp = Path(temp_name)
        decoded = {}
        max_width = max_height = 1
        for state, (suffix, frame_count) in SEQUENCES.items():
            decoded[state] = decode_sequence(args.data_dir, converter, temp / state, suffix, frame_count, colors)
            for direction in decoded[state]:
                for frame in direction:
                    max_width = max(max_width, frame.width)
                    max_height = max(max_height, frame.height)

        sheet = Image.new("RGBA", (COLUMNS * max_width, len(SEQUENCES) * DIRECTIONS * max_height), (0, 0, 0, 0))
        for state_index, (state, (_, frame_count)) in enumerate(SEQUENCES.items()):
            for direction, frames in enumerate(decoded[state]):
                for column in range(COLUMNS):
                    frame = frames[min(column, frame_count - 1)]
                    x = column * max_width + (max_width - frame.width) // 2
                    y = (state_index * DIRECTIONS + direction) * max_height + max_height - frame.height
                    sheet.alpha_composite(frame, (x, y))

        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(OUTPUT, optimize=True)
        print(f"{OUTPUT.relative_to(ASSET_ROOT)}: {sheet.size}; idle/walk/attack, 8 directions x {COLUMNS} frames")


if __name__ == "__main__":
    main()
