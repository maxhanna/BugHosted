import { Bot } from '../objects/Bot/bot';
import { HEAD, LEFT_ARM, LEGS, MetaBotPart, RIGHT_ARM } from '../../../services/datacontracts/meta/meta-bot-part';
import { Character } from '../objects/character';
import { HEADBUTT, KICK, LEFT_PUNCH, RIGHT_PUNCH, Skill, SkillType, STING } from './skill-types';
import { getBotsInRange } from './move-towards';
import { DOWN, LEFT, RIGHT, UP } from './grid-cells';
import { events } from './events';
import { Target } from '../objects/Effects/Target/target';
import { Sting } from '../objects/Effects/Sting/sting';

export const typeEffectiveness = new Map<SkillType, SkillType>([
  [SkillType.SPEED, SkillType.STRENGTH],       // Speed counters Strength
  [SkillType.STRENGTH, SkillType.ARMOR],       // Strength counters Armor
  [SkillType.ARMOR, SkillType.RANGED],         // Armor counters Ranged
  [SkillType.RANGED, SkillType.STEALTH],       // Ranged counters Stealth
  [SkillType.STEALTH, SkillType.INTELLIGENCE], // Stealth counters Intelligence
  [SkillType.INTELLIGENCE, SkillType.SPEED]    // Intelligence counters Speed
]);


export function calculateAndApplyDamage(attackingBot: Bot, defendingBot: Bot) {
  if (!attackingBot || !defendingBot || attackingBot.hp <= 0) return;
  console.log(attackingBot.leftArm);
  console.log(attackingBot.rightArm);
  console.log(attackingBot.legs);
  console.log(attackingBot.head);
  let attackingPart = attackingBot.lastAttackPart ?? attackingBot.leftArm;
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
  const attackingType = attackingPart?.skill?.type ?? SkillType.NORMAL;
  const defendingType = defendingBot.botType ?? SkillType.NORMAL;
  let typeMultiplier = 1.0;
  if (attackingPart && typeEffectiveness.get(attackingType) === defendingType) {
    typeMultiplier = 2.0; // Super Effective
  } else if (attackingPart && typeEffectiveness.get(defendingType) === attackingType) {
    typeMultiplier = 0.5; // Not Effective
  }
  const baseDamage = attackingBot.level * (attackingPart?.damageMod ?? 1);
  const appliedDamage = baseDamage * typeMultiplier;
  console.log(`${attackingBot.name} attacking ${defendingBot.name} with ${attackingPart?.partName} dealing ${appliedDamage} (${appliedDamage}/${defendingBot.hp})`)

  if (!defendingBot.isInvulnerable) { 
    defendingBot.hp = Math.max(0, defendingBot.hp - appliedDamage);
  }
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
  const lastAttackPart = source.lastAttackPart;
  console.log(`${source.name} attacking ${target.name} with ${lastAttackPart?.skill?.name}`);
  if (lastAttackPart) { 
    if (lastAttackPart.skill.name === STING.name) {
      const sting = new Sting(source.position.x, source.position.y);
      source.parent?.addChild(sting); 
      sting.moveTo(target.position.x, target.position.y, 1000); 
    }
  }
  if (target.hp <= 0 && target.isDeployed) {
    source.targeting = undefined; 
  }
}


export function findTargets(source: Bot) {
  const now = new Date().getTime();
  if (source.hp > 0 && source.isDeployed
    && source.canAttack
    && !source.targeting
    && (source.lastAttack.getTime() + 1000 < now)
    && (source.lastTargetDate.getTime() + 500 < now))
  { 
    source.lastTargetDate = new Date();
    let nearest = getBotsInRange(source)[0];
    if (nearest && nearest.name) { 
      target(source, nearest);
    }  
  } 
}

export function target(source: Bot, targetBot: Bot) {
  if (targetBot.id === source.id || source.targeting) return; 
  source.targeting = targetBot;
  faceTarget(source, targetBot);
  events.emit("TARGET_LOCKED", { source: source, target: targetBot })
  console.log(source.name + " targeting : " + targetBot.name);
  source.isLocked = true;
  setTimeout(() => { source.isLocked = false; }, 1000);
  const targetSprite = new Target({ position: targetBot.position, parentId: source.id, targetId: targetBot.id });
  source.parent?.addChild(targetSprite);
}

export function untarget(source: Bot, targetBot: Bot) {
//  console.log("untarget")
  if (source.targeting) {
    source.targeting = undefined;
    events.emit("TARGET_UNLOCKED", { source: source, target: targetBot })
    console.log(source.name + " lost target: " + targetBot.name);

    const oldTargetSprite = source.parent?.children.find((child: any) => child.parentId == source.id);
    if (oldTargetSprite) {
      oldTargetSprite.body?.destroy(); 
      oldTargetSprite.destroy(); 
    }
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
  if (!source.body?.animations?.activeKey.includes("attack")) { 
    source.body?.animations?.play("attack" + source.facingDirection.charAt(0) + source.facingDirection.substring(1, source.facingDirection.length).toLowerCase());
    //console.log("set animation to : ", source.body?.animations?.activeKey);
  } 
}

export function generateReward(source: Bot, target: Bot) {
  // Determine rarity chance based on level difference 
  const baseChance = 0.5; // 50% base chance
  let rarityModifier = Math.max(0.1, 1 / (1 + Math.exp(source.level / 5))); // Logistic decay

  const dropChance = baseChance * rarityModifier;
  const roll = Math.random();

  if (roll > dropChance) {
    //console.log("No reward this time!"); // Exit early if unlucky
    return;
  }

  let generatedPart = undefined;
  const skills = [
    { skill: HEADBUTT, partName: HEAD },
    { skill: KICK, partName: LEGS },
    { skill: LEFT_PUNCH, partName: LEFT_ARM },
    { skill: RIGHT_PUNCH, partName: RIGHT_ARM },
  ];

  let generateGenericPart = true;
  const parts = [target.head, target.legs, target.leftArm, target.rightArm].filter(
    (part) => part !== undefined
  ) as MetaBotPart[];

  if (parts.length > 0) {
    const randomPart = parts[Math.floor(Math.random() * parts.length)];
    if (randomPart) {
      const randomDamageMod = Math.floor(Math.random() * randomPart.damageMod) + 1;

      generatedPart = new MetaBotPart({
        id: 0,
        metabotId: target.id,
        skill: randomPart.skill,
        type: randomPart.type,
        damageMod: randomDamageMod,
        partName: randomPart.partName,
      });
      generateGenericPart = false;
    } 
  }

  if (generateGenericPart) {
    const randomSkill = skills[Math.floor(Math.random() * skills.length)];
    const partName = (randomSkill.partName ?? HEAD);
    generatedPart = new MetaBotPart({
      id: 0,
      metabotId: target.id,
      skill: randomSkill.skill,
      type: SkillType.NORMAL,
      damageMod: 1,
      partName: partName as typeof HEAD,
    });

    if (generatedPart) {
      events.emit("GOT_REWARDS", { location: target.position, part: generatedPart });
    }
  }
}

export function setTargetToDestroyed(target: Bot) {
  // target.isDeployed = false;
  // target.destroy();
 // console.log("Setting target to destroyed!", target);
  events.emit("BOT_DESTROYED", target);
}
