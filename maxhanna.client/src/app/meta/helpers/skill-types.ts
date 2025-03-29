export class Skill {
  name: string;
  type: SkillType;

  constructor(name: string, type: SkillType) {
    this.name = name;
    this.type = type;
  }
}


export enum SkillType {
  NORMAL = 0,
  SPEED = 1,
  STRENGTH = 2,
  ARMOR = 3,
  RANGED = 4,
  STEALTH = 5,
  INTELLIGENCE = 6
}

//SKILL NAMES
export const POUND = new Skill("Pound", SkillType.STRENGTH);
export const STING = new Skill("Sting", SkillType.SPEED);
export const HEADBUTT = new Skill("Headbutt", SkillType.NORMAL);
export const KICK = new Skill("Kick", SkillType.NORMAL);
export const LEFT_PUNCH = new Skill("Left Punch", SkillType.NORMAL);
export const RIGHT_PUNCH = new Skill("Right Punch", SkillType.NORMAL);

export const typeLabels = new Map<number, string>([
  [SkillType.SPEED, 'SPEED'],
  [SkillType.STRENGTH, 'STRENGTH'],
  [SkillType.ARMOR, 'ARMOR'],
  [SkillType.RANGED, 'RANGED'],
  [SkillType.STEALTH, 'STEALTH'],
  [SkillType.INTELLIGENCE, 'INTELLIGENCE'],
  [SkillType.NORMAL, 'NORMAL']
]);

export const abbrTypeLabels = new Map<number, string>([
  [SkillType.SPEED, 'SPD'],
  [SkillType.STRENGTH, 'STR'],
  [SkillType.ARMOR, 'ARM'],
  [SkillType.RANGED, 'RAN'],
  [SkillType.STEALTH, 'STL'],
  [SkillType.INTELLIGENCE, 'INT'],
  [SkillType.NORMAL, 'NRM']
]);
export const typeCounters = new Map<SkillType, SkillType>([
  [SkillType.SPEED, SkillType.STRENGTH],       // Speed counters Strength
  [SkillType.STRENGTH, SkillType.ARMOR],       // Strength counters Armor
  [SkillType.ARMOR, SkillType.RANGED],         // Armor counters Ranged
  [SkillType.RANGED, SkillType.STEALTH],       // Ranged counters Stealth
  [SkillType.STEALTH, SkillType.INTELLIGENCE], // Stealth counters Intelligence
  [SkillType.INTELLIGENCE, SkillType.SPEED]    // Intelligence counters Speed
]);

export const getCounterType = (type: SkillType): SkillType | null => {
  return typeCounters.get(type) || null;
}; 
export const getTypeLabel = (choice: number): string => typeLabels.get(choice) || 'NORMAL';
export const getAbbrTypeLabel = (choice: number): string => abbrTypeLabels.get(choice) || 'NRM';

