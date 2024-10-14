import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { InventoryItem } from "../../InventoryItem/inventory-item";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources"; 
import { events } from "../../../helpers/events";

export class Watch extends InventoryItem {
  constructor(data: { position: Vector2, id: number }) {
    super({ id: data.id, position: data.position, name: "Watch", image: "watch" });
    
    const sprite = new Sprite({
      resource: resources.images["watch"],
      position: new Vector2(0, -10),
      scale: new Vector2(0.6, 0.6),
      frameSize: new Vector2(22, 24),
      name: "Watch"
    });
    this.addChild(sprite); 
  }

  override ready() { 
    events.on("HERO_POSITION", this, (hero: any) => {
      if (hero.isUserControlled) {
        const roundedHeroX = Math.round(hero.position.x);
        const roundedHeroY = Math.round(hero.position.y);
        if (this.position.x === roundedHeroX && this.position.y === roundedHeroY) {
          this.onCollideWithHero(hero);
        }
      } 
    });
  }

  onCollideWithHero(hero: any) {
    //remove this instance from scene
    this.destroy();
    events.emit("HERO_PICKS_UP_ITEM", {
      image: resources.images["watch"],
      position: this.position,
      hero: hero,
      name: this.name,
      imageName: this.image
    });
    //alert other things we picked up a rod

  }
}
