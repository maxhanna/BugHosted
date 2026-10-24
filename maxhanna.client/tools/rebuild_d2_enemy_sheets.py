from collections import deque
from pathlib import Path

from PIL import Image


ASSET_ROOT = Path(__file__).resolve().parents[1] / "src" / "assets" / "d2survivors"
OUTPUT_ROOT = ASSET_ROOT / "enemies" / "animated"

# Andariel's first 20x8 block is verified against the supplied character atlas.
ATLASES = {
    "andariel": ("review/keys-Anda.png", (26, 26), 20, 8, (0, 0)),
}

KEY_COLOR = (170, 170, 170)
KEY_TOLERANCE = 18


def keyed_sprite(source: Image.Image) -> Image.Image:
    """Remove only edge-connected gray atlas background, preserving sprite pixels."""
    rgba = source.convert("RGBA")
    pixels = rgba.load()
    queue = deque()
    for x in range(rgba.width):
        queue.extend(((x, 0), (x, rgba.height - 1)))
    for y in range(rgba.height):
        queue.extend(((0, y), (rgba.width - 1, y)))

    visited = bytearray(rgba.width * rgba.height)
    while queue:
        x, y = queue.popleft()
        index = y * rgba.width + x
        if visited[index]:
            continue
        visited[index] = 1
        red, green, blue, alpha = pixels[x, y]
        if alpha == 0 or max(
            abs(red - KEY_COLOR[0]),
            abs(green - KEY_COLOR[1]),
            abs(blue - KEY_COLOR[2]),
        ) > KEY_TOLERANCE:
            continue
        pixels[x, y] = (red, green, blue, 0)
        if x > 0:
            queue.append((x - 1, y))
        if x + 1 < rgba.width:
            queue.append((x + 1, y))
        if y > 0:
            queue.append((x, y - 1))
        if y + 1 < rgba.height:
            queue.append((x, y + 1))
    return rgba


def rebuild(
    name: str,
    source_name: str,
    cell: tuple[int, int],
    columns: int,
    rows: int,
    origin: tuple[int, int],
) -> None:
    source = Image.open(ASSET_ROOT / source_name).convert("RGBA")
    cell_width, cell_height = cell
    expected_width = columns * cell_width
    expected_height = rows * cell_height
    origin_x, origin_y = origin
    if origin_x + expected_width > source.width or origin_y + expected_height > source.height:
        raise ValueError(
            f"{source_name} is {source.size}; block at {origin} needs {(expected_width, expected_height)}"
        )

    sheet = Image.new("RGBA", (expected_width, expected_height), (0, 0, 0, 0))
    for direction in range(rows):
        for frame in range(columns):
            left = origin_x + frame * cell_width
            top = origin_y + direction * cell_height
            sprite = source.crop((left, top, left + cell_width, top + cell_height))
            sheet.alpha_composite(keyed_sprite(sprite), (frame * cell_width, direction * cell_height))

    output = OUTPUT_ROOT / f"{name}.png"
    sheet.save(output, optimize=True)
    print(f"{output.relative_to(ASSET_ROOT)}: {sheet.size} ({columns} frames x {rows} directions)")


def main() -> None:
    if not ATLASES:
        print("No verified sprite-sheet layouts are configured; leaving imported assets unchanged.")
        return
    for name, (source_name, cell, columns, rows, origin) in ATLASES.items():
        rebuild(name, source_name, cell, columns, rows, origin)


if __name__ == "__main__":
    main()
