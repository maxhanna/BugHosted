import { User } from "../user/user";

export interface NexusBattleOutcome {
  battleId: number;
  originUser: User;
  originCoordsX: number;
  originCoordsY: number;
  destinationUser: User;
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
