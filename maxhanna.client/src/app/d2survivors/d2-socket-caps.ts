/**
 * Diablo II's master socket table: the most sockets a base can carry, keyed by
 * the item's own level rather than by character level.
 *
 * Larzuk punches up to the base's allowance for the item's level, and a white
 * base that drops already socketed roll its holes from the same allowance, so a
 * War Staff found at item level 25 has five sockets at most while one found at
 * item level 41 can take six.
 *
 * The table is transcribed from the game's socket list (bases sorted by their
 * maximum and alphabetically within it) and grouped by the triple it repeats,
 * which is how D2's data reads: [ilvl 1-25, ilvl 26-40, ilvl 41+].
 */

export type D2SocketCapacityTier = readonly [number, number, number];

interface SocketCapGroup {
  caps: D2SocketCapacityTier;
  bases: readonly string[];
}

const SOCKET_CAP_GROUPS: readonly SocketCapGroup[] = [
  {
    caps: [1, 1, 1],
    bases: [
      "Bone Knife", "Buckler", "Burnt Wand", "Dagger", "Defender", "Dirk",
      "Mithril Point", "Poignard", "Rondel", "Wand", "Yew Wand",
    ],
  },
  {
    caps: [1, 2, 2],
    bases: ["Circlet", "Coronet"],
  },
  {
    caps: [1, 2, 3],
    bases: ["Diadem", "Tiara"],
  },
  {
    caps: [2, 2, 2],
    bases: [
      "Armet", "Ataghan", "Barbed Shield", "Basinet", "Battle Cestus", "Blade",
      "Bloodlord Skull", "Bone Helm", "Bone Shield", "Bone Wand", "Cantor Trophy",
      "Cap", "Hat", "Casque", "Cestus", "Chain Mail", "Club", "Cudgel", "Cutlass",
      "Demon Head", "Demonhide Armor", "Elegant Blade", "Falcata", "Falchion",
      "Fascia", "Fetish Trophy", "Field Plate", "Flanged Mace", "Full Helm",
      "Gargoyle Head", "Ghost Armor", "Ghost Wand", "Giant Conch", "Gladius",
      "Grave Wand", "Grim Helm", "Grim Shield", "Grim Wand", "Hand Axe",
      "Hand Scythe", "Hard Leather Armor", "Hatchet", "Hatchet Hands", "Heater",
      "Heirophant Trophy", "Hellspawn Skull", "Helm", "Hydra Edge", "Hydraskull",
      "Jo Staff", "Katar", "Leather Armor", "Legend Spike", "Lich Wand", "Luna",
      "Mace", "Mighty Scepter", "Minion Skull", "Mummified Trophy",
      "Overseer Skull", "Petrified Wand", "Plate Mail", "Polished Wand",
      "Preserved Head", "Quilted Armor", "Reinforced Mace", "Round Shield",
      "Rune Scepter", "Saber", "Sallet", "Scale Mail", "Scepter", "Scimitar",
      "Serpentskin Armor", "Sexton Trophy", "Shako", "Shamshir", "Short Staff",
      "Short Sword", "Skull Cap", "Small Shield", "Spiked Club", "Spiked Shield",
      "Splint Mail", "Stilleto", "Studded Leather", "Succubae Skull", "Tomahawk",
      "Tomb Wand", "Trellised Armor", "Truncheon", "Tulwar", "Unearthed Wand",
      "Unraveller Head", "Walking Stick", "War Fist", "War Hat", "Wrist Blade",
      "Wrist Spike", "Zombie Head",
    ],
  },
  {
    caps: [2, 2, 3],
    bases: [
      "Bone Visage", "Corona", "Crown", "Death Mask", "Demonhead", "Grand Crown",
      "Great Helm", "Mask", "Spired Helm", "Winged Helm",
    ],
  },
  {
    caps: [2, 3, 3],
    bases: [
      "Alpha Helm", "Antlers", "Assault Helmet", "Avenger Guard", "Blade Talons",
      "Blood Spirt", "Carnage Helm", "Cinquedeas", "Claws", "Conquerer Crown",
      "Destroyer Helm", "Dream Spirit", "Earth Spirit", "Falcon Mask",
      "Fanged Helm", "Fanged Knife", "Feral Claws", "Fury Visor", "Greater Claws",
      "Greater Talons", "Griffon Headress", "Guardian Crown", "Hawk Helm",
      "Horned Helm", "Hunter's Guise", "Jawbone Cap", "Jawbone Visor", "Kriss",
      "Lion Helm", "Quhab", "Rage Mask", "Runic Talons", "Sacred Feathers",
      "Savage Helmet", "Scissors Katar", "Scissors Quhab", "Scissors Suwayyah",
      "Sky Spirit", "Slayer Guard", "Spirit Mask", "Sun Spirit", "Suwayyah",
      "Totemic Mask", "Wolf Head", "Wrist Sword", "Clasped Orb", "Cloudy Sphere",
      "Crystalline Globe", "Demon Heart", "Dimensional Shard", "Dragon Stone",
      "Eagle Orb", "Eldritch Orb", "Glowing Orb", "Heavenly Stone", "Sacred Globe",
      "Smoked Sphere", "Sparkling Ball", "Swirling Crystal", "Vortex Orb",
    ],
  },
  {
    caps: [3, 3, 3],
    bases: [
      "Ancient Shield", "Ancient Sword", "Arbalest", "Barbed Club", "Bardiche",
      "Blade Barrier", "Breast Plate", "Cuirass", "Devil Star", "Dragon Shield",
      "Edge Bow", "Espadon", "Gothic Shield", "Grand Scepter",
      "Holy Water Sprinkler", "Hyperion", "Hyperion Spear", "Jagged Star",
      "KhalimFlail", "Kite Shield", "Large Shield", "Legend Sword",
      "Light Crossbow", "Light Plate", "Linked Mail", "Lochaber Axe", "Long Staff",
      "Mage Plate", "Mesh Armor", "Morning Star", "Mythical Sword", "Ogre Axe",
      "Pavise", "Pellet Bow", "Quarterstaff", "Ring Mail", "Russet Armor",
      "Scutum", "Seraph Rod", "Sharktooth Armor", "Short Bow", "Spear",
      "Spider Bow", "Stalagmite", "SuperKhalimFlail", "Templar Coat",
      "Tigulated Mail", "Tower Shield", "Troll Nest", "Two-Handed Sword",
      "Tyrant Club", "War Spear", "War Sword", "Wirt's Leg",
    ],
  },
  {
    caps: [3, 3, 4],
    bases: ["Aegis", "Monarch", "Ward"],
  },
  {
    caps: [3, 4, 4],
    bases: [
      "Aerin Shield", "Akaran Rondache", "Akaran Targe", "Ancient Armor",
      "Kurast Shield", "Archon Plate", "Balrog Blade", "Balrog Skin",
      "Bastard Sword", "Battle Hammer", "Battle Sword", "Bill", "Blade Bow",
      "Boneweave", "Broad Sword", "Champion Sword", "Chaos Armor", "Claymore",
      "Colossus Voulge", "Composite Bow", "Conquest Sword", "Crossbow",
      "Crown Shield", "Cryptic Sword", "Dacian Falx", "Diamond Mail",
      "Double Bow", "Dusk Shroud", "Embossed Plate", "Full Plate Mail", "Fuscina",
      "Giant Sword", "Gorgon Crossbow", "Gothic Plate", "Gothic Sword",
      "Great Bow", "Great Hauberk", "Guilded Shield", "Hellforged Plate",
      "Heraldic Shield", "Highland Blade", "Hunter's Bow", "Kraken Shell",
      "Lacquered Plate", "Legendary Mallet", "Long Sword", "Loricated Mail",
      "Ornate Armor", "Protector Shield", "Razor Bow", "Rondache", "Royal Shield",
      "Rune Sword", "Sacred Armor", "Sacred Rondache", "Sacred Targe",
      "Scarab Husk", "Shadow Plate", "Siege Crossbow", "Stygian Pike", "Targe",
      "Trident", "Tusk Sword", "Vortex Shield", "Voulge", "War Hammer",
      "Wire Fleece", "Wyrmhide", "Zakarum Shield",
    ],
  },
  {
    caps: [3, 4, 5],
    bases: [
      "Ashwood Bow", "Battle Scythe", "Brandistock", "Cedar Bow", "Chu-Ko-Nu",
      "Colossal Sword", "Cryptic Axe", "Demon Crossbow", "Diamond Bow", "Flail",
      "Flamberge", "Hellforge Hammer", "Knout", "Long Bow", "Mancatcher",
      "Matriarchal Bow", "Partizan", "Poleaxe", "Repeating Crossbow", "Rune Bow",
      "Scourge", "Scythe", "Shadow Bow", "Short Battle Bow", "Short Siege Bow",
      "Short War Bow", "Stag Bow", "Thresher", "War Fork", "Ward Bow",
      "Zweihander", "Ceremonial Bow", "Grand Matron Bow", "Reflex Bow",
    ],
  },
  {
    caps: [3, 4, 6],
    bases: [
      "Balista", "Bec-de-Corbin", "Ceremonial Pike", "Ceremonial Spear",
      "Colossus Blade", "Colossus Crossbow", "Crusader Bow", "Crystal Sword",
      "Dimensional Blade", "Executioner Sword", "Ghost Spear", "Giant Thresher",
      "Gothic Bow", "Great Maul", "Great Poleaxe", "Great Sword", "Grim Scythe",
      "Halberd", "Heavy Crossbow", "Hydra Bow", "Lance", "Long Battle Bow",
      "Long Siege Bow", "Long War Bow", "Maiden Pike", "Maiden Spear",
      "Martel de Fer", "Matriarchal Pike", "Matriarchal Spear", "Maul",
      "Ogre Maul", "Phase Blade", "Pike", "Spetum", "Thunder Maul", "War Club",
      "War Pike", "War Scythe", "Yari",
    ],
  },
  {
    caps: [3, 5, 5],
    bases: ["Caduceus", "Divine Scepter", "War Scepter"],
  },
  {
    caps: [4, 4, 4],
    bases: [
      "Axe", "Battle Staff", "Cedar Staff", "Cleaver", "Elder Staff", "Feral Axe",
      "Gnarled Staff", "Gothic Staff", "Large Axe", "Military Axe", "Shillelah",
      "Small Crescent",
    ],
  },
  {
    caps: [4, 5, 5],
    bases: [
      "Battle Axe", "Bearded Axe", "Broad Axe", "Decapitator", "Double Axe",
      "Ettin Axe", "Silver Edged Axe", "Tabar", "Twin Axe",
    ],
  },
  {
    caps: [4, 5, 6],
    bases: [
      "Ancient Axe", "Berserker Axe", "Champion Axe", "Crowbill", "Giant Axe",
      "Glorious Axe", "Gothic Axe", "Great Axe", "Military Pick", "Naga",
      "War Axe", "War Spike",
    ],
  },
  {
    caps: [5, 6, 6],
    bases: ["Archon Staff", "Rune Staff", "War Staff"],
  },
];

