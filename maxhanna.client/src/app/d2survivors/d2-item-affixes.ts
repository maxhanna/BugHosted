import type { D2ItemStats } from "./d2-item-stats";

/**
 * D2 prefix/suffix catalogue used by the survivor loot generator.
 *
 * The original game stores one row per affix level. The survivor generator only
 * needs the level at which a tier unlocks, its eligible base classes and the
 * stat roll, so the table is deliberately compact. Every prefix and suffix in
 * the reference tables is represented by at least one tier; repeated charm and
 * jewel tiers use separate rows because their ranges differ from the gear row.
 */

export type D2AffixKind = "prefix" | "suffix";

export type D2AffixItemType =
  | "weapon" | "meleeWeapon" | "missileWeapon" | "throwingWeapon"
  | "bow" | "crossbow" | "javelin" | "spear" | "sword" | "axe"
  | "club" | "hammer" | "mace" | "dagger" | "katar" | "staff"
  | "wand" | "orb" | "rod" | "scepter"
  | "bodyArmor" | "helmet" | "circlet" | "shield" | "paladinShield"
  | "barbarianHelm" | "druidPelt" | "necromancerHead"
  | "gloves" | "boots" | "belt" | "ring" | "amulet"
  | "charm" | "smallCharm" | "largeCharm" | "grandCharm" | "jewel";

export type D2ItemProcTrigger = "attack" | "strike" | "struck";

/** An item-cast spell, used by the Chance to Cast affix family. */
export interface D2ItemProc {
  trigger: D2ItemProcTrigger;
  chance: number;
  skill: string;
  level: number;
}

export interface D2AffixRoll {
  stat: keyof D2ItemStats;
  min: number;
  max: number;
  /** A per-level stat is stored raw and multiplied by character level in the UI. */
  perLevel?: boolean;
}

export interface D2Affix {
  kind: D2AffixKind;
  name: string;
  level: number;
  targets: D2AffixItemType[];
  format: string;
  rolls: D2AffixRoll[];
  proc?: D2ItemProc;
}

const WEAPONS: D2AffixItemType[] = [
  "weapon", "meleeWeapon", "missileWeapon", "throwingWeapon", "bow", "crossbow",
  "javelin", "spear", "sword", "axe", "club", "hammer", "mace", "dagger",
  "katar", "staff", "wand", "orb", "rod", "scepter",
];
const ARMOR: D2AffixItemType[] = [
  "bodyArmor", "helmet", "circlet", "shield", "paladinShield", "barbarianHelm",
  "druidPelt", "necromancerHead", "gloves", "boots", "belt",
];
const HELMS: D2AffixItemType[] = ["helmet", "circlet", "barbarianHelm", "druidPelt"];
const SHIELDS: D2AffixItemType[] = ["shield", "paladinShield", "necromancerHead"];
const CHARMS: D2AffixItemType[] = ["charm", "smallCharm", "largeCharm", "grandCharm"];
const JEWELRY: D2AffixItemType[] = ["ring", "amulet"];
const AMAZON_WEAPONS: D2AffixItemType[] = ["bow", "crossbow", "javelin", "spear"];

const TARGET_GROUPS: Record<string, D2AffixItemType[]> = {
  weapons: WEAPONS,
  meleeWeapons: ["meleeWeapon"],
  missileWeapons: ["missileWeapon"],
  throwingWeapons: ["throwingWeapon"],
  bows: ["bow"],
  crossbows: ["crossbow"],
  javelins: ["javelin"],
  spears: ["spear"],
  swords: ["sword"],
  axes: ["axe"],
  clubs: ["club"],
  hammers: ["hammer"],
  maces: ["mace"],
  daggers: ["dagger"],
  katars: ["katar"],
  staves: ["staff"],
  wands: ["wand"],
  orbs: ["orb"],
  rods: ["rod"],
  scepters: ["scepter"],
  amazonWeapons: AMAZON_WEAPONS,
  armor: ARMOR,
  bodyArmor: ["bodyArmor"],
  helms: HELMS,
  circlets: ["circlet"],
  shields: SHIELDS,
  paladinShields: ["paladinShield"],
  barbarianHelms: ["barbarianHelm"],
  druidPelts: ["druidPelt"],
  heads: ["necromancerHead"],
  gloves: ["gloves"],
  boots: ["boots"],
  belts: ["belt"],
  rings: ["ring"],
  amulets: ["amulet"],
  charms: CHARMS,
  smallCharms: ["smallCharm"],
  largeCharms: ["largeCharm"],
  grandCharms: ["grandCharm"],
  jewels: ["jewel"],
};

function expandTargets(spec: string): D2AffixItemType[] {
  const resolved = new Set<D2AffixItemType>();
  for (const raw of spec.split(",")) {
    const token = raw.trim();
    if (!token) continue;
    const group = TARGET_GROUPS[token];
    if (group) group.forEach((type) => resolved.add(type));
    else resolved.add(token as D2AffixItemType);
  }
  return [...resolved];
}

const r = (stat: keyof D2ItemStats, min: number, max = min, perLevel = false): D2AffixRoll => (
  { stat, min, max, ...(perLevel ? { perLevel } : {}) }
);

const p = (
  name: string,
  level: number,
  targets: string,
  format: string,
  rolls: D2AffixRoll[] = [],
  proc?: D2ItemProc,
): D2Affix => ({ kind: "prefix", name, level, targets: expandTargets(targets), format, rolls, ...(proc ? { proc } : {}) });

const s = (
  name: string,
  level: number,
  targets: string,
  format: string,
  rolls: D2AffixRoll[] = [],
  proc?: D2ItemProc,
): D2Affix => ({ kind: "suffix", name, level, targets: expandTargets(targets), format, rolls, ...(proc ? { proc } : {}) });

const TREE_BY_AFFIX_NAME: Record<string, string> = {
  "Fletcher's": "Bow and Crossbow", "Bowyer's": "Bow and Crossbow", "Archer's": "Bow and Crossbow",
  "Acrobat's": "Passive and Magic", "Gymnast's": "Passive and Magic", "Athlete's": "Passive and Magic",
  "Harpoonist's": "Javelin and Spear", "Spearmaiden's": "Javelin and Spear", "Lancer's": "Javelin and Spear",
  "Entrapping": "Traps", "Trickster's": "Traps", "Cunning": "Traps",
  "Mentalist's": "Shadow Disciplines", "Psychic": "Shadow Disciplines", "Shadow": "Shadow Disciplines",
  "Shogukusha's": "Martial Arts", "Sensei's": "Martial Arts", "Kenshi's": "Martial Arts",
  "Expert's": "Combat Skills", "Veteran's": "Combat Skills", "Master's": "Combat Skills",
  "Fanatic": "Combat Masteries", "Raging": "Combat Masteries", "Furious": "Combat Masteries",
  "Sounding": "Warcries", "Resonant": "Warcries", "Echoing": "Warcries",
  "Trainer's": "Summoning", "Caretaker's": "Summoning", "Keeper's": "Summoning",
  "Spiritual": "Shape Shifting", "Feral": "Shape Shifting", "Communal": "Shape Shifting",
  "Nature's": "Elemental", "Terrene": "Elemental", "Gaea's": "Elemental",
  "Hexing": "Curses", "Blighting": "Curses", "Cursing": "Curses",
  "Fungal": "Poison and Bone", "Noxious": "Poison and Bone", "Venomous": "Poison and Bone",
  "Graverobber's": "Summoning", "Mojo": "Summoning", "Golemlord's": "Summoning",
  "Lion Branded": "Combat Skills", "Hawk Branded": "Combat Skills", "Rose Branded": "Combat Skills",
  "Captain's": "Offensive Auras", "Commander's": "Offensive Auras", "Marshal's": "Offensive Auras",
  "Preserver's": "Defensive Auras", "Warder's": "Defensive Auras", "Guardian's": "Defensive Auras",
  "Burning": "Fire Spells", "Blazing": "Fire Spells", "Volcanic": "Fire Spells",
  "Sparking": "Lightning Spells", "Charged": "Lightning Spells", "Powered": "Lightning Spells",
  "Chilling": "Cold Spells", "Freezing": "Cold Spells", "Glacial": "Cold Spells",
};

