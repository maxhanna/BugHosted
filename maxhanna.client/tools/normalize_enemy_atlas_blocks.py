"""Re-scale the non-walk bands of an enemy atlas onto the walk band's scale.

Every enemy atlas is a grid of equal cells, and the renderer divides the whole
sheet by one number: the visible height of the tallest cel in the walk band
(`sprite.contentHeight`). That only works when every cel of the sheet was drawn
at the same source scale.

The idle blocks appended by `add_enemy_idle_blocks.py` were packed per cel with
`fit_into`, which scales each DCC cel to fill its cell, and only the cels taller
than the walk band were then trimmed back. The result is a block whose body is
drawn at a different scale from the walk cycle: Spike Fiends stood noticeably
larger while idle, and the Sand Scarab's idle art filled its cell edge to edge.
The Salamander's attack band came from a collage page captured at a smaller zoom
than its walk band for the same reason.

This tool rewrites the named bands in place:

  * one scale per band, taken from the walk band's median cel height, so frames
    inside a band keep their pose-to-pose size and never jump,
  * every cel planted on the walk band's own foot line and centred on the walk
    band's own centre for that facing, so the body stays put across states,
  * the result clamped inside the cell so no cel is cropped.

Run from the client directory:
  python tools/normalize_enemy_atlas_blocks.py
"""

from __future__ import annotations

import argparse
from pathlib import Path
from statistics import median

from PIL import Image

CLIENT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = CLIENT_ROOT / "src" / "assets" / "d2survivors" / "enemies" / "animated"

# sheet -> (cell width, cell height, rows per block, bands to normalise)
# Band 0 is always walk and is the reference.
ATLASES = {
    "spike-fiend.png": (96, 80, 8, (2,)),
    "scarab.png": (128, 128, 8, (2,)),
    "salamander.png": (128, 128, 8, (1, 2)),
    # The same appended idle block drew these three noticeably larger than
    # their own walk cycles (Leaper x1.45, Sand Maggot Young x1.50, Pain Worm
    # x1.33 by median cel height).
    "leaper.png": (120, 120, 8, (2,)),
    "pain-worm.png": (120, 120, 8, (2,)),
    "sand-maggot-young.png": (128, 128, 8, (2,)),
}


def band_rows(band: int, rows_per_block: int) -> range:
    start = band * rows_per_block
    return range(start, start + rows_per_block)


def row_alpha(sheet: Image.Image, row: int, cell_width: int, cell_height: int) -> Image.Image:
    return sheet.crop((0, row * cell_height, cell_width * (sheet.width // cell_width),
                       (row + 1) * cell_height)).getchannel("A")


def content_box(cel: Image.Image) -> tuple[int, int, int, int] | None:
    return cel.getchannel("A").getbbox()


def row_bbox(sheet: Image.Image, row: int, cell_width: int, cell_height: int) -> tuple[int, int, int, int] | None:
    return row_alpha(sheet, row, cell_width, cell_height).getbbox()


def formatted(values: list[int]) -> str:
    return f"{min(values)}-{max(values)} med {median(values):.0f}" if values else "empty"


def normalise(path: Path, cell_width: int, cell_height: int, rows_per_block: int,
              bands: tuple[int, ...]) -> str:
    sheet = Image.open(path).convert("RGBA")
    columns = sheet.width // cell_width
    blocks = sheet.height // (rows_per_block * cell_height)

    # Reference geometry: the walk band's per-facing foot line and centre, plus
    # the median cel height that sets the whole sheet's on-screen scale.
    reference: dict[int, tuple[float, float]] = {}
    reference_heights: list[int] = []
    for direction in range(rows_per_block):
        box = row_bbox(sheet, direction, cell_width, cell_height)
        if box is None:
            continue
        reference[direction] = ((box[0] + box[2]) / 2, box[3])
        for column in range(columns):
            cel_box = content_box(sheet.crop((
                column * cell_width, direction * cell_height,
                (column + 1) * cell_width, (direction + 1) * cell_height)))
            if cel_box:
                reference_heights.append(cel_box[3] - cel_box[1])
    reference_height = median(reference_heights)

    notes: list[str] = []
    for band in bands:
        if band >= blocks:
            notes.append(f"band {band} missing (sheet has {blocks})")
            continue
        heights: list[int] = []
        art: dict[tuple[int, int], Image.Image] = {}
        for row in band_rows(band, rows_per_block):
            direction = row % rows_per_block
            for column in range(columns):
                cel_box = content_box(sheet.crop((
                    column * cell_width, row * cell_height,
                    (column + 1) * cell_width, (row + 1) * cell_height)))
                if not cel_box:
                    continue
                art[(row, column)] = sheet.crop((
                    column * cell_width + cel_box[0], row * cell_height + cel_box[1],
                    column * cell_width + cel_box[2], row * cell_height + cel_box[3]))
                heights.append(cel_box[3] - cel_box[1])
        if not heights:
            notes.append(f"band {band} empty")
            continue

        scale = reference_height / median(heights)
        for row in band_rows(band, rows_per_block):
            sheet.paste((0, 0, 0, 0), (0, row * cell_height, sheet.width, (row + 1) * cell_height))

        tallest = 0
        for (row, column), cel in art.items():
            direction = row % rows_per_block
            centre_x, foot = reference.get(direction, (cell_width / 2, cell_height - 2))
            placed = cel.resize(
                (max(1, round(cel.width * scale)), max(1, round(cel.height * scale))),
                Image.LANCZOS,
            )
            # A cel that no longer fits its cell is trimmed again rather than cropped.
            if placed.width > cell_width - 2 or placed.height > cell_height - 2:
                fit = min((cell_width - 2) / placed.width, (cell_height - 2) / placed.height)
                placed = placed.resize(
                    (max(1, round(placed.width * fit)), max(1, round(placed.height * fit))),
                    Image.LANCZOS,
                )
            left = round(centre_x - placed.width / 2)
            top = round(foot - placed.height)
            left = max(0, min(cell_width - placed.width, left))
            top = max(0, min(cell_height - placed.height, top))
            sheet.alpha_composite(placed, (column * cell_width + left, row * cell_height + top))
            tallest = max(tallest, placed.height)
        notes.append(f"band {band} scaled x{scale:.2f} ({median(heights):.0f} -> {reference_height:.0f} med)")

    sheet.save(path, optimize=True)
    return f"{path.name:20s} {sheet.width}x{sheet.height}: " + "; ".join(notes)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", nargs="*", default=None, help="atlas file names to rewrite")
    args = parser.parse_args(argv)
    wanted = sorted(ATLASES) if not args.only else [name for name in args.only if name in ATLASES]
    if not wanted:
        raise SystemExit("No atlas selected")
    for name in wanted:
        path = ASSET_ROOT / name
        if not path.is_file():
            print(f"skip {name}: missing")
            continue
        cell_width, cell_height, rows_per_block, bands = ATLASES[name]
        print(normalise(path, cell_width, cell_height, rows_per_block, bands))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(__import__("sys").argv[1:]))
