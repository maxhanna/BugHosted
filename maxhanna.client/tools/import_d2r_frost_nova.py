"""Bake the original Frost Nova missile art into the expanding ice ring.

Diablo II's Frost Nova skill function releases 64 missiles around the caster.
Each missile uses one of the sixteen authored `frostnova.dcc` directions, and
the missiles together draw the expanding circle.  The raw cells are soft, dark
navy clouds, so stamping a handful of them at runtime reads as a chain of
blobs rather than the game's continuous frosty ring.

This importer reproduces the engine's placement offline: it stamps all 64
missiles of a mid-animation frame around one circle, recolours the DCC palette
to the skill's icy blue-white ramp, adds a soft bloom, and writes a single ring
texture.  The runtime then only scales that ring from the caster out to the
field radius, which keeps the authored frost detail crisp and continuous.

Usage:
    python tools/import_d2r_frost_nova.py
    python tools/import_d2r_frost_nova.py --source "C:/path/to/d2r extract/data"
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

from PIL import Image, ImageFilter

import d2r_dcc as dcc

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "effects" / "frost-nova-ring.png"
METADATA = PROJECT_ROOT / "src" / "app" / "d2survivors" / "d2-frost-nova.generated.ts"
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"

SOURCE_DCC = ("global", "missiles", "frostnova.dcc")
PALETTE_PATH = ("global", "palette", "units", "pal.dat")
FRAME_RATE = 16
FRAME_COUNT = 14
MISSILE_COUNT = 64
RING_SIZE = 1024
RING_RADIUS = 430
# Each missile sprite spans this many times the gap between neighbours; the
# overlap closes the ring into one continuous sheet of frost.
PUFF_SCALE = 3.6

# The skill's ice ramp: deep cobalt in the soft cloud body, pale cyan through
# the frosted core, white in the sparkles.
ICE_RAMP = (
    (0.00, (38, 82, 156)),
    (0.35, (88, 154, 220)),
    (0.62, (150, 205, 246)),
    (0.82, (212, 238, 255)),
    (1.00, (255, 255, 255)),
)


def sample_ramp(value: float) -> tuple[int, int, int]:
    value = min(1.0, max(0.0, value))
    for index in range(len(ICE_RAMP) - 1):
        start_at, start_color = ICE_RAMP[index]
        end_at, end_color = ICE_RAMP[index + 1]
        if value <= end_at:
            span = end_at - start_at
            mix = 0.0 if span <= 0 else (value - start_at) / span
            return tuple(
                round(start_color[channel] + (end_color[channel] - start_color[channel]) * mix)
                for channel in range(3)
            )  # type: ignore[return-value]
    return ICE_RAMP[-1][1]


def colourise(cell: Image.Image) -> Image.Image:
    """Map a DCC cell's dark navy palette onto the frosty blue ramp."""
    source = cell.load()
    output = Image.new("RGBA", cell.size, (0, 0, 0, 0))
    target = output.load()
    for y in range(cell.height):
        for x in range(cell.width):
            red, green, blue, alpha = source[x, y]
            if alpha == 0:
                continue
            luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
            # The cloud body is nearly black; lift it into the blue range
            # while letting the bright core and sparkles stay white.
            frost = sample_ramp(luminance ** 0.55)
            target[x, y] = (*frost, alpha)
    return output


