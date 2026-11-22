"""Import Diablo II's gem table into typed game data.

`data/global/excel/gems.txt` carries the seven socketable gem colours, their five
grades and the exact modifiers each one grants in a weapon, a helm or body
armor, and a shield. `misc.txt` supplies the inventory/flippy cels, and
`item-names.json` supplies the localized names and the item-type strings the
tooltips use ("Gems", "Jewels").

Output:
    src/app/d2survivors/d2-gems.generated.ts

Usage:
    python tools/import_d2_gems.py
"""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"
EXCEL = ("global", "excel")
GENERATED = PROJECT_ROOT / "src" / "app" / "d2survivors" / "d2-gems.generated.ts"

GRADES = ("Chipped", "Flawed", "", "Flawless", "Perfect")
COLORS = ("Amethyst", "Sapphire", "Emerald", "Ruby", "Diamond", "Topaz", "Skull")

# gems.txt stat code -> (D2ItemStats field, tooltip format).  A code without a
# field still keeps its line, so the tooltip stays faithful to the file.
SIMPLE_MODS: dict[str, tuple[str | None, str]] = {
    "ac": ("armor", "+{0} Defense"),
    "ac%": ("armorPercent", "+{0}% Enhanced Defense"),
    "att": ("attackRating", "+{0} to Attack Rating"),
    "att%": ("attackRatingPercent", "+{0}% to Attack Rating"),
    "att-demon": ("attackRatingVsDemons", "+{0} to Attack Rating against Demons"),
    "att-undead": ("attackRatingVsUndead", "+{0} to Attack Rating against Undead"),
    "str": ("plusStrength", "+{0} to Strength"),
    "dex": ("plusDexterity", "+{0} to Dexterity"),
    "vit": ("plusVitality", "+{0} to Vitality"),
    "enr": ("plusEnergy", "+{0} to Energy"),
    "hp": ("plusLife", "+{0} to Life"),
    "hp%": ("lifePercent", "+{0}% to Life"),
    "mana": ("plusMana", "+{0} to Mana"),
    "mana%": ("manaPercent", "+{0}% to Mana"),
    "mana-kill": ("manaAfterEachKill", "+{0} to Mana after each Kill"),
    "regen": ("replenishLife", "Replenish Life +{0}"),
    "regen-mana": (None, "Regenerate Mana {0}%"),
    "res-fire": ("fireResistPercent", "+{0}% to Fire Resistance"),
    "res-cold": ("coldResistPercent", "+{0}% to Cold Resistance"),
    "res-ltng": ("lightningResistPercent", "+{0}% to Lightning Resistance"),
    "res-pois": ("poisonResistPercent", "+{0}% to Poison Resistance"),
    "res-all": ("allResistPercent", "+{0}% to All Resistances"),
    "res-fire-max": (None, "+{0}% to Maximum Fire Resistance"),
    "res-cold-max": (None, "+{0}% to Maximum Cold Resistance"),
    "res-ltng-max": (None, "+{0}% to Maximum Lightning Resistance"),
    "res-pois-max": (None, "+{0}% to Maximum Poison Resistance"),
    "lifesteal": ("lifeStealPercent", "{0}% Life Stolen per Hit"),
    "manasteal": ("manaStealPercent", "{0}% Mana Stolen per Hit"),
    "thorns": ("thorns", "Attacker Takes Damage of {0}"),
    "mag%": ("magicFindPercent", "{0}% Better Chance of Getting Magic Items"),
    "gold%": ("goldFindPercent", "{0}% Extra Gold from Monsters"),
    "light": ("lightRadius", "+{0} to Light Radius"),
    "dmg%": ("enhancedDamagePercent", "+{0}% Enhanced Damage"),
    "dmg-min": ("plusDamageMin", "+{0} to Minimum Damage"),
    "dmg-max": ("plusDamage", "+{0} to Maximum Damage"),
    "dmg-demon": ("damageToDemonsPercent", "+{0}% Damage to Demons"),
    "dmg-undead": ("damageToUndeadPercent", "+{0}% Damage to Undead"),
    "dmg-fire": ("fireDamage", "Adds {0} Fire Damage"),
    "dmg-cold": ("coldDamage", "Adds {0} Cold Damage"),
    "dmg-ltng": ("lightningDamage", "Adds {0} Lightning Damage"),
    "dmg-pois": ("poisonDamage", "Adds {0} Poison Damage"),
    "red-dmg": ("damageReductionFlat", "Damage Reduced by {0}"),
    "red-dmg%": ("damageReductionPercent", "Damage Reduced by {0}%"),
    "red-mag": ("magicDamageReductionFlat", "Magic Damage Reduced by {0}"),
    "balance2": ("fasterHitRecoveryPercent", "+{0}% Faster Hit Recovery"),
    "swing2": ("attackSpeedPercent", "+{0}% Increased Attack Speed"),
    "block": ("increasedBlockPercent", "+{0}% Increased Chance of Blocking"),
    "block2": ("fasterBlockRatePercent", "+{0}% Faster Block Rate"),
    "crush": ("crushingBlowPercent", "{0}% Chance of Crushing Blow"),
    "deadly": ("deadlyStrikePercent", "{0}% Deadly Strike"),
    "openwounds": ("openWoundsPercent", "{0}% Chance of Open Wounds"),
    "dmg-to-mana": ("damageTakenToManaPercent", "{0}% Damage Taken Goes To Mana"),
    "stamdrain": ("healStaminaPercent", "{0}% Slower Stamina Drain"),
    "ease": ("requirementsPercent", "Requirements -{0}%"),
    "cold-len": (None, "Cold Length +{0}%"),
    "pois-len": (None, "Poison Length +{0}%"),
    "freeze": (None, "Freezes Target"),
    "nofreeze": (None, "Cannot Be Frozen"),
    "ignore-ac": ("ignoreTargetDefense", "Ignore Target's Defense"),
    "knock": ("knockback", "Knockback"),
    "noheal": ("preventMonsterHeal", "Prevent Monster Heal"),
    "indestruct": ("indestructible", "Indestructible"),
    "howl": (None, "Hit Causes Monster to Flee"),
    "stupidity": (None, "Hit Blinds Target"),
    "reduce-ac": (None, "-{0}% to Target's Defense"),
}

