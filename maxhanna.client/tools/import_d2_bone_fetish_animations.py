"""Derive the Bone Fetish sheet from the imported Fetish animation atlas.

Run from any directory with Python/Pillow installed:
  python tools/import_d2_bone_fetish_animations.py

The Bone Fetish is Diablo II's undead Fetish: the same model and animations as
the living Fetish, distinguished by a palette swap. `tools/import_d2_fetish_animations.py`
needs the approximate monster palette that no longer ships with the project, so
instead of decoding the DCCs again this remaps the already imported fetish
atlas by luminance onto a bone ramp. Luminance is lifted with a gamma curve
first, because the source art is almost black and a straight brightness
multiply would leave the body in shadow instead of reading as sun-bleached bone.

The resulting atlas keeps the fetish layout exactly: 13 frame columns and 24
rows of 8 directions in neutral / walk / attack blocks, at 91x101 cels.
"""

import argparse
from pathlib import Path

from PIL import Image

CLIENT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_ROOT = CLIENT_ROOT / "src" / "assets" / "d2survivors" / "enemies" / "animated"
SOURCE = "fetish.png"
TARGET = "bone-fetish.png"
COLUMNS = 13
ROWS = 24

# Bone ramp: cool shadow, dusty mid grey-brown, bleached highlights.
RAMP = [(0, (30, 28, 26)), (96, (118, 111, 96)), (176, (201, 191, 166)), (255, (246, 240, 222))]
LIFT_GAMMA = 0.6


def ramp_lut(channel: int) -> list[int]:
    lut: list[int] = []
    for value in range(256):
        lifted = 255.0 * ((value / 255.0) ** LIFT_GAMMA)
        colour = RAMP[-1][1][channel]
        for index in range(len(RAMP) - 1):
            low, low_colour = RAMP[index]
            high, high_colour = RAMP[index + 1]
            if lifted <= high or index == len(RAMP) - 2:
                span = high - low
                factor = 0.0 if span <= 0 else max(0.0, min(1.0, (lifted - low) / span))
                colour = low_colour[channel] + (high_colour[channel] - low_colour[channel]) * factor
                break
        lut.append(round(colour))
    return lut


def build() -> None:
    source_path = OUTPUT_ROOT / SOURCE
    if not source_path.is_file():
        raise FileNotFoundError(f"Missing source atlas: {source_path}")
    with Image.open(source_path) as source:
        sheet = source.convert("RGBA")
    if sheet.width % COLUMNS or sheet.height % ROWS:
        raise ValueError(f"{SOURCE} is not a {COLUMNS}x{ROWS} atlas: {sheet.size}")

    luma = sheet.convert("L")
    channels = [luma.point(ramp_lut(index)) for index in range(3)]
    bone = Image.merge("RGB", channels).convert("RGBA")
    bone.putalpha(sheet.getchannel("A"))

    output = OUTPUT_ROOT / TARGET
    bone.save(output, optimize=True)
    print(f"{output.relative_to(CLIENT_ROOT)}: {bone.size}; {COLUMNS} columns x {ROWS} rows")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    build()


if __name__ == "__main__":
    main()
