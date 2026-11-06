"""Build the necromancer summon animation atlases from Diablo II source art.

The MPQ extraction on this machine keeps the original monster DCC art but loses
every file name (the archives are dumped as flat ``File########.xxx`` files), so
the necromancer summons could not be matched to their own animations. This
script builds two runtime atlases from art that *is* identifiable:

* ``skeleton-warrior.png`` comes from ``review/z-Skelet.jpg``, a Diablo II
  skeleton rip with a magenta matte: an 8 direction by 16 frame walk band above
  an 8 direction by 10 frame attack band. Cells are exported at 2x so the game
  can downscale them without visible stepping.
* ``golem.png`` comes from the LoD monster group ``d2exp/File00007956`` ..
  ``File00007965`` (8 directions per DCC), decoded with the DCC converter in
  ``Work/maxhanna.client/dcc-converter-bin``. Its frames are the hulking,
  hunched, weaponless humanoid the four golem types share in Diablo II.

Both atlases use the same runtime layout as the other animated enemy sheets:
8 walk direction rows above 8 attack direction rows, one frame per column.

Usage:
    python tools/import_d2_summon_animations.py [--skeleton-only|--golem-only]
"""

from __future__ import annotations

import argparse
import glob
import os
import shutil
import subprocess
import tempfile

from PIL import Image

CLIENT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D2_ROOT = os.environ.get("D2_ROOT", r"C:\Users\Saint\Desktop\d2")
CONVERTER = os.path.join(D2_ROOT, "Work", "maxhanna.client", "dcc-converter-bin", "dcc-convert.exe")
REVIEW = os.path.join(CLIENT_ROOT, "src", "assets", "d2survivors", "review")
OUT_DIR = os.path.join(CLIENT_ROOT, "src", "assets", "d2survivors", "enemies", "animated")

SKELETON_CELL = (210, 180)
SKELETON_SCALE = 3
GOLEM_SCALE = 1


def key_frame(image: Image.Image) -> Image.Image:
    """Turn the magenta matte into transparency and trim to the visible art.

    The rip is a JPEG, so the matte edge is a gradient rather than one colour.
    Only the strongly pink core is keyed out; the warm fringe that bleeds into
    the bones is colour-corrected instead of deleted, so the art stays whole.
    """
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                continue
            red_green = red - green
            blue_green = blue - green
            if red > 150 and red_green > 90 and blue_green > 40:
                pixels[x, y] = (0, 0, 0, 0)
            elif red_green > 40 or blue_green > 40:
                # Despill: a matte/bone blend keeps the matte's hue. Collapse it
                # to its own luminance so the bones stay bone-coloured.
                grey = int(0.299 * red + 0.587 * green + 0.114 * blue)
                pixels[x, y] = (grey, grey, grey, alpha)
    box = rgba.getbbox()
    return rgba.crop(box) if box else rgba


