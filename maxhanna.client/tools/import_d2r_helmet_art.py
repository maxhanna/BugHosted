"""Import D2R HD helmet and druid-pelt art for the 3D class models.

The extract ships each wearable headpiece as a Granny ``.model`` plus a
GPU-ready ``.texture``.  This script converts the level-of-detail 0 model to
GLB with lslib and decodes the matching albedo to a compact PNG.

lslib cannot write glTF directly from GR2 (its glTF mesh exporter throws), so
the model goes through COLLADA first:

    .model --(Divine GR2 -> DAE)--> .dae --(Divine DAE -> GLB)--> .glb

``Divine.exe`` needs ``granny2.dll`` beside it, so pass the unpacked lslib
``Packed`` directory that contains both.  The downloaded tool is intentionally
not checked in.

D2R ``.texture`` layout, verified against these files:

* ``0x00``  magic ``<DE(``
* ``0x04``  u16 compression code (58 BC1, 62 BC3; these helmets are BC3)
* ``0x06``  u8 dimensionality (2 = 2D)
* ``0x07``  u8 mip count
* ``0x08``  u32 width
* ``0x0c``  u32 height
* ``0x24``  mip directory, ``mip_count * 8`` bytes
* then the mip bytes, largest first.

The offset field inside the directory is not the mip-0 file offset; mip 0
starts immediately after the directory.

Usage:
    python tools/import_d2r_helmet_art.py \
        --lslib-dir .tmp-d2rconvert/lslib/Packed
    python tools/import_d2r_helmet_art.py --skip-models
"""

from __future__ import annotations

import argparse
import io
import math
import struct
import subprocess
import sys
from pathlib import Path

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "models" / "helmets"
WORK_DIR = PROJECT_ROOT / ".tmp-d2rconvert" / "helmets"
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"
TEXTURE_SIZE = 256

# output id, source folder below data/hd/items/armor, model stem
MODELS = (
    ("cap", "helmet/cap_hat", "cap_hat"),
    ("jawbone", "helmet/jawbone_cap", "jawbone_cap"),
    ("skull", "helmet/skull_cap", "skull_cap"),
    ("helm", "helmet/helm", "helm"),
    ("full", "helmet/full_helm", "full_helm"),
    ("great", "helmet/great_helm", "great_helm"),
    ("bone", "helmet/bone_helm", "bone_helm"),
    ("crown", "helmet/crown", "crown"),
    ("circlet", "circlet/circlet", "circlet"),
    ("coronet", "circlet/coronet", "coronet"),
    ("diadem", "circlet/diadem", "diadem"),
    ("tiara", "circlet/tiara", "tiara"),
    ("mask", "helmet/mask", "mask"),
    ("assault", "helmet/assault_helmet", "assault_helmet"),
    ("avenger", "helmet/avenger_guard", "avenger_guard"),
    ("fanged", "helmet/fanged_helm", "fanged_helm"),
    ("horned", "helmet/horned_helm", "horned_helm"),
    ("wolf", "pelt/wolf_head", "wolf_head"),
    ("hawk", "pelt/hawk_helm", "hawk_helm"),
    ("antlers", "pelt/antlers", "antlers"),
    ("falcon", "pelt/falcon_mask", "falcon_mask"),
    ("spirit", "pelt/spirit_mask", "spirit_mask"),
)

# compression code -> (label, DXGI format, bytes per 4x4 block)
COMPRESSION = {
    58: ("BC1", 71, 8),
    62: ("BC3", 77, 16),
    63: ("BC4", 80, 8),
    64: ("BC5", 83, 16),
    98: ("BC7", 98, 16),
    99: ("BC7_SRGB", 99, 16),
}
DDS_FLAGS = 0x1 | 0x2 | 0x4 | 0x1000 | 0x80000
# Falcon's source normals produce non-finite tangents at every LOD. Reuse the
# hawk pelt mesh, which shares the same druid bird-helm silhouette, with the
# falcon albedo. The fallback is copied after the model loop so reruns work.
FALLBACKS = {"falcon": "hawk"}


def find_texture(folder: Path) -> Path:
    """Pick the base albedo, preferring it over a separate fur layer."""
    candidates = sorted(
        path
        for path in folder.rglob("*")
        if path.is_file() and path.suffix.lower() == ".texture" and "alb" in path.stem.lower()
    )
    if not candidates:
        raise FileNotFoundError(f"no albedo texture under {folder}")
    non_fur = [path for path in candidates if "fur" not in path.stem.lower()]
    return (non_fur or candidates)[0]


