import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { MetaHero } from '../../services/datacontracts/meta/meta-hero';
import { Vector2 } from '../../services/datacontracts/meta/vector2';
import { User } from '../../services/datacontracts/user/user';
import { MetaService } from '../../services/meta.service';
import { MetaChat } from '../../services/datacontracts/meta/meta-chat';
import { gridCells, snapToGrid } from './helpers/grid-cells';
import { GameLoop } from './helpers/game-loop';
import { hexToRgb, resources } from './helpers/resources';
import { events } from './helpers/events';
import { GOT_FIRST_METABOT, GOT_WATCH, storyFlags } from './helpers/story-flags';
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
import { Npc } from './objects/Npc/npc';
import { InventoryItem } from './objects/InventoryItem/inventory-item';
import { RivalHomeLevel1 } from './levels/rival-home-level1';
import { BrushShop1 } from './levels/brush-shop1';
import { ShopMenu } from './objects/Menu/shop-menu';
import { WardrobeMenu } from './objects/Menu/wardrobe-menu';
import { ColorSwap } from '../../services/datacontracts/meta/color-swap';
import { MetaBot } from '../../services/datacontracts/meta/meta-bot';
import { GameObject } from './objects/game-object';
import { HEAD, LEFT_ARM, LEGS, MetaBotPart, RIGHT_ARM } from '../../services/datacontracts/meta/meta-bot-part';
import { Skill, HEADBUTT, LEFT_PUNCH, RIGHT_PUNCH } from './helpers/skill-types';
import { Mask, getMaskNameById } from './objects/Wardrobe/mask';
import { Bot } from './objects/Bot/bot';

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
    this.mainScene = new Main({ position: new Vector2(0, 0), heroId: this.metaHero.id, metaHero: this.metaHero });
    this.subscribeToMainGameEvents();
    this.parentRef?.setViewportScalability(false);
  }
  canvas!: HTMLCanvasElement;
  ctx!: CanvasRenderingContext2D;
  pollSeconds = 1;
  isUserComponentOpen = false;

  mainScene: Main;
  metaHero: MetaHero;
  hero: Hero;
  otherHeroes: MetaHero[] = [];
  partyMembers: MetaHero[] = [];
  chat: MetaChat[] = [];
  events: MetaEvent[] = [];
  latestMessagesMap = new Map<string, MetaChat>();
  stopChatScroll = false;
  stopPollingForUpdates = false;
  isDecidingOnParty = false;
  actionBlocker = false;
  isStartMenuOpened: boolean = false;

  private pollingInterval: any;


  ngOnDestroy() {
    clearInterval(this.pollingInterval);
    this.mainScene.destroy();
    this.gameLoop.stop();
    this.remove_me('MetaComponent');
    this.parentRef?.setViewportScalability(true);
  }

  async ngOnInit() {
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
    if (!this.hero.id && this.parentRef?.user) {
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

          if (this.chat) {
            this.getLatestMessages();
          }
          if (res.events) {
            this.actionMultiplayerEvents(res.events);
          }
        }
      });
    }
  }

  private updateOtherHeroesBasedOnFetchedData(res: { map: number; position: Vector2; heroes: MetaHero[]; chat: MetaChat[]; }) {
    if (!res || !res.heroes) {
      this.otherHeroes = [];
      return;
    }
    this.otherHeroes = res.heroes;
  }
  private updateMissingOrNewHeroSprites() {
    let ids: number[] = [];
    for (const hero of this.otherHeroes) {
      let existingHero = this.mainScene.level?.children.find((x: any) => x.id === hero.id) as Hero | undefined;
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
            console.log(`destroying fresh mask ${getMaskNameById(hero.mask).toLowerCase()} - ${existingHero.mask } `);
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
    const tmpHero = new Hero({
      id: hero.id,
      name: hero.name ?? "Anon",
      position: new Vector2(hero.id == this.metaHero.id ? this.metaHero.position.x : hero.position.x, hero.id == this.metaHero.id ? this.metaHero.position.y : hero.position.y),
      colorSwap: (hero.color ? new ColorSwap([0, 160, 200], hexToRgb(hero.color)) : undefined),
      speed: hero.speed,
      mask: hero.mask ? new Mask(getMaskNameById(hero.mask)) : undefined,
    });
    tmpHero.lastPosition = tmpHero.position.duplicate();
    tmpHero.destinationPosition = tmpHero.lastPosition.duplicate();
    if (hero.id === this.metaHero.id) {
      tmpHero.isUserControlled = true;
      this.hero = tmpHero;
    }
    this.mainScene.level?.addChild(tmpHero);
    return tmpHero;
  }

  private addBotToScene(hero: MetaHero, bot: MetaBot) { 
    const tmpBot = new Bot({
      id: bot.id,
      heroId: bot.heroId,
      botType: bot.type,
      name: bot.name ?? "Anon",
      spriteName: "botFrame",
      position: new Vector2(hero.position.x + gridCells(1), hero.position.y + gridCells(1)),
      colorSwap: (hero.color ? new ColorSwap([0, 160, 200], hexToRgb(hero.color)) : undefined),
      isDeployed: true,
    }); 
    console.log("depployed bot! ", tmpBot);
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

  private actionMultiplayerEvents(metaEvents: MetaEvent[]) {
    const currentEvents = this.events;
    if (metaEvents.length > 0) {
      for (let event of metaEvents) {
        const existingEvent = currentEvents.find(e => e.id == event.id);
        if (!existingEvent) {
          //do something with this fresh event.
          if (event.event === "PARTY_UP" && event.data && event.data["hero_id"] == `${this.metaHero.id}` && !this.isDecidingOnParty) {
            this.actionPartyUpEvent(event);
          }
          if (event.event === "PARTY_INVITE_ACCEPTED" && event.heroId != this.metaHero.id) {
            this.actionPartyInviteAcceptedEvent(event);
          }
          if (event.event === "START_FIGHT" && event.heroId != this.metaHero.id && !storyFlags.flags.has("START_FIGHT")) {
            this.actionStartFightEvent(event);
          }
          if (event.event === "USER_ATTACK_SELECTED") {
            const player = this.partyMembers.find(x => x.id === event.heroId);
            if (player || event.heroId === this.metaHero.id) {
              events.emit("SKILL_USED", { heroId: event.heroId, skill: (event.data ? JSON.parse(event.data["skill"]) as Skill : HEADBUTT) })
            }
          }
          if (event.event === "BUY_ITEM") {
            const player = this.partyMembers.find(x => x.id === event.heroId);
            if (player || event.heroId === this.metaHero.id) {
              events.emit("BUY_ITEM_CONFIRMED", { heroId: event.heroId, item: (event.data ? event.data["item"] : "") })
              this.metaService.deleteEvent(event.id);
            }
          }
          if (event.event === "CHAT" && event.data) {
            const name = event.data["sender"] ?? "Anon";
            this.chat.unshift(
              {
                hero: event.data["sender"] ?? "Anon",
                content: event.data["content"] ?? "",
                timestamp: new Date()
              } as MetaChat);
            this.setHeroLatestMessage(this.otherHeroes.find(x => x.name === name))
          }
        }
      }
    }
    this.events = metaEvents;
  }


  private async reinitializeHero(rz: MetaHero, skipDataFetch?: boolean) {
    if (this.mainScene.level) {
      this.mainScene.inventory.items.forEach((item: any) => this.mainScene.inventory.removeFromInventory(item.id));
    }
    this.hero = new Hero({
      id: rz.id, name: rz.name ?? "Anon", position: new Vector2(snapToGrid(rz.position.x, 16), snapToGrid(rz.position.y, 16)),
      isUserControlled: true, speed: rz.speed, mask: rz.mask ? new Mask(getMaskNameById(rz.mask)) : undefined
    }); 
    this.metaHero = new MetaHero(this.hero.id, this.hero.name, this.hero.position.duplicate(), rz.speed, rz.map, rz.metabots, rz.color, rz.mask);
    this.mainScene.setHeroId(this.metaHero.id);

    if (!!skipDataFetch == false) {
      await this.reinitializeInventoryData();
    }

    const levelKey = rz.map.toUpperCase();
    const level = this.getLevelFromLevelName(rz.map);

    if (level) {
      this.mainScene.setLevel(level);
    }

    this.mainScene.camera.centerPositionOnTarget(this.metaHero.position);
  }

  private async reinitializeInventoryData() {
    storyFlags.flags = new Map<string, boolean>();
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
            invItem.stats = JSON.stringify(this.metaHero.metabots.find(bot => bot.name === invItem.name));
          }
          events.emit("INVENTORY_UPDATED", invItem);
        }
      }
    });
  }

  private getLevelFromLevelName(key: string): Level {
    const upperKey = key.toUpperCase();
    const itemsFoundNames = this.mainScene.inventory.getItemsFound();

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
        parts: this.mainScene.inventory.parts.filter(x => x.metabotId),
        entryLevel: (this.metaHero.map == "FIGHT" ? new BrushLevel1({ itemsFound: itemsFoundNames }) : this.getLevelFromLevelName(this.metaHero.map)),
        enemies: undefined,
        party: [this.metaHero],
        itemsFound: itemsFoundNames
      }
    );
    return new HeroRoomLevel();
  }


  private subscribeToMainGameEvents() {
    events.on("CHANGE_LEVEL", this.mainScene, (level: Level) => {
      this.otherHeroes = [];
      if (!this.hero.id) {
        this.pollForChanges();
      }
      if (this.mainScene && this.mainScene.level) {
        if (level.name != "Fight") {
          this.metaHero.map = level.name;
          this.metaHero.position = level.getDefaultHeroPosition();
        } else {
          let i = 0;
          for (let pM of this.partyMembers) { //what is this?
            const hero = this.mainScene.level.children.filter((x: any) => x.objectId == pM.id) as Hero;
            hero.position = level.getDefaultHeroPosition();
            hero.position.y = hero.position.y + gridCells(i);
            i++;
            pM.position = hero.position.duplicate();
            const otherHero = this.otherHeroes.find(x => x.id === pM.id);
            if (otherHero) {
              otherHero.position = pM.position.duplicate();
            }
          }//end of what is this
        }

        this.mainScene.level.itemsFound = this.mainScene.inventory.getItemsFound();
      }
    });
    events.on("WARDROBE_OPENED", this, () => {
      if (this.actionBlocker) return;

      const invItems = this.mainScene.inventory.items;
      if (this.mainScene.level) {
        console.log(this.mainScene.level);
        this.mainScene.setLevel(new WardrobeMenu({ entranceLevel: this.getLevelFromLevelName(this.mainScene.level.name), heroPosition: this.metaHero.position, inventoryItems: invItems, hero: this.metaHero }));
      }
      this.stopPollingForUpdates = true;
      this.setActionBlocker(50);
    });

    events.on("MASK_EQUIPPED", this, (params: { maskId: number }) => {
      this.metaHero.mask = params.maskId === 0 ? undefined : params.maskId;
      let existingHero = this.mainScene.level?.children.find((x: any) => x.id === this.metaHero.id);
      if (existingHero) {
        existingHero.destroy();
      }
      this.updatePlayers();
    });

    events.on("SHOP_OPENED", this, (params: { heroPosition: Vector2, entranceLevel: Level, items?: InventoryItem[] }) => {
      if (!this.actionBlocker) {
        this.mainScene.setLevel(new ShopMenu(params));
        this.stopPollingForUpdates = true;
        this.setActionBlocker(50);
      }
    });

    events.on("SHOP_OPENED_TO_SELL", this, (params: { heroPosition: Vector2, entranceLevel: Level, items?: InventoryItem[] }) => {
      let shopParts: InventoryItem[] = [];
      let x = 0;
      const parts = this.mainScene.inventory.parts.sort((x, y) => {
        const xId = x.metabotId ?? 0;
        const yId = y.metabotId ?? 0;
        return xId - yId;
      });
      for (let part of parts) {
        if (!part.metabotId) {
          shopParts.push(new InventoryItem({ id: x++, name: `${part.partName} ${part.skill.name} ${part.damageMod}`, category: "MetaBotPart" }))
        }
      }
      params.items = shopParts;
      let config = { ...params, sellingMode: true };

      this.mainScene.setLevel(new ShopMenu(config));
      this.stopPollingForUpdates = true;
    }); 
    events.on("WARDROBE_CLOSED", this, (params: { heroPosition: Vector2, entranceLevel: Level }) => {
      this.stopPollingForUpdates = false;
      const newLevel = this.getLevelFromLevelName(params.entranceLevel.name);
      console.log(newLevel, params.entranceLevel);
      newLevel.defaultHeroPosition = params.heroPosition;
      events.emit("CHANGE_LEVEL", newLevel);
    });
    events.on("SHOP_CLOSED", this, (params: { heroPosition: Vector2, entranceLevel: Level }) => {
      this.stopPollingForUpdates = false;
      const newLevel = this.getLevelFromLevelName(params.entranceLevel.name);
      newLevel.defaultHeroPosition = params.heroPosition;
      events.emit("CHANGE_LEVEL", newLevel);
    });
    events.on("SELECTED_PART", this, (params: { selectedPart: string, selection: string, selectedMetabotId: number }) => {
      const parts = this.mainScene.inventory.parts;
      const skill = params.selection.split(' ')[0];
      const dmg = params.selection.split(' ')[1];
      let targetPart = undefined;
      for (let part of parts) {
        if (part.skill.name === skill && part.damageMod === parseInt(dmg) && part.partName === params.selectedPart) {
          targetPart = part;
          break;
        }
      }
      let oldPart = undefined;
      const metabotSelected = this.metaHero.metabots.find(b => b.id === params.selectedMetabotId);
      if (metabotSelected && targetPart) {
        targetPart.metabotId = params.selectedMetabotId;
        if (targetPart.partName === LEFT_ARM) {
          oldPart = metabotSelected.leftArm;
          metabotSelected.leftArm = targetPart;
        } else if (targetPart.partName === RIGHT_ARM) {
          oldPart = metabotSelected.rightArm;
          metabotSelected.rightArm = targetPart;
        } else if (targetPart.partName === LEGS) {
          oldPart = metabotSelected.legs;
          metabotSelected.legs = targetPart;
        } else if (targetPart.partName === HEAD) {
          oldPart = metabotSelected.head;
          metabotSelected.head = targetPart;
        }
        console.log(parts, skill, dmg, targetPart, oldPart);

        if (oldPart && oldPart.id == targetPart.id) {
          return;
        }

        for (let invPart of parts) {
          if (invPart.id != targetPart.id && invPart.partName === targetPart.partName && invPart.metabotId) {
            this.metaService.unequipPart(invPart.id);
            invPart.metabotId = undefined;
          }
        }
        this.metaService.equipPart(targetPart.id, targetPart.metabotId);
      }
    });


    events.on("DEPLOY", this, (params: { bot: MetaBot, hero?: MetaHero}) => {
      console.log(params);
      if (params.bot.id) { 
        this.addBotToScene(params.hero ?? this.metaHero, params.bot);
      }
    });

    events.on("HERO_CREATED", this, (name: string) => {
      if (this.chatInput.nativeElement.placeholder === "Enter your name" && this.parentRef && this.parentRef.user) {
        this.metaService.createHero(this.parentRef.user, name);
      }
    });

    events.on("SEND_CHAT_MESSAGE", this, (chat: string) => {
      const msg = chat.trim();
      if (this.parentRef?.user) {
        if (this.chatInput.nativeElement.placeholder !== "Enter your name") {
          const metaEvent = new MetaEvent(0, this.metaHero.id, new Date(), "CHAT", this.metaHero.map, { "sender": this.metaHero.name ?? "Anon", "content": msg })
          this.metaService.updateEvents(metaEvent);
          this.chatInput.nativeElement.value = '';
          setTimeout(() => {
            this.chatInput.nativeElement.blur();
            this.gameCanvas.nativeElement.focus();
          }, 0); 
        }
      }
    });

    events.on("WAVE_AT", this, (objectAtPosition: GameObject) => {
      const msg = `👋 ${(objectAtPosition as Hero).name} 👋`;
      const metaEvent = new MetaEvent(0, this.metaHero.id, new Date(), "CHAT", this.metaHero.map, { "sender": this.metaHero.name ?? "Anon", "content": msg })
      this.metaService.updateEvents(metaEvent);
    });

    events.on("REPAIR_ALL_METABOTS", this, () => {
      for (let bot of this.metaHero.metabots) {
        bot.hp = 100;
      }
      if (this.hero && this.hero.metabots) {
        for (let bot of this.hero.metabots) {
          bot.hp = 100;
        }
      }
    })

    events.on("ITEM_PURCHASED", this, (item: InventoryItem) => {
      const metaEvent = new MetaEvent(0, this.metaHero.id, new Date(), "BUY_ITEM", this.metaHero.map, { "item": `${JSON.stringify(item)}` })
      this.metaService.updateEvents(metaEvent);
      if (item.category === "botFrame") {
        const newBot = new MetaBot({ id: this.metaHero.metabots.length + 1, heroId: this.metaHero.id, type: item.stats["type"], hp: item.stats["hp"], name: item.name, level: 1 });
        this.metaService.createBot(newBot).then(res => {
          if (res) { 
            this.metaHero.metabots.push(res);
          }
        }); 
      }
    });

    events.on("ITEM_SOLD", this, (items: InventoryItem[]) => {
      console.log(items);
      const botPartsSold = items.filter(x => x.category === "MetaBotPart");
      let partIdNumbers = []
      //`${part.partName} ${part.skill.name} ${part.damageMod}`
      for (let item of botPartsSold) {
        let itmString = item.name;
        itmString = itmString.replace("Left Punch", "Left_Punch");
        itmString = itmString.replace("Right Punch", "Right_Punch");
        console.log(itmString);

        const partName = itmString.split(' ')[0].trim();
        let skillName = itmString.split(' ')[1].trim().replace("_", " ");
        const damageMod = itmString.split(' ')[2].trim();

        console.log(partName, skillName, damageMod);

        const part = this.mainScene.inventory.parts.find(x => x.partName === partName && x.skill.name === skillName && x.damageMod === parseInt(damageMod) && !partIdNumbers.includes(x.id)) as MetaBotPart;
        if (part) {
          partIdNumbers.push(part.id);
          this.mainScene.inventory.parts = this.mainScene.inventory.parts.filter(x => x.id !== part.id);
        }
      }

      this.metaService.sellBotParts(this.metaHero.id, partIdNumbers);
    });

    events.on("BUY_ITEM_CONFIRMED", this, (params: { heroId: number, item: string }) => {
      const shopItem = JSON.parse(params.item) as InventoryItem;
      if (params.heroId === this.metaHero.id) {
        setTimeout(() => {
          events.emit("HERO_PICKS_UP_ITEM", {
            position: new Vector2(0, 0),
            id: this.mainScene.inventory.nextId,
            hero: this.hero,
            name: shopItem.name,
            imageName: shopItem.image,
            category: shopItem.category,
            stats: shopItem.stats
          }); 
        }, 100); 
      }
    });

    events.on("START_FIGHT", this, (source: Npc) => {
      const metaEvent = new MetaEvent(0, this.metaHero.id, new Date(), "START_FIGHT", this.metaHero.map, { "party_members": `${JSON.stringify(this.partyMembers)}`, "source": `${source.type}` })
      this.metaService.updateEvents(metaEvent);
      const itemsFound = this.mainScene.inventory.getItemsFound();
      events.emit("CHANGE_LEVEL",
        new Fight({
          metaHero: this.metaHero,
          parts: this.mainScene.inventory.parts.filter(x => x.metabotId),
          entryLevel: (this.metaHero.map == "FIGHT" ? new BrushLevel1({ itemsFound: itemsFound }) : this.getLevelFromLevelName(this.metaHero.map)),
          enemies: [source],
          party: this.partyMembers.length > 1 ? this.partyMembers : [this.metaHero],
          itemsFound: itemsFound
        })
      );
    });

    events.on("START_PRESSED", this, (data: any) => {
      this.isStartMenuOpened = true;
    });
    events.on("CLOSE_INVENTORY_MENU", this, (data: any) => {
      this.isStartMenuOpened = false;
    });
    //Reposition Safely handler
    events.on("REPOSITION_SAFELY", this, () => {
      if (this.metaHero) {
        const levelName = this.mainScene.level?.name; // Get the class reference
        if (levelName && levelName != "Fight") {
          events.emit("CHANGE_LEVEL", this.getLevelFromLevelName(levelName));
        }
      }
    });

    events.on("WARP", this, (params: { x: string, y: string }) => {
      if (this.metaHero) {
        this.metaHero.position = new Vector2(gridCells(parseInt(params.x)), gridCells(parseInt(params.y))); 
      }
    });

    events.on("INVALID_WARP", this, (hero: Hero) => {
      this.chat.unshift(
        {
          hero: this.metaHero.name ?? "Anon",
          content: "Can't warp there.",
          timestamp: new Date()
        } as MetaChat);
      this.setHeroLatestMessage(hero);
    })

    events.on("USER_ATTACK_SELECTED", this, (skill: Skill) => {
      const metaEvent = new MetaEvent(0, this.metaHero.id, new Date(), "USER_ATTACK_SELECTED", this.metaHero.map, { "skill": JSON.stringify(skill) })
      this.metaService.updateEvents(metaEvent);
    });

    events.on("GOT_REWARDS", this, (rewards: MetaBotPart[]) => {
      this.metaService.updateBotParts(this.metaHero, rewards);
      this.mainScene.inventory.parts = this.mainScene.inventory.parts.concat(rewards);
    });

    events.on("PARTY_UP", this, (person: Hero) => {
      const foundInParty = this.partyMembers.find(x => x.id === this.metaHero.id);
      if (!foundInParty) {
        this.partyMembers.push(this.metaHero);
      }
      const metaEvent = new MetaEvent(0, this.metaHero.id, new Date(), "PARTY_UP", this.metaHero.map, { "hero_id": `${person.id}`, "party_members": `${JSON.stringify(this.partyMembers)}` })
      this.metaService.updateEvents(metaEvent);
    });
    events.on("HERO_PICKS_UP_ITEM", this, (data:
      { 
        position: Vector2,
        hero: Hero,
        name: string,
        imageName: string,
        category: string,
        stats: any,
      }) => {
      if (!this.actionBlocker) {
        this.metaService.updateInventory(this.metaHero, data.name, data.imageName, data.category);
        this.setActionBlocker(500);
      }
    });

    events.on("CHANGE_COLOR", this, () => {
      if (this.parentRef) {
        setTimeout(() => {
          events.emit("HERO_MOVEMENT_LOCK");
        }, 50);
        this.colorInput.nativeElement.style.display = "block";
        this.parentRef.openModal();
        setTimeout(() => {
          if (this.parentRef) {
            this.parentRef.isModal = true;
            this.parentRef.isModalCloseVisible = false;
            this.parentRef.modalComponent.setModalFont("fontRetroGaming");
            this.parentRef.setModalBody("What's your style? :");
          }
        }, 1);
      }
    });
  }

  private setActionBlocker(duration: number) {
    this.actionBlocker = true;
    setTimeout(() => {
      this.actionBlocker = false;
    }, duration);
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


  private actionStartFightEvent(event: MetaEvent) {
    if (event.data) {
      const partyMembersData = JSON.parse(event.data["party_members"]);
      if (partyMembersData) {
        let isMyParty = false;
        let party: MetaHero[] = [];
        for (let member of partyMembersData) {
          const parsedMember = new MetaHero(
            member.id,
            member.name,
            member.position,
            member.speed,
            member.map,
            member.metabots
          );
          if (this.partyMembers.find(x => x.id === parsedMember.id)) {
            isMyParty = true;
            break;
          }
        }
        if (isMyParty) {
          const source = event.data["source"];
          const tmpNpc = new Npc({
            id: -1334,
            position: new Vector2(0, 0),
            textConfig: { content: undefined, portraitFrame: 1 },
            type: source
          });
          events.emit("START_FIGHT", tmpNpc);
          storyFlags.add("START_FIGHT");
        }
      }
    }
  }

  private actionPartyInviteAcceptedEvent(event: MetaEvent) {
    if (event.data) {
      const partyMembersData = JSON.parse(event.data["party_members"]);
      if (partyMembersData) {
        let isMyParty = false;
        let party: MetaHero[] = [];
        for (let member of partyMembersData) {
          const parsedMember = new MetaHero(
            member.id,
            member.name,
            member.position,
            member.speed,
            member.map,
            member.metabots
          );
          if (!party.find(x => x.id === parsedMember.id)) {
            party.push(parsedMember);
            if (parsedMember.id === this.metaHero.id) {
              isMyParty = true;
            }
          }
        }
        if (isMyParty) {
          this.partyMembers = party;
          events.emit("PARTY_INVITE_ACCEPTED", { playerId: this.metaHero.id, party: this.partyMembers });
        }
      }
    }
  }

  private actionPartyUpEvent(event: MetaEvent) {
    if (event.data) {
      const otherPlayer = this.otherHeroes.find(hero => hero.id === event.heroId);
      if (otherPlayer) {
        this.isDecidingOnParty = true;
        if (confirm(`Accept party request from ${otherPlayer.name}?`)) {
          const partyMembersData = JSON.parse(event.data["party_members"]); // Convert JSON string to JS object

          for (let member of partyMembersData) {
            const parsedMember = new MetaHero(
              member.id,
              member.name,
              member.position,
              member.speed,
              member.map,
              member.metabots
            );
            this.partyMembers.push(parsedMember);
          }
          const inviterId = parseInt(event.data["hero_id"]);
          if (!this.partyMembers.find(x => event.data && x.id === inviterId)) {
            const member = this.otherHeroes.find(x => x.id === inviterId);
            if (member) {
              this.partyMembers.push(member);
            }
          }
          const partyUpAcceptedEvent = new MetaEvent(0, this.metaHero.id, new Date(), "PARTY_INVITE_ACCEPTED", this.metaHero.map, { "party_members": JSON.stringify(this.partyMembers) });
          this.metaService.updateEvents(partyUpAcceptedEvent);
          events.emit("PARTY_INVITE_ACCEPTED", { playerId: this.metaHero.id, party: this.partyMembers });
          this.isDecidingOnParty = false;
        } else {
          this.isDecidingOnParty = false;
        }
      }
    }
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

    //const isLandscape = this.onMobile() && window.innerWidth > window.innerHeight;
    //if (isLandscape) {
    //  console.log("Rotated to landscape - Fullscreen Canvas");
    //  this.goFullScreen();
    //} else {
    //  this.exitFullScreen();
    //}
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
