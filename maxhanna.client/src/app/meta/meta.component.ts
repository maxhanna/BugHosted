import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { MetaHero } from '../../services/datacontracts/meta/meta-hero';
import { Vector2 } from '../../services/datacontracts/meta/vector2';
import { User } from '../../services/datacontracts/user/user';
import { MetaService } from '../../services/meta.service';
import { MetaChat } from '../../services/datacontracts/meta/meta-chat';
import { gridCells, snapToGrid } from './helpers/grid-cells';
import { GameLoop } from './helpers/game-loop';
import { hexToRgb } from './helpers/resources';
import { events } from './helpers/events';
import { storyFlags } from './helpers/story-flags';
import { actionMultiplayerEvents, subscribeToMainGameEvents } from './helpers/network';
import { Hero } from './objects/Hero/hero';
import { Main } from './objects/Main/main';
import { HeroRoomLevel } from './levels/hero-room';
import { Fight } from './levels/fight';
import { CharacterCreate } from './levels/character-create';
import { Level } from './objects/Level/level';
import { CaveLevel1 } from './levels/cave-level1';
import { HeroHome } from './levels/hero-home';
import { BrushLevel1 } from './levels/brush-level1';
import { BrushRoad1 } from './levels/brush-road1';
import { BrushRoad2 } from './levels/brush-road2';
import { RainbowAlleys1 } from './levels/rainbow-alleys1';
import { UndergroundLevel1 } from './levels/underground-level1';
import { MetaEvent } from '../../services/datacontracts/meta/meta-event';
import { InventoryItem } from './objects/InventoryItem/inventory-item';
import { RivalHomeLevel1 } from './levels/rival-home-level1';
import { BrushShop1 } from './levels/brush-shop1';
import { ColorSwap } from '../../services/datacontracts/meta/color-swap';
import { MetaBot } from '../../services/datacontracts/meta/meta-bot';
import { MetaBotPart } from '../../services/datacontracts/meta/meta-bot-part';
import { Mask, getMaskNameById } from './objects/Wardrobe/mask';
import { Bot } from './objects/Bot/bot';
import { Character } from './objects/character';

@Component({
  selector: 'app-meta',
  templateUrl: './meta.component.html',
  styleUrls: ['./meta.component.css']
})

export class MetaComponent extends ChildComponent implements OnInit, OnDestroy {
  @ViewChild('gameCanvas', { static: true }) gameCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chatInput') chatInput!: ElementRef<HTMLInputElement>;
  @ViewChild('colorInput') colorInput!: ElementRef<HTMLInputElement>;

  constructor(private metaService: MetaService) {
    super();
    this.hero = {} as Hero;
    this.metaHero = {} as MetaHero;
    this.mainScene = new Main({ position: new Vector2(0, 0), heroId: this.metaHero.id, metaHero: this.metaHero, hero: this.hero });
    subscribeToMainGameEvents(this);
  }
  canvas!: HTMLCanvasElement;
  ctx!: CanvasRenderingContext2D;
  pollSeconds = 1;
  isUserComponentOpen = false;

  mainScene?: any;
  metaHero: MetaHero;
  hero?: Hero;
  otherHeroes: MetaHero[] = [];
  partyMembers: MetaHero[] = [];
  chat: MetaChat[] = [];
  events: MetaEvent[] = [];
  latestMessagesMap = new Map<string, MetaChat>();
  stopChatScroll = false;
  stopPollingForUpdates = false;
  isDecidingOnParty = false;
  actionBlocker = false;
  blockOpenStartMenu = false;
  isStartMenuOpened = false;
  hideStartButton = false;

  private pollingInterval: any;

  async ngOnInit() {
    this.parentRef?.setViewportScalability(false);
    this.parentRef?.addResizeListener();
    this.canvas = this.gameCanvas.nativeElement;
    this.ctx = this.canvas.getContext("2d")!;
    if (!this.parentRef?.user) {
      this.isUserComponentOpen = true;
    } else {
      this.startLoading();
      this.pollForChanges();
      this.gameLoop.start();
      this.stopLoading();
    }

    window.addEventListener("resize", this.adjustCanvasSize);
    this.adjustCanvasSize();
  }


