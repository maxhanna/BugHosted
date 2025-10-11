import { HEAD, LEFT_ARM, LEGS, MetaBotPart, RIGHT_ARM } from '../../../services/datacontracts/meta/meta-bot-part';
import { Character } from '../objects/character';
import { CHAIN, FLARE, HEADBUTT, KICK, LEFT_PUNCH, RAIL, RIGHT_PUNCH, Skill, SkillType, STING, SUBSONIC } from './skill-types';
import { getShipsInRange } from './move-towards';
import { DOWN, LEFT, RIGHT, UP } from './grid-cells';
import { events } from './events'; 
import { Ship } from '../objects/Ship/ship';

import { gridCells } from './grid-cells';
import { isNearBikeWall as indexedIsNearBikeWall } from './bike-wall-index';

// Returns true if a bike wall exists within `radius` pixels of `position` on the supplied level
// Deprecated linear scan; now delegates to spatial index implementation.
export function isNearBikeWall(level: any, position: { x: number, y: number }, radius: number = gridCells(1)): boolean {
  return indexedIsNearBikeWall(level, position, radius);
}

export const typeEffectiveness = new Map<SkillType, SkillType>([
  [SkillType.SPEED, SkillType.STRENGTH],       // Speed counters Strength
  [SkillType.STRENGTH, SkillType.ARMOR],       // Strength counters Armor
  [SkillType.ARMOR, SkillType.RANGED],         // Armor counters Ranged
  [SkillType.RANGED, SkillType.STEALTH],       // Ranged counters Stealth
  [SkillType.STEALTH, SkillType.INTELLIGENCE], // Stealth counters Intelligence
  [SkillType.INTELLIGENCE, SkillType.SPEED]    // Intelligence counters Speed
]);

       

export function faceTarget(source: any, target: any) {
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