def build_skeleton() -> str:
    source = Image.open(os.path.join(REVIEW, "z-Skelet.jpg")).convert("RGB")
    # Walk band: 16 columns (frames) by 8 rows (directions), y 6..379.
    walk = dict(x=0, y=6, columns=16, rows=8, width=1055, height=374)
    # Attack band: the right-hand block of the second band, 10 by 8.
    attack = dict(x=724, y=387, columns=10, rows=8, width=445, height=446)
    columns = 16
    cell_w, cell_h = SKELETON_CELL
    sheet = Image.new("RGBA", (columns * cell_w, 16 * cell_h), (0, 0, 0, 0))
    for band, row_offset in ((walk, 0), (attack, 8)):
        cell_width = band["width"] / band["columns"]
        cell_height = band["height"] / band["rows"]
        frames = band["columns"] if band is walk else columns
        for row in range(band["rows"]):
            for column in range(frames):
                left = int(band["x"] + column * cell_width)
                top = int(band["y"] + row * cell_height)
                right = min(source.width, int(band["x"] + (column + 1) * cell_width))
                bottom = min(source.height, int(band["y"] + (row + 1) * cell_height))
                if right - left < 4 or bottom - top < 4:
                    continue
                cel = key_frame(source.crop((left, top, right, bottom)))
                if not cel.width or not cel.height:
                    continue
                # The rip is a small screenshot crop whose warriors are only about
                # 25 pixels tall: export upscaled with nearest neighbour so the
                # runtime draw keeps the original pixel art without extra blur.
                cel = cel.resize((cel.width * SKELETON_SCALE, cel.height * SKELETON_SCALE), Image.NEAREST)
                if cel.width > cell_w or cel.height > cell_h:
                    scale = min(cell_w / cel.width, cell_h / cel.height)
                    cel = cel.resize((max(1, int(cel.width * scale)), max(1, int(cel.height * scale))), Image.NEAREST)
                sheet.alpha_composite(
                    cel,
                    (column * cell_w + (cell_w - cel.width) // 2, (row_offset + row) * cell_h + (cell_h - cel.height)),
                )
    path = os.path.join(OUT_DIR, "skeleton-warrior.png")
    sheet.save(path)
    print("wrote", path, sheet.size)
    return path


def decode_directions(base: str, number: int, workdir: str) -> dict[int, list[Image.Image]]:
    source = os.path.join(D2_ROOT, base, f"File{number:08d}.xxx")
    if not os.path.exists(source):
        raise FileNotFoundError(source)
    outdir = os.path.join(workdir, str(number))
    os.makedirs(outdir, exist_ok=True)
    dcc = os.path.join(outdir, "animation.dcc")
    shutil.copyfile(source, dcc)
    subprocess.run(
        [CONVERTER, "-dcc", dcc, "-png", os.path.join(outdir, "frame.png")],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=300,
    )
    directions: dict[int, list[Image.Image]] = {}
    for path in glob.glob(os.path.join(outdir, "frame_d*_f*.png")):
        _, direction, frame = os.path.basename(path)[:-4].split("_")
        directions.setdefault(int(direction[1:]), []).append((int(frame[1:]), Image.open(path).convert("RGBA")))
    decoded = {direction: [image for _, image in sorted(items)] for direction, items in directions.items()}
    if not decoded:
        raise RuntimeError(f"no frames decoded for {base}/{number}")
    return decoded


def build_golem() -> str:
    # 7961 is the 16 frame, 8 direction walk; 7963 is the 23 frame attack.
    walk_id, attack_id = 7961, 7963
    columns = 16
    with tempfile.TemporaryDirectory() as workdir:
        walk = decode_directions("d2exp", walk_id, workdir)
        attack = decode_directions("d2exp", attack_id, workdir)
        frames = [image for group in (walk, attack) for frames in group.values() for image in frames]
        cell_w = max(image.width for image in frames) * GOLEM_SCALE + 4
        cell_h = max(image.height for image in frames) * GOLEM_SCALE + 4
        sheet = Image.new("RGBA", (columns * cell_w, 16 * cell_h), (0, 0, 0, 0))
        for rows, offset in ((walk, 0), (attack, 8)):
            for direction in range(8):
                cels = rows.get(direction, [])
                for column in range(min(columns, len(cels))):
                    cel = cels[column]
                    if GOLEM_SCALE != 1:
                        cel = cel.resize((cel.width * GOLEM_SCALE, cel.height * GOLEM_SCALE), Image.NEAREST)
                    sheet.alpha_composite(
                        cel,
                        (column * cell_w + (cell_w - cel.width) // 2, (offset + direction) * cell_h + cell_h - cel.height - 2),
                    )
    path = os.path.join(OUT_DIR, "golem.png")
    sheet.save(path)
    print("wrote", path, sheet.size, "walk", walk_id, "attack", attack_id)
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skeleton-only", action="store_true")
    parser.add_argument("--golem-only", action="store_true")
    arguments = parser.parse_args()
    if not arguments.golem_only:
        build_skeleton()
    if not arguments.skeleton_only:
        build_golem()


if __name__ == "__main__":
    main()
