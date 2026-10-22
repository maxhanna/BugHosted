export interface D2SkillDefinition {
  name: string;
  level: number;
  prerequisites: string[];
}

export interface D2SkillTreeSection {
  name: string;
  skills: D2SkillDefinition[];
}

export interface D2ClassSkillTree {
  classId: string;
  sections: D2SkillTreeSection[];
}

const skill = (name: string, level: number, prerequisites: string[] = []): D2SkillDefinition => ({ name, level, prerequisites });

export const D2_CLASS_SKILL_TREES: Record<string, D2ClassSkillTree> = {
  amazon: { classId: "amazon", sections: [
    { name: "Bow and Crossbow", skills: [
      skill("Magic Arrow", 1), skill("Fire Arrow", 1), skill("Cold Arrow", 6), skill("Multiple Shot", 6, ["Magic Arrow"]), skill("Exploding Arrow", 12, ["Magic Arrow", "Fire Arrow", "Multiple Shot"]), skill("Ice Arrow", 18, ["Cold Arrow"]), skill("Guided Arrow", 18, ["Magic Arrow", "Cold Arrow", "Multiple Shot"]), skill("Immolation Arrow", 24, ["Magic Arrow", "Fire Arrow", "Multiple Shot", "Exploding Arrow"]), skill("Strafe", 24, ["Magic Arrow", "Multiple Shot", "Cold Arrow", "Guided Arrow"]), skill("Freezing Arrow", 30, ["Cold Arrow", "Ice Arrow"]),
    ] },
    { name: "Passive and Magic", skills: [
      skill("Inner Sight", 1), skill("Critical Strike", 1), skill("Dodge", 6), skill("Slow Missiles", 12, ["Inner Sight"]), skill("Avoid", 12, ["Dodge"]), skill("Penetrate", 18, ["Critical Strike"]), skill("Decoy", 24, ["Inner Sight", "Slow Missiles"]), skill("Evade", 24, ["Dodge", "Avoid"]), skill("Valkyrie", 30, ["Inner Sight", "Dodge", "Slow Missiles", "Avoid", "Decoy", "Evade"]), skill("Pierce", 30, ["Critical Strike", "Penetrate"]),
    ] },
    { name: "Javelin and Spear", skills: [
      skill("Jab", 1), skill("Power Strike", 6, ["Jab"]), skill("Poison Javelin", 6), skill("Impale", 12, ["Jab"]), skill("Lightning Bolt", 12, ["Poison Javelin"]), skill("Charged Strike", 18, ["Jab", "Poison Javelin", "Power Strike", "Lightning Bolt"]), skill("Plague Javelin", 18, ["Poison Javelin", "Lightning Bolt"]), skill("Fend", 24, ["Jab", "Impale"]), skill("Lightning Strike", 30, ["Jab", "Poison Javelin", "Power Strike", "Lightning Bolt", "Charged Strike"]), skill("Lightning Fury", 30, ["Poison Javelin", "Lightning Bolt", "Plague Javelin"]),
    ] },
  ] },
  assassin: { classId: "assassin", sections: [
    { name: "Martial Arts", skills: [
      skill("Tiger Strike", 1), skill("Dragon Talon", 1), skill("Fists of Fire", 6), skill("Dragon Claw", 6, ["Dragon Talon"]), skill("Cobra Strike", 12, ["Tiger Strike"]), skill("Claws of Thunder", 18, ["Fists of Fire"]), skill("Dragon Tail", 18, ["Dragon Talon", "Dragon Claw"]), skill("Blades of Ice", 24, ["Fists of Fire", "Claws of Thunder"]), skill("Dragon Flight", 24, ["Dragon Talon", "Dragon Claw", "Dragon Tail"]), skill("Phoenix Strike", 30, ["Tiger Strike", "Fists of Fire", "Cobra Strike", "Claws of Thunder", "Blades of Ice"]),
    ] },
    { name: "Shadow Disciplines", skills: [
      skill("Claw Mastery", 1), skill("Psychic Hammer", 1), skill("Burst of Speed", 6, ["Claw Mastery"]), skill("Cloak of Shadows", 12, ["Psychic Hammer"]), skill("Weapon Block", 12, ["Claw Mastery"]), skill("Fade", 18, ["Claw Mastery", "Burst of Speed"]), skill("Shadow Warrior", 18, ["Claw Mastery", "Psychic Hammer", "Weapon Block", "Cloak of Shadows"]), skill("Mind Blast", 24, ["Psychic Hammer", "Cloak of Shadows"]), skill("Venom", 30, ["Claw Mastery", "Burst of Speed", "Fade"]), skill("Shadow Master", 30, ["Claw Mastery", "Psychic Hammer", "Weapon Block", "Cloak of Shadows", "Shadow Warrior"]),
    ] },
    { name: "Traps", skills: [
      skill("Fire Blast", 1), skill("Shock Web", 6, ["Fire Blast"]), skill("Blade Sentinel", 6), skill("Charged Bolt Sentry", 12, ["Fire Blast", "Shock Web"]), skill("Wake of Fire", 12, ["Fire Blast"]), skill("Blade Fury", 18, ["Fire Blast", "Blade Sentinel", "Wake of Fire"]), skill("Lightning Sentry", 24, ["Fire Blast", "Shock Web", "Charged Bolt Sentry"]), skill("Wake of Inferno", 24, ["Fire Blast", "Wake of Fire"]), skill("Death Sentry", 30, ["Fire Blast", "Shock Web", "Charged Bolt Sentry", "Lightning Sentry"]), skill("Blade Shield", 30, ["Fire Blast", "Blade Sentinel", "Wake of Fire", "Blade Fury"]),
    ] },
  ] },
  barbarian: { classId: "barbarian", sections: [
    { name: "Combat Skills", skills: [
      skill("Bash", 1), skill("Double Swing", 6, ["Bash"]), skill("Leap", 6), skill("Double Throw", 12, ["Bash", "Double Swing"]), skill("Stun", 12, ["Bash"]), skill("Leap Attack", 18, ["Leap"]), skill("Concentrate", 18, ["Bash", "Stun"]), skill("Frenzy", 24, ["Bash", "Double Swing", "Double Throw"]), skill("Whirlwind", 30, ["Bash", "Leap", "Stun", "Concentrate", "Leap Attack"]), skill("Berserk", 30, ["Bash", "Stun", "Concentrate"]),
    ] },
    { name: "Combat Masteries", skills: [
      skill("Sword Mastery", 1), skill("Axe Mastery", 1), skill("Mace Mastery", 1), skill("Polearm Mastery", 6), skill("Throwing Mastery", 6), skill("Spear Mastery", 6), skill("Increased Stamina", 12), skill("Iron Skin", 18), skill("Increased Speed", 24, ["Increased Stamina"]), skill("Natural Resistance", 30, ["Iron Skin"]),
    ] },
    { name: "Warcries", skills: [
      skill("Howl", 1), skill("Find Potion", 1), skill("Shout", 6, ["Howl"]), skill("Taunt", 6, ["Howl"]), skill("Find Item", 12, ["Find Potion"]), skill("Battle Cry", 18, ["Howl", "Taunt"]), skill("Battle Orders", 24, ["Howl", "Shout"]), skill("Grim Ward", 24, ["Find Potion", "Find Item"]), skill("War Cry", 30, ["Howl", "Taunt", "Shout", "Battle Cry", "Battle Orders"]), skill("Battle Command", 30, ["Howl", "Shout", "Battle Orders"]),
    ] },
  ] },
  druid: { classId: "druid", sections: [
    { name: "Elemental", skills: [
      skill("Firestorm", 1), skill("Molten Boulder", 6, ["Firestorm"]), skill("Arctic Blast", 6), skill("Cyclone Armor", 12, ["Arctic Blast"]), skill("Fissure", 12, ["Firestorm", "Molten Boulder"]), skill("Twister", 18, ["Arctic Blast", "Cyclone Armor"]), skill("Volcano", 24, ["Firestorm", "Molten Boulder", "Fissure"]), skill("Tornado", 24, ["Arctic Blast", "Cyclone Armor", "Twister"]), skill("Hurricane", 30, ["Arctic Blast", "Cyclone Armor", "Twister", "Tornado"]), skill("Armageddon", 30, ["Firestorm", "Molten Boulder", "Arctic Blast", "Fissure", "Cyclone Armor", "Twister", "Tornado", "Volcano", "Hurricane"]),
    ] },
    { name: "Shape Shifting", skills: [
      skill("Werewolf", 1), skill("Lycanthropy", 1, ["Werewolf"]), skill("Werebear", 6), skill("Maul", 12, ["Werebear"]), skill("Feral Rage", 12, ["Werewolf"]), skill("Fire Claws", 18, ["Werewolf", "Werebear", "Feral Rage", "Maul"]), skill("Rabies", 18, ["Werewolf", "Feral Rage"]), skill("Shock Wave", 24, ["Werebear", "Maul"]), skill("Hunger", 24, ["Werewolf", "Werebear", "Feral Rage", "Maul", "Fire Claws"]), skill("Fury", 30, ["Werewolf", "Feral Rage", "Rabies"]),
    ] },
    { name: "Summoning", skills: [
      skill("Raven", 1), skill("Poison Creeper", 1), skill("Oak Sage", 6), skill("Summon Spirit Wolf", 6, ["Raven"]), skill("Carrion Vine", 12, ["Poison Creeper"]), skill("Heart of Wolverine", 18, ["Oak Sage"]), skill("Summon Dire Wolf", 18, ["Raven", "Oak Sage", "Summon Spirit Wolf"]), skill("Solar Creeper", 24, ["Poison Creeper", "Carrion Vine"]), skill("Spirit of Barbs", 30, ["Oak Sage", "Heart of Wolverine"]), skill("Summon Grizzly", 30, ["Raven", "Oak Sage", "Summon Spirit Wolf", "Summon Dire Wolf"]),
    ] },
  ] },
  necromancer: { classId: "necromancer", sections: [
    { name: "Curses", skills: [
      skill("Amplify Damage", 1), skill("Dim Vision", 6), skill("Weaken", 6, ["Amplify Damage"]), skill("Iron Maiden", 12, ["Amplify Damage"]), skill("Terror", 12, ["Amplify Damage", "Weaken"]), skill("Confuse", 18, ["Dim Vision"]), skill("Life Tap", 18, ["Amplify Damage", "Iron Maiden"]), skill("Attract", 24, ["Dim Vision", "Confuse"]), skill("Decrepify", 24, ["Amplify Damage", "Weaken", "Terror"]), skill("Lower Resist", 30, ["Weaken", "Amplify Damage", "Terror", "Iron Maiden", "Life Tap", "Decrepify"]),
    ] },
    { name: "Poison and Bone", skills: [
      skill("Teeth", 1), skill("Bone Armor", 1), skill("Poison Dagger", 6), skill("Corpse Explosion", 6, ["Teeth"]), skill("Bone Wall", 12, ["Bone Armor"]), skill("Poison Explosion", 18, ["Teeth", "Corpse Explosion", "Poison Dagger"]), skill("Bone Spear", 18, ["Teeth", "Corpse Explosion"]), skill("Bone Prison", 24, ["Teeth", "Bone Armor", "Corpse Explosion", "Bone Wall", "Bone Spear"]), skill("Poison Nova", 30, ["Poison Dagger", "Teeth", "Corpse Explosion", "Poison Explosion"]), skill("Bone Spirit", 30, ["Teeth", "Corpse Explosion", "Bone Spear"]),
    ] },
    { name: "Summoning", skills: [
      skill("Raise Skeleton", 1), skill("Skeleton Mastery", 1, ["Raise Skeleton"]), skill("Clay Golem", 6), skill("Golem Mastery", 12, ["Clay Golem"]), skill("Skeletal Mage", 12, ["Raise Skeleton"]), skill("Blood Golem", 18, ["Clay Golem"]), skill("Summon Resist", 24, ["Clay Golem", "Golem Mastery"]), skill("Iron Golem", 24, ["Clay Golem", "Blood Golem"]), skill("Fire Golem", 30, ["Clay Golem", "Blood Golem", "Iron Golem"]), skill("Revive", 30, ["Raise Skeleton", "Skeletal Mage", "Clay Golem", "Blood Golem", "Iron Golem"]),
    ] },
  ] },
  paladin: { classId: "paladin", sections: [
    { name: "Combat Skills", skills: [
      skill("Sacrifice", 1), skill("Smite", 1), skill("Holy Bolt", 6), skill("Zeal", 12, ["Sacrifice"]), skill("Charge", 12, ["Smite"]), skill("Vengeance", 18, ["Sacrifice", "Zeal"]), skill("Blessed Hammer", 18, ["Holy Bolt"]), skill("Conversion", 24, ["Sacrifice", "Zeal", "Vengeance"]), skill("Holy Shield", 24, ["Smite", "Holy Bolt", "Charge", "Blessed Hammer"]), skill("Fist of the Heavens", 30, ["Sacrifice", "Holy Bolt", "Zeal", "Vengeance", "Blessed Hammer", "Conversion"]),
    ] },
    { name: "Defensive Auras", skills: [
      skill("Prayer", 1), skill("Resist Fire", 1), skill("Resist Cold", 6), skill("Defiance", 6), skill("Resist Lightning", 12), skill("Cleansing", 12, ["Prayer"]), skill("Vigor", 18, ["Prayer", "Cleansing", "Defiance"]), skill("Meditation", 24, ["Prayer", "Cleansing"]), skill("Redemption", 30, ["Prayer", "Cleansing", "Defiance", "Vigor"]), skill("Salvation", 30),
    ] },
    { name: "Offensive Auras", skills: [
      skill("Might", 1), skill("Holy Fire", 6, ["Might"]), skill("Thorns", 6), skill("Blessed Aim", 12, ["Might"]), skill("Concentration", 18, ["Might", "Blessed Aim"]), skill("Holy Freeze", 18, ["Might", "Holy Fire"]), skill("Holy Shock", 24, ["Might", "Holy Fire", "Holy Freeze"]), skill("Sanctuary", 24, ["Might", "Thorns", "Holy Fire", "Holy Freeze"]), skill("Fanaticism", 30, ["Might", "Blessed Aim", "Concentration"]), skill("Conviction", 30, ["Might", "Thorns", "Holy Fire", "Holy Freeze", "Sanctuary"]),
    ] },
  ] },
  sorceress: { classId: "sorceress", sections: [
    { name: "Cold Spells", skills: [
      skill("Ice Bolt", 1), skill("Frozen Armor", 1), skill("Frost Nova", 6), skill("Ice Blast", 6, ["Ice Bolt"]), skill("Shiver Armor", 12, ["Frozen Armor", "Ice Bolt", "Ice Blast"]), skill("Glacial Spike", 18, ["Ice Bolt", "Ice Blast"]), skill("Blizzard", 24, ["Ice Bolt", "Ice Blast", "Frost Nova", "Glacial Spike"]), skill("Chilling Armor", 24, ["Frozen Armor", "Ice Bolt", "Ice Blast", "Shiver Armor"]), skill("Frozen Orb", 30, ["Ice Bolt", "Ice Blast", "Frost Nova", "Glacial Spike", "Blizzard"]), skill("Cold Mastery", 30),
    ] },
    { name: "Fire Spells", skills: [
      skill("Fire Bolt", 1), skill("Warmth", 1), skill("Inferno", 6), skill("Blaze", 12, ["Inferno"]), skill("Fire Ball", 12, ["Fire Bolt"]), skill("Fire Wall", 18, ["Inferno", "Blaze"]), skill("Enchant", 18, ["Fire Bolt", "Warmth", "Fire Ball"]), skill("Meteor", 24, ["Fire Bolt", "Inferno", "Blaze", "Fire Wall", "Fire Ball"]), skill("Fire Mastery", 30), skill("Hydra", 30, ["Fire Bolt", "Warmth", "Fire Ball", "Enchant"]),
    ] },
    { name: "Lightning Spells", skills: [
      skill("Charged Bolt", 1), skill("Telekinesis", 6), skill("Static Field", 6), skill("Lightning", 12, ["Charged Bolt"]), skill("Nova", 12, ["Static Field"]), skill("Chain Lightning", 18, ["Charged Bolt", "Lightning"]), skill("Teleport", 18, ["Telekinesis"]), skill("Thunder Storm", 24, ["Charged Bolt", "Static Field", "Lightning", "Nova", "Chain Lightning"]), skill("Energy Shield", 24, ["Charged Bolt", "Telekinesis", "Lightning", "Teleport", "Chain Lightning"]), skill("Lightning Mastery", 30),
    ] },
  ] },
};