const PREFIXES: D2Affix[] = [
  // --- Sockets --------------------------------------------------------------
  p("Mechanic's", 10, "bodyArmor,circlets,helms,shields,weapons", "Socketed ({0})", [r("sockets", 1, 2)]),
  p("Artisan's", 33, "bodyArmor,helms,shields,weapons", "Socketed ({0})", [r("sockets", 3)]),
  p("Jeweler's", 55, "bodyArmor,helms,shields,weapons", "Socketed ({0})", [r("sockets", 4)]),

  // --- Attack rating --------------------------------------------------------
  p("Bronze", 1, "amulets,circlets,gloves,rings,weapons", "+{0} to Attack Rating", [r("attackRating", 10, 20)]),
  p("Bronze", 39, "smallCharms", "+{0} to Attack Rating", [r("attackRating", 13, 24)]),
  p("Bronze", 1, "smallCharms", "+{0} to Attack Rating", [r("attackRating", 2, 4)]),
  p("Bronze", 21, "smallCharms", "+{0} to Attack Rating", [r("attackRating", 6, 12)]),
  p("Bronze", 1, "largeCharms", "+{0} to Attack Rating", [r("attackRating", 4, 8)]),
  p("Bronze", 7, "largeCharms", "+{0} to Attack Rating", [r("attackRating", 6, 12)]),
  p("Bronze", 16, "largeCharms", "+{0} to Attack Rating", [r("attackRating", 13, 25)]),
  p("Bronze", 1, "grandCharms", "+{0} to Attack Rating", [r("attackRating", 6, 12)]),
  p("Bronze", 7, "grandCharms", "+{0} to Attack Rating", [r("attackRating", 13, 27)]),
  p("Bronze", 13, "grandCharms", "+{0} to Attack Rating", [r("attackRating", 28, 42)]),
  p("Iron", 4, "circlets,rings,weapons", "+{0} to Attack Rating", [r("attackRating", 21, 40)]),
  p("Iron", 39, "smallCharms", "+{0} to Attack Rating", [r("attackRating", 13, 24)]),
  p("Iron", 19, "grandCharms", "+{0} to Attack Rating", [r("attackRating", 43, 57)]),
  p("Iron", 25, "grandCharms", "+{0} to Attack Rating", [r("attackRating", 58, 72)]),
  p("Iron", 31, "grandCharms", "+{0} to Attack Rating", [r("attackRating", 73, 87)]),
  p("Iron", 25, "largeCharms", "+{0} to Attack Rating", [r("attackRating", 26, 38)]),
  p("Iron", 34, "largeCharms", "+{0} to Attack Rating", [r("attackRating", 39, 51)]),
  p("Steel", 8, "circlets,rings,weapons", "+{0} to Attack Rating", [r("attackRating", 41, 60)]),
  p("Steel", 57, "smallCharms", "+{0} to Attack Rating", [r("attackRating", 25, 36)]),
  p("Steel", 37, "grandCharms", "+{0} to Attack Rating", [r("attackRating", 88, 102)]),
  p("Steel", 43, "grandCharms", "+{0} to Attack Rating", [r("attackRating", 103, 117)]),
  p("Steel", 49, "grandCharms", "+{0} to Attack Rating", [r("attackRating", 118, 132)]),
  p("Steel", 43, "largeCharms", "+{0} to Attack Rating", [r("attackRating", 52, 64)]),
  p("Steel", 52, "largeCharms", "+{0} to Attack Rating", [r("attackRating", 65, 77)]),
  p("Silver", 12, "circlets,rings,weapons", "+{0} to Attack Rating", [r("attackRating", 61, 80)]),
  p("Silver", 25, "jewels", "+{0} to Attack Rating", [r("attackRating", 41, 60)]),
  p("Gold", 17, "circlets,rings,weapons", "+{0} to Attack Rating", [r("attackRating", 81, 100)]),
  p("Platinum", 22, "circlets,rings,weapons", "+{0} to Attack Rating", [r("attackRating", 101, 120)]),
  p("Meteoric", 27, "weapons", "+{0} to Attack Rating", [r("attackRating", 121, 150)]),
  p("Strange", 32, "weapons", "+{0} to Attack Rating", [r("attackRating", 151, 300)]),
  p("Weird", 37, "weapons", "+{0} to Attack Rating", [r("attackRating", 301, 450)]),
  p("Tin", 8, "jewels", "+{0} to Attack Rating", [r("attackRating", 21, 40)]),
  p("Argent", 44, "jewels", "+{0} to Attack Rating", [r("attackRating", 61, 100)]),
  p("Hawkeye", 35, "weapons", "+{0} to Attack Rating (Based on Character Level)", [r("attackRatingPerLevel", 6, 6, true)]),
  p("Visionary", 25, "helms,missileWeapons", "+{0}% Bonus to Attack Rating (Based on Character Level)", [r("attackRatingPercentPerLevel", 1, 1, true)]),

  // --- Attack rating with damage -------------------------------------------
  p("Sharp", 5, "weapons", "+{0} to Attack Rating; +{1}% Enhanced Damage", [r("attackRating", 10, 20), r("enhancedDamagePercent", 10, 20)]),
  p("Sharp", 28, "largeCharms", "+{0} to Attack Rating; +{1} to Maximum Damage", [r("attackRating", 21, 48), r("plusDamage", 4, 6)]),
  p("Sharp", 29, "grandCharms", "+{0} to Attack Rating; +{1} to Maximum Damage", [r("attackRating", 49, 76), r("plusDamage", 7, 10)]),
  p("Fine", 12, "weapons", "+{0} to Attack Rating; +{1}% Enhanced Damage", [r("attackRating", 21, 40), r("enhancedDamagePercent", 21, 30)]),
  p("Fine", 19, "largeCharms", "+{0} to Attack Rating; +{1} to Maximum Damage", [r("attackRating", 10, 20), r("plusDamage", 1, 3)]),
  p("Fine", 28, "smallCharms", "+{0} to Attack Rating; +{1} to Maximum Damage", [r("attackRating", 10, 20), r("plusDamage", 1, 3)]),
  p("Fine", 15, "grandCharms", "+{0} to Attack Rating; +{1} to Maximum Damage", [r("attackRating", 10, 20), r("plusDamage", 1, 3)]),
  p("Fine", 22, "grandCharms", "+{0} to Attack Rating; +{1} to Maximum Damage", [r("attackRating", 21, 48), r("plusDamage", 4, 6)]),
  p("Warrior's", 19, "weapons", "+{0} to Attack Rating; +{1}% Enhanced Damage", [r("attackRating", 41, 60), r("enhancedDamagePercent", 31, 40)]),
  p("Soldier's", 27, "weapons", "+{0} to Attack Rating; +{1}% Enhanced Damage", [r("attackRating", 61, 80), r("enhancedDamagePercent", 41, 50)]),
  p("Knight's", 38, "weapons", "+{0} to Attack Rating; +{1}% Enhanced Damage", [r("attackRating", 81, 100), r("enhancedDamagePercent", 51, 65)]),
  p("Lord's", 47, "weapons", "+{0} to Attack Rating; +{1}% Enhanced Damage", [r("attackRating", 101, 120), r("enhancedDamagePercent", 66, 80)]),
  p("King's", 56, "weapons", "+{0} to Attack Rating; +{1}% Enhanced Damage", [r("attackRating", 121, 150), r("enhancedDamagePercent", 81, 100)]),
  p("Master's", 56, "weapons", "+{0} to Attack Rating; +{1}% Enhanced Damage", [r("attackRating", 151, 250), r("enhancedDamagePercent", 101, 150)]),
  p("Grandmaster's", 69, "weapons", "+{0} to Attack Rating; +{1}% Enhanced Damage", [r("attackRating", 251, 300), r("enhancedDamagePercent", 151, 200)]),
  p("Fool's", 50, "weapons", "+{0} to Attack Rating / +{1} to Maximum Damage (Based on Character Level)", [r("attackRatingPerLevel", 16.5, 16.5, true), r("plusDamagePerLevel", 0.5, 0.5, true)]),
  p("Grinding", 50, "weapons", "+{0} to Maximum Damage (Based on Character Level)", [r("plusDamagePerLevel", 0.75, 0.75, true)]),

  // --- Damage versus demons / undead ---------------------------------------
  p("Lunar", 3, "circlets,weapons", "+{0} to Attack Rating against Demons; +{1}% Damage to Demons", [r("attackRatingVsDemons", 25, 50), r("damageToDemonsPercent", 10, 25)]),
  p("Diamond", 26, "jewels", "+{0} to Attack Rating against Demons; +{1}% Damage to Demons", [r("attackRatingVsDemons", 25, 50), r("damageToDemonsPercent", 25, 40)]),
  p("Arcadian", 15, "circlets,weapons", "+{0} to Attack Rating against Demons; +{1}% Damage to Demons", [r("attackRatingVsDemons", 51, 100), r("damageToDemonsPercent", 26, 50)]),
  p("Unearthly", 25, "weapons", "+{0} to Attack Rating against Demons; +{1}% Damage to Demons", [r("attackRatingVsDemons", 101, 150), r("damageToDemonsPercent", 51, 100)]),
  p("Astral", 35, "weapons", "+{0} to Attack Rating against Demons; +{1}% Damage to Demons", [r("attackRatingVsDemons", 151, 200), r("damageToDemonsPercent", 101, 150)]),
  p("Elysian", 45, "weapons", "+{0} to Attack Rating against Demons; +{1}% Damage to Demons", [r("attackRatingVsDemons", 201, 300), r("damageToDemonsPercent", 151, 200)]),
  p("Celestial", 55, "weapons", "+{0} to Attack Rating against Demons; +{1}% Damage to Demons", [r("attackRatingVsDemons", 301, 400), r("damageToDemonsPercent", 201, 300)]),
  p("Pearl", 18, "jewels", "+{0} to Attack Rating against Undead; +{1}% Damage to Undead", [r("attackRatingVsUndead", 25, 50), r("damageToUndeadPercent", 25, 50)]),
  p("Consecrated", 1, "weapons", "+{0} to Attack Rating against Undead; +{1}% Damage to Undead", [r("attackRatingVsUndead", 25, 75), r("damageToUndeadPercent", 25, 75)]),
  p("Pure", 15, "weapons", "+{0} to Attack Rating against Undead; +{1}% Damage to Undead", [r("attackRatingVsUndead", 76, 175), r("damageToUndeadPercent", 76, 125)]),
  p("Sacred", 25, "weapons", "+{0} to Attack Rating against Undead; +{1}% Damage to Undead", [r("attackRatingVsUndead", 175, 250), r("damageToUndeadPercent", 126, 200)]),
  p("Hallowed", 35, "weapons", "+{0} to Attack Rating against Undead; +{1}% Damage to Undead", [r("attackRatingVsUndead", 251, 325), r("damageToUndeadPercent", 201, 275)]),
  p("Divine", 45, "weapons", "+{0} to Attack Rating against Undead; +{1}% Damage to Undead", [r("attackRatingVsUndead", 326, 450), r("damageToUndeadPercent", 276, 350)]),

  // --- Defense --------------------------------------------------------------
  p("Sturdy", 1, "armor", "+{0}% Enhanced Defense", [r("armorPercent", 10, 20)]),
  p("Sturdy", 4, "armor", "+{0}% Enhanced Defense", [r("armorPercent", 21, 30)]),
  p("Strong", 9, "armor", "+{0}% Enhanced Defense", [r("armorPercent", 31, 40)]),
  p("Glorious", 19, "armor", "+{0}% Enhanced Defense", [r("armorPercent", 41, 50)]),
  p("Blessed", 25, "armor", "+{0}% Enhanced Defense", [r("armorPercent", 51, 65)]),
  p("Saintly", 31, "armor", "+{0}% Enhanced Defense", [r("armorPercent", 66, 80)]),
  p("Holy", 36, "armor", "+{0}% Enhanced Defense", [r("armorPercent", 81, 100)]),
  p("Godly", 45, "armor", "+{0}% Enhanced Defense", [r("armorPercent", 101, 200)]),
  p("Godly", 50, "armor", "+{0}% Enhanced Defense", [r("armorPercent", 101, 200)]),
  p("Stout", 1, "smallCharms", "+{0} Defense", [r("armor", 1)]),
  p("Stout", 21, "smallCharms", "+{0} Defense", [r("armor", 4, 8)]),
  p("Stout", 1, "largeCharms", "+{0} Defense", [r("armor", 2, 3)]),
  p("Stout", 14, "largeCharms", "+{0} Defense", [r("armor", 4, 6)]),
  p("Stout", 20, "largeCharms", "+{0} Defense", [r("armor", 8, 12)]),
  p("Stout", 1, "grandCharms", "+{0} Defense", [r("armor", 3, 5)]),
  p("Stout", 7, "grandCharms", "+{0} Defense", [r("armor", 6, 9)]),
  p("Stout", 12, "grandCharms", "+{0} Defense", [r("armor", 10, 12)]),
  p("Burly", 36, "smallCharms", "+{0} Defense", [r("armor", 15, 20)]),
  p("Burly", 26, "largeCharms", "+{0} Defense", [r("armor", 13, 18)]),
  p("Burly", 32, "largeCharms", "+{0} Defense", [r("armor", 20, 30)]),
  p("Burly", 17, "grandCharms", "+{0} Defense", [r("armor", 13, 15)]),
  p("Burly", 22, "grandCharms", "+{0} Defense", [r("armor", 16, 22)]),
  p("Burly", 27, "grandCharms", "+{0} Defense", [r("armor", 23, 30)]),
  p("Stalwart", 48, "smallCharms", "+{0} Defense", [r("armor", 20, 30)]),
  p("Stalwart", 38, "largeCharms", "+{0} Defense", [r("armor", 30, 40)]),
  p("Stalwart", 45, "largeCharms", "+{0} Defense", [r("armor", 45, 60)]),
  p("Stalwart", 32, "grandCharms", "+{0} Defense", [r("armor", 33, 40)]),
  p("Stalwart", 37, "grandCharms", "+{0} Defense", [r("armor", 44, 50)]),
  p("Stalwart", 42, "grandCharms", "+{0} Defense", [r("armor", 60, 100)]),
  p("Blanched", 1, "jewels", "+{0} Defense", [r("armor", 5, 8)]),
  p("Eburine", 16, "jewels", "+{0} Defense", [r("armor", 9, 20)]),
  p("Bone", 32, "jewels", "+{0} Defense", [r("armor", 21, 40)]),
  p("Ivory", 64, "jewels", "+{0} Defense", [r("armor", 41, 64)]),
  p("Faithful", 30, "bodyArmor", "+{0} Defense (Based on Character Level)", [r("armorPerLevel", 3, 3, true)]),
  p("Faithful", 30, "belts,boots,gloves,shields", "+{0} Defense (Based on Character Level)", [r("armorPerLevel", 0.5, 0.5, true)]),

  // --- Cold damage prefixes -------------------------------------------------
  p("Snowy", 9, "grandCharms", "Adds {0} Cold Damage", [r("coldDamage", 1, 3)]),
  p("Snowy", 27, "smallCharms", "Adds {0} Cold Damage", [r("coldDamage", 1, 4)]),
  p("Snowy", 18, "largeCharms", "Adds {0} Cold Damage", [r("coldDamage", 2, 5)]),
  p("Snowy", 25, "circlets,weapons", "Adds {0} Cold Damage", [r("coldDamage", 6, 30)]),
  p("Shivering", 15, "grandCharms", "Adds {0} Cold Damage", [r("coldDamage", 2, 8)]),
  p("Shivering", 42, "smallCharms", "Adds {0} Cold Damage", [r("coldDamage", 3, 8)]),
  p("Shivering", 29, "largeCharms", "Adds {0} Cold Damage", [r("coldDamage", 4, 10)]),
  p("Shivering", 35, "weapons", "Adds {0} Cold Damage", [r("coldDamage", 10, 45)]),
  p("Boreal", 66, "smallCharms", "Adds {0} Cold Damage", [r("coldDamage", 5, 14)]),
  p("Boreal", 30, "grandCharms", "Adds {0} Cold Damage", [r("coldDamage", 5, 15)]),
  p("Boreal", 49, "largeCharms", "Adds {0} Cold Damage", [r("coldDamage", 6, 20)]),
  p("Boreal", 50, "weapons", "Adds {0} Cold Damage", [r("coldDamage", 16, 90)]),
  p("Hibernal", 91, "smallCharms", "Adds {0} Cold Damage", [r("coldDamage", 8, 20)]),
  p("Hibernal", 45, "grandCharms", "Adds {0} Cold Damage", [r("coldDamage", 8, 25)]),
  p("Hibernal", 69, "largeCharms", "Adds {0} Cold Damage", [r("coldDamage", 11, 30)]),
  p("Hibernal", 70, "weapons", "Adds {0} Cold Damage", [r("coldDamage", 24, 140)]),

  // --- Fire damage prefixes -------------------------------------------------
  p("Ember", 5, "grandCharms,largeCharms,smallCharms", "Adds {0} Fire Damage", [r("fireDamage", 1, 3)]),
  p("Fiery", 25, "circlets,weapons", "Adds {0} Fire Damage", [r("fireDamage", 16, 60)]),
  p("Smoldering", 15, "grandCharms", "Adds {0} Fire Damage", [r("fireDamage", 2, 7)]),
  p("Smoldering", 40, "smallCharms", "Adds {0} Fire Damage", [r("fireDamage", 2, 10)]),
  p("Smoldering", 27, "largeCharms", "Adds {0} Fire Damage", [r("fireDamage", 2, 12)]),
  p("Smoldering", 35, "weapons", "Adds {0} Fire Damage", [r("fireDamage", 26, 90)]),
  p("Smoking", 28, "grandCharms", "Adds {0} Fire Damage", [r("fireDamage", 4, 19)]),
  p("Smoking", 64, "smallCharms", "Adds {0} Fire Damage", [r("fireDamage", 4, 19)]),
  p("Smoking", 47, "largeCharms", "Adds {0} Fire Damage", [r("fireDamage", 4, 27)]),
  p("Smoking", 47, "weapons", "Adds {0} Fire Damage", [r("fireDamage", 51, 130)]),
  p("Flaming", 43, "grandCharms", "Adds {0} Fire Damage", [r("fireDamage", 8, 36)]),
  p("Flaming", 89, "smallCharms", "Adds {0} Fire Damage", [r("fireDamage", 10, 29)]),
  p("Flaming", 67, "largeCharms", "Adds {0} Fire Damage", [r("fireDamage", 10, 43)]),
  p("Flaming", 61, "weapons", "Adds {0} Fire Damage", [r("fireDamage", 81, 180)]),
  p("Condensing", 77, "weapons", "Adds {0} Fire Damage", [r("fireDamage", 121, 240)]),

  // --- Lightning damage prefixes -------------------------------------------
  p("Static", 7, "grandCharms", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 5)]),
  p("Static", 14, "largeCharms", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 9)]),
  p("Static", 23, "smallCharms", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 11)]),
  p("Static", 25, "circlets,weapons", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 120)]),
  p("Glowing", 14, "grandCharms", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 17)]),
  p("Glowing", 28, "largeCharms", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 26)]),
  p("Glowing", 41, "smallCharms", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 24)]),
  p("Glowing", 34, "weapons", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 180)]),
  p("Buzzing", 46, "weapons", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 260)]),
  p("Arcing", 29, "grandCharms", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 44)]),
  p("Arcing", 65, "smallCharms", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 43)]),
  p("Arcing", 48, "largeCharms", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 58)]),
  p("Arcing", 60, "weapons", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 360)]),
  p("Shocking", 90, "smallCharms", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 71)]),
  p("Shocking", 44, "grandCharms", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 79)]),
  p("Shocking", 68, "largeCharms", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 90)]),
  p("Shocking", 76, "weapons", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 480)]),

  // --- Poison damage prefixes ----------------------------------------------
  p("Septic", 1, "grandCharms", "+{0} Poison Damage over 3 Seconds", [r("poisonDamage", 5)]),
  p("Septic", 1, "circlets,weapons", "+{0} Poison Damage over 2 Seconds", [r("poisonDamage", 6)]),
  p("Septic", 9, "largeCharms", "+{0} Poison Damage over 3 Seconds", [r("poisonDamage", 10)]),
  p("Septic", 18, "smallCharms", "+{0} Poison Damage over 3 Seconds", [r("poisonDamage", 15)]),
  p("Foul", 10, "weapons", "+{0} Poison Damage over 3 Seconds", [r("poisonDamage", 12)]),
  p("Foul", 12, "grandCharms", "+{0} Poison Damage over 4 Seconds", [r("poisonDamage", 15)]),
  p("Foul", 26, "largeCharms", "+{0} Poison Damage over 4 Seconds", [r("poisonDamage", 30)]),
  p("Foul", 39, "smallCharms", "+{0} Poison Damage over 4 Seconds", [r("poisonDamage", 50)]),
  p("Corrosive", 20, "weapons", "+{0} Poison Damage over 4 Seconds", [r("poisonDamage", 80)]),
  p("Toxic", 27, "grandCharms", "+{0} Poison Damage over 6 Seconds", [r("poisonDamage", 50)]),
  p("Toxic", 46, "largeCharms", "+{0} Poison Damage over 5 Seconds", [r("poisonDamage", 90)]),
  p("Toxic", 63, "smallCharms", "+{0} Poison Damage over 5 Seconds", [r("poisonDamage", 100)]),
  p("Toxic", 35, "weapons", "+{0} Poison Damage over 5 Seconds", [r("poisonDamage", 150)]),
  p("Pestilent", 42, "grandCharms", "+{0} Poison Damage over 6 Seconds", [r("poisonDamage", 100)]),
  p("Pestilent", 66, "largeCharms", "+{0} Poison Damage over 6 Seconds", [r("poisonDamage", 175)]),
  p("Pestilent", 88, "smallCharms", "+{0} Poison Damage over 6 Seconds", [r("poisonDamage", 175)]),
  p("Pestilent", 50, "weapons", "+{0} Poison Damage over 6 Seconds", [r("poisonDamage", 275)]),

  // --- Resistances ----------------------------------------------------------
  p("Shimmering", 33, "smallCharms", "All Resistances +{0}%", [r("allResistPercent", 3, 5)]),
  p("Shimmering", 6, "shields", "All Resistances +{0}%", [r("allResistPercent", 3, 7)]),
  p("Shimmering", 8, "amulets,circlets", "All Resistances +{0}%", [r("allResistPercent", 3, 7)]),
  p("Shimmering", 45, "rings", "All Resistances +{0}%", [r("allResistPercent", 3, 7)]),
  p("Shimmering", 17, "largeCharms", "All Resistances +{0}%", [r("allResistPercent", 3, 5)]),
  p("Shimmering", 34, "largeCharms", "All Resistances +{0}%", [r("allResistPercent", 6, 8)]),
  p("Shimmering", 16, "jewels", "All Resistances +{0}%", [r("allResistPercent", 5, 10)]),
  p("Shimmering", 8, "grandCharms", "All Resistances +{0}%", [r("allResistPercent", 3, 6)]),
  p("Shimmering", 14, "grandCharms", "All Resistances +{0}%", [r("allResistPercent", 8, 12)]),
  p("Shimmering", 35, "grandCharms", "All Resistances +{0}%", [r("allResistPercent", 13, 15)]),
  p("Rainbow", 18, "shields", "All Resistances +{0}%", [r("allResistPercent", 8, 11)]),
  p("Rainbow", 21, "amulets,circlets", "All Resistances +{0}%", [r("allResistPercent", 8, 11)]),
  p("Rainbow", 56, "rings", "All Resistances +{0}%", [r("allResistPercent", 8, 11)]),
  p("Scintillating", 34, "jewels", "All Resistances +{0}%", [r("allResistPercent", 11, 15)]),
  p("Scintillating", 28, "shields", "All Resistances +{0}%", [r("allResistPercent", 12, 15)]),
  p("Scintillating", 34, "amulets,circlets", "All Resistances +{0}%", [r("allResistPercent", 12, 15)]),
  p("Scintillating", 67, "rings", "All Resistances +{0}%", [r("allResistPercent", 12, 15)]),
  p("Prismatic", 39, "shields", "All Resistances +{0}%", [r("allResistPercent", 16, 20)]),
  p("Prismatic", 42, "amulets,circlets", "All Resistances +{0}%", [r("allResistPercent", 16, 20)]),
  p("Chromatic", 50, "shields", "All Resistances +{0}%", [r("allResistPercent", 21, 30)]),
  p("Chromatic", 55, "amulets,circlets", "All Resistances +{0}%", [r("allResistPercent", 21, 30)]),

  p("Azure", 1, "smallCharms", "Cold Resist +{0}%", [r("coldResistPercent", 3, 5)]),
  p("Azure", 1, "largeCharms", "Cold Resist +{0}%", [r("coldResistPercent", 4, 7)]),
  p("Azure", 1, "amulets,armor,circlets,orbs,rings", "Cold Resist +{0}%", [r("coldResistPercent", 5)]),
  p("Azure", 5, "amulets,armor,circlets,orbs,rings,weapons", "Cold Resist +{0}%", [r("coldResistPercent", 5, 10)]),
  p("Azure", 1, "grandCharms", "Cold Resist +{0}%", [r("coldResistPercent", 7, 15)]),
  p("Lapis", 14, "smallCharms", "Cold Resist +{0}%", [r("coldResistPercent", 6, 7)]),
  p("Lapis", 16, "largeCharms", "Cold Resist +{0}%", [r("coldResistPercent", 8, 10)]),
  p("Lapis", 12, "amulets,armor,circlets,orbs,rings", "Cold Resist +{0}%", [r("coldResistPercent", 11, 20)]),
  p("Lapis", 35, "weapons", "Cold Resist +{0}%", [r("coldResistPercent", 11, 20)]),
  p("Lapis", 10, "grandCharms", "Cold Resist +{0}%", [r("coldResistPercent", 16, 20)]),
  p("Cobalt", 27, "smallCharms", "Cold Resist +{0}%", [r("coldResistPercent", 8, 9)]),
  p("Cobalt", 25, "largeCharms", "Cold Resist +{0}%", [r("coldResistPercent", 11, 12)]),
  p("Cobalt", 20, "grandCharms", "Cold Resist +{0}%", [r("coldResistPercent", 21, 25)]),
  p("Cobalt", 18, "amulets,armor,circlets,orbs,rings", "Cold Resist +{0}%", [r("coldResistPercent", 21, 30)]),
  p("Cobalt", 55, "weapons", "Cold Resist +{0}%", [r("coldResistPercent", 21, 30)]),
  p("Sapphire", 40, "smallCharms", "Cold Resist +{0}%", [r("coldResistPercent", 10, 11)]),
  p("Sapphire", 35, "largeCharms", "Cold Resist +{0}%", [r("coldResistPercent", 13, 15)]),
  p("Sapphire", 19, "jewels", "Cold Resist +{0}%", [r("coldResistPercent", 16, 30)]),
  p("Sapphire", 30, "grandCharms", "Cold Resist +{0}%", [r("coldResistPercent", 26, 30)]),
  p("Sapphire", 25, "amulets,boots,circlets,orbs,rods", "Cold Resist +{0}%", [r("coldResistPercent", 31, 40)]),
  p("Lapis Lazuli", 2, "jewels", "Cold Resist +{0}%", [r("coldResistPercent", 5, 15)]),

  p("Crimson", 1, "smallCharms", "Fire Resist +{0}%", [r("fireResistPercent", 3, 5)]),
  p("Crimson", 1, "largeCharms", "Fire Resist +{0}%", [r("fireResistPercent", 4, 7)]),
  p("Crimson", 1, "amulets,armor,circlets,orbs,rings", "Fire Resist +{0}%", [r("fireResistPercent", 5)]),
  p("Crimson", 5, "amulets,armor,circlets,orbs,rings,weapons", "Fire Resist +{0}%", [r("fireResistPercent", 5, 10)]),
  p("Crimson", 1, "grandCharms", "Fire Resist +{0}%", [r("fireResistPercent", 7, 15)]),
  p("Russet", 14, "smallCharms", "Fire Resist +{0}%", [r("fireResistPercent", 6, 7)]),
  p("Russet", 16, "largeCharms", "Fire Resist +{0}%", [r("fireResistPercent", 8, 10)]),
  p("Russet", 12, "amulets,armor,circlets,orbs,rings", "Fire Resist +{0}%", [r("fireResistPercent", 11, 20)]),
  p("Russet", 35, "weapons", "Fire Resist +{0}%", [r("fireResistPercent", 11, 20)]),
  p("Russet", 10, "grandCharms", "Fire Resist +{0}%", [r("fireResistPercent", 16, 20)]),
  p("Garnet", 27, "smallCharms", "Fire Resist +{0}%", [r("fireResistPercent", 8, 9)]),
  p("Garnet", 25, "largeCharms", "Fire Resist +{0}%", [r("fireResistPercent", 11, 12)]),
  p("Garnet", 2, "jewels", "Fire Resist +{0}%", [r("fireResistPercent", 5, 15)]),
  p("Garnet", 20, "grandCharms", "Fire Resist +{0}%", [r("fireResistPercent", 21, 25)]),
  p("Garnet", 18, "amulets,armor,circlets,orbs,rings", "Fire Resist +{0}%", [r("fireResistPercent", 21, 30)]),
  p("Garnet", 55, "weapons", "Fire Resist +{0}%", [r("fireResistPercent", 21, 30)]),
  p("Ruby", 40, "smallCharms", "Fire Resist +{0}%", [r("fireResistPercent", 10, 11)]),
  p("Ruby", 35, "largeCharms", "Fire Resist +{0}%", [r("fireResistPercent", 13, 15)]),
  p("Ruby", 19, "jewels", "Fire Resist +{0}%", [r("fireResistPercent", 16, 30)]),
  p("Ruby", 30, "grandCharms", "Fire Resist +{0}%", [r("fireResistPercent", 26, 30)]),
  p("Ruby", 25, "amulets,boots,circlets,orbs,rods", "Fire Resist +{0}%", [r("fireResistPercent", 31, 40)]),

  p("Tangerine", 1, "smallCharms", "Lightning Resist +{0}%", [r("lightningResistPercent", 3, 5)]),
  p("Tangerine", 1, "largeCharms", "Lightning Resist +{0}%", [r("lightningResistPercent", 4, 7)]),
  p("Tangerine", 1, "amulets,armor,circlets,orbs,rings", "Lightning Resist +{0}%", [r("lightningResistPercent", 5)]),
  p("Tangerine", 5, "amulets,armor,circlets,orbs,rings,weapons", "Lightning Resist +{0}%", [r("lightningResistPercent", 5, 10)]),
  p("Tangerine", 1, "grandCharms", "Lightning Resist +{0}%", [r("lightningResistPercent", 7, 15)]),
  p("Ocher", 14, "smallCharms", "Lightning Resist +{0}%", [r("lightningResistPercent", 6, 7)]),
  p("Ocher", 16, "largeCharms", "Lightning Resist +{0}%", [r("lightningResistPercent", 8, 10)]),
  p("Ocher", 12, "amulets,armor,circlets,orbs,rings", "Lightning Resist +{0}%", [r("lightningResistPercent", 11, 20)]),
  p("Ocher", 35, "weapons", "Lightning Resist +{0}%", [r("lightningResistPercent", 11, 20)]),
  p("Ocher", 10, "grandCharms", "Lightning Resist +{0}%", [r("lightningResistPercent", 16, 20)]),
  p("Coral", 27, "smallCharms", "Lightning Resist +{0}%", [r("lightningResistPercent", 8, 9)]),
  p("Coral", 25, "largeCharms", "Lightning Resist +{0}%", [r("lightningResistPercent", 11, 12)]),
  p("Coral", 20, "grandCharms", "Lightning Resist +{0}%", [r("lightningResistPercent", 21, 25)]),
  p("Coral", 18, "amulets,armor,circlets,orbs,rings", "Lightning Resist +{0}%", [r("lightningResistPercent", 21, 30)]),
  p("Coral", 55, "weapons", "Lightning Resist +{0}%", [r("lightningResistPercent", 21, 30)]),
  p("Amber", 40, "smallCharms", "Lightning Resist +{0}%", [r("lightningResistPercent", 10, 11)]),
  p("Amber", 35, "largeCharms", "Lightning Resist +{0}%", [r("lightningResistPercent", 13, 15)]),
  p("Amber", 30, "grandCharms", "Lightning Resist +{0}%", [r("lightningResistPercent", 26, 30)]),
  p("Amber", 25, "amulets,boots,circlets,orbs,rods", "Lightning Resist +{0}%", [r("lightningResistPercent", 31, 40)]),
  p("Camphor", 2, "jewels", "Lightning Resist +{0}%", [r("lightningResistPercent", 5, 15)]),
  p("Ambergris", 19, "jewels", "Lightning Resist +{0}%", [r("lightningResistPercent", 16, 30)]),

  p("Beryl", 1, "smallCharms", "Poison Resist +{0}%", [r("poisonResistPercent", 3, 5)]),
  p("Beryl", 1, "largeCharms", "Poison Resist +{0}%", [r("poisonResistPercent", 4, 7)]),
  p("Beryl", 1, "amulets,armor,circlets,orbs,rings", "Poison Resist +{0}%", [r("poisonResistPercent", 5)]),
  p("Beryl", 5, "amulets,armor,circlets,orbs,rings,weapons", "Poison Resist +{0}%", [r("poisonResistPercent", 5, 10)]),
  p("Beryl", 2, "jewels", "Poison Resist +{0}%", [r("poisonResistPercent", 5, 15)]),
  p("Beryl", 1, "grandCharms", "Poison Resist +{0}%", [r("poisonResistPercent", 7, 15)]),
  p("Viridian", 14, "smallCharms", "Poison Resist +{0}%", [r("poisonResistPercent", 6, 7)]),
  p("Viridian", 16, "largeCharms", "Poison Resist +{0}%", [r("poisonResistPercent", 8, 10)]),
  p("Viridian", 12, "amulets,armor,circlets,orbs,rings", "Poison Resist +{0}%", [r("poisonResistPercent", 11, 20)]),
  p("Viridian", 35, "weapons", "Poison Resist +{0}%", [r("poisonResistPercent", 11, 20)]),
  p("Viridian", 10, "grandCharms", "Poison Resist +{0}%", [r("poisonResistPercent", 16, 20)]),
  p("Jade", 27, "smallCharms", "Poison Resist +{0}%", [r("poisonResistPercent", 8, 9)]),
  p("Jade", 25, "largeCharms", "Poison Resist +{0}%", [r("poisonResistPercent", 11, 12)]),
  p("Jade", 19, "jewels", "Poison Resist +{0}%", [r("poisonResistPercent", 16, 30)]),
  p("Jade", 20, "grandCharms", "Poison Resist +{0}%", [r("poisonResistPercent", 21, 25)]),
  p("Jade", 18, "amulets,armor,circlets,orbs,rings", "Poison Resist +{0}%", [r("poisonResistPercent", 21, 30)]),
  p("Jade", 55, "weapons", "Poison Resist +{0}%", [r("poisonResistPercent", 21, 30)]),
  p("Emerald", 40, "smallCharms", "Poison Resist +{0}%", [r("poisonResistPercent", 10, 11)]),
  p("Emerald", 35, "largeCharms", "Poison Resist +{0}%", [r("poisonResistPercent", 13, 15)]),
  p("Emerald", 30, "grandCharms", "Poison Resist +{0}%", [r("poisonResistPercent", 26, 30)]),
  p("Emerald", 25, "amulets,boots,circlets,orbs,rods", "Poison Resist +{0}%", [r("poisonResistPercent", 31, 40)]),

  // --- Enhanced damage ------------------------------------------------------
  p("Jagged", 1, "circlets,weapons", "+{0}% Enhanced Damage", [r("enhancedDamagePercent", 10, 20)]),
  p("Deadly", 5, "circlets,weapons", "+{0}% Enhanced Damage", [r("enhancedDamagePercent", 21, 30)]),
  p("Vicious", 8, "weapons", "+{0}% Enhanced Damage", [r("enhancedDamagePercent", 31, 40)]),
  p("Brutal", 14, "weapons", "+{0}% Enhanced Damage", [r("enhancedDamagePercent", 41, 50)]),
  p("Massive", 20, "weapons", "+{0}% Enhanced Damage", [r("enhancedDamagePercent", 51, 65)]),
  p("Savage", 26, "weapons", "+{0}% Enhanced Damage", [r("enhancedDamagePercent", 66, 80)]),
  p("Merciless", 32, "weapons", "+{0}% Enhanced Damage", [r("enhancedDamagePercent", 81, 100)]),
  p("Ferocious", 41, "weapons", "+{0}% Enhanced Damage", [r("enhancedDamagePercent", 101, 200)]),
  p("Cruel", 51, "weapons", "+{0}% Enhanced Damage", [r("enhancedDamagePercent", 201, 300)]),
  p("Cruel", 56, "weapons", "+{0}% Enhanced Damage", [r("enhancedDamagePercent", 201, 300)]),
  p("Cinnabar", 1, "jewels", "+{0}% Enhanced Damage", [r("enhancedDamagePercent", 5, 10)]),
  p("Rusty", 13, "jewels", "+{0}% Enhanced Damage", [r("enhancedDamagePercent", 11, 20)]),
  p("Realgar", 45, "jewels", "+{0}% Enhanced Damage", [r("enhancedDamagePercent", 21, 30)]),
  p("Ruby", 66, "jewels", "+{0}% Enhanced Damage", [r("enhancedDamagePercent", 31, 40)]),

  // --- Maximum and minimum damage -----------------------------------------
  p("Jagged", 7, "grandCharms", "+{0} to Maximum Damage", [r("plusDamage", 1)]),
  p("Jagged", 22, "largeCharms", "+{0} to Maximum Damage", [r("plusDamage", 1)]),
  p("Jagged", 81, "smallCharms", "+{0} to Maximum Damage", [r("plusDamage", 1)]),
  p("Forked", 37, "grandCharms", "+{0} to Maximum Damage", [r("plusDamage", 2)]),
  p("Forked", 52, "largeCharms", "+{0} to Maximum Damage", [r("plusDamage", 2)]),
  p("Serrated", 67, "grandCharms", "+{0} to Maximum Damage", [r("plusDamage", 3)]),
  p("Carbuncle", 12, "jewels", "+{0} to Maximum Damage", [r("plusDamage", 1, 5)]),
  p("Carmine", 35, "jewels", "+{0} to Maximum Damage", [r("plusDamage", 6, 9)]),
  p("Vermilion", 58, "jewels", "+{0} to Maximum Damage", [r("plusDamage", 11, 15)]),
  p("Red", 15, "grandCharms", "+{0} to Minimum Damage", [r("plusDamageMin", 1)]),
  p("Red", 30, "largeCharms", "+{0} to Minimum Damage", [r("plusDamageMin", 1)]),
  p("Red", 90, "smallCharms", "+{0} to Minimum Damage", [r("plusDamageMin", 1)]),
  p("Sanguinary", 45, "grandCharms", "+{0} to Minimum Damage", [r("plusDamageMin", 2)]),
  p("Sanguinary", 60, "largeCharms", "+{0} to Minimum Damage", [r("plusDamageMin", 2)]),
  p("Bloody", 75, "grandCharms", "+{0} to Minimum Damage", [r("plusDamageMin", 3)]),
  p("Scarlet", 8, "jewels", "+{0} to Minimum Damage", [r("plusDamageMin", 1, 4)]),
  p("Crimson", 38, "jewels", "+{0} to Minimum Damage", [r("plusDamageMin", 5, 8)]),

  // --- Stack size and light radius -----------------------------------------
  p("Compact", 1, "throwingWeapons", "+{0} Quantity", [r("quantity", 20, 40)]),
  p("Thin", 17, "throwingWeapons", "+{0} Quantity", [r("quantity", 41, 80)]),
  p("Dense", 38, "throwingWeapons", "+{0} Quantity", [r("quantity", 81, 120)]),
  p("Bright", 1, "jewels", "+1 to Light Radius; +{0} to Attack Rating", [r("attackRating", 10), r("lightRadius", 1)]),
  p("Glimmering", 1, "amulets,armor,orbs,rings,staves,wands", "+1 to Light Radius", [r("lightRadius", 1)]),
  p("Glowing", 6, "amulets,armor,orbs,rings,staves,wands", "+2 to Light Radius", [r("lightRadius", 2)]),

  // --- Magic find -----------------------------------------------------------
  p("Lucky", 34, "largeCharms", "+{0}% Better Chance of Getting Magic Items", [r("magicFindPercent", 1)]),
  p("Lucky", 51, "largeCharms", "+{0}% Better Chance of Getting Magic Items", [r("magicFindPercent", 2, 3)]),
  p("Lucky", 53, "largeCharms", "+{0}% Better Chance of Getting Magic Items", [r("magicFindPercent", 4, 6)]),
  p("Lucky", 21, "grandCharms", "+{0}% Better Chance of Getting Magic Items", [r("magicFindPercent", 1, 4)]),
  p("Lucky", 38, "grandCharms", "+{0}% Better Chance of Getting Magic Items", [r("magicFindPercent", 5, 7)]),
  p("Lucky", 55, "grandCharms", "+{0}% Better Chance of Getting Magic Items", [r("magicFindPercent", 8, 12)]),
  p("Emerald", 16, "jewels", "+{0}% Better Chance of Getting Magic Items", [r("magicFindPercent", 3, 7)]),
  p("Felicitous", 5, "amulets,circlets,rings", "+{0}% Better Chance of Getting Magic Items", [r("magicFindPercent", 5, 10)]),
  p("Fortuitous", 12, "amulets,circlets,rings", "+{0}% Better Chance of Getting Magic Items", [r("magicFindPercent", 11, 15)]),

  // --- Mana ---------------------------------------------------------------
  p("Lizard's", 1, "amulets,rings", "+{0} to Mana", [r("plusMana", 1, 2)]),
  p("Lizard's", 3, "amulets,rings", "+{0} to Mana", [r("plusMana", 3, 5)]),
  p("Lizard's", 1, "armor,orbs,rods", "+{0} to Mana", [r("plusMana", 1, 2)]),
  p("Lizard's", 3, "armor,orbs,rods", "+{0} to Mana", [r("plusMana", 3, 5)]),
  p("Lizard's", 16, "smallCharms", "+{0} to Mana", [r("plusMana", 1, 7)]),
  p("Lizard's", 1, "largeCharms", "+{0} to Mana", [r("plusMana", 2, 4)]),
  p("Lizard's", 9, "largeCharms", "+{0} to Mana", [r("plusMana", 5, 7)]),
  p("Lizard's", 17, "largeCharms", "+{0} to Mana", [r("plusMana", 8, 12)]),
  p("Lizard's", 1, "grandCharms", "+{0} to Mana", [r("plusMana", 3, 7)]),
  p("Lizard's", 7, "grandCharms", "+{0} to Mana", [r("plusMana", 8, 13)]),
  p("Lizard's", 13, "grandCharms", "+{0} to Mana", [r("plusMana", 14, 20)]),
  p("Snake's", 6, "amulets,belts,circlets,rings,rods,shields", "+{0} to Mana", [r("plusMana", 6, 10)]),
  p("Snake's", 32, "smallCharms", "+{0} to Mana", [r("plusMana", 8, 12)]),
  p("Snake's", 25, "largeCharms", "+{0} to Mana", [r("plusMana", 13, 18)]),
  p("Snake's", 33, "largeCharms", "+{0} to Mana", [r("plusMana", 19, 23)]),
  p("Snake's", 19, "grandCharms", "+{0} to Mana", [r("plusMana", 21, 26)]),
  p("Snake's", 25, "grandCharms", "+{0} to Mana", [r("plusMana", 27, 33)]),
  p("Snake's", 31, "grandCharms", "+{0} to Mana", [r("plusMana", 34, 39)]),
  p("Serpent's", 14, "amulets,belts,circlets,rings,rods,shields", "+{0} to Mana", [r("plusMana", 11, 20)]),
  p("Serpent's", 37, "bodyArmor,boots,gloves,orbs,weapons", "+{0} to Mana", [r("plusMana", 11, 20)]),
  p("Serpent's", 48, "smallCharms", "+{0} to Mana", [r("plusMana", 13, 17)]),
  p("Serpent's", 41, "largeCharms", "+{0} to Mana", [r("plusMana", 24, 29)]),
  p("Serpent's", 49, "largeCharms", "+{0} to Mana", [r("plusMana", 30, 34)]),
  p("Serpent's", 37, "grandCharms", "+{0} to Mana", [r("plusMana", 40, 46)]),
  p("Serpent's", 43, "grandCharms", "+{0} to Mana", [r("plusMana", 47, 52)]),
  p("Serpent's", 49, "grandCharms", "+{0} to Mana", [r("plusMana", 53, 59)]),
  p("Drake's", 20, "amulets,belts,circlets,orbs,rings,rods", "+{0} to Mana", [r("plusMana", 21, 30)]),
  p("Dragon's", 24, "amulets,circlets,orbs,rings,rods", "+{0} to Mana", [r("plusMana", 31, 40)]),
  p("Dragon's", 52, "bodyArmor,boots,gloves", "+{0} to Mana", [r("plusMana", 31, 40)]),
  p("Wyrm's", 30, "amulets,circlets,orbs,rings,rods", "+{0} to Mana", [r("plusMana", 41, 60)]),
  p("Great Wyrm's", 37, "amulets,circlets,orbs,rings,rods", "+{0} to Mana", [r("plusMana", 61, 90)]),
  p("Bahamut's", 45, "amulets,circlets,orbs,rings,rods", "+{0} to Mana", [r("plusMana", 91, 120)]),
  p("Zircon", 3, "jewels", "+{0} to Mana", [r("plusMana", 5, 10)]),
  p("Jacinth", 17, "jewels", "+{0} to Mana", [r("plusMana", 11, 15)]),
  p("Turquoise", 29, "jewels", "+{0} to Mana", [r("plusMana", 16, 20)]),
  p("Mnemonic", 25, "helms", "+{0} to Mana (Based on Character Level)", [r("manaPerLevel", 0.75, 0.75, true)]),
  p("Dun", 7, "jewels", "{0}% of Damage Taken Goes to Mana", [r("damageTakenToManaPercent", 7, 12)]),
  p("Vulpine", 9, "amulets,orbs,shields,staves", "{0}% of Damage Taken Goes to Mana", [r("damageTakenToManaPercent", 7, 12)]),
  p("Triumphant", 3, "circlets,rings,weapons", "+{0} Mana After Each Kill", [r("manaAfterEachKill", 1)]),
  p("Aureolic", 22, "jewels", "+{0} Mana After Each Kill", [r("manaAfterEachKill", 1, 3)]),
  p("Victorious", 17, "circlets,weapons", "+{0} Mana After Each Kill", [r("manaAfterEachKill", 2, 5)]),

  // --- Monster flee ---------------------------------------------------------
  p("Screaming", 10, "bows,crossbows", "Hit Causes Monster to Flee {0}%", [r("hitCausesMonsterFleePercent", 12)]),
  p("Screaming", 10, "weapons", "Hit Causes Monster to Flee {0}%", [r("hitCausesMonsterFleePercent", 25)]),
  p("Howling", 16, "bows,crossbows", "Hit Causes Monster to Flee {0}%", [r("hitCausesMonsterFleePercent", 18)]),
  p("Howling", 16, "weapons", "Hit Causes Monster to Flee {0}%", [r("hitCausesMonsterFleePercent", 50)]),
  p("Wailing", 24, "bows,crossbows", "Hit Causes Monster to Flee {0}%", [r("hitCausesMonsterFleePercent", 25)]),
  p("Wailing", 20, "weapons", "Hit Causes Monster to Flee {0}%", [r("hitCausesMonsterFleePercent", 100)]),

  // --- Skill prefixes -------------------------------------------------------
  p("Maiden's", 30, "bows,crossbows,javelins,spears", "+1 to Amazon Skill Levels", [r("amazonClassSkillLevel", 1)]),
  p("Maiden's", 36, "amulets,circlets", "+1 to Amazon Skill Levels", [r("amazonClassSkillLevel", 1)]),
  p("Valkyrie's", 50, "bows,crossbows,javelins,spears", "+2 to Amazon Skill Levels", [r("amazonClassSkillLevel", 2)]),
  p("Valkyrie's", 90, "amulets,circlets", "+2 to Amazon Skill Levels", [r("amazonClassSkillLevel", 2)]),
  p("Fletcher's", 20, "bows,crossbows,gloves", "+1 to Bow and Crossbow Skills (Amazon Only)", [r("amazonTreeSkillLevels", 1)]),
  p("Bowyer's", 40, "bows,crossbows,gloves", "+2 to Bow and Crossbow Skills (Amazon Only)", [r("amazonTreeSkillLevels", 2)]),
  p("Archer's", 60, "bows,crossbows,gloves", "+3 to Bow and Crossbow Skills (Amazon Only)", [r("amazonTreeSkillLevels", 3)]),
  p("Acrobat's", 20, "amulets,circlets,gloves", "+1 to Passive and Magic Skills (Amazon Only)", [r("amazonTreeSkillLevels", 1)]),
  p("Gymnast's", 40, "amulets,circlets,gloves", "+2 to Passive and Magic Skills (Amazon Only)", [r("amazonTreeSkillLevels", 2)]),
  p("Athlete's", 60, "amulets,circlets,gloves", "+3 to Passive and Magic Skills (Amazon Only)", [r("amazonTreeSkillLevels", 3)]),
  p("Harpoonist's", 20, "gloves,spears", "+1 to Javelin and Spear Skills (Amazon Only)", [r("amazonTreeSkillLevels", 1)]),
  p("Spearmaiden's", 40, "gloves,spears", "+2 to Javelin and Spear Skills (Amazon Only)", [r("amazonTreeSkillLevels", 2)]),
  p("Lancer's", 60, "gloves,spears", "+3 to Javelin and Spear Skills (Amazon Only)", [r("amazonTreeSkillLevels", 3)]),

  p("Magekiller's", 30, "katars", "+1 to Assassin Skill Levels", [r("assassinClassSkillLevel", 1)]),
  p("Magekiller's", 36, "amulets,circlets", "+1 to Assassin Skill Levels", [r("assassinClassSkillLevel", 1)]),
  p("Witch-Hunter's", 50, "katars", "+2 to Assassin Skill Levels", [r("assassinClassSkillLevel", 2)]),
  p("Witch-Hunter's", 90, "amulets,circlets", "+2 to Assassin Skill Levels", [r("assassinClassSkillLevel", 2)]),
  p("Entrapping", 20, "amulets,circlets,katars", "+1 to Traps (Assassin Only)", [r("assassinTreeSkillLevels", 1)]),
  p("Trickster's", 40, "amulets,circlets,katars", "+2 to Traps (Assassin Only)", [r("assassinTreeSkillLevels", 2)]),
  p("Cunning", 60, "amulets,circlets,katars", "+3 to Traps (Assassin Only)", [r("assassinTreeSkillLevels", 3)]),
  p("Mentalist's", 20, "amulets,circlets,helms,katars", "+1 to Shadow Disciplines (Assassin Only)", [r("assassinTreeSkillLevels", 1)]),
  p("Psychic", 40, "amulets,circlets,helms,katars", "+2 to Shadow Disciplines (Assassin Only)", [r("assassinTreeSkillLevels", 2)]),
  p("Shadow", 60, "amulets,circlets,helms,katars", "+3 to Shadow Disciplines (Assassin Only)", [r("assassinTreeSkillLevels", 3)]),
  p("Shogukusha's", 20, "amulets,circlets,gloves,helms,katars", "+1 to Martial Arts (Assassin Only)", [r("assassinTreeSkillLevels", 1)]),
  p("Sensei's", 40, "amulets,circlets,gloves,helms,katars", "+2 to Martial Arts (Assassin Only)", [r("assassinTreeSkillLevels", 2)]),
  p("Kenshi's", 60, "amulets,circlets,gloves,helms,katars", "+3 to Martial Arts (Assassin Only)", [r("assassinTreeSkillLevels", 3)]),

  p("Slayer's", 30, "axes,barbarianHelms,clubs,hammers,maces,throwingWeapons,spears,swords", "+1 to Barbarian Skill Levels", [r("barbarianClassSkillLevel", 1)]),
  p("Slayer's", 36, "amulets,circlets", "+1 to Barbarian Skill Levels", [r("barbarianClassSkillLevel", 1)]),
  p("Berserker's", 50, "axes,barbarianHelms,clubs,hammers,maces,throwingWeapons,spears,swords", "+2 to Barbarian Skill Levels", [r("barbarianClassSkillLevel", 2)]),
  p("Berserker's", 90, "amulets,circlets", "+2 to Barbarian Skill Levels", [r("barbarianClassSkillLevel", 2)]),
  p("Expert's", 20, "barbarianHelms,helms,weapons", "+1 to Combat Skills (Barbarian Only)", [r("barbarianTreeSkillLevels", 1)]),
  p("Veteran's", 40, "barbarianHelms,helms,weapons", "+2 to Combat Skills (Barbarian Only)", [r("barbarianTreeSkillLevels", 2)]),
  p("Master's", 60, "barbarianHelms,helms,weapons", "+3 to Combat Skills (Barbarian Only)", [r("barbarianTreeSkillLevels", 3)]),
  p("Fanatic", 20, "amulets,barbarianHelms,weapons", "+1 to Combat Masteries (Barbarian Only)", [r("barbarianTreeSkillLevels", 1)]),
  p("Raging", 40, "amulets,barbarianHelms,weapons", "+2 to Combat Masteries (Barbarian Only)", [r("barbarianTreeSkillLevels", 2)]),
  p("Furious", 60, "amulets,barbarianHelms,weapons", "+3 to Combat Masteries (Barbarian Only)", [r("barbarianTreeSkillLevels", 3)]),
  p("Sounding", 20, "amulets,barbarianHelms,weapons", "+1 to Warcries (Barbarian Only)", [r("barbarianTreeSkillLevels", 1)]),
  p("Resonant", 40, "amulets,barbarianHelms,weapons", "+2 to Warcries (Barbarian Only)", [r("barbarianTreeSkillLevels", 2)]),
  p("Echoing", 60, "amulets,barbarianHelms,weapons", "+3 to Warcries (Barbarian Only)", [r("barbarianTreeSkillLevels", 3)]),

  p("Shaman's", 30, "clubs,druidPelts", "+1 to Druid Skill Levels", [r("druidClassSkillLevel", 1)]),
  p("Shaman's", 36, "amulets,circlets", "+1 to Druid Skill Levels", [r("druidClassSkillLevel", 1)]),
  p("Hierophant's", 50, "clubs,druidPelts", "+2 to Druid Skill Levels", [r("druidClassSkillLevel", 2)]),
  p("Hierophant's", 90, "amulets,circlets", "+2 to Druid Skill Levels", [r("druidClassSkillLevel", 2)]),
  p("Trainer's", 20, "amulets,circlets,clubs,druidPelts", "+1 to Summoning Skills (Druid Only)", [r("druidTreeSkillLevels", 1)]),
  p("Caretaker's", 40, "amulets,circlets,clubs,druidPelts", "+2 to Summoning Skills (Druid Only)", [r("druidTreeSkillLevels", 2)]),
  p("Keeper's", 60, "amulets,circlets,clubs,druidPelts", "+3 to Summoning Skills (Druid Only)", [r("druidTreeSkillLevels", 3)]),
  p("Spiritual", 20, "amulets,circlets,clubs,druidPelts", "+1 to Shape Shifting Skills (Druid Only)", [r("druidTreeSkillLevels", 1)]),
  p("Feral", 40, "amulets,circlets,clubs,druidPelts", "+2 to Shape Shifting Skills (Druid Only)", [r("druidTreeSkillLevels", 2)]),
  p("Communal", 60, "amulets,circlets,clubs,druidPelts", "+3 to Shape Shifting Skills (Druid Only)", [r("druidTreeSkillLevels", 3)]),
  p("Nature's", 20, "amulets,circlets,clubs,druidPelts", "+1 to Elemental Skills (Druid Only)", [r("druidTreeSkillLevels", 1)]),
  p("Terrene", 30, "amulets,circlets,clubs,druidPelts", "+2 to Elemental Skills (Druid Only)", [r("druidTreeSkillLevels", 2)]),
  p("Gaea's", 60, "amulets,circlets,clubs,druidPelts", "+3 to Elemental Skills (Druid Only)", [r("druidTreeSkillLevels", 3)]),

  p("Summoner's", 30, "heads,daggers,wands", "+1 to Necromancer Skill Levels", [r("necromancerClassSkillLevel", 1)]),
  p("Summoner's", 36, "amulets,circlets", "+1 to Necromancer Skill Levels", [r("necromancerClassSkillLevel", 1)]),
  p("Necromancer's", 50, "heads,daggers,wands", "+2 to Necromancer Skill Levels", [r("necromancerClassSkillLevel", 2)]),
  p("Necromancer's", 90, "amulets,circlets", "+2 to Necromancer Skill Levels", [r("necromancerClassSkillLevel", 2)]),
  p("Hexing", 20, "amulets,circlets,heads,wands", "+1 to Curses (Necromancer Only)", [r("necromancerTreeSkillLevels", 1)]),
  p("Blighting", 40, "amulets,circlets,heads,wands", "+2 to Curses (Necromancer Only)", [r("necromancerTreeSkillLevels", 2)]),
  p("Cursing", 60, "amulets,circlets,heads,wands", "+3 to Curses (Necromancer Only)", [r("necromancerTreeSkillLevels", 3)]),
  p("Fungal", 20, "amulets,circlets,daggers,heads,wands", "+1 to Poison and Bone Skills (Necromancer Only)", [r("necromancerTreeSkillLevels", 1)]),
  p("Noxious", 40, "amulets,circlets,daggers,heads,wands", "+2 to Poison and Bone Skills (Necromancer Only)", [r("necromancerTreeSkillLevels", 2)]),
  p("Venomous", 60, "amulets,circlets,daggers,heads,wands", "+3 to Poison and Bone Skills (Necromancer Only)", [r("necromancerTreeSkillLevels", 3)]),
  p("Graverobber's", 20, "amulets,circlets,heads,wands", "+1 to Summoning Skills (Necromancer Only)", [r("necromancerTreeSkillLevels", 1)]),
  p("Mojo", 40, "amulets,circlets,heads,wands", "+2 to Summoning Skills (Necromancer Only)", [r("necromancerTreeSkillLevels", 2)]),
  p("Golemlord's", 60, "amulets,circlets,heads,wands", "+3 to Summoning Skills (Necromancer Only)", [r("necromancerTreeSkillLevels", 3)]),

  p("Monk's", 30, "paladinShields,scepters", "+1 to Paladin Skill Levels", [r("paladinClassSkillLevel", 1)]),
  p("Monk's", 35, "hammers,maces,shields,swords", "+1 to Paladin Skill Levels", [r("paladinClassSkillLevel", 1)]),
  p("Monk's", 36, "amulets,circlets", "+1 to Paladin Skill Levels", [r("paladinClassSkillLevel", 1)]),
  p("Priest's", 50, "paladinShields,scepters", "+2 to Paladin Skill Levels", [r("paladinClassSkillLevel", 2)]),
  p("Priest's", 65, "hammers,maces,shields,swords", "+2 to Paladin Skill Levels", [r("paladinClassSkillLevel", 2)]),
  p("Priest's", 90, "amulets,circlets", "+2 to Paladin Skill Levels", [r("paladinClassSkillLevel", 2)]),
  p("Lion Branded", 20, "amulets,circlets,maces,paladinShields,scepters,shields,swords", "+1 to Combat Skills (Paladin Only)", [r("paladinTreeSkillLevels", 1)]),
  p("Hawk Branded", 40, "amulets,circlets,maces,paladinShields,scepters,shields,swords", "+2 to Combat Skills (Paladin Only)", [r("paladinTreeSkillLevels", 2)]),
  p("Rose Branded", 60, "amulets,circlets,maces,paladinShields,scepters,shields,swords", "+3 to Combat Skills (Paladin Only)", [r("paladinTreeSkillLevels", 3)]),
  p("Captain's", 20, "amulets,circlets,maces,paladinShields,scepters,shields,swords", "+1 to Offensive Auras (Paladin Only)", [r("paladinTreeSkillLevels", 1)]),
  p("Commander's", 40, "amulets,circlets,maces,paladinShields,scepters,shields,swords", "+2 to Offensive Auras (Paladin Only)", [r("paladinTreeSkillLevels", 2)]),
  p("Marshal's", 60, "amulets,circlets,maces,paladinShields,scepters,shields,swords", "+3 to Offensive Auras (Paladin Only)", [r("paladinTreeSkillLevels", 3)]),
  p("Preserver's", 20, "amulets,circlets,paladinShields,shields", "+1 to Defensive Auras (Paladin Only)", [r("paladinTreeSkillLevels", 1)]),
  p("Warder's", 40, "amulets,circlets,paladinShields,shields", "+2 to Defensive Auras (Paladin Only)", [r("paladinTreeSkillLevels", 2)]),
  p("Guardian's", 60, "amulets,circlets,paladinShields,shields", "+3 to Defensive Auras (Paladin Only)", [r("paladinTreeSkillLevels", 3)]),

  p("Angel's", 30, "orbs,staves", "+1 to Sorceress Skill Levels", [r("sorceressClassSkillLevel", 1)]),
  p("Angel's", 36, "amulets,circlets", "+1 to Sorceress Skill Levels", [r("sorceressClassSkillLevel", 1)]),
  p("Arch-Angel's", 50, "orbs,staves", "+2 to Sorceress Skill Levels", [r("sorceressClassSkillLevel", 2)]),
  p("Arch-Angel's", 90, "amulets,circlets", "+2 to Sorceress Skill Levels", [r("sorceressClassSkillLevel", 2)]),
  p("Burning", 20, "amulets,circlets,orbs,staves", "+1 to Fire Skills (Sorceress Only)", [r("sorceressTreeSkillLevels", 1)]),
  p("Blazing", 40, "amulets,circlets,orbs,staves", "+2 to Fire Skills (Sorceress Only)", [r("sorceressTreeSkillLevels", 2)]),
  p("Volcanic", 60, "amulets,circlets,orbs,staves", "+3 to Fire Skills (Sorceress Only)", [r("sorceressTreeSkillLevels", 3)]),
  p("Sparking", 20, "amulets,circlets,orbs,staves", "+1 to Lightning Skills (Sorceress Only)", [r("sorceressTreeSkillLevels", 1)]),
  p("Charged", 40, "amulets,circlets,orbs,staves", "+2 to Lightning Skills (Sorceress Only)", [r("sorceressTreeSkillLevels", 2)]),
  p("Powered", 60, "amulets,circlets,orbs,staves", "+3 to Lightning Skills (Sorceress Only)", [r("sorceressTreeSkillLevels", 3)]),
  p("Chilling", 20, "amulets,circlets,orbs,staves", "+1 to Cold Skills (Sorceress Only)", [r("sorceressTreeSkillLevels", 1)]),
  p("Freezing", 40, "amulets,circlets,orbs,staves", "+2 to Cold Skills (Sorceress Only)", [r("sorceressTreeSkillLevels", 2)]),
  p("Glacial", 60, "amulets,circlets,orbs,staves", "+3 to Cold Skills (Sorceress Only)", [r("sorceressTreeSkillLevels", 3)]),

  // Grand Charms carry the level-50 +1 class-tree versions of every tree affix.
  p("Fletcher's", 50, "grandCharms", "+1 to Bow and Crossbow Skills (Amazon Only)", [r("amazonTreeSkillLevels", 1)]),
  p("Acrobat's", 50, "grandCharms", "+1 to Passive and Magic Skills (Amazon Only)", [r("amazonTreeSkillLevels", 1)]),
  p("Harpoonist's", 50, "grandCharms", "+1 to Javelin and Spear Skills (Amazon Only)", [r("amazonTreeSkillLevels", 1)]),
  p("Entrapping", 50, "grandCharms", "+1 to Traps (Assassin Only)", [r("assassinTreeSkillLevels", 1)]),
  p("Mentalist's", 50, "grandCharms", "+1 to Shadow Disciplines (Assassin Only)", [r("assassinTreeSkillLevels", 1)]),
  p("Shogukusha's", 50, "grandCharms", "+1 to Martial Arts (Assassin Only)", [r("assassinTreeSkillLevels", 1)]),
  p("Expert's", 50, "grandCharms", "+1 to Combat Skills (Barbarian Only)", [r("barbarianTreeSkillLevels", 1)]),
  p("Fanatic", 50, "grandCharms", "+1 to Combat Masteries (Barbarian Only)", [r("barbarianTreeSkillLevels", 1)]),
  p("Sounding", 50, "grandCharms", "+1 to Warcries (Barbarian Only)", [r("barbarianTreeSkillLevels", 1)]),
  p("Trainer's", 50, "grandCharms", "+1 to Summoning Skills (Druid Only)", [r("druidTreeSkillLevels", 1)]),
  p("Spiritual", 50, "grandCharms", "+1 to Shapeshifting Skills (Druid Only)", [r("druidTreeSkillLevels", 1)]),
  p("Nature's", 50, "grandCharms", "+1 to Elemental Skills (Druid Only)", [r("druidTreeSkillLevels", 1)]),
  p("Hexing", 50, "grandCharms", "+1 to Curses (Necromancer Only)", [r("necromancerTreeSkillLevels", 1)]),
  p("Fungal", 50, "grandCharms", "+1 to Poison and Bone Skills (Necromancer Only)", [r("necromancerTreeSkillLevels", 1)]),
  p("Graverobber's", 50, "grandCharms", "+1 to Summoning Skills (Necromancer Only)", [r("necromancerTreeSkillLevels", 1)]),
  p("Lion Branded", 50, "grandCharms", "+1 to Combat Skills (Paladin Only)", [r("paladinTreeSkillLevels", 1)]),
  p("Captain's", 50, "grandCharms", "+1 to Offensive Auras (Paladin Only)", [r("paladinTreeSkillLevels", 1)]),
  p("Preserver's", 50, "grandCharms", "+1 to Defensive Auras (Paladin Only)", [r("paladinTreeSkillLevels", 1)]),
  p("Burning", 50, "grandCharms", "+1 to Fire Skills (Sorceress Only)", [r("sorceressTreeSkillLevels", 1)]),
  p("Sparking", 50, "grandCharms", "+1 to Lightning Skills (Sorceress Only)", [r("sorceressTreeSkillLevels", 1)]),
  p("Chilling", 50, "grandCharms", "+1 to Cold Skills (Sorceress Only)", [r("sorceressTreeSkillLevels", 1)]),

  // --- Stamina --------------------------------------------------------------
  p("Rugged", 1, "smallCharms", "+{0} to Maximum Stamina", [r("maxStamina", 4, 8)]),
  p("Rugged", 21, "smallCharms", "+{0} to Maximum Stamina", [r("maxStamina", 9, 16)]),
  p("Rugged", 1, "amulets,belts,boots,circlets,gloves,rings", "+{0} to Maximum Stamina", [r("maxStamina", 5, 10)]),
  p("Rugged", 8, "amulets,belts,boots,circlets,gloves,rings", "+{0} to Maximum Stamina", [r("maxStamina", 11, 20)]),
  p("Rugged", 1, "largeCharms", "+{0} to Maximum Stamina", [r("maxStamina", 8, 16)]),
  p("Rugged", 7, "largeCharms", "+{0} to Maximum Stamina", [r("maxStamina", 17, 25)]),
  p("Rugged", 21, "largeCharms", "+{0} to Maximum Stamina", [r("maxStamina", 26, 32)]),
  p("Rugged", 1, "grandCharms", "+{0} to Maximum Stamina", [r("maxStamina", 12, 24)]),
  p("Rugged", 7, "grandCharms", "+{0} to Maximum Stamina", [r("maxStamina", 25, 36)]),
  p("Rugged", 21, "grandCharms", "+{0} to Maximum Stamina", [r("maxStamina", 37, 50)]),
  p("Vigorous", 16, "belts,boots", "+{0} to Maximum Stamina", [r("maxStamina", 21, 30)]),
  p("Chestnut", 1, "jewels", "+{0} to Maximum Stamina", [r("maxStamina", 10, 15)]),
  p("Maroon", 17, "jewels", "+{0} to Maximum Stamina", [r("maxStamina", 16, 25)]),
  p("Brown", 39, "jewels", "Heal Stamina +{0}%", [r("healStaminaPercent", 10, 15)]),
  p("Tireless", 1, "boots", "Heal Stamina +{0}%", [r("healStaminaPercent", 10)]),
  p("Tireless", 6, "boots", "Heal Stamina +{0}%", [r("healStaminaPercent", 25)]),
  p("Tireless", 14, "boots", "Heal Stamina +{0}%", [r("healStaminaPercent", 50)])
];

