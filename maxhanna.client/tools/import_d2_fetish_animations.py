"""Import the user's extracted Fetish DCC sequences as 8-direction state atlases.

Run from any directory with Python/Pillow installed:
  python tools/import_d2_fetish_animations.py
  python tools/import_d2_fetish_animations.py --work-dir 'C:/Users/Saint/Desktop/d2/Work'

Each output has 13 frame columns and 24 rows: neutral, walk, and attack,
with eight DCC directions in each state block. Shorter sequences hold their
last frame in the unused atlas columns. The extraction contains no
identified base monster palette, so the game's documented approximate palette
is applied; temporary decoded frames stay in a disposable project-local folder.
"""

import argparse
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

CLIENT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = CLIENT_ROOT / "src" / "assets" / "d2survivors"
OUTPUT_ROOT = ASSET_ROOT / "enemies" / "animated"
DEFAULT_WORK = Path(r"C:\Users\Saint\Desktop\d2\Work")
CONVERTER_NAME = Path("maxhanna.client") / "dcc-converter-bin" / "dcc-convert.exe"
SEQUENCES = {
    "fetish": {"idle": ("test-F@NU.dcc", 12), "move": ("test-F@WL.dcc", 12), "attack": ("test-F@A1.dcc", 13)},
    "fetish-shaman": {"idle": ("test-!SNU.dcc", 12), "move": ("test-!SWL.dcc", 8), "attack": ("test-!SA1.dcc", 13)},
}
DIRECTIONS = 8
COLUMNS = 13


def read_approx_palette() -> list[tuple[int, int, int]]:
    data = (ASSET_ROOT / "monster-palette-approx.dat").read_bytes()
    if len(data) != 256 * 3:
        raise ValueError("Expected the existing 256-entry BGR monster palette")
    return [(data[i + 2], data[i + 1], data[i]) for i in range(0, len(data), 3)]


def decode_sequence(work: Path, temp: Path, name: str, expected_frames: int, palette: list[tuple[int, int, int]]):
    source = work / name
    if not source.is_file():
        raise FileNotFoundError(f"Missing supplied DCC sequence: {source}")
    header = source.read_bytes()[:4]
    if len(header) != 4 or header[0] != 0x74 or header[2] != DIRECTIONS or header[3] != expected_frames:
        raise ValueError(f"Unexpected DCC layout for {source.name}: {header.hex()}")

    output_base = temp / f"{source.stem}.png"
    result = subprocess.run(
        [str(work / CONVERTER_NAME), "-dcc", str(source), "-png", str(output_base)],
        check=True, capture_output=True, text=True,
    )
    if result.stdout.strip():
        print(result.stdout.strip())

    base = output_base.with_suffix("")
    palette_channels = [tuple(color[channel] for color in palette) for channel in range(3)]
    alpha_lut = [0] + [255] * 255
    directions: list[list[Image.Image]] = []
    for direction in range(DIRECTIONS):
        frames = []
        for frame in range(expected_frames):
            path = Path(f"{base}_d{direction}_f{frame}.png")
            if not path.is_file():
                raise RuntimeError(f"DCC converter did not emit {path.name}")
            with Image.open(path) as decoded_frame:
                gray = decoded_frame.convert("L")
            channels = [gray.point(palette_channels[index]) for index in range(3)]
            alpha = gray.point(alpha_lut)
            frames.append(Image.merge("RGBA", (*channels, alpha)))
        directions.append(frames)
    return directions


def build_sheet(work: Path, species: str, states, palette) -> None:
    with tempfile.TemporaryDirectory(prefix=".tmp-fetish-import-", dir=CLIENT_ROOT) as temp_name:
        temp = Path(temp_name)
        decoded = {}
        max_width = max_height = 1
        for state, (source_name, frame_count) in states.items():
            sequence = decode_sequence(work, temp, source_name, frame_count, palette)
            decoded[state] = sequence
            for direction in sequence:
                for frame in direction:
                    max_width = max(max_width, frame.width)
                    max_height = max(max_height, frame.height)

        sheet = Image.new("RGBA", (COLUMNS * max_width, 3 * DIRECTIONS * max_height), (0, 0, 0, 0))
        for state_index, (state, _) in enumerate(states.items()):
            for direction, frames in enumerate(decoded[state]):
                for column in range(COLUMNS):
                    # Keep each DCC animation at its own full length. The atlas
                    # has 13 slots, but shorter sequences repeat their last cel.
                    frame = frames[min(column, len(frames) - 1)]
                    x = column * max_width + (max_width - frame.width) // 2
                    y = (state_index * DIRECTIONS + direction) * max_height + max_height - frame.height
                    sheet.alpha_composite(frame, (x, y))
        OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
        output = OUTPUT_ROOT / f"{species}.png"
        sheet.save(output, optimize=True)
        print(f"{output.relative_to(ASSET_ROOT)}: {sheet.size}; idle/move/attack x {DIRECTIONS} directions x {COLUMNS} frames")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work-dir", type=Path, default=DEFAULT_WORK, help="folder containing the extracted DCC samples and converter")
    args = parser.parse_args()
    converter = args.work_dir / CONVERTER_NAME
    if not converter.is_file():
        raise FileNotFoundError(f"Missing local DCC converter: {converter}")
    palette = read_approx_palette()
    for species, states in SEQUENCES.items():
        build_sheet(args.work_dir, species, states, palette)


if __name__ == "__main__":
    main()
