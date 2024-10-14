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
import { GOT_WATCH, storyFlags } from './helpers/story-flags';
import { Hero } from './objects/Hero/hero';
import { Main } from './objects/Main/main';
import { HeroRoomLevel } from './levels/hero-room';
import { Fight } from './levels/fight';
import { CharacterCreate } from './levels/character-create';
import { Level } from './objects/Level/level';
import { CaveLevel1 } from './levels/cave-level1';
import { HeroHomeLevel } from './levels/hero-home';
import { BrushLevel1 } from './levels/brush-level1';
import { MetaEvent } from '../../services/datacontracts/meta/meta-event';
import { Npc } from './objects/Npc/npc';
import { InventoryItem } from './objects/InventoryItem/inventory-item';
import { RivalHomeLevel1 } from './levels/rival-home-level1';
import { BrushShop1 } from './levels/brush-shop1';
import { ShopMenu } from './objects/shop-menu';

@Component({
  selector: 'app-meta',
  templateUrl: './meta.component.html',
  styleUrls: ['./meta.component.css']
})

export class MetaComponent extends ChildComponent implements OnInit, OnDestroy {
  @ViewChild('gameCanvas', { static: true }) gameCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chatInput') chatInput!: ElementRef<HTMLInputElement>;

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
            this.actionEvents(res.events);
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
      const existingHero = this.mainScene.level?.children.find((x: any) => x.id === hero.id);
      if (!storyFlags.flags.has("START_FIGHT") || this.partyMembers.find(x => x.id === hero.id)) {
        if (existingHero) {
          this.setUpdatedHeroPosition(existingHero, hero);
          this.setHeroLatestMessage(existingHero);
        } else {
          this.addHeroToScene(hero);
        }
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
    const tmpHero = new Hero(
      hero.id == this.metaHero.id ? this.metaHero.position.x : hero.position.x,
      hero.id == this.metaHero.id ? this.metaHero.position.y : hero.position.y
    );
    tmpHero.id = hero.id;
    tmpHero.name = hero.name ?? "Anon";
    if (hero.id === this.metaHero.id) {
      tmpHero.isUserControlled = true;
    }
    this.mainScene.level?.addChild(tmpHero);
  }

  private setUpdatedHeroPosition(existingHero: any, hero: MetaHero) {
    if (existingHero.id != this.hero.id) {
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

  private actionEvents(metaEvents: MetaEvent[]) {
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
        }
      }
    }
    this.events = metaEvents;
  }


  private async reinitializeHero(rz: MetaHero) {
    this.hero = new Hero(snapToGrid(rz.position.x, 16), snapToGrid(rz.position.y, 16));
    this.hero.id = rz.id;
    this.hero.name = rz.name ?? "Anon";
    this.metaHero = new MetaHero(this.hero.id, this.hero.name, this.hero.position.duplicate(), rz.speed, rz.map, []);

    await this.reinitializeInventoryData();

    const levelKey = rz.map.toUpperCase();
    const level = this.getLevelFromLevelName(rz.map);

    if (level) {
      this.mainScene.setLevel(level);
    }

    this.mainScene.camera.centerPositionOnTarget(this.metaHero.position);
  }

  private async reinitializeInventoryData() {
    await this.metaService.fetchInventoryData(this.metaHero).then(inventoryData => {
      if (inventoryData) {
        for (let item of (inventoryData as InventoryItem[])) {
          events.emit("INVENTORY_UPDATED", {
            image: resources.images[item.image],
            name: item.name,
            id: item.id
          });
          if (item.image === "watch") {
            storyFlags.add(GOT_WATCH);
          }
        }
      }
    });
  }

  private getLevelFromLevelName(key: string): Level {
    const upperKey = key.toUpperCase();
    const itemsFoundNames = this.mainScene.inventory.getItemsFound();

    if (upperKey == "HEROROOM") return new HeroRoomLevel({ itemsFound: itemsFoundNames });
    else if (upperKey == "CAVELEVEL1") return new CaveLevel1({ itemsFound: itemsFoundNames });
    else if (upperKey == "HEROHOME") return new HeroHomeLevel({ itemsFound: itemsFoundNames });
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
        }
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
        this.mainScene.level.itemsFound = this.mainScene.inventory.getItemsFound();
      }  
    });

    events.on("SHOP_OPENED", this, () => {
      this.mainScene.level?.destroy();
      const shopMenu = new ShopMenu();
      this.mainScene.addChild(shopMenu);
      this.mainScene.level = shopMenu;
      this.stopPollingForUpdates = true;
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
    events.on("HERO_PICKS_UP_ITEM", this, (item: any) => {
      console.log(item);
      this.metaService.updateInventory(this.metaHero, item.name, item.imageName);
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
    console.log("Got start fight event", event);
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
            console.log("Im in the party with a fight");
            isMyParty = true;
            break;
          }
        }
        if (isMyParty) {
          console.log("starting fight");
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
    console.log("got party invite accepted event", event.data);
    if (event.data) {
      const partyMembersData = JSON.parse(event.data["party_members"]);
      console.log("this is partyMembersData: ", partyMembersData);
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
          console.log("this is my party");
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

  closeUserComponent(user: User) {
    this.isUserComponentOpen = false;
    if (this.parentRef) {
      this.ngOnInit();
    }
  }
}
