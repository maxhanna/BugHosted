"""Import D2R HD weapon and shield models for the 3D class models.

Like ``import_d2r_helmet_art.py`` this walks the extracted D2R data, converts
the level-of-detail 0 Granny ``.model`` to GLB through lslib (Divine), and
decodes the matching albedo ``.texture`` to a compact PNG.  Unlike helmets,
weapon and shield art is not one folder per base name: D2R authors one HD mesh
per *family* (``Short Sword``, ``Gladius`` and ``Falcata`` all use the
``short_sword`` mesh).  The family comes from ``hd/items/items.json``, which
names the HD asset each base code is actually held as (``ob5`` ->
``orb/dragon_stone``); ``normcode`` is only a scaling reference and, for
example, points every exceptional orb at a family D2R never ships.

Meshes lslib's SharpGLTF writer rejects (it gives up rebuilding tangents on a
fair number of shields, spears and claws) are written straight from the
COLLADA file lslib produced, so a family either gets its real mesh or is left
out of the generated table and falls back to the inventory cel.

Usage:
    python tools/import_d2r_weapon_art.py --lslib-dir .tmp-d2rconvert/lslib/Packed
    python tools/import_d2r_weapon_art.py --skip-models
    python tools/import_d2r_weapon_art.py --only short_sword,kite_shield
"""

from __future__ import annotations

import argparse
import io
import json
import math
import re
import struct
import subprocess
import sys
import xml.etree.ElementTree as ElementTree
from pathlib import Path

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "models" / "weapons"
WORK_DIR = PROJECT_ROOT / ".tmp-d2rconvert" / "weapons"
GENERATED_TS = PROJECT_ROOT / "src" / "app" / "d2survivors" / "d2-weapon-visuals.generated.ts"
FOOTPRINTS_TS = PROJECT_ROOT / "src" / "app" / "d2survivors" / "d2-item-footprints.ts"
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"
TEXTURE_SIZE = 128
# A shield fills a hero's whole flank, so it gets twice the detail of a blade;
# at 128px its painted face smeared into a flat-looking picture.
SHIELD_TEXTURE_SIZE = 256
# D2R stores a shield's normal map in BC3 with the two tangent axes in alpha
# and green (the colour channels are unused), so it needs its own decode.
NORMAL_TEXTURE_SIZE = 256

