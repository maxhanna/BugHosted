import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { GameObject } from "../game-object";
import { gridCells } from "../../helpers/grid-cells";

 
export class Level extends GameObject {
  background: any = null; 
  defaultHeroPosition = new Vector2(gridCells(1), gridCells(1)); 
  itemsFound: string[] = [];
  walls: Set<string> = new Set(); 

  constructor() {
    super({ position: new Vector2(0, 0) }); 
  }

  getDefaultHeroPosition() {
    return this.defaultHeroPosition;
  }
}
