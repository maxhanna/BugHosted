import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { storyFlags, Scenario, CHARACTER_CREATE_STORY_TEXT_1, CHARACTER_CREATE_STORY_TEXT_2, CHARACTER_CREATE_STORY_TEXT_3, CHARACTER_CREATE_STORY_TEXT_4, CHARACTER_CREATE_STORY_TEXT_5, CHARACTER_CREATE_STORY_TEXT_6 } from "../helpers/story-flags";
import { Exit } from "../objects/Exit/exit";
import { Level } from "../objects/Level/level";
import { Watch } from "../objects/Watch/watch";
import { Sprite } from "../objects/sprite";
import { Npc } from "../objects/Npc/npc";
import { HeroRoomLevel } from "./hero-room";
import { SpriteTextStringWithBackdrop } from "../objects/SpriteTextString/sprite-text-string-with-backdrop";
import { GameObject } from "../objects/game-object";
import { MetaBot } from "../../../services/datacontracts/meta/meta-bot";
import { MetaHero } from "../../../services/datacontracts/meta/meta-hero";
import { Hero } from "../objects/Hero/hero";
import { Bot } from "../objects/Bot/bot";
import { FightMenu } from "../objects/FightMenu/fight-menu";
import { FightStatBox } from "../objects/FightStatBox/fight-stat-box";
import { HeroHomeLevel } from "./hero-home";
import { BoltonLevel1 } from "./bolton-level1";
import { MetaBotPart } from "../../../services/datacontracts/meta/meta-bot-part";

export class Fight extends Level {
	walls: Set<string>;
	characterName = "";
	enemies?: Npc[] = undefined;
	party?: MetaHero[] = [];
	selectedFighterIndex = 0;

	fightHasStarted = false;
	isSelectingFighter = false;
	playersPositioned = false;
	botDeployed = false;
	metabotSelected = false;

	myBots: Sprite[] = [];
	enemyBots: Sprite[] = [];
	partySelectedSkills: Record<number, string> = [];

	fightMenu: FightMenu;

	lastKeyPressedDate = new Date();
	slots: { slotX?: number, slotY?: number, slotWidth?: number, slotHeight?: number, metabot?: MetaBot }[] = [];
	override defaultHeroPosition = new Vector2(0, 35);

	constructor(params: {
		heroPosition: Vector2,
		entryLevel: Level,
		enemies?: Npc[],
		party?: MetaHero[]
	}) {
		super();
		this.name = "Fight";
		this.background = new Sprite(
			0, resources.images["bedroomFloor"], new Vector2(-120, -100), undefined, 1, new Vector2(320, 220)
		);
		this.walls = new Set<string>();
		this.fightMenu = new FightMenu({ entranceLevel: params.entryLevel, entrancePosition: params.heroPosition })
		this.addChild(this.fightMenu);
		this.fightMenu.showFightMenu = false;
		if (params.party) {
			this.loadPartyMembers(params);
		}
		if (params.enemies) {
			this.enemies = params.enemies;
			for (let x = 0; x < this.enemies.length; x++) {
				const tmpNpc = new Npc(gridCells(10 - x), gridCells(1 + x), undefined, this.enemies[x].type);
				this.addChild(tmpNpc);
				console.log("added enemy: ", this.enemies[x]);
			}
		}
	}

	override ready() {
		events.on("FIGHTER_SELECTED", this, () => {
			if (this.party) {
				this.deployBot(this.party[0].metabots[0]);
				this.fightMenu.showFighterSelectionMenu = false;
			}
		});
		events.on("SKILL_USED", this, (data: { heroId: number, skill: string }) => {
			this.partySelectedSkills[data.heroId] = data.skill;
			console.log("skill selected, ", this.partySelectedSkills);
		});
	}

	override step(delta: number, root: any) {
		const input = root.input;
		//if (input?.keys["Space"]) { }

		if (storyFlags.flags.has("START_FIGHT") && !this.fightHasStarted && !this.fightMenu.showFightMenu) {
			this.setupNewFight(root);
		}

		if (this.fightMenu.showWaitingForOthers) {
			if (Object.keys(this.partySelectedSkills).length == this.party?.length) { 
				this.performAttack();
			}
		}
	}

	private setupNewFight(root: any) { 
		this.fightHasStarted = true;
		root.camera.position.x -= 50;
		setTimeout(() => {
			this.startFightStance();
			if (!this.fightMenu.showFightMenu) {
				events.emit("END_TEXT_BOX");
				setTimeout(() => {
					this.fightMenu.showFighterSelectionMenu = true;
					this.fightMenu.showFightMenu = true;
				}, 100);
			}
		}, 1000);
	}

