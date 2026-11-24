"""Measure the tallest walk cel of a Diablo II monster in source pixels.

The runtime table stores `tallest walk cel * (90 / 77)` (77 = the Amazon's tallest
neutral cel, 90 = one hero height). This prints the raw cel height for each
monster code so the table can be filled from art instead of guesses.
"""

from __future__ import annotations

import sys
from pathlib import Path

import d2r_dcc
import render_d2r_tristram as tristram

SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"
VARIANTS = ("tr", "hd", "ra", "rh", "la", "lg", "s1", "s2", "s3")


def find_walk(monster_dir: Path) -> Path | None:
    best: tuple[int, Path] | None = None
    for variant in sorted(p for p in monster_dir.iterdir() if p.is_dir()):
        rank = VARIANTS.index(variant.name) if variant.name in VARIANTS else len(VARIANTS)
        for path in sorted(variant.glob("*wl*.dcc")):
            if "wl" not in path.stem.lower():
                continue
            if best is None or rank < best[0]:
                best = (rank, path)
    return best[1] if best else None


def measure(code: str, label: str, palette) -> None:
    monster_dir = SOURCE / "global" / "monsters" / code
    if not monster_dir.is_dir():
        print(f"{label:14s} {code:3s} MISSING")
        return
    walk = find_walk(monster_dir)
    if walk is None:
        print(f"{label:14s} {code:3s} no walk DCC")
        return
    animation = d2r_dcc.parse(walk.read_bytes())
    tallest_frame = 0
    tallest_pixels = 0
    heaviest = ""
    for direction in range(min(8, len(animation["dirs"]))):
        entry = animation["dirs"][direction]
        for frame, bitmap in zip(entry["frames"], entry["bitmaps"]):
            tallest_frame = max(tallest_frame, frame["height"])
            image = d2r_dcc.frame_image(bitmap, frame["width"], frame["height"], palette)
            box = image.getbbox()
            if box:
                pixels = box[3] - box[1]
                if pixels > tallest_pixels:
                    tallest_pixels = pixels
                    heaviest = walk.name
    print(f"{label:14s} {code:3s} frame={tallest_frame:4d} pixels={tallest_pixels:4d} "
          f"-> {round(tallest_pixels * 90 / 77):4d}  ({heaviest})")


def main(argv: list[str]) -> int:
    targets = [
        ("deathMauler", "M5"), ("spiderDemon", "SP"), ("council", "HP"),
        ("goatman", "GM"), ("blunderbore", "PN"), ("sandRaider", "SR"),
        ("scarab", "SC"), ("wendigo", "YE"), ("salamander", "SD"),
        ("painWorm", "46"), ("wolf", "WF"), ("clayGolem", "G1"),
        ("bloodGolem", "G2"), ("ironGolem", "G3"), ("fireGolem", "G4"),
        ("skeleton", "SK"), ("minotaur", "L3"), ("baalsMinion", "43"),
    ]
    palette = [color[:3] for color in tristram.load_palette(SOURCE / "global" / "palette" / "units" / "pal.dat")]
    for label, code in targets:
        measure(code, label, palette)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