# Elemental min/max rows read as one range in the tooltip.
ELEMENT_PAIRS = {
    "fire": "Fire",
    "cold": "Cold",
    "ltng": "Lightning",
    "pois": "Poison",
}


def load_rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle, delimiter="\t"))


def load_strings(path: Path) -> dict[str, str]:
    with path.open(encoding="utf-8-sig") as handle:
        entries = json.load(handle)
    return {entry.get("Key", ""): entry.get("enUS", "") for entry in entries}


def grade_of(name: str) -> str | None:
    for grade in GRADES:
        if not grade:
            continue
        if name.startswith(f"{grade} "):
            return grade
    return ""


def color_of(name: str) -> str | None:
    for color in COLORS:
        if name == color or name.endswith(f" {color}"):
            return color
    return None


def cosmetic(stat: str) -> str:
    """`fireResistPercent` -> `fire resist` for the hand-written field docs."""
    return re.sub(r"(Percent|Flat)$", "", stat)


def roll(row: dict[str, str], group: str) -> dict[str, object]:
    """Read one modifier group (`weaponMod`, `helmMod`, `shieldMod`)."""
    stats: dict[str, int] = {}
    lines: list[str] = []
    seen_ranges: set[str] = set()
    entries = []
    for slot in (1, 2, 3):
        code = (row.get(f"{group}{slot}Code") or "").strip()
        if not code:
            continue
        low = int(float(row.get(f"{group}{slot}Min") or 1))
        high = int(float(row.get(f"{group}{slot}Max") or low))
        entries.append((code, low, high))
    for code, low, high in entries:
        pair = re.fullmatch(r"(fire|cold|ltng|pois)-(min|max)", code)
        if pair:
            element, bound = pair.groups()
            if element in seen_ranges:
                continue
            seen_ranges.add(element)
            partner = next((entry for entry in entries if entry[0] == f"{element}-max"), None)
            top = partner[2] if partner else high
            if element == "pois":
                stats["poisonDamage"] = top
            else:
                stats["elementalDamageMin"] = stats.get("elementalDamageMin", 0) + low
                stats["elementalDamageMax"] = stats.get("elementalDamageMax", 0) + top
            lines.append(f"Adds {low}-{top} {ELEMENT_PAIRS[element]} Damage")
            continue
        if code in SIMPLE_MODS:
            stat, template = SIMPLE_MODS[code]
            if stat:
                if stat in ("ignoreTargetDefense", "knockback", "preventMonsterHeal", "indestructible"):
                    stats[stat] = 1
                else:
                    stats[stat] = stats.get(stat, 0) + high
            if "{0}" in template:
                value = high if low == high else f"{low}-{high}"
                lines.append(template.format(value))
            else:
                lines.append(template)
            continue
        # Unknown codes keep their line so the tooltip never silently drops data.
        value = high if low == high else f"{low}-{high}"
        lines.append(f"{code} {value}".strip())
    return {"stats": stats, "lines": lines}


