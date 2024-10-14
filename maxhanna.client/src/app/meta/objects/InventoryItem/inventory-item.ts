import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { GameObject } from "../game-object";

 
export class InventoryItem extends GameObject { 
  isItemSelected = false;
  id: number = 0;
  name = "";
  image = "";
  constructor(params: { position: Vector2, id: number, name: string, image: string, isItemSelected?: boolean }) {
    super({ position: params.position });
    this.id = params.id;
    this.name = params.name;
    this.image = params.image;
    if (params.isItemSelected) { 
      this.isItemSelected = params.isItemSelected;
    }
  }  
}
