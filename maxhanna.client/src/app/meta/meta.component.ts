import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { MetaHero } from '../../services/datacontracts/meta/meta-hero';
import { Vector2 } from '../../services/datacontracts/meta/vector2'; 
import { User } from '../../services/datacontracts/user/user';
import { MetaService } from '../../services/meta.service';
import { MetaChat } from '../../services/datacontracts/meta/meta-chat';
import { gridCells, snapToGrid } from './helpers/grid-cells'; 
import { GameLoop } from './helpers/game-loop';
import { resources } from './helpers/resources';
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
import { MetaEvent } from '../../services/datacontracts/meta/meta-event';
import { Npc } from './objects/Npc/npc';
import { InventoryItem } from './objects/InventoryItem/inventory-item';
import { RivalHomeLevel1 } from './levels/rival-home-level1';
import { BrushShop1 } from './levels/brush-shop1';
import { ShopMenu } from './objects/shop-menu';
import { ColorSwap } from '../../services/datacontracts/meta/color-swap';
import { MetaBot, SPEED_TYPE } from '../../services/datacontracts/meta/meta-bot';

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
    this.mainScene = new Main(0, 0);
    this.subscribeToMainGameEvents();
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
  latestMessagesMap = new Map<number, MetaChat>();
  stopChatScroll = false;
  stopPollingForUpdates = false;
  isDecidingOnParty = false;

  private pollingInterval: any;


  ngOnDestroy() {
    clearInterval(this.pollingInterval);
    this.mainScene.destroy();
    stop();
    this.remove_me('MetaComponent');
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
      }
      else {
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

          if (res.chat) {
            this.chat = res.chat;
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
      let existingHero = this.mainScene.level?.children.find((x: any) => x.id === hero.id);
      if (!storyFlags.flags.has("START_FIGHT") || this.partyMembers.find(x => x.id === hero.id)) {
        if (existingHero) {
          this.setUpdatedHeroPosition(existingHero, hero);
        } else {
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
        if (x.id > 0 && !ids.includes(x.id)) {
          x.destroy();
        }
      });
    }
  }

  private addHeroToScene(hero: MetaHero) { 
    const tmpHero = new Hero({
      position: new Vector2(hero.id == this.metaHero.id ? this.metaHero.position.x : hero.position.x, hero.id == this.metaHero.id ? this.metaHero.position.y : hero.position.y),
      colorSwap: (hero.color ? new ColorSwap([0, 160, 200], this.hexToRgb(hero.color)) : undefined)
    });
    tmpHero.id = hero.id;
    tmpHero.name = hero.name ?? "Anon"; 
    tmpHero.lastPosition = tmpHero.position.duplicate();
    tmpHero.destinationPosition = tmpHero.lastPosition.duplicate(); 
    if (hero.id === this.metaHero.id) {
      tmpHero.isUserControlled = true;
    } 
    this.mainScene.level?.addChild(tmpHero);
    return tmpHero;
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
    const latestMsg = this.latestMessagesMap.get(existingHero.id);
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
              events.emit("SKILL_USED", { heroId: event.heroId, skill: (event.data ? event.data["skill"] : "") })
            }
          }
          if (event.event === "BUY_ITEM") { 
            const player = this.partyMembers.find(x => x.id === event.heroId);
            if (player || event.heroId === this.metaHero.id) {
              events.emit("BUY_ITEM_CONFIRMED", { heroId: event.heroId, item: (event.data ? event.data["item"] : "") })
            }
          }
        }
      }
    }
    this.events = metaEvents;
  }


  private async reinitializeHero(rz: MetaHero) {
    if (this.mainScene.level) {
      this.mainScene.inventory.items.forEach((item: any) => this.mainScene.inventory.removeFromInventory(item.id)); 
    }
    this.hero = new Hero({ position: new Vector2(snapToGrid(rz.position.x, 16), snapToGrid(rz.position.y, 16)), isUserControlled: true });
    this.hero.id = rz.id;
    this.hero.name = rz.name ?? "Anon";
    this.metaHero = new MetaHero(this.hero.id, this.hero.name, this.hero.position.duplicate(), rz.speed, rz.map, rz.metabots, rz.color);

    await this.reinitializeInventoryData();

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
        for (let item of (inventoryData as InventoryItem[])) {
          events.emit("INVENTORY_UPDATED", {
            image: item.image,
            name: item.name,
            id: item.id,
            category: item.category,
          } as InventoryItem); 
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
    else if (upperKey == "BRUSHSHOP1") return new BrushShop1({ itemsFound: itemsFoundNames });
    else if (upperKey == "FIGHT") return new Fight(
      {
        heroPosition: this.metaHero.position,
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
          for (let pM of this.partyMembers) {
            const hero = this.mainScene.level.children.filter((x: any) => x.objectId == pM.id) as Hero;
            hero.position = level.getDefaultHeroPosition();
            hero.position.y = hero.position.y + gridCells(i);
            i++;
            pM.position = hero.position.duplicate();
            const otherHero = this.otherHeroes.find(x => x.id === pM.id);
            if (otherHero) {
              otherHero.position = pM.position.duplicate();
            }
          }
        }
       
        this.mainScene.level.itemsFound = this.mainScene.inventory.getItemsFound();
      }
    });

    events.on("SHOP_OPENED", this, (params: { heroPosition: Vector2, entranceLevel: Level, items?: InventoryItem[] }) => {
      this.mainScene.setLevel(new ShopMenu(params));
      this.stopPollingForUpdates = true;
    });
    events.on("SHOP_CLOSED", this, (params: { heroPosition: Vector2, entranceLevel: Level }) => {
      this.stopPollingForUpdates = false;
      const newLevel = this.getLevelFromLevelName(params.entranceLevel.name);
      newLevel.defaultHeroPosition = params.heroPosition; 
      events.emit("CHANGE_LEVEL", newLevel);
    });

    events.on("SEND_CHAT_MESSAGE", this, (chat: string) => {
      const msg = chat.trim();
      if (this.parentRef?.user) {
        console.log("Chat: " + msg);
        if (this.chatInput.nativeElement.placeholder === "Enter your name") {
          this.metaService.createHero(this.parentRef.user, msg);
        } else {
          this.metaService.chat(this.metaHero, msg);
          this.chatInput.nativeElement.value = '';
          setTimeout(() => {
            this.chatInput.nativeElement.blur();
            this.gameCanvas.nativeElement.focus();
          }, 0);
        }
      }
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
        const newBot = new MetaBot({ id: this.metaHero.metabots.length + 1, heroId: this.metaHero.id, type: item.stats["type"], hp: item.stats["hp"], name: item.name });
        this.metaService.createBot(newBot); 
      } 
    });

    events.on("BUY_ITEM_CONFIRMED", this, (params: { heroId: number, item: string }) => { 
      const shopItem = JSON.parse(params.item) as InventoryItem; 
      if (params.heroId === this.metaHero.id) {
        let alreadyAddedItem = false; // a flag signaling that the item was already added into inventory. (basically a redundant check using storyFlags)

        if (shopItem.category == "botFrame") { 
          if (!storyFlags.flags.get(GOT_FIRST_METABOT)) {
            storyFlags.add(GOT_FIRST_METABOT);
          } else {
            alreadyAddedItem = true;
          }
        }
        if (!alreadyAddedItem) {
          events.emit("HERO_PICKS_UP_ITEM", {
            position: new Vector2(0, 0),
            id: this.mainScene.inventory.nextId,
            hero: this.hero,
            name: shopItem.name,
            imageName: shopItem.image,
            category: shopItem.category,
            stats: shopItem.stats
          }); 
        }

      } 
    });

    events.on("START_FIGHT", this, (source: Npc) => {
      console.log("got fight event, starting fight ..", source);

      const metaEvent = new MetaEvent(0, this.metaHero.id, new Date(), "START_FIGHT", this.metaHero.map, { "party_members": `${JSON.stringify(this.partyMembers)}`, "source": `${source.type}` })
      this.metaService.updateEvents(metaEvent);
      const itemsFound = this.mainScene.inventory.getItemsFound();
      events.emit("CHANGE_LEVEL",  
          new Fight({
            heroPosition: this.metaHero.position,
            entryLevel: (this.metaHero.map == "FIGHT" ? new BrushLevel1({ itemsFound: itemsFound }) : this.getLevelFromLevelName(this.metaHero.map)),
            enemies: [source],
            party: this.partyMembers.length > 1 ? this.partyMembers : [this.metaHero],
            itemsFound: itemsFound
          }) 
      );
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

    events.on("USER_ATTACK_SELECTED", this, (skill: string) => {
      const metaEvent = new MetaEvent(0, this.metaHero.id, new Date(), "USER_ATTACK_SELECTED", this.metaHero.map, { "skill": skill })
      this.metaService.updateEvents(metaEvent);
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
        image: any,
        position: Vector2,
        hero: Hero,
        name: string,
        imageName: string,
        category: string
      }) => { 
      this.metaService.updateInventory(this.metaHero, data.name, data.imageName, data.category);
    });

    events.on("CHANGE_COLOR", this, () => {
      this.colorInput.nativeElement.style.display = "block";
    });
  } 

  private getLatestMessages() {
    this.latestMessagesMap.clear();
    const twentySecondsAgo = new Date(Date.now() - 20000);

    this.chat.forEach((message: MetaChat) => {
      const timestampDate = message.timestamp ? new Date(message.timestamp) : undefined;

      if (timestampDate && timestampDate > twentySecondsAgo) {
        const existingMessage = this.latestMessagesMap.get(message.hero.id);

        if (!existingMessage || (existingMessage && existingMessage.timestamp && new Date(existingMessage.timestamp) < timestampDate)) {
          this.latestMessagesMap.set(message.hero.id, message);
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
          console.log("Added party members: ", this.partyMembers);
          this.isDecidingOnParty = false;
        } else {
          this.isDecidingOnParty = false;
        }
      }
    }
  }
  private hexToRgb(hex: string) {
  // Remove the leading '#' if present
    hex = hex.replace(/^#/, '');

    // Parse the hex string into RGB components
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);

    return [r, g, b]; // Return the RGB values as an array
  }
  async changeColor() {
    this.metaHero.color = this.colorInput.nativeElement.value;
    this.colorInput.nativeElement.style.display = "none";
    await this.reinitializeHero(this.metaHero);
    console.log(this.colorInput.nativeElement.value);
  }
  closeUserComponent(user: User) {
    this.isUserComponentOpen = false;
    if (this.parentRef) {
      this.ngOnInit();
    }
  }
}