  ngOnDestroy() {
    clearInterval(this.pollingInterval);
    this.mainScene.destroy();
    this.gameLoop.stop();
    this.remove_me('MetaComponent');
    this.parentRef?.setViewportScalability(true);
    this.parentRef?.removeResizeListener();
  }

  update = async (delta: number) => {
    this.mainScene.stepEntry(delta, this.mainScene);
    this.mainScene.input?.update();
  }
  render = () => {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.mainScene.drawBackground(this.ctx); //Anything that needs to be statically drawn (regardless of camera position) like a sky, goes here, before CTX save/translation
    this.ctx.save(); //Save the current state for camera offset;
    if (this.mainScene.camera) {
      this.ctx.translate(this.mainScene.camera.position?.x ?? 0, this.mainScene.camera.position?.y ?? 0); //Offset by camera position:
    }
    this.mainScene.drawObjects(this.ctx);
    this.ctx.restore(); //Restore to original state 
    this.mainScene.drawForeground(this.ctx); //Draw anything above the game world
  }
  gameLoop = new GameLoop(this.update, this.render);

  async pollForChanges() {
    if (!this.hero?.id && this.parentRef?.user) {
      const rz = await this.metaService.getHero(this.parentRef.user);
      if (rz) {
        await this.reinitializeHero(rz);
      } else {
        this.mainScene.setLevel(new CharacterCreate());
      }
    }

    this.updatePlayers();
    clearInterval(this.pollingInterval);
    this.pollingInterval = setInterval(async () => {
      this.updatePlayers();
    }, this.pollSeconds * 1000);
  }

  private updatePlayers() {
    if (this.metaHero && this.metaHero.id && !this.stopPollingForUpdates) {
      this.metaService.fetchGameData(this.metaHero).then(res => {
        if (res) {
          this.updateOtherHeroesBasedOnFetchedData(res);
          this.updateMissingOrNewHeroSprites();
          this.updateEnemyEncounters(res);

          if (this.chat) {
            this.getLatestMessages();
          }
          if (res.events) {
            actionMultiplayerEvents(this, res.events);
          }
        }
      });
    }
  }

  private updateOtherHeroesBasedOnFetchedData(res: { map: number; position: Vector2; heroes: MetaHero[]; }) {
    if (!res || !res.heroes) {
      this.otherHeroes = [];
      return;
    }
    this.otherHeroes = res.heroes;
    for (let x = 0; x < this.otherHeroes.length; x++) {
      const bots = this.otherHeroes[x].metabots;
      for (let y = 0; y < bots.length; y++) {
        const tgt = this.mainScene.level.children.find((x: Character) => x.id == bots[y].id);
        if (tgt) {
          tgt.hp = bots[y].hp;
          tgt.level = bots[y].level;
          tgt.exp = bots[y].exp;
          tgt.isDeployed = bots[y].isDeployed;
        }
      }
    }
  }
  private updateEnemyEncounters(res: any) {
    const enemies = res.enemyBots as MetaBot[];
    if (enemies) {
      enemies.forEach(enemy => {
        //look for enemy on the map, if he doesnt exist, create him.
        const tgtEnemy = this.mainScene.level.children.find((x: Bot) => x.heroId == enemy.heroId && x.isDeployed);
        if (tgtEnemy) {
          tgtEnemy.hp = enemy.hp;
        } else {
          const tgtEncounter = this.mainScene.level.children.find((x: Character) => x.id == enemy.heroId);
          if (tgtEncounter) {
            let tmp = new Bot({
              botType: enemy.type,
              name: enemy.name ?? "botFrame",
              spriteName: enemy.name ?? "botFrame",
              colorSwap: (tgtEncounter.color ? new ColorSwap([0, 160, 200], hexToRgb(tgtEncounter.color)) : undefined),
              isDeployed: true,
              isEnemy: true,
              position: tgtEncounter.position.duplicate(),
              level: enemy.level,
              hp: enemy.hp,
              id: enemy.id,
              heroId: enemy.heroId,
              leftArm: enemy.leftArm,
              rightArm: enemy.rightArm,
              head: enemy.head,
              legs: enemy.legs,
              isSolid: true,
            });
            if (tmp.hp) { 
              this.mainScene.level.addChild(tmp);
            }
          }
        }
      })
    }
  }
  private updateMissingOrNewHeroSprites() {
    let ids: number[] = [];
    for (const hero of this.otherHeroes) {
      let existingHero = this.mainScene.level?.children.find((x: any) => x.id === hero.id) as Character | undefined;
      if (!storyFlags.flags.has("START_FIGHT") || this.partyMembers.find(x => x.id === hero.id)) {
        if (existingHero) {
          this.setUpdatedHeroPosition(existingHero, hero);

          if (hero.mask === 0 && existingHero.mask) {
            //remove mask
            existingHero.destroy();
            this.addHeroToScene(hero);
          }
          else if (hero.mask && hero.mask != 0 && !existingHero.mask) {
            //put on mask
            existingHero.destroy();
            this.addHeroToScene(hero);
          }
          else if (hero.mask && hero.mask != 0 && existingHero.mask && getMaskNameById(hero.mask).toLowerCase() != existingHero.mask.name?.toLowerCase()) {
            //put on mask
            existingHero.destroy();
            this.addHeroToScene(hero);
            //console.log(`destroying fresh mask ${getMaskNameById(hero.mask).toLowerCase()} - ${existingHero.mask } `);
          }
        }
        else {
          existingHero = this.addHeroToScene(hero);
        }
        this.setHeroLatestMessage(existingHero);
      }
      ids.push(hero.id);
    }
    this.destroyExtraChildren(ids);
  }

