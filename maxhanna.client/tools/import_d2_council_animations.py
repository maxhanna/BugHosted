"""Build the Council Member atlas from the D2R monster DCCs.

Run from the client directory:
  python tools/import_d2_council_animations.py

D2's Act III Council are Zakarum Priest Advocates (monster code HP). Their DCC
set holds a neutral clip (NU, seven frames per direction), a walk (WL, eleven)
and an attack (A1, ten), eight directions each - the exact counts the renderer
indexes for the three bands of this sheet.

The previous import sent the art through an external converter that emitted it at
roughly 0.71x, and painted the neutral pose into the locomotion band. The runtime
divides every cel by its own content height and rescales it to the Council's
drawn height, so that smaller art was magnified about 1.5x on screen, which read
as stretched and soft sprites; and because the walk band was the idle clip,
Council Members slid while approaching. This decodes the clips with
tools/d2r_dcc.py at their native resolution instead, so every cel is drawn at
very nearly 1:1, and each band is the clip it names.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

import d2r_dcc

CLIENT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = CLIENT_ROOT / "src" / "assets" / "d2survivors"
OUTPUT = ASSET_ROOT / "enemies" / "animated" / "council.png"
PALETTE_PATH = ("global", "palette", "units", "pal.dat")
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"
MONSTER_DIR = Path("global") / "monsters" / "hp" / "tr"
# state in the atlas -> file suffix of `hptrlit<suffix>.dcc`
SEQUENCES = (("idle", "nuhth"), ("move", "wlhth"), ("attack", "a1hth"))
DIRECTIONS = 8
COLUMNS = 20


def palette(source: Path) -> list[tuple[int, int, int]]:
    """`units/pal.dat` stores BGR triples, so the channels are swapped here."""
    path = source.joinpath(*PALETTE_PATH)
    if not path.is_file():
        raise FileNotFoundError(f"Missing unit palette: {path}")
    return [(red, green, blue) for blue, green, red in d2r_dcc.load_palette(path)]


def decode_clip(source: Path, suffix: str,
                colors: list[tuple[int, int, int]]) -> list[list[Image.Image]]:
    path = source / MONSTER_DIR / f"hptrlit{suffix}.dcc"
    if not path.is_file():
        raise FileNotFoundError(f"Missing Council Member clip: {path}")
    animation = d2r_dcc.parse(path.read_bytes())
    if len(animation["dirs"]) != DIRECTIONS:
        raise ValueError(f"{path.name} has {len(animation['dirs'])} directions, expected {DIRECTIONS}")
    return [[d2r_dcc.frame_image(bitmap, frame["width"], frame["height"], colors)
             for frame, bitmap in zip(entry["frames"], entry["bitmaps"])]
            for entry in animation["dirs"]]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE,
                        help="extracted D2R data directory")
    args = parser.parse_args()

    colors = palette(args.source)
    clips = {state: decode_clip(args.source, suffix, colors) for state, suffix in SEQUENCES}
    width = max(frame.width for clip in clips.values() for direction in clip for frame in direction)
    height = max(frame.height for clip in clips.values() for direction in clip for frame in direction)

    sheet = Image.new("RGBA", (COLUMNS * width, len(SEQUENCES) * DIRECTIONS * height), (0, 0, 0, 0))
    for state_index, (state, _) in enumerate(SEQUENCES):
        for direction, frames in enumerate(clips[state]):
            for column in range(COLUMNS):
                # The sheet is wider than the clips so the runtime can address a
                # fixed column count; hold the last cel past the clip's end.
                frame = frames[min(column, len(frames) - 1)]
                x = column * width + (width - frame.width) // 2
                y = (state_index * DIRECTIONS + direction) * height + height - frame.height
                sheet.alpha_composite(frame, (x, y))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUTPUT, optimize=True)
    counts = ", ".join(f"{state} {len(clips[state][0])}" for state, _ in SEQUENCES)
    print(f"{OUTPUT.relative_to(CLIENT_ROOT)}: {sheet.size} cell {width}x{height}; {counts} frames")
    return 0


if __name__ == "__main__":
    sys.exit(main())
