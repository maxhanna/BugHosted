"""Build a Council Member atlas from the supplied extracted D2 monster DCCs.

Run from the client directory:
  python tools/import_d2_council_animations.py

D2's Act III Council uses Zakarum Priest Advocates (A@). This atlas uses the
original Advocate DCC. The rows are eight directions each for neutral,
locomotion, and attack, matching the renderer's three-state Council selection.
Decoded PNG frames are temporary and removed automatically after import.
"""

import argparse
import struct
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

CLIENT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = CLIENT_ROOT / "src" / "assets" / "d2survivors"
OUTPUT = ASSET_ROOT / "enemies" / "animated" / "council.png"
DEFAULT_DATA = Path(r"C:\Users\Saint\Desktop\d2\Data")
CONVERTER = Path("maxhanna.client") / "dcc-converter-bin" / "dcc-convert.exe"
SEQUENCES = {
    "idle": ("NU", 12),
    # Council Advocates have no separate locomotion sequence; use their neutral
    # pose while approaching rather than showing a hit reaction as a walk.
    "move": ("NU", 12),
    "attack": ("A1", 20),
}
DIRECTIONS = 8
COLUMNS = 20


def palette() -> list[tuple[int, int, int]]:
    data = (ASSET_ROOT / "monster-palette-approx.dat").read_bytes()
    if len(data) != 256 * 3:
        raise ValueError("Expected a 256-entry BGR monster palette")
    return [(data[i + 2], data[i + 1], data[i]) for i in range(0, len(data), 3)]


def decode_sequence(data_root: Path, work_dir: Path, temp: Path, suffix: str, count: int, colors):
    source = data_root / "Global" / "Monsters" / "A@" / "TR" / f"A@TRLIT{suffix}HTH.dcc"
    if not source.is_file():
        raise FileNotFoundError(f"Missing Council Member DCC: {source}")
    header = source.read_bytes()[:4]
    if len(header) != 4 or header[0] != 0x74 or header[2] != DIRECTIONS or header[3] != count:
        raise ValueError(f"Unexpected DCC layout for {source.name}: {header.hex()}")

    # This extraction's monster DCCs omit the sanity word expected by the
    # bundled decoder. Repair that field in a temporary copy only.
    temp.mkdir(parents=True, exist_ok=True)
    decoder_source = temp / source.name
    source_data = bytearray(source.read_bytes())
    if struct.unpack_from("<I", source_data, 7)[0] != 1:
        struct.pack_into("<I", source_data, 7, 1)
    decoder_source.write_bytes(source_data)
    base = temp / "decoded.png"
    subprocess.run(
        [str(work_dir / CONVERTER), "-dcc", str(decoder_source), "-png", str(base)],
        check=True, capture_output=True, text=True,
    )
    channels = [tuple(color[channel] for color in colors) for channel in range(3)]
    alpha = [0] + [255] * 255
    result = []
    for direction in range(DIRECTIONS):
        frames = []
        for frame_index in range(count):
            path = Path(f"{base.with_suffix('')}_d{direction}_f{frame_index}.png")
            if not path.is_file():
                raise RuntimeError(f"DCC converter did not emit {path.name}")
            with Image.open(path) as image:
                gray = image.convert("L")
            rgb = [gray.point(channel) for channel in channels]
            frames.append(Image.merge("RGBA", (*rgb, gray.point(alpha))))
        result.append(frames)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA, help="extracted D2 Data directory")
    parser.add_argument("--work-dir", type=Path, default=Path(r"C:\Users\Saint\Desktop\d2\Work"), help="folder containing the local DCC converter")
    args = parser.parse_args()
    converter = args.work_dir / CONVERTER
    if not converter.is_file():
        raise FileNotFoundError(f"Missing local DCC converter: {converter}")
    colors = palette()

    with tempfile.TemporaryDirectory(prefix=".tmp-council-import-", dir=CLIENT_ROOT) as temp_name:
        temp = Path(temp_name)
        decoded = {}
        width = height = 1
        for state, (suffix, count) in SEQUENCES.items():
            if state in decoded:
                continue
            decoded[state] = decode_sequence(args.data_dir, args.work_dir, temp / state, suffix, count, colors)
            for direction in decoded[state]:
                for frame in direction:
                    width = max(width, frame.width)
                    height = max(height, frame.height)

        sheet = Image.new("RGBA", (COLUMNS * width, 3 * DIRECTIONS * height), (0, 0, 0, 0))
        for state_index, (state, (_, frame_count)) in enumerate(SEQUENCES.items()):
            for direction, frames in enumerate(decoded[state]):
                for column in range(COLUMNS):
                    frame = frames[min(column, frame_count - 1)]
                    x = column * width + (width - frame.width) // 2
                    y = (state_index * DIRECTIONS + direction) * height + height - frame.height
                    sheet.alpha_composite(frame, (x, y))
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(OUTPUT, optimize=True)
        print(f"{OUTPUT.relative_to(ASSET_ROOT)}: {sheet.size}; idle/move/attack rows, 8 directions")


if __name__ == "__main__":
    main()
