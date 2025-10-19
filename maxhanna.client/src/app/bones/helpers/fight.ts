import { Bot } from '../objects/Bot/bot';
import { HEAD, LEFT_ARM, LEGS, MetaBotPart, RIGHT_ARM } from '../../../services/datacontracts/bones/meta-bot-part';
import { Character } from '../objects/character';
import { CHAIN, FLARE, HEADBUTT, KICK, LEFT_PUNCH, RAIL, RIGHT_PUNCH, Skill, SkillType, STING, SUBSONIC } from './skill-types';
import { getBotsInRange } from './move-towards';
import { DOWN, LEFT, RIGHT, UP } from './grid-cells';
import { events } from './events';
import { Target } from '../objects/Effects/Target/target';
import { Critical } from '../objects/Effects/Critical/critical';
import { Sting } from '../objects/Effects/Sting/sting';
import { Flare } from '../objects/Effects/Flare/flare';
import { Rail } from '../objects/Effects/Rail/rail';
import { Chain } from '../objects/Effects/Chain/chain';  
import { Subsonic } from '../objects/Effects/Subsonic/subsonic';

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
  
  let attackingPart = attackingBot.lastAttackPart ?? attackingBot.leftArm;
  if (attackingPart?.partName === LEFT_ARM && (attackingBot.rightArm || attackingBot.leftArm || attackingBot.legs || attackingBot.head)) {
    attackingPart = attackingBot.rightArm ?? attackingBot.leftArm ?? attackingBot.legs ?? attackingBot.head!;
  } else if (attackingPart?.partName === RIGHT_ARM && (attackingBot.rightArm || attackingBot.leftArm || attackingBot.legs || attackingBot.head)) {
    attackingPart = attackingBot.legs ?? attackingBot.rightArm ?? attackingBot.legs ?? attackingBot.head!;
  } else if (attackingPart?.partName === LEGS && (attackingBot.rightArm || attackingBot.leftArm || attackingBot.legs || attackingBot.head)) {
    attackingPart = attackingBot.head ?? attackingBot.head ?? attackingBot.rightArm ?? attackingBot.leftArm!;
  } else if (attackingPart?.partName === HEAD && (attackingBot.rightArm || attackingBot.leftArm || attackingBot.legs || attackingBot.head)) {
    attackingPart = attackingBot.leftArm ?? attackingBot.legs ?? attackingBot.rightArm ?? attackingBot.leftArm!;
  }
  attackingBot.lastAttackPart = attackingPart; 
  if (attackingBot.name == "Jaguar")
    console.log(`${attackingBot.name} last attack part: ${attackingBot.lastAttackPart?.partName}`)
  const criticalHitChance = 0.10; // 10% chance
  const isCritical = Math.random() < criticalHitChance; 
  if (isCritical) {
    const crit = new Critical({ position: defendingBot.position, parentId: attackingBot.id, targetId: defendingBot.id });  
    attackingBot.parent?.addChild(crit);
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
  source.chasing = undefined;
  source.chaseCancelBlock = new Date();
  source.destinationPosition = source.position;
  const lastAttackPart = source.lastAttackPart;
  console.log(`${source.name} attacking ${target.name} with ${lastAttackPart?.skill?.name}`);
  const skillEffectMap: Record<string, new (x: number, y: number) => any> = {
    [STING.name]: Sting,
    [FLARE.name]: Flare,
    [RAIL.name]: Rail,
    [CHAIN.name]: Chain,
    [SUBSONIC.name]: Subsonic,
  };

  if (lastAttackPart) {
    const EffectClass = skillEffectMap[lastAttackPart.skill.name];
    if (EffectClass) {
      const effect = new EffectClass(source.position.x, source.position.y);
      source.parent?.addChild(effect);
      (effect as any).moveTo?.(target.position.x, target.position.y, 1000);
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
    let nearest = getBotsInRange(source, source.partyMembers)[0];
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
    chaseAfter(source, targetBot); 
  }
}

function chaseAfter(source: Bot, targetBot: Bot) {
  if ((source.heroId ?? 0) < 0 && (targetBot.heroId ?? 0) > 0) {
    const hero = source.parent?.children.find((child: any) => child.id == targetBot.heroId);
    source.chasing = hero;
    console.log("Starting chasing ", hero);
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
  if (target == undefined || !target.id) return;
  const dropChance = 0.5;
  const roll = Math.random();

  if (roll > dropChance) { 
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
  let parts: MetaBotPart[] = [];
  if (target && target.head) { parts.push(target.head) }
  if (target && target.legs) { parts.push(target.legs) }
  if (target && target.leftArm) { parts.push(target.leftArm) }
  if (target && target.rightArm) { parts.push(target.rightArm) }
 

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
  }

  if (generatedPart) {
    events.emit("GOT_REWARDS", { location: target.position, part: generatedPart });
  }
}

export function setTargetToDestroyed(target: Bot) {
  // target.isDeployed = false;
  // target.destroy();
 // console.log("Setting target to destroyed!", target);
  events.emit("BOT_DESTROYED", target);
}
