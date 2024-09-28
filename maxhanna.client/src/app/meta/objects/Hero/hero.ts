import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { MetaHero } from "../../../../services/datacontracts/meta/meta-hero";
import { GameObject } from "../game-object";
import { Sprite } from "../sprite";
import { Input } from "../../helpers/input";
import { DOWN, LEFT, RIGHT, UP, gridCells, isSpaceFree } from "../../helpers/grid-cells";
import { Animations } from "../../helpers/animations";
import { moveTowards } from "../../helpers/move-towards";
import { resources } from "../../helpers/resources";
import { walls } from "../../levels/hero-room";
import { FrameIndexPattern } from "../../helpers/frame-index-pattern";
import { events } from "../../helpers/events"; 
import { WALK_DOWN, WALK_UP, WALK_LEFT, WALK_RIGHT, STAND_DOWN, STAND_RIGHT, STAND_LEFT, STAND_UP, PICK_UP_DOWN } from "./hero-animations";
export class Hero extends GameObject {
  facingDirection: string;
  destinationPosition: Vector2;
  body: Sprite;
  shadow: Sprite;
  id: number;
  name: string;
  lastPosition: Vector2;
  itemPickupTime: number;
  itemPickupShell: any;

  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y)
    })
    console.log("new hero position : " + x + '; ' + y);
    this.facingDirection = DOWN;
    this.position = new Vector2(x, y);
    this.destinationPosition = this.position.duplicate();
    this.lastPosition = this.position.duplicate();
    this.name = "Anon";
    this.id = 0;
    this.itemPickupTime = 0;

    this.shadow = new Sprite(
      0, resources.images["shadow"], new Vector2(-16.5,-33), 1.5, 0, new Vector2(32,32), 0,0,undefined 
    );
    this.addChild(this.shadow);

    this.body = new Sprite(
      this.id,
      resources.images["hero"],
      new Vector2(-8, -20),
      1,
      1,
      new Vector2(32, 32),
      4,
      5,
      new Animations(
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
        })
    );
    this.addChild(this.body);

    events.on("HERO_PICKS_UP_ITEM", this, (data: any) => {
      this.onPickupItem(data);
    })

  }
  override step(delta: number, root: any) {

    if (this.itemPickupTime > 0) {
      this.workOnItemPickup(delta);
      return;
    }

    const distance = moveTowards(this, this.destinationPosition, 1);
    const hasArrived = (distance ?? 0) <= 1;

    if (hasArrived) {
      this.tryMove(root);
    }

    this.tryEmitPosition();
  }

  tryEmitPosition() {
    if (this.lastPosition.x === this.position.x && this.lastPosition.y === this.position.y) {
      return;
    }
    events.emit("HERO_POSITION", this.position);
    this.lastPosition = this.position.duplicate();
  }

  tryMove(root: GameObject) {
    const { input } = root;
    if (!input.direction) {
      //console.log("stand" + this.facingDirection.charAt(0) + this.facingDirection.substring(1, this.facingDirection.length).toLowerCase());
      this.body.animations?.play("stand" + this.facingDirection.charAt(0) + this.facingDirection.substring(1, this.facingDirection.length).toLowerCase());
      return;
    }

    const gridSize = gridCells(1);
    const destPos = this.destinationPosition;
    if (destPos) {
      let position = destPos.duplicate();

      if (input.direction === DOWN) {
        position.y += gridSize;
        this.body.animations?.play("walkDown");
      }
      else if (input.direction === UP) {
        position.y -= gridSize;
        this.body.animations?.play("walkUp");
      }
      else if (input.direction === LEFT) {
        position.x -= gridSize;
        this.body.animations?.play("walkLeft");
      }
      else if (input.direction === RIGHT) {
        position.x += gridSize;
        this.body.animations?.play("walkRight");
      }

      this.facingDirection = input.direction ?? this.facingDirection;

      if (isSpaceFree(walls, position.x, position.y)) {
        this.destinationPosition = position;
      }
    }
  }
  onPickupItem(data: { image: any, position: Vector2 }) {
    this.destinationPosition = data.position.duplicate();
    this.itemPickupTime = 2500;
    this.itemPickupShell = new GameObject({ position: new Vector2(0, 0) });
    this.itemPickupShell.addChild(new Sprite(
      0, data.image, new Vector2(0,-30), 0.85, 1, new Vector2(22,24), 0,0, undefined 
    ));
    this.addChild(this.itemPickupShell);
  }
  workOnItemPickup(delta: number) {
    this.itemPickupTime -= delta;
    this.body.animations?.play("pickupDown");
    if (this.itemPickupTime <= 0) {
      this.itemPickupShell.destroy();
    }
  }
 }
