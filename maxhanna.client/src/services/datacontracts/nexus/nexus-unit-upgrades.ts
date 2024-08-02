export class NexusUnitUpgrades {
  id: number;
  coordsX: number;
  coordsY: number;
  unitIdUpgraded: number;
  timestamp: Date;

  constructor(id: number, coordsX: number, coordsY: number, unitIdUpgraded: number, timestamp: Date) {
    this.id = id;
    this.coordsX = coordsX;
    this.coordsY = coordsY;
    this.unitIdUpgraded = unitIdUpgraded;
    this.timestamp = timestamp;
  }
}
