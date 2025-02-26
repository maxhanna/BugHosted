import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { GameObject } from "./game-object";
import { DOWN, LEFT, RIGHT, UP } from "../helpers/grid-cells";
import { ColorSwap } from "../../../services/datacontracts/meta/color-swap";
import { Sprite } from "./sprite";
import { Mask } from "./Wardrobe/mask";
import { isObjectNearby, moveTowards, tryMove } from "../helpers/move-towards";
import { Input } from "../helpers/input";
import { events } from "../helpers/events";
import { resources } from "../helpers/resources";

export class Character extends GameObject {
	id: number;
	facingDirection: typeof UP | typeof DOWN | typeof LEFT | typeof RIGHT = DOWN;
	destinationPosition: Vector2 = new Vector2(1, 1);
	lastPosition: Vector2 = new Vector2(1, 1);
	body?: Sprite;
	isUserControlled? = false;
	slopeType: undefined | typeof UP | typeof DOWN;
	slopeDirection: undefined | typeof UP | typeof DOWN | typeof LEFT | typeof RIGHT;
	ogScale = new Vector2(1, 1);
	endScale = new Vector2(1, 1);
	steppedUpOrDown = false;
	slopeIncrements = 0.05;
	lastStandAnimationTime = 0;
	slopeStepHeight?: Vector2;
	speed: number = 1;
	scale: Vector2 = new Vector2(1, 1);
	latestMessage = "";
	mask?: Mask = undefined
	distanceLeftToTravel? = 0;
	itemPickupTime: number = 0;
	itemPickupShell: any;
	isLocked = false;

	hp = 0;
	constructor(params: {
		id: number,
		name: string,
		body?: Sprite,
		position?: Vector2,
		colorSwap?: ColorSwap,
    isUserControlled?: boolean,
    speed?: number,
		mask?: Mask,
	}) {
		super({ position: params.position ?? new Vector2(0, 0), colorSwap: params.colorSwap });
		this.id = params.id;
		this.name = params.name;
    this.body = params.body;
    this.speed = params.speed ?? 1;
		this.isUserControlled = params.isUserControlled ?? false;
		this.mask = params.mask;
		if (this.body) {
			this.initializeBody();
		}
		this.body?.animations?.play("standDown");

		this.setupEvents(); 
	}

	override destroy() {
		this.destroyBody();
		super.destroy();
	}

	destroyBody() {
		this.body?.destroy();
		this.mask?.destroy();
	}

	initializeBody() {
		let offsetY;
		if (this.scale.y < 0.75) {
			offsetY = 7;
		} else if (this.scale.y < 0.8) {
			offsetY = 5;
		} else if (this.scale.y < 0.9) {
			offsetY = 5;
		} else if (this.scale.y < 0.95) {
			offsetY = 3;
		} else {
			offsetY = 0;
		}
		if (this.body) {
			this.destroyBody();
			this.body.scale = this.scale;
			this.body.position.y = offsetY;

			if (!this.children.includes(this.body)) {
				this.addChild(this.body); 
			}

			let animation = this.body?.animations?.activeKey;
			if (!animation) {
				this.body?.animations?.play(animation ?? "standDown");
			}

			if (this.mask) {
				if (this.facingDirection == UP) {
				} else if (this.facingDirection == DOWN) {
					this.mask.frame = 0;
				} else if (this.facingDirection == LEFT) {
					this.mask.frame = 1;
				} else if (this.facingDirection == RIGHT) {
					this.mask.frame = 2;
				}

				this.mask.scale = this.scale;
				this.mask.position = this.body.position.duplicate();
				this.mask.position.y += offsetY / 2;
				this.mask.offsetX = offsetY / 2;

				if (!this.children.includes(this.mask)) { 
					this.addChild(this.mask);
				}
			}
		}
	} 

	override drawImage(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) { 
		this.drawName(ctx, drawPosX, drawPosY);
		this.drawHP(ctx, drawPosX, drawPosY);
	}

	override step(delta: number, root: any) {
		//console.log(this);
		const input = root.input as Input;
		if (this.isLocked) return;

		if (this.itemPickupTime > 0) {
			this.workOnItemPickup(delta);
			return;
		}
		if (input?.getActionJustPressed("Space") && this.isUserControlled) {
			//look for an object at the next space (according to where the hero is facing)
			const objectAtPosition = isObjectNearby(this);

			if (objectAtPosition) {
				// console.log(objectAtPosition);
				events.emit("HERO_REQUESTS_ACTION", objectAtPosition);
			}
    }

    this.distanceLeftToTravel = moveTowards(this, this.destinationPosition, this.speed); 
		const hasArrived = (this.distanceLeftToTravel ?? 0) <= 1;
		if (hasArrived || !this.isUserControlled) { 
			tryMove(this, root, (this.isUserControlled ?? false), this.distanceLeftToTravel ?? 0);
    }

		this.tryEmitPosition();
		this.recalculateMaskPositioning();
	}

	tryEmitPosition() {
		if (this.lastPosition.x === this.position.x && this.lastPosition.y === this.position.y) {
			return;
		}
		this.lastPosition.x = this.position.x;
		this.lastPosition.y = this.position.y; 
		events.emit("CHARACTER_POSITION", this); 
	}