const SUFFIXES: D2Affix[] = [
  // --- Attack effects -------------------------------------------------------
  s("Piercing", 25, "daggers,katars,rods", "Ignores Target's Defense", [r("ignoreTargetDefense", 1)]),
  s("Bear", 8, "meleeWeapons", "Knockback", [r("knockback", 1)]),
  s("Vileness", 9, "meleeWeapons", "Prevent Monster Heal", [r("preventMonsterHeal", 1)]),

  // --- Breakpoint increases -------------------------------------------------
  s("Apprentice", 5, "amulets,circlets,orbs,rings,rods", "{0}% Faster Cast Rate", [r("fasterCastPercent", 10)]),
  s("Magus", 29, "circlets,orbs,rods", "{0}% Faster Cast Rate", [r("fasterCastPercent", 20)]),
  s("Blocking", 1, "shields", "{0}% Increased Chance of Blocking / {1}% Faster Block Rate", [r("increasedBlockPercent", 10), r("fasterBlockRatePercent", 15)]),
  s("Deflecting", 11, "shields", "{0}% Increased Chance of Blocking / {1}% Faster Block Rate", [r("increasedBlockPercent", 20), r("fasterBlockRatePercent", 30)]),
  s("Truth", 44, "jewels", "{0}% Faster Hit Recovery", [r("fasterHitRecoveryPercent", 7)]),
  s("Balance", 37, "smallCharms", "{0}% Faster Hit Recovery", [r("fasterHitRecoveryPercent", 5)]),
  s("Balance", 19, "largeCharms", "{0}% Faster Hit Recovery", [r("fasterHitRecoveryPercent", 8)]),
  s("Balance", 5, "armor", "{0}% Faster Hit Recovery", [r("fasterHitRecoveryPercent", 10)]),
  s("Balance", 1, "grandCharms", "{0}% Faster Hit Recovery", [r("fasterHitRecoveryPercent", 12)]),
  s("Equilibrium", 9, "belts,bodyArmor,shields", "{0}% Faster Hit Recovery", [r("fasterHitRecoveryPercent", 17)]),
  s("Stability", 18, "belts,bodyArmor", "{0}% Faster Hit Recovery", [r("fasterHitRecoveryPercent", 24)]),
  s("Readiness", 5, "weapons,gloves", "{0}% Increased Attack Speed", [r("attackSpeedPercent", 10)]),
  s("Fervor", 39, "jewels", "{0}% Increased Attack Speed", [r("attackSpeedPercent", 15)]),
  s("Alacrity", 25, "weapons,gloves", "{0}% Increased Attack Speed", [r("attackSpeedPercent", 20)]),
  s("Swiftness", 34, "meleeWeapons", "{0}% Increased Attack Speed", [r("attackSpeedPercent", 30)]),
  s("Quickness", 46, "meleeWeapons", "{0}% Increased Attack Speed", [r("attackSpeedPercent", 40)]),

  // --- Damage reduction -----------------------------------------------------
  s("Health", 7, "amulets,bodyArmor,circlets,rings,shields", "Damage Reduced by {0}", [r("damageReductionFlat", 1)]),
  s("Protection", 18, "amulets,circlets,rings", "Damage Reduced by {0}", [r("damageReductionFlat", 2)]),
  s("Protection", 24, "bodyArmor,shields", "Damage Reduced by {0}", [r("damageReductionFlat", 2)]),
  s("Absorption", 26, "amulets,circlets", "Damage Reduced by {0}", [r("damageReductionFlat", 3)]),
  s("Absorption", 32, "bodyArmor,shields", "Damage Reduced by {0}", [r("damageReductionFlat", 3)]),
  s("Life", 35, "amulets,circlets", "Damage Reduced by {0}", [r("damageReductionFlat", 4, 7)]),
  s("Life", 41, "bodyArmor,shields", "Damage Reduced by {0}", [r("damageReductionFlat", 4, 7)]),
  s("Amicae", 51, "bodyArmor,circlets,shields", "Damage Reduced by {0}", [r("damageReductionFlat", 8, 15)]),
  s("Life Everlasting", 45, "amulets,circlets", "Damage Reduced by {0}", [r("damageReductionFlat", 10, 25)]),
  s("Warding", 7, "amulets,bodyArmor,circlets,orbs,rings,shields", "Magic Damage Reduced by {0}", [r("magicDamageReductionFlat", 1)]),
  s("Sentinel", 18, "amulets,circlets,orbs,rings", "Magic Damage Reduced by {0}", [r("magicDamageReductionFlat", 2)]),
  s("Sentinel", 24, "bodyArmor,shields", "Magic Damage Reduced by {0}", [r("magicDamageReductionFlat", 2)]),
  s("Guarding", 26, "amulets,circlets,orbs,rings", "Magic Damage Reduced by {0}", [r("magicDamageReductionFlat", 3)]),
  s("Guarding", 32, "bodyArmor,shields", "Magic Damage Reduced by {0}", [r("magicDamageReductionFlat", 3)]),
  s("Negation", 41, "bodyArmor,circlets,shields", "Magic Damage Reduced by {0}", [r("magicDamageReductionFlat", 4, 6)]),
  s("Negation", 42, "amulets,orbs", "Magic Damage Reduced by {0}", [r("magicDamageReductionFlat", 4, 6)]),

  // --- Damage reflect and durability ---------------------------------------
  s("Thorns", 1, "belts,bodyArmor,shields", "Attacker Takes Damage of {0}", [r("thorns", 1)]),
  s("Thorns", 14, "belts,bodyArmor,circlets,shields", "Attacker Takes Damage of {0}", [r("thorns", 1, 3)]),
  s("Malice", 37, "jewels", "Attacker Takes Damage of {0}", [r("thorns", 1, 5)]),
  s("Spikes", 21, "belts,bodyArmor,circlets,shields", "Attacker Takes Damage of {0}", [r("thorns", 4, 6)]),
  s("Razors", 34, "bodyArmor,circlets,shields", "Attacker Takes Damage of {0}", [r("thorns", 7, 9)]),
  s("Swords", 47, "bodyArmor,circlets,shields", "Attacker Takes Damage of {0}", [r("thorns", 10, 20)]),
  s("Ages", 50, "armor,weapons", "Indestructible", [r("indestructible", 1)]),
  s("Self-Repair", 3, "armor,weapons", "Repairs 1 Durability Every 33 Seconds", [r("selfRepairSeconds", 33)]),
  s("Restoration", 20, "armor,weapons", "Repairs 1 Durability Every 20 Seconds", [r("selfRepairSeconds", 20)]),
  s("Replenishing", 5, "throwingWeapons", "Replenishes 1 Quantity Every 20 Seconds", [r("replenishQuantitySeconds", 20)]),
  s("Propagation", 24, "throwingWeapons", "Replenishes 1 Quantity Every 10 Seconds", [r("replenishQuantitySeconds", 10)]),

  // --- Elemental damage suffixes -------------------------------------------
  s("of Frost", 1, "weapons", "Adds {0} Cold Damage over 1-2 Seconds", [r("coldDamage", 1, 2)]),
  s("of Frost", 5, "grandCharms,smallCharms", "Adds {0} Cold Damage", [r("coldDamage", 1, 2)]),
  s("of Frost", 9, "largeCharms", "Adds {0} Cold Damage", [r("coldDamage", 2, 3)]),
  s("of Frost", 55, "amulets,belts", "Adds {0} Cold Damage", [r("coldDamage", 3, 6)]),
  s("of Frigidity", 16, "jewels", "Adds {0} Cold Damage", [r("coldDamage", 1, 5)]),
  s("of Icicle", 13, "weapons", "Adds {0} Cold Damage over 3 Seconds", [r("coldDamage", 1, 4)]),
  s("of Icicle", 8, "grandCharms,smallCharms", "Adds {0} Cold Damage", [r("coldDamage", 2, 4)]),
  s("of Icicle", 15, "largeCharms", "Adds {0} Cold Damage", [r("coldDamage", 2, 5)]),
  s("of Icicle", 37, "jewels", "Adds {0} Cold Damage", [r("coldDamage", 2, 10)]),
  s("of Glacier", 33, "smallCharms", "Adds {0} Cold Damage", [r("coldDamage", 3, 6)]),
  s("of Glacier", 15, "grandCharms", "Adds {0} Cold Damage", [r("coldDamage", 3, 7)]),
  s("of Glacier", 25, "largeCharms", "Adds {0} Cold Damage", [r("coldDamage", 3, 8)]),
  s("of Glacier", 27, "weapons", "Adds {0} Cold Damage over 4 Seconds", [r("coldDamage", 2, 15)]),
  s("of Glacier", 58, "jewels", "Adds {0} Cold Damage", [r("coldDamage", 4, 15)]),
  s("of Winter", 46, "smallCharms", "Adds {0} Cold Damage", [r("coldDamage", 4, 9)]),
  s("of Winter", 23, "grandCharms", "Adds {0} Cold Damage", [r("coldDamage", 4, 11)]),
  s("of Winter", 35, "largeCharms", "Adds {0} Cold Damage", [r("coldDamage", 4, 12)]),
  s("of Winter", 45, "meleeWeapons", "Adds {0} Cold Damage over 5 Seconds", [r("coldDamage", 5, 50)]),

  s("of Flame", 3, "grandCharms,largeCharms,smallCharms", "Adds {0} Fire Damage", [r("fireDamage", 1, 2)]),
  s("of Flame", 1, "weapons", "Adds {0} Fire Damage", [r("fireDamage", 1, 5)]),
  s("of Flame", 40, "amulets,gloves,rings", "Adds {0} Fire Damage", [r("fireDamage", 1, 6)]),
  s("of Passion", 15, "jewels", "Adds {0} Fire Damage", [r("fireDamage", 1, 10)]),
  s("of Fire", 8, "grandCharms", "Adds {0} Fire Damage", [r("fireDamage", 1, 3)]),
  s("of Fire", 20, "smallCharms", "Adds {0} Fire Damage", [r("fireDamage", 2, 4)]),
  s("of Fire", 14, "largeCharms", "Adds {0} Fire Damage", [r("fireDamage", 2, 5)]),
  s("of Fire", 15, "weapons", "Adds {0} Fire Damage", [r("fireDamage", 1, 11)]),
  s("of Fire", 36, "jewels", "Adds {0} Fire Damage", [r("fireDamage", 4, 30)]),
  s("of Burning", 14, "grandCharms", "Adds {0} Fire Damage", [r("fireDamage", 2, 7)]),
  s("of Burning", 32, "smallCharms", "Adds {0} Fire Damage", [r("fireDamage", 3, 8)]),
  s("of Burning", 24, "largeCharms", "Adds {0} Fire Damage", [r("fireDamage", 3, 11)]),
  s("of Burning", 25, "weapons", "Adds {0} Fire Damage", [r("fireDamage", 5, 20)]),
  s("of Burning", 57, "jewels", "Adds {0} Fire Damage", [r("fireDamage", 11, 50)]),
  s("of Incineration", 22, "grandCharms", "Adds {0} Fire Damage", [r("fireDamage", 4, 14)]),
  s("of Incineration", 45, "smallCharms", "Adds {0} Fire Damage", [r("fireDamage", 5, 13)]),
  s("of Incineration", 34, "largeCharms", "Adds {0} Fire Damage", [r("fireDamage", 6, 17)]),
  s("of Incineration", 43, "meleeWeapons", "Adds {0} Fire Damage", [r("fireDamage", 10, 75)]),

  s("of Shock", 4, "grandCharms", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 3)]),
  s("of Shock", 7, "largeCharms", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 5)]),
  s("of Shock", 12, "smallCharms", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 6)]),
  s("of Shock", 1, "weapons", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 8)]),
  s("of Shock", 50, "amulets,boots,rings", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 23)]),
  s("of Ennui", 15, "jewels", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 20)]),
  s("of Lightning", 7, "grandCharms", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 7)]),
  s("of Lightning", 21, "smallCharms", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 10)]),
  s("of Lightning", 14, "largeCharms", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 13)]),
  s("of Lightning", 15, "weapons", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 16)]),
  s("of Lightning", 36, "jewels", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 60)]),
  s("of Thunder", 33, "smallCharms", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 18)]),
  s("of Thunder", 15, "grandCharms", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 21)]),
  s("of Thunder", 24, "largeCharms", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 25)]),
  s("of Thunder", 25, "weapons", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 40)]),
  s("of Thunder", 57, "jewels", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 100)]),
  s("of Storms", 45, "smallCharms", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 28)]),
  s("of Storms", 22, "grandCharms", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 33)]),
  s("of Storms", 34, "largeCharms", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 38)]),
  s("of Storms", 34, "meleeWeapons", "Adds {0} Lightning Damage", [r("lightningDamage", 1, 120)]),

  s("of Blight", 1, "grandCharms,largeCharms,smallCharms", "Adds {0} Poison Damage", [r("poisonDamage", 6)]),
  s("of Blight", 1, "circlets,weapons", "Adds {0} Poison Damage over 3 Seconds", [r("poisonDamage", 7)]),
  s("of Blight", 45, "amulets,rings", "Adds {0} Poison Damage", [r("poisonDamage", 50)]),
  s("of Envy", 1, "jewels", "Adds {0} Poison Damage over 2 Seconds", [r("poisonDamage", 20)]),
  s("of Venom", 6, "grandCharms", "Adds {0} Poison Damage", [r("poisonDamage", 15)]),
  s("of Venom", 13, "largeCharms", "Adds {0} Poison Damage", [r("poisonDamage", 15)]),
  s("of Venom", 20, "smallCharms", "Adds {0} Poison Damage", [r("poisonDamage", 15)]),
  s("of Venom", 15, "circlets,weapons", "Adds {0} Poison Damage over 4 Seconds", [r("poisonDamage", 21)]),
  s("of Pestilence", 14, "grandCharms", "Adds {0} Poison Damage", [r("poisonDamage", 25)]),
  s("of Pestilence", 23, "largeCharms", "Adds {0} Poison Damage", [r("poisonDamage", 25)]),
  s("of Pestilence", 32, "smallCharms", "Adds {0} Poison Damage", [r("poisonDamage", 25)]),
  s("of Pestilence", 25, "circlets,weapons", "Adds {0} Poison Damage over 5 Seconds", [r("poisonDamage", 50)]),
  s("of Anthrax", 21, "grandCharms", "Adds {0} Poison Damage", [r("poisonDamage", 50)]),
  s("of Anthrax", 33, "largeCharms", "Adds {0} Poison Damage", [r("poisonDamage", 50)]),
  s("of Anthrax", 44, "smallCharms", "Adds {0} Poison Damage", [r("poisonDamage", 50)]),
  s("of Anthrax", 33, "weapons", "Adds {0} Poison Damage over 6 Seconds", [r("poisonDamage", 100)]),

  // --- Maximum and minimum damage -----------------------------------------
  s("of Craftsmanship", 1, "grandCharms,largeCharms,smallCharms,weapons", "+{0} to Maximum Damage", [r("plusDamage", 1)]),
  s("of Craftsmanship", 1, "amulets,rings", "+{0} to Maximum Damage", [r("plusDamage", 1)]),
  s("of Craftsmanship", 1, "circlets", "+{0} to Maximum Damage", [r("plusDamage", 1, 2)]),
  s("of Craftsmanship", 8, "circlets", "+{0} to Maximum Damage", [r("plusDamage", 2, 3)]),
  s("of Craftsmanship", 15, "circlets", "+{0} to Maximum Damage", [r("plusDamage", 4, 5)]),
  s("of Ire", 4, "jewels", "+{0} to Maximum Damage", [r("plusDamage", 2, 5)]),
  s("of Quality", 41, "grandCharms", "+{0} to Maximum Damage", [r("plusDamage", 2)]),
  s("of Quality", 56, "largeCharms", "+{0} to Maximum Damage", [r("plusDamage", 2)]),
  s("of Quality", 4, "weapons", "+{0} to Maximum Damage", [r("plusDamage", 2)]),
  s("of Quality", 23, "circlets", "+{0} to Maximum Damage", [r("plusDamage", 6, 7)]),
  s("of Quality", 30, "circlets", "+{0} to Maximum Damage", [r("plusDamage", 7, 8)]),
  s("of Wrath", 11, "jewels", "+{0} to Maximum Damage", [r("plusDamage", 6, 9)]),
  s("of Maiming", 71, "grandCharms", "+{0} to Maximum Damage", [r("plusDamage", 3, 4)]),
  s("of Maiming", 7, "weapons", "+{0} to Maximum Damage", [r("plusDamage", 3, 4)]),
  s("of Maiming", 42, "amulets,rings,shields", "+{0} to Maximum Damage", [r("plusDamage", 3, 4)]),
  s("of Maiming", 37, "circlets", "+{0} to Maximum Damage", [r("plusDamage", 9, 10)]),
  s("of Maiming", 45, "circlets", "+{0} to Maximum Damage", [r("plusDamage", 11, 12)]),
  s("of Slaying", 11, "weapons", "+{0} to Maximum Damage", [r("plusDamage", 5, 7)]),
  s("of Gore", 14, "weapons", "+{0} to Maximum Damage", [r("plusDamage", 8, 10)]),
  s("of Carnage", 19, "weapons", "+{0} to Maximum Damage", [r("plusDamage", 11, 14)]),
  s("of Carnage", 25, "jewels", "+{0} to Maximum Damage", [r("plusDamage", 11, 15)]),
  s("of Slaughter", 25, "weapons", "+{0} to Maximum Damage", [r("plusDamage", 15, 20)]),
  s("of Butchery", 35, "weapons", "+{0} to Maximum Damage", [r("plusDamage", 21, 40)]),
  s("of Evisceration", 45, "weapons", "+{0} to Maximum Damage", [r("plusDamage", 41, 63)]),
  s("of Worth", 1, "weapons", "+{0} to Minimum Damage", [r("plusDamageMin", 1, 2)]),
  s("of Worth", 15, "amulets,circlets,rings", "+{0} to Minimum Damage", [r("plusDamageMin", 2, 3)]),
  s("of Joyfulness", 5, "jewels", "+{0} to Minimum Damage", [r("plusDamageMin", 1, 4)]),
  s("of Measure", 12, "weapons", "+{0} to Minimum Damage", [r("plusDamageMin", 3, 4)]),
  s("of Measure", 37, "amulets,circlets,rings", "+{0} to Minimum Damage", [r("plusDamageMin", 4, 5)]),
  s("of Excellence", 24, "weapons", "+{0} to Minimum Damage", [r("plusDamageMin", 5, 8)]),
  s("of Excellence", 59, "amulets,circlets,rings", "+{0} to Minimum Damage", [r("plusDamageMin", 6, 9)]),
  s("of Bliss", 43, "jewels", "+{0} to Minimum Damage", [r("plusDamageMin", 5, 10)]),
  s("of Performance", 48, "weapons", "+{0} to Minimum Damage", [r("plusDamageMin", 9, 14)]),
  s("of Performance", 81, "amulets,circlets,rings", "+{0} to Minimum Damage", [r("plusDamageMin", 10, 13)]),
  s("of Transcendence", 76, "weapons", "+{0} to Minimum Damage", [r("plusDamageMin", 15, 20)]),

  // --- Movement -------------------------------------------------------------
  s("of Inertia", 35, "smallCharms", "{0}% Faster Run/Walk", [r("movementSpeedPercent", 3)]),
  s("of Inertia", 24, "largeCharms", "{0}% Faster Run/Walk", [r("movementSpeedPercent", 5)]),
  s("of Inertia", 19, "grandCharms", "{0}% Faster Run/Walk", [r("movementSpeedPercent", 7)]),
  s("of Pacing", 12, "boots,circlets", "{0}% Faster Run/Walk", [r("movementSpeedPercent", 10)]),
  s("of Haste", 22, "boots,circlets", "{0}% Faster Run/Walk", [r("movementSpeedPercent", 20)]),
  s("of Speed", 37, "boots,circlets", "{0}% Faster Run/Walk", [r("movementSpeedPercent", 30)]),
  s("of Transportation", 65, "boots", "{0}% Faster Run/Walk; Slower Stamina Drain", [r("movementSpeedPercent", 30)]),
  s("of Acceleration", 51, "boots", "{0}% Faster Run/Walk", [r("movementSpeedPercent", 40)]),

  // --- Gold and magic find --------------------------------------------------
  s("of Avarice", 1, "jewels", "{0}% Extra Gold From Monsters", [r("goldFindPercent", 10, 30)]),
  s("of Greed", 1, "smallCharms", "{0}% Extra Gold From Monsters", [r("goldFindPercent", 5, 10)]),
  s("of Greed", 1, "largeCharms", "{0}% Extra Gold From Monsters", [r("goldFindPercent", 5, 10)]),
  s("of Greed", 20, "largeCharms", "{0}% Extra Gold From Monsters", [r("goldFindPercent", 11, 22)]),
  s("of Greed", 1, "grandCharms", "{0}% Extra Gold From Monsters", [r("goldFindPercent", 10, 20)]),
  s("of Greed", 7, "grandCharms", "{0}% Extra Gold From Monsters", [r("goldFindPercent", 21, 30)]),
  s("of Greed", 19, "grandCharms", "{0}% Extra Gold From Monsters", [r("goldFindPercent", 31, 40)]),
  s("of Greed", 1, "amulets,circlets,rings", "{0}% Extra Gold From Monsters", [r("goldFindPercent", 25, 40)]),
  s("of Wealth", 17, "amulets,belts,boots,circlets,gloves", "{0}% Extra Gold From Monsters", [r("goldFindPercent", 41, 80)]),
  s("of Fortune", 31, "smallCharms", "{0}% Better Chance of Getting Magic Items", [r("magicFindPercent", 3, 5)]),
  s("of Good Luck", 47, "smallCharms", "{0}% Better Chance of Getting Magic Items", [r("magicFindPercent", 6, 7)]),
  s("of Prosperity", 26, "jewels", "{0}% Better Chance of Getting Magic Items", [r("magicFindPercent", 5, 10)]),
  s("of Chance", 12, "amulets,boots,circlets,gloves,rings", "{0}% Better Chance of Getting Magic Items", [r("magicFindPercent", 5, 15)]),
  s("of Fortune", 16, "amulets,boots,circlets,gloves", "{0}% Better Chance of Getting Magic Items", [r("magicFindPercent", 16, 25)]),
  s("of Fortune", 42, "rings", "{0}% Better Chance of Getting Magic Items", [r("magicFindPercent", 16, 25)]),
  s("of Luck", 26, "amulets,boots,circlets", "{0}% Better Chance of Getting Magic Items", [r("magicFindPercent", 26, 35)]),

  // --- Leech and regeneration ----------------------------------------------
  s("of Leech", 6, "weapons", "{0}% Life Stolen per Hit", [r("lifeStealPercent", 4, 5)]),
  s("of Leech", 14, "circlets,rings", "{0}% Life Stolen per Hit", [r("lifeStealPercent", 3, 4)]),
  s("of Leech", 24, "amulets", "{0}% Life Stolen per Hit", [r("lifeStealPercent", 2, 3)]),
  s("of Leech", 34, "gloves", "{0}% Life Stolen per Hit", [r("lifeStealPercent", 3)]),
  s("of Locust", 20, "meleeWeapons", "{0}% Life Stolen per Hit", [r("lifeStealPercent", 6, 7)]),
  s("of Locust", 47, "circlets,rings", "{0}% Life Stolen per Hit", [r("lifeStealPercent", 5, 6)]),
  s("of Locust", 57, "amulets", "{0}% Life Stolen per Hit", [r("lifeStealPercent", 4, 5)]),
  s("of Lamprey", 56, "meleeWeapons", "{0}% Life Stolen per Hit", [r("lifeStealPercent", 8, 9)]),
  s("of Lamprey", 78, "circlets,rings", "{0}% Life Stolen per Hit", [r("lifeStealPercent", 7, 8)]),
  s("of Lamprey", 85, "amulets", "{0}% Life Stolen per Hit", [r("lifeStealPercent", 6)]),
  s("of the Bat", 7, "weapons", "{0}% Mana Stolen per Hit", [r("manaStealPercent", 4, 5)]),
  s("of the Bat", 15, "amulets,circlets", "{0}% Mana Stolen per Hit", [r("manaStealPercent", 3, 4)]),
  s("of the Bat", 25, "rings", "{0}% Mana Stolen per Hit", [r("manaStealPercent", 2, 3)]),
  s("of the Bat", 35, "gloves", "{0}% Mana Stolen per Hit", [r("manaStealPercent", 3)]),
  s("of the Wraith", 21, "meleeWeapons", "{0}% Mana Stolen per Hit", [r("manaStealPercent", 6, 7)]),
  s("of the Wraith", 58, "amulets,circlets", "{0}% Mana Stolen per Hit", [r("manaStealPercent", 5, 6)]),
  s("of the Wraith", 58, "rings", "{0}% Mana Stolen per Hit", [r("manaStealPercent", 4, 5)]),
  s("of the Vampire", 56, "meleeWeapons", "{0}% Mana Stolen per Hit", [r("manaStealPercent", 8, 9)]),
  s("of the Vampire", 78, "amulets,circlets", "{0}% Mana Stolen per Hit", [r("manaStealPercent", 7, 8)]),
  s("of the Vampire", 86, "rings", "{0}% Mana Stolen per Hit", [r("manaStealPercent", 6)]),
  s("of Honor", 47, "jewels", "Replenish Life +{0}", [r("replenishLife", 1, 4)]),
  s("of Regeneration", 1, "amulets,circlets", "Replenish Life +{0}", [r("replenishLife", 2)]),
  s("of Regeneration", 10, "amulets,circlets", "Replenish Life +{0}", [r("replenishLife", 3, 5)]),
  s("of Regeneration", 10, "belts,rings,scepters", "Replenish Life +{0}", [r("replenishLife", 2)]),
  s("of Regeneration", 40, "gloves,shields", "Replenish Life +{0}", [r("replenishLife", 3, 5)]),
  s("of Regeneration", 70, "bodyArmor", "Replenish Life +{0}", [r("replenishLife", 3, 5)]),
  s("of Regrowth", 17, "amulets,circlets,scepters", "Replenish Life +{0}", [r("replenishLife", 6, 10)]),
  s("of Regrowth", 55, "belts,rings", "Replenish Life +{0}", [r("replenishLife", 6, 9)]),
  s("of Revivification", 38, "amulets,circlets,scepters", "Replenish Life +{0}", [r("replenishLife", 11, 15)]),

  // --- Light radius and requirements ---------------------------------------
  s("of Light", 1, "amulets,rings", "+1 to Light Radius; +{0} to Attack Rating", [r("attackRating", 10)]),
  s("of Light", 6, "amulets,rings", "+1 to Light Radius; +{0} to Attack Rating", [r("attackRating", 15)]),
  s("of Light", 6, "bodyArmor,rods", "+1 to Light Radius; +{0} to Attack Rating", [r("attackRating", 15)]),
  s("of Radiance", 15, "amulets,bows,crossbows,helms,rings,rods", "+3 to Light Radius; +{0} to Attack Rating", [r("attackRating", 30)]),
  s("of the Sun", 17, "amulets,bows,crossbows,gloves,helms,rings,rods", "+5 to Light Radius; +{0}% Bonus to Attack Rating", [r("attackRatingPercent", 5)]),
  s("of Freedom", 1, "jewels", "Requirements -{0}%", [r("requirementsPercent", 15)]),
  s("of Ease", 15, "bodyArmor,shields,weapons", "Requirements -{0}%", [r("requirementsPercent", 20)]),
  s("of Simplicity", 25, "bodyArmor,shields,weapons", "Requirements -{0}%", [r("requirementsPercent", 30)]),

  // --- State length reduction ---------------------------------------------
  s("of Thawing", 10, "amulets,boots,circlets,gloves,orbs,rings,shields", "Half Freeze Duration", [r("freezeLengthReductionPercent", 50)]),
  s("of Remedy", 7, "amulets,armor,boots,circlets,rings", "Poison Length Reduced by {0}%", [r("poisonLengthReductionPercent", 25)]),
  s("of Amelioration", 18, "amulets,bodyArmor,circlets,shields", "Poison Length Reduced by {0}%", [r("poisonLengthReductionPercent", 50)]),
  s("of Defiance", 25, "amulets,bodyArmor,circlets,shields", "Poison Length Reduced by {0}%", [r("poisonLengthReductionPercent", 75)]),

  // --- Attributes ----------------------------------------------------------
  s("of Dexterity", 7, "smallCharms", "+{0} to Dexterity", [r("plusDexterity", 1, 2)]),
  s("of Dexterity", 2, "amulets,bows,circlets,crossbows,gloves,rings", "+{0} to Dexterity", [r("plusDexterity", 1, 2)]),
  s("of Dexterity", 13, "bodyArmor,boots", "+{0} to Dexterity", [r("plusDexterity", 2, 3)]),
  s("of Dexterity", 3, "largeCharms", "+{0} to Dexterity", [r("plusDexterity", 2, 3)]),
  s("of Dexterity", 18, "largeCharms", "+{0} to Dexterity", [r("plusDexterity", 4, 5)]),
  s("of Dexterity", 1, "grandCharms", "+{0} to Dexterity", [r("plusDexterity", 3, 4)]),
  s("of Dexterity", 14, "grandCharms", "+{0} to Dexterity", [r("plusDexterity", 5, 6)]),
  s("of Daring", 7, "jewels", "+{0} to Dexterity", [r("plusDexterity", 1, 3)]),
  s("of Daring", 19, "jewels", "+{0} to Dexterity", [r("plusDexterity", 4, 6)]),
  s("of Daring", 36, "jewels", "+{0} to Dexterity", [r("plusDexterity", 7, 9)]),
  s("of Skill", 11, "amulets,bows,circlets,crossbows,rings", "+{0} to Dexterity", [r("plusDexterity", 3, 5)]),
  s("of Skill", 22, "gloves", "+{0} to Dexterity", [r("plusDexterity", 3, 5)]),
  s("of Skill", 34, "bodyArmor,boots", "+{0} to Dexterity", [r("plusDexterity", 4, 5)]),
  s("of Accuracy", 27, "amulets,bows,circlets,crossbows,rings", "+{0} to Dexterity", [r("plusDexterity", 6, 9)]),
  s("of Accuracy", 39, "gloves", "+{0} to Dexterity", [r("plusDexterity", 6, 9)]),
  s("of Accuracy", 46, "bodyArmor,boots", "+{0} to Dexterity", [r("plusDexterity", 6, 9)]),
  s("of Precision", 43, "amulets,bows,circlets,crossbows,rings", "+{0} to Dexterity", [r("plusDexterity", 10, 15)]),
  s("of Precision", 56, "gloves", "+{0} to Dexterity", [r("plusDexterity", 10, 15)]),
  s("of Precision", 60, "bodyArmor,boots", "+{0} to Dexterity", [r("plusDexterity", 10, 15)]),
  s("of Perfection", 59, "amulets,bows,circlets,crossbows,rings", "+{0} to Dexterity", [r("plusDexterity", 16, 20)]),
  s("of Perfection", 75, "gloves", "+{0} to Dexterity", [r("plusDexterity", 16, 20)]),
  s("of Nirvana", 72, "amulets,bows,circlets,crossbows", "+{0} to Dexterity", [r("plusDexterity", 21, 30)]),

  s("of Energy", 1, "amulets,circlets,orbs,staves,wands", "+{0} to Energy", [r("plusEnergy", 1, 3)]),
  s("of Energy", 4, "helms,scepters", "+{0} to Energy", [r("plusEnergy", 1, 3)]),
  s("of Energy", 7, "rings", "+{0} to Energy", [r("plusEnergy", 1, 3)]),
  s("of Knowledge", 9, "jewels", "+{0} to Energy", [r("plusEnergy", 1, 5)]),
  s("of Knowledge", 24, "jewels", "+{0} to Energy", [r("plusEnergy", 4, 6)]),
  s("of Knowledge", 41, "jewels", "+{0} to Energy", [r("plusEnergy", 7, 9)]),
  s("of Mind", 7, "amulets,circlets,orbs,staves,wands", "+{0} to Energy", [r("plusEnergy", 4, 6)]),
  s("of Mind", 10, "helms,scepters", "+{0} to Energy", [r("plusEnergy", 4, 6)]),
  s("of Mind", 13, "rings", "+{0} to Energy", [r("plusEnergy", 4, 6)]),
  s("of Brilliance", 13, "amulets,circlets,orbs,staves,wands", "+{0} to Energy", [r("plusEnergy", 7, 10)]),
  s("of Brilliance", 16, "helms,scepters", "+{0} to Energy", [r("plusEnergy", 7, 10)]),
  s("of Brilliance", 21, "rings", "+{0} to Energy", [r("plusEnergy", 7, 10)]),
  s("of Sorcery", 21, "amulets,circlets,orbs,staves,wands", "+{0} to Energy", [r("plusEnergy", 11, 15)]),
  s("of Sorcery", 26, "helms,scepters", "+{0} to Energy", [r("plusEnergy", 11, 15)]),
  s("of Sorcery", 31, "rings", "+{0} to Energy", [r("plusEnergy", 11, 15)]),
  s("of Wizardry", 31, "amulets,circlets,orbs,staves,wands", "+{0} to Energy", [r("plusEnergy", 16, 20)]),
  s("of Wizardry", 41, "rings", "+{0} to Energy", [r("plusEnergy", 16, 20)]),
  s("of Enlightenment", 41, "amulets,circlets,orbs,staves,wands", "+{0} to Energy", [r("plusEnergy", 21, 30)]),

  s("of the Jackal", 1, "amulets,barbarianHelms,belts,bodyArmor,circlets,rings", "+{0} to Life", [r("plusLife", 1, 5)]),
  s("of the Jackal", 4, "druidPelts,shields", "+{0} to Life", [r("plusLife", 1, 5)]),
  s("of the Jackal", 8, "clubs,hammers,helms,maces", "+{0} to Life", [r("plusLife", 1, 5)]),
  s("of the Spirit", 1, "jewels", "+{0} to Life", [r("plusLife", 3, 8)]),
  s("of the Fox", 7, "amulets,barbarianHelms,belts,bodyArmor,circlets,rings", "+{0} to Life", [r("plusLife", 6, 10)]),
  s("of the Fox", 11, "druidPelts,shields", "+{0} to Life", [r("plusLife", 6, 10)]),
  s("of the Fox", 17, "clubs,hammers,helms,maces", "+{0} to Life", [r("plusLife", 6, 10)]),
  s("of Hope", 45, "jewels", "+{0} to Life", [r("plusLife", 9, 20)]),
  s("of the Wolf", 15, "amulets,barbarianHelms,belts,bodyArmor,circlets,rings", "+{0} to Life", [r("plusLife", 11, 20)]),
  s("of the Wolf", 27, "druidPelts,shields", "+{0} to Life", [r("plusLife", 11, 20)]),
  s("of the Wolf", 34, "clubs,hammers,helms,maces", "+{0} to Life", [r("plusLife", 11, 20)]),
  s("of the Tiger", 20, "amulets,barbarianHelms,belts,bodyArmor,circlets,rings", "+{0} to Life", [r("plusLife", 21, 30)]),
  s("of the Tiger", 43, "druidPelts,shields", "+{0} to Life", [r("plusLife", 21, 30)]),
  s("of the Tiger", 51, "clubs,hammers,helms,maces", "+{0} to Life", [r("plusLife", 21, 30)]),
  s("of the Mammoth", 25, "amulets,barbarianHelms,belts,bodyArmor,circlets,rings", "+{0} to Life", [r("plusLife", 31, 40)]),
  s("of the Mammoth", 59, "druidPelts,shields", "+{0} to Life", [r("plusLife", 31, 40)]),
  s("of the Mammoth", 68, "clubs,hammers,helms,maces", "+{0} to Life", [r("plusLife", 31, 40)]),
  s("of the Colossus", 30, "amulets,barbarianHelms,belts,bodyArmor,circlets,rings", "+{0} to Life", [r("plusLife", 41, 60)]),
  s("of the Colossus", 75, "druidPelts,shields", "+{0} to Life", [r("plusLife", 41, 60)]),
  s("of the Squid", 40, "amulets,barbarianHelms,belts,bodyArmor,circlets", "+{0} to Life", [r("plusLife", 61, 80)]),
  s("of the Whale", 50, "amulets,barbarianHelms,belts,bodyArmor,circlets", "+{0} to Life", [r("plusLife", 81, 100)]),
  s("of the Centaur", 20, "amulets,barbarianHelms,bodyArmor,druidPelts", "+{0} to Life (Based on Character Level)", [r("lifePerLevel", 0.75, 0.75, true)]),
  s("of Life", 1, "smallCharms", "+{0} to Life", [r("plusLife", 5, 10)]),
  s("of Sustenance", 23, "smallCharms", "+{0} to Life", [r("plusLife", 11, 15)]),
  s("of Vita", 47, "smallCharms", "+{0} to Life", [r("plusLife", 16, 20)]),
  s("of Life", 1, "largeCharms", "+{0} to Life", [r("plusLife", 6, 10)]),
  s("of Life", 12, "largeCharms", "+{0} to Life", [r("plusLife", 11, 15)]),
  s("of Sustenance", 26, "largeCharms", "+{0} to Life", [r("plusLife", 16, 20)]),
  s("of Sustenance", 42, "largeCharms", "+{0} to Life", [r("plusLife", 21, 25)]),
  s("of Vita", 58, "largeCharms", "+{0} to Life", [r("plusLife", 26, 30)]),
  s("of Vita", 74, "largeCharms", "+{0} to Life", [r("plusLife", 31, 35)]),
  s("of Life", 1, "grandCharms", "+{0} to Life", [r("plusLife", 5, 10)]),
  s("of Life", 9, "grandCharms", "+{0} to Life", [r("plusLife", 11, 15)]),
  s("of Life", 19, "grandCharms", "+{0} to Life", [r("plusLife", 16, 20)]),
  s("of Sustenance", 31, "grandCharms", "+{0} to Life", [r("plusLife", 21, 25)]),
  s("of Sustenance", 45, "grandCharms", "+{0} to Life", [r("plusLife", 26, 30)]),
  s("of Sustenance", 61, "grandCharms", "+{0} to Life", [r("plusLife", 31, 35)]),
  s("of Vita", 77, "grandCharms", "+{0} to Life", [r("plusLife", 36, 40)]),
  s("of Vita", 91, "grandCharms", "+{0} to Life", [r("plusLife", 41, 45)]),
  s("of Memory", 20, "amulets,circlets,druidPelts", "+{0} to Mana (Based on Character Level)", [r("manaPerLevel", 0.75, 0.75, true)]),
  s("of the Elephant", 37, "circlets,druidPelts", "+{0} to Life / +{1} to Mana (Based on Character Level)", [r("lifePerLevel", 0.5, 0.5, true), r("manaPerLevel", 0.25, 0.25, true)]),

  s("of Strength", 1, "amulets,belts,circlets,clubs,hammers,rings,scepters", "+{0} to Strength", [r("plusStrength", 1, 2)]),
  s("of Strength", 5, "bodyArmor,maces", "+{0} to Strength", [r("plusStrength", 1, 2)]),
  s("of Strength", 12, "gloves,meleeWeapons,shields", "+{0} to Strength", [r("plusStrength", 1, 2)]),
  s("of Strength", 7, "smallCharms", "+{0} to Strength", [r("plusStrength", 1)]),
  s("of Strength", 22, "smallCharms", "+{0} to Strength", [r("plusStrength", 2)]),
  s("of Strength", 3, "largeCharms", "+{0} to Strength", [r("plusStrength", 2, 3)]),
  s("of Strength", 18, "largeCharms", "+{0} to Strength", [r("plusStrength", 4, 5)]),
  s("of Strength", 1, "grandCharms", "+{0} to Strength", [r("plusStrength", 3, 4)]),
  s("of Strength", 14, "grandCharms", "+{0} to Strength", [r("plusStrength", 5, 6)]),
  s("of Virility", 18, "jewels", "+{0} to Strength", [r("plusStrength", 1, 4)]),
  s("of Virility", 33, "jewels", "+{0} to Strength", [r("plusStrength", 5, 6)]),
  s("of Virility", 50, "jewels", "+{0} to Strength", [r("plusStrength", 7, 9)]),
  s("of Might", 10, "amulets,belts,circlets,clubs,hammers", "+{0} to Strength", [r("plusStrength", 3, 5)]),
  s("of Might", 21, "bodyArmor,maces,rings,scepters", "+{0} to Strength", [r("plusStrength", 3, 5)]),
  s("of Might", 33, "gloves,meleeWeapons,shields", "+{0} to Strength", [r("plusStrength", 3, 5)]),
  s("of the Ox", 26, "amulets,belts,circlets,clubs,hammers,rings", "+{0} to Strength", [r("plusStrength", 6, 9)]),
  s("of the Ox", 38, "bodyArmor,maces,scepters", "+{0} to Strength", [r("plusStrength", 6, 9)]),
  s("of the Ox", 45, "gloves,meleeWeapons,shields", "+{0} to Strength", [r("plusStrength", 6, 9)]),
  s("of the Giant", 42, "amulets,belts,circlets,clubs,hammers,rings", "+{0} to Strength", [r("plusStrength", 10, 15)]),
  s("of the Giant", 55, "bodyArmor,maces,scepters", "+{0} to Strength", [r("plusStrength", 10, 15)]),
  s("of the Giant", 59, "gloves,meleeWeapons,shields", "+{0} to Strength", [r("plusStrength", 10, 15)]),
  s("of the Titan", 58, "amulets,belts,circlets,clubs,hammers,rings", "+{0} to Strength", [r("plusStrength", 16, 20)]),
  s("of the Titan", 74, "bodyArmor,maces,scepters", "+{0} to Strength", [r("plusStrength", 16, 20)]),
  s("of Atlas", 71, "amulets,belts,circlets,clubs,hammers", "+{0} to Strength", [r("plusStrength", 21, 30)]),

  // --- Chance to Cast ------------------------------------------------------
  s("of Fire Bolts", 6, "meleeWeapons,throwingWeapons", "5% Chance to Cast Level 3 Fire Bolt on Attack", [], { trigger: "attack", chance: 5, skill: "Fire Bolt", level: 3 }),
  s("of Fire Bolts", 16, "meleeWeapons,throwingWeapons", "10% Chance to Cast Level 8 Fire Bolt on Striking", [], { trigger: "strike", chance: 10, skill: "Fire Bolt", level: 8 }),
  s("of Fire Bolts", 20, "meleeWeapons,throwingWeapons", "10% Chance to Cast Level 4 Fire Bolt on Attack", [], { trigger: "attack", chance: 10, skill: "Fire Bolt", level: 4 }),
  s("of Charged Bolt", 6, "amulets,bodyArmor,rings", "10% Chance to Cast Level 3 Charged Bolt when Struck", [], { trigger: "struck", chance: 10, skill: "Charged Bolt", level: 3 }),
  s("of Charged Bolt", 16, "amulets,bodyArmor,rings", "12% Chance to Cast Level 4 Charged Bolt when Struck", [], { trigger: "struck", chance: 12, skill: "Charged Bolt", level: 4 }),
  s("of Charged Bolt", 26, "amulets,bodyArmor,rings", "14% Chance to Cast Level 5 Charged Bolt when Struck", [], { trigger: "struck", chance: 14, skill: "Charged Bolt", level: 5 }),
  s("of Ice Bolt", 6, "meleeWeapons,throwingWeapons", "5% Chance to Cast Level 3 Ice Bolt on Attack", [], { trigger: "attack", chance: 5, skill: "Ice Bolt", level: 3 }),
  s("of Frost Shield", 12, "amulets,bodyArmor", "5% Chance to Cast Level 3 Frost Nova when Struck", [], { trigger: "struck", chance: 5, skill: "Frost Nova", level: 3 }),
  s("of Nova", 18, "meleeWeapons,throwingWeapons", "10% Chance to Cast Level 3 Nova on Striking", [], { trigger: "strike", chance: 10, skill: "Nova", level: 3 }),
  s("of Nova", 28, "meleeWeapons,throwingWeapons", "12% Chance to Cast Level 4 Nova on Striking", [], { trigger: "strike", chance: 12, skill: "Nova", level: 4 }),
  s("of Nova Shield", 18, "bodyArmor,rings", "10% Chance to Cast Level 3 Nova when Struck", [], { trigger: "struck", chance: 10, skill: "Nova", level: 3 }),
  s("of Nova Shield", 28, "bodyArmor,rings", "12% Chance to Cast Level 4 Nova when Struck", [], { trigger: "struck", chance: 12, skill: "Nova", level: 4 }),
  s("of Nova Shield", 38, "bodyArmor,rings", "14% Chance to Cast Level 5 Nova when Struck", [], { trigger: "struck", chance: 14, skill: "Nova", level: 5 }),
  s("of Lightning", 18, "meleeWeapons,throwingWeapons", "5% Chance to Cast Level 3 Lightning on Attack", [], { trigger: "attack", chance: 5, skill: "Lightning", level: 3 }),
  s("of Chain Lightning", 25, "amulets,rings,meleeWeapons,throwingWeapons", "5% Chance to Cast Level 3 Chain Lightning on Attack", [], { trigger: "attack", chance: 5, skill: "Chain Lightning", level: 3 }),
  s("of Chain Lightning", 35, "amulets,rings,meleeWeapons,throwingWeapons", "8% Chance to Cast Level 3 Chain Lightning on Attack", [], { trigger: "attack", chance: 8, skill: "Chain Lightning", level: 3 }),
  s("of Chain Lightning", 45, "amulets,rings,meleeWeapons,throwingWeapons", "8% Chance to Cast Level 5 Chain Lightning on Attack", [], { trigger: "attack", chance: 8, skill: "Chain Lightning", level: 5 }),
  s("of Hydra Shield", 40, "amulets", "10% Chance to Cast Level 3 Hydra when Struck", [], { trigger: "struck", chance: 10, skill: "Hydra", level: 3 }),
  s("of Amplify Damage", 3, "meleeWeapons,missileWeapons,throwingWeapons", "10% Chance to Cast Level 1 Amplify Damage on Striking", [], { trigger: "strike", chance: 10, skill: "Amplify Damage", level: 1 })
];

