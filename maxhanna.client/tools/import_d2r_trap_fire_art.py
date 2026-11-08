"""Import the authentic Diablo II trap and fireball art used by the Assassin.

The generic missile importer decodes `units/pal.dat` as RGB, but Diablo II
stores that palette as BGR, so every fire missile it imported came out blue.
This importer converts the palette before decoding the three cels the wake
traps need:

    data/global/missiles/fireball.dcc                   -> d2-fireball
    data/global/missiles/expansion/firespikesground.dcc -> d2-firespikesground
    data/global/missiles/groundfiresmall.dcc            -> d2-groundfiresmall

`FireSpikesGround` is the sentry trap resting on the floor (the missile tables
call it `sentryspikeonground`), `GroundFireSmall` is the fire the wake leaves
behind, and `fireball` is the projectile the Wake of Fire trap fans out.

Output matches the rest of `assets/d2survivors/missiles`: one lossless webp per
frame under `d2-<stem>/`, so the existing generated frame counts stay valid.

Usage:
    python tools/import_d2r_trap_fire_art.py
    python tools/import_d2r_trap_fire_art.py --source "C:/path/to/d2r extract/data"
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

import d2r_dcc as dcc

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "missiles"
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"

# `units/pal.dat` is shared by monsters and missiles. Blizzard stores it BGR.
PALETTE_PATH = ("global", "palette", "units", "pal.dat")
MAX_FRAME_SIZE = 160

# DCC path (relative to `data/`) -> exported runtime id.
SOURCES = {
    ("global", "missiles", "fireball.dcc"): "d2-fireball",
    ("global", "missiles", "expansion", "firespikesground.dcc"): "d2-firespikesground",
    ("global", "missiles", "groundfiresmall.dcc"): "d2-groundfiresmall",
}


def prepare_frames(images: list[Image.Image]) -> list[Image.Image]:
    """Crop an animation to shared bounds, centre it and scale it down."""
    bounds = [image.getchannel("A").getbbox() for image in images]
    visible = [box for box in bounds if box]
    if not visible:
        raise RuntimeError("animation has no visible pixels")
    left = max(0, min(box[0] for box in visible) - 2)
    top = max(0, min(box[1] for box in visible) - 2)
    right = min(images[0].width, max(box[2] for box in visible) + 2)
    bottom = min(images[0].height, max(box[3] for box in visible) + 2)
    cropped = [image.crop((left, top, right, bottom)) for image in images]
    width = max(image.width for image in cropped)
    height = max(image.height for image in cropped)
    centred: list[Image.Image] = []
    for image in cropped:
        canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        canvas.alpha_composite(image, ((width - image.width) // 2, (height - image.height) // 2))
        centred.append(canvas)
    largest = max(width, height)
    if largest > MAX_FRAME_SIZE:
        scale = MAX_FRAME_SIZE / largest
        centred = [
            image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))),
                         Image.LANCZOS)
            for image in centred
        ]
    return centred


def import_animation(source: Path, relative: tuple[str, ...], name: str) -> tuple[int, int, int]:
    animation = dcc.parse(source.joinpath(*relative).read_bytes())
    if not animation["dirs"] or not animation["frames_per_dir"]:
        raise RuntimeError("animation has no frames")
    direction = animation["dirs"][0]
    xmin, ymin, _, _ = direction["box"]
    palette = [(red, green, blue) for blue, green, red in dcc.load_palette(source.joinpath(*PALETTE_PATH))]

    frames: list[Image.Image] = []
    for index, frame in enumerate(direction["frames"]):
        canvas = Image.new("RGBA", (direction["box"][2], direction["box"][3]), (0, 0, 0, 0))
        canvas.alpha_composite(
            dcc.frame_image(direction["bitmaps"][index], frame["width"], frame["height"], palette),
            (frame["xmin"] - xmin, frame["ymin"] - ymin),
        )
        # Keep only this cel inside the shared direction box so offsets hold.
        mask = Image.new("L", canvas.size, 0)
        mask.paste(255, (frame["xmin"] - xmin, frame["ymin"] - ymin,
                         frame["xmin"] - xmin + frame["width"], frame["ymin"] - ymin + frame["height"]))
        canvas.putalpha(Image.composite(canvas.getchannel("A"), Image.new("L", canvas.size, 0), mask))
        frames.append(canvas)

    prepared = prepare_frames(frames)
    output = ASSET_ROOT / name
    output.mkdir(parents=True, exist_ok=True)
    for stale in output.glob("*.webp"):
        stale.unlink()
    for index, image in enumerate(prepared):
        image.save(output / f"{index:04d}.webp", "WEBP", lossless=True, method=6)
    return len(prepared), prepared[0].width, prepared[0].height


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    args = parser.parse_args(argv)

    failures = 0
    for relative, name in SOURCES.items():
        try:
            frames, width, height = import_animation(args.source, relative, name)
        except Exception as error:  # noqa: BLE001 - report and keep importing
            failures += 1
            print(f"skip {name}: {error}")
            continue
        print(f"{name:24s} {frames:3d} frames  {width}x{height}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
