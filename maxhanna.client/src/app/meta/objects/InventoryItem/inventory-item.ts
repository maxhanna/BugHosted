import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { GameObject } from "../game-object";
import { Sprite } from "../sprite";
import { resources } from "../../helpers/resources";
import { events } from "../../helpers/events";
import { gridCells } from "../../helpers/grid-cells";

 
export class InventoryItem extends GameObject { 
  isItemSelected = false;
  name = "";
  constructor(x: number, y: number) {
    super({ position: new Vector2(x,y) });
  }  
}
