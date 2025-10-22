import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { MetaHero } from '../../services/datacontracts/bones/meta-hero';
import { Vector2 } from '../../services/datacontracts/bones/vector2';
import { User } from '../../services/datacontracts/user/user';
import { BonesService } from '../../services/bones.service';
import { UserService } from '../../services/user.service';
import { MetaChat } from '../../services/datacontracts/bones/meta-chat';
import { gridCells, snapToGrid } from './helpers/grid-cells';
import { GameLoop } from './helpers/game-loop';
import { hexToRgb, resources } from './helpers/resources';
import { events } from './helpers/events';
import { storyFlags } from './helpers/story-flags';
import { actionMultiplayerEvents, subscribeToMainGameEvents, pendingAttacks, processedAttacks } from './helpers/network';
import { Hero } from './objects/Hero/hero';
import { Main } from './objects/Main/main';
import { HeroRoomLevel } from './levels/hero-room';
import { CharacterCreate } from './levels/character-create';
import { Level } from './objects/Level/level'; 
import { MetaEvent } from '../../services/datacontracts/bones/meta-event';
import { InventoryItem } from './objects/InventoryItem/inventory-item';
import { DroppedItem } from './objects/Environment/DroppedItem/dropped-item'; 
import { ColorSwap } from '../../services/datacontracts/bones/color-swap';
import { MetaBot } from '../../services/datacontracts/bones/meta-bot';
import { MetaBotPart } from '../../services/datacontracts/bones/meta-bot-part';
import { Mask, getMaskNameById } from './objects/Wardrobe/mask';
import { Bot } from './objects/Bot/bot';
import { Character } from './objects/character'; 
import { ChatSpriteTextString } from './objects/SpriteTextString/chat-sprite-text-string';

@Component({
  selector: 'app-bones',
  templateUrl: './bones.component.html',
  styleUrls: ['./bones.component.css'],
  standalone: false
})

