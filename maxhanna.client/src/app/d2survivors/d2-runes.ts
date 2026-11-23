import type { D2ItemStats } from "./d2-item-stats";

/**
 * The thirty-three runes, in Diablo II's order (El = 1 ... Zod = 33).
 *
 * A rune is a socketable like a gem or a jewel: it has no paperdoll slot, it
 * never grants anything while carried, and it only does work once it is set in
 * a socket. Unlike a gem its effect depends on the host: D2's rune table has a
 * weapon column and an armor column, and a shield takes the parenthesised
 * shield value where the table gives one. A rune's own value as a word is
 * separate - that is what `D2Runeword` matches.
 *
 * Rune upgrading (3 runes plus a gem for the next tier) is deliberately absent:
 * there is no Horadric Cube in this game yet.
 */
export interface D2RuneRoll {
  stats: D2ItemStats;
  /** Tooltip lines, worded from the rune table. */
  lines: string[];
}

export interface D2RuneDefinition {
  name: string;
  /** Position in the rune list; also the tier a drop rolls against. */
  order: number;
  /** D2's own required level for the rune as an item. */
  requiredLevel: number;
  /** Weapon column of the rune table. */
  inWeapon: D2RuneRoll;
  /** Armor column: helms, body armor, gloves, boots and belts. */
  inArmor: D2RuneRoll;
  /** Shield column: the armor value, with the table's parenthesised shield
   *  figure wherever a shield is called out differently. */
  inShield: D2RuneRoll;
}

function roll(stats: D2ItemStats, ...lines: string[]): D2RuneRoll {
  return { stats, lines };
}

/**
 * Notes on effects this game has no separate mechanic for:
 * - "-25% Target Defense" has no enemy defense to cut, so Eth stores it as
 *   bonus Attack Rating, which is the same intent (hit more often).
 * - "+30 Defense against Missiles" has no ranged-only defense; Nef adds plain
 *   armor.
 * - "Hit Blinds Target" is stored as the game's monster-flee chance, the only
 *   behaviour that makes a struck monster break off.
 * - "Freeze Target" is stored as cold damage, which is what chills and freezes
 *   in this combat model.
 * - "-20% Requirements" is recorded as a magnitude; per-item requirement
 *   reduction is not modeled yet.
 */
