/** Stats carried by an inventory item. All numeric fields stack additively. */
export interface D2ItemStats {
  damageMin?: number;
  damageMax?: number;
  armor?: number;
  plusDamage?: number;
  plusDamageMin?: number;
  plusStrength?: number;
  plusDexterity?: number;
  plusVitality?: number;
  plusEnergy?: number;
  plusLife?: number;
  plusMana?: number;
  lifePerLevel?: number;
  manaPerLevel?: number;
  lifePercent?: number;
  manaPercent?: number;
  attackSpeedPercent?: number;
  fasterCastPercent?: number;
  movementSpeedPercent?: number;
  armorPercent?: number;
  armorPerLevel?: number;
  enhancedDamagePercent?: number;
  plusDamagePerLevel?: number;
  elementalDamageMin?: number;
  elementalDamageMax?: number;
  fireDamage?: number;
  coldDamage?: number;
  lightningDamage?: number;
  poisonDamage?: number;
  lifeStealPercent?: number;
  manaStealPercent?: number;
  crushingBlowPercent?: number;
  deadlyStrikePercent?: number;
  openWoundsPercent?: number;
  magicFindPercent?: number;
  goldFindPercent?: number;
  damageReductionFlat?: number;
  damageReductionPercent?: number;
  allResistPercent?: number;
  fireResistPercent?: number;
  coldResistPercent?: number;
  lightningResistPercent?: number;
  poisonResistPercent?: number;
  replenishLife?: number;
  thorns?: number;
  lightRadius?: number;
  extraExperiencePercent?: number;
  requiresStrength?: number;
  requiresDexterity?: number;

  /** To-hit values. The survivor combat model has no enemy defense, so these
   *  are surfaced as character-sheet stats rather than a miss chance. */
  attackRating?: number;
  attackRatingPercent?: number;
  attackRatingPerLevel?: number;
  attackRatingPercentPerLevel?: number;
  attackRatingVsDemons?: number;
  attackRatingVsUndead?: number;
  damageToDemonsPercent?: number;
  damageToUndeadPercent?: number;

  fasterHitRecoveryPercent?: number;
  fasterBlockRatePercent?: number;
  increasedBlockPercent?: number;
  magicDamageReductionFlat?: number;
  maxStamina?: number;
  healStaminaPercent?: number;
  damageTakenToManaPercent?: number;
  hitCausesMonsterFleePercent?: number;
  lifeAfterEachKill?: number;
  manaAfterEachKill?: number;
  quantity?: number;
  requirementsPercent?: number;
  freezeLengthReductionPercent?: number;
  poisonLengthReductionPercent?: number;

  /** Flags are stored as 1 so equipmentStatTotal can sum them like any other stat. */
  ignoreTargetDefense?: number;
  knockback?: number;
  preventMonsterHeal?: number;
  indestructible?: number;
  selfRepairSeconds?: number;
  replenishQuantitySeconds?: number;
  sockets?: number;

  necromancerClassSkillLevel?: number;
  necromancerTreeSkillLevels?: Record<string, number>;
  necromancerSkillLevels?: Record<string, number>;
  sorceressClassSkillLevel?: number;
  sorceressTreeSkillLevels?: Record<string, number>;
  sorceressSkillLevels?: Record<string, number>;
  druidClassSkillLevel?: number;
  druidTreeSkillLevels?: Record<string, number>;
  druidSkillLevels?: Record<string, number>;
  paladinClassSkillLevel?: number;
  paladinTreeSkillLevels?: Record<string, number>;
  paladinSkillLevels?: Record<string, number>;
  amazonClassSkillLevel?: number;
  amazonTreeSkillLevels?: Record<string, number>;
  amazonSkillLevels?: Record<string, number>;
  assassinClassSkillLevel?: number;
  assassinTreeSkillLevels?: Record<string, number>;
  assassinSkillLevels?: Record<string, number>;
  barbarianClassSkillLevel?: number;
  barbarianTreeSkillLevels?: Record<string, number>;
  barbarianSkillLevels?: Record<string, number>;
}