  private destroyExtraChildren(ids: number[]) {
    if (ids.length > 0) {
      this.mainScene.level?.children.forEach((x: any) => {
        if (x instanceof Hero && !ids.includes(x.id)) {
          x.destroy();
        }
      });
    }
  }

  private addHeroToScene(hero: MetaHero) {
    //  console.log("adding hero to scene: " + hero.name);
    const tmpHero = new Hero({
      id: hero.id,
      name: hero.name ?? "Anon",
      position: new Vector2(hero.id == this.metaHero.id ? this.metaHero.position.x : hero.position.x, hero.id == this.metaHero.id ? this.metaHero.position.y : hero.position.y),
      colorSwap: (hero.color ? new ColorSwap([0, 160, 200], hexToRgb(hero.color)) : undefined),
      speed: hero.speed,
      mask: hero.mask ? new Mask(getMaskNameById(hero.mask)) : undefined,
      metabots: hero.metabots,
    });
    tmpHero.lastPosition = tmpHero.position.duplicate();
    tmpHero.destinationPosition = tmpHero.lastPosition.duplicate();
    if (hero.id === this.metaHero.id) {
      tmpHero.isUserControlled = true;
      this.hero = tmpHero;
    }

    this.mainScene.level?.addChild(tmpHero);

    for (let i = 0; i < hero.metabots.length; i++) {
      if (hero.metabots[i].isDeployed == true) {
        console.log("deploying " + hero.metabots[i].name);
        this.addBotToScene(hero, hero.metabots[i]);
        break;
      }
    }

    return tmpHero;
  }

  private addBotToScene(metaHero: MetaHero, bot: MetaBot) {
    if (this.mainScene.level?.children.some((x: any) => x.id === bot.id)) { return; }

    //console.log("addBotToScene ! ", bot, metaHero);
    if (metaHero && metaHero.metabots && metaHero.metabots.length > 0) {
      let tgtBot = metaHero.metabots.find(x => x.id === bot.id);
      if (tgtBot) {
        tgtBot.isDeployed = true;
      }
    }

    const tmpBot = new Bot({
      id: bot.id,
      heroId: metaHero.id,
      botType: bot.type,
      name: bot.name ?? "Bot",
      spriteName: "botFrame",
      position: new Vector2(metaHero.position.x + gridCells(1), metaHero.position.y + gridCells(1)),
      colorSwap: (metaHero.color ? new ColorSwap([0, 160, 200], hexToRgb(metaHero.color)) : undefined),
      isDeployed: true,
      isEnemy: true,
      hp: bot.hp,
      level: bot.level,
      exp: bot.exp,
      leftArm: bot.leftArm,
      rightArm: bot.rightArm,
      head: bot.head,
      legs: bot.legs,
    });
    const existingBots = this.mainScene.level?.children?.filter((x: any) => x.heroId === metaHero.id && x.isDeployed);
    existingBots.forEach((x: any) => x.destroy());
    this.mainScene.level?.addChild(tmpBot);
    return tmpBot;
  }

