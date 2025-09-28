import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { InventoryItem } from "../../InventoryItem/inventory-item";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources"; 
import { events } from "../../../helpers/events";
import { Character } from "../../character";

export class Watch extends InventoryItem {
  body: Sprite;
  constructor(data: { position: Vector2, id?: number, scale?: Vector2 }) {
    super({ id: data.id ?? Math.floor(Math.random() * (-9999 + 1000)) - 1000, position: data.position, name: "Watch", image: "watch", category: "watch" });
    
    this.body = new Sprite({
      resource: resources.images["watch"],
      position: new Vector2(0, -10),
      scale: data.scale ?? new Vector2(0.6, 0.6),
      frameSize: new Vector2(22, 24),
      name: "Watch"
    });
    this.addChild(this.body); 
  }

  override ready() { 
    events.on("CHARACTER_POSITION", this, (hero: Character) => {
      if (hero.isUserControlled) {
        const roundedHeroX = Math.round(hero.position.x);
        const roundedHeroY = Math.round(hero.position.y);
        if (this.position.x === roundedHeroX && this.position.y === roundedHeroY) {
          this.onCollideWithHero(hero);
        }
      } 
    });
  }

  onCollideWithHero(hero: Character) {
    //remove this instance from scene
    this.destroy();
    events.emit("CHARACTER_PICKS_UP_ITEM", { 
      position: this.position,
      hero: hero,
      name: this.name,
      imageName: this.image,
      category: this.category,
      stats: this.stats
    });
    //alert other things we picked up a rod

  }
}
