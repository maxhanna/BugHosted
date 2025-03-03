import { Bot } from '../objects/Bot/bot';
import { HEAD, LEFT_ARM, LEGS, MetaBotPart, RIGHT_ARM } from '../../../services/datacontracts/meta/meta-bot-part';
import { Character } from '../objects/character';
import { SkillType } from './skill-types';

export const typeEffectiveness = new Map<SkillType, SkillType>([
  [SkillType.SPEED, SkillType.STRENGTH],       // Speed counters Strength
  [SkillType.STRENGTH, SkillType.ARMOR],       // Strength counters Armor
  [SkillType.ARMOR, SkillType.RANGED],         // Armor counters Ranged
  [SkillType.RANGED, SkillType.STEALTH],       // Ranged counters Stealth
  [SkillType.STEALTH, SkillType.INTELLIGENCE], // Stealth counters Intelligence
  [SkillType.INTELLIGENCE, SkillType.SPEED]    // Intelligence counters Speed
]);


export function  calculateAndApplyDamage(attackingBot: Bot, defendingBot: Bot) {
  if (!attackingBot || attackingBot.hp <= 0 || !defendingBot) return;

  let attackingPart = attackingBot.lastAttackPart as MetaBotPart;

  // Ensure valid attacking part selection
  if (attackingPart?.partName === LEFT_ARM && attackingBot.rightArm) {
    attackingPart = attackingBot.rightArm;
  } else if (attackingPart?.partName === RIGHT_ARM && attackingBot.leftArm) {
    attackingPart = attackingBot.leftArm;
  } else if (attackingPart?.partName === LEGS && attackingBot.legs) {
    attackingPart = attackingBot.legs;
  } else if (attackingPart?.partName === HEAD && attackingBot.head) {
    attackingPart = attackingBot.head;
  }
   

  // Get Attacking & Defending Types
  const attackingType = attackingPart?.skill?.type;
  const defendingType = defendingBot.botType;

  // Determine Type Multiplier
  let typeMultiplier = 1.0;
  if (attackingPart && typeEffectiveness.get(attackingType) === defendingType) {
    typeMultiplier = 2.0; // Super Effective
  } else if (attackingPart && typeEffectiveness.get(defendingType) === attackingType) {
    typeMultiplier = 0.5; // Not Effective
  }

  // Calculate Final Damage
  const baseDamage = attackingBot.level * (attackingPart?.damageMod ?? 1);
  const appliedDamage = baseDamage * typeMultiplier;

  // Apply Damage to Defender
  defendingBot.hp = Math.max(0, defendingBot.hp - appliedDamage);

  console.log(`${attackingBot.name} attacked ${defendingBot.name} with ${attackingPart?.skill?.name}, dealing ${appliedDamage} damage!`);
}

export function awardExpToPlayers(player: Character, enemy: Character) {
  player.exp += enemy.level; // Add experience from the enemy metabot
  if (!player.expForNextLevel) {
    calculateExpForNextLevel(player);
  }
  // Check if the bot's experience exceeds the experience needed for the next level
  while (player.exp >= player.expForNextLevel) {
    player.exp -= player.expForNextLevel; // Subtract the required experience for leveling up
    player.level++;
    calculateExpForNextLevel(player);
  }
}

export function calculateExpForNextLevel(player: Character) {
  player.expForNextLevel = (player.level + 1) * 5;
  return player.expForNextLevel;
} 
