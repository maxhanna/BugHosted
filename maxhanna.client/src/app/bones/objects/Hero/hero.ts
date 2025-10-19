import { Character } from "../character";
import { Vector2 } from "../../../../services/datacontracts/bones/vector2";
import { Mask } from "../Wardrobe/mask";
import { Bot } from "../Bot/bot";
import { ColorSwap } from "../../../../services/datacontracts/bones/color-swap";

export class Hero extends Character {
	override speed: number = 1;
	override mask?: Mask;
	metabots: Bot[] = [];
	color?: string;
	constructor(params: {
		id?: number;
		name?: string;
		position?: Vector2;
		isUserControlled?: boolean;
		speed?: number;
		mask?: Mask;
		metabots?: any[]; // Will be normalized once Bot implementation copied
		colorSwap?: ColorSwap;
		forceDrawName?: boolean;
	}) {
		super({
			id: params.id ?? Math.floor(Math.random() * 999999) * -1,
			name: params.name ?? 'Anon',
			position: params.position ?? new Vector2(0, 0),
			isUserControlled: params.isUserControlled ?? false,
			forceDrawName: params.forceDrawName ?? false,
			colorSwap: params.colorSwap,
		});
		this.speed = params.speed ?? 1;
		this.mask = params.mask;
		this.metabots = (params.metabots ?? []) as any;
	}
}
