export interface NexusAttackSent {
  originCoordsX: number;
  originCoordsY: number;
  destinationCoordsX: number;
  destinationCoordsY: number;
  marineTotal: number;
  goliathTotal: number;
  siegeTankTotal: number;
  scoutTotal: number;
  wraithTotal: number;
  battlecruiserTotal: number;
  timestamp: Date;
  duration: number;
}
