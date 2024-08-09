import { User } from "../user/user";

export interface NexusAttackSent {
  id: number;
  originCoordsX: number;
  originCoordsY: number;
  originUser?: User;
  destinationCoordsX: number;
  destinationCoordsY: number;
  destinationUser?: User; 
  marineTotal: number;
  goliathTotal: number;
  siegeTankTotal: number;
  scoutTotal: number;
  wraithTotal: number;
  battlecruiserTotal: number;
  glitcherTotal: number;
  timestamp: Date;
  duration: number;
  arrived?: boolean;
}
