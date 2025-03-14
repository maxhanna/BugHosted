import { Bot } from '../objects/Bot/bot';
import { HEAD, LEFT_ARM, LEGS, MetaBotPart, RIGHT_ARM } from '../../../services/datacontracts/meta/meta-bot-part';
import { Character } from '../objects/character';
import { SkillType } from './skill-types';
import { getBotsInRange } from './move-towards';
import { DOWN, LEFT, RIGHT, UP } from './grid-cells';
import { events } from './events';

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

  let attackingPart = attackingBot.lastAttackPart ?? attackingBot.leftArm;
  //console.log("last attacking part : ", attackingPart, attackingBot);
  // Ensure valid attacking part selection
  if (attackingPart?.partName === LEFT_ARM && (attackingBot.rightArm || attackingBot.leftArm || attackingBot.legs || attackingBot.head)) {
    attackingPart = attackingBot.rightArm ?? attackingBot.leftArm ?? attackingBot.legs ?? attackingBot.head!;
  } else if (attackingPart?.partName === RIGHT_ARM && (attackingBot.rightArm || attackingBot.leftArm || attackingBot.legs || attackingBot.head)) {
    attackingPart = attackingBot.leftArm ?? attackingBot.rightArm ?? attackingBot.legs ?? attackingBot.head!;
  } else if (attackingPart?.partName === LEGS && (attackingBot.rightArm || attackingBot.leftArm || attackingBot.legs || attackingBot.head)) {
    attackingPart = attackingBot.legs ?? attackingBot.head ?? attackingBot.rightArm ?? attackingBot.leftArm!;
  } else if (attackingPart?.partName === HEAD && (attackingBot.rightArm || attackingBot.leftArm || attackingBot.legs || attackingBot.head)) {
    attackingPart = attackingBot.head ?? attackingBot.legs ?? attackingBot.rightArm ?? attackingBot.leftArm!;
  }
  attackingBot.lastAttackPart = attackingPart;

  // Get Attacking & Defending Types
  const attackingType = attackingPart?.skill?.type ?? SkillType.NORMAL;
  const defendingType = defendingBot.botType ?? SkillType.NORMAL;

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

  console.log(`${attackingBot.name} attacked ${defendingBot.name} dealing ${appliedDamage} damage!`, attackingPart);
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


export function attack(source: Bot, target: Bot) { 
  faceTarget(source, target);
  // Define available attack parts
  calculateAndApplyDamage(source, target);
  if (target.hp <= 0 && target.isDeployed) {
    setTargetToDestroyed(target);
    findTargets(source);
  }
}


export function findTargets(source: Bot) {
  let nearest = getBotsInRange(source)[0]; 
 
  if (nearest && nearest.name) {
    target(source, nearest);
  }
}

export function target(source: Bot, targetBot: Bot) { 
  if (targetBot.id === source.id || source.targeting) return;
  source.targeting = targetBot;  
  faceTarget(source, targetBot);
  events.emit("TARGET_LOCKED", { source: source, target: targetBot })
  console.log(source.name + " targeting : " + targetBot.name);
}

export function untarget(source: Bot, targetBot: Bot) {
  if (source.targeting) { 
    source.targeting = undefined;  
    events.emit("TARGET_UNLOCKED", { source: source, target: targetBot })
    console.log(source.name + " lost target: " + targetBot.name);
  }
}

export function faceTarget(source: Bot, target: Bot) {
  //console.log("face targaet: ", target);
  const dx = target.position.x - source.position.x;
  const dy = target.position.y - source.position.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    source.facingDirection = dx > 0 ? RIGHT : LEFT;
  } else {
    source.facingDirection = dy > 0 ? DOWN : UP;
  }
}

export function setTargetToDestroyed(target: Bot) {
  target.isDeployed = false;
  target.destroy();
  console.log(target.name + " has been destroyed!");
  events.emit("BOT_DESTROYED", target);
}
