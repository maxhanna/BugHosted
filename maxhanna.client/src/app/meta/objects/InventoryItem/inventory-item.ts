import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { GameObject } from "../game-object";

 
export class InventoryItem extends GameObject { 
  isItemSelected = false;
  id: number = 0; 
  image = "";
  category = "";
  stats: any;
  quantity?: number;
  constructor(params: { id: number, name: string, image?: string, category?: string, isItemSelected?: boolean, position?: Vector2, stats?: any, quantity?: number }) {
    super({ position: params.position ?? new Vector2(0,0) });
    this.id = params.id;
    this.name = params.name;
    this.quantity = params.quantity;
    if (params.image) { 
      this.image = params.image;
    }
    if (params.category) { 
      this.category = params.category;
    }
    this.stats = params.stats;
    if (params.isItemSelected) { 
      this.isItemSelected = params.isItemSelected;
    }
  }  
}
