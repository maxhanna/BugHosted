import { Vector2 } from "../../../../services/datacontracts/bones/vector2";
import { GameObject, HUD } from "../game-object";
import { Camera } from "../camera";
import { Inventory } from "../inventory";
import { events } from "../../helpers/events";
import { Input } from "../../helpers/input";
import { storyFlags } from "../../helpers/story-flags";
import { Level } from "../Level/level";
import { SpriteTextStringWithBackdrop } from "../SpriteTextString/sprite-text-string-with-backdrop";
import { MetaHero } from "../../../../services/datacontracts/bones/meta-hero";
import { Character } from "../character";

export class Main extends GameObject {
  level?: Level = undefined;
  camera: Camera;
  input: Input = new Input();
  inventory: Inventory;
  heroId?: number;
  metaHero?: MetaHero;
  hero: Character;
  partyMembers?: { heroId: number, name: string, color?: string }[] = [];

  constructor(config: { position: Vector2, heroId: number, metaHero: MetaHero, hero: Character, partyMembers?: { heroId: number, name: string, color?: string }[] }) {
	super({ position: config.position });
	this.heroId = config.heroId;
	this.metaHero = config.metaHero;
	this.hero = config.hero;
	this.partyMembers = config.partyMembers;
	this.inventory = new Inventory({ character: this.metaHero, partyMembers: this.partyMembers });
	this.camera = new Camera({ position: new Vector2(0, 0), heroId: this.heroId });
	this.isOmittable = false;
  }

  override ready() { 
	this.addChild(this.inventory); 
	//CHANGE LEVEL HANDLER
	events.on("CHANGE_LEVEL", this, (level: Level) => { 
	  this.setLevel(level); 
	});

	//LAUNCH TEXT BOX HANDLER
	events.on("HERO_REQUESTS_ACTION", this, (params: { hero: any, objectAtPosition: any }) => { 
	  if (typeof params.objectAtPosition.getContent === "function") {
		const content = params.objectAtPosition.getContent(); 
		if (!content) {
		  return;
		}
		//potentially add a story flag
		if (content.addsFlag) { 
		  storyFlags.add(content.addsFlag);
		}
		if (content.string.includes("Party Up")) {
		  if (this.partyMembers?.find(x => x.heroId == params.objectAtPosition.id) || this.partyMembers?.find(x => x.heroId == params.objectAtPosition.heroId)) {
			content.string = content.string.filter((x:string) => x != "Party Up");
			content.string.unshift("Unparty");
		  }
		}

		const textBox = new SpriteTextStringWithBackdrop({
		  portraitFrame: content.portraitFrame,
		  string: content.string,
		  canSelectItems: content.canSelectItems,
		  objectSubject: params.objectAtPosition
		});
		this.addChild(textBox);
		events.emit("START_TEXT_BOX");

		const endingSub = events.on("END_TEXT_BOX", this, () => {
		  textBox.destroy(); 
		  events.off(endingSub);
		});
	  } 
	}); 
  }
 
  override destroy() {
	this.input.destroy();
	this.camera.destroy();
	super.destroy();
  }
  setHeroId(metaHeroId: number) {
	this.heroId = metaHeroId;
	this.camera.heroId = metaHeroId;
  }

  setLevel(newLevelInstance: Level) {
	if (this.level) {
	  this.level.destroy();
	} 
	console.log("setting level: ", newLevelInstance, this.children);
	this.level = newLevelInstance; 
	this.addChild(this.level);
  }

  drawBackground(ctx: CanvasRenderingContext2D) { 
	this.level?.background?.drawImage(ctx, 0, 0);
  }

  drawObjects(ctx: CanvasRenderingContext2D) { 
	this.children.forEach((child: GameObject) => {
	  if (child.drawLayer !== HUD) {
		child.draw(ctx, 0, 0);
	  }
	}); 
  }

  drawForeground(ctx: CanvasRenderingContext2D) { 
	this.children.forEach((child: GameObject) => {
	  if (child.drawLayer === HUD) {
		child.draw(ctx, 0, 0);
	  }
	}) 
  }
}
