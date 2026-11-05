"""Build the Sand Maggot Young enemy atlas from the ripped Diablo II page.

The page ("... - Sand Maggot Young.gif") is a flat grey matte with its clips
stacked in labelled blocks:

  Attack 1   18 frames per direction, 8 directions
  Death      (unused)
  Special 1  burrow emergence (unused)
  Attack 2   10 frames per direction, 8 directions
  Get Hit    (unused)

This rip has no walk clip, so the atlas is built from the two full-body
cycles it does carry: rows 0-7 use Attack 2, whose whole-body scrabble reads as
the young crawling, and rows 8-15 use Attack 1 as the bite. That is the layout
`enemySpriteRow` / `drawEnemy` already expect for eight-direction species.

    python tools/import_d2_sand_maggot_young_animations.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

PAGE = Path(
    r"C:\Users\Saint\Desktop\d2\d2 enemies"
    r"\PC _ Computer - Diablo 2 _ Diablo 2_ Lord of Destruction"
    r" - Enemies & Bosses - Sand Maggot Young.gif"
)
OUT = (
    Path(__file__).resolve().parent.parent
    / "src/assets/d2survivors/enemies/animated/sand-maggot-young.png"
)
PROBE = Path(__file__).resolve().parent.parent / "probe"

MATTE = 170  # the page's flat grey backdrop
CELL = 128
COLUMNS = 18  # the bite band is the longest, so it sets the atlas width
WALK_FRAMES = 10
ATTACK_FRAMES = 18
WALK_BLOCK = (10, 1272, 1738, 2427)  # "Attack 2", lower left of the page
ATTACK_BLOCK = (0, 2250, 18, 678)  # the "Attack 1" band at the top


def keyed(page: Image.Image) -> Image.Image:
    """Cut the flat matte out and un-blend the anti-aliased edge pixels."""
    rgb = page.convert("RGB")
    out = Image.new("RGBA", rgb.size)
    src = rgb.load()
    dst = out.load()
    width, height = rgb.size
    for y in range(height):
        for x in range(width):
            r, g, b = src[x, y]
            distance = max(abs(r - MATTE), abs(g - MATTE), abs(b - MATTE))
            if distance <= 4:
                continue
            alpha = min(255, (distance - 4) * 26)
            if alpha >= 255:
                dst[x, y] = (r, g, b, 255)
                continue
            # Edge pixels are a blend of sprite and matte: undo the blend so the
            # sprite keeps its own colour instead of a grey fringe.
            share = alpha / 255
            dst[x, y] = (
                max(0, min(255, round((r - MATTE * (1 - share)) / share))),
                max(0, min(255, round((g - MATTE * (1 - share)) / share))),
                max(0, min(255, round((b - MATTE * (1 - share)) / share))),
                alpha,
            )
    return out


def ink_columns(art: Image.Image, top: int, bottom: int, left: int, right: int) -> list[int]:
    alpha = art.load()
    columns = [0] * (right - left)
    for y in range(top, bottom):
        for x in range(left, right):
            if alpha[x, y][3] > 40:
                columns[x - left] += 1
    return columns


def row_bands(art: Image.Image, block: tuple[int, int, int, int]) -> list[tuple[int, int]]:
    left, right, top, bottom = block
    alpha = art.load()
    bands: list[tuple[int, int]] = []
    current: list[int] | None = None
    for y in range(top, bottom):
        hits = sum(1 for x in range(left, right, 3) if alpha[x, y][3] > 40)
        if hits > 3:
            current = [y, y] if current is None else [current[0], y]
        elif current:
            if current[1] - current[0] > 8:
                bands.append((current[0], current[1]))
            current = None
    if current and current[1] - current[0] > 8:
        bands.append((current[0], current[1]))
    return bands


def sprite_boxes(
    art: Image.Image, band: tuple[int, int], block: tuple[int, int, int, int], count: int
) -> list[tuple[int, int, int, int]]:
    """Locate each sprite in a direction row, left to right.

    Column gaps inside one sprite are small (a lifted leg), while neighbouring
    sprites stand tens of pixels apart, so a modest gap tolerance splits frames
    without cutting limbs off.
    """
    left, right, _, _ = block
    top, bottom = band[0] - 4, band[1] + 4
    columns = ink_columns(art, top, bottom, left, right)
    spans: list[list[int]] = []
    for index, hits in enumerate(columns):
        if hits:
            if spans and index + left - (spans[-1][1]) <= 12:
                spans[-1][1] = index + left
            else:
                spans.append([index + left, index + left])
    if len(spans) != count:
        raise SystemExit(
            f"row {band} yielded {len(spans)} sprites, expected {count}"
        )
    boxes = []
    alpha = art.load()
    for x0, x1 in spans:
        ys = [y for y in range(top, bottom) if any(alpha[x, y][3] > 40 for x in range(x0, x1 + 1))]
        boxes.append((x0, ys[0], x1 + 1, ys[-1] + 1))
    return boxes


def scrub_acid(frame: Image.Image) -> None:
    """Drop the acid spray from the crawl cells.

    Attack 2 is the only full-body cycle on the page, and halfway through it the
    young spits. The spray is a saturated green that never appears on the hide,
    so removing it leaves the writhing crawl behind without a permanent attack
    effect.
    """
    pixels = frame.load()
    for y in range(frame.height):
        for x in range(frame.width):
            r, g, b, a = pixels[x, y]
            if a and g > r + 12 and g > b + 30:
                pixels[x, y] = (0, 0, 0, 0)


def paste(art: Image.Image, box: tuple[int, int, int, int], frame: Image.Image, box_size: int, scale: float) -> None:
    cell = art.crop(box)
    width = max(1, round(cell.width * scale))
    height = max(1, round(cell.height * scale))
    cell = cell.resize((width, height), Image.LANCZOS)
    x = (CELL - width) // 2
    # Every frame stands on the same ground line, 78% down the cell: that is
    # where drawEnemy anchors the feet of the other atlases.
    y = round(CELL * 0.78) - height
    frame.alpha_composite(cell, (x, y))


def main() -> None:
    if not PAGE.exists():
        raise SystemExit(f"missing page: {PAGE}")
    page = keyed(Image.open(PAGE))
    PROBE.mkdir(exist_ok=True)

    walk_rows = row_bands(page, WALK_BLOCK)
    attack_rows = row_bands(page, ATTACK_BLOCK)
    if len(walk_rows) != 8 or len(attack_rows) != 8:
        raise SystemExit(f"expected eight direction rows, got {len(walk_rows)}/{len(attack_rows)}")

    walk = [sprite_boxes(page, band, WALK_BLOCK, WALK_FRAMES) for band in walk_rows]
    attack = [sprite_boxes(page, band, ATTACK_BLOCK, ATTACK_FRAMES) for band in attack_rows]

    # One shared scale for every frame keeps the cycle from pulsing.
    tallest = max(b[3] - b[1] for row in walk + attack for b in row)
    widest = max(b[2] - b[0] for row in walk + attack for b in row)
    scale = min((CELL - 26) / tallest, (CELL - 16) / widest)

    atlas = Image.new("RGBA", (COLUMNS * CELL, 16 * CELL))
    for index, row in enumerate(walk):
        for column, box in enumerate(row):
            frame = Image.new("RGBA", (CELL, CELL))
            paste(page, box, frame, CELL, scale)
            scrub_acid(frame)
            atlas.alpha_composite(frame, (column * CELL, index * CELL))
    for index, row in enumerate(attack):
        for column, box in enumerate(row):
            frame = Image.new("RGBA", (CELL, CELL))
            paste(page, box, frame, CELL, scale)
            atlas.alpha_composite(frame, (column * CELL, (8 + index) * CELL))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT)

    # Previews: the eight directions of each band, plus the full bite cycle.
    sheet = Image.new("RGBA", (8 * 116, 2 * 116), (42, 40, 36, 255))
    for row in range(8):
        for band, offset in ((walk, 0), (attack, 1)):
            box = band[row][min(2, len(band[row]) - 1)]
            tile = atlas.crop((0, row * CELL, CELL, (row + 1) * CELL) if offset == 0
                              else (2 * CELL, (8 + row) * CELL, 3 * CELL, (9 + row) * CELL))
            sheet.alpha_composite(tile.resize((112, 112), Image.LANCZOS), (row * 116, offset * 116))
    sheet.convert("RGB").save(PROBE / "sand-maggot-young-directions.png")

    cycle = Image.new("RGBA", (ATTACK_FRAMES * 96, 96), (42, 40, 36, 255))
    for column in range(ATTACK_FRAMES):
        tile = atlas.crop((column * CELL, 8 * CELL, (column + 1) * CELL, 9 * CELL))
        cycle.alpha_composite(tile.resize((92, 92), Image.LANCZOS), (column * 96, 0))
    cycle.convert("RGB").save(PROBE / "sand-maggot-young-frames.png")

    print(f"wrote {OUT} {atlas.size} scale={scale:.3f}")


if __name__ == "__main__":
    main()
