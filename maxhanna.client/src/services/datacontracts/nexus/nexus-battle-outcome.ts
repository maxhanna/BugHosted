export interface NexusBattleOutcome {
  battleId: number;
  originUserId: number;
  originCoordsX: number;
  originCoordsY: number;
  destinationUserId: number;
  destinationCoordsX: number;
  destinationCoordsY: number;
  timestamp: string;
  attackingUnits: Record<string, number>;
  defendingUnits: Record<string, number>;
  attackingLosses: Record<string, number>;
  defendingLosses: Record<string, number>;
  defenderUnitsNotInVillage: Record<string, number>;
  defenderBuildingLevels: Record<string, number>;
  defenderGold: number;
  defenderGoldStolen: number; 
}
