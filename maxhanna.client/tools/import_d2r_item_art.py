"""Import the original Diablo II item art and the complete unique/set catalogues.

`data/global/items` holds the real item sprites: 470 `inv*` cels for the
inventory/paperdoll and 268 `flp*` cels for loot lying on the ground. They are
classic DC6 sprites painted with `data/global/palette/act1/pal.dat`.

Outputs:

* `assets/d2survivors/items/d2/<file>.png` - every inventory cel;
* `assets/d2survivors/items/<type>.png` - the sixteen equipment-category icons;
* `assets/d2survivors/items/ground/<file>.png` - every flippy resting frame;
* `assets/d2survivors/items/ground-anim/<file>.png` - each flippy's offset-aligned
  animation strip, one shared-size cell per frame;
* `assets/d2survivors/items/unique/<item>.png` and `items/set/<item>.png` -
  unique/set inventory cels (dedicated art when present, otherwise the base cel
  recoloured with the item's D2 transform colour);
* `src/app/d2survivors/d2-item-assets.generated.ts` - base art maps plus every
  unique and set item with its real base stats, modifiers and set bonuses.

Usage:
    python tools/import_d2r_item_art.py
    python tools/import_d2r_item_art.py --list
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path

import d2r_dc6 as dc6
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "items"
GROUND_ROOT = ASSET_ROOT / "ground"
GROUND_ANIM_ROOT = ASSET_ROOT / "ground-anim"
UNIQUE_ROOT = ASSET_ROOT / "unique"
SET_ROOT = ASSET_ROOT / "set"
GENERATED_MAP = PROJECT_ROOT / "src" / "app" / "d2survivors" / "d2-item-assets.generated.ts"
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"
PALETTE_PATH = ("global", "palette", "act1", "pal.dat")
EXCEL_FILES = ("weapons.txt", "armor.txt", "misc.txt")

# Base names this game uses that have no row in the D2 excel tables but are
# visually one of the classic base items, so they still get real cel art.
ALIASES: dict[str, str] = {
    "leather cap": "invcap",
    "chain hauberk": "invchn",
    "gold amulet": "invamu",
    "ring of the artisan": "invrin1",
    "crimson small charm": "invchm",
    "azure small charm": "invchm",
    "soulstone shard": "invchm",
    "quill of the fates": "invchm",
    "barbarian battle axe": "invbtx",
    "barbarian great sword": "invgsd",
    "barbarian throwing axe": "invtax",
}

GROUND_ALIASES: dict[str, str] = {
    "leather cap": "flpcap",
    "chain hauberk": "flpchn",
    "gold amulet": "flpamu",
    "ring of the artisan": "flprin",
    "crimson small charm": "flpchm",
    "azure small charm": "flpchm",
    "soulstone shard": "flpchm",
    "quill of the fates": "flpchm",
    "barbarian battle axe": "flpbtx",
    "barbarian great sword": "flpgsd",
    "barbarian throwing axe": "flptax",
}

# D2 transform colour code -> the hue its shaded inventory art is rebuilt from.
TINT_RGB: dict[str, tuple[int, int, int]] = {
    "whit": (232, 232, 224),
    "bwht": (255, 255, 255),
    "lgry": (176, 176, 176),
    "dgry": (104, 104, 104),
    "blac": (52, 48, 44),
    "lblu": (108, 160, 224),
    "dblu": (52, 88, 168),
    "cblu": (96, 204, 255),
    "lred": (224, 96, 88),
    "dred": (144, 40, 40),
    "cred": (255, 72, 80),
    "lgrn": (108, 200, 96),
    "dgrn": (52, 120, 52),
    "cgrn": (72, 236, 128),
    "lyel": (240, 220, 120),
    "dyel": (176, 144, 40),
    "lgld": (236, 196, 96),
    "dgld": (152, 112, 40),
    "lpur": (188, 132, 232),
    "dpur": (104, 56, 164),
    "oran": (236, 144, 48),
}

# Equipment category the component asks for -> DC6 candidates in preference order.
CATEGORIES: dict[str, list[str]] = {
    "weapon": ["invssd", "invbsw", "invaxe", "invhax", "invlsw"],
    "wand": ["invbwn", "invwnd", "invbst"],
    "claw": ["invclw", "invclm", "invwsp"],
    "orb": ["invob1", "invorb"],
    "helmet": ["invcap", "invskp", "invhlm"],
    "barbarian-helm": ["invbhm", "invbab", "invbhmu"],
    "druid-pelt": ["invdr1", "invdr2", "invpelt"],
    "body": ["invlea", "invqlt", "invba1"],
    "shield": ["invbuc", "invsml", "invshld"],
    "paladin-shield": ["invpa1", "invpa2", "invpal"],
    "gloves": ["invlgl", "invvgl", "invglv"],
    "boots": ["invvbt", "invlbt", "invbot"],
    "belt": ["invvbl", "invlbl", "invblt"],
    "ring": ["invrin1", "invring", "invrin2"],
    "amulet": ["invamu", "invamu1", "invam1"],
    "charm": ["invchm", "invch1", "invch2"],
}

WEAPON_TYPES = {
    "axe", "swor", "mace", "hamm", "club", "scep", "wand", "staf", "bow", "xbow",
    "jave", "ajav", "abow", "aspe", "spea", "pole", "tkni", "taxe", "knif", "h2h",
    "h2h2", "orb", "grim",
}
CLASS_RESTRICTED_TYPES = {
    "abow": "amazon", "aspe": "amazon", "ajav": "amazon",
    "h2h2": "assassin", "orb": "sorceress",
    "phlm": "barbarian", "pelt": "druid", "ashd": "paladin",
    "head": "necromancer", "grim": "necromancer",
}


def find(source: Path, stem: str) -> Path | None:
    path = source / "global" / "items" / f"{stem.lower()}.dc6"
    return path if path.is_file() else None


def import_all(source: Path, palette: list[tuple[int, int, int]]) -> dict:
    output = ASSET_ROOT / "d2"
    output.mkdir(parents=True, exist_ok=True)
    imported = {}
    failures = 0
    for path in sorted((source / "global" / "items").glob("inv*.dc6")):
        name = path.stem.lower()
        try:
            image = dc6.render(path, palette)
        except Exception as error:  # noqa: BLE001 - report and keep importing
            failures += 1
            print(f"skip {name}: {error}")
            continue
        image.save(output / f"{name}.png", "PNG", optimize=True)
        imported[name] = {"width": image.width, "height": image.height}
    print(f"imported {len(imported)}/{len(imported) + failures} inventory cels")
    return imported


def render_ground(path: Path, palette: list[tuple[int, int, int]]) -> Image.Image:
    """The resting frame of a flippy dc6: the last frame of its first direction."""
    animation = dc6.parse(path.read_bytes())
    frame = animation["frames"][animation["frames_per_dir"] - 1]
    image = dc6.frame_image(frame, palette)
    box = image.getbbox()
    return image.crop(box) if box else image


def import_ground(source: Path, palette: list[tuple[int, int, int]]) -> dict:
    output = GROUND_ROOT
    output.mkdir(parents=True, exist_ok=True)
    imported = {}
    failures = 0
    for path in sorted((source / "global" / "items").glob("flp*.dc6")):
        name = path.stem.lower()
        try:
            image = render_ground(path, palette)
        except Exception as error:  # noqa: BLE001 - report and keep importing
            failures += 1
            print(f"skip {name}: {error}")
            continue
        if image.getbbox() is None:
            failures += 1
            print(f"skip {name}: empty resting frame")
            continue
        image.save(output / f"{name}.png", "PNG", optimize=True)
        imported[name] = {"width": image.width, "height": image.height}
    print(f"imported {len(imported)}/{len(imported) + failures} ground cels")
    return imported


def render_ground_animation(path: Path, palette: list[tuple[int, int, int]]) -> tuple[Image.Image, dict]:
    """Pack a flippy's first direction into one offset-aligned animation strip.

    The DCC frames carry large signed offsets: the item starts above the floor,
    arcs through its flip, and lands on the last frame. Every frame is placed in
    a shared cell using those offsets so the strip keeps that motion instead of
    wobbling around a cropped centre. The anchor is the last frame's visible
    bottom centre, which is exactly where the existing resting PNG is drawn.
    """
    animation = dc6.parse(path.read_bytes())
    frames = animation["frames"][:animation["frames_per_dir"]]
    if not frames:
        raise ValueError("flippy has no frames")
    images = [dc6.frame_image(frame, palette) for frame in frames]
    last_box = images[-1].getbbox()
    if last_box is None:
        raise ValueError("flippy has an empty resting frame")
    min_x = min(frame["offsetX"] for frame in frames)
    max_x = max(frame["offsetX"] + image.width for frame, image in zip(frames, images))
    min_y = min(frame["offsetY"] for frame in frames)
    max_y = max(frame["offsetY"] + image.height for frame, image in zip(frames, images))
    cell_width = max_x - min_x
    cell_height = max_y - min_y
    if cell_width <= 0 or cell_height <= 0:
        raise ValueError("flippy has no visible extent")
    strip = Image.new("RGBA", (cell_width * len(frames), cell_height), (0, 0, 0, 0))
    for index, (frame, image) in enumerate(zip(frames, images)):
        strip.alpha_composite(image, (index * cell_width + frame["offsetX"] - min_x, frame["offsetY"] - min_y))
    last = frames[-1]
    anchor_x = round(last["offsetX"] + (last_box[0] + last_box[2]) / 2 - min_x)
    anchor_y = last["offsetY"] + last_box[3] - min_y
    return strip, {
        "frames": len(frames),
        "frameWidth": cell_width,
        "frameHeight": cell_height,
        "anchorX": anchor_x,
        "anchorY": anchor_y,
    }


def import_ground_animations(source: Path, palette: list[tuple[int, int, int]]) -> dict:
    output = GROUND_ANIM_ROOT
    output.mkdir(parents=True, exist_ok=True)
    imported = {}
    failures = 0
    for path in sorted((source / "global" / "items").glob("flp*.dc6")):
        name = path.stem.lower()
        try:
            strip, info = render_ground_animation(path, palette)
            strip.save(output / f"{name}.png", "PNG", optimize=True)
            imported[name] = info
        except Exception as error:  # noqa: BLE001 - report and keep importing
            failures += 1
            print(f"skip {name} animation: {error}")
    print(f"imported {len(imported)}/{len(imported) + failures} ground animations")
    return imported


def tint_image(image: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    """Recolour a cel as a shaded duotone in the D2 transform colour."""
    shadow = tuple(int(channel * 0.18) for channel in color)
    highlight = tuple(min(255, int(channel * 1.18 + 40)) for channel in color)
    source = image.convert("RGBA")
    pixels = source.load()
    output = Image.new("RGBA", source.size)
    target = output.load()
    for y in range(source.height):
        for x in range(source.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                continue
            luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
            if luminance < 0.5:
                ratio = luminance / 0.5
                mixed = tuple(int(shadow[i] + (color[i] - shadow[i]) * ratio) for i in range(3))
            else:
                ratio = (luminance - 0.5) / 0.5
                mixed = tuple(int(color[i] + (highlight[i] - color[i]) * ratio) for i in range(3))
            target[x, y] = (*mixed, alpha)
    return output


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "item"


def read_excel(source: Path, filename: str) -> list[dict[str, str]]:
    path = source / "global" / "excel" / filename
    if not path.is_file():
        return []
    return list(csv.DictReader(path.read_text(encoding="latin-1").splitlines(), delimiter="\t"))


SKILL_NAMES: dict[int, str] = {}


def load_skill_names(source: Path) -> dict[int, str]:
    """Skill id -> display name, so numeric hit-skill/charged params read correctly."""
    names: dict[int, str] = {}
    for row in read_excel(source, "skills.txt"):
        skill_id = integer(cell(row, "*Id"), -1)
        name = cell(row, "skill")
        if skill_id >= 0 and name:
            names[skill_id] = name
    return names


def skill_name(value: str) -> str:
    raw = (value or "").strip()
    if raw.isdigit():
        return SKILL_NAMES.get(int(raw), raw)
    return raw


def cell(row: dict[str, str], key: str) -> str:
    return (row.get(key) or "").strip()


def number(value: str | None, default: float = 0.0) -> float:
    try:
        return float((value or "").strip())
    except ValueError:
        return default


def integer(value: str | None, default: int = 0) -> int:
    return int(round(number(value, default)))


def compact(stats: dict[str, float]) -> dict[str, int]:
    return {key: int(round(value)) for key, value in stats.items() if value}


def collect_base_items(source: Path) -> dict[str, dict[str, str]]:
    """base item code -> the D2 row fields needed by the named catalogues."""
    bases: dict[str, dict[str, str]] = {}
    for filename in EXCEL_FILES:
        for row in read_excel(source, filename):
            code = cell(row, "code").lower()
            name = cell(row, "name")
            if not code or not name:
                continue
            bases.setdefault(code, {
                "name": name,
                "type": cell(row, "type").lower(),
                "type2": cell(row, "type2").lower(),
                "levelreq": cell(row, "levelreq"),
                "reqstr": cell(row, "reqstr"),
                "reqdex": cell(row, "reqdex"),
                "mindam": cell(row, "mindam"),
                "maxdam": cell(row, "maxdam"),
                "minmisdam": cell(row, "minmisdam"),
                "maxmisdam": cell(row, "maxmisdam"),
                "minac": cell(row, "minac"),
                "maxac": cell(row, "maxac"),
                "invwidth": cell(row, "invwidth"),
                "invheight": cell(row, "invheight"),
                "invfile": cell(row, "invfile").lower(),
                "flippyfile": cell(row, "flippyfile").lower(),
                "speed": cell(row, "speed"),
                "file": filename,
            })
    return bases


def classify_base(base: dict[str, str]) -> tuple[str, str, str | None] | None:
    item_type = base["type"]
    restricted = CLASS_RESTRICTED_TYPES.get(item_type)
    if item_type == "tors":
        return "armor", "body", None
    if item_type in ("helm", "circ"):
        return "armor", "helmet", None
    if item_type == "phlm":
        return "armor", "barbarianHelm", restricted
    if item_type == "pelt":
        return "armor", "druidPelt", restricted
    if item_type == "shie":
        return "armor", "shield", None
    if item_type == "ashd":
        return "armor", "paladinShield", restricted
    if item_type in ("head", "grim"):
        return "armor", "shield", restricted
    if item_type == "glov":
        return "armor", "gloves", None
    if item_type == "boot":
        return "armor", "boots", None
    if item_type == "belt":
        return "belt", "belt", None
    if item_type == "ring":
        return "charm", "ring", None
    if item_type == "amul":
        return "charm", "amulet", None
    if item_type in ("scha", "mcha", "lcha", "jewl", "cjwl", "csch"):
        return "charm", "charm", None
    if item_type in WEAPON_TYPES:
        equipment = "wand" if item_type == "wand" else "claw" if item_type == "h2h2" else "orb" if item_type == "orb" else "weapon"
        return "weapon", equipment, restricted
    return None


def item_size(base: dict[str, str], slot: str, item_type: str) -> tuple[int, int]:
    width = integer(base["invwidth"], 0)
    height = integer(base["invheight"], 0)
    if 1 <= width <= 2 and 1 <= height <= 4:
        return width, height
    if slot == "weapon":
        if item_type in ("bow", "xbow", "pole", "staf", "spea"):
            return 2, 4
        if item_type in ("tkni", "taxe", "jave", "ajav"):
            return 1, 2
        return 1, 3
    if slot == "belt":
        return 2, 1
    if slot == "armor":
        return (2, 3) if item_type == "tors" else (2, 2)
    if item_type == "lcha":
        return 1, 3
    if item_type == "mcha":
        return 1, 2
    return 1, 1


def base_stats(base: dict[str, str], slot: str, item_type: str) -> dict[str, float]:
    stats: dict[str, float] = {}
    if slot == "weapon":
        minimum = integer(base["mindam"], 0)
        maximum = integer(base["maxdam"], 0)
        if not minimum and not maximum:
            minimum = integer(base["minmisdam"], 0)
            maximum = integer(base["maxmisdam"], 0)
        stats["damageMin"] = max(1, minimum)
        stats["damageMax"] = max(stats["damageMin"] + 1, maximum)
    if slot == "armor":
        armor = (integer(base["minac"], 0) + integer(base["maxac"], 0)) / 2
        if armor > 0:
            stats["armor"] = round(armor)
    strength = integer(base["reqstr"], 0)
    dexterity = integer(base["reqdex"], 0)
    if strength > 0:
        stats["requiresStrength"] = strength
    if dexterity > 0:
        stats["requiresDexterity"] = dexterity
    return stats


def property_values(code: str, par: str, minimum: str, maximum: str) -> tuple[int, int, int]:
    low = integer(minimum, 0)
    high = integer(maximum, 0)
    if code.endswith("/lvl"):
        value = high or low or integer(par, 1)
    else:
        value = high or low or 1
    return low, high, value


def format_property(code: str, par: str, low: int, high: int, value: int) -> str:
    code = code.lstrip("*")
    if code in ("dmg-fire", "dmg-cold", "dmg-ltng", "dmg-mag", "dmg-pois", "dmg-norm"):
        element = {"dmg-fire": "Fire", "dmg-cold": "Cold", "dmg-ltng": "Lightning", "dmg-mag": "Magic", "dmg-pois": "Poison", "dmg-norm": ""}[code]
        damage = f"{low}-{high}" if high > low else str(value)
        return f"Adds {damage}{(' ' + element) if element else ''} Damage" + (" over Time" if code == "dmg-pois" else "")
    if code in ("fire-min", "fire-max", "cold-min", "cold-max", "ltng-min", "ltng-max", "pois-min", "pois-max"):
        element = "Fire" if code.startswith("fire") else "Cold" if code.startswith("cold") else "Lightning" if code.startswith("ltng") else "Poison"
        return f"Adds {value} {element} Damage"
    if code in ("pois-len", "cold-len"):
        element = "Poison" if code.startswith("pois") else "Cold"
        return f"+{value} {element} Damage Duration"
    labels = {
        "str": f"+{value} to Strength",
        "dex": f"+{value} to Dexterity",
        "vit": f"+{value} to Vitality",
        "enr": f"+{value} to Energy",
        "all-stats": f"+{value} to All Attributes",
        "hp": f"+{value} to Life",
        "mana": f"+{value} to Mana",
        "hp%": f"+{value}% to Maximum Life",
        "mana%": f"+{value}% to Maximum Mana",
        "ac": f"+{value} Defense",
        "ac%": f"+{value}% Enhanced Defense",
        "ac/lvl": f"+{value} Defense per Level",
        "dmg%": f"+{value}% Enhanced Damage",
        "dmg-min": f"+{value} to Minimum Damage",
        "dmg-max": f"+{value} to Maximum Damage",
        "dmg/lvl": f"+{value} to Maximum Damage per Level",
        "hp/lvl": f"+{value} to Life per Level",
        "mana/lvl": f"+{value} to Mana per Level",
        "att": f"+{value} to Attack Rating",
        "att%": f"{value}% Bonus to Attack Rating",
        "att/lvl": f"+{value} to Attack Rating per Level",
        "swing1": f"+{value}% Increased Attack Speed",
        "swing2": f"+{value}% Increased Attack Speed",
        "swing3": f"+{value}% Increased Attack Speed",
        "cast1": f"+{value}% Faster Cast Rate",
        "cast2": f"+{value}% Faster Cast Rate",
        "cast3": f"+{value}% Faster Cast Rate",
        "balance1": f"+{value}% Faster Hit Recovery",
        "balance2": f"+{value}% Faster Hit Recovery",
        "balance3": f"+{value}% Faster Hit Recovery",
        "move1": f"+{value}% Faster Run/Walk",
        "move2": f"+{value}% Faster Run/Walk",
        "move3": f"+{value}% Faster Run/Walk",
        "block": f"{value}% Increased Chance of Blocking",
        "block2": f"+{value}% Faster Block Rate",
        "block3": f"{value}% Increased Chance of Blocking",
        "lifesteal": f"{value}% Life Stolen per Hit",
        "manasteal": f"{value}% Mana Stolen per Hit",
        "crush": f"{value}% Chance of Crushing Blow",
        "deadly": f"{value}% Deadly Strike",
        "openwounds": f"{value}% Chance of Open Wounds",
        "res-all": f"All Resistances +{value}%",
        "res-fire": f"Fire Resist +{value}%",
        "res-cold": f"Cold Resist +{value}%",
        "res-ltng": f"Lightning Resist +{value}%",
        "res-pois": f"Poison Resist +{value}%",
        "res-mag": f"Magic Resist +{value}%",
        "res-fire-max": f"+{value}% to Maximum Fire Resist",
        "res-cold-max": f"+{value}% to Maximum Cold Resist",
        "res-ltng-max": f"+{value}% to Maximum Lightning Resist",
        "res-pois-max": f"+{value}% to Maximum Poison Resist",
        "res-all-max": f"+{value}% to Maximum Resistances",
        "red-dmg": f"Damage Reduced by {value}",
        "red-dmg%": f"Damage Reduced by {value}%",
        "red-mag": f"Magic Damage Reduced by {value}",
        "mag%": f"{value}% Better Chance of Getting Magic Items",
        "gold%": f"{value}% Extra Gold from Monsters",
        "light": f"+{value} to Light Radius",
        "regen": f"Replenish Life +{value}",
        "regen-mana": f"Regenerate Mana {value}%",
        "regen-stam": f"Heal Stamina Plus {value}%",
        "thorns": f"Attacker Takes Damage of {value}",
        "ease": f"Requirements -{abs(value)}%",
        "addxp": f"+{value}% to Experience Gained",
        "mana-kill": f"+{value} to Mana after Each Kill",
        "heal-kill": f"+{value} to Life after Each Kill",
        "dmg-to-mana": f"{value}% Damage Taken Goes to Mana",
        "dmg-undead": f"+{value}% Damage to Undead",
        "dmg-demon": f"+{value}% Damage to Demons",
        "att-undead": f"+{value} Attack Rating Against Undead",
        "att-demon": f"+{value} Attack Rating Against Demons",
        "dmg-und/lvl": f"+{value}% Damage to Undead per Level",
        "att-und/lvl": f"+{value} Attack Rating Against Undead per Level",
        "ac-miss": f"+{value} Defense vs. Missile",
        "ac-hth": f"+{value} Defense vs. Melee",
        "dmg-ac": f"-{value} to Monster Defense per Hit",
        "ignore-ac": "Ignore Target's Defense",
        "reduce-ac": f"-{value}% Target Defense",
        "slow": f"Slows Target by {value}%",
        "freeze": f"Freezes Target +{value}",
        "half-freeze": "Half Freeze Duration",
        "nofreeze": "Cannot Be Frozen",
        "knock": "Knockback",
        "noheal": "Prevents Monster Heal",
        "bloody": f"{value}% Chance of Open Wounds",
        "sock": f"Socketed ({value})",
        "indestruct": "Indestructible",
        "ethereal": "Ethereal (Cannot Be Repaired)",
        "rip": "Slain Monsters Rest in Peace",
        "stack": f"+{value} to Maximum Stack",
        "stam": f"+{value} to Stamina",
        "stamdrain": f"{value}% Slower Stamina Drain",
        "dur": f"+{value} Durability",
        "rep-dur": f"Repairs 1 Durability in {value} Seconds",
        "rep-quant": "Replenishes Quantity",
        "explosivearrow": "Fires Explosive Arrows or Bolts",
        "magicarrow": "Fires Magic Arrows or Bolts",
        "pierce": f"{value}% Piercing Attack",
        "pierce-fire": f"-{value}% to Enemy Fire Resistance",
        "pierce-cold": f"-{value}% to Enemy Cold Resistance",
        "pierce-ltng": f"-{value}% to Enemy Lightning Resistance",
        "pierce-pois": f"-{value}% to Enemy Poison Resistance",
        "pierce-mag": f"-{value}% to Enemy Magic Resistance",
        "pierce-immunity-fire": f"-{value}% to Enemy Fire Resistance",
        "pierce-immunity-cold": f"-{value}% to Enemy Cold Resistance",
        "pierce-immunity-light": f"-{value}% to Enemy Lightning Resistance",
        "pierce-immunity-pois": f"-{value}% to Enemy Poison Resistance",
        "pierce-immunity-magic": f"-{value}% to Enemy Magic Resistance",
        "extra-fire": f"+{value}% to Fire Skill Damage",
        "extra-cold": f"+{value}% to Cold Skill Damage",
        "extra-ltng": f"+{value}% to Lightning Skill Damage",
        "extra-pois": f"+{value}% to Poison Skill Damage",
        "extra-mag": f"+{value}% to Magic Skill Damage",
        "howl": f"{value}% Chance to Cast Howl when Struck",
        "stupidity": f"{value}% Chance to Cast Dim Vision when Struck",
        "reanimate": f"Reanimate as: {par}",
        "allskills": f"+{value} to All Skills",
        "fireskill": f"+{value} to Fire Skills",
        "randclassskill": f"+{value} to Random Class Skill Levels",
        "skill-rand": f"+{value} to {skill_name(par) or 'Random Skill'}",
    }
    if code in labels:
        return labels[code]
    classes = {"ama": "Amazon", "sor": "Sorceress", "nec": "Necromancer", "pal": "Paladin", "bar": "Barbarian", "dru": "Druid", "ass": "Assassin", "war": "Warlock"}
    if code in classes:
        return f"+{value} to {classes[code]} Skill Levels"
    if code in ("skill", "oskill"):
        return f"+{value} to {skill_name(par) or 'Skill'}"
    if code == "skilltab":
        return f"+{value} to Skill Tab {par}".strip()
    if code == "charged":
        return f"Level {low or 1} {skill_name(par) or 'Skill'} ({high or 1} Charges)"
    if code in ("hit-skill", "gethit-skill", "death-skill", "kill-skill", "levelup-skill"):
        trigger = {
            "hit-skill": "on Striking",
            "gethit-skill": "when Struck",
            "death-skill": "when You Die",
            "kill-skill": "when You Kill an Enemy",
            "levelup-skill": "when You Level Up",
        }[code]
        return f"{high or 1}% Chance to Cast Level {low or 1} {skill_name(par) or 'Skill'} {trigger}"
    if code == "aura":
        return f"Level {value} {skill_name(par) or 'Skill'} Aura When Equipped"
    if code.startswith("abs-"):
        element = code[4:].replace("%", "").replace("-", " ").title()
        return f"{'Absorbs' if not code.endswith('%') else str(value) + '%'} {value}{'%' if code.endswith('%') else ''} {element} Damage".replace("  ", " ")
    pretty = code.replace("-", " ").replace("/", " per ").title()
    return f"+{value} {pretty}" + (f" ({par})" if par and not par.isdigit() else "")


def apply_property(prop: str, par: str, minimum: str, maximum: str, stats: dict[str, float], lines: list[str]) -> None:
    code = prop.strip().lower()
    if not code:
        return
    low, high, value = property_values(code, par, minimum, maximum)

    def add(key: str, amount: float) -> None:
        if amount:
            stats[key] = stats.get(key, 0) + amount

    if code in ("dmg-fire", "dmg-cold", "dmg-ltng", "dmg-mag", "dmg-pois"):
        add("elementalDamageMin", low or value)
        add("elementalDamageMax", high or value)
    elif code == "dmg-norm":
        add("plusDamageMin", low or value)
        add("plusDamage", high or value)
    elif code == "dmg-min":
        add("plusDamageMin", value)
    elif code == "dmg-max":
        add("plusDamage", value)
    elif code == "dmg":
        add("plusDamage", value)
    elif code in ("fire-min", "cold-min", "ltng-min", "pois-min"):
        add("elementalDamageMin", value)
    elif code in ("fire-max", "cold-max", "ltng-max", "pois-max"):
        add("elementalDamageMax", value)
    elif code == "dmg%":
        add("enhancedDamagePercent", value)
    elif code == "dmg/lvl":
        add("plusDamagePerLevel", value)
    elif code == "ac":
        add("armor", value)
    elif code == "ac%":
        add("armorPercent", value)
    elif code == "ac/lvl":
        add("armorPerLevel", value)
    elif code in ("str", "dex", "vit", "enr"):
        add({"str": "plusStrength", "dex": "plusDexterity", "vit": "plusVitality", "enr": "plusEnergy"}[code], value)
    elif code == "all-stats":
        for key in ("plusStrength", "plusDexterity", "plusVitality", "plusEnergy"):
            add(key, value)
    elif code == "hp":
        add("plusLife", value)
    elif code == "mana":
        add("plusMana", value)
    elif code == "hp%":
        add("lifePercent", value)
    elif code == "mana%":
        add("manaPercent", value)
    elif code == "hp/lvl":
        add("lifePerLevel", value)
    elif code == "mana/lvl":
        add("manaPerLevel", value)
    elif code.startswith("swing"):
        add("attackSpeedPercent", value)
    elif code.startswith("cast"):
        add("fasterCastPercent", value)
    elif code.startswith("move"):
        add("movementSpeedPercent", value)
    elif code == "lifesteal":
        add("lifeStealPercent", value)
    elif code == "manasteal":
        add("manaStealPercent", value)
    elif code == "crush":
        add("crushingBlowPercent", value)
    elif code == "deadly":
        add("deadlyStrikePercent", value)
    elif code in ("openwounds", "bloody"):
        add("openWoundsPercent", value)
    elif code == "res-all":
        add("allResistPercent", value)
    elif code == "res-fire":
        add("fireResistPercent", value)
    elif code == "res-cold":
        add("coldResistPercent", value)
    elif code == "res-ltng":
        add("lightningResistPercent", value)
    elif code == "res-pois":
        add("poisonResistPercent", value)
    elif code == "red-dmg":
        add("damageReductionFlat", value)
    elif code == "red-dmg%":
        add("damageReductionPercent", value)
    elif code == "mag%":
        add("magicFindPercent", value)
    elif code == "gold%":
        add("goldFindPercent", value)
    elif code == "regen":
        add("replenishLife", value)
    elif code == "thorns":
        add("thorns", value)
    elif code == "addxp":
        add("extraExperiencePercent", value)
    elif code == "ease":
        strength = stats.get("requiresStrength", 0)
        if strength:
            stats["requiresStrength"] = max(0, round(strength * (1 - abs(value) / 100)))
    line = format_property(code, par, low, high, value)
    if line and line not in lines:
        lines.append(line)


def convert_properties(row: dict[str, str], count: int, stats: dict[str, float], lines: list[str]) -> None:
    for index in range(1, count + 1):
        prop = cell(row, f"prop{index}")
        if prop:
            apply_property(prop, cell(row, f"par{index}"), cell(row, f"min{index}"), cell(row, f"max{index}"), stats, lines)


def convert_set_properties(row: dict[str, str], stats: dict[str, float], lines: list[str]) -> None:
    for key in row:
        if not key.startswith("aprop") or not cell(row, key):
            continue
        suffix = key[5:]
        apply_property(cell(row, key), cell(row, f"apar{suffix}"), cell(row, f"amin{suffix}"), cell(row, f"amax{suffix}"), stats, lines)


def named_art(source: Path, palette: list[tuple[int, int, int]], rarity: str, name: str,
              base: dict[str, str], transform: str, invfile: str, cels: dict,
              used_slugs: set[str], root: Path) -> tuple[str, int]:
    if invfile and invfile in cels:
        return f"assets/d2survivors/items/d2/{invfile}.png", 0
    base_cel = base["invfile"]
    if base_cel not in cels:
        return "", 0
    art = f"assets/d2survivors/items/d2/{base_cel}.png"
    tint = TINT_RGB.get(transform)
    if tint is None:
        return art, 0
    slug = slugify(name)
    stem, suffix = slug, 2
    while slug in used_slugs:
        slug = f"{stem}-{suffix}"
        suffix += 1
    used_slugs.add(slug)
    try:
        image = dc6.render(source / "global" / "items" / f"{base_cel}.dc6", palette)
        tint_image(image, tint).save(root / f"{slug}.png", "PNG", optimize=True)
        return f"assets/d2survivors/items/{rarity}/{slug}.png", 1
    except Exception as error:  # noqa: BLE001 - keep the catalogue usable
        print(f"skip {rarity} {name} tint: {error}")
        return art, 0


def import_named_items(source: Path, palette: list[tuple[int, int, int]],
                       bases: dict[str, dict[str, str]], cels: dict) -> dict:
    """Build the complete unique/set item catalogues and their set definitions."""
    catalogues: dict[str, list[dict]] = {"unique": [], "set": []}
    used_slugs: dict[str, set[str]] = {"unique": set(), "set": set()}
    tinted = 0
    for rarity, filename, code_key, property_count, root in (
        ("unique", "uniqueitems.txt", "code", 12, UNIQUE_ROOT),
        ("set", "setitems.txt", "item", 9, SET_ROOT),
    ):
        root.mkdir(parents=True, exist_ok=True)
        rows = read_excel(source, filename)
        skipped = 0
        for row in rows:
            name = cell(row, "index")
            code = cell(row, code_key).lower()
            if not name or not code or cell(row, "disabled"):
                skipped += 1
                continue
            base = bases.get(code)
            classification = classify_base(base) if base else None
            if not base or classification is None:
                skipped += 1
                continue
            slot, equipment_type, restricted = classification
            stats = base_stats(base, slot, base["type"])
            lines: list[str] = []
            convert_properties(row, property_count, stats, lines)
            set_name = cell(row, "set") if rarity == "set" else ""
            partial_stats: dict[str, float] = {}
            partial_lines: list[str] = []
            if rarity == "set":
                convert_set_properties(row, partial_stats, partial_lines)
            required_level = max(1, min(99, integer(cell(row, "lvl req"), integer(base["levelreq"], 1))))
            art, was_tinted = named_art(source, palette, rarity, name, base, cell(row, "invtransform").lower(),
                                        cell(row, "invfile").lower(), cels, used_slugs[rarity], root)
            tinted += was_tinted
            item = {
                "name": name,
                "baseName": base["name"],
                "rarity": rarity,
                "slot": slot,
                "equipmentType": equipment_type,
                "width": item_size(base, slot, base["type"])[0],
                "height": item_size(base, slot, base["type"])[1],
                "desc": f"Part of {set_name}." if set_name else f"A unique {base['name']} from Diablo II.",
                "requiredLevel": required_level,
                "stats": compact(stats),
                "affixes": lines,
                "art": art,
            }
            if restricted:
                item["restrictedClass"] = restricted
            if slot == "belt":
                item["beltQuality"] = "elite" if code.startswith("u") else "exceptional" if code.startswith("z") else "normal"
            if set_name:
                item["setName"] = set_name
            if partial_lines:
                item["partialStats"] = compact(partial_stats)
                item["partialAffixes"] = partial_lines
            catalogues[rarity].append(item)
        catalogues[rarity].sort(key=lambda item: item["name"])
        print(f"mapped {len(catalogues[rarity])} {rarity} items ({skipped} header/invalid rows skipped)")

    definitions: dict[str, dict] = {}
    set_names: dict[str, list[str]] = {}
    for item in catalogues["set"]:
        if item.get("setName"):
            set_names.setdefault(item["setName"], []).append(item["name"])
    for row in read_excel(source, "sets.txt"):
        name = cell(row, "index")
        items = set_names.get(name)
        if not name or not items:
            continue
        partial: list[dict] = []
        for pieces in (2, 3, 4, 5):
            stats: dict[str, float] = {}
            lines: list[str] = []
            for suffix in ("a", "b"):
                prop = cell(row, f"PCode{pieces}{suffix}")
                if prop:
                    apply_property(prop, cell(row, f"PParam{pieces}{suffix}"), cell(row, f"PMin{pieces}{suffix}"), cell(row, f"PMax{pieces}{suffix}"), stats, lines)
            if lines:
                partial.append({"pieces": pieces, "stats": compact(stats), "lines": lines})
        full_stats: dict[str, float] = {}
        full_lines: list[str] = []
        for index in range(1, 9):
            prop = cell(row, f"FCode{index}")
            if prop:
                apply_property(prop, cell(row, f"FParam{index}"), cell(row, f"FMin{index}"), cell(row, f"FMax{index}"), full_stats, full_lines)
        definitions[name] = {
            "name": name,
            "items": sorted(items),
            "partial": partial,
            "full": {"pieces": len(items), "stats": compact(full_stats), "lines": full_lines},
        }
    print(f"mapped {len(definitions)} set definitions, {tinted} tinted unique/set cels")
    return {"unique": catalogues["unique"], "set": catalogues["set"], "definitions": definitions}


def import_categories(source: Path, palette: list[tuple[int, int, int]]) -> dict:
    picks = {}
    for category, candidates in CATEGORIES.items():
        chosen = next(((name, find(source, name)) for name in candidates if find(source, name)), None)
        if chosen is None:
            print(f"skip {category}: no dc6 among {', '.join(candidates)}")
            continue
        name, path = chosen
        image = dc6.render(path, palette)
        image.save(ASSET_ROOT / f"{category}.png", "PNG", optimize=True)
        picks[category] = {"dc6": name, "width": image.width, "height": image.height}
        print(f"{category:16s} <- {name:10s} {image.width}x{image.height}")
    return picks


def collect_item_names(source: Path, cels: dict[str, dict]) -> dict[str, str]:
    names: dict[str, str] = {}
    for filename in EXCEL_FILES:
        for row in read_excel(source, filename):
            name = cell(row, "name")
            invfile = cell(row, "invfile").lower()
            if name and invfile and invfile in cels:
                names.setdefault(name.lower(), invfile)
    print(f"mapped {len(names)} base item names to inventory cels")
    return names


def collect_ground_names(source: Path, cels: dict[str, dict]) -> dict[str, str]:
    names: dict[str, str] = {}
    for filename in EXCEL_FILES:
        for row in read_excel(source, filename):
            name = cell(row, "name")
            flippy = cell(row, "flippyfile").lower()
            if name and flippy and flippy in cels:
                names.setdefault(name.lower(), flippy)
    print(f"mapped {len(names)} base item names to ground cels")
    return names


def ground_animation_lines(ground_names: dict[str, str], ground: dict[str, dict]) -> list[str]:
    lines = [
        "// Base item name (D2, lower case) -> offset-aligned flippy animation strip.",
        "export interface D2GroundItemAnimation {",
        "  path: string;",
        "  frames: number;",
        "  width: number;",
        "  height: number;",
        "  anchorX: number;",
        "  anchorY: number;",
        "}",
        "",
        "export const D2_GROUND_ITEM_ANIMATIONS: Readonly<Record<string, D2GroundItemAnimation>> = {",
    ]
    for name, flippy in sorted(ground_names.items()):
        info = ground.get(flippy)
        if not info or not info.get("frames"):
            continue
        lines.append(
            f"  {json.dumps(name)}: {{ path: \"assets/d2survivors/items/ground-anim/{flippy}.png\", "
            f"frames: {info['frames']}, width: {info['frameWidth']}, height: {info['frameHeight']}, "
            f"anchorX: {info['anchorX']}, anchorY: {info['anchorY']} }},"
        )
    lines.extend(["};", ""])
    return lines


def write_generated_map(names: dict[str, str], ground_names: dict[str, str], ground: dict[str, dict], named: dict) -> None:
    lines = [
        "// Generated by tools/import_d2r_item_art.py - do not edit by hand.",
        "// Base item name (D2, lower case) -> cel imported from the D2R extract.",
        "",
        "export interface D2GeneratedItemStats {",
    ]
    for key in (
        "damageMin", "damageMax", "armor", "plusDamage", "plusDamageMin",
        "plusStrength", "plusDexterity", "plusVitality", "plusEnergy",
        "plusLife", "plusMana", "lifePerLevel", "manaPerLevel", "lifePercent", "manaPercent",
        "attackSpeedPercent", "fasterCastPercent", "movementSpeedPercent",
        "armorPercent", "armorPerLevel", "enhancedDamagePercent", "plusDamagePerLevel",
        "elementalDamageMin", "elementalDamageMax", "lifeStealPercent", "manaStealPercent",
        "crushingBlowPercent", "deadlyStrikePercent", "openWoundsPercent",
        "magicFindPercent", "goldFindPercent", "damageReductionFlat", "damageReductionPercent",
        "allResistPercent", "fireResistPercent", "coldResistPercent",
        "lightningResistPercent", "poisonResistPercent", "replenishLife", "thorns",
        "extraExperiencePercent", "requiresStrength", "requiresDexterity",
    ):
        lines.append(f"  {key}?: number;")
    lines.extend([
        "}",
        "",
        "export interface D2GeneratedItem {",
        "  name: string;",
        "  baseName: string;",
        "  rarity: \"unique\" | \"set\";",
        "  slot: \"weapon\" | \"armor\" | \"charm\" | \"belt\";",
        "  equipmentType: string;",
        "  restrictedClass?: string;",
        "  width: number;",
        "  height: number;",
        "  beltQuality?: \"normal\" | \"exceptional\" | \"elite\";",
        "  desc: string;",
        "  requiredLevel: number;",
        "  stats: D2GeneratedItemStats;",
        "  affixes: string[];",
        "  setName?: string;",
        "  partialStats?: D2GeneratedItemStats;",
        "  partialAffixes?: string[];",
        "  art: string;",
        "}",
        "",
        "export interface D2SetBonus {",
        "  pieces: number;",
        "  stats: D2GeneratedItemStats;",
        "  lines: string[];",
        "}",
        "",
        "export interface D2SetDefinition {",
        "  name: string;",
        "  items: string[];",
        "  partial: D2SetBonus[];",
        "  full: D2SetBonus;",
        "}",
        "",
        "export const D2_ITEM_ART: Readonly<Record<string, string>> = {",
    ])
    for name, invfile in sorted(names.items()):
        lines.append(f"  {json.dumps(name)}: \"assets/d2survivors/items/d2/{invfile}.png\",")
    lines.append("};")
    lines.extend([
        "",
        "// Base item name (D2, lower case) -> flippy cel for loot on the arena floor.",
        "export const D2_GROUND_ITEM_ART: Readonly<Record<string, string>> = {",
    ])
    for name, flippy in sorted(ground_names.items()):
        lines.append(f"  {json.dumps(name)}: \"assets/d2survivors/items/ground/{flippy}.png\",")
    lines.extend(["};", ""])
    lines.extend(ground_animation_lines(ground_names, ground))
    for key, constant, comment in (
        ("unique", "D2_UNIQUE_ITEMS", "Every real Diablo II unique item with its base stats and modifiers."),
        ("set", "D2_SET_ITEMS", "Every real Diablo II set item with its base stats, modifiers and partial-set bonuses."),
    ):
        lines.append(f"// {comment}")
        lines.append(f"export const {constant}: ReadonlyArray<D2GeneratedItem> = [")
        for item in named[key]:
            lines.append(json.dumps(item, indent=2, ensure_ascii=False) + ",")
        lines.extend(["];", ""])
        lines.append(f"export const {constant[:-1]}_BY_NAME: Readonly<Record<string, D2GeneratedItem>> =")
        lines.append(f"  Object.fromEntries({constant}.map((item) => [item.name, item]));")
        lines.append("")
    lines.append("// Set name -> its pieces and the real 2/3/4/5-piece and full-set bonuses.")
    lines.append("export const D2_SET_DEFINITIONS: Readonly<Record<string, D2SetDefinition>> =")
    lines.append(json.dumps(named["definitions"], indent=2, ensure_ascii=False) + ";")
    GENERATED_MAP.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"generated {GENERATED_MAP.relative_to(PROJECT_ROOT)} ({len(named['unique'])} uniques, {len(named['set'])} set items)")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--list", action="store_true", help="list the category candidates")
    args = parser.parse_args(argv)

    if args.list:
        for category, candidates in CATEGORIES.items():
            print(category, "->", ", ".join(candidates))
        return 0

    palette = dc6.load_palette(args.source.joinpath(*PALETTE_PATH))
    global SKILL_NAMES
    SKILL_NAMES = load_skill_names(args.source)
    picks = import_categories(args.source, palette)
    imported = import_all(args.source, palette)
    ground = import_ground(args.source, palette)
    animations = import_ground_animations(args.source, palette)
    for name, info in animations.items():
        ground.setdefault(name, {}).update(info)
    names = collect_item_names(args.source, imported)
    aliases = {name: cel for name, cel in ALIASES.items() if cel in imported}
    names.update(aliases)
    print(f"mapped {len(aliases)} game base names to their closest D2 cel")
    ground_names = collect_ground_names(args.source, ground)
    ground_aliases = {name: cel for name, cel in GROUND_ALIASES.items() if cel in ground}
    ground_names.update(ground_aliases)
    print(f"mapped {len(ground_aliases)} game base names to their closest ground cel")
    named = import_named_items(args.source, palette, collect_base_items(args.source), imported)
    write_generated_map(names, ground_names, ground, named)
    manifest_path = ASSET_ROOT / "manifest.json"
    manifest_path.write_text(json.dumps({
        "categories": picks,
        "cels": imported,
        "ground": ground,
        "named": {"unique": len(named["unique"]), "set": len(named["set"]), "sets": len(named["definitions"])},
    }, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"manifest: {manifest_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
