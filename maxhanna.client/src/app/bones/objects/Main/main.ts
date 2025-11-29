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
import { PartyMember } from "../../../../services/datacontracts/bones/party-member";
import { Hero } from "../Hero/hero";

export class Main extends GameObject {
	level?: Level = undefined;
	camera: Camera;
	input: Input = new Input();
	inventory: Inventory;
	heroId?: number;
	metaHero?: MetaHero;
	hero: Character;
	partyMembers?: PartyMember[] = [];

	constructor(config: { position: Vector2, heroId: number, metaHero: MetaHero, hero: Character, partyMembers?: PartyMember[] }) {
		super({ position: config.position });
		this.heroId = config.heroId;
		this.metaHero = config.metaHero;
		this.hero = config.hero;
		this.partyMembers = config.partyMembers;
		this.inventory = new Inventory({ character: this.metaHero, partyMembers: this.partyMembers });
		this.inventory.drawLayer = HUD;
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
			if (typeof params.objectAtPosition?.getContent === "function") {
				const content = params.objectAtPosition?.getContent();
				if (!content) {
					return;
				}
				//potentially add a story flag
				if (content.addsFlag) {
					storyFlags.add(content.addsFlag);
				}
				if (content.string.includes("Party Up")) {
					if (this.partyMembers?.find(x => x.heroId == params.objectAtPosition.id) || this.partyMembers?.find(x => x.heroId == params.objectAtPosition.heroId)) {
						content.string = content.string.filter((x: string) => x != "Party Up");
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
			for (const child of Array.from(this.level.children)) {

				if (child && (child as any).preventDestroyAnimation !== undefined) {
					(child as any).preventDestroyAnimation = true;
				}

			}
			this.level.destroy();
		}
		console.log("setting level: ", newLevelInstance, this.children);
		this.level = newLevelInstance;
		this.addChild(this.level);
	}

	drawBackground(ctx: CanvasRenderingContext2D) {
		// Prefer the Level's parallax renderer when available. Fall back to legacy single-background draw.
		// camera.position is in pixels — renderBackground expects cameraPos in same units
		const camPos = this.camera?.position ?? new Vector2(0, 0);
		this.level?.renderBackground(ctx, camPos, ctx.canvas.width, ctx.canvas.height);
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


	drawHudForLocalHero(ctx: CanvasRenderingContext2D, hero: Hero, canvas: HTMLCanvasElement, _hpBubbles: any[] = [], _manaBubbles: any[] = []) {
		if (!hero || !hero.isUserControlled) return;
		// Ensure canvas is in a known default state: normal composite and full alpha.
		// Some draw code (particles, children's draw routines) may change these and
		// forget to restore; force defaults here so HUD elements render solidly.
		ctx.globalCompositeOperation = 'source-over';
		ctx.globalAlpha = 1;
		// Health orb parameters
		const orbRadius = Math.max(32, Math.floor(Math.min(canvas.width, canvas.height) * 0.06));
		const padding = 12;
		let orbX = padding + orbRadius;
		let orbY = canvas.height - padding - orbRadius;
		// Ensure orb is fully inside canvas (avoid clipping on very small viewports)
		const edgePad = 2; // extra pixel padding to prevent 1px anti-alias clipping
		orbX = Math.max(orbRadius + edgePad, Math.min(canvas.width - orbRadius - edgePad, orbX));
		orbY = Math.max(orbRadius + edgePad, Math.min(canvas.height - orbRadius - edgePad, orbY));

		// Draw orb background
		ctx.save();
		ctx.beginPath();
		ctx.arc(orbX, orbY, orbRadius, 0, Math.PI * 2);
		ctx.fillStyle = 'rgba(0,0,0,0.6)';
		ctx.fill();
		ctx.closePath();

		// HP fill (vial-style vertical liquid)
		const hp = Math.max(0, Math.min(100, (hero.hp ?? 0)));
		const hpRatio = hp / 100;
		// Clip to orb circle so liquid stays within container
		ctx.save();
		ctx.beginPath();
		ctx.arc(orbX, orbY, orbRadius - 4, 0, Math.PI * 2);
		ctx.clip();

		// Compute liquid rectangle (fill from bottom up)
		const innerRadius = orbRadius - 6; // padding inside container
		const liquidHeight = Math.max(0, innerRadius * 2 * hpRatio);
		const liquidTop = orbY + innerRadius - liquidHeight;

		// Vertical gradient for the health liquid (pale red at top -> darker red at bottom)
		const healthBottom = orbY + innerRadius;
		const grad = ctx.createLinearGradient(0, liquidTop, 0, healthBottom);
		grad.addColorStop(0, 'rgba(255,180,180,0.95)'); // pale top
		grad.addColorStop(1, 'rgba(180,20,20,0.95)'); // darker bottom

		ctx.fillStyle = grad;
		// Draw as circular segment for smooth rounded edges at any liquid height
		if (liquidHeight <= 0) {
			// nothing
		} else if (liquidHeight >= innerRadius * 2 - 0.001) {
			// full circle
			ctx.beginPath();
			ctx.arc(orbX, orbY, innerRadius, 0, Math.PI * 2);
			ctx.fill();
		} else {
			const yTop = liquidTop;
			// vertical distance from center to the horizontal top line
			const dy = yTop - orbY;
			// half-width at this y along the circle
			const dx = Math.sqrt(Math.max(0, innerRadius * innerRadius - dy * dy));
			const leftX = orbX - dx;
			const rightX = orbX + dx;

			ctx.beginPath();
			// start at the top-right intersection, draw the circular arc across the bottom to top-left
			ctx.moveTo(rightX, yTop);
			const startAngle = Math.atan2(yTop - orbY, rightX - orbX);
			const endAngle = Math.atan2(yTop - orbY, leftX - orbX);
			// draw the bottom arc (clockwise) so the filled region is the liquid area;
			// using `false` ensures we take the shorter/inner arc across the bottom
			ctx.arc(orbX, orbY, innerRadius, startAngle, endAngle, false);
			ctx.closePath();
			ctx.fill();

			// subtle sheen / highlight at top of liquid
			if (liquidHeight > 4) {
				// curved sheen: draw a thin arc band along the liquid surface
				ctx.save();
				ctx.beginPath();
				const sheenInnerR = innerRadius - 1;
				const sheenOuterR = Math.min(innerRadius, innerRadius - 1 + Math.min(6, liquidHeight));
				// create path for outer arc
				const sStart = Math.atan2(yTop - orbY, rightX - orbX);
				const sEnd = Math.atan2(yTop - orbY, leftX - orbX);
				ctx.arc(orbX, orbY, sheenOuterR, sStart, sEnd, true);
				// line to inner arc
				ctx.arc(orbX, orbY, sheenInnerR, sEnd, sStart, false);
				ctx.closePath();
				ctx.globalAlpha = 0.28;
				const sheenGrad = ctx.createLinearGradient(0, yTop, 0, yTop + (sheenOuterR - sheenInnerR));
				sheenGrad.addColorStop(0, 'rgba(255,255,255,0.95)');
				sheenGrad.addColorStop(1, 'rgba(255,255,255,0.05)');
				ctx.fillStyle = sheenGrad;
				ctx.fill();
				ctx.restore();
			}
		}

		// Draw HP bubbles inside the clipped liquid so they brighten the liquid instead of overlaying it 
		const nowB = Date.now();
		for (let i = _hpBubbles.length - 1; i >= 0; i--) {
			const b = _hpBubbles[i];
			if (!b._init) {
				b.x = orbX + (Math.random() - 0.5) * innerRadius * 0.8;
				b.y = orbY + innerRadius - (Math.random() * 8);
				b._init = true;
			}
			const t = nowB - b.born;
			const lifeFrac = Math.max(0, Math.min(1, t / b.life));
			b.x += b.vx;
			b.y -= b.vy * (1 + lifeFrac * 0.6);
			b.a = 1 - lifeFrac;
			ctx.save();
			try {
				// Use normal drawing to avoid washing out underlying orb color
				ctx.globalCompositeOperation = 'source-over';
				ctx.globalAlpha = Math.max(0, Math.min(1, b.a * 0.6));
				const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
				grad.addColorStop(0, 'rgba(255,255,255,0.35)');
				grad.addColorStop(0.6, 'rgba(255,255,255,0.08)');
				grad.addColorStop(1, 'rgba(255,255,255,0.0)');
				ctx.fillStyle = grad;
				ctx.beginPath();
				ctx.arc(b.x, b.y, Math.max(0.6, b.r * (1 - lifeFrac * 0.6)), 0, Math.PI * 2);
				ctx.fill();
				ctx.closePath();
			} finally {
				ctx.restore();
			}
			if (t >= b.life) {
				_hpBubbles.splice(i, 1);
			}
		}

		ctx.restore(); 

		// Inner circle to create border effect
		ctx.beginPath();
		ctx.arc(orbX, orbY, orbRadius - 8, 0, Math.PI * 2);
		ctx.fillStyle = 'rgba(0,0,0,0.25)';
		ctx.fill();
		ctx.closePath();

		// HP text inside orb
		ctx.fillStyle = 'white';
		ctx.font = 'bold 14px fontRetroGaming';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(String(Math.round(hp)), orbX, orbY);

		// Experience bar along bottom
		const barHeight = 12;
		const barPadding = 8;
		// Reserve space on the far-right of the bar for the mana orb
		const manaOrbRadius = orbRadius; // same sizing as health orb
		const reservedForMana = manaOrbRadius * 2 + padding;
		const barWidth = canvas.width - (orbRadius * 2 + padding * 4) - reservedForMana;
		const barX = orbX + orbRadius + padding * 2;
		const barY = canvas.height - barHeight - barPadding;
		const exp = (hero.exp ?? 0);
		const expForNext = (hero.expForNextLevel && hero.expForNextLevel > 0) ? hero.expForNextLevel : Math.max(1, (hero.level ?? 1) * 15);
		const expRatio = Math.max(0, Math.min(1, exp / expForNext));

		// Bar background
		ctx.beginPath();
		ctx.fillStyle = 'rgba(0,0,0,0.6)';
		ctx.fillRect(barX, barY, barWidth, barHeight);
		ctx.closePath();

		// Filled exp
		ctx.beginPath();
		ctx.fillStyle = 'rgba(220,200,30,0.95)';
		ctx.fillRect(barX + 2, barY + 2, Math.max(0, (barWidth - 4) * expRatio), barHeight - 4);
		ctx.closePath();

		// Level text on left of bar
		ctx.fillStyle = 'white';
		ctx.font = 'bold 12px fontRetroGaming';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';
		ctx.fillText('Lvl ' + (hero.level ?? 1), barX + 6, barY + barHeight / 2);

		// Mana orb on the right side of the exp bar
		let manaOrbX = barX + barWidth + reservedForMana - manaOrbRadius; // place near the right edge
		let manaOrbY = canvas.height - padding - manaOrbRadius;
		// Clamp mana orb so it doesn't overflow off the right/bottom edges
		manaOrbX = Math.max(manaOrbRadius + edgePad, Math.min(canvas.width - manaOrbRadius - edgePad, manaOrbX));
		manaOrbY = Math.max(manaOrbRadius + edgePad, Math.min(canvas.height - manaOrbRadius - edgePad, manaOrbY));
		ctx.beginPath();
		ctx.arc(manaOrbX, manaOrbY, manaOrbRadius, 0, Math.PI * 2);
		ctx.fillStyle = 'rgba(0,0,0,0.6)';
		ctx.fill();
		ctx.closePath();

		// Mana fill (vertical vial-style) using currentManaUnits (1 stat point == 100 units)
		const heroAny: any = hero as any;
		const capUnits = (heroAny.getManaCapacity && typeof heroAny.getManaCapacity === 'function') ? heroAny.getManaCapacity() : Math.max(0, (heroAny.maxMana ?? 0) * 100);
		// If capUnits is zero, fall back to legacy percent rendering
		let manaRatio = 0;
		let manaText = '0';
		if (capUnits > 0) {
			const current = Math.max(0, Math.min(capUnits, (heroAny.currentManaUnits ?? Math.round((heroAny.mana ?? 100) / 100 * capUnits))));
			manaRatio = current / capUnits;
			const pointsLeft = (current / 100);
			manaText = String(Math.round(pointsLeft * 10) / 10);
		} else {
			const manaPct = Math.max(0, Math.min(100, (hero.mana ?? 100)));
			manaRatio = manaPct / 100;
			manaText = String(Math.round(manaPct));
		}
		ctx.save();
		ctx.beginPath();
		ctx.arc(manaOrbX, manaOrbY, manaOrbRadius - 4, 0, Math.PI * 2);
		ctx.clip();

		const manaTop = manaOrbY + manaOrbRadius - 4 - (manaRatio * ((manaOrbRadius - 4) * 2));
		const manaBottom = manaOrbY + manaOrbRadius - 4;
		// vertical gradient: pale blue at top -> darker blue at bottom
		const mg = ctx.createLinearGradient(0, manaTop, 0, manaBottom);
		mg.addColorStop(0, 'rgba(174,233,255,0.95)'); // pale top
		mg.addColorStop(1, 'rgba(60,140,240,0.95)'); // darker bottom
		ctx.fillStyle = mg;
		ctx.fillRect(manaOrbX - (manaOrbRadius - 4), manaTop, (manaOrbRadius - 4) * 2, (manaOrbRadius - 4) * 2);

		// subtle curved sheen at top of liquid
		const manaLiquidHeight = manaBottom - manaTop;
		if (manaLiquidHeight > 4) {
			const yTop = manaTop;
			const dy = yTop - manaOrbY;
			const r = manaOrbRadius - 4;
			const dx = Math.sqrt(Math.max(0, r * r - dy * dy));
			const leftX = manaOrbX - dx;
			const rightX = manaOrbX + dx;

			const sheenInnerR = r - 1;
			const sheenOuterR = Math.min(r, r - 1 + Math.min(6, manaLiquidHeight));
			const sStart = Math.atan2(yTop - manaOrbY, rightX - manaOrbX);
			const sEnd = Math.atan2(yTop - manaOrbY, leftX - manaOrbX);
			ctx.beginPath();
			ctx.arc(manaOrbX, manaOrbY, sheenOuterR, sStart, sEnd, true);
			ctx.arc(manaOrbX, manaOrbY, sheenInnerR, sEnd, sStart, false);
			ctx.closePath();
			ctx.globalAlpha = 0.22;
			const sheenGrad = ctx.createLinearGradient(0, yTop, 0, yTop + (sheenOuterR - sheenInnerR));
			sheenGrad.addColorStop(0, 'rgba(255,255,255,0.95)');
			sheenGrad.addColorStop(1, 'rgba(255,255,255,0.05)');
			ctx.fillStyle = sheenGrad;
			ctx.fill();
			ctx.globalAlpha = 1;
		}

		// Draw mana bubbles inside the clipped liquid so they brighten the liquid instead of overlaying it

		const nowM = Date.now();
		const rInner = manaOrbRadius - 4;
		for (let i = _manaBubbles.length - 1; i >= 0; i--) {
			const b = _manaBubbles[i];
			if (!b._init) {
				b.x = manaOrbX + (Math.random() - 0.5) * rInner * 0.8;
				b.y = manaOrbY + (Math.random() * 8) - (rInner * 0.2);
				b._init = true;
			}
			const t = nowM - b.born;
			const lifeFrac = Math.max(0, Math.min(1, t / b.life));
			b.x += b.vx;
			b.y -= b.vy * (1 + lifeFrac * 0.6);
			b.a = 1 - lifeFrac;
			ctx.save();
			try {
				ctx.globalCompositeOperation = 'source-over';
				ctx.globalAlpha = Math.max(0, Math.min(1, b.a * 0.6));
				const mgRad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, Math.max(1, b.r));
				mgRad.addColorStop(0, 'rgba(220,250,255,0.35)');
				mgRad.addColorStop(0.6, 'rgba(180,230,255,0.08)');
				mgRad.addColorStop(1, 'rgba(180,230,255,0.0)');
				ctx.fillStyle = mgRad;
				ctx.beginPath();
				ctx.arc(b.x, b.y, Math.max(0.6, b.r * (1 - lifeFrac * 0.6)), 0, Math.PI * 2);
				ctx.fill();
				ctx.closePath();
			} finally { ctx.restore(); }
			if (t >= b.life) {
				_manaBubbles.splice(i, 1);
			}
		}

		ctx.restore();

		// Mana inner border
		ctx.beginPath();
		ctx.arc(manaOrbX, manaOrbY, manaOrbRadius - 8, 0, Math.PI * 2);
		ctx.fillStyle = 'rgba(0,0,0,0.25)';
		ctx.fill();
		ctx.closePath();

		// Mana text (show stat points left)
		ctx.fillStyle = 'white';
		ctx.font = 'bold 12px fontRetroGaming';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(manaText, manaOrbX, manaOrbY);
	}
}
