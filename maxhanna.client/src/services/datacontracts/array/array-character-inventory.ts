import { ArrayCharacterItem } from "./array-character-item";

export class ArrayCharacterInventory {
  items: ArrayCharacterItem[] | undefined;

  constructor(items: ArrayCharacterItem[]) {
    this.items = items;
  }
}