export const D2_RUNES: readonly D2RuneDefinition[] = [
  {
    name: "El", order: 1, requiredLevel: 11,
    inWeapon: roll({ attackRating: 50, lightRadius: 1 }, "+50 to Attack Rating", "+1 to Light Radius"),
    inArmor: roll({ armor: 15, lightRadius: 1 }, "+15 Defense", "+1 to Light Radius"),
    inShield: roll({ armor: 15, lightRadius: 1 }, "+15 Defense", "+1 to Light Radius"),
  },
  {
    name: "Eld", order: 2, requiredLevel: 11,
    inWeapon: roll({ enhancedDamagePercent: 75, attackRatingVsUndead: 15 },
      "+75% Enhanced Damage", "+15 to Attack Rating against Undead"),
    inArmor: roll({ maxStaminaPercent: 15 }, "+15% to Maximum Stamina"),
    inShield: roll({ increasedBlockPercent: 7 }, "+7% to Blocking"),
  },
  {
    name: "Tir", order: 3, requiredLevel: 13,
    inWeapon: roll({ manaAfterEachKill: 2 }, "+2 to Mana after each Kill"),
    inArmor: roll({ manaAfterEachKill: 2 }, "+2 to Mana after each Kill"),
    inShield: roll({ manaAfterEachKill: 2 }, "+2 to Mana after each Kill"),
  },
  {
    name: "Nef", order: 4, requiredLevel: 13,
    inWeapon: roll({ knockback: 1 }, "Knockback"),
    inArmor: roll({ armor: 30 }, "+30 Defense against Missiles"),
    inShield: roll({ armor: 30 }, "+30 Defense against Missiles"),
  },
  {
    name: "Eth", order: 5, requiredLevel: 15,
    inWeapon: roll({ attackRatingPercent: 25 }, "-25% to Target Defense"),
    inArmor: roll({ manaRegenPercent: 15 }, "Regenerate Mana 15%"),
    inShield: roll({ manaRegenPercent: 15 }, "Regenerate Mana 15%"),
  },
  {
    name: "Ith", order: 6, requiredLevel: 15,
    inWeapon: roll({ plusDamage: 9 }, "+9 to Maximum Damage"),
    inArmor: roll({ damageTakenToManaPercent: 15 }, "15% Damage Taken Gained as Mana when Hit"),
    inShield: roll({ damageTakenToManaPercent: 15 }, "15% Damage Taken Gained as Mana when Hit"),
  },
  {
    name: "Tal", order: 7, requiredLevel: 17,
    inWeapon: roll({ poisonDamage: 75 }, "+75 Poison Damage over 5 Seconds"),
    inArmor: roll({ poisonResistPercent: 30 }, "+30% Poison Resist"),
    inShield: roll({ poisonResistPercent: 35 }, "+35% Poison Resist"),
  },
  {
    name: "Ral", order: 8, requiredLevel: 19,
    inWeapon: roll({ elementalDamageMin: 5, elementalDamageMax: 30 }, "Adds 5-30 Fire Damage"),
    inArmor: roll({ fireResistPercent: 30 }, "+30% Fire Resist"),
    inShield: roll({ fireResistPercent: 35 }, "+35% Fire Resist"),
  },
  {
    name: "Ort", order: 9, requiredLevel: 21,
    inWeapon: roll({ elementalDamageMin: 1, elementalDamageMax: 50 }, "Adds 1-50 Lightning Damage"),
    inArmor: roll({ lightningResistPercent: 30 }, "+30% Lightning Resist"),
    inShield: roll({ lightningResistPercent: 35 }, "+35% Lightning Resist"),
  },
  {
    name: "Thul", order: 10, requiredLevel: 23,
    inWeapon: roll({ elementalDamageMin: 3, elementalDamageMax: 14 }, "Adds 3-14 Cold Damage"),
    inArmor: roll({ coldResistPercent: 30 }, "+30% Cold Resist"),
    inShield: roll({ coldResistPercent: 35 }, "+35% Cold Resist"),
  },
  {
    name: "Amn", order: 11, requiredLevel: 25,
    inWeapon: roll({ lifeStealPercent: 7 }, "7% Life Stolen per Hit"),
    inArmor: roll({ thorns: 15 }, "Attacker Takes Damage of 15"),
    inShield: roll({ thorns: 15 }, "Attacker Takes Damage of 15"),
  },
  {
    name: "Sol", order: 12, requiredLevel: 27,
    inWeapon: roll({ plusDamageMin: 9 }, "+9 to Minimum Damage"),
    inArmor: roll({ damageReductionFlat: 7 }, "Damage Reduced by 7"),
    inShield: roll({ damageReductionFlat: 7 }, "Damage Reduced by 7"),
  },
  {
    name: "Shael", order: 13, requiredLevel: 29,
    inWeapon: roll({ attackSpeedPercent: 20 }, "+20% Increased Attack Speed"),
    inArmor: roll({ fasterHitRecoveryPercent: 20 }, "+20% Faster Hit Recovery"),
    inShield: roll({ fasterBlockRatePercent: 20 }, "+20% Faster Block Rate"),
  },
  {
    name: "Dol", order: 14, requiredLevel: 31,
    inWeapon: roll({ hitCausesMonsterFleePercent: 25 }, "+25% Hit Causes Monster to Flee"),
    inArmor: roll({ replenishLife: 7 }, "Replenish Life +7"),
    inShield: roll({ replenishLife: 7 }, "Replenish Life +7"),
  },
  {
    name: "Hel", order: 15, requiredLevel: 33,
    inWeapon: roll({ requirementsPercent: 20 }, "Requirements -20%"),
    inArmor: roll({ requirementsPercent: 15 }, "Requirements -15%"),
    inShield: roll({ requirementsPercent: 15 }, "Requirements -15%"),
  },
  {
    name: "Io", order: 16, requiredLevel: 35,
    inWeapon: roll({ plusVitality: 10 }, "+10 to Vitality"),
    inArmor: roll({ plusVitality: 10 }, "+10 to Vitality"),
    inShield: roll({ plusVitality: 10 }, "+10 to Vitality"),
  },
  {
    name: "Lum", order: 17, requiredLevel: 37,
    inWeapon: roll({ plusEnergy: 10 }, "+10 to Energy"),
    inArmor: roll({ plusEnergy: 10 }, "+10 to Energy"),
    inShield: roll({ plusEnergy: 10 }, "+10 to Energy"),
  },
  {
    name: "Ko", order: 18, requiredLevel: 39,
    inWeapon: roll({ plusDexterity: 10 }, "+10 to Dexterity"),
    inArmor: roll({ plusDexterity: 10 }, "+10 to Dexterity"),
    inShield: roll({ plusDexterity: 10 }, "+10 to Dexterity"),
  },
  {
    name: "Fal", order: 19, requiredLevel: 41,
    inWeapon: roll({ plusStrength: 10 }, "+10 to Strength"),
    inArmor: roll({ plusStrength: 10 }, "+10 to Strength"),
    inShield: roll({ plusStrength: 10 }, "+10 to Strength"),
  },
  {
    name: "Lem", order: 20, requiredLevel: 43,
    inWeapon: roll({ goldFindPercent: 75 }, "+75% Extra Gold from Monsters"),
    inArmor: roll({ goldFindPercent: 50 }, "+50% Extra Gold from Monsters"),
    inShield: roll({ goldFindPercent: 50 }, "+50% Extra Gold from Monsters"),
  },
  {
    name: "Pul", order: 21, requiredLevel: 45,
    inWeapon: roll({ enhancedDamagePercent: 75, attackRatingVsDemons: 100 },
      "+75% Enhanced Damage", "+100 to Attack Rating against Demons"),
    inArmor: roll({ armorPercent: 30 }, "+30% Enhanced Defense"),
    inShield: roll({ armorPercent: 30 }, "+30% Enhanced Defense"),
  },
  {
    name: "Um", order: 22, requiredLevel: 47,
    inWeapon: roll({ openWoundsPercent: 25 }, "+25% Chance of Open Wounds"),
    inArmor: roll({ allResistPercent: 15 }, "+15% to All Resistances"),
    inShield: roll({ allResistPercent: 22 }, "+22% to All Resistances"),
  },
  {
    name: "Mal", order: 23, requiredLevel: 49,
    inWeapon: roll({ preventMonsterHeal: 1 }, "Prevent Monster Heal"),
    inArmor: roll({ magicDamageReductionFlat: 7 }, "Magic Damage Reduced by 7"),
    inShield: roll({ magicDamageReductionFlat: 7 }, "Magic Damage Reduced by 7"),
  },
  {
    name: "Ist", order: 24, requiredLevel: 51,
    inWeapon: roll({ magicFindPercent: 30 }, "+30% Better Chance of Getting Magic Items"),
    inArmor: roll({ magicFindPercent: 25 }, "+25% Better Chance of Getting Magic Items"),
    inShield: roll({ magicFindPercent: 25 }, "+25% Better Chance of Getting Magic Items"),
  },
  {
    name: "Gul", order: 25, requiredLevel: 53,
    inWeapon: roll({ attackRatingPercent: 20 }, "+20% Bonus to Attack Rating"),
    inArmor: roll({ maxPoisonResistPercent: 5 }, "+5% to Maximum Poison Resist"),
    inShield: roll({ maxPoisonResistPercent: 5 }, "+5% to Maximum Poison Resist"),
  },
  {
    name: "Vex", order: 26, requiredLevel: 55,
    inWeapon: roll({ manaStealPercent: 7 }, "7% Mana Stolen per Hit"),
    inArmor: roll({ maxFireResistPercent: 5 }, "+5% to Maximum Fire Resist"),
    inShield: roll({ maxFireResistPercent: 5 }, "+5% to Maximum Fire Resist"),
  },
  {
    name: "Ohm", order: 27, requiredLevel: 57,
    inWeapon: roll({ enhancedDamagePercent: 50 }, "+50% Enhanced Damage"),
    inArmor: roll({ maxColdResistPercent: 5 }, "+5% to Maximum Cold Resist"),
    inShield: roll({ maxColdResistPercent: 5 }, "+5% to Maximum Cold Resist"),
  },
  {
    name: "Lo", order: 28, requiredLevel: 59,
    inWeapon: roll({ deadlyStrikePercent: 20 }, "+20% Deadly Strike"),
    inArmor: roll({ maxLightningResistPercent: 5 }, "+5% to Maximum Lightning Resist"),
    inShield: roll({ maxLightningResistPercent: 5 }, "+5% to Maximum Lightning Resist"),
  },
  {
    name: "Sur", order: 29, requiredLevel: 61,
    inWeapon: roll({ hitCausesMonsterFleePercent: 15 }, "Hit Blinds Target"),
    inArmor: roll({ manaPercent: 5 }, "+5% to Maximum Mana"),
    inShield: roll({ manaPercent: 5, plusMana: 50 }, "+5% to Maximum Mana", "+50 to Mana"),
  },
  {
    name: "Ber", order: 30, requiredLevel: 63,
    inWeapon: roll({ crushingBlowPercent: 20 }, "+20% Chance of Crushing Blow"),
    inArmor: roll({ damageReductionPercent: 8 }, "Damage Reduced by 8%"),
    inShield: roll({ damageReductionPercent: 8 }, "Damage Reduced by 8%"),
  },
  {
    name: "Jah", order: 31, requiredLevel: 65,
    inWeapon: roll({ ignoreTargetDefense: 1 }, "Ignore Target's Defense"),
    inArmor: roll({ lifePercent: 5 }, "+5% to Maximum Life"),
    inShield: roll({ lifePercent: 5, plusLife: 50 }, "+5% to Maximum Life", "+50 to Life"),
  },
  {
    name: "Cham", order: 32, requiredLevel: 67,
    inWeapon: roll({ coldDamage: 3 }, "Freeze Target"),
    inArmor: roll({ freezeLengthReductionPercent: 100 }, "Cannot Be Frozen"),
    inShield: roll({ freezeLengthReductionPercent: 100 }, "Cannot Be Frozen"),
  },
  {
    name: "Zod", order: 33, requiredLevel: 69,
    inWeapon: roll({ indestructible: 1 }, "Indestructible"),
    inArmor: roll({ indestructible: 1 }, "Indestructible"),
    inShield: roll({ indestructible: 1 }, "Indestructible"),
  },
];

