import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { InventoryItem } from "../InventoryItem/inventory-item";
import { Sprite } from "../sprite";
import { resources } from "../../helpers/resources";
import { events } from "../../helpers/events";

export class Watch extends InventoryItem {
  constructor(x: number, y: number) {
    super(x,y);

    const sprite = new Sprite(
      0,
      resources.images["watch"],
      new Vector2(0, -10),
      new Vector2(0.85, 0.85),
      undefined,
      new Vector2(22, 24),
      undefined,
      undefined,
      undefined
    );
    this.addChild(sprite);
    this.name = "Watch";
  }

  override ready() {
    console.log("Watch is ready!");
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
      name: this.name
    });
    //alert other things we picked up a rod

  }
}
