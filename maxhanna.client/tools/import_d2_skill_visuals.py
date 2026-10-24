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
DEFAULT_D2_ROOT = Path.home() / "Desktop" / "d2"
DECODER_ROOT = Path(tempfile.gettempdir()) / "d2-dcc-decoder"
DEFAULT_CONVERTER = DEFAULT_D2_ROOT / "Work" / "maxhanna.client" / "dcc-converter-bin" / "dcc-convert.exe"

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
FRAME_NAME = re.compile(r"decoded_d(\d+)_f(\d+)\.png$")


def inspect_existing(output: Path, name: str, dcc_name: str) -> dict:
    frames = sorted(output.glob("*.webp"))
    if not frames:
        raise RuntimeError(f"Existing skill asset directory has no WebP frames: {output}")
    dimensions = set()
    for frame_path in frames:
        with Image.open(frame_path) as image:
            image.verify()
        with Image.open(frame_path) as image:
            dimensions.add(image.size)
    if len(dimensions) != 1:
        raise RuntimeError(f"Unstable frame dimensions for {dcc_name}: {sorted(dimensions)}")
    width, height = next(iter(dimensions))
    return {
        "frames": len(frames),
        "encodedFrames": len(frames),
        "width": width,
        "height": height,
        "frameDirectory": name,
        "frameDurationMs": 85,
        "source": "user-supplied DCC",
        "dccName": dcc_name,
        "direction": 0,
    }


def convert(d2_root: Path, converter: Path, name: str, dcc_name: str) -> dict:
    source = d2_root / "Data" / "Global" / "Missiles" / f"{dcc_name}.dcc"
    output = ASSET_ROOT / name
    if not source.is_file():
        raise FileNotFoundError(f"Missing supplied DCC: {source}")
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

        dimensions = set()
        for _, frame_path in frames:
            with Image.open(frame_path) as image:
                dimensions.add(image.size)
        if len(dimensions) != 1:
            raise RuntimeError(f"Unstable frame dimensions for {dcc_name}: {sorted(dimensions)}")

        temp_output = temp_root / "frames"
        temp_output.mkdir()
        for index, (_, frame_path) in enumerate(frames):
            with Image.open(frame_path) as image:
                image.convert("RGBA").save(temp_output / f"{index:04d}.webp", "WEBP", lossless=True, method=6)
        temp_output.rename(output)

    width, height = next(iter(dimensions))
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
    parser.add_argument("--d2-root", type=Path, default=DEFAULT_D2_ROOT)
    parser.add_argument("--converter", type=Path, default=DEFAULT_CONVERTER)
    args = parser.parse_args()
    for name, dcc_name in SKILL_ANIMATIONS.items():
        source = args.d2_root / "Data" / "Global" / "Missiles" / f"{dcc_name}.dcc"
        if not source.is_file():
            raise FileNotFoundError(f"Missing supplied DCC: {source}")

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
