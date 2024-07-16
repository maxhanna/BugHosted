
export interface UpgradeDetail {
  building: string;
  nextLevel: number;
  duration: number;
  cost: number;
}

export interface NexusAvailableUpgrades {
  userId: number;
  upgrades: UpgradeDetail[];
}
