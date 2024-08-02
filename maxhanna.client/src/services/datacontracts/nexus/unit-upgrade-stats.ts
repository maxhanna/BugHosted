export class UnitUpgradeStats {
  unitLevel: number;
  damageMultiplier: number;
  duration: number;

  constructor(unitLevel: number, damageMultiplier: number, duration: number) {
    this.unitLevel = unitLevel;
    this.damageMultiplier = damageMultiplier;
    this.duration = duration;
  }
}
