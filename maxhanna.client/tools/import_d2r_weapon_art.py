"""Import D2R HD weapon and shield models for the 3D class models.

Like ``import_d2r_helmet_art.py`` this walks the extracted D2R data, converts
the level-of-detail 0 Granny ``.model`` to GLB through lslib (Divine), and
decodes the matching albedo ``.texture`` to a compact PNG.  Unlike helmets,
weapon and shield art is not one folder per base name: D2R authors one HD mesh
per *family* (``Short Sword``, ``Gladius`` and ``Falcata`` all use the
``short_sword`` mesh).  The family is found through ``normcode`` in
``weapons.txt`` / ``armor.txt``, and the mesh folder is the snake-case family
name.

Usage:
    python tools/import_d2r_weapon_art.py --lslib-dir .tmp-d2rconvert/lslib/Packed
    python tools/import_d2r_weapon_art.py --skip-models
    python tools/import_d2r_weapon_art.py --only short_sword,kite_shield
"""

from __future__ import annotations

import argparse
import io
import math
import re
import struct
import subprocess
import sys
from pathlib import Path

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "models" / "weapons"
WORK_DIR = PROJECT_ROOT / ".tmp-d2rconvert" / "weapons"
GENERATED_TS = PROJECT_ROOT / "src" / "app" / "d2survivors" / "d2-weapon-visuals.generated.ts"
FOOTPRINTS_TS = PROJECT_ROOT / "src" / "app" / "d2survivors" / "d2-item-footprints.ts"
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"
TEXTURE_SIZE = 128

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

# Holds that have no wieldable HD mesh even though the item row exists.
NO_MESH = {"flat", "fist", "none"}


def snake(name: str) -> str:
    name = name.lower().replace("'", "").replace("\u2019", "")
    return re.sub(r"[^a-z0-9]+", "_", name).strip("_")


def read_table(path: Path) -> list[dict[str, str]]:
    lines = [line for line in path.read_text(encoding="latin-1").split("\n") if line.strip()]
    if not lines:
        return []
    head = lines[0].rstrip("\r").split("\t")
    return [dict(zip(head, line.rstrip("\r").split("\t"))) for line in lines[1:]]


def base_item_names() -> list[str]:
    """Every base item the game can place in the inventory grid."""
    source = FOOTPRINTS_TS.read_text(encoding="utf-8")
    return re.findall(r'^  "([^"]+)": \{ width:', source, re.M)


def find_texture(folder: Path) -> Path:
    """Pick the base albedo, preferring it over any left-hand or fur variant."""
    candidates = sorted(
        path
        for path in folder.rglob("*")
        if path.is_file() and path.suffix.lower() == ".texture" and "alb" in path.stem.lower()
    )
    if not candidates:
        raise FileNotFoundError(f"no albedo texture under {folder}")
    return candidates[0]


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


def resolve_families(source: Path) -> tuple[dict[str, str], dict[str, Path]]:
    """Map every wieldable base name to its D2R family folder and mesh path."""
    weapons = read_table(source / "global" / "excel" / "weapons.txt")
    armor = read_table(source / "global" / "excel" / "armor.txt")
    rows = armor + weapons
    normal_name: dict[str, str] = {}
    for row in rows:
        normal_name.setdefault(row.get("code", ""), row.get("name", ""))
    by_name = {row["name"].lower(): row for row in rows if row.get("name")}

    meshes: dict[str, Path] = {}
    for root in (source / "hd" / "items" / "weapon", source / "hd" / "items" / "armor" / "shield",
                 source / "hd" / "items" / "armor" / "voodoo_head"):
        for model in root.rglob("*_lod0.model"):
            meshes.setdefault(model.parent.name, model)

    base_to_family: dict[str, str] = {}
    for name in base_item_names():
        row = by_name.get(name.lower())
        if not row:
            continue
        family = normal_name.get(row.get("normcode") or row.get("code", ""), row.get("name", ""))
        folder = snake(family)
        if folder in meshes and folder not in NO_MESH:
            base_to_family[name.lower()] = folder
    return base_to_family, meshes