def decode_texture(path: Path, destination: Path) -> None:
    raw = path.read_bytes()
    code = struct.unpack_from("<H", raw, 4)[0]
    mip_count = raw[7]
    width, height = struct.unpack_from("<II", raw, 8)
    compression = COMPRESSION.get(code)
    if compression is None:
        raise ValueError(f"{path}: unsupported D2R texture compression code {code}")
    label, dxgi, block_bytes = compression

    data_start = 0x24 + mip_count * 8
    mip_bytes = math.ceil(width / 4) * math.ceil(height / 4) * block_bytes
    if data_start + mip_bytes > len(raw):
        raise ValueError(f"{path}: mip 0 does not fit in the file")
    pixels = raw[data_start : data_start + mip_bytes]

    header = bytearray(128)
    header[0:4] = b"DDS "
    struct.pack_into("<I", header, 4, 124)
    struct.pack_into("<I", header, 8, DDS_FLAGS)
    struct.pack_into("<I", header, 12, height)
    struct.pack_into("<I", header, 16, width)
    struct.pack_into("<I", header, 20, mip_bytes)
    struct.pack_into("<I", header, 28, 1)
    struct.pack_into("<I", header, 76, 32)
    struct.pack_into("<I", header, 80, 4)
    header[84:88] = b"DX10"
    struct.pack_into("<I", header, 108, 0x1000)
    dds = bytes(header) + struct.pack("<IIIII", dxgi, 3, 0, 1, 0) + pixels

    with Image.open(io.BytesIO(dds)) as image:
        image.convert("RGB").resize((TEXTURE_SIZE, TEXTURE_SIZE), Image.Resampling.LANCZOS).save(
            destination, "PNG", compress_level=9
        )
    print(f"  texture {label} {width}x{height} -> {destination.name}")


def run_divine(divine: Path, command: list[str], cwd: Path) -> None:
    result = subprocess.run(command, cwd=cwd, capture_output=True, text=True)
    if result.returncode == 0:
        return
    detail = (result.stdout + result.stderr).strip().splitlines()
    raise RuntimeError(f"exit {result.returncode}: {detail[-1] if detail else 'no output'}")


def convert_model(lslib_dir: Path, models: list[Path], work_stem: Path) -> Path:
    """Convert the first LOD that lslib can export; lod0 tangents can be bad."""
    divine = lslib_dir / "Tools" / "Divine.exe"
    if not divine.exists():
        raise FileNotFoundError(f"missing {divine}; pass --lslib-dir to an unpacked lslib Packed folder")
    errors = []
    for index, model in enumerate(models):
        dae = work_stem.with_name(f"{work_stem.name}_lod{index}.dae")
        glb = work_stem.with_name(f"{work_stem.name}_lod{index}.glb")
        commands = (
            [str(divine), "-a", "convert-model", "-g", "bg3", "-s", str(model), "-d", str(dae),
             "-i", "gr2", "-o", "dae", "-e", "export-uvs", "-e", "export-normals"],
            [str(divine), "-a", "convert-model", "-g", "bg3", "-s", str(dae), "-d", str(glb),
             "-i", "dae", "-o", "glb"],
        )
        try:
            for command in commands:
                run_divine(divine, command, lslib_dir)
        except RuntimeError as error:
            errors.append(f"lod{index}: {error}")
            print(f"  lod{index} failed ({error}); trying next")
            continue
        if glb.exists():
            print(f"  using lod{index}")
            return glb
        errors.append(f"lod{index}: no GLB")
    raise RuntimeError("; ".join(errors) or "no model LODs found")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--lslib-dir", type=Path)
    parser.add_argument("--skip-models", action="store_true", help="only regenerate albedo textures")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    if not args.source.exists():
        parser.error(f"source extract not found: {args.source}")
    if not args.skip_models and not args.lslib_dir:
        parser.error("--lslib-dir is required unless --skip-models is used")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    armor_root = args.source / "hd" / "items" / "armor"

    failures = []
    for visual_id, folder_name, stem in MODELS:
        folder = armor_root / folder_name
        models = sorted(folder.glob(f"{stem}_lod*.model"))
        if not models:
            print(f"skip {visual_id}: no {stem}_lod*.model in {folder}")
            failures.append(visual_id)
            continue
        print(visual_id)
        try:
            texture = find_texture(folder)
            decode_texture(texture, OUTPUT_DIR / f"{visual_id}.png")
        except (FileNotFoundError, ValueError) as error:
            print(f"  texture failed: {error}")

        glb = OUTPUT_DIR / f"{visual_id}.glb"
        if not args.skip_models and (args.force or not glb.exists()):
            try:
                converted = convert_model(args.lslib_dir, models, WORK_DIR / visual_id)
                glb.write_bytes(converted.read_bytes())
                print(f"  model -> {glb.name} ({glb.stat().st_size:,} bytes)")
            except RuntimeError as error:
                print(f"  model failed: {error}")
                failures.append(visual_id)

    for failed in list(failures):
        fallback = FALLBACKS.get(failed)
        fallback_path = OUTPUT_DIR / f"{fallback}.glb" if fallback else None
        if fallback_path and fallback_path.exists():
            (OUTPUT_DIR / f"{failed}.glb").write_bytes(fallback_path.read_bytes())
            print(f"  fallback {failed} -> {fallback} (source tangents are not finite)")
            failures.remove(failed)

    if failures:
        print(f"incomplete: {', '.join(failures)}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