export class BonesComponent extends ChildComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('gameCanvas', { static: true }) gameCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chatInput') chatInput!: ElementRef<HTMLInputElement>;
  @ViewChild('colorInput') colorInput!: ElementRef<HTMLInputElement>;

  constructor(private bonesService: BonesService, private userService: UserService) {
    super();
    this.hero = {} as Hero;
    this.metaHero = {} as MetaHero;
    this.mainScene = new Main({ position: new Vector2(0, 0), heroId: this.metaHero.id, 
      metaHero: this.metaHero, hero: this.hero, partyMembers: this.partyMembers });
    subscribeToMainGameEvents(this);
  }
  canvas!: HTMLCanvasElement;
  ctx!: CanvasRenderingContext2D;
  pollSeconds = 1;
  isUserComponentOpen = false;
  isMenuPanelOpen = false;

  mainScene?: any;
  metaHero: MetaHero;
  hero?: Hero;
  otherHeroes: MetaHero[] = [];
  partyMembers: { heroId: number, name: string, color?: string }[] = [];
  chat: MetaChat[] = [];
  events: MetaEvent[] = [];
  latestMessagesMap = new Map<string, MetaChat>();
  stopChatScroll = false;
  stopPollingForUpdates = false;
  isDecidingOnParty = false;
  actionBlocker = false;
  blockOpenStartMenu = false;
  isStartMenuOpened = false;
  isShopMenuOpened = false;
  hideStartButton = false;
  serverDown? = false;
  // Count consecutive failures to fetch game data; when threshold reached announce locally via chat
  private consecutiveFetchFailures: number = 0;
  topMetabots: any[] = [];
  topHeroes: any[] = [];
  cachedDefaultName?: string = undefined;
  cachedDefaultColor?: string = undefined;
  isMuted = false;
  isMusicMuted = false;
  isSfxMuted = false;


  private currentChatTextbox?: ChatSpriteTextString | undefined; 
  private pollingInterval: any;
  private _processedCleanupInterval: any;

  async ngOnInit() {
    this.serverDown = (this.parentRef ? await this.parentRef?.isServerUp() <= 0 : false);
    this.parentRef?.setViewportScalability(false);
    this.parentRef?.addResizeListener();
    this.canvas = this.gameCanvas.nativeElement;
    this.ctx = this.canvas.getContext("2d")!;
    if (!this.parentRef?.user) {
      this.isUserComponentOpen = true;
    } else {
      this.startLoading();
      this.userService.getUserSettings(this.parentRef.user?.id ?? 0).then(res => {
          this.cachedDefaultName = res?.lastCharacterName ?? undefined;
          this.cachedDefaultColor = res?.lastCharacterColor ?? undefined;
          this.isMuted = !!res?.muteSounds;
          this.isMusicMuted = this.isMuted;
          this.isSfxMuted = false;  
          resources.setMusicMuted(this.isMusicMuted);
          resources.setSfxMuted(this.isSfxMuted);
            if (!this.isMusicMuted) {
              const startMusic = () => {
                  resources.playSound("pixelDreams", { volume: 0.4, loop: true, allowOverlap: false });
                  document.removeEventListener('pointerdown', startMusic);
                  document.removeEventListener('keydown', startMusic);
              };
              document.addEventListener('pointerdown', startMusic, { once: true });
              document.addEventListener('keydown', startMusic, { once: true });
          }
      }).catch(() => { /* ignore */ });
      this.pollForChanges();
      this.gameLoop.start();
      this.stopLoading();
    }

    window.addEventListener("resize", this.adjustCanvasSize);
    this.adjustCanvasSize();

    // Handle remote attack animations sent from other clients via ATTACK_BATCH
    events.on("REMOTE_ATTACK", this, (payload: any) => {
      try {
        const sourceHeroId = payload?.sourceHeroId;
        const attack = payload?.attack;
        if (!sourceHeroId || !attack) return;
        const srcObj = this.mainScene?.level?.children?.find((x: any) => x.id === sourceHeroId);
        if (srcObj) {
          // If the hero object exposes a playAttackAnimation method, use it.
          if (typeof srcObj.playAttackAnimation === 'function') {
            srcObj.playAttackAnimation(attack.skill);
          } else {
            // Fallback: temporarily set a flag that other rendering code can observe
            srcObj._remoteAttack = attack;
            setTimeout(() => { delete srcObj._remoteAttack; }, 500);
          }
        }
      } catch (ex) {
        console.error('Error handling REMOTE_ATTACK', ex);
      }
    });
  }

  ngOnDestroy() {
    clearInterval(this.pollingInterval);
    clearInterval(this._processedCleanupInterval);
    this.mainScene.destroy();
    this.gameLoop.stop();
    this.remove_me('MetaComponent');
    this.parentRef?.setViewportScalability(true);
    this.parentRef?.removeResizeListener();
  }


  ngAfterViewInit() {
    this.mainScene.input.setChatInput(this.chatInput.nativeElement);
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
    if (!this.hero?.id && this.parentRef?.user?.id) { 
      const rz = await this.bonesService.getHero(this.parentRef.user.id);
      if (rz) { 
        this.partyMembers = await this.bonesService.getPartyMembers(rz.id) ?? [];
        this.mainScene.partyMembers = this.partyMembers;
        this.mainScene.inventory.partyMembers = this.partyMembers;
        this.mainScene.inventory.renderParty();
        await this.reinitializeHero(rz);
      } else {
        this.userService.getUserSettings(this.parentRef?.user?.id ?? 0).then(res => {
          const defaultName = res?.lastCharacterName ?? undefined;
          this.mainScene.setLevel(new CharacterCreate({ defaultName, defaultColor: this.cachedDefaultColor }));
        }).catch(() => {
          this.mainScene.setLevel(new CharacterCreate({ defaultColor: this.cachedDefaultColor }));
        });
        return;
      }
    }
    this.startAttackCleanupInterval();
    this.updatePlayers();
    clearInterval(this.pollingInterval);
    this.pollingInterval = setInterval(async () => {
      this.updatePlayers();
    }, this.pollSeconds * 1000);
  }

  private startAttackCleanupInterval() {
    const PROCESSED_ATTACK_TTL_MS = 60 * 1000; // 1 minute
    this._processedCleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, ts] of processedAttacks) {
        if (now - ts > PROCESSED_ATTACK_TTL_MS) processedAttacks.delete(key);
      }
    }, 40 * 1000);
  }

  private async updatePlayers() {
    if (!(this.metaHero && this.metaHero.id && !this.stopPollingForUpdates)) return;

    try {
      // Snapshot pending attacks and include them with the fetch; component owns the queue lifecycle
      const rawSnapshot = pendingAttacks.slice();
      // Normalize to simple primitives: { heroId: number, timestamp: string, skill?: string }
      const snapshot = rawSnapshot.map((a: any) => ({
        heroId: typeof a.heroId === 'number' ? a.heroId : this.metaHero?.id ?? a.heroId,
        timestamp: typeof a.timestamp === 'string' ? a.timestamp : (a.timestamp ? String(a.timestamp) : new Date().toISOString()),
        skill: a.skill && typeof a.skill === 'string' ? a.skill : (a.skill && (a.skill as any).name ? (a.skill as any).name : undefined),
        // include facing so server can apply damage to encounter tile in front of the hero
        facing: a.facingDirection ?  a.facingDirection : (this.hero && (this.hero as any).facingDirection !== undefined ? (this.hero as any).facingDirection : undefined)
      }));
      const res: any = await this.bonesService.fetchGameData(this.metaHero, snapshot);
      // On successful response, clear the attacks we just sent from the shared queue
      if (res && snapshot && snapshot.length > 0) {
        pendingAttacks.splice(0, snapshot.length);
      }
      if (!res) { 
        this.consecutiveFetchFailures++;
        if (this.consecutiveFetchFailures >= 3 && !this.serverDown) {
          this.announceServerDown();
        }
        return;
      }
      const wasServerDown = this.resetServerDown();
      if (wasServerDown) {      // If server was down and is now back, consider reinitializing UI/state (bones doesn't have recover flow)
        // Optionally: remove any offline indicators or re-sync inventory/positions
      }
 
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
    }
    catch (ex: any) {
      // treat exceptions as failures
      this.consecutiveFetchFailures++;
      if (this.consecutiveFetchFailures >= 3 && !this.serverDown) {
        const name = this.metaHero?.name ?? "Anon";
        this.chat = this.chat.filter((m: MetaChat) => !(m && m.hero === name && (m.content ?? '') === '...'));
        this.chat.unshift({ hero: name, content: "Server down", timestamp: new Date() } as MetaChat);
        this.setHeroLatestMessage(this.mainScene?.level?.children?.find((x: Character) => x.name === name));
        this.displayChatMessage();
        events.emit("CHAT_MESSAGE_RECEIVED");
        this.serverDown = true;
      }
      return;
    }
  }

  private announceServerDown() {
    const name = this.metaHero?.name ?? "Anon";
    this.chat = this.chat.filter((m: MetaChat) => !(m && m.hero === name && (m.content ?? '') === '...'));
    this.chat.unshift({ hero: name, content: "Server down", timestamp: new Date() } as MetaChat);
    this.setHeroLatestMessage(this.mainScene?.level?.children?.find((x: Character) => x.name === name));
    this.displayChatMessage();
    events.emit("CHAT_MESSAGE_RECEIVED");
    this.serverDown = true;
  }

  private resetServerDown() {
    const wasServerDown = !!this.serverDown;
    this.consecutiveFetchFailures = 0;
    this.serverDown = false;
    return wasServerDown;
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

          // Fixed partyMembers check
          tgt.partyMembers = (Array.isArray(this.partyMembers) &&
            this.partyMembers.length > 0 &&
            this.partyMembers.some((x: any) => x.heroId == tgt.heroId))
            ? this.partyMembers
            : undefined;
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
          tgtEnemy.destinationPosition = (enemy.position !== undefined && enemy.position.x != -1 && enemy.position.y != -1) ? new Vector2(enemy.position.x, enemy.position.y) : tgtEnemy.position;
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
              position: (enemy.position !== undefined && enemy.position.x != -1 && enemy.position.y != -1) ? new Vector2(enemy.position.x, enemy.position.y) : new Vector2(tgtEncounter.position?.x ?? 0, tgtEncounter.position?.y ?? 0),
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
      if (!storyFlags.flags.has("START_FIGHT") || this.partyMembers?.find(x => x.heroId === hero.id)) {
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
          } 
        }
        else {
          existingHero = this.addHeroToScene(hero);
        }
        for (let i = 0; i < hero.metabots.length; i++) {
          if (hero.metabots[i].isDeployed == true) {
            this.addBotToScene(hero, hero.metabots[i]);
            break;
          }
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
    console.log("add hero to scene" , hero);
    const tmpHero = new Hero({
      id: hero.id,
      name: hero.name ?? "Anon",
      position: new Vector2(hero.id == this.metaHero.id ? this.metaHero.position.x : hero.position.x, hero.id == this.metaHero.id ? this.metaHero.position.y : hero.position.y),
      colorSwap: (hero.color ? new ColorSwap([0, 160, 200], hexToRgb(hero.color)) : undefined),
      speed: hero.speed,
      mask: hero.mask ? new Mask(getMaskNameById(hero.mask)) : undefined,
      metabots: hero.metabots,
      forceDrawName: true,
    });
    tmpHero.lastPosition = tmpHero.position.duplicate();
    tmpHero.destinationPosition = tmpHero.lastPosition.duplicate();
    if (hero.id === this.metaHero.id) {
      tmpHero.isUserControlled = true;
      this.hero = tmpHero;
      if (this.isStartMenuOpened) {
        this.hero.isLocked = true;
      }
    } 
    //tmpHero.metabots?.forEach((bot: MetaBot) => { bot.colorSwap = tmpHero.colorSwap;  })
    this.mainScene.level?.addChild(tmpHero); 
    return tmpHero;
  }

  private addBotToScene(metaHero: any, bot: MetaBot) {
    if (this.mainScene.level?.children.some((x: any) => x.id === bot.id)) { return bot; } 
    if (metaHero && metaHero.metabots && metaHero.metabots.length > 0) {
      let tgtBot = metaHero.metabots.find((x : any) => x.id === bot.id);
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
      colorSwap: (metaHero.color ? new ColorSwap([0, 160, 200], hexToRgb(metaHero.color)) : 
        metaHero.colorSwap ? metaHero.colorSwap : undefined),
      isDeployed: true,
      isEnemy: true,
      hp: bot.hp,
      level: bot.level,
      exp: bot.exp,
      leftArm: bot.leftArm,
      rightArm: bot.rightArm,
      head: bot.head,
      legs: bot.legs,
      partyMembers: metaHero.id === this.metaHero.id ? this.partyMembers : undefined
    });

    this.mainScene.level?.addChild(tmpBot);
    return tmpBot;
  }

  private addItemToScene(item: MetaBotPart, location: Vector2) {
    const offsets = [
      new Vector2(-gridCells(1), 0),
      new Vector2(-gridCells(2), 0),
      new Vector2(gridCells(1), 0),
      new Vector2(gridCells(2), 0),
      new Vector2(0, -gridCells(1)),
      new Vector2(0, -gridCells(2)),
      new Vector2(0, gridCells(1)),
      new Vector2(0, gridCells(2)),
      new Vector2(0, 0)
    ]
    const randomOffset = offsets[Math.floor(Math.random() * offsets.length)];
    const newLocation = new Vector2(location.x + randomOffset.x, location.y + randomOffset.y);
    const itemSkin = new DroppedItem({ position: newLocation, item: item });
    this.mainScene.level?.addChild(itemSkin);
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
    if (existingHero === undefined) return;
    const latestMsg = this.latestMessagesMap.get(existingHero.name);
    if (latestMsg) {
      existingHero.latestMessage = latestMsg.content;
    } else {
      existingHero.latestMessage = "";
    }
  }
  displayChatMessage() { 
    if (this.chat.length >= 10) {
      this.chat.pop();  
    } 
    if (this.currentChatTextbox) {
      this.currentChatTextbox.destroy();
    }

    this.latestMessagesMap.clear();
    let latestMessages: string[] = [];
    const twentySecondsAgo = new Date(Date.now() - 20000);
    
    this.chat.forEach((message: MetaChat) => {
      const timestampDate = message.timestamp ? new Date(message.timestamp) : undefined;

      if (timestampDate && timestampDate > twentySecondsAgo) {
        const existingMessage = this.latestMessagesMap.get(message.hero);

        if (!existingMessage || (existingMessage && existingMessage.timestamp && new Date(existingMessage.timestamp) < timestampDate)) {
          this.latestMessagesMap.set(message.hero, message);
        }
      }
      latestMessages.push(`${message.hero}: ${message.content}`);
    });
    this.currentChatTextbox = new ChatSpriteTextString({
      portraitFrame: 0,
      string: latestMessages,
      objectSubject: this.metaHero
    });
    this.mainScene.level.addChild(this.currentChatTextbox);  
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
      this.hero.isLocked = this.isStartMenuOpened || this.isShopMenuOpened;
    this.mainScene.setHeroId(this.metaHero.id);
    this.mainScene.hero = this.hero; 
    this.mainScene.metaHero = this.metaHero;
    storyFlags.flags = new Map<string, boolean>();

    if (!!skipDataFetch == false) {
      //console.log("initialize inv after reinitializeHero");
      await this.reinitializeInventoryData(true);
    } 
    const level = this.getLevelFromLevelName(rz.map);

    if (level) {
      this.mainScene.setLevel(level);
    }
 
    if (this.metaHero.metabots) {
      for (let i = 0; i < this.metaHero.metabots.length; i++) {
        if (this.metaHero.metabots[i].isDeployed == true) {
          this.addBotToScene(this.metaHero, this.metaHero.metabots[i]);
          break;
        }
      }
    } 

    this.mainScene.camera.centerPositionOnTarget(this.metaHero.position);
  }

  private async reinitializeInventoryData(skipParty = false) {
    if (this.mainScene?.inventory?.items) {
      this.mainScene.inventory.items.forEach((item: any) => this.mainScene.inventory.removeFromInventory(item.id));
    }
  await this.bonesService.fetchInventoryData(this.metaHero.id).then((inventoryData: any) => {
      if (inventoryData) {
        const inventoryItems = inventoryData.inventory as InventoryItem[];
        const metabotParts = inventoryData.parts as MetaBotPart[];
        this.mainScene.inventory.partyMembers = this.partyMembers;
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
              metaBot.colorSwap = bot.colorSwap;
            }

            invItem.stats = JSON.stringify(this.metaHero.metabots.find(bot => bot.name === invItem.name));
          }
          events.emit("INVENTORY_UPDATED", invItem);
        }
      }
      if (!this.isShopMenuOpened && !skipParty) { 
        this.mainScene.inventory.renderParty();
      }
    });
  }

  reinitializeStartMenuData() {
    for (let item of this.mainScene?.inventory?.items) {
      let invItem = {
        image: item.image,
        name: item.name,
        id: item.id,
        category: item.category,
      } as InventoryItem;
      if (item.category === "botFrame") {
        const bot = this.mainScene?.level?.children?.find((x: Bot) => x.heroId == this.metaHero.id && x.name === item.name);
        const metaBot = this.metaHero.metabots.find(bot => bot.name === invItem.name);
        if (bot && metaBot) { 
          metaBot.hp = bot.hp;
          metaBot.level = bot.level;
          metaBot.isDeployed = bot.isDeployed;
          metaBot.exp = bot.exp;
        }

        item.stats = JSON.stringify(metaBot);
      }
    }
  }

  private getLevelFromLevelName(key: string): Level {
    const upperKey = key.toUpperCase();
    const itemsFoundNames = this.mainScene?.inventory.getItemsFound();
    //only 1 level for now.
    if (upperKey == "HEROROOM") {
      return new HeroRoomLevel({ itemsFound: itemsFoundNames });  
    } else {
      return new HeroRoomLevel({ itemsFound: itemsFoundNames });
    } 
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

  getChatText() {
    return this.chatInput.nativeElement.value;
  }

  lockMovementForChat() {
    if (!this.hero?.isLocked) {
      console.log("lock movement for chat");
      events.emit("HERO_MOVEMENT_LOCK");
    }
  }
  async changeColor() {
    // Normalize hex input and accept any color (no darkness restriction)
    let raw = (this.colorInput.nativeElement.value || "").toString();
    function normalizeHex(h: string): string | null {
      if (!h) return null;
      h = h.replace(/^#/, '');
      if (h.length === 3) { h = h.split('').map(c => c + c).join(''); }
      if (h.length !== 6) return null;
      return '#' + h.toUpperCase();
    }

    if (!normalizeHex(raw)) {
      // fallback to cached/default if input invalid
      raw = this.cachedDefaultColor ?? this.metaHero?.color ?? '#444444';
      this.colorInput.nativeElement.value = raw;
    }

    const chosenColor = normalizeHex(raw) ?? this.cachedDefaultColor ?? this.metaHero?.color ?? '#444444';

    this.metaHero.color = chosenColor;
    if (this.hero) this.hero.colorSwap = new ColorSwap([0,160,200], hexToRgb(chosenColor));

    const userId = this.parentRef?.user?.id ?? 0;
    if (userId && userId > 0) {
      await this.userService.updateLastCharacterColor(userId, chosenColor).catch(() => {});
      this.cachedDefaultColor = chosenColor;
    }

    // propagate to scene and reinitialize if not on character creation
    if (this.metaHero && this.metaHero.id && chosenColor) {
      if (this.hero) this.hero.colorSwap = new ColorSwap([0,160,200], hexToRgb(chosenColor));
    }

    if (this.mainScene?.level?.name != 'CharacterCreate') {
      await this.reinitializeHero(this.metaHero);
    }
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
  closeUserComponent(user?: User) {
    this.isUserComponentOpen = false;
    if (this.parentRef && !this.parentRef.user) { this.parentRef.user = user; }
    setTimeout(() => {
      this.startLoading();
      this.pollForChanges();
      this.gameLoop.start();
      this.mainScene.input.setChatInput(this.chatInput.nativeElement);
      this.stopLoading();
    }, 500);
  }
  
  async showMenuPanel() {
    if (this.isMenuPanelOpen) {
      this.closeMenuPanel();
      return;
    }
    this.isMenuPanelOpen = true;
    if (this.parentRef) {
      this.parentRef.showOverlay();
    }
    
    try {
      this.topMetabots = await this.bonesService.getMetabotHighscores(50) ?? [];
    } catch (e) { this.topMetabots = []; }
    try {
      this.topHeroes = await this.bonesService.getHeroHighscores(50) ?? [];
    } catch (e) { this.topHeroes = []; }
  }

  closeMenuPanel() {
    this.isMenuPanelOpen = false;
    if (this.parentRef) {
      this.parentRef.closeOverlay();
    }
  }
}