def main() -> None:
    data = DEFAULT_SOURCE
    gems = load_rows(data / EXCEL[0] / EXCEL[1] / "gems.txt")
    misc = load_rows(data / EXCEL[0] / EXCEL[1] / "misc.txt")
    names = load_strings(data / "local" / "lng" / "strings" / "item-names.json")
    cels = {
        (row.get("name") or "").strip().lower(): {
            "art": f"assets/d2survivors/items/d2/{(row.get('invfile') or '').strip()}.png",
            "ground": f"assets/d2survivors/items/ground/{(row.get('flippyfile') or '').strip()}.png",
            "level": int(float(row.get("level") or 1)),
        }
        for row in misc
    }

    entries = []
    for row in gems:
        name = (row.get("name") or "").strip()
        color = color_of(name)
        grade = grade_of(name)
        if not color or grade is None or name == "Expansion":
            continue
        if re.search(r"Rune$", name):
            continue
        # Gem rows carry no level of their own in misc.txt, so the grade sets the
        # requirement the way the game gates them.
        required_level = {"Chipped": 1, "Flawed": 8, "": 15, "Flawless": 22, "Perfect": 29}[grade]
        entries.append({
            "name": name,
            "color": color,
            "grade": grade or "Normal",
            "requiredLevel": required_level,
            "inWeapon": roll(row, "weaponMod"),
            "inHelm": roll(row, "helmMod"),
            "inShield": roll(row, "shieldMod"),
        })

    entries.sort(key=lambda entry: (COLORS.index(entry["color"]), GRADES.index(
        "" if entry["grade"] == "Normal" else entry["grade"])))

    def emit_roll(roll_data: dict[str, object], indent: str) -> str:
        stats = roll_data["stats"]
        lines = roll_data["lines"]
        stat_text = ", ".join(f"{key}: {value}" for key, value in stats.items())
        line_text = ", ".join(json.dumps(line) for line in lines)
        return f"{indent}{{ stats: {{ {stat_text} }}, lines: [{line_text}] }}"

    out: list[str] = []
    out.append('/* Generated by tools/import_d2_gems.py from gems.txt, misc.txt and item-names.json.')
    out.append(" * Do not edit by hand: rerun the importer to pick up new game data. */")
    out.append('import type { D2ItemStats } from "./d2-item-stats";')
    out.append("")
    out.append("/** One gem's effect in one kind of socket host. */")
    out.append("export interface D2GemRoll {")
    out.append("  stats: D2ItemStats;")
    out.append("  /** Tooltip lines, worded from the gem table's own values. */")
    out.append("  lines: string[];")
    out.append("}")
    out.append("")
    out.append("export interface D2GemDefinition {")
    out.append("  name: string;")
    out.append('  /** Ruby, Sapphire, Emerald, Amethyst, Diamond, Topaz or Skull. */')
    out.append("  color: string;")
    out.append('  /** Chipped, Flawed, Normal, Flawless or Perfect. */')
    out.append("  grade: string;")
    out.append("  requiredLevel: number;")
    out.append("  /** gems.txt weaponMod* rows. */")
    out.append("  inWeapon: D2GemRoll;")
    out.append("  /** gems.txt helmMod* rows, which body armor also uses. */")
    out.append("  inHelm: D2GemRoll;")
    out.append("  /** gems.txt shieldMod* rows. */")
    out.append("  inShield: D2GemRoll;")
    out.append("}")
    out.append("")
    out.append("export const D2_GEMS: readonly D2GemDefinition[] = [")
    for entry in entries:
        out.append("  {")
        out.append(f'    name: {json.dumps(entry["name"])},')
        out.append(f'    color: {json.dumps(entry["color"])},')
        out.append(f'    grade: {json.dumps(entry["grade"])},')
        out.append(f'    requiredLevel: {entry["requiredLevel"]},')
        out.append(f'    inWeapon: {emit_roll(entry["inWeapon"], "    ").strip()},')
        out.append(f'    inHelm: {emit_roll(entry["inHelm"], "    ").strip()},')
        out.append(f'    inShield: {emit_roll(entry["inShield"], "    ").strip()},')
        out.append("  },")
    out.append("];")
    out.append("")
    out.append("export const D2_GEM_BY_NAME: Record<string, D2GemDefinition> = Object.fromEntries(")
    out.append("  D2_GEMS.map((gem) => [gem.name, gem]),")
    out.append(");")
    out.append("")
    out.append("/** Item-type strings straight out of item-names.json. */")
    out.append("export const D2_SOCKETABLE_LABELS = {")
    out.append(f'  gem: {json.dumps(names.get("gems", "Gems"))},')
    out.append(f'  jewel: {json.dumps(names.get("jewel", "Jewels"))},')
    out.append("} as const;")
    out.append("")

    GENERATED.write_text("\n".join(out), encoding="utf-8", newline="\n")
    print(f"wrote {GENERATED.relative_to(PROJECT_ROOT)} with {len(entries)} gems")


if __name__ == "__main__":
    main()
