export interface NexusAttackSent {
  originCoordsX: number;
  originCoordsY: number;
  originUserId?: number;
  destinationCoordsX: number;
  destinationCoordsY: number;
  destinationUserId?: number; 
  marineTotal: number;
  goliathTotal: number;
  siegeTankTotal: number;
  scoutTotal: number;
  wraithTotal: number;
  battlecruiserTotal: number;
  glitcherTotal: number;
  timestamp: Date;
  duration: number;
}