export const D2_RUNE_BY_NAME: Readonly<Record<string, D2RuneDefinition>> = Object.fromEntries(
  D2_RUNES.map((rune) => [rune.name.toLowerCase(), rune]),
);

export function d2Rune(name: string | undefined | null): D2RuneDefinition | undefined {
  if (!name) return undefined;
  return D2_RUNE_BY_NAME[name.trim().toLowerCase()];
}

/** The rune table's row for the kind of host a socket sits in. */
export function runeRollFor(
  rune: D2RuneDefinition,
  host: "weapon" | "armor" | "shield",
): D2RuneRoll {
  return host === "weapon" ? rune.inWeapon : host === "shield" ? rune.inShield : rune.inArmor;
}

/**
 * The highest rune a monster of this area level can drop. D2 gates runes by the
 * treasure class of the area rather than by the rune's own required level, so
 * the tier is deliberately generous but never lets a Zod fall in the Blood Moor.
 */
export function runeDropTierForLevel(itemLevel: number): number {
  if (itemLevel >= 85) return 33;
  if (itemLevel >= 80) return 30;
  if (itemLevel >= 70) return 26;
  if (itemLevel >= 60) return 22;
  if (itemLevel >= 50) return 18;
  if (itemLevel >= 40) return 15;
  if (itemLevel >= 30) return 12;
  if (itemLevel >= 20) return 9;
  if (itemLevel >= 12) return 6;
  return 3;
}

/** Rolls one rune, weighted towards the low end of the area's tier. */
export function rollRuneForLevel(itemLevel: number, random: () => number = Math.random): D2RuneDefinition {
  const tier = runeDropTierForLevel(itemLevel);
  // Square the roll so the cheap runes stay common and the top of the tier is
  // the rare find it is in D2.
  const pick = Math.floor(Math.pow(random(), 2) * tier);
  return D2_RUNES[Math.max(0, Math.min(D2_RUNES.length - 1, pick))];
}
