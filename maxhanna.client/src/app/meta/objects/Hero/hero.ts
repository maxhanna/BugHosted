import { Vector2 } from "../../../../services/datacontracts/meta/vector2";
import { MetaHero } from "../../../../services/datacontracts/meta/meta-hero";
import { GameObject } from "../game-object";
import { Sprite } from "../sprite";
import { Input } from "../../helpers/input";
import { DOWN, LEFT, RIGHT, UP, gridCells, isSpaceFree } from "../../helpers/grid-cells";
import { Animations } from "../../helpers/animations";
import { moveTowards } from "../../helpers/move-towards";
import { resources } from "../../helpers/resources";
import { FrameIndexPattern } from "../../helpers/frame-index-pattern";
import { events } from "../../helpers/events"; 
import { WALK_DOWN, WALK_UP, WALK_LEFT, WALK_RIGHT, STAND_DOWN, STAND_RIGHT, STAND_LEFT, STAND_UP, PICK_UP_DOWN } from "./hero-animations";
export class Hero extends GameObject {
  facingDirection: string;
  destinationPosition: Vector2;
  body: Sprite; 
  id: number;
  name: string;
  lastPosition: Vector2;
  itemPickupTime: number;
  itemPickupShell: any;
  isLocked = false;

  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y)
    })
    console.log("New Hero at position : " + x + '; ' + y);
    this.facingDirection = DOWN;
    this.position = new Vector2(x, y);
    this.destinationPosition = this.position.duplicate();
    this.lastPosition = this.position.duplicate();
    this.name = "Anon";
    this.id = 0;
    this.itemPickupTime = 0;

    const shadow = new Sprite(
      0, resources.images["shadow"], new Vector2(-16.5,-33), 1.5, 0, new Vector2(32,32), 0,0,undefined 
    );
    this.addChild(shadow);

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

  override ready() {
    events.on("START_TEXT_BOX", this, () => {
      this.isLocked = true;
    })
    events.on("END_TEXT_BOX", this, () => {
      this.isLocked = false;
    })
  }

  override step(delta: number, root: any) {
    if (this.isLocked) return;

    if (this.itemPickupTime > 0) {
      this.workOnItemPickup(delta);
      return;
    }
    const input = root.input as Input;
    if (input?.getActionJustPressed("Space")) {
      //look for an object at the next space (according to where the hero is facing)
      const objectAtPosition = this.parent.children.find((child: GameObject) => {
        return child.position.matches(this.position.toNeighbour(this.facingDirection))
      });

      if (objectAtPosition) { 
        events.emit("HERO_REQUESTS_ACTION", objectAtPosition);
      } 
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

  tryMove(root: any) {
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
        position.y = this.snapToGrid(position.y + gridSize, gridSize);
        this.body.animations?.play("walkDown");
      }
      else if (input.direction === UP) {
        position.y = this.snapToGrid(position.y - gridSize, gridSize);
        this.body.animations?.play("walkUp");
      }
      else if (input.direction === LEFT) {
        position.x = this.snapToGrid(position.x - gridSize, gridSize);
        this.body.animations?.play("walkLeft");
      }
      else if (input.direction === RIGHT) {
        position.x = this.snapToGrid(position.x + gridSize, gridSize);
        this.body.animations?.play("walkRight");
      }

      this.facingDirection = input.direction ?? this.facingDirection;
      const spaceIsFree = isSpaceFree(root.level?.walls, position.x, position.y);
      const solidBodyAtSpace = this.parent.children.find((c:any) => {
        return c.isSolid
          && c.position.x == position.x
          && c.position.y == position.y
      })
      if (spaceIsFree && !solidBodyAtSpace) {
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
  private snapToGrid(value: number, gridSize: number): number {
    return Math.round(value / gridSize) * gridSize;
  }
 }