export const D2_AFFIXES: D2Affix[] = [...PREFIXES, ...SUFFIXES];

/** Resolve the affix categories for a base item, including legacy saved items. */
export function itemAffixTypes(item: {
  name: string;
  baseName?: string;
  slot: string;
  equipmentType?: string;
  width?: number;
  height?: number;
}): D2AffixItemType[] {
  const name = `${item.baseName ?? ""} ${item.name}`.toLowerCase();
  const type = String(item.equipmentType ?? "").toLowerCase();
  const result = new Set<D2AffixItemType>();

  if (item.slot === "weapon") {
    result.add("weapon");
    if (/throwing|javelin|pilum|harpoon|glaive|balanced knife|balanced axe/.test(name)) {
      result.add("throwingWeapon");
      result.add("meleeWeapon");
      if (/javelin|pilum|harpoon/.test(name)) {
        result.add("javelin");
        result.add("spear");
      }
      if (/glaive/.test(name)) result.add("spear");
      return [...result];
    }
    if (/crossbow/.test(name)) {
      result.add("crossbow");
      result.add("missileWeapon");
      return [...result];
    }
    if (/\bbow\b/.test(name)) {
      result.add("bow");
      result.add("missileWeapon");
      return [...result];
    }
    if (/\bstaff\b|quarterstaff|shillelagh|stalagmite|walking stick/.test(name) || type === "staff") {
      result.add("staff");
      result.add("meleeWeapon");
      return [...result];
    }
    if (/wand/.test(name) || type === "wand") {
      result.add("wand");
      result.add("rod");
      result.add("meleeWeapon");
      return [...result];
    }
    if (/orb|globe|sphere|jared's stone/.test(name) || type === "orb") {
      result.add("orb");
      result.add("meleeWeapon");
      return [...result];
    }
    if (/scepter/.test(name) || type === "scepter") {
      result.add("scepter");
      result.add("rod");
      result.add("mace");
      result.add("meleeWeapon");
      return [...result];
    }
    if (/katar|claw|talons|cestus/.test(name) || type === "claw") {
      result.add("katar");
      result.add("meleeWeapon");
      return [...result];
    }
    if (/dagger|knife/.test(name)) {
      result.add("dagger");
      result.add("meleeWeapon");
      return [...result];
    }
    if (/sword|blade|claymore|saber/.test(name)) {
      result.add("sword");
      result.add("meleeWeapon");
      return [...result];
    }
    if (/axe|pick/.test(name)) {
      result.add("axe");
      result.add("meleeWeapon");
      return [...result];
    }
    if (/hammer|maul/.test(name)) {
      result.add("hammer");
      result.add("mace");
      result.add("meleeWeapon");
      return [...result];
    }
    if (/club/.test(name)) {
      result.add("club");
      result.add("mace");
      result.add("meleeWeapon");
      return [...result];
    }
    if (/mace|morning star|flail/.test(name)) {
      result.add("mace");
      result.add("meleeWeapon");
      return [...result];
    }
    if (/spear|pike|trident|brandistock|spetum|war scythe/.test(name)) {
      result.add("spear");
      result.add("meleeWeapon");
      return [...result];
    }
    result.add("meleeWeapon");
    return [...result];
  }

  if (item.slot === "belt") return ["belt"];
  if (item.slot === "armor") {
    if (type === "paladinShield" || /targe|rondache|heraldic shield|aerin shield|crown shield|sacred targe|sacred rondache|ancient shield|zakarum shield|vortex shield/.test(name)) {
      return ["shield", "paladinShield"];
    }
    if (type === "necromancerHead" || /preserved head|zombie head|unraveller head|gargoyle head|demon head|mummified trophy|fetish trophy|sexton trophy|cantor trophy|heirophant trophy|hierophant trophy|minion skull|hellspawn skull|overseer skull|succubus skull|bloodlord skull/.test(name)) {
      return ["shield", "necromancerHead"];
    }
    if (type === "barbarianHelm" || /jawbone cap|fanged helm|horned helm|assault helmet|avenger guard|jawbone visor|lion helm|horned helm|fury visor|slayer guard|destroyer helm|conqueror crown|guardian crown/.test(name)) {
      return ["helmet", "barbarianHelm"];
    }
    if (type === "druidPelt" || /wolf head|hawk helm|antlers|falcon mask|spirit mask|alpha helm|griffon headdress|hunter's guise|sacred feather|totemic mask|blood spirit|sun spirit|earth spirit|sky spirit|dream spirit/.test(name)) {
      return ["helmet", "druidPelt"];
    }
    if (type === "helmet" || /cap|helm|crown|mask|circlet|tiara|diadem|coif/.test(name)) {
      result.add("helmet");
      if (/circlet|coronet|tiara|diadem/.test(name)) result.add("circlet");
      return [...result];
    }
    if (type === "gloves" || /glove|gauntlet|vambrace/.test(name)) return ["gloves"];
    if (type === "boots" || /boot|greave|sabaton/.test(name)) return ["boots"];
    if (type === "shield" || /shield|buckler|barrier/.test(name)) return ["shield"];
    return ["bodyArmor"];
  }

  if (type === "ring" || /\bring\b/.test(name)) return ["ring"];
  if (type === "amulet" || /amulet/.test(name)) return ["amulet"];
  if (type === "jewel" || /\bjewel\b/.test(name)) return ["jewel"];
  if (item.slot === "charm") {
    result.add("charm");
    if (/grand charm/.test(name)) result.add("grandCharm");
    else if (/large charm/.test(name)) result.add("largeCharm");
    else result.add("smallCharm");
    return [...result];
  }
  return ["charm", "smallCharm"];
}