  private setUpdatedHeroPosition(existingHero: any, hero: MetaHero) {
    if (existingHero.id != this.metaHero.id) {
      const newPos = new Vector2(hero.position.x, hero.position.y);
      if (!existingHero.destinationPosition.matches(newPos)) {
        existingHero.destinationPosition = newPos;
      }
    }
    else {
      this.metaHero.position = new Vector2(existingHero.position.x, existingHero.position.y).duplicate();
    }
  }

  private setHeroLatestMessage(existingHero: any) {
    const latestMsg = this.latestMessagesMap.get(existingHero.name);
    if (latestMsg) {
      existingHero.latestMessage = latestMsg.content;
    } else {
      existingHero.latestMessage = "";
    }
  }


  private async reinitializeHero(rz: MetaHero, skipDataFetch?: boolean) {
    this.hero = new Hero({
      id: rz.id, name: rz.name ?? "Anon",
      position: new Vector2(snapToGrid(rz.position.x, 16), snapToGrid(rz.position.y, 16)),
      isUserControlled: true,
      speed: rz.speed,
      mask: rz.mask ? new Mask(getMaskNameById(rz.mask)) : undefined,
      metabots: rz.metabots,
    });
    this.metaHero = new MetaHero(this.hero.id, (this.hero.name ?? "Anon"),
      this.hero.position.duplicate(),
      rz.speed,
      rz.map,
      rz.metabots,
      rz.color,
      rz.mask);
    this.mainScene.setHeroId(this.metaHero.id);
    this.mainScene.hero = this.hero;
    this.mainScene.metaHero = this.metaHero;
    storyFlags.flags = new Map<string, boolean>();

    if (!!skipDataFetch == false) {
      await this.reinitializeInventoryData();
    }

    const levelKey = rz.map.toUpperCase();
    const level = this.getLevelFromLevelName(rz.map);

    if (level) {
      this.mainScene.setLevel(level);
    }

    setTimeout(() => {
      if (this.metaHero.metabots) {
        for (let i = 0; i < this.metaHero.metabots.length; i++) {
          if (this.metaHero.metabots[i].isDeployed == true) {
            this.addBotToScene(this.metaHero, this.metaHero.metabots[i]);
            break;
          }
        }
      }
    }, 500);

    this.mainScene.camera.centerPositionOnTarget(this.metaHero.position);
  }

  private async reinitializeInventoryData() {
    console.log("reinit inventory data");
    if (this.mainScene?.inventory?.items) {
      this.mainScene.inventory.items.forEach((item: any) => this.mainScene.inventory.removeFromInventory(item.id));
    }  
    await this.metaService.fetchInventoryData(this.metaHero).then(inventoryData => {
      if (inventoryData) {
        const inventoryItems = inventoryData.inventory as InventoryItem[];
        const metabotParts = inventoryData.parts as MetaBotPart[];

        this.mainScene.inventory.parts = metabotParts;
        for (let item of inventoryItems) {
          let invItem = {
            image: item.image,
            name: item.name,
            id: item.id,
            category: item.category,
          } as InventoryItem;
          if (item.category === "botFrame") {
            const bot = this.mainScene?.level?.children?.find((x: Bot) => x.heroId == this.metaHero.id && x.name === invItem.name);
            const metaBot = this.metaHero.metabots.find(bot => bot.name === invItem.name);
            if (bot && metaBot) { 
              metaBot.hp = bot.hp;
              metaBot.level = bot.level;
              metaBot.isDeployed = bot.isDeployed;
              metaBot.exp = bot.exp;
            }

            invItem.stats = JSON.stringify(this.metaHero.metabots.find(bot => bot.name === invItem.name));
          }
          events.emit("INVENTORY_UPDATED", invItem);
        }
      }
    });
  }

