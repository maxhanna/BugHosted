import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { storyFlags, Scenario, CHARACTER_CREATE_STORY_TEXT_1, CHARACTER_CREATE_STORY_TEXT_2, CHARACTER_CREATE_STORY_TEXT_3, CHARACTER_CREATE_STORY_TEXT_4, CHARACTER_CREATE_STORY_TEXT_5, CHARACTER_CREATE_STORY_TEXT_6 } from "../helpers/story-flags";
import { Exit } from "../objects/Environment/Exit/exit";
import { Level } from "../objects/Level/level";
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
import { HeroHome } from "./hero-home";
import { BrushLevel1 } from "./brush-level1";
import { MetaBotPart } from "../../../services/datacontracts/meta/meta-bot-part";
import { SpriteTextString } from "../objects/SpriteTextString/sprite-text-string";

export class Fight extends Level {
  characterName = "";
  enemies?: Npc[] = undefined;
  party?: MetaHero[] = [];
  leaveFightFlag = false;
  fightHasStarted = false;
  isSelectingFighter = false;
  playersPositioned = false;
  botDeployed = false;
  metabotSelected = false;

  deployedPartyBots = 0;
  partySelectedSkills: Record<number, string> = [];

  fightMenu: FightMenu;

  override defaultHeroPosition = new Vector2(0, gridCells(2));

