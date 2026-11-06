"""Import every named Diablo II missile animation from the D2R extraction.

`Desktop/d2/d2r extract/data/global/missiles` keeps the original DCC names
(`fireball.dcc`, `iceorb.dcc`, `lightningbolt.dcc`, ...) instead of the opaque
`File########.xxx` dumps the older importers had to guess at, so a spell can be
pointed at its real Diablo II projectile art by name.

The runtime turns a missile toward its target and plays a one-direction strip,
so only direction 0 is exported: the frames are keyed to transparency, cropped
to their shared bounds so the sprite does not jitter, padded to one canvas and
scaled down to keep the asset bundle small.

Output layout matches the rest of `assets/d2survivors/missiles`:

    missiles/d2-fireball/0000.webp ...
    missiles/manifest.json                 (frame counts, sizes, source)

and a generated `src/app/d2survivors/d2-missile-assets.generated.ts` with the
frame counts the component needs to preload the strips.

Usage:
    python tools/import_d2r_missiles.py                 # every named missile
    python tools/import_d2r_missiles.py --only fireball iceorb
    python tools/import_d2r_missiles.py --list
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image

import d2r_dcc as dcc

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "missiles"
GENERATED_TS = PROJECT_ROOT / "src" / "app" / "d2survivors" / "d2-missile-assets.generated.ts"
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"

# The renderer draws a projectile at roughly 30 CSS px, so keeping the
# 400-900px source cels would only bloat the bundle.
MAX_FRAME_SIZE = 160
# Diablo II animations tick at 25 fps; most missile cels hold for two ticks.
DEFAULT_FRAME_MS = 60

# Animations that are not projectiles (silence, footsteps, deaths) would still
# be imported harmlessly, but `null.dcc` is genuinely empty.
SKIP_STEMS = {"null"}

# Which palette the missile cels use. `units` is the shared creature/missile
# palette; the per-act palettes only tint the same indices.
PALETTE_PATH = ("global", "palette", "units", "pal.dat")

PALETTE: list[tuple[int, int, int]] = []


def find_sources(source: Path) -> list[Path]:
    """Every named missile DCC, expansion art taking the place of a base namesake."""
    root = source / "global" / "missiles"
    found: dict[str, Path] = {}
    for path in sorted(root.rglob("*.dcc")):
        stem = path.stem.lower()
        if stem in SKIP_STEMS:
            continue
        # `expansion/` and `extra/` hold the later acts; prefer them when a base
        # file shares the name, then keep the first path seen otherwise.
        if stem not in found or path.parent.name in ("expansion", "extra"):
            found[stem] = path
    return [found[stem] for stem in sorted(found)]


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
    centred = []
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


def import_missile(path: Path) -> dict:
    animation = dcc.parse(path.read_bytes())
    if not animation["dirs"] or not animation["frames_per_dir"]:
        raise RuntimeError("animation has no frames")
    direction = animation["dirs"][0]
    xmin, ymin, _, _ = direction["box"]
    frames = []
    for index in range(len(direction["frames"])):
        frame = direction["frames"][index]
        canvas = Image.new("RGBA", (direction["box"][2], direction["box"][3]), (0, 0, 0, 0))
        canvas.alpha_composite(
            dcc.frame_image(direction["bitmaps"][index], frame["width"], frame["height"], PALETTE),
            (frame["xmin"] - xmin, frame["ymin"] - ymin),
        )
        # Keep only this frame's cel, inside the direction canvas so offsets hold.
        mask = Image.new("L", canvas.size, 0)
        mask.paste(255, (frame["xmin"] - xmin, frame["ymin"] - ymin,
                         frame["xmin"] - xmin + frame["width"], frame["ymin"] - ymin + frame["height"]))
        canvas.putalpha(Image.composite(canvas.getchannel("A"), Image.new("L", canvas.size, 0), mask))
        frames.append(canvas)

    prepared = prepare_frames(frames)
    name = f"d2-{path.stem.lower()}"
    output = ASSET_ROOT / name
    output.mkdir(parents=True, exist_ok=True)
    for stale in output.glob("*.webp"):
        stale.unlink()
    for index, image in enumerate(prepared):
        image.save(output / f"{index:04d}.webp", "WEBP", lossless=True, method=6)
    return {
        "frames": len(prepared),
        "encodedFrames": len(prepared),
        "width": prepared[0].width,
        "height": prepared[0].height,
        "frameDirectory": name,
        "frameDurationMs": DEFAULT_FRAME_MS,
        "source": "d2r extract missile dcc",
        "dccName": path.stem,
    }


def write_generated_ts(manifest: dict) -> None:
    """Frame counts for the runtime, so every imported strip preloads fully."""
    entries = sorted(
        (key, value["frames"])
        for key, value in manifest.items()
        if value.get("source") == "d2r extract missile dcc"
    )
    lines = [
        "// Generated by tools/import_d2r_missiles.py - do not edit by hand.",
        "/** Runtime missile art id -> exported webp frame count. */",
        "export const D2_MISSILE_FRAME_COUNTS: Record<string, number> = {",
    ]
    for key, frames in entries:
        lines.append(f'  "{key}": {frames},')
    lines.append("};")
    lines.append("")
    GENERATED_TS.write_text("\n".join(lines), encoding="utf-8")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--only", nargs="*", default=None, help="DCC stems, e.g. fireball iceorb")
    parser.add_argument("--list", action="store_true")
    args = parser.parse_args(argv)

    sources = find_sources(args.source)
    if args.list:
        print("\n".join(path.stem for path in sources))
        return 0
    if args.only:
        wanted = {name.lower() for name in args.only}
        sources = [path for path in sources if path.stem.lower() in wanted]
        missing = wanted - {path.stem.lower() for path in sources}
        if missing:
            print(f"unknown missiles: {', '.join(sorted(missing))}", file=sys.stderr)
            return 1

    global PALETTE
    PALETTE = dcc.load_palette(args.source.joinpath(*PALETTE_PATH))

    manifest_path = ASSET_ROOT / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    failures = 0
    for path in sources:
        try:
            entry = import_missile(path)
        except Exception as error:  # noqa: BLE001 - report and keep importing
            failures += 1
            print(f"skip {path.stem}: {error}")
            continue
        manifest[entry["frameDirectory"]] = entry
        print(f"{entry['frameDirectory']:32s} {entry['frames']:3d} frames  {entry['width']}x{entry['height']}")

    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    write_generated_ts(manifest)
    print(f"imported {len(sources) - failures}/{len(sources)} missiles")
    print(f"manifest: {manifest_path}")
    print(f"frame counts: {GENERATED_TS}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
