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
import { SpriteTextString } from "../objects/SpriteTextString/sprite-text-string";
import { GameObject } from "../objects/game-object";
import { MetaBot } from "../../../services/datacontracts/meta/meta-bot";
import { MetaHero } from "../../../services/datacontracts/meta/meta-hero";
import { Hero } from "../objects/Hero/hero";
import { Bot } from "../objects/Bot/bot";
import { FightMenu } from "../objects/FightMenu/fight-menu";
import { FightStatBox } from "../objects/FightStatBox/fight-stat-box";
import { HeroHomeLevel } from "./hero-home";
import { BoltonLevel1 } from "./bolton-level1";

export class Fight extends Level { 
  walls: Set<string>; 
  characterName = "";
  enemies?: any[] = undefined;
  party?: MetaHero[] = [];
  selectedFighterIndex = 0;

  fightHasStarted = false;
  isSelectingFighter = false;
  playersPositioned = false;
  botDeployed = false;
  metabotSelected = false;

  partyBots: Sprite[] = [];
  enemyBots: Sprite[] = [];

  fightMenu: FightMenu;

  lastKeyPressedDate = new Date();
  slots: { slotX?: number, slotY?: number, slotWidth?: number, slotHeight?: number, metabot?: MetaBot }[] = [];
  override defaultHeroPosition = new Vector2(0, 35);

  constructor(params: {
    heroPosition: Vector2,
    entryLevel: Level,
    enemies?: any,
    party?: MetaHero[]
  }) {
    super();
    this.name = "Fight"; 
    this.background =  new Sprite(
      0, resources.images["bedroomFloor"], new Vector2(-120, -100), undefined, 1, new Vector2(320, 220)
    );  
    this.walls = new Set<string>(); 
    this.fightMenu = new FightMenu({ entranceLevel:  params.entryLevel, entrancePosition: params.heroPosition})
    this.addChild(this.fightMenu);
    this.fightMenu.showFightMenu = false; 
    if (params.party) {
      this.loadPartyMembers(params);
    }
    if (params.enemies) { 
      this.loadEnemies(params);
    } 
  }

   

  override ready() {
    events.on("FIGHTER_SELECTED", this, () => {
      if (this.party) {
        this.deployBot(this.party[0].metabots[0]);
        this.fightMenu.showFighterSelectionMenu = false;
      }
    });
  }


  override step(delta: number, root: any) {
    const input = root.input;
    if (input?.keys["Space"]) {
       
    } 

    if (storyFlags.flags.has("START_FIGHT") && !this.fightHasStarted && !this.fightMenu.showFightMenu) { 
      this.fightHasStarted = true;
      root.camera.position.x -= 50;
      this.startFightStance();  
      setTimeout(() => {
        if (!this.fightMenu.showFightMenu) {
          input?.pressA();
          setTimeout(() => {
            this.fightMenu.showFighterSelectionMenu = true;
            this.fightMenu.showFightMenu = true;
          }, 100);
        }
      }, 1000); 
    }
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
          const bot1 = new MetaBot(1, this.party[0].id, 1, "Bee", false, new Vector2(1, 1));
          const bot2 = new MetaBot(2, this.party[0].id, 1, "Jaguar", false, new Vector2(1, 1));
          const bot3 = new MetaBot(3, this.party[0].id, 1, "Rhino", false, new Vector2(1, 1));
          this.party[x].metabots = [bot1, bot2, bot3];
          this.fightMenu.metabotChoices = this.party[x].metabots;
        }
        this.addChild(newHero);
      }
    } 
  }

  private loadEnemies(params: { heroPosition?: Vector2 | undefined; entryLevel?: Level | undefined; enemies?: any; party?: MetaHero[] | undefined; }) {
    if (!this.enemies) {
      this.enemies = [];
    }
    const npc = new Npc(0, 0, params.enemies[0].textPortraitFrame, params.enemies[0].type);
    npc.position = new Vector2(-100, 15);
    if (!this.enemies) {
      this.enemies = [];
    }
    this.enemies.push(npc);
    this.addChild(npc);

    const partners = params.enemies[0].partnerNpcs;
    for (let x = 0; x < partners.length; x++) {
      const partner = new Npc(0, 0, params.enemies[x].textPortraitFrame, params.enemies[x].type);
      partner.position = new Vector2(-100 - (x * gridCells(1)), 15 + ((x + 1) * gridCells(1)));
      this.enemies.push(partner);
      this.addChild(partner);
    }
  }

  private startFightStance() {
    if (this.party) {
      for (let x = 0; x < this.party.length; x++) {
        const metaHero = this.party[x];
        const target = this.children.find((child: any) => {
          return child.id === metaHero.id;
        });
        setTimeout(() => {
          target.position = new Vector2(target.position.x - gridCells(2), 15 + (x * (gridCells(1))));
          target.body.animations.play("standRight");
          this.playersPositioned = true;
        }, 2000);
      }
    }
    if (this.enemies) {
      console.log("setting enemies in position");
      for (let x = 0; x < this.enemies.length; x++) {
        this.enemies[x].position.x = gridCells(8) + (x * gridCells(1));
        const child = this.children.find((child: any) => this.enemies && this.enemies[x].position.matches(child.position));
        if (child) {
          console.log("found child");
          child.position = this.enemies[x].position.duplicate();
          setTimeout(() => {
            if (this.enemies) {
              child.body.animations?.play("standLeft");
              console.log("setting animation for child ", child.body.animations);
            }
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
      this.partyBots.push(newBot);
      this.addChild(newBot);

      if (this.partyBots.length == this.party?.length) {
        this.deployEnemyBots();
      }
    }
    const fighterStats = new FightStatBox({ position: new Vector2(-100, 80), bot: metabot });
    this.addChild(fighterStats);
  }

  private deployEnemyBots() {
    console.log("Deploy enemy bots");
    if (this.enemies) {
      for (let x = 0; x < this.enemies.length; x++) {
        if (this.enemies[x].metabots[0]) {
          const metabot = this.enemies[x].metabots[0];
          const newBot = new Sprite(
            0,
            resources.images["botFrame"],
            new Vector2(100, 0),
            undefined,
            undefined,
            new Vector2(32, 32),
            undefined,
            undefined,
            undefined,
            metabot.name
          ); 
          const fighterStats = new FightStatBox({ position: new Vector2(-100, 80), bot: metabot });
          this.addChild(fighterStats);
          console.log(`deployed ${this.enemies[x].name}'s bot'`);
        }
      }
    }
  } 
}
