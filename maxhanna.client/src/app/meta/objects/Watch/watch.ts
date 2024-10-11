import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { InventoryItem } from "../InventoryItem/inventory-item";
import { Sprite } from "../sprite";
import { resources } from "../../helpers/resources"; 
import { events } from "../../helpers/events";
import { GOT_WATCH, storyFlags } from "../../helpers/story-flags";

export class Watch extends InventoryItem {
  constructor(data: { position: Vector2, id: number }) {
    super({ id: data.id, position: data.position, name: "Watch", image: "watch" });
    
    const sprite = new Sprite(
      0,
      resources.images["watch"],
      new Vector2(0, -10),
      new Vector2(0.65, 0.65),
      undefined,
      new Vector2(22, 24),
      undefined,
      undefined,
      undefined
    );
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