export function getClassSkills(classId: string): D2SkillDefinition[] {
  return D2_CLASS_SKILL_TREES[classId]?.sections.flatMap((section) => section.skills) ?? [];
}

export function getAvailableClassSkills(classId: string, characterLevel: number, ownedSkills: readonly string[], ranks: Readonly<Record<string, number>>): D2SkillDefinition[] {
  const owned = new Set(ownedSkills);
  return getClassSkills(classId).filter((definition) =>
    definition.level <= characterLevel &&
    (ranks[definition.name] ?? 0) < 20 &&
    definition.prerequisites.every((prerequisite) => owned.has(prerequisite)),
  );
}

export function validateD2ClassSkillTrees(): string[] {
  const errors: string[] = [];
  const validUnlockLevels = new Set([1, 6, 12, 18, 24, 30]);
  for (const [classId, tree] of Object.entries(D2_CLASS_SKILL_TREES)) {
    const names = tree.sections.flatMap((section) => section.skills.map((entry) => entry.name));
    if (names.length !== 30) errors.push(`${classId} has ${names.length} skills rather than 30`);
    if (new Set(names).size !== names.length) errors.push(`${classId} has duplicate skill names`);
    for (const entry of tree.sections.flatMap((section) => section.skills)) {
      if (!validUnlockLevels.has(entry.level)) errors.push(`${classId}.${entry.name} has invalid unlock level ${entry.level}`);
      for (const prerequisite of entry.prerequisites) {
        if (!names.includes(prerequisite)) errors.push(`${classId}.${entry.name} references missing prerequisite ${prerequisite}`);
        const parent = tree.sections.flatMap((section) => section.skills).find((candidate) => candidate.name === prerequisite);
        if (parent && parent.level > entry.level) errors.push(`${classId}.${entry.name} requires later skill ${prerequisite}`);
      }
    }
  }
  return errors;
}