# compression code -> (label, DXGI format, bytes per 4x4 block)
COMPRESSION = {
    58: ("BC1", 71, 8),
    61: ("BC3", 77, 16),
    62: ("BC3_SRGB", 77, 16),
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


def decode_image(path: Path) -> tuple[str, int, int, Image.Image]:
    """Decode mip 0 of a D2R `.texture` file into a Pillow image."""
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
    return label, width, height, Image.open(io.BytesIO(dds)).convert("RGBA")


def decode_texture(path: Path, destination: Path, size: int = TEXTURE_SIZE) -> None:
    label, width, height, image = decode_image(path)
    image.convert("RGB").resize((size, size), Image.Resampling.LANCZOS).save(
        destination, "PNG", compress_level=9
    )
    print(f"  texture {label} {width}x{height} -> {destination.name} ({size}px)")


def decode_normal(path: Path, destination: Path, size: int = NORMAL_TEXTURE_SIZE) -> None:
    """Decode a D2R normal map into the tangent-space RGB three.js expects.

    D2R packs the two tangent axes into the alpha and green channels of a BC3
    texture (red and blue are unused), and the Y axis points down the image.
    Rebuilding Z from X and Y and flipping Y gives the OpenGL-convention map a
    `normalScale` of (1, 1) on the held-item material.
    """
    label, width, height, image = decode_image(path)
    source = image.load()
    normal = Image.new("RGB", image.size)
    target = normal.load()
    for y in range(height):
        for x in range(width):
            red, green, _blue, alpha = source[x, y]
            nx = alpha / 127.5 - 1.0
            ny = -(green / 127.5 - 1.0)
            nz = math.sqrt(max(0.0, 1.0 - nx * nx - ny * ny))
            target[x, y] = (
                int(round((nx * 0.5 + 0.5) * 255)),
                int(round((ny * 0.5 + 0.5) * 255)),
                int(round((nz * 0.5 + 0.5) * 255)),
            )
    normal.resize((size, size), Image.Resampling.LANCZOS).save(destination, "PNG", compress_level=9)
    print(f"  normal {label} {width}x{height} -> {destination.name} ({size}px)")


def find_normal(folder: Path) -> Path | None:
    for path in sorted(folder.rglob("*")):
        if path.is_file() and path.suffix.lower() == ".texture" and "nrm" in path.stem.lower():
            return path
    return None


def run_divine(divine: Path, command: list[str], cwd: Path) -> None:
    result = subprocess.run(command, cwd=cwd, capture_output=True, text=True)
    if result.returncode == 0:
        return
    detail = (result.stdout + result.stderr).strip().splitlines()
    raise RuntimeError(f"exit {result.returncode}: {detail[-1] if detail else 'no output'}")


def sanitize_dae_vectors(dae: Path) -> int:
    """Replace zero-length normals/tangents so lslib can write the GLB.

    A handful of weapon meshes carry tangents whose xyz part is (0, 0, 0).
    SharpGLTF normalises them while exporting and refuses the model with
    "Values are not finite. (Parameter 'Tangent')", which used to drop the whole
    family to its flat inventory art.  Swapping those entries for a unit vector
    keeps the mesh intact - the game re-derives tangents for these rigid pieces
    anyway.
    """
    text = dae.read_text(encoding="utf-8")
    fixed = 0
    for suffix, stride, fallback in (("normals", 3, (0.0, 1.0, 0.0)), ("tangents", 4, (1.0, 0.0, 0.0, 1.0))):
        pattern = re.compile(
            r'(<source id="[^"]*-' + suffix + r'"[^>]*>\s*<float_array[^>]*>)([^<]*)(</float_array>)', re.S)
        match = pattern.search(text)
        if not match:
            continue
        values = [float(value) for value in match.group(2).split()]
        changed = False
        for start in range(0, len(values) - stride + 1, stride):
            xyz = values[start:start + 3]
            if all(math.isfinite(value) for value in xyz) and sum(value * value for value in xyz) > 1e-8:
                continue
            values[start:start + stride] = list(fallback)
            changed = True
            fixed += 1
        if changed:
            body = "\n" + " ".join(f"{value:.6f}" for value in values) + "\n"
            text = text[:match.start(2)] + body + text[match.end(2):]
    if fixed:
        dae.write_text(text, encoding="utf-8")
    return fixed


def _local(element: ElementTree.Element) -> str:
    return element.tag.rsplit("}", 1)[-1]


def _child(element: ElementTree.Element, name: str) -> ElementTree.Element | None:
    for candidate in element:
        if _local(candidate) == name:
            return candidate
    return None


def _descendants(element: ElementTree.Element, name: str) -> list[ElementTree.Element]:
    return [candidate for candidate in element.iter() if _local(candidate) == name]


def read_dae_mesh(dae: Path) -> tuple[list[list[float]], list[list[float]], list[list[float]], list[int]]:
    """Pull one rigid COLLADA mesh out of a lslib DAE export.

    Returns (positions, normals, uvs, indices) with de-indexed corners, which is
    the same shape lslib's own GLB writer produces.
    """
    root = ElementTree.parse(dae).getroot()
    mesh = next(candidate for candidate in root.iter() if _local(candidate) == "mesh")

    arrays: dict[str, tuple[list[float], int]] = {}
    for source in _descendants(mesh, "source"):
        floats = _child(source, "float_array")
        technique = _child(source, "technique_common")
        accessor = _child(technique, "accessor") if technique is not None else None
        if floats is None or accessor is None or not floats.text:
            continue
        stride = int(accessor.get("stride", "3"))
        arrays[source.get("id", "")] = ([float(value) for value in floats.text.split()], stride)

    def source_id(suffix: str) -> str | None:
        for source_id_value in arrays:
            if source_id_value.endswith(suffix):
                return source_id_value
        return None

    position_id = source_id("-positions")
    normal_id = source_id("-normals")
    uv_id = source_id("-uvs0")
    if not position_id or not uv_id:
        raise ValueError(f"{dae.name}: no positions/uvs in the COLLADA mesh")

    triangles = _child(mesh, "triangles")
    if triangles is None:
        raise ValueError(f"{dae.name}: only triangle meshes are supported")
    inputs = {}
    for element in triangles:
        if _local(element) == "input":
            inputs[element.get("semantic", "")] = (int(element.get("offset", "0")), element.get("source", ""))
    indices_element = _child(triangles, "p")
    if indices_element is None or not indices_element.text:
        raise ValueError(f"{dae.name}: no triangle indices")
    stride = max(offset for offset, _ in inputs.values()) + 1
    corners = [int(value) for value in indices_element.text.split()]
    if len(corners) % (stride * 3) != 0:
        raise ValueError(f"{dae.name}: index count {len(corners)} is not triangles")

    position_offset, position_source = inputs.get("VERTEX") or inputs.get("POSITION") or (0, "#" + position_id)
    normal_offset, normal_source = inputs.get("NORMAL", (-1, ""))
    uv_offset, uv_source = inputs.get("TEXCOORD", (-1, ""))
    position_source = position_source.lstrip("#")
    normal_source = normal_source.lstrip("#") if normal_source else ""
    uv_source = uv_source.lstrip("#") if uv_source else ""

    positions: list[list[float]] = []
    normals: list[list[float]] = []
    uvs: list[list[float]] = []
    lookup: dict[tuple[int, ...], int] = {}
    out_indices: list[int] = []
    position_data, position_stride = arrays[position_source]
    normal_data, normal_stride = arrays[normal_source] if normal_source in arrays else ([], 3)
    uv_data, uv_stride = arrays[uv_source] if uv_source in arrays else ([], 2)

    for start in range(0, len(corners), stride):
        corner = corners[start:start + stride]
        vertex = corner[position_offset]
        key = (vertex, corner[normal_offset] if normal_offset >= 0 else -1,
               corner[uv_offset] if uv_offset >= 0 else -1)
        index = lookup.get(key)
        if index is None:
            index = len(positions)
            lookup[key] = index
            positions.append(position_data[vertex * position_stride:vertex * position_stride + 3])
            if normal_data:
                normal = normal_data[key[1] * normal_stride:key[1] * normal_stride + 3]
                length = math.sqrt(sum(value * value for value in normal))
                normals.append([value / length for value in normal] if length > 1e-8 else [0.0, 1.0, 0.0])
            else:
                normals.append([0.0, 1.0, 0.0])
            if uv_data:
                uvs.append(uv_data[key[2] * uv_stride:key[2] * uv_stride + 2])
            else:
                uvs.append([0.0, 0.0])
        out_indices.append(index)
    return positions, normals, uvs, out_indices


def _tangents(positions: list[list[float]], normals: list[list[float]],
              uvs: list[list[float]], indices: list[int]) -> list[list[float]]:
    accumulators = [[0.0, 0.0, 0.0] for _ in positions]
    for start in range(0, len(indices), 3):
        a, b, c = indices[start:start + 3]
        edge1 = [positions[b][axis] - positions[a][axis] for axis in range(3)]
        edge2 = [positions[c][axis] - positions[a][axis] for axis in range(3)]
        duv1 = [uvs[b][axis] - uvs[a][axis] for axis in range(2)]
        duv2 = [uvs[c][axis] - uvs[a][axis] for axis in range(2)]
        determinant = duv1[0] * duv2[1] - duv1[1] * duv2[0]
        if abs(determinant) < 1e-12:
            continue
        scale = 1.0 / determinant
        tangent = [(edge1[axis] * duv2[1] - edge2[axis] * duv1[1]) * scale for axis in range(3)]
        for index in (a, b, c):
            for axis in range(3):
                accumulators[index][axis] += tangent[axis]

    tangents = []
    for index, normal in enumerate(normals):
        tangent = accumulators[index]
        dot = sum(tangent[axis] * normal[axis] for axis in range(3))
        tangent = [tangent[axis] - normal[axis] * dot for axis in range(3)]
        length = math.sqrt(sum(value * value for value in tangent))
        tangents.append([value / length for value in tangent] + [1.0] if length > 1e-8 else [1.0, 0.0, 0.0, 1.0])
    return tangents


def write_glb_from_dae(dae: Path, glb: Path) -> None:
    """Fallback COLLADA -> GLB writer for meshes lslib's SharpGLTF export rejects.

    lslib refuses a good number of D2R shield, bow and claw meshes with
    "Values are not finite. (Parameter 'Tangent')" while rebuilding tangents.
    The geometry itself is fine, so write the same single-mesh GLB lslib would
    have produced: positions, normals, tangents, one UV set and triangle indices.
    """
    positions, normals, uvs, indices = read_dae_mesh(dae)
    tangents = _tangents(positions, normals, uvs, indices)

    payload = bytearray()
    views = []

    def append_floats(values: list[list[float]]) -> int:
        start = len(payload)
        for value in values:
            payload.extend(struct.pack(f"<{len(value)}f", *value))
        views.append({"buffer": 0, "byteOffset": start, "byteLength": len(payload) - start})
        return len(views) - 1

    position_view = append_floats(positions)
    normal_view = append_floats(normals)
    tangent_view = append_floats(tangents)
    uv_view = append_floats(uvs)
    index_start = len(payload)
    for index in indices:
        payload.extend(struct.pack("<I", index))
    views.append({"buffer": 0, "byteOffset": index_start, "byteLength": len(payload) - index_start})
    index_view = len(views) - 1
    while len(payload) % 4:
        payload.append(0)

    def bounds(values: list[list[float]], size: int) -> tuple[list[float], list[float]]:
        return ([min(value[axis] for value in values) for axis in range(size)],
                [max(value[axis] for value in values) for axis in range(size)])

    position_min, position_max = bounds(positions, 3)
    normal_min, normal_max = bounds(normals, 3)
    tangent_min, tangent_max = bounds(tangents, 4)
    uv_min, uv_max = bounds(uvs, 2)
    document = {
        "asset": {"generator": "tools/import_d2r_weapon_art.py", "version": "2.0"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [{
            "name": dae.stem,
            "primitives": [{
                "attributes": {"POSITION": 0, "NORMAL": 1, "TANGENT": 2, "TEXCOORD_0": 3},
                "indices": 4,
                "material": 0,
            }],
        }],
        "materials": [{"name": "Dummy", "pbrMetallicRoughness": {}}],
        "accessors": [
            {"bufferView": position_view, "componentType": 5126, "count": len(positions),
             "type": "VEC3", "min": position_min, "max": position_max},
            {"bufferView": normal_view, "componentType": 5126, "count": len(normals),
             "type": "VEC3", "min": normal_min, "max": normal_max},
            {"bufferView": tangent_view, "componentType": 5126, "count": len(tangents),
             "type": "VEC4", "min": tangent_min, "max": tangent_max},
            {"bufferView": uv_view, "componentType": 5126, "count": len(uvs),
             "type": "VEC2", "min": uv_min, "max": uv_max},
            {"bufferView": index_view, "componentType": 5125, "count": len(indices), "type": "SCALAR"},
        ],
        "bufferViews": views,
        "buffers": [{"byteLength": len(payload)}],
    }

    json_chunk = json.dumps(document, separators=(",", ":")).encode("utf-8")
    while len(json_chunk) % 4:
        json_chunk += b" "
    total = 12 + 8 + len(json_chunk) + 8 + len(payload)
    glb.write_bytes(
        struct.pack("<III", 0x46546C67, 2, total)
        + struct.pack("<II", len(json_chunk), 0x4E4F534A) + json_chunk
        + struct.pack("<II", len(payload), 0x004E4942) + bytes(payload)
    )


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
            run_divine(divine, commands[0], lslib_dir)
            sanitize_dae_vectors(dae)
            try:
                run_divine(divine, commands[1], lslib_dir)
            except RuntimeError:
                # lslib's GLB writer gives up on some meshes while rebuilding
                # tangents; the COLLADA file it just wrote is still good.
                write_glb_from_dae(dae, glb)
                print(f"  wrote lod{index} GLB directly (lslib GLB export failed)")
        except (RuntimeError, ValueError, StopIteration) as error:
            errors.append(f"lod{index}: {error}")
            print(f"  lod{index} failed ({error}); trying next")
            continue
        if glb.exists():
            print(f"  using lod{index}")
            return glb
        errors.append(f"lod{index}: no GLB")
    raise RuntimeError("; ".join(errors) or "no model LODs found")


def hd_item_assets(source: Path) -> dict[str, str]:
    """Base code -> D2R HD item asset path, straight from the game's items.json.

    Diablo II's ``normcode`` column only says which base an exceptional or elite
    item normalises to for affix levels; it is not the held mesh.  Every
    exceptional orb, for example, normalises to ``ob5``, so the normalised family
    named a mesh D2R never ships (``jareds_stone``) and those items fell back to
    their flat inventory art.  D2R's own ``hd/items/items.json`` names the asset
    each base code actually uses (``ob5`` -> ``orb/dragon_stone``), which is what
    the character holds.
    """
    path = source / "hd" / "items" / "items.json"
    if not path.exists():
        return {}
    assets: dict[str, str] = {}
    for entry in json.loads(path.read_text(encoding="utf-8")):
        if not isinstance(entry, dict):
            continue
        for code, info in entry.items():
            asset = info.get("asset") if isinstance(info, dict) else None
            if isinstance(asset, str) and asset:
                assets[code] = asset
    return assets


def resolve_families(source: Path) -> tuple[dict[str, str], dict[str, Path]]:
    """Map every wieldable base name to its D2R family folder and mesh path."""
    weapons = read_table(source / "global" / "excel" / "weapons.txt")
    armor = read_table(source / "global" / "excel" / "armor.txt")
    rows = armor + weapons
    normal_name: dict[str, str] = {}
    for row in rows:
        normal_name.setdefault(row.get("code", ""), row.get("name", ""))
    by_name = {row["name"].lower(): row for row in rows if row.get("name")}
    assets = hd_item_assets(source)

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
        code = row.get("code", "")
        # The base's own HD asset first; several bases share one mesh family.
        # A few elite bases (War Fist, Runic Talons) have no items.json entry of
        # their own, so fall back to the asset of the base they normalise to.
        asset = assets.get(code) or assets.get(row.get("normcode") or code)
        folder = (asset.split("/")[-1]) if asset else None
        if folder is None or folder not in meshes:
            family = normal_name.get(row.get("normcode") or code, row.get("name", ""))
            folder = snake(family)
        if folder in meshes and folder not in NO_MESH:
            base_to_family[name.lower()] = folder
    return base_to_family, meshes


def write_generated(base_to_family: dict[str, str], available: dict[str, str],
                    normals: set[str]) -> None:
    lines = [
        "// Generated by tools/import_d2r_weapon_art.py - do not edit by hand.",
        "// Weapon and shield GLBs, albedo maps and shield normal maps live in",
        "// assets/d2survivors/models/weapons.",
        "",
        "export interface D2WeaponVisual {",
        "  id: string;",
        "  model: string;",
        "  texture: string;",
        "  /** D2R tangent-space normal map; only the shield families ship one. */",
        "  normal?: string;",
        "}",
        "",
        'const WEAPON_ROOT = "assets/d2survivors/models/weapons";',
        "",
        "function weapon(id: string, normal?: string): D2WeaponVisual {",
        "  return {",
        "    id,",
        "    model: `${WEAPON_ROOT}/${id}.glb`,",
        "    texture: `${WEAPON_ROOT}/${id}.png`,",
        "    ...(normal ? { normal: `${WEAPON_ROOT}/${normal}` } : {}),",
        "  };",
        "}",
        "",
        "export const D2_WEAPON_VISUALS: Readonly<Record<string, D2WeaponVisual>> = {",
    ]
    for item_id in sorted(available):
        if item_id in normals:
            lines.append(f'  "{item_id}": weapon("{item_id}", "{item_id}_nrm.png"),')
        else:
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
    normals: set[str] = set()
    failures = []
    for family in families:
        model = meshes[family]
        print(family)
        # Shields are held face-on across the hero's flank, so their paint and
        # relief need more than a blade's single 128px swatch.
        is_shield = "shield" in model.parent.parent.name.lower()
        try:
            decode_texture(find_texture(model.parent), OUTPUT_DIR / f"{family}.png",
                           SHIELD_TEXTURE_SIZE if is_shield else TEXTURE_SIZE)
        except (FileNotFoundError, ValueError) as error:
            print(f"  texture failed: {error}")
        normal_path = find_normal(model.parent) if is_shield else None
        if normal_path is not None:
            try:
                decode_normal(normal_path, OUTPUT_DIR / f"{family}_nrm.png")
                normals.add(family)
            except (FileNotFoundError, ValueError) as error:
                print(f"  normal failed: {error}")
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
        family = orphan.name[: -len("_nrm.png")] if orphan.name.endswith("_nrm.png") else orphan.stem
        if not (OUTPUT_DIR / f"{family}.glb").exists():
            orphan.unlink()
            print(f"  removed orphan {orphan.name}")
    for normal in OUTPUT_DIR.glob("*_nrm.png"):
        if normal.stem[: -len("_nrm")] not in normals:
            normal.unlink()
            print(f"  removed unused normal {normal.name}")

    write_generated(base_to_family, available, normals)
    print(f"wrote {GENERATED_TS.relative_to(PROJECT_ROOT)}")
    if failures:
        print(f"incomplete: {', '.join(failures)}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