/**
 * Spelling variants this game's catalogue and the socket list disagree on:
 * our base names are on the left, the master table's spelling on the right.
 */
const SOCKET_CAP_ALIASES: Readonly<Record<string, string>> = {
  ballista: "balista",
  "blood spirit": "blood spirt",
  "chain hauberk": "chain mail",
  "conqueror crown": "conquerer crown",
  espandon: "espadon",
  "gilded shield": "guilded shield",
  "griffon headdress": "griffon headress",
  "hellforge plate": "hellforged plate",
  "hierophant trophy": "heirophant trophy",
  "khalims flail": "khalimflail",
  kris: "kriss",
  "leather cap": "cap",
  "mithral point": "mithril point",
  shillelagh: "shillelah",
  staff: "short staff",
  stiletto: "stilleto",
  "succubus skull": "succubae skull",
};

/** Lookup key: case, punctuation and spacing do not matter ("Bec-de-Corbin"
 * and "Bec de Corbin" are the same base). */
const normalizeBaseName = (name: string): string => name
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const SOCKET_CAP_BY_BASE = new Map<string, D2SocketCapacityTier>();
for (const group of SOCKET_CAP_GROUPS) {
  for (const base of group.bases) SOCKET_CAP_BY_BASE.set(normalizeBaseName(base), group.caps);
}

/** Which of the table's three columns an item level falls in: 1-25, 26-40, 41+. */
export function socketCapacityTierIndex(itemLevel: number): 0 | 1 | 2 {
  if (itemLevel >= 41) return 2;
  if (itemLevel >= 26) return 1;
  return 0;
}

/**
 * The most sockets this base can take at this item level, or `undefined` when
 * the master table does not list the base (custom bases fall back to their
 * family allowance).
 */
export function socketCapacityForBase(
  baseName: string | null | undefined,
  itemLevel: number,
): number | undefined {
  if (!baseName) return undefined;
  const key = normalizeBaseName(baseName);
  const caps = SOCKET_CAP_BY_BASE.get(key)
    ?? SOCKET_CAP_BY_BASE.get(SOCKET_CAP_ALIASES[key] ?? "");
  return caps ? caps[socketCapacityTierIndex(itemLevel)] : undefined;
}

/** Every base the table covers, for tests and tooling. */
export function socketCapacityBases(): string[] {
  return [...SOCKET_CAP_BY_BASE.keys()];
}