def write_generated(base_to_family: dict[str, str], available: dict[str, str]) -> None:
    lines = [
        "// Generated by tools/import_d2r_weapon_art.py - do not edit by hand.",
        "// Weapon and shield GLBs and 128px albedo maps live in",
        "// assets/d2survivors/models/weapons.",
        "",
        "export interface D2WeaponVisual {",
        "  id: string;",
        "  model: string;",
        "  texture: string;",
        "}",
        "",
        'const WEAPON_ROOT = "assets/d2survivors/models/weapons";',
        "",
        "function weapon(id: string): D2WeaponVisual {",
        "  return {",
        "    id,",
        "    model: `${WEAPON_ROOT}/${id}.glb`,",
        "    texture: `${WEAPON_ROOT}/${id}.png`,",
        "  };",
        "}",
        "",
        "export const D2_WEAPON_VISUALS: Readonly<Record<string, D2WeaponVisual>> = {",
    ]
    for item_id in sorted(available):
        lines.append(f'  "{item_id}": weapon("{item_id}"),')
    lines += [
        "};",
        "",
        "/** D2 base item name (lower case) -> D2R HD family mesh id. */",
        "export const D2_WEAPON_BASE_VISUALS: Readonly<Record<string, string>> = {",
    ]
    for base, family in sorted(base_to_family.items()):
        if family not in available:
            continue
        lines.append(f'  "{base}": "{family}",')
    lines += [
        "};",
        "",
        "/**",
        " * The D2R HD held-item mesh for an item, or null when the extraction has no",
        " * family mesh for it (the caller falls back to the inventory cel).",
        " */",
        "export function getWeaponVisualForItem(item: { baseName?: string; name: string }): D2WeaponVisual | null {",
        '  const base = (item.baseName ?? "").trim().toLowerCase();',
        '  const id = D2_WEAPON_BASE_VISUALS[base] ?? D2_WEAPON_BASE_VISUALS[item.name.trim().toLowerCase()];',
        "  return id ? D2_WEAPON_VISUALS[id] ?? null : null;",
        "}",
        "",
    ]
    GENERATED_TS.write_text("\n".join(lines), encoding="utf-8", newline="\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--lslib-dir", type=Path)
    parser.add_argument("--skip-models", action="store_true", help="only regenerate albedo textures")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--only", type=str, default="", help="comma separated family ids")
    args = parser.parse_args()

    if not args.source.exists():
        parser.error(f"source extract not found: {args.source}")
    if not args.skip_models and not args.lslib_dir:
        parser.error("--lslib-dir is required unless --skip-models is used")

    base_to_family, meshes = resolve_families(args.source)
    families = sorted(set(base_to_family.values()))
    if args.only:
        wanted = {part.strip() for part in args.only.split(",") if part.strip()}
        families = [family for family in families if family in wanted]
    print(f"{len(base_to_family)} base items over {len(families)} HD families")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    WORK_DIR.mkdir(parents=True, exist_ok=True)

    available: dict[str, str] = {}
    failures = []
    for family in families:
        model = meshes[family]
        print(family)
        try:
            decode_texture(find_texture(model.parent), OUTPUT_DIR / f"{family}.png")
        except (FileNotFoundError, ValueError) as error:
            print(f"  texture failed: {error}")
        glb = OUTPUT_DIR / f"{family}.glb"
        if not args.skip_models and (args.force or not glb.exists()):
            models = sorted(model.parent.glob(f"{model.stem.split('_lod')[0]}_lod*.model"))
            try:
                converted = convert_model(args.lslib_dir, models, WORK_DIR / family)
                glb.write_bytes(converted.read_bytes())
                print(f"  model -> {glb.name} ({glb.stat().st_size:,} bytes)")
            except RuntimeError as error:
                print(f"  model failed: {error}")
        if glb.exists():
            available[family] = family
        else:
            failures.append(family)

    # Families whose mesh failed still wrote an albedo; drop the orphans so the
    # asset folder only holds art the generated table points at.
    for orphan in OUTPUT_DIR.glob("*.png"):
        if not orphan.with_suffix(".glb").exists():
            orphan.unlink()
            print(f"  removed orphan {orphan.name}")

    write_generated(base_to_family, available)
    print(f"wrote {GENERATED_TS.relative_to(PROJECT_ROOT)}")
    if failures:
        print(f"incomplete: {', '.join(failures)}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
