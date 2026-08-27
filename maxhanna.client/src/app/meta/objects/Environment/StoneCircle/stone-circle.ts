import { Vector2 } from "../../../../../services/datacontracts/meta/vector2";  
import { FLOOR, GameObject, GROUND } from "../../game-object";
import { Sprite } from "../../sprite"; 
import { resources } from "../../../helpers/resources";
import { events } from "../../../helpers/events";
import { Character } from "../../character";

export class StoneCircle extends GameObject { 
  body: Sprite;
  private readonly scaleBoost = new Vector2(1.04, 1.04);
  private scaledCharacters = new Set<number>();

  constructor(x: number, y: number) {
    super({
      position: new Vector2(x, y),
      drawLayer: FLOOR,
      isSolid: true
    }) 

    this.body = new Sprite({
      resource: resources.images["stoneCircle"],
      position: new Vector2(-120, -110),
      frameSize: new Vector2(250, 250),
      isSolid: true 
    });
    this.addChild(this.body);
  }

  override ready() {
    events.on("CHARACTER_POSITION", this, (character: Character) => {
      if (!character?.isUserControlled || character.id < 0) return;
      const onCircle = Math.abs(character.position.x - this.position.x) <= 16 &&
        Math.abs(character.position.y - this.position.y) <= 16;
      if (onCircle && !this.scaledCharacters.has(character.id)) {
        this.scaledCharacters.add(character.id);
        character.scale = new Vector2(character.scale.x * this.scaleBoost.x, character.scale.y * this.scaleBoost.y);
        character.initializeBody();
      } else if (!onCircle && this.scaledCharacters.has(character.id)) {
        this.scaledCharacters.delete(character.id);
        character.scale = new Vector2(character.scale.x / this.scaleBoost.x, character.scale.y / this.scaleBoost.y);
        character.initializeBody();
      }
    });
  }

  override destroy() {
    events.unsubscribe(this);
    super.destroy();
  }
 }