export type D2AffixClassId = "amazon" | "assassin" | "barbarian" | "druid" | "necromancer" | "paladin" | "sorceress";

/**
 * Bases only one class can wear. Group keywords such as `helms` reach these
 * bases too, so their affix pool has to be pruned to the owning class: a
 * Barbarian helm must never roll Shadow Disciplines, whatever a plain helm may.
 */
const CLASS_LOCKED_TYPES: Partial<Record<D2AffixItemType, D2AffixClassId>> = {
  barbarianHelm: "barbarian",
  druidPelt: "druid",
  paladinShield: "paladin",
  necromancerHead: "necromancer",
  katar: "assassin",
  orb: "sorceress",
};

const CLASS_SKILL_STAT = /^(amazon|assassin|barbarian|druid|necromancer|paladin|sorceress)(SkillLevels|TreeSkillLevels|ClassSkillLevel)$/;

/** The class whose skills an affix names, or undefined for a neutral affix. */
export function affixClass(affix: D2Affix): D2AffixClassId | undefined {
  for (const roll of affix.rolls) {
    const match = CLASS_SKILL_STAT.exec(String(roll.stat));
    if (match) return match[1] as D2AffixClassId;
  }
  return undefined;
}

/** The class a base is locked to, read off its affix categories. */
export function classLockedBase(types: Iterable<D2AffixItemType>): D2AffixClassId | undefined {
  for (const type of types) {
    const owner = CLASS_LOCKED_TYPES[type];
    if (owner) return owner;
  }
  return undefined;
}