	onPickupItem(data: { position: Vector2, hero: any, name: string, imageName: string, category: string, stats?: any }) {
		console.log(data);
		if (data.hero?.id == this.id) {
			this.destinationPosition = data.position.duplicate();
			this.itemPickupTime = 2500;
			this.itemPickupShell = new GameObject({ position: new Vector2(0, 0) });
			this.itemPickupShell.addChild(new Sprite({
				resource: resources.images[data.imageName],
				position: new Vector2(0, -30),
				scale: new Vector2(0.85, 0.85),
				frameSize: new Vector2(22, 24),
			}));
			this.addChild(this.itemPickupShell);
		}
	}
	private recalculateMaskPositioning() {
		if (!this.mask || !this.body) return;
		this.mask.offsetY = this.body.offsetY;
		if (this.body.frame >= 12 && this.body.frame < 16) {
			this.mask.preventDraw = true;
		} else {
			this.mask.preventDraw = false;

			switch (this.body.frame) {
				case 5:
				case 7:
					this.mask.offsetY += 2;
					break;

				case 8:
					// Set frame 1 and keep offsetY at 0 for frame 8
					this.mask.frame = 1;
					break;

				case 9:
					// Set frame 1 with an adjusted offsetY for frame 9
					this.mask.frame = 1;
					this.mask.offsetY += -2;
					break;

				case 10:
					this.mask.frame = 2;
					break;

				case 11:
					// Set frame 2 for frames 10 and 11
					this.mask.frame = 2;
					this.mask.offsetY += -2;
					break;

				default:
					// Default to frame 0 for any other cases
					this.mask.frame = 0;
					break;
			}
		}
	}
	workOnItemPickup(delta: number) {
		console.log("workOnItemPickup activated", delta);
		this.itemPickupTime -= delta;
		if (this.body?.animations?.activeKey != "pickupDown") {
			this.body?.animations?.play("pickupDown");
			console.log("set pickup down animation");
		}
		if (this.itemPickupTime <= 0) {
			console.log("destroyed itemShell");
			this.itemPickupShell.destroy();
		}
	}

	setupEvents() {
		events.emit("CHARACTER_CREATED", this);
		//console.log("is object neerby?", isObjectNearby(this)); 

		events.on("CHARACTER_SLOPE", this, (params: {
			character: Character;
			slopeType: typeof UP | typeof DOWN;
			slopeDirection: typeof UP | typeof DOWN | typeof LEFT | typeof RIGHT;
			startScale: Vector2;
			endScale: Vector2;
			slopeStepHeight: Vector2;
		}) => { 
			if (params.character.id === this.id) {
				//console.log("got character slope, changing scale", params);
				this.ogScale = this.scale;
				this.endScale = params.endScale;
				this.slopeType = params.slopeType;
				this.slopeDirection = params.slopeDirection;
				this.slopeStepHeight = params.slopeStepHeight;

				if (!this.scale.matches(params.startScale)) {
					this.scale = params.startScale;
					this.ogScale = params.startScale;
					this.endScale = params.endScale;
					//console.log("scale changed");
					this.initializeBody();
				}
			}
		});
		events.on("CHARACTER_PICKS_UP_ITEM", this, (data: {
			position: Vector2;
			hero: Character;
			name: string;
			imageName: string;
			category: string;
			stats: any;
		}) => {
			this.onPickupItem(data);
		});
	}

	drawName(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
		if (this.name) {
			// Set the font style and size for the name
			ctx.font = "7px fontRetroGaming"; // Font and size
			ctx.fillStyle = "chartreuse"; // Text color
			ctx.textAlign = "center"; // Center the text


			// Measure the width of the text
			const textWidth = ctx.measureText(this.name).width;

			// Set box properties for name
			const boxPadding = 2; // Padding around the text
			const boxWidth = textWidth + boxPadding * 2; // Box width
			const boxHeight = 8; // Box height (fixed height)
			const boxX = drawPosX - (boxWidth / 2) + 7; // Center the box horizontally
			const boxY = drawPosY + 23; // Position the box below the player


			// Draw the dark background box for the name
			ctx.fillStyle = "rgba(0, 0, 0, 0.7)"; // Semi-transparent black for the box
			ctx.fillRect(boxX, boxY, boxWidth, boxHeight); // Draw the box

			// Draw the name text on top of the box
			ctx.fillStyle = "chartreuse";
			ctx.fillText(this.name, drawPosX + 7, boxY + boxHeight - 1);
		}
  }

  drawHP(ctx: CanvasRenderingContext2D, drawPosX: number, drawPosY: number) {
    // Define HP bar dimensions
    const barWidth = 40;  // Total width of HP bar
    const barHeight = 6;  // Height of HP bar
    const barX = drawPosX - barWidth / 2 + 10;  // Center the bar
    const barY = drawPosY - 12;  // Position above character

    // Calculate HP percentage
    const hpPercentage = Math.max(0, this.hp / 100); // Ensure non-negative

    // Colors
    const backgroundColor = "rgba(0, 0, 0, 0.7)"; // Dark background
    const hpColor = "red"; // HP bar fill

    // Draw background box
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Draw red HP bar (filled portion)
    ctx.fillStyle = hpColor;
    ctx.fillRect(barX, barY, barWidth * hpPercentage, barHeight);

    // HP text
    const hpText = `HP: ${this.hp}`;
    ctx.font = "6px fontRetroGaming";
    ctx.textAlign = "center";

    // Measure text width
    const textWidth = ctx.measureText(hpText).width;
    const textX = drawPosX + 7;
    const textY = barY + barHeight - 1;

    // Determine text color for contrast (White if dark, Black if bright)
    const textColor = hpPercentage > 0.85 ? "black" : "white";

    // Draw HP text
    ctx.fillStyle = textColor;
    ctx.fillText(hpText, textX, textY);
  }
}

export interface Resource {
	image: HTMLImageElement;
	isLoaded: boolean;
}
