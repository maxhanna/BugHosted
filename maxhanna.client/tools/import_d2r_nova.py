"""Bake the original Nova missile art into an animated electric ring.

Nova fires 64 `electricnova.dcc` missiles radially out of the caster.  The
runtime used to stamp one imported direction tangentially around the circle,
which read as a static necklace of blue flames instead of Diablo II's
crackling electric ring.

This importer stamps all 64 missiles of the animation around one circle for
six different animation phases, using each authored direction cell in its
outward orientation, and recolours the palette to the skill's electric
blue-white.  The result is a horizontal strip the runtime expands from the
caster to the field radius while the lightning flickers.

Usage:
    python tools/import_d2r_nova.py
    python tools/import_d2r_nova.py --source "C:/path/to/d2r extract/data"
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

from PIL import Image, ImageFilter

import d2r_dcc as dcc

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "effects" / "nova-ring.png"
METADATA = PROJECT_ROOT / "src" / "app" / "d2survivors" / "d2-nova-ring.generated.ts"
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"

SOURCE_DCC = ("global", "missiles", "electricnova.dcc")
PALETTE_PATH = ("global", "palette", "units", "pal.dat")
CELL_SIZE = 512
RING_RADIUS = 200
MISSILE_COUNT = 64
RING_FRAMES = 6
FRAME_RATE = 26
# Each bolt spans this many times the gap between neighbours, closing the
# sparse cels into one continuous crackling band.
BOLT_SCALE = 3.2

ELECTRIC_RAMP = (
    (0.00, (16, 40, 112)),
    (0.30, (38, 104, 220)),
    (0.55, (86, 176, 255)),
    (0.80, (188, 234, 255)),
    (1.00, (255, 255, 255)),
)


def sample_ramp(value: float) -> tuple[int, int, int]:
    value = min(1.0, max(0.0, value))
    for index in range(len(ELECTRIC_RAMP) - 1):
        start_at, start_color = ELECTRIC_RAMP[index]
        end_at, end_color = ELECTRIC_RAMP[index + 1]
        if value <= end_at:
            span = end_at - start_at
            mix = 0.0 if span <= 0 else (value - start_at) / span
            return tuple(
                round(start_color[channel] + (end_color[channel] - start_color[channel]) * mix)
                for channel in range(3)
            )  # type: ignore[return-value]
    return ELECTRIC_RAMP[-1][1]


def colourise(cell: Image.Image) -> Image.Image:
    """Map the DCC's dark cobalt palette onto the electric blue-white ramp."""
    source = cell.load()
    output = Image.new("RGBA", cell.size, (0, 0, 0, 0))
    target = output.load()
    for y in range(cell.height):
        for x in range(cell.width):
            red, green, blue, alpha = source[x, y]
            if alpha == 0:
                continue
            luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
            # Keep the bolt core white, but pull the soft navy halo down so
            # the ring reads as lightning rather than a band of blue clouds.
            lift = luminance ** 0.5
            frost = sample_ramp(lift)
            target[x, y] = (*frost, round(alpha * (0.30 + 0.70 * lift)))
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


def build_ring(source: Path, phase: int) -> Image.Image:
    cells, directions, frame_count, origin_x, origin_y = load_direction_cells(source)
    cell_width = max(cell.width for frames in cells for cell in frames)
    cell_height = max(cell.height for frames in cells for cell in frames)

    ring = Image.new("RGBA", (CELL_SIZE, CELL_SIZE), (0, 0, 0, 0))
    cell_scale = (math.pi * 2 * RING_RADIUS / MISSILE_COUNT) * BOLT_SCALE / cell_width
    draw_width = max(1, round(cell_width * cell_scale))
    draw_height = max(1, round(cell_height * cell_scale))
    offset_x = -origin_x * cell_scale
    offset_y = -origin_y * cell_scale

    for index in range(MISSILE_COUNT):
        angle = index * math.pi * 2 / MISSILE_COUNT
        direction = ((round((angle + math.pi) / (math.pi / 8)) % directions) + directions) % directions
        # Vary the cel per bolt and per phase so successive frames crackle
        # instead of repeating one frozen lightning shape.
        frame_index = min(frame_count - 1, 4 + (index * 5 + phase * 3) % 8)
        cell = cells[direction][frame_index].resize(
            (draw_width, draw_height), Image.Resampling.LANCZOS
        )
        left = round(CELL_SIZE / 2 + math.cos(angle) * RING_RADIUS + offset_x)
        top = round(CELL_SIZE / 2 + math.sin(angle) * RING_RADIUS + offset_y)
        ring.alpha_composite(cell, (left, top))

    bloom = ring.filter(ImageFilter.GaussianBlur(14))
    bloom_pixels = bloom.load()
    for y in range(bloom.height):
        for x in range(bloom.width):
            red, green, blue, alpha = bloom_pixels[x, y]
            bloom_pixels[x, y] = (red, green, blue, round(alpha * 0.7))
    bloom.alpha_composite(ring)
    return bloom


def write_metadata(path: str, cell: int, frames: int, frame_rate: int) -> None:
    lines = [
        "/* Generated by tools/import_d2r_nova.py. Do not edit by hand. */",
        "",
        "export interface NovaRingArt {",
        "  path: string;",
        "  cell: number;",
        "  frames: number;",
        "  frameRate: number;",
        "}",
        "",
        "export const NOVA_RING_ART: NovaRingArt = {",
        f'  path: "{path}",',
        f"  cell: {cell},",
        f"  frames: {frames},",
        f"  frameRate: {frame_rate},",
        "};",
        "",
    ]
    METADATA.write_text("\n".join(lines), encoding="utf-8")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    args = parser.parse_args(argv)

    sheet = Image.new("RGBA", (CELL_SIZE * RING_FRAMES, CELL_SIZE), (0, 0, 0, 0))
    for phase in range(RING_FRAMES):
        sheet.alpha_composite(build_ring(args.source, phase), (phase * CELL_SIZE, 0))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUTPUT, "PNG", optimize=True)
    write_metadata("assets/d2survivors/effects/nova-ring.png", CELL_SIZE, RING_FRAMES, FRAME_RATE)
    print(f"nova ring  {RING_FRAMES} frames  {sheet.width}x{sheet.height}  {OUTPUT.stat().st_size:,} bytes")
    print(f"wrote {OUTPUT.relative_to(PROJECT_ROOT)}")
    print(f"wrote {METADATA.relative_to(PROJECT_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
