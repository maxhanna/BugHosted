"""Import Baal (B!) and Minions of Destruction (B_) DCCs as runtime atlases.

Run from the repository root:
  python maxhanna.client/tools/import_d2_baals_minion_animations.py
  python maxhanna.client/tools/import_d2_baals_minion_animations.py --data-dir C:/.../d2/Data --work-dir C:/.../d2/Work

Decoded frames and the decoder sanity-word repair live only in a temporary
folder; the supplied extraction is never modified. Rows are eight directions
each for idle, walk, and attack, in that order.
"""

import argparse
import struct
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

CLIENT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = CLIENT_ROOT / "src" / "assets" / "d2survivors"
DEFAULT_DATA = Path(r"C:\Users\Saint\Desktop\d2\Data")
DEFAULT_WORK = Path(r"C:\Users\Saint\Desktop\d2\Work")
CONVERTER = Path("maxhanna.client") / "dcc-converter-bin" / "dcc-convert.exe"
DIRECTIONS = 8
VARIANTS = (
    ("Minions of Destruction", "B_", "B_", "baals-minion", 16, (("idle", "NU", 14), ("move", "WL", 8), ("attack", "A1", 16))),
    ("Baal", "B!", "B!", "baal", 14, (("idle", "NU", 6), ("move", "WL", 7), ("attack", "A1", 14))),
)


def palette() -> list[tuple[int, int, int]]:
    data = (ASSET_ROOT / "monster-palette-approx.dat").read_bytes()
    if len(data) != 256 * 3:
        raise ValueError("Expected the existing 256-entry BGR monster palette")
    return [(data[i + 2], data[i + 1], data[i]) for i in range(0, len(data), 3)]


def decode_sequence(data_root: Path, converter: Path, temp: Path, token: str, prefix: str, suffix: str, count: int, colors):
    source = data_root / "Global" / "Monsters" / token / "TR" / f"{prefix}TRLIT{suffix}HTH.dcc"
    if not source.is_file():
        raise FileNotFoundError(f"Missing {token} DCC sequence: {source}")
    source_data = bytearray(source.read_bytes())
    if len(source_data) < 16 or source_data[0] != 0x74 or source_data[2] != DIRECTIONS or source_data[3] != count:
        raise ValueError(f"Unexpected DCC layout for {source.name}: {source_data[:4].hex()}")

    # The supplied DCC extraction omits the decoder sanity word. Repair only a
    # temporary copy, matching the established local DCC import workflow.
    struct.pack_into("<I", source_data, 7, 1)
    temp.mkdir(parents=True, exist_ok=True)
    decoder_source = temp / source.name
    decoder_source.write_bytes(source_data)
    output_base = temp / "decoded.png"
    subprocess.run(
        [str(converter), "-dcc", str(decoder_source), "-png", str(output_base)],
        check=True, capture_output=True, text=True,
    )

    channel_luts = [tuple(color[channel] for color in colors) for channel in range(3)]
    alpha_lut = [0] + [255] * 255
    frames_by_direction = []
    for direction in range(DIRECTIONS):
        frames = []
        for frame_index in range(count):
            frame_path = Path(f"{output_base.with_suffix('')}_d{direction}_f{frame_index}.png")
            if not frame_path.is_file():
                raise RuntimeError(f"DCC converter did not emit {frame_path.name}")
            with Image.open(frame_path) as decoded:
                gray = decoded.convert("L")
            rgb = [gray.point(channel_luts[channel]) for channel in range(3)]
            frames.append(Image.merge("RGBA", (*rgb, gray.point(alpha_lut))))
        frames_by_direction.append(frames)
    return frames_by_direction


def build_atlas(data_root: Path, converter: Path, temp: Path, name: str, token: str, prefix: str, output_name: str, columns: int, sequences, colors) -> None:
    decoded = {}
    width = height = 1
    for state, suffix, count in sequences:
        decoded[state] = decode_sequence(data_root, converter, temp / output_name / state, token, prefix, suffix, count, colors)
        for direction in decoded[state]:
            for frame in direction:
                width = max(width, frame.width)
                height = max(height, frame.height)

    sheet = Image.new("RGBA", (columns * width, len(sequences) * DIRECTIONS * height), (0, 0, 0, 0))
    for state_index, (state, _, frame_count) in enumerate(sequences):
        for direction, frames in enumerate(decoded[state]):
            for column in range(columns):
                frame = frames[min(column, frame_count - 1)]
                x = column * width + (width - frame.width) // 2
                y = (state_index * DIRECTIONS + direction) * height + height - frame.height
                sheet.alpha_composite(frame, (x, y))

    output = ASSET_ROOT / "enemies" / "animated" / f"{output_name}.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, optimize=True)
    print(f"{output.relative_to(ASSET_ROOT)}: {sheet.size}; {name}, 8 directions x {columns} frames")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA, help="extracted D2 Data directory")
    parser.add_argument("--work-dir", type=Path, default=DEFAULT_WORK, help="folder containing the local DCC converter")
    args = parser.parse_args()
    converter = args.work_dir / CONVERTER
    if not converter.is_file():
        raise FileNotFoundError(f"Missing local DCC converter: {converter}")
    colors = palette()

    with tempfile.TemporaryDirectory(prefix=".tmp-baal-import-", dir=CLIENT_ROOT) as temp_name:
        temp = Path(temp_name)
        for name, token, prefix, output_name, columns, sequences in VARIANTS:
            build_atlas(args.data_dir, converter, temp, name, token, prefix, output_name, columns, sequences, colors)


if __name__ == "__main__":
    main()
