import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";
import { Npc } from "../../Npc/npc";

export class Encounter extends Npc {
  lastSpawned: Date = new Date();
  possibleEnemies: string[] = [];
  directionIndex = 1;
  lastCreated = new Date();
  spawnTimeout: any;
  spawnMaxTime: number = 70000;
  spawnMinTime: number = 35000;
  constructor(params: {
    id: number,
    position: Vector2,
    possibleEnemies: string[],
    moveLeftRight?: number,
    moveUpDown?: number,
    level?: number,
    hp?: number,
  }) {
    super({
      id: params.id,
      position: params.position,
      moveLeftRight: params.moveLeftRight,
      moveUpDown: params.moveUpDown,
      isSolid: false,
    });
    this.hp = params.hp ?? 100;
    this.level = params.level ?? 1;
    this.possibleEnemies = params.possibleEnemies; 
  }
  override destroy() {
    if (this.spawnTimeout) {
      clearTimeout(this.spawnTimeout);
      this.spawnTimeout = null;
    }
    super.destroy();
  } 
  override ready() { 
  }
}
