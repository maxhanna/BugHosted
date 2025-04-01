import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { MetaBot } from "../../../../services/datacontracts/meta/meta-bot";
import { Character } from "../character";
import { Sprite } from "../sprite";
import { Mask } from "../Wardrobe/mask";
import { DOWN, gridCells, isSpaceFree } from "../../helpers/grid-cells";
import { Animations } from "../../helpers/animations";
import { bodyAtSpace, isObjectNearby } from "../../helpers/move-towards";
import { resources } from "../../helpers/resources";
import { FrameIndexPattern } from "../../helpers/frame-index-pattern";
import { WALK_DOWN, WALK_UP, WALK_LEFT, WALK_RIGHT, STAND_DOWN, STAND_RIGHT, STAND_LEFT, STAND_UP, PICK_UP_DOWN } from "./hero-animations";
import { ColorSwap } from "../../../../services/datacontracts/meta/color-swap";
import { events } from "../../helpers/events";
import { WarpBase } from "../Effects/Warp/warp-base";

export class Hero extends Character {
  metabots?: MetaBot[];
  constructor(params: {
    position: Vector2, id?: number, name?: string, metabots?: MetaBot[], colorSwap?: ColorSwap,
    isUserControlled?: boolean, speed?: number, mask?: Mask, scale?: Vector2,
    forceDrawName?: boolean, preventDrawName?: boolean,
  }) {
    super({
      id: params.id ?? 0,
      position: params.position,
      colorSwap: params.colorSwap,
      name: params.name ?? "Anon",
      mask: params.mask,
      isUserControlled: params.isUserControlled,
      forceDrawName: params.forceDrawName ?? true,
      preventDrawName: params.preventDrawName ?? false,
      body: new Sprite({
        objectId: params.id ?? 0,
        resource: resources.images["hero"], 
        name: "hero",
        position: new Vector2(-8, 0),
        frameSize: new Vector2(32, 32),
        offsetY: -10,
        hFrames: 4,
        vFrames: 5,
        animations: new Animations(
          {
            walkDown: new FrameIndexPattern(WALK_DOWN),
            walkUp: new FrameIndexPattern(WALK_UP),
            walkLeft: new FrameIndexPattern(WALK_LEFT),
            walkRight: new FrameIndexPattern(WALK_RIGHT),
            standDown: new FrameIndexPattern(STAND_DOWN),
            standRight: new FrameIndexPattern(STAND_RIGHT),
            standLeft: new FrameIndexPattern(STAND_LEFT),
            standUp: new FrameIndexPattern(STAND_UP),
            pickupDown: new FrameIndexPattern(PICK_UP_DOWN),
          }),
        colorSwap: params.colorSwap,
        scale: params.scale,
      })
    }); 
    this.facingDirection = DOWN;
    this.destinationPosition = this.position.duplicate();
    this.lastPosition = this.position.duplicate();
    this.speed = params.speed ?? 1;
    this.mask = params.mask;
    this.itemPickupTime = 0;
    this.isOmittable = false;
    this.scale = params.scale ?? new Vector2(1, 1);
    this.metabots = params.metabots ?? [];
    const shadow = new Sprite({
      resource: resources.images["shadow"],
      offsetY: 10,
      name: "shadow",
      position: new Vector2(-18, -18),
      scale: new Vector2(1.25, 1),
      frameSize: new Vector2(32, 32),
    });
    shadow.drawLayer = "FLOOR";
    this.addChild(shadow);
  }


  override ready() {
    if (this.isUserControlled) {
      events.on("START_TEXT_BOX", this, () => {
        this.isLocked = true; 
      });
      events.on("END_TEXT_BOX", this, () => {
        this.isLocked = false;
      });
      events.on("HERO_MOVEMENT_LOCK", this, () => {
        this.isLocked = true;  
      });
      events.on("HERO_MOVEMENT_UNLOCK", this, () => {
        this.isLocked = false;
      });
      events.on("SELECTED_ITEM", this, (selectedItem: string) => { 
        if (selectedItem === "Party Up") {
          events.emit("PARTY_UP", isObjectNearby(this));
        }
        else if (selectedItem === "Wave") {
          events.emit("WAVE_AT", isObjectNearby(this));
        }
        else if (selectedItem === "Whisper") {
          events.emit("WHISPER_AT", isObjectNearby(this));  
        }
      });
      events.on("CHANGE_LEVEL", this, () => {
        const deployedBot = this.metabots?.find(x => x.isDeployed && x.hp > 0);
        if (deployedBot) {
          events.emit("CALL_BOT_BACK", { bot: deployedBot });
          setTimeout(() => {
            events.emit("DEPLOY", { metaHero: this, bot: deployedBot });
          }, 2450);
        } 
      });
      events.on("CLOSE_HERO_DIALOGUE", this, () => {
        this.isLocked = false;
        events.emit("END_TEXT_BOX");
      });
      events.on("WARP", this, (params: { x: string, y: string }) => {
        console.log("warping ", params);
        const warpPosition = new Vector2(gridCells(parseInt(params.x)), gridCells(parseInt(params.y)));
        const spaceIsFreeForWarp = isSpaceFree(this.parent.walls, warpPosition.x, warpPosition.y);
        const deployedBot = this.metabots?.find(x => x.isDeployed && x.hp > 0);
        if (spaceIsFreeForWarp) {
          events.emit("HERO_MOVEMENT_LOCK");
          if (deployedBot) { 
            events.emit("CALL_BOT_BACK", { bot: deployedBot });
          }
          const warpBase = new WarpBase({ position: this.position, parentId: this.id, offsetX: -8, offsetY: 12 });
          this.parent.addChild(warpBase);
          setTimeout(() => {
            events.emit("HERO_MOVEMENT_UNLOCK");
            this.destinationPosition = warpPosition.duplicate();
            this.position = this.destinationPosition.duplicate();
            warpBase.destroy();
            setTimeout(() => {
              events.emit("HERO_MOVEMENT_LOCK");
              if (deployedBot) {
                events.emit("DEPLOY", { metaHero: this, bot: deployedBot });
              }
              const warpBase2 = new WarpBase({ position: this.position, parentId: this.id, offsetX: -8, offsetY: 12 });
              this.parent.addChild(warpBase2);
              setTimeout(() => {
                warpBase2.destroy();
                events.emit("HERO_MOVEMENT_UNLOCK"); 
              }, 1300);
            }, 15); 
          }, 1300);
        } else {
          events.emit("INVALID_WARP", this);
        }
      });
    }
  }



  override getContent() {
    return {
      portraitFrame: 0,
      string: ["Party Up", "Whisper", "Wave", "Cancel"],
      canSelectItems: true,
      addsFlag: undefined
    }
  }
}