export function eligibleAffixes(
  item: Parameters<typeof itemAffixTypes>[0],
  itemLevel: number,
  kind?: D2AffixKind,
): D2Affix[] {
  const types = new Set(itemAffixTypes(item));
  const owner = classLockedBase(types);
  const level = Math.max(1, Math.floor(itemLevel));
  return D2_AFFIXES.filter((affix) => (
    (!kind || affix.kind === kind)
    && affix.level <= level
    && affix.targets.some((target) => types.has(target))
    // A character-specific base only carries its own class's skill bonuses.
    && (!owner || (affixClass(affix) ?? owner) === owner)
  ));
}

/** Roll an affix's numeric stats and substitute them into its display text. */
export function rollAffix(affix: D2Affix, characterLevel: number): { text: string; stats: Partial<D2ItemStats>; proc?: D2ItemProc } {
  const stats: Partial<D2ItemStats> = {};
  let text = affix.format;
  const level = Math.max(1, Math.floor(characterLevel));
  affix.rolls.forEach((roll, index) => {
    const whole = Number.isInteger(roll.min) && Number.isInteger(roll.max);
    const raw = roll.min === roll.max
      ? roll.min
      : whole
        ? roll.min + Math.floor(Math.random() * (roll.max - roll.min + 1))
        : roll.min + Math.random() * (roll.max - roll.min);
    const typedStats = stats as Record<string, number>;
    const key = String(roll.stat);
    if (key.endsWith("TreeSkillLevels")) {
      const tree = TREE_BY_AFFIX_NAME[affix.name];
      const treeStats = stats as Record<string, Record<string, number> | undefined>;
      const levels = { ...(treeStats[key] ?? {}) };
      if (tree) levels[tree] = (levels[tree] ?? 0) + raw;
      treeStats[key] = levels;
    } else {
      typedStats[key] = (typedStats[key] ?? 0) + raw;
    }
    const display = roll.perLevel ? Math.round(raw * level) : Math.round(raw);
    text = text.replaceAll(`{${index}}`, String(display));
  });
  return { text, stats, ...(affix.proc ? { proc: affix.proc } : {}) };
}