def load_direction_cells(source: Path) -> tuple[list[list[Image.Image]], int, int, int, int]:
    path = source.joinpath(*SOURCE_DCC)
    animation = dcc.parse(path.read_bytes())
    directions = animation["dirs"]
    if not directions:
        raise RuntimeError(f"{path} has no directions")
    frame_count = len(directions[0]["frames"])
    if any(len(direction["frames"]) != frame_count for direction in directions):
        raise RuntimeError(f"{path} directions do not share one frame count")

    xmin = min(direction["box"][0] for direction in directions)
    ymin = min(direction["box"][1] for direction in directions)
    palette = [
        (red, green, blue) for blue, green, red in dcc.load_palette(source.joinpath(*PALETTE_PATH))
    ]
    cells: list[list[Image.Image]] = []
    for direction in directions:
        frames: list[Image.Image] = []
        for frame_index, frame in enumerate(direction["frames"]):
            cells_width = max(
                direction["box"][0] + direction["box"][2],
                frame["xmin"] + frame["width"],
            ) - xmin
            cells_height = max(
                direction["box"][1] + direction["box"][3],
                frame["ymin"] + frame["height"],
            ) - ymin
            canvas = Image.new("RGBA", (cells_width, cells_height), (0, 0, 0, 0))
            canvas.alpha_composite(
                dcc.frame_image(
                    direction["bitmaps"][frame_index],
                    frame["width"],
                    frame["height"],
                    palette,
                ),
                (frame["xmin"] - xmin, frame["ymin"] - ymin),
            )
            frames.append(colourise(canvas))
        cells.append(frames)
    return cells, len(directions), frame_count, -xmin, -ymin


def build_ring(source: Path) -> Image.Image:
    cells, directions, frame_count, origin_x, origin_y = load_direction_cells(source)
    cell_width = max(cell.width for frames in cells for cell in frames)
    cell_height = max(cell.height for frames in cells for cell in frames)

    ring = Image.new("RGBA", (RING_SIZE, RING_SIZE), (0, 0, 0, 0))
    cell_scale = (math.pi * 2 * RING_RADIUS / MISSILE_COUNT) * PUFF_SCALE / cell_width
    draw_width = max(1, round(cell_width * cell_scale))
    draw_height = max(1, round(cell_height * cell_scale))
    offset_x = -origin_x * cell_scale
    offset_y = -origin_y * cell_scale

    for index in range(MISSILE_COUNT):
        angle = index * math.pi * 2 / MISSILE_COUNT
        direction = ((round((angle + math.pi) / (math.pi / 8)) % directions) + directions) % directions
        # Cycle through neighbouring frames so the ring does not repeat the
        # exact same cloud silhouette sixteen times.
        frame_index = min(frame_count - 1, 8 + index % 3)
        cell = cells[direction][frame_index].resize(
            (draw_width, draw_height), Image.Resampling.LANCZOS
        )
        left = round(RING_SIZE / 2 + math.cos(angle) * RING_RADIUS + offset_x)
        top = round(RING_SIZE / 2 + math.sin(angle) * RING_RADIUS + offset_y)
        ring.alpha_composite(cell, (left, top))

    # A soft bloom sells the magical light without needing additive blending
    # at runtime.
    bloom = ring.filter(ImageFilter.GaussianBlur(26))
    bloom_pixels = bloom.load()
    for y in range(bloom.height):
        for x in range(bloom.width):
            red, green, blue, alpha = bloom_pixels[x, y]
            bloom_pixels[x, y] = (red, green, blue, round(alpha * 0.55))
    bloom.alpha_composite(ring)
    return bloom


def write_metadata(path: str, size: int, duration: float) -> None:
    lines = [
        "/* Generated by tools/import_d2r_frost_nova.py. Do not edit by hand. */",
        "",
        "export interface FrostNovaArt {",
        "  path: string;",
        "  size: number;",
        "  duration: number;",
        "}",
        "",
        "export const FROST_NOVA_ART: FrostNovaArt = {",
        f'  path: "{path}",',
        f"  size: {size},",
        f"  duration: {duration},",
        "};",
        "",
    ]
    METADATA.write_text("\n".join(lines), encoding="utf-8")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    args = parser.parse_args(argv)

    ring = build_ring(args.source)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    ring.save(OUTPUT, "PNG", optimize=True)
    duration = FRAME_COUNT / FRAME_RATE
    write_metadata("assets/d2survivors/effects/frost-nova-ring.png", RING_SIZE, duration)
    print(f"frost-nova ring  {MISSILE_COUNT} missiles  {RING_SIZE}x{RING_SIZE}  {OUTPUT.stat().st_size:,} bytes")
    print(f"wrote {OUTPUT.relative_to(PROJECT_ROOT)}")
    print(f"wrote {METADATA.relative_to(PROJECT_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
