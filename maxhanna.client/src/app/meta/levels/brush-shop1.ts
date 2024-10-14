import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { Exit } from "../objects/Environment/Exit/exit";
import { Level } from "../objects/Level/level";
import { Watch } from "../objects/InventoryItem/Watch/watch";
import { Sprite } from "../objects/sprite";
import { Salesman } from "../objects/Npc/Salesman/salesman";
import { BrushLevel1 } from "./brush-level1";
import { HeroRoomLevel } from "./hero-room";
import { GOT_WATCH, Scenario, TALKED_TO_MOM, TALKED_TO_MOM_ABOUT_DAD, TALKED_TO_MOM_ABOUT_WATCH } from "../helpers/story-flags";
import { Npc } from "../objects/Npc/npc";
import { Mom } from "../objects/Npc/Mom/mom";


export class BrushShop1 extends Level { 
  override defaultHeroPosition = new Vector2(gridCells(3), gridCells(8));
  constructor(params: { heroPosition?: Vector2, itemsFound?: string[] | undefined } = {}) {
    super(); 
    this.name = "BrushShop1";
    if (params.heroPosition) {
      this.defaultHeroPosition = params.heroPosition;
    }
    if (params.itemsFound) {
      this.itemsFound = params.itemsFound;
    }

    for (let x = 0; x < gridCells(7); x += gridCells(2)) { // Increment by 25
      for (let y = 0; y < gridCells(7); y += gridCells(2)) { // Increment by 27
        const shopFloor = new Sprite(
          { resource: resources.images["shopFloor"], position: new Vector2(x, y), frameSize: new Vector2(32, 32) }
        );
        shopFloor.drawLayer = "FLOOR";
        this.addChild(shopFloor);
      }
    }

    const cornercounter = new Sprite(
      { resource: resources.images["cornercounter"], position: new Vector2(gridCells(0), gridCells(-1)), frameSize: new Vector2(33, 49) }
    );
    cornercounter.isSolid = true;
    this.addChild(cornercounter);


    const botCasing = new Sprite(
      { resource: resources.images["botcasing"], position: new Vector2(gridCells(2), gridCells(-1)), frameSize: new Vector2(35, 35) }
    );
    this.addChild(botCasing);

    const botFrame = new Sprite(
      { resource: resources.images["botFrame"], position: new Vector2(gridCells(2), gridCells(-1) + 3), frameSize: new Vector2(32, 32) }
    );
    this.addChild(botFrame);



    const botCasing2 = new Sprite(
      { resource: resources.images["botcasing"], position: new Vector2(gridCells(4), gridCells(-1)), frameSize: new Vector2(35, 35) }
    );
    this.addChild(botCasing2);

    const botFrame2 = new Sprite(
      { resource: resources.images["botFrame"], position: new Vector2(gridCells(4) + 2, gridCells(-1) + 3), frameSize: new Vector2(32, 32) }
    );
    this.addChild(botFrame2);


    const cornercounter2 = new Sprite(
      { resource: resources.images["cornercounter"], position: new Vector2(gridCells(6), gridCells(-1)), frameSize: new Vector2(33, 49) }
    );
    cornercounter2.flipX = true;
    cornercounter2.isSolid = true;
    this.addChild(cornercounter2);


    for (let x = 0; x < 3; x++) {

      const counterNoLedge = new Sprite(
        { resource: resources.images["counterNoLedge"], position: new Vector2(gridCells(5), gridCells(2) + gridCells(x)), frameSize: new Vector2(16, 32) }
      ); 
      counterNoLedge.isSolid = true;
      this.addChild(counterNoLedge); 
    }


    const salesman = new Salesman({ position: new Vector2(gridCells(5), gridCells(3)), heroPosition: new Vector2(gridCells(3), gridCells(3)), entranceLevel: this });
    if (salesman.body) {
      salesman.body.position.x += 16;
    }
    salesman.textPortraitFrame = 0;
    salesman.textContent = [
      {
        string: ["Ahh, what a beautiful morning! Hey kid, are you here to repair your dads meta-bots?"],
      } as Scenario,
    ];
    salesman.facingDirection = "LEFT";
    salesman.body?.animations?.play("standLeft"); 
    this.addChild(salesman);

    const carpet1 = new Sprite(  
       {
        resource: resources.images["carpet"],
        position: new Vector2(gridCells(2), gridCells(6)),
        frameSize: new Vector2(32, 32)
      }
    );
    carpet1.drawLayer = "FLOOR";
    this.addChild(carpet1);
    const carpet2 = new Sprite(
      {
        resource: resources.images["carpet"],
        position: new Vector2(gridCells(3), gridCells(6)),
        frameSize: new Vector2(32, 32)
      }
    );
    carpet2.drawLayer = "FLOOR";
    this.addChild(carpet2);


    const exitOutside = new Exit(gridCells(3), gridCells(8), false, (Math.PI * 3) / 2);
    exitOutside.targetMap = "BrushLevel1";
    this.addChild(exitOutside);

    //walls:
    for (let y = -16; y <= 224; y += 16) {
      for (let x = -16; x <= 320; x += 16) {
        // Add walls only for the perimeter: top row, bottom row, left column, and right column
        if (y === -16 || y === 224 || x === -16 || x === 320) {
          this.walls.add(`${x},${y}`);
        }
      }
    }
  }

  override ready() {
    events.on("HERO_EXITS", this, (targetMap: string) => {
      if (targetMap === "BrushLevel1") {
        events.emit("CHANGE_LEVEL", new BrushLevel1({ heroPosition: new Vector2(gridCells(30), gridCells(18)), itemsFound: this.itemsFound }));
      }
    })
  }
}
