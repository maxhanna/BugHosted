import { FileEntry } from "../file/file-entry";

export class UnitStats {
  id!: number;
  unitId!: number;
  unitType!: string;
  unitLevel!: number;
  duration!: number;
  cost!: number;
  speed!: number;
  supply!: number;
  goldCarryingCapacity!: number;
  groundDamage!: number;
  airDamage!: number;
  buildingDamage!: number;
  starportLevel!: number;
  factoryLevel!: number;
  engineeringBayLevel!: number;
  pictureSrc?: string;
  purchasedValue?: number;
  sentValue?: number;
}
