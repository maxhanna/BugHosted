 import { GameObject, HUD } from "../game-object";
import { Camera } from "../Camera/camera";
 import { events } from "../../helpers/events";
import { storyFlags } from "../../helpers/story-flags";
import { Level } from "../Level/level";
import { SpriteTextStringWithBackdrop } from "../SpriteTextString/sprite-text-string-with-backdrop";
 import { Character } from "../character";
import { Hero } from "../Hero/hero";
import { Inventory } from "../inventory";
import { MetaHero } from "../../../../services/datacontracts/bones/meta-hero";
import { Vector2 } from "../../../../services/datacontracts/bones/vector2";
import { Input } from "../../helpers/input";

export class Main extends GameObject {
	level?: Level = undefined;
	camera: Camera;
	// Ensure a proper Input instance is used so child objects can rely on its API
	input: Input = new Input();
	inventory: Inventory;
	heroId?: number;
	metaHero?: MetaHero;
	hero: Hero;
	partyMembers?: { heroId: number, name: string, color?: string }[] = [];

	constructor(config: { position: Vector2, heroId: number, metaHero: MetaHero, hero: Hero, partyMembers?: { heroId: number, name: string, color?: string }[] }) {
		super({ position: config.position });
		this.heroId = config.heroId;
		this.metaHero = config.metaHero;
		this.hero = config.hero;
		this.partyMembers = config.partyMembers;
		this.inventory = new Inventory({ character: this.metaHero, partyMembers: this.partyMembers });
		this.camera = new Camera({ position: new Vector2(0, 0), heroId: this.heroId });
		// bones GameObject does not have isOmittable; ensure always drawn by leaving preventDraw false
	}

	override ready() { 
		this.addChild(this.inventory); 
		events.on("CHANGE_LEVEL", this, (level: Level) => { this.setLevel(level); });
		events.on("HERO_REQUESTS_ACTION", this, (params: { hero: any, objectAtPosition: any }) => { 
			if (typeof params.objectAtPosition.getContent === "function") {
				const content = params.objectAtPosition.getContent(); 
				if (!content) return;
				if (content.addsFlag) { storyFlags.add(content.addsFlag); }
				const textBox = new SpriteTextStringWithBackdrop({ portraitFrame: content.portraitFrame, string: content.string, canSelectItems: content.canSelectItems, objectSubject: params.objectAtPosition });
				this.addChild(textBox); events.emit("START_TEXT_BOX");
				const endingSub = events.on("END_TEXT_BOX", this, () => { textBox.destroy(); events.off(endingSub); });
			} 
		}); 
	}

	override destroy() { events.unsubscribe(this); this.camera.destroy(); super.destroy(); }
	setHeroId(metaHeroId: number) { this.heroId = metaHeroId; this.camera.heroId = metaHeroId; }
	setLevel(newLevelInstance: Level) { if (this.level) { this.level.destroy(); } this.level = newLevelInstance; this.addChild(this.level as any); }
	drawBackground(ctx: CanvasRenderingContext2D) { /* optional background draw if implemented */ }
	drawObjects(ctx: CanvasRenderingContext2D) { this.children.forEach((child: GameObject) => { if (child.drawLayer !== HUD) { child.draw(ctx, 0, 0); } }); }
	drawForeground(ctx: CanvasRenderingContext2D) { this.children.forEach((child: GameObject) => { if (child.drawLayer === HUD) { child.draw(ctx, 0, 0); } }); }
}
