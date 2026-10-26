import argparse
import json
import re
import struct
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "missiles"
DEFAULT_D2_ROOT = Path.home() / "Desktop" / "d2" / "Work"
DECODER_ROOT = Path(tempfile.gettempdir()) / "d2-dcc-decoder"
DEFAULT_CONVERTER = DEFAULT_D2_ROOT / "maxhanna.client" / "dcc-converter-bin" / "dcc-convert.exe"
# Import the first projectile direction; the runtime turns the sprite toward its target.
SKILL_ANIMATIONS = {
    "d2-firebolt": "D1FireBolt",
    "d2-fireball": "D1FireBall",
    "d2-acidbolt": "AcidBolt",
    "d2-bloodcomet": "BloodComet",
    "d2-lightning": "D1Lightning",
    "d2-inferno": "D1Inferno",
    "d2-magmaball": "D1MagmaBallTravel",
    "d2-icebolt": "SuccubusMissileIceTravel",
    "d2-poisonbolt": "SuccubusMissileGreenTravel",
    "d2-bloodstar": "SuccubusMissileRedTravel",
    "d2-shadowbolt": "SuccubusMissilePurpleTravel",
    "d2-holybolt": "SuccubusMissileWhiteTravel",
    "d2-bluestar": "SuccubusMissileBlueTravel",
}

# The supplied DCC decoder exports grayscale when no native palette is passed.
# Missiles.txt provides the projectile's D2 light color; apply it to grayscale
# pixels while leaving already-colored pixels and alpha untouched.
MISSILE_TINTS = {
    "d2-firebolt": (255, 178, 64),
    "d2-fireball": (255, 178, 64),
    "d2-acidbolt": (85, 235, 75),
    "d2-bloodcomet": (255, 35, 35),
    "d2-lightning": (125, 205, 255),
    "d2-inferno": (255, 112, 36),
    "d2-magmaball": (255, 112, 36),
    "d2-icebolt": (105, 210, 255),
    "d2-poisonbolt": (85, 235, 75),
    "d2-bloodstar": (230, 65, 95),
    "d2-shadowbolt": (185, 95, 255),
    "d2-holybolt": (255, 235, 145),
    "d2-bluestar": (95, 165, 255),
}
FRAME_NAME = re.compile(r"decoded_d(\d+)_f(\d+)\.png$")