  constructor(params: {
    heroPosition: Vector2,
    entryLevel: Level,
    enemies?: Npc[],
    party?: MetaHero[],
    itemsFound?: string[] | undefined
  }) {
    super();
    this.name = "Fight";
    this.background = new Sprite(
      { resource: resources.images["bedroomFloor"], position: new Vector2(-120, -100), frameSize: new Vector2(320, 220) }
    );
    this.walls = new Set<string>();
    this.fightMenu = new FightMenu({ entranceLevel: params.entryLevel, entrancePosition: params.heroPosition, itemsFound: params.itemsFound })
    this.addChild(this.fightMenu);
    this.fightMenu.showFightMenu = false;
    if (params.party) {
      this.loadPartyMembers(params);
    }
    if (params.enemies) {
      this.loadEnemies(params.enemies);
    } else {
      this.leaveFightFlag = true;
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
    // const input = root.input;

    if (storyFlags.flags.has("START_FIGHT") && !this.fightHasStarted && !this.fightMenu.showFightMenu) {
      this.setupNewFight(root);
    }

    if (this.fightMenu.showWaitingForOthers) {
      if (Object.keys(this.partySelectedSkills).length == this.party?.length) {
        this.performAttackPhase();
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
        const newHero = new Hero({ position: new Vector2(gridCells(-4) + (x * gridCells(1)), gridCells(2) + (x * gridCells(1))) });
        newHero.name = metaHero.name ?? "Anon";
        newHero.id = metaHero.id;
        newHero.metabots = metaHero.metabots;
        this.party[x].metabots = metaHero.metabots;
        this.fightMenu.metabotChoices = this.party[x].metabots;

        this.addChild(newHero);
      }
    }
  }
  private loadEnemies(enemies?: Npc[]) {
    console.log("loading enemies : " + enemies?.length);
    this.enemies = enemies;
    let tmpEnemies = [];
    if (this.enemies) {
      for (let x = 0; x < this.enemies.length; x++) {
        tmpEnemies.push(this.enemies[x]);
        const spriteBody = this.enemies[x].body;
        if (spriteBody) {
          const newPosition = new Vector2(gridCells(10) - gridCells(2 * x), gridCells(2) + gridCells(x));
          spriteBody.position = newPosition;
          const tmpNpc = new Sprite({
            objectId: -11245 + x, resource: spriteBody.resource!, position: newPosition, scale: spriteBody.scale, frame: spriteBody.frame, frameSize: spriteBody.frameSize,
            hFrames: spriteBody.hFrames, vFrames: spriteBody.vFrames, animations: spriteBody.animations, name: spriteBody.name
          });
          this.addChild(tmpNpc);
        }
        for (let y = 0; y < this.enemies[x].partnerNpcs.length; y++) {
          tmpEnemies.push(this.enemies[x].partnerNpcs[y]);
          const spriteBody2 = this.enemies[x].partnerNpcs[y].body;
          if (spriteBody2) {
            const newPosition2 = new Vector2(gridCells(10) - gridCells(2 * x) - gridCells(y) - gridCells(2), gridCells(1) + gridCells(x) + gridCells(y));
            spriteBody2.position = newPosition2;
            const tmpNpc2 = new Sprite({
              objectId: -12245 + x, resource: spriteBody2.resource!, position: newPosition2, scale: spriteBody2.scale, frame: spriteBody2.frame, frameSize: spriteBody2.frameSize,
              hFrames: spriteBody2.hFrames, vFrames: spriteBody2.vFrames, animations: spriteBody2.animations, name: spriteBody2.name
            });
            this.addChild(tmpNpc2);
          }
        }
      }
      this.enemies = tmpEnemies;
    }
  }
  private performAttackPhase() {
    this.fightMenu.showWaitingForOthers = false;
    this.fightMenu.showFightMenuOptions = true;
    console.log("performing attacks: ", this.partySelectedSkills);

    if (this.party) {
      for (let attackingHero of Object.keys(this.partySelectedSkills)) {
        const attackingHeroId = parseInt(attackingHero);
        const attackingHeroSkill = this.partySelectedSkills[attackingHeroId];
        const player = this.party.find(x => x.id === attackingHeroId);
        const attackingBot = player?.metabots[0];
        this.calculateAndApplyDamage(attackingBot, attackingHeroSkill);
      }
      this.partySelectedSkills = [];
      this.performEnemyAttacks();
    }
  }
  private calculateAndApplyDamage(attackingBot: MetaBot | undefined, attackingHeroSkill: string) {
    if (attackingBot && attackingBot.hp > 0) {
      console.log(attackingHeroSkill);
      const botParts = ["leftArm", "rightArm", "legs", "head"];
      let attackingPart = undefined;
      let appliedDamage = false;
      for (let part of botParts) {
        const attackingPart = (attackingBot[part as keyof MetaBot] as MetaBotPart);
        if (attackingPart?.skill === attackingHeroSkill) {
          console.log(attackingPart?.damageMod);
          if (this.enemies) {
            for (let enemy of this.enemies) {
              enemy.metabots[0].hp -= attackingPart.damageMod;
            }
          }
        } else { //NO PART ATTACHED, USING BASE DAMAGE OF 1
          if (this.enemies) {
            for (let enemy of this.enemies) {
              enemy.metabots[0].hp -= 1;
            }
          }
        }
      }
    }
  }

  private performEnemyAttacks() {
    if (this.enemies) {
      for (let attackingEnemy of this.enemies) {
        const enemyBot = attackingEnemy.metabots[0];
        if (enemyBot.hp > 0) {
          const botParts = ["leftArm", "rightArm", "legs", "head"];
          const randomPart = botParts[Math.floor(Math.random() * botParts.length)];
          const randomBotPart = enemyBot?.[randomPart as keyof MetaBot] as MetaBotPart;
          if (randomBotPart && this.party) {
            for (let member of this.party) {
              member.metabots[0].hp -= randomBotPart.damageMod;
              if (member.metabots[0].hp <= 0) {
                member.metabots[0].isDeployed = false;
                this.botDeployed = false;
                console.log(`${member.metabots[0].name} died.`);
              }
            }
          }
        }
      }
    }
    this.performEndOfAttackChecks();
  }

  performEndOfAttackChecks() {
    //check who died
    if (this.enemies) {
      for (let x = 0; x < this.enemies.length; x++) {
        if (this.enemies[x].metabots[0].hp <= 0) {
          this.removeBotFromFight(this.enemies[x].metabots[0]);
          this.awardExpToPlayers(this.enemies[x].metabots[0]);
          this.deployEnemyBots();
        }
      }
    }
    if (this.party) {
      for (let x = 0; x < this.party.length; x++) {
        if (this.party[x].metabots[0].hp <= 0) {
          this.removeBotFromFight(this.party[x].metabots[0]); 
        }
      }
    }
    //leave fight if no bots left to fight
    if (this.leaveFightFlag) {
      this.fightMenu.leaveFight();
    }
  }
  private removeBotFromFight(metabot: MetaBot) {
    metabot.isDeployed = false;
    for (let c of this.children) {
      if (c.objectId === metabot.id) {
        this.removeChild(c); 
      }
      if (c.metabot?.id == metabot.id) {
        this.removeChild(c); 
      } 
    }
  }

  private awardExpToPlayers(enemyMetabot: MetaBot) {
    if (!enemyMetabot.hasAwardedExp) {
      console.log("awarding exp " + enemyMetabot.level)
      if (this.party) {
        for (let player of this.party) {
          for (let bot of player.metabots) {
            if (bot.isDeployed) {
              bot.exp += enemyMetabot.level; // Add experience from the enemy metabot
              if (!bot.expForNextLevel) {
                this.calculateExpForNextLevel(bot);
              } 
              // Check if the bot's experience exceeds the experience needed for the next level
              while (bot.exp >= bot.expForNextLevel) {
                bot.exp -= bot.expForNextLevel; // Subtract the required experience for leveling up
                bot.level++;
                this.calculateExpForNextLevel(bot);
              }
              for (let c of this.children) {
                if (c.metabot?.id == bot.id) {
                  const lvlString = " Lvl " + bot.level;
                  const newStr = new SpriteTextString(bot.name ? bot.name + lvlString : "Bot" + lvlString, new Vector2(-15, -5));
                  c.removeChild(c.botNameSprite);
                  c.botNameSprite = newStr;
                  c.addChild(c.botNameSprite); 
                }
              }
            }
          }
        }
      }
      enemyMetabot.hasAwardedExp = true;
    }
  }
  private calculateExpForNextLevel(bot: MetaBot) {
    bot.expForNextLevel = (bot.level + 1) * 15;
  }

  private startFightStance() { 
    if (this.party) {
      for (let x = 0; x < this.party.length; x++) {
        const metaHero = this.party[x];
        const target = this.children.find((child: any) => {
          return child.id === metaHero.id;
        });
        setTimeout(() => {
          if (target) {
            target.body.animations.play("standRight");
            target.facingDirection = "RIGHT";
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
          }, 1000);
        }
      }
    }
  }


  private deployBot(metabot: MetaBot) { 
    if (this.botDeployed && this.party) {
      const member = this.party.find(x => x.id == metabot.heroId);
      if (member) { 
        this.removeBotFromFight(member.metabots[0]);
        this.botDeployed = false;
      }
    }

    if (!this.botDeployed && metabot && metabot.hp > 0) {
      metabot.isDeployed = true;
      this.botDeployed = true;
      this.isSelectingFighter = false;
      const newBot = new Sprite(
        {
          objectId: metabot.id,
          resource: resources.images["botFrame"],
          position: metabot.position,
          frameSize: new Vector2(32, 32)
        }
      );
      this.addChild(newBot);
      if (!metabot.expForNextLevel) {
        this.calculateExpForNextLevel(metabot);
      }
      const fighterStats = new FightStatBox({ position: new Vector2(-100, 50), bot: metabot, showExp: true });
      this.addChild(fighterStats);
    }

    this.deployedPartyBots++;
    const countPartyWithLivingMetabot = this.party?.filter(
      (member: MetaHero) => member.metabots.some((metabot: MetaBot) => metabot.hp > 0)
    ).length;
    if (this.deployedPartyBots == countPartyWithLivingMetabot) {
      this.deployEnemyBots();
    }
  }
  private deployEnemyBots() {
    let deployedBotCount = 0; // Track total deployed bots across all enemies

    if (this.enemies) {
      for (let x = 0; x < this.enemies.length; x++) {
        const enemy = this.enemies[x];
        let enemyDeployedCount = 0; // Track deployed bots for the current enemy

        for (let y = 0; y < enemy.metabots.length; y++) {
          const metabot = enemy.metabots[y];
          if (metabot.hp > 0 && metabot.isDeployed) {
            enemyDeployedCount++;
            deployedBotCount++;
          }
          // Check if metabot has HP and is not already deployed
          if (metabot.hp > 0 && !metabot.isDeployed && enemyDeployedCount == 0) {
            // Deploy the metabot
            enemyDeployedCount++;
            metabot.isDeployed = true;
            metabot.position = new Vector2(gridCells(7) - gridCells(x), gridCells(x));

            const newBot = new Sprite(
              {
                objectId: metabot.id,
                resource: resources.images["botFrame"],
                position: metabot.position,
                frameSize: new Vector2(32, 32),
                name: metabot.name
              }
            );

            this.addChild(newBot);

            const fighterStats = new FightStatBox({ position: new Vector2(110 - (x * 102.4), -65), bot: metabot, showExp: false });
            this.addChild(fighterStats);

            deployedBotCount++; 
          }
        }

        // If no bots were deployed for this enemy, we can log it or take other actions if necessary
        if (enemyDeployedCount === 0) {
          console.log(`No bots deployed for ${enemy.type}`);
        }
      }
    }

    // Handle end-game scenario if no bots are deployed
    if (deployedBotCount === 0) {
      console.log("No bots left to deploy, ending the match.");
      this.leaveFightFlag = true;
    }
  }
}