  private getLevelFromLevelName(key: string): Level {
    const upperKey = key.toUpperCase();
    const itemsFoundNames = this.mainScene?.inventory.getItemsFound();

    if (upperKey == "HEROROOM") return new HeroRoomLevel({ itemsFound: itemsFoundNames });
    else if (upperKey == "CAVELEVEL1") return new CaveLevel1({ itemsFound: itemsFoundNames });
    else if (upperKey == "HEROHOME") return new HeroHome({ itemsFound: itemsFoundNames });
    else if (upperKey == "RIVALHOMELEVEL1") return new RivalHomeLevel1({ itemsFound: itemsFoundNames });
    else if (upperKey == "BRUSHLEVEL1") return new BrushLevel1({ itemsFound: itemsFoundNames });
    else if (upperKey == "BRUSHROAD1") return new BrushRoad1({ itemsFound: itemsFoundNames });
    else if (upperKey == "BRUSHROAD2") return new BrushRoad2({ itemsFound: itemsFoundNames });
    else if (upperKey == "RAINBOWALLEYS1") return new RainbowAlleys1({ itemsFound: itemsFoundNames });
    else if (upperKey == "UNDERGROUNDLEVEL1") return new UndergroundLevel1({ itemsFound: itemsFoundNames });
    else if (upperKey == "BRUSHSHOP1") return new BrushShop1({ itemsFound: itemsFoundNames });
    else if (upperKey == "FIGHT") return new Fight(
      {
        metaHero: this.metaHero,
        parts: this.mainScene?.inventory.parts.filter((x: any) => x.metabotId),
        entryLevel: (this.metaHero.map == "FIGHT" ? new BrushLevel1({ itemsFound: itemsFoundNames }) : this.getLevelFromLevelName(this.metaHero.map)),
        enemies: undefined,
        party: [this.metaHero],
        itemsFound: itemsFoundNames
      }
    );
    return new HeroRoomLevel();
  }

  private getLatestMessages() {
    this.latestMessagesMap.clear();
    const twentySecondsAgo = new Date(Date.now() - 20000);

    this.chat.forEach((message: MetaChat) => {
      const timestampDate = message.timestamp ? new Date(message.timestamp) : undefined;

      if (timestampDate && timestampDate > twentySecondsAgo) {
        const existingMessage = this.latestMessagesMap.get(message.hero);

        if (!existingMessage || (existingMessage && existingMessage.timestamp && new Date(existingMessage.timestamp) < timestampDate)) {
          this.latestMessagesMap.set(message.hero, message);
        }
      }
    });
  }


  lockMovementForChat() {
    if (document.activeElement != this.chatInput.nativeElement) {
      events.emit("HERO_MOVEMENT_UNLOCK");
    } else if (document.activeElement == this.chatInput.nativeElement) {
      events.emit("HERO_MOVEMENT_LOCK");
    }
  }
  async changeColor() {
    this.metaHero.color = this.colorInput.nativeElement.value;
    this.colorInput.nativeElement.style.display = "none";
    this.parentRef?.closeModal();
    await this.reinitializeHero(this.metaHero);
    events.emit("HERO_MOVEMENT_UNLOCK");
  }
  private adjustCanvasSize = () => {
    const containers = document.querySelectorAll('.componentContainer');
    containers.forEach((container: any) => {
      container.style.height = '100vh';
    });
     
  };

  goFullScreen() {
    this.canvas.requestFullscreen(); // having a hard time getting controls to appear ontop of canvas.
  }
  exitFullScreen() {
    document.exitFullscreen();
  }
  closeUserComponent(user: User) {
    this.isUserComponentOpen = false;
    if (this.parentRef) {
      this.ngOnInit();
    }
  }
}
