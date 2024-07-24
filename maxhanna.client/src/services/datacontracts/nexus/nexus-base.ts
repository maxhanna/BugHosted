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
}
