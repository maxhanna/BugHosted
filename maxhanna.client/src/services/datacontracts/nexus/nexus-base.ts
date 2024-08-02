import { User } from "../user/user";

export interface NexusBase {
  user?: User;
  gold: number;
  supply: number;
  coordsX: number;
  coordsY: number;
  commandCenterLevel: number;
  minesLevel: number;
  supplyDepotLevel: number;
  engineeringBayLevel: number;
  warehouseLevel: number;
  factoryLevel: number;
  starportLevel: number;
  marineLevel: number;
  goliathLevel: number;
  siegeTankLevel: number;
  scoutLevel: number;
  wraithLevel: number;
  battlecruiserLevel: number;
  glitcherLevel: number;
}