def remove_black_background(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    # DCC exports can carry the black matte in partially transparent pixels,
    # not just fully opaque ones. Key those pixels too; otherwise alpha blending
    # leaves a dark rectangle behind the bright missile when drawn on the arena.
    # Keep the original alpha on colored sprite pixels.
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                continue
            luminance = round(red * 0.299 + green * 0.587 + blue * 0.114)
            if luminance <= 2:
                pixels[x, y] = (red, green, blue, 0)
            elif max(red, green, blue) - min(red, green, blue) <= 4 and luminance <= 32:
                # Faint grayscale antialias pixels over black retain a dark matte
                # in their RGB. Reduce coverage to remove halos without muting
                # authored dark-blue/cyan pixels that simply happen to be dim.
                matte_coverage = (luminance - 2) / 30
                pixels[x, y] = (red, green, blue, round(alpha * matte_coverage))
    return rgba


def prepare_frames(images: list[Image.Image], name: str) -> list[Image.Image]:
    """Key DCC matte, crop blank margins consistently, and colorize grayscale exports."""
    keyed = [remove_black_background(image) for image in images]
    bounds = [image.getchannel("A").getbbox() for image in keyed]
    visible_indices = [index for index, box in enumerate(bounds) if box]
    if not visible_indices:
        raise RuntimeError(f"No visible pixels in skill animation {name}")
    # A few supplied DCCs end on a fully transparent timing frame. Hold the last
    # visible cel for that final tick rather than flashing the missile out early.
    last_visible_index = visible_indices[-1]
    for index in range(last_visible_index + 1, len(keyed)):
        keyed[index] = keyed[last_visible_index].copy()
        bounds[index] = bounds[last_visible_index]
    visible_bounds = [box for box in bounds if box]
    left = max(0, min(box[0] for box in visible_bounds) - 4)
    top = max(0, min(box[1] for box in visible_bounds) - 4)
    right = min(keyed[0].width, max(box[2] for box in visible_bounds) + 4)
    bottom = min(keyed[0].height, max(box[3] for box in visible_bounds) + 4)
    tint = MISSILE_TINTS[name]
    prepared = []
    for image in keyed:
        if image.size != keyed[0].size:
            raise RuntimeError(f"Unstable frame dimensions for {name}: {image.size} != {keyed[0].size}")
        cropped = image.crop((left, top, right, bottom))
        pixels = cropped.load()
        for y in range(cropped.height):
            for x in range(cropped.width):
                red, green, blue, alpha = pixels[x, y]
                if alpha == 0 or max(red, green, blue) - min(red, green, blue) > 4:
                    continue
                intensity = (max(red, green, blue) / 255) ** 0.8
                pixels[x, y] = (
                    round(tint[0] * intensity),
                    round(tint[1] * intensity),
                    round(tint[2] * intensity),
                    alpha,
                )
        prepared.append(cropped)
    return prepared


def inspect_existing(output: Path, name: str, dcc_name: str) -> dict:
    frame_paths = sorted(output.glob("*.webp"))
    if not frame_paths:
        raise RuntimeError(f"Existing skill asset directory has no WebP frames: {output}")
    images = []
    for frame_path in frame_paths:
        with Image.open(frame_path) as image:
            images.append(image.convert("RGBA"))
    prepared = prepare_frames(images, name)
    width, height = prepared[0].size
    for frame_path, image in zip(frame_paths, prepared):
        image.save(frame_path, "WEBP", lossless=True, method=6)
    return {
        "frames": len(frame_paths),
        "encodedFrames": len(frame_paths),
        "width": width,
        "height": height,
        "frameDirectory": name,
        "frameDurationMs": 85,
        "source": "user-supplied DCC",
        "dccName": dcc_name,
        "direction": 0,
    }


def find_source_dcc(d2_root: Path, dcc_name: str) -> Path:
    """Find the named animation source inside the one supplied Desktop/d2/Work tree."""
    directories = (d2_root, d2_root / "data" / "global" / "missiles")
    for directory in directories:
        if directory.is_dir():
            named_sources = sorted(
                (path for path in directory.glob("*.dcc") if path.stem.lower() == dcc_name.lower()),
                key=lambda path: path.as_posix().lower(),
            )
            if named_sources:
                return named_sources[0]
    # The supplied Work extraction is MPQ-flattened: numeric File########.xxx
    # names are resolved through (listfile). Do not interpret those opaque files
    # as skill sources without a decoded-name mapping.
    raise FileNotFoundError(
        f"Could not identify {dcc_name}.dcc under {d2_root}; the supplied Work tree "
        "does not expose a named missile DCC or a decoded missile-to-file mapping."
    )


def convert(d2_root: Path, converter: Path, name: str, dcc_name: str) -> dict:
    source = find_source_dcc(d2_root, dcc_name)
    output = ASSET_ROOT / name
    if not converter.is_file():
        raise FileNotFoundError(f"DCC converter is not available at {converter}")
    if output.exists():
        return inspect_existing(output, name, dcc_name)

    ASSET_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=f"{name}-", dir=ASSET_ROOT) as temp:
        temp_root = Path(temp)
        source_data = bytearray(source.read_bytes())
        if len(source_data) < 15 or source_data[0] != 0x74:
            raise RuntimeError(f"Invalid DCC header for {dcc_name}: {source}")
        # Some supplied missile DCCs omit the required sanity word. Repair only
        # this header field in the temporary decoder input; source data is untouched.
        if struct.unpack_from("<I", source_data, 7)[0] != 1:
            struct.pack_into("<I", source_data, 7, 1)
        decoder_source = temp_root / source.name
        decoder_source.write_bytes(source_data)
        stem = temp_root / "decoded.png"
        result = subprocess.run(
            [str(converter), "-dcc", str(decoder_source), "-png", str(stem)],
            cwd=DECODER_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        frames = []
        for frame_path in temp_root.glob("decoded_d*_f*.png"):
            match = FRAME_NAME.match(frame_path.name)
            if match:
                frames.append((int(match.group(1)), int(match.group(2)), frame_path))
        frames.sort(key=lambda item: (item[0], item[1]))
        if not frames:
            details = (result.stdout + result.stderr).strip()
            raise RuntimeError(f"Decoder produced no frames for {dcc_name}: {details}")
        first_direction = frames[0][0]
        frames = [(frame_index, path) for direction, frame_index, path in frames if direction == first_direction]

        source_images = []
        for _, frame_path in frames:
            with Image.open(frame_path) as image:
                source_images.append(image.convert("RGBA"))
        prepared = prepare_frames(source_images, name)

        temp_output = temp_root / "frames"
        temp_output.mkdir()
        for index, rgba in enumerate(prepared):
            rgba.save(temp_output / f"{index:04d}.webp", "WEBP", lossless=True, method=6)
        temp_output.rename(output)

    width, height = prepared[0].size
    return {
        "frames": len(frames),
        "encodedFrames": len(frames),
        "width": width,
        "height": height,
        "frameDirectory": name,
        "frameDurationMs": 85,
        "source": "user-supplied DCC",
        "dccName": dcc_name,
        "direction": first_direction,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Import skill missile animations from local Diablo II data.")
    parser.add_argument("--d2-root", type=Path, default=DEFAULT_D2_ROOT, help="One supplied asset tree; defaults to Desktop/d2/Work")
    parser.add_argument("--converter", type=Path, default=DEFAULT_CONVERTER)
    args = parser.parse_args()
    missing = []
    for name, dcc_name in SKILL_ANIMATIONS.items():
        try:
            find_source_dcc(args.d2_root, dcc_name)
        except FileNotFoundError as error:
            missing.append(str(error))
    if missing:
        raise FileNotFoundError("\n".join(missing))

    manifest_path = ASSET_ROOT / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    imported = {}
    for name, dcc_name in SKILL_ANIMATIONS.items():
        imported[name] = convert(args.d2_root, args.converter, name, dcc_name)
        print(f"{name}: {imported[name]['frames']} frames from {dcc_name}")
    manifest.update(imported)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
