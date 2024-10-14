import { GameObject } from "./game-object";
import { Sprite } from "./sprite";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { MetaHero } from "../../../services/datacontracts/meta/meta-hero";
import { Level } from "./Level/level";
import { SpriteTextString } from "./SpriteTextString/sprite-text-string";
 

export class ShopMenu extends Level {
  nextId: number = parseInt((Math.random() * 19999).toFixed(0));
  items: ShopItem[] = [];
  currentlySelectedId?: number = undefined;
  selectedCategory: string = "all"; // Track the selected item category

  constructor() {
    super(); 
    console.log("shop menu created");
    // Listen for item selection (e.g., SPACEBAR pressed)
    events.on("SPACEBAR_PRESSED", this, (data: any) => {
      this.selectNextItem();
      console.log(this.nextId);
    });

    // Sample inventory with different categories
    this.items.push(
      new ShopItem(1, "Frame2 Canister", resources.images["metabotFrame"], "metabot frames2"),
      new ShopItem(2, "Robot Frame", resources.images["metabotFrame"], "metabot frames"),
      new ShopItem(3, "Frame3 Parts", resources.images["metabotFrame"], "metabot frames3")
    );0

    const shopFrame = new Sprite(0, resources.images["white"], new Vector2(-500, -200), new Vector2(100, 170)); 
    this.addChild(shopFrame);

    for (let x = 0; x < this.items.length; x++) {
      const sts = new SpriteTextString(this.items[x].name, new Vector2(10, 15 * x));
      sts.drawLayer = "HUD";
      this.addChild(sts);
    }
  }


  // Handles item selection logic
  selectNextItem() {
    const filteredItems = this.selectedCategory === "all"
      ? this.items
      : this.items.filter(item => item.category === this.selectedCategory);

    const currentIndex = filteredItems.findIndex(item => item.id === this.currentlySelectedId);
    this.currentlySelectedId = filteredItems[(currentIndex + 1) % filteredItems.length].id; 
  }

  override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {

    this.drawItemSelectionBox(ctx);  // Draw the selection box around selected item
  }

  private drawItemSelectionBox(ctx: CanvasRenderingContext2D) {
    const selectedChild = this.children.find((x: any) => x.isItemSelected);
    if (selectedChild) {
      const drawPos = selectedChild.position.duplicate();

      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;

      const width = 22;
      const height = 24;
      const cornerSize = 5;

      // Draw selection box around item
      ctx.beginPath();
      ctx.moveTo(drawPos.x, drawPos.y);
      ctx.lineTo(drawPos.x + cornerSize, drawPos.y);
      ctx.lineTo(drawPos.x, drawPos.y + cornerSize);
      ctx.stroke();
      ctx.closePath();
    }
  }

  // Change item category
  changeCategory(newCategory: string) {
    this.selectedCategory = newCategory; 
  }
} 

class ShopItem {
  id: number;
  name: string;
  image: any; // Image resource
  category: string; // e.g., "oil", "parts", "metabot frames"

  constructor(id: number, name: string, image: any, category: string) {
    this.id = id;
    this.name = name;
    this.image = image;
    this.category = category;
  }
}