	private loadPartyMembers(params: { heroPosition: Vector2; entryLevel: Level; enemies?: any; party?: MetaHero[] | undefined; }) {
		this.party = params.party;
		if (this.party) {
			for (let x = 0; x < this.party.length; x++) {
				const metaHero = this.party[x];
				const newHero = new Hero(-90 + (x * gridCells(1)), 15 + (x * gridCells(1)));
				newHero.name = metaHero.name ?? "Anon";
				newHero.id = metaHero.id;
				if (x === 0) {
					const bot1 = new MetaBot(1, this.party[0].id, 1, "Bee", false, new Vector2(gridCells(-1), gridCells(1)));
					const bot2 = new MetaBot(2, this.party[0].id, 1, "Jaguar", false, new Vector2(gridCells(-1), gridCells(1)));
					const bot3 = new MetaBot(3, this.party[0].id, 1, "Rhino", false, new Vector2(gridCells(-1), gridCells(1)));
					bot1.hp = bot2.hp = bot3.hp = 100;
					bot2.exp = 80;
					bot3.exp = 20;
					bot1.exp = 40;
					bot1.leftArm = new MetaBotPart({ id: 0, metabotId: 1, skill: "Sting", type: "Speed", damageMod: 5 })
					this.party[x].metabots = [bot1, bot2, bot3];
					this.fightMenu.metabotChoices = this.party[x].metabots;
				}
				this.addChild(newHero);
			}
		}
	}
	private performAttack() {
		this.fightMenu.showWaitingForOthers = false;
		this.fightMenu.showFightMenuOptions = true;
		console.log("performing attacks: " , this.partySelectedSkills);

		if (this.party) {
			for (let attackingHero of Object.keys(this.partySelectedSkills)) {
				const attackingHeroId = parseInt(attackingHero);
				const attackingHeroSkill = this.partySelectedSkills[attackingHeroId];
				const player = this.party.find(x => x.id === attackingHeroId);
				const attackingBot = player?.metabots[0]; 
				const botParts = ["leftArm", "rightArm", "legs", "head"];
				let attackingPart = undefined;
				if (attackingBot) { 
					for (let part of botParts) {
						const attackingPart = (attackingBot[part as keyof MetaBot] as MetaBotPart);
						if (attackingPart?.skill === attackingHeroSkill) { 
							console.log(attackingPart?.damageMod);
							if (this.enemies) {
								for (let enemy of this.enemies) {
									enemy.metabots[0].hp -= attackingPart.damageMod;
								} 
							}
						}
					}
				} 
			}
			this.partySelectedSkills = [];
			this.performEnemyAttacks();
		} 
	}
	private performEnemyAttacks() {
		if (this.enemies) { 
			for (let attackingEnemy of this.enemies) {
				const enemyBot = attackingEnemy.metabots[0];
				const botParts = ["leftArm", "rightArm", "legs", "head"];
				const randomPart = botParts[Math.floor(Math.random() * botParts.length)];
				const randomBotPart = enemyBot?.[randomPart as keyof MetaBot] as MetaBotPart;
				if (randomBotPart && this.party) {
					for (let member of this.party) {
						member.metabots[0].hp -= randomBotPart.damageMod;
					}
				}

			}
		}
	}
	private startFightStance() {
		console.log("start fiht stance");
		if (this.party) {
			for (let x = 0; x < this.party.length; x++) {
				const metaHero = this.party[x];
				const target = this.children.find((child: any) => {
					return child.id === metaHero.id;
				});
				setTimeout(() => {
					if (target) {
						target.position = new Vector2(target.position.x - gridCells(2), 15 + (x * (gridCells(1))));
						target.body.animations.play("standRight");
					}
					this.playersPositioned = true;
				}, 2000);
			}
		}
		if (this.enemies) {
			for (let x = 0; x < this.enemies.length; x++) {
				let child = this.children.find((child: any) => this.enemies && this.enemies[x].position.matches(child.position));
				if (!child) {
					this.addChild(this.enemies[x]);
					child = this.enemies[x];
				}
				if (child) {
					child.position = this.enemies[x].position.duplicate();
					setTimeout(() => {
						child.body.animations?.play("standLeft");
						console.log("setting animation for child ", child.body.animations);
					}, 1000);
				}
			}
		}
	}


	private deployBot(metabot: MetaBot) {
		console.log("deploy bot");
		if (!this.botDeployed && metabot && !metabot.isDead) {
			this.botDeployed = true;
			this.isSelectingFighter = false;
			const newBot = new Sprite(
				metabot.id,
				resources.images["botFrame"],
				metabot.position,
				undefined,
				undefined,
				new Vector2(32, 32),
				undefined,
				undefined,
				undefined,
			);
			this.myBots.push(newBot);
			this.addChild(newBot);

			const fighterStats = new FightStatBox({ position: new Vector2(-100, 50), bot: metabot, showExp: true });
			this.addChild(fighterStats);

			if (this.myBots.length == this.party?.length) {
				this.deployEnemyBots();
			}
		}
	}

	private deployEnemyBots() {
		if (this.enemies) {
			for (let x = 0; x < this.enemies.length; x++) {
				if (this.enemies[x].metabots[0]) {
					const metabot = this.enemies[x].metabots[0];
					metabot.position = new Vector2(gridCells(7) - gridCells(x), gridCells(x));
					const newBot = new Sprite(
						0,
						resources.images["botFrame"],
						metabot.position,
						undefined,
						undefined,
						new Vector2(32, 32),
						undefined,
						undefined,
						undefined,
						metabot.name
					);
					this.addChild(newBot);
					const fighterStats = new FightStatBox({ position: new Vector2(110, -65), bot: metabot, showExp: false });
					this.addChild(fighterStats);
					console.log(`deployed ${this.enemies[x].type}'s bot @ ${metabot.position.x},${metabot.position.y}'`);
				}
			}
		}
	}
}
