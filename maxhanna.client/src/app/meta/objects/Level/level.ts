import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { GameObject } from "../game-object";
import { Sprite } from "../sprite";
import { resources } from "../../helpers/resources";
import { events } from "../../helpers/events";
import { gridCells } from "../../helpers/grid-cells";

 
export class Level extends GameObject {
  background: any = null;
  name: string = "";
  defaultHeroPosition = new Vector2(gridCells(1), gridCells(1));

  constructor() {
    super({ position: new Vector2(0, 0) });
  }

  getDefaultHeroPosition() {
    return this.defaultHeroPosition;
  }
}
