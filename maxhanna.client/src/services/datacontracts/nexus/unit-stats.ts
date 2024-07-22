import { FileEntry } from "../file/file-entry";

export class UnitStats {
  id!: number;
  unitId!: number;
  unitType!: string;
  unitLevel!: number;
  duration!: number;
  cost!: number;
  supply!: number;
  groundDamage!: number;
  airDamage!: number;
  buildingDamage!: number;
  starportLevel!: number;
  factoryLevel!: number;
  engineeringBayLevel!: number;
  picture?: FileEntry;
  purchasedValue?: number;
}
