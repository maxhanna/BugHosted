"""Import the original D2 projectile art for the elemental missiles.

Why this tool exists
--------------------
The runtime missile ids used to come from `Data/Global/Missiles` in the game
data on this machine. That folder belongs to a mod overlay: it ships
`D1FireBolt.dcc`, `D1FireBall.dcc`, `D1Lightning.dcc`, `D1Inferno.dcc` and
`D1MagmaBallTravel.dcc`, i.e. converted Diablo 1 sprites, which is why every
fire/lightning skill in the survivor run looked like a Diablo 1 missile. The
same folder's `Missiles.txt` only adds those D1 entries as ids 684+.

The real D2 projectile art in the extraction (`Desktop/d2/d2data`,
`d2exp`, `d2char`) is stored as opaque `File########.xxx` DCCs with no name
index, so it cannot be matched to a `Missiles.txt` CelFile by name. What is
available and unambiguously Diablo II art is `Desktop/d2/missile_overlays`,
the numbered D2 missile/effect animations. This tool writes the ones that
match each elemental missile into the runtime asset tree.

Usage
-----
    cd maxhanna.client
    python tools/import_d2_missile_overlays.py            # import every entry
    python tools/import_d2_missile_overlays.py --only d2-fireball
    python tools/import_d2_missile_overlays.py --source /path/to/missile_overlays

Each source folder holds a single direction's frames as BMPs on a black matte.
Frames are cropped to their shared bounding box so the runtime scale factor
sees the projectile rather than the source padding, and the matte becomes
alpha (luminance) so the glow stays soft instead of leaving a black halo.
"""

import argparse
import json
from pathlib import Path

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "missiles"
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "missile_overlays"

# Runtime missile id -> numbered D2 animation folder. These replace the mod's
# Diablo 1 imports; the remaining elemental ids already use D2 assets.
SOURCES = {
    "d2-firebolt": "31",   # small fire burst
    "d2-fireball": "84",   # fireball with flame body
    "d2-inferno": "74",    # upright flame column
    "d2-magmaball": "47",  # molten burst
    "d2-lightning": "43",  # lightning bolt
}


def luminance_alpha(image: Image.Image) -> Image.Image:
    """Turn the black matte of a D2 missile cel into soft alpha."""
    rgb = image.convert("RGB")
    alpha = rgb.convert("L").point(lambda value: min(255, round(value * 1.9)))
    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    return out


def load_frames(directory: Path) -> list[Image.Image]:
    """Load the animation with every frame centred on its own sprite bounds.

    The supplied exporter trimmed each BMP to its visible pixels, so frames have
    different sizes. Recentring on the sprite keeps the animation stable under the
    runtime's rotation instead of making the projectile jitter.
    """
    frames = sorted(p for p in directory.iterdir() if p.suffix.lower() == ".bmp")
    if not frames:
        raise SystemExit(f"No BMP frames in {directory}")
    trimmed = []
    for path in frames:
        image = luminance_alpha(Image.open(path))
        box = image.getchannel("A").getbbox()
        if box:
            image = image.crop(box)
        trimmed.append(image)
    width = max(image.width for image in trimmed) + 4
    height = max(image.height for image in trimmed) + 4
    centred = []
    for image in trimmed:
        canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        canvas.alpha_composite(image, ((width - image.width) // 2, (height - image.height) // 2))
        centred.append(canvas)
    return centred


def import_one(name: str, folder: str, source_root: Path) -> dict:
    source = source_root / folder
    images = load_frames(source)
    output = ASSET_ROOT / name
    output.mkdir(parents=True, exist_ok=True)
    for stale in output.glob("*.webp"):
        stale.unlink()
    for index, image in enumerate(images):
        image.save(output / f"{index:04d}.webp", "WEBP", lossless=True, method=6)
    return {
        "frames": len(images),
        "encodedFrames": len(images),
        "width": images[0].width,
        "height": images[0].height,
        "frameDirectory": name,
        "frameDurationMs": None,
        "source": "d2 missile_overlays",
        "sourceFolder": folder,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="missile_overlays root")
    parser.add_argument("--only", action="append", default=[], help="limit to these runtime ids")
    args = parser.parse_args()

    if not args.source.is_dir():
        raise SystemExit(f"Missing source directory: {args.source}")

    selected = {key: value for key, value in SOURCES.items() if not args.only or key in args.only}
    missing = [key for key in args.only if key not in SOURCES]
    if missing:
        raise SystemExit(f"Unknown runtime ids: {', '.join(missing)}")

    manifest = {}
    for name, folder in selected.items():
        entry = import_one(name, folder, args.source)
        manifest[name] = entry
        print(f"{name:16s} <- {folder:>4s}  {entry['frames']:>2d} frames  {entry['width']}x{entry['height']}")

    manifest_path = ASSET_ROOT / "manifest.json"
    existing = {}
    if manifest_path.exists():
        existing = json.loads(manifest_path.read_text())
    existing.update(manifest)
    manifest_path.write_text(json.dumps(existing, indent=2, sort_keys=True) + "\n")
    print(f"manifest: {manifest_path}")


if __name__ == "__main__":
    main()
