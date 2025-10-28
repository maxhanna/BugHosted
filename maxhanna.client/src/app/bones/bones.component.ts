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
import { actionMultiplayerEvents, subscribeToMainGameEvents, pendingAttacks, processedAttacks, reconcileDroppedItemsFromFetch } from './helpers/network';
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
import { HeroInventoryItem } from '../../services/datacontracts/bones/hero-inventory-item';
import { Mask, getMaskNameById } from './objects/Wardrobe/mask';
import { Bot } from './objects/Bot/bot';
import { Character } from './objects/character';
import { ChatSpriteTextString } from './objects/SpriteTextString/chat-sprite-text-string';
import { target } from './helpers/fight';

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
    this.mainScene = new Main({
      position: new Vector2(0, 0), heroId: this.metaHero.id,
      metaHero: this.metaHero, hero: this.hero, partyMembers: this.partyMembers
    });
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
  // Death UI/state
  showDeathPanel: boolean = false;
  deathKillerUserId?: number;
  deathKillerName?: string;
  private isDead: boolean = false;
  // cache of loaded User objects keyed by userId
  public cachedUsers: Map<number, User> = new Map<number, User>();
  latestMessagesMap = new Map<string, MetaChat>();
  stopChatScroll = false;
  stopPollingForUpdates = false;
  isDecidingOnParty = false;
  actionBlocker = false;
  blockOpenStartMenu = false;
  isShopMenuOpened = false;
  hideStartButton = false;
  // Start menu / panels
  isStartMenuOpened = false;
  isPartyPanelOpen = false;
  isChangeStatsOpen = false;
  // Transient UI: show 'Stats updated' message when present
  statsUpdatedVisible: boolean = false;
  private statsUpdatedTimer: any | undefined = undefined;
  // optimistic UI state for invites: map heroId -> expiry timestamp (ms)
  pendingInvites: Map<number, number> = new Map<number, number>();
  // per-hero cached seconds left for UI
  pendingInviteSeconds: Map<number, number> = new Map<number, number>();
  // temporary per-hero 'already in a party' status (map to expiry timestamp ms)
  alreadyInPartyUntil: Map<number, number> = new Map<number, number>();
  private alreadyInPartyTimers: Map<number, any> = new Map<number, any>();
  // track invites that are being cleared so we can play an animation before removing
  pendingClearing: Set<number> = new Set<number>();
  private pendingClearingTimers: Map<number, any> = new Map<number, any>();
  // filter: 'all' | 'party' | 'nearby'
  partyFilter: 'all' | 'party' | 'nearby' = 'all';
  showLeaveConfirm: boolean = false;
  // Stats editing model (simple local model until backend exists)
  editableStats: { str: number; dex: number; int: number; pointsAvailable: number } = { str: 1, dex: 1, int: 1, pointsAvailable: 0 };
  // Keep a copy of the original stats for change detection while the panel is open
  private statsOriginal?: { str: number; dex: number; int: number } = undefined;
  // Cached stats to preserve values when server fetches omit per-hero stats
  cachedStats?: { str: number; dex: number; int: number } = undefined;
  // Change character popup state
  isChangeCharacterOpen = false;
  heroSelections: any[] = [];
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
  // Current global volume (0.0 - 1.0) bound to the UI slider
  currentVolume: number = 1.0;

  // Incoming invite popup state
  pendingInvitePopup: { inviterId: number, inviterName: string, expiresAt: number } | null = null;
  // countdown in seconds for UI binding
  pendingInviteSecondsLeft: number | null = null;
  private pendingInviteTimer?: any; // interval id


  private currentChatTextbox?: ChatSpriteTextString | undefined;
  // Track last server-provided destination per encounter to avoid repeatedly reapplying identical targets
  private _lastServerDestinations: Map<number, Vector2> = new Map<number, Vector2>();
  private pollingInterval: any;
  private _processedCleanupInterval: any;
  private _pendingInvitesInterval: any;
  // Per-hero message expiry timers keyed by hero id (mirrors Ender behavior)
  private heroMessageExpiryTimers: Map<number, { timer: any, msg: string }> = new Map();
  // Map of server dropped-item id -> DroppedItem instance in the scene
  private _droppedItemsMap: Map<number, any> = new Map<number, any>();
  // Last map string/identifier fetched from server; when this changes we clear dropped items
  private _lastDroppedMap?: string | number;

  async ngOnInit() {
    this.serverDown = (this.parentRef ? await this.parentRef?.isServerUp() <= 0 : false);
    this.parentRef?.setViewportScalability(false);
    this.parentRef?.addResizeListener();
    this.canvas = this.gameCanvas.nativeElement;
    this.ctx = this.canvas.getContext("2d")!;
    if (!this.parentRef?.user?.id) {
      this.isUserComponentOpen = true;
    } else {
      this.startLoading();
      this.fetchUserSettings();
      this.pollForChanges();
      this.gameLoop.start();
      this.stopLoading();
    }

    window.addEventListener("resize", this.adjustCanvasSize);
    this.adjustCanvasSize();
  }

  ngOnDestroy() {
    clearInterval(this.pollingInterval);
    clearInterval(this._processedCleanupInterval);
    try { if (this._pendingInvitesInterval) clearInterval(this._pendingInvitesInterval); } catch { }
    this.mainScene.destroy();
    this.gameLoop.stop();
    this.parentRef?.setViewportScalability(true);
    this.parentRef?.removeResizeListener();
    // clear any outstanding chat timers
    for (const entry of this.heroMessageExpiryTimers.values()) { try { if (entry?.timer) clearTimeout(entry.timer); } catch { } }
    this.heroMessageExpiryTimers.clear();
    this.remove_me('BonesComponent');
  }


  ngAfterViewInit() {
    this.mainScene.input.setChatInput(this.chatInput.nativeElement);
    events.on("HERO_DIED", this, (payload: any) => {
      this.handleHeroDeath(payload);
    });
    // When a party invite is accepted (server or remote client confirmed),
    // clear any optimistic pending invites and ensure partyMembers reflect the new party.
    events.on("PARTY_INVITE_ACCEPTED", this, (payload: any) => {
      try {
        if (!payload || !payload.party) return;
        // payload.party expected to be array of { heroId, name, color }
        const partyArr = payload.party as any[];
        for (const m of partyArr) {
          try { if (m && m.heroId) this.pendingInvites.delete(m.heroId); } catch { }
        }
        // Update party members locally and refresh inventory/scene wiring
        this.partyMembers = Array.isArray(partyArr) ? partyArr.map(p => ({ heroId: p.heroId, name: p.name, color: p.color })) : [];
        try {
          if (this.mainScene && this.mainScene.inventory) {
            this.mainScene.inventory.partyMembers = this.partyMembers;
            this.mainScene.inventory.renderParty();
          }
          if (this.mainScene) this.mainScene.partyMembers = this.partyMembers;
        } catch { }
        // Reconcile to remove any expired or accepted pending invites
        try { this.reconcilePendingInvites(); } catch { }
      } catch (ex) { console.error('Error handling PARTY_INVITE_ACCEPTED', ex); }
    });

    // When we receive a server-side PARTY_INVITED, show a popup allowing the player to accept/reject
    events.on("PARTY_INVITED", this, (payload: any) => {
      try {
        if (!payload || !payload.inviterId) return;
        // If we're already in party with inviter or we already have a pending popup, ignore
        const inviterId = payload.inviterId as number;
        const inviterName = payload.inviterName as string || (`Hero ${inviterId}`);
        if (this.isInParty(inviterId)) return;
        // Set popup state and start a countdown that updates every 250ms
        this.clearPendingInvitePopup();
        const expiresAt = Date.now() + 20000;
        this.pendingInvitePopup = { inviterId: inviterId, inviterName: inviterName, expiresAt: expiresAt };
        // initialize seconds left
        this.pendingInviteSecondsLeft = Math.ceil((expiresAt - Date.now()) / 1000);
        this.pendingInviteTimer = setInterval(() => {
          if (!this.pendingInvitePopup) return;
          const leftMs = this.pendingInvitePopup.expiresAt - Date.now();
          const leftSec = Math.max(0, Math.ceil(leftMs / 1000));
          this.pendingInviteSecondsLeft = leftSec;
          if (leftSec <= 0) {
            this.clearPendingInvitePopup();
          }
        }, 250);
      } catch (ex) { console.error('Failed to show PARTY_INVITED popup', ex); }
    });


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

    // Play attenuated impact SFX when other heroes attack
    events.on("OTHER_HERO_ATTACK", this, (payload: any) => {
      console.log("got other hero attack event", payload); 
      const sourceHeroId = payload?.sourceHeroId;
      const targetHeroId = payload?.attack?.targetHeroId;
      if (!sourceHeroId) return;
      // Try to find attacker in scene first, fallback to otherHeroes list
      let attackerPos: Vector2 | undefined = undefined;
      const attackerObj = this.mainScene?.level?.children?.find((x: any) => x.id === sourceHeroId);
      if (attackerObj && attackerObj.position) {
        attackerPos = attackerObj.position;
      } else {
        const mh = this.otherHeroes.find(h => h.id === sourceHeroId);
        if (mh && mh.position) attackerPos = mh.position;
      }
      const myPos = (this.hero && this.hero.position) ? this.hero.position : (this.metaHero && this.metaHero.position) ? this.metaHero.position : undefined;
      if (!attackerPos || !myPos) return;
      const dx = attackerPos.x - myPos.x;
      const dy = attackerPos.y - myPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (sourceHeroId != this.metaHero.id || targetHeroId == this.metaHero.id) {
        console.log("hti sound playing", sourceHeroId, targetHeroId);
        const maxAudible = 800; // pixels: distance a`t which sound is near-silent
        let vol = 1 - (dist / maxAudible);
        vol = Math.max(0.05, Math.min(1, vol)); // clamp to [0.05, 1]
        resources.playSound('punchOrImpact', { volume: vol, allowOverlap: true });
      } 
       
    });

    // When the player interacts with an NPC that emits HEAL_USER (e.g., Bones NPC),
    // update local hero/metaHero hp immediately and inform the server to persist the change.
    events.on("HEAL_USER", this, async () => {
      try {
        if (this.metaHero && this.metaHero.id) {
          // Optimistically update client-side objects so UI responds immediately
          try { this.metaHero.hp = 100; } catch { }
          try { if (this.hero) this.hero.hp = 100; } catch { }

          // Persist to server
          await this.bonesService.healHero(this.metaHero.id).catch((err) => { console.error('healHero API failed', err); });
        }
      } catch (ex) {
        console.error('HEAL_USER handler failed', ex);
      }
    });
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
        this.copyStatsFromMetaHero(rz);
        this.partyMembers = await this.bonesService.getPartyMembers(rz.id) ?? [];
        this.mainScene.partyMembers = this.partyMembers;
        this.mainScene.inventory.partyMembers = this.partyMembers;
        this.mainScene.inventory.renderParty();
        // reconcile any optimistic invites after initial party load
        this.reconcilePendingInvites();
        await this.reinitializeHero(rz);
      } else { 
        const heroNames = await this.bonesService.getHeroNames(this.parentRef.user.id);
        this.mainScene.setLevel(
          new CharacterCreate(
            { defaultName: this.cachedDefaultName, 
              defaultColor: this.cachedDefaultColor,
              heroNames: heroNames  
            }
          )
        );
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
        facing: a.facingDirection ? a.facingDirection : (this.hero && (this.hero as any).facingDirection !== undefined ? (this.hero as any).facingDirection : undefined)
      }));
      this.metaHero.position = this.metaHero.position.duplicate();
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
      if (wasServerDown) {
        window.location.href = '/Bones';
      }

      if (res) {
        this.updateHeroesFromFetchedData(res);
        // reconcile optimistic invites after updating heroes
        this.reconcilePendingInvites();
        this.updateEnemyEncounters(res);

        // Reconcile dropped items from the server response: create sprites for new items,
        // remove sprites for items no longer present, and clear when changing levels.
        try { this.reconcileDroppedItemsFromFetch(res); } catch (ex) { console.warn('reconcileDroppedItemsFromFetch failed', ex); }

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
    // Delegate to combined implementation for a single pass
    this.updateHeroesFromFetchedData(res);
  }
  private updateEnemyEncounters(res: any) {
    const enemies = res.enemyBots as MetaBot[];
    if (enemies) {
      enemies.forEach(enemy => {
        //look for enemy on the map, if he doesnt exist, create him.
        const tgtEnemy: Bot = this.mainScene.level.children.find((x: Bot) => x.heroId == enemy.heroId);
        if (tgtEnemy) {
          // console.log("found enemy", enemy, tgtEnemy);
          // Diagnostic: log the incoming position so we can confirm server provided it
          // console.log("enemy.position (incoming):", (enemy && (enemy as any).position) ? JSON.stringify(enemy.position) : enemy.position, " typeof:", typeof enemy.position);
          tgtEnemy.hp = enemy.hp;
          if (enemy && enemy.position) {
            try {
              const newPos = new Vector2(enemy.position.x, enemy.position.y);
              if (newPos) {
                tgtEnemy.destinationPosition = newPos.duplicate();
              }
            } catch (err) {
              console.error('Error duplicating enemy.position for dest set', err, (enemy as any).position);
            }
          }

          if (tgtEnemy && tgtEnemy.heroId && (tgtEnemy.hp ?? 0) <= 0) {
            try {
              if (typeof tgtEnemy.destroy === 'function') {
                tgtEnemy.destroy();
              }
            } catch { /* ignore errors during destroy */ }
            try { this._lastServerDestinations.delete(tgtEnemy.heroId); } catch { }
            return; // skip further processing for this bot
          }
        } else if (enemy.hp) {
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
              isSolid: true,
            });
            // If the server gave a targetHeroId for this encounter, initialize it on the client bot
            try { (tmp as any).targetHeroId = (enemy as any).targetHeroId ?? null; } catch { }
            // Ensure destinationPosition is initialized to spawn pos to avoid an immediate small correction on first frame
            tmp.destinationPosition = tmp.position.duplicate();
            if (tmp.hp) {
              this.mainScene.level.addChild(tmp);
            }
          }
        }
      })
    }
  }

  private updateHeroesFromFetchedData(res: { map: number; position: Vector2; heroes: MetaHero[]; }) {
    if (!res || !res.heroes) {
      this.otherHeroes = [];
      return;
    }

    // Keep reference to previous local HP to detect HP drops
    const previousLocalHp = this.metaHero?.hp ?? undefined;

    this.otherHeroes = res.heroes;
    const ids: number[] = [];

    for (let i = 0; i < this.otherHeroes.length; i++) {
      const heroMeta = this.otherHeroes[i];
      // Scene object representing the hero (may be undefined if not added yet)
      let existingHero = this.mainScene.level?.children.find((x: any) => x.id === heroMeta.id) as Character | undefined;

      // Update or create sprite
      if (existingHero) {
        // Position updates (setUpdatedHeroPosition handles local hero vs others)
        this.setUpdatedHeroPosition(existingHero, heroMeta);

        // Visual attributes from server meta
        existingHero.hp = heroMeta.hp ?? existingHero.hp;
        existingHero.level = heroMeta.level ?? existingHero.level;
        existingHero.exp = heroMeta.exp ?? existingHero.exp;

        // Mask handling: if mask state changed, recreate character
        try {
          if (heroMeta.mask === 0 && existingHero.mask) {
            existingHero.destroy();
            existingHero = this.addHeroToScene(heroMeta);
          } else if (heroMeta.mask && heroMeta.mask != 0 && !existingHero.mask) {
            existingHero.destroy();
            existingHero = this.addHeroToScene(heroMeta);
          } else if (heroMeta.mask && heroMeta.mask != 0 && existingHero.mask && getMaskNameById(heroMeta.mask).toLowerCase() != existingHero.mask.name?.toLowerCase()) {
            existingHero.destroy();
            existingHero = this.addHeroToScene(heroMeta);
          }
        } catch (ex) { /* ignore mask errors */ }
      } else {
        existingHero = this.addHeroToScene(heroMeta);
      }

      // If this is our metaHero, keep local metaHero and Hero instance in sync
      if (heroMeta.id === this.metaHero.id) {
        try { this.metaHero.hp = heroMeta.hp ?? this.metaHero.hp; } catch { }
        try { this.metaHero.level = heroMeta.level ?? this.metaHero.level; } catch { }
        try { this.metaHero.exp = heroMeta.exp ?? this.metaHero.exp; } catch { }
        // Sync stats from server if provided
        try { this.metaHero.str = (heroMeta as any).str ?? ((heroMeta as any).stats ? (heroMeta as any).stats.str : this.metaHero.str); } catch { }
        try { this.metaHero.dex = (heroMeta as any).dex ?? ((heroMeta as any).stats ? (heroMeta as any).stats.dex : this.metaHero.dex); } catch { }
        try { this.metaHero.int = (heroMeta as any).int ?? ((heroMeta as any).stats ? (heroMeta as any).stats.int : this.metaHero.int); } catch { }
        if (this.hero) {
          // Detect HP drop for local hero and play attenuated impact SFX

          const incomingHp = heroMeta.hp ?? this.hero.hp ?? 0;
          const prevHp = typeof previousLocalHp === 'number' ? previousLocalHp : (this.hero.hp ?? incomingHp);
          if (incomingHp < prevHp) {
            resources.playSound('punchOrImpact', { volume: this.currentVolume, allowOverlap: true });
          }
          this.hero.hp = heroMeta.hp ?? 0;
          this.hero.level = heroMeta.level ?? 1;
          this.hero.exp = heroMeta.exp ?? 0;
          this.hero.maxHp = 100;
        }
      }

      // Party members wiring
      try {
        if (existingHero) {
          (existingHero as any).partyMembers = (Array.isArray(this.partyMembers) && this.partyMembers.length > 0 && this.partyMembers.some((x: any) => x.heroId == (existingHero as any).heroId)) ? this.partyMembers : undefined;
        }
      } catch { }

      // Chat bubble / latest message
      try { this.setHeroLatestMessage(existingHero); } catch { }

      ids.push(heroMeta.id);
    }

    // Remove any old hero sprites no longer present
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
    console.log("add hero to scene", hero);
    const tmpHero = new Hero({
      id: hero.id,
      name: hero.name ?? "Anon",
      position: new Vector2(hero.id == this.metaHero.id ? this.metaHero.position.x : hero.position.x, hero.id == this.metaHero.id ? this.metaHero.position.y : hero.position.y),
      colorSwap: (hero.color ? new ColorSwap([0, 160, 200], hexToRgb(hero.color)) : undefined),
      speed: hero.speed,
      mask: hero.mask ? new Mask(getMaskNameById(hero.mask)) : undefined,
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
    // initialize HP/level/exp on the sprite from server meta if available
    try { if (hero.hp !== undefined && hero.hp !== null) (tmpHero as any).hp = hero.hp; } catch { }
    try { if (hero.level !== undefined && hero.level !== null) (tmpHero as any).level = hero.level; } catch { }
    try { if (hero.exp !== undefined && hero.exp !== null) (tmpHero as any).exp = hero.exp; } catch { }
    try { if ((tmpHero as any).maxHp === undefined) (tmpHero as any).maxHp = hero.hp ?? 100; } catch { }
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
    if (existingHero === undefined) return;
    const latestMsg = this.latestMessagesMap.get(existingHero.name);
    if (latestMsg && latestMsg.content) {
      const existingTimer = this.heroMessageExpiryTimers.get(existingHero.id);
      if (!existingTimer || existingTimer.msg !== latestMsg.content) {
        if (existingTimer) {
          clearTimeout(existingTimer.timer);
          this.heroMessageExpiryTimers.delete(existingHero.id);
        }
        if (typeof existingHero.applyChatMessage === 'function') {
          existingHero.applyChatMessage(latestMsg.content, latestMsg.timestamp);
        } else {
          existingHero.latestMessage = latestMsg.content;
        }
        const timer = setTimeout(() => {
          const current = this.heroMessageExpiryTimers.get(existingHero.id);
          if (current && current.msg === latestMsg.content) {
            this.latestMessagesMap.delete(existingHero.name);
            if (typeof existingHero.clearChatMessage === 'function') {
              existingHero.clearChatMessage();
            } else {
              existingHero.latestMessage = "";
            }
            this.heroMessageExpiryTimers.delete(existingHero.id);
          }
        }, 10000); // 10s TTL to match Ender
        this.heroMessageExpiryTimers.set(existingHero.id, { timer, msg: latestMsg.content });
      }
    } else {
      // No message -> clear any existing timer & bubble
      const existingTimer = this.heroMessageExpiryTimers.get(existingHero.id);
      if (existingTimer) {
        clearTimeout(existingTimer.timer);
        this.heroMessageExpiryTimers.delete(existingHero.id);
      }
      if (typeof existingHero.clearChatMessage === 'function') {
        existingHero.clearChatMessage();
      } else {
        existingHero.latestMessage = "";
      }
      this.latestMessagesMap.delete(existingHero.name);
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
    const twentySecondsAgo = new Date(Date.now() - 10000); // match Ender 10s bubble TTL

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
      position: new Vector2(snapToGrid(rz.position.x, gridCells(1)), snapToGrid(rz.position.y, gridCells(1))),
      isUserControlled: true,
      speed: rz.speed,
      mask: rz.mask ? new Mask(getMaskNameById(rz.mask)) : undefined,
    });
    this.metaHero = new MetaHero(this.hero.id, (this.hero.name ?? "Anon"),
      this.hero.position.duplicate(),
      rz.speed,
      rz.map,
      rz.color,
      rz.mask,
      rz.hp ?? 100,
      rz.level ?? 1,
      rz.exp ?? 0,
      rz.attackSpeed ?? 400);
    // Restore persisted stats from server response if present
    try {
      const statsAny: any = (rz as any).stats ?? rz;
      if (statsAny) {
        if (statsAny.str !== undefined) this.metaHero.str = Number(statsAny.str);
        if (statsAny.dex !== undefined) this.metaHero.dex = Number(statsAny.dex);
        if (statsAny.int !== undefined) this.metaHero.int = Number(statsAny.int);
      }
    } catch { }
    // If server didn't provide stats, but we have cachedStats, apply those so UI remains consistent
    try {
      if ((this.metaHero.str === undefined || this.metaHero.dex === undefined || this.metaHero.int === undefined) && this.cachedStats) {
        this.metaHero.str = this.metaHero.str ?? this.cachedStats.str;
        this.metaHero.dex = this.metaHero.dex ?? this.cachedStats.dex;
        this.metaHero.int = this.metaHero.int ?? this.cachedStats.int;
      }
    } catch { }
    // propagate attackSpeed to client Hero so attack cooldowns match server-provided value
    if (this.hero) {
      this.hero.attackSpeed = rz.attackSpeed ?? 400;
      this.hero.level = rz.level ?? 1;
      this.hero.hp = rz.hp ?? 100;
      this.hero.exp = rz.exp ?? 0;
    }
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

    this.mainScene.camera.centerPositionOnTarget(this.metaHero.position);

    // If the server returned a dead hero (hp <= 0), present the death panel so user can respawn
    try {
      if ((rz.hp ?? 100) <= 0) {
        // Use existing handler to show death UI and pause polling
        this.handleHeroDeath({ killerId: null, killerUserId: undefined, cause: "spawned_dead" });
      }
    } catch { }
  }

  private async reinitializeInventoryData(skipParty = false) {
    if (this.mainScene?.inventory?.items) {
      this.mainScene.inventory.items.forEach((item: any) => this.mainScene.inventory.removeFromInventory(item.id));
    }
    await this.bonesService.fetchInventoryData(this.metaHero.id).then((inventoryData: any) => {
      if (inventoryData) {
        const inventoryItems = inventoryData.inventory as InventoryItem[];
        const heroInventoryItems = inventoryData.parts as HeroInventoryItem[];
        this.mainScene.inventory.partyMembers = this.partyMembers;
        this.mainScene.inventory.parts = inventoryItems;
        for (let item of inventoryItems) {
          let invItem = {
            image: item.image,
            name: item.name,
            id: item.id,
            category: item.category,
          } as InventoryItem;
          events.emit("INVENTORY_UPDATED", invItem);
        }
      }
      if (!this.isShopMenuOpened && !skipParty) {
        this.mainScene.inventory.renderParty();
      }
    });
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
    if (this.hero) this.hero.colorSwap = new ColorSwap([0, 160, 200], hexToRgb(chosenColor));

    const userId = this.parentRef?.user?.id ?? 0;
    if (userId && userId > 0) {
      await this.userService.updateLastCharacterColor(userId, chosenColor).catch(() => { });
      this.cachedDefaultColor = chosenColor;
    }

    // propagate to scene and reinitialize if not on character creation
    if (this.metaHero && this.metaHero.id && chosenColor) {
      if (this.hero) this.hero.colorSwap = new ColorSwap([0, 160, 200], hexToRgb(chosenColor));
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

  onUserTagLoaded(user?: User) {
    // Cache loaded user objects so we can map hero -> user without refetching
    try { if (user && user.id) this.cachedUsers.set(user.id, user); } catch { }
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
  }

  // Start menu toggles
  async openStartMenu() {
    this.isStartMenuOpened = true;
    this.isMenuPanelOpen = false;
    this.parentRef?.showOverlay();
    const level = this.metaHero?.level ?? 1;
    const base = 1;
    const points = Math.max(0, level - 1);
    this.editableStats = { str: base, dex: base, int: base, pointsAvailable: points };
    const mhAny: any = this.metaHero as any;
    if (mhAny.stats) {
      this.editableStats.str = mhAny.stats.str ?? this.editableStats.str;
      this.editableStats.dex = mhAny.stats.dex ?? this.editableStats.dex;
      this.editableStats.int = mhAny.stats.int ?? this.editableStats.int;
      // recalc pointsAvailable conservatively
      const spent = (this.editableStats.str + this.editableStats.dex + this.editableStats.int) - 3;
      this.editableStats.pointsAvailable = Math.max(0, points - spent);
    }
  }

  closeStartMenu() {
    console.log("closing start menu");
    this.isStartMenuOpened = false;
    this.isPartyPanelOpen = false;
    this.isChangeStatsOpen = false;
    if (this.hero) this.hero.isLocked = false;
    this.parentRef?.closeOverlay(false);
  }

  openPartyPanel() {
    this.isPartyPanelOpen = true;
    this.isChangeStatsOpen = false;
    // ensure party members list is up to date
    if (this.metaHero && this.metaHero.id) {
      this.bonesService.getPartyMembers(this.metaHero.id).then(pm => {
        this.partyMembers = pm ?? [];
        if (this.mainScene && this.mainScene.inventory) {
          this.mainScene.inventory.partyMembers = this.partyMembers;
          this.mainScene.inventory.renderParty();
        }
        // reconcile optimistic invites
        this.reconcilePendingInvites();
      }).catch(() => { });
    }
  }

  confirmLeaveParty() {
    this.showLeaveConfirm = true;
    this.parentRef?.showOverlay();
  }

  cancelLeaveParty() {
    this.showLeaveConfirm = false;
    this.parentRef?.closeOverlay();
  }

  async leavePartyConfirmed() {
    this.showLeaveConfirm = false;
    this.parentRef?.showOverlay();
    await this.leaveParty();
    this.parentRef?.closeOverlay();
  }

  async inviteToParty(heroId: number) {
    if (!this.metaHero || !this.metaHero.id) return;
    // If an invite is pending and not expired, block resending
    const existing = this.pendingInvites.get(heroId);
    if (existing && existing > Date.now()) {
      alert('Invite already pending. Please wait for recipient to accept or for it to expire.');
      return;
    }
    // optimistic: add pending invite with 20s expiry
    this.addPendingInvite(heroId, 20000);
    try {
      const res: any = await this.bonesService.inviteToParty(this.metaHero.id, heroId);
      // If server explicitly indicates the target is already in a party, show a temporary message
      if (res && res.invited === false) {
        // remove optimistic pending and show "already in a party" for 5s
        this.setAlreadyInPartyStatus(heroId, 5000);
        return;
      }
      // if server responds negatively in other ways, revert optimistic UI (with animation)
      if (!(res && (res.success === undefined || res.success === true))) {
        this.animateClearPending(heroId);
        alert('Invite failed.');
      }
      // otherwise, server accepted — partyMembers will be reconciled on next fetch
    } catch (err) {
      this.animateClearPending(heroId);
      console.error('inviteToParty failed', err);
      alert('Invite failed.');
    }

  }

  // Add a pending invite entry that auto-expires after `ttlMs` milliseconds
  private addPendingInvite(heroId: number, ttlMs: number) {
    const expiry = Date.now() + ttlMs;
    this.pendingInvites.set(heroId, expiry);
    // set initial seconds value for UI and ensure updater is running
    try { this.pendingInviteSeconds.set(heroId, Math.ceil(ttlMs / 1000)); } catch { }
    try { this.ensurePendingInvitesInterval(); } catch { }
    setTimeout(() => {
      const cur = this.pendingInvites.get(heroId);
      if (cur && cur === expiry) {
        // expired — play clearing animation and remove after animation
        this.animateClearPending(heroId);
      }
    }, ttlMs + 50);
  }

  // Remove pending invites that are expired or that are now present in partyMembers
  private reconcilePendingInvites() {
    const now = Date.now();
    const partySet = new Set((this.partyMembers || []).map(p => p.heroId));
    for (const [heroId, expiry] of Array.from(this.pendingInvites.entries())) {
      if (expiry <= now) {
        // expired — animate clear
        this.animateClearPending(heroId);
        continue;
      }
      if (partySet.has(heroId)) {
        // accepted — animate clear
        this.animateClearPending(heroId);
      }
    }
  }

  // Start a clearing animation for a pending invite, then remove internal state after animation finishes
  private animateClearPending(heroId: number, animationMs: number = 600) {
    try {
      // If already animating, ignore
      if (this.pendingClearing.has(heroId)) return;
      // If no pending invite exists, nothing to animate but still ensure removal
      if (!this.pendingInvites.has(heroId)) return;
      // mark as animating
      this.pendingClearing.add(heroId);
      // clear any existing timer
      const existing = this.pendingClearingTimers.get(heroId);
      if (existing) { try { clearTimeout(existing); } catch { } }
      const t = setTimeout(() => {
        try {
          this.pendingClearing.delete(heroId);
          this.pendingClearingTimers.delete(heroId);
          this.pendingInvites.delete(heroId);
          try { this.pendingInviteSeconds.delete(heroId); } catch { }
        } catch { }
      }, animationMs + 20);
      this.pendingClearingTimers.set(heroId, t);
    } catch (ex) { console.error('animateClearPending failed', ex); }
  }

  async leaveParty() {
    if (!this.metaHero || !this.metaHero.id) return;
    const userId = this.parentRef?.user?.id ?? undefined;
    await this.bonesService.leaveParty(this.metaHero.id, userId);
    this.partyMembers = this.partyMembers.filter(x => x.heroId == this.metaHero.id);
    this.reinitializeInventoryData();
    alert('Left party');
  }


  // Return whether given heroId is in the player's party (includes optimistic invites)
  isInParty(heroId: number) {
    if ((this.partyMembers || []).some(p => p.heroId === heroId)) return true;
    const expiry = this.pendingInvites.get(heroId);
    if (expiry && expiry > Date.now()) return true; // optimistic (not expired)
    return false;
  }

  // Return whether an invite is currently pending (and not expired)
  isInvitePending(heroId: number) {
    const expiry = this.pendingInvites.get(heroId);
    return !!(expiry && expiry > Date.now());
  }

  // Internal: ensure the periodic pending-seconds updater is running when needed
  private ensurePendingInvitesInterval() {
    if (this._pendingInvitesInterval) return;
    this._pendingInvitesInterval = setInterval(() => {
      const now = Date.now();
      let any = false;
      for (const [heroId, expiry] of Array.from(this.pendingInvites.entries())) {
        const left = Math.max(0, Math.ceil((expiry - now) / 1000));
        this.pendingInviteSeconds.set(heroId, left);
        if (expiry > now) any = true;
      }
      // remove seconds for invites that no longer exist
      for (const id of Array.from(this.pendingInviteSeconds.keys())) {
        if (!this.pendingInvites.has(id)) this.pendingInviteSeconds.delete(id);
      }
      if (!any) {
        try { clearInterval(this._pendingInvitesInterval); } catch { }
        this._pendingInvitesInterval = undefined;
      }
    }, 500);
  }

  private setAlreadyInPartyStatus(heroId: number, ms: number = 5000) {

    this.pendingInvites.delete(heroId);
    this.pendingInviteSeconds.delete(heroId);
    if (this.pendingClearing.has(heroId)) {
      const t = this.pendingClearingTimers.get(heroId);
      if (t) clearTimeout(t);
      this.pendingClearing.delete(heroId);
      this.pendingClearingTimers.delete(heroId);
    }

    const until = Date.now() + ms;
    this.alreadyInPartyUntil.set(heroId, until);
    const existing = this.alreadyInPartyTimers.get(heroId);
    if (existing) { try { clearTimeout(existing); } catch { } }
    const to = setTimeout(() => {
      try { this.alreadyInPartyUntil.delete(heroId); this.alreadyInPartyTimers.delete(heroId); } catch { }
    }, ms + 50);
    this.alreadyInPartyTimers.set(heroId, to);

  }

  isAlreadyInPartyStatus(heroId: number) {
    const t = this.alreadyInPartyUntil.get(heroId);
    return !!(t && t > Date.now());
  }
  getAlreadyInPartySeconds(heroId: number): number | null {
    const t = this.alreadyInPartyUntil.get(heroId);
    if (!t) return null;
    return Math.max(0, Math.ceil((t - Date.now()) / 1000));
  }

  isPendingClearing(heroId: number) {
    return this.pendingClearing.has(heroId);
  }

  getSortedHeroes() {
    if (!this.otherHeroes) return [] as MetaHero[];
    let filtered = this.otherHeroes.filter(h => h.id !== this.metaHero?.id);
    if (this.partyFilter === 'party') {
      const partySet = new Set((this.partyMembers || []).map(p => p.heroId));
      filtered = filtered.filter(h => partySet.has(h.id));
    } else if (this.partyFilter === 'nearby') {
      const myPos = this.metaHero?.position;
      if (myPos) {
        filtered = filtered.filter(h => h.position && Math.hypot(h.position.x - myPos.x, h.position.y - myPos.y) <= 800);
      }
    }
    const partySet = new Set((this.partyMembers || []).map(p => p.heroId));
    const myPos = this.metaHero?.position;
    filtered.sort((a, b) => {
      const aIn = partySet.has(a.id) ? 0 : 1;
      const bIn = partySet.has(b.id) ? 0 : 1;
      if (aIn !== bIn) return aIn - bIn; // party members first
      if (myPos && a.position && b.position) {
        const da = Math.hypot(a.position.x - myPos.x, a.position.y - myPos.y);
        const db = Math.hypot(b.position.x - myPos.x, b.position.y - myPos.y);
        return da - db;
      }
      return (a.name ?? '').localeCompare(b.name ?? '');
    });
    return filtered;
  }

  openChangeStats() {
    this.isPartyPanelOpen = false;
    const mh: MetaHero = this.metaHero || {};
    const cached = this.cachedStats ?? {} as any;
    const str = (cached.str !== undefined) ? cached.str : ((mh.str !== undefined && mh.str !== null) ? mh.str : undefined);
    const dex = (cached.dex !== undefined) ? cached.dex : ((mh.dex !== undefined && mh.dex !== null) ? mh.dex : undefined);
    const intl = (cached.int !== undefined) ? cached.int : ((mh.int !== undefined && mh.int !== null) ? mh.int : undefined);
    const level = mh.level ?? 1;
    const allocated = (str ?? 0) + (dex ?? 0) + (intl ?? 0);
    const pointsAvailable = Math.max(0, level - allocated);
    this.editableStats = { str: Math.max(1, str ?? 1), dex: Math.max(1, dex ?? 1), int: Math.max(1, intl ?? 1), pointsAvailable };
    setTimeout(() => { this.isChangeStatsOpen = true; }, 100);
    // capture original for change detection
    try {
      this.statsOriginal = { str: this.editableStats.str, dex: this.editableStats.dex, int: this.editableStats.int };
    } catch {
      this.statsOriginal = undefined;
    }
    console.log("opened change stats with ", this.editableStats);
  }

  closeChangeStats() {
    this.isChangeStatsOpen = false;
    this.parentRef?.closeOverlay();
  }

  adjustStat(stat: 'str' | 'dex' | 'int', delta: number) {
    if (!this.editableStats) return;
    // Defensive checks: ensure we don't go below 1 and don't overspend points
    const current = (this.editableStats as any)[stat] as number;
    const next = current + delta;
    if (next < 1) return;
    if (delta > 0 && this.editableStats.pointsAvailable <= 0) return;
    (this.editableStats as any)[stat] = next;
    if (delta > 0) this.editableStats.pointsAvailable -= delta; else this.editableStats.pointsAvailable += Math.abs(delta);
  }

  // Simple helper to detect if the editable stats differ from the original capture
  get statsChanged(): boolean {
    if (!this.statsOriginal) return false;
    return this.editableStats.str !== this.statsOriginal.str || this.editableStats.dex !== this.statsOriginal.dex || this.editableStats.int !== this.statsOriginal.int;
  }

  async applyStats() {
    // send to server if API exists
    await this.bonesService.updateHeroStats(
      this.metaHero.id,
      { str: this.editableStats.str, dex: this.editableStats.dex, int: this.editableStats.int },
      this.parentRef?.user?.id
    );
    // Update local metaHero so UI reflects the new stats immediately
    if (this.metaHero) {
      this.metaHero.str = this.editableStats.str;
      this.metaHero.dex = this.editableStats.dex;
      this.metaHero.int = this.editableStats.int;
    }
    // If in-game hero object exists, you may want to apply derived changes here
    if (this.hero) {
      (this.hero as any).str = this.editableStats.str;
      (this.hero as any).dex = this.editableStats.dex;
      (this.hero as any).int = this.editableStats.int;
    } 

    this.statsUpdatedVisible = true;
    // Clear any existing timer
     if (this.statsUpdatedTimer) {
      clearTimeout(this.statsUpdatedTimer);
     }
    this.statsUpdatedTimer = setTimeout(() => {
        this.statsUpdatedVisible = false;  
      this.closeStartMenu();  
    }, 3000);
    
    // Persist to cachedStats so future fetches that omit stats keep these values
    this.cachedStats = { str: this.editableStats.str, dex: this.editableStats.dex, int: this.editableStats.int };
       
  }

  async openTownPortal() {
    try {
      if (!this.metaHero || !this.metaHero.id) return;
      const userId = this.parentRef?.user?.id;
      const map = this.metaHero.map || 'Town';
      const x = Math.floor((this.metaHero.position?.x ?? 0));
      const y = Math.floor((this.metaHero.position?.y ?? 0));
      this.closeStartMenu();
      await this.bonesService.createTownPortal(this.metaHero.id, map, x, y, userId);
      alert('Town portal created');
    } catch (ex) { console.error('openTownPortal failed', ex); alert('Failed to open town portal'); }
  }

  openChangeCharacter() {
    this.closeMenuPanel();
    setTimeout(() => {
      this.isChangeCharacterOpen = true;
      this.parentRef?.showOverlay();
      this.loadSelections();
    }, 100);
  }

  closeChangeCharacter() {
    this.isChangeCharacterOpen = false;
    this.parentRef?.closeOverlay();
  }

  async loadSelections() {
    if (!this.parentRef?.user?.id) return;
    try {
      const res = await this.bonesService.getHeroSelections(this.parentRef.user.id);
      this.heroSelections = Array.isArray(res) ? res : [];
    } catch (ex) { console.error('Failed to load selections', ex); this.heroSelections = []; }
  }

  get filteredHeroSelections() {
    try {
      const name = this.metaHero?.name ?? null;
      if (!this.heroSelections || this.heroSelections.length === 0) return [] as any[];
      if (!name) return this.heroSelections.slice();
      return this.heroSelections.filter(s => !(s && s.name === name));
    } catch { return this.heroSelections ?? []; }
  }

  async createNewCharacterSelection() {
    if (!this.parentRef?.user?.id) return;
    await this.bonesService.createHeroSelection(this.parentRef.user.id);
    window.location.href = '/Bones';  
  }
  async promoteSelection(id: number) {
    try {
      // Only instruct server to promote the chosen selection.
      // Do NOT create a new bones_hero_selection here — server will update the existing selection matching the current hero id.
      await this.bonesService.promoteHeroSelection(id);
      // Reload bones page to pick up server-side changes
      window.location.href = '/Bones';
    } catch (ex) { console.error('Failed to promote selection', ex); }
  }

  async deleteSelection(id: number) {
    try {
      if (!confirm('Are you sure you want to delete this saved character? This action cannot be undone.')) return;
      await this.bonesService.deleteHeroSelection(id);
      await this.loadSelections();
    } catch (ex) { console.error('Failed to delete selection', ex); }
  }

  closeMenuPanel() {
    this.isMenuPanelOpen = false;
    this.closeStartMenu();
    if (this.parentRef) {
      this.parentRef.closeOverlay();
    }
  }
  volumePercent(): number {
    return Math.round((this.currentVolume ?? 0) * 100);
  }


  // Return remaining seconds for a hero's pending invite, or null if none
  getPendingSeconds(heroId: number): number | null {
    const v = this.pendingInviteSeconds.get(heroId);
    return (typeof v === 'number') ? v : null;
  }

  toggleMusic() {
    this.isMusicMuted = !this.isMusicMuted;
    resources.setMusicMuted(this.isMusicMuted);
    if (!this.isMusicMuted) {
      resources.playSound("shadowsUnleashed", { volume: 0.4, loop: true, allowOverlap: false });
    } else {
      resources.stopSound("shadowsUnleashed");
    }
    this.isMuted = this.isMusicMuted;
    if (this.parentRef?.user?.id) {
      this.userService.updateMuteSounds(this.parentRef.user.id, this.isMuted).catch(() => { });
    }
  }

  toggleSfx() {
    this.isSfxMuted = !this.isSfxMuted;
    resources.setSfxMuted(this.isSfxMuted);
    this.isMuted = this.isMusicMuted && this.isSfxMuted;
  }

  onVolumeSliderInput(e: Event) {
    try {
      const val = Number((e.target as HTMLInputElement).value);
      if (!isNaN(val)) {
        const vol = Math.max(0, Math.min(100, val)) / 100.0;
        this.currentVolume = vol;
        resources.setVolumeMultiplier(this.currentVolume);
      }
    } catch { }
  }

  onVolumeChange(e: Event) {
    try {
      // Persist to localStorage for simple persistence across sessions
      localStorage.setItem('bonesVolume', String(this.currentVolume));
      // Ensure the persisted value is applied to any currently-playing audio
      try { resources.setVolumeMultiplier(this.currentVolume); } catch { }
    } catch { }
  }
  private fetchUserSettings() {
    this.userService.getUserSettings(this.parentRef?.user?.id ?? 0).then(res => {
      this.cachedDefaultName = res?.lastCharacterName ?? undefined;
      this.cachedDefaultColor = res?.lastCharacterColor ?? undefined;
      this.isMuted = !!res?.muteSounds;
      this.isMusicMuted = this.isMuted;
      this.isSfxMuted = false;
      resources.setMusicMuted(this.isMusicMuted);
      resources.setSfxMuted(this.isSfxMuted);
      // Initialize volume from localStorage if present 
      const saved = localStorage.getItem('bonesVolume');
      if (saved !== null) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed)) {
          this.currentVolume = Math.max(0, Math.min(1, parsed));
          resources.setVolumeMultiplier(this.currentVolume);
        }
      }

      if (!this.isMusicMuted) {
        const startMusic = () => {
          resources.playSound("shadowsUnleashed", { volume: 0.4, loop: true, allowOverlap: false });
          document.removeEventListener('pointerdown', startMusic);
          document.removeEventListener('keydown', startMusic);
        };
        document.addEventListener('pointerdown', startMusic, { once: true });
        document.addEventListener('keydown', startMusic, { once: true });
      }
    }).catch(() => { });
  }

  clearPendingInvitePopup() {
    try { if (this.pendingInviteTimer) clearInterval(this.pendingInviteTimer); } catch { }
    this.pendingInviteTimer = undefined;
    this.pendingInvitePopup = null;
    this.pendingInviteSecondsLeft = null;
  }

  async acceptInvite() {
    if (!this.pendingInvitePopup) return;
    const inviterId = this.pendingInvitePopup.inviterId;
    // Build a party members list: include current members, inviter, and self
    const currentIds = Array.isArray(this.partyMembers) ? this.partyMembers.map(p => p.heroId) : [];
    const union = Array.from(new Set([...currentIds, this.metaHero.id, inviterId]));
    try {
      const metaEvent = new MetaEvent(0, this.metaHero.id, new Date(), "PARTY_INVITE_ACCEPTED", this.metaHero.map, { "party_members": JSON.stringify(union) });
      await this.bonesService.updateEvents(metaEvent);
      // Optimistically apply party locally, then fetch server canonical party to reconcile
      this.partyMembers = union.map(id => {
        const other = this.otherHeroes.find(h => h.id === id);
        const nameStr = other ? (other.name ?? `Hero ${id}`) : (id === this.metaHero.id ? (this.metaHero.name ?? `You`) : `Hero ${id}`);
        return { heroId: id, name: nameStr, color: other ? (other as any).color : undefined };
      });
      // Clear any optimistic pending invites for these heroes
      for (const id of union) { this.pendingInvites.delete(id); }

      const resp: any = await this.bonesService.getPartyMembers(this.metaHero.id);
      if (Array.isArray(resp)) {
        // resp items are { heroId, name, color }
        this.partyMembers = resp.map((p: any) => ({ heroId: p.heroId ?? p.id ?? 0, name: p.name ?? '', color: p.color }));
      }
      if (this.mainScene && this.mainScene.inventory) {
        this.mainScene.inventory.partyMembers = this.partyMembers;
        this.mainScene.inventory.renderParty();
      }

    } catch (ex) {
      console.error('Failed to accept party invite', ex);
    }
    this.clearPendingInvitePopup();
  }

  rejectInvite() {
    this.clearPendingInvitePopup();
  }

  private async handleHeroDeath(params: { killerId?: string | number | null, killerUserId?: number | null, cause?: string | null }) {
    // Debug: log method entry and incoming params (safe stringify)
    try {
      console.debug('handleHeroDeath ENTRY', JSON.parse(JSON.stringify(params)));
    } catch (ex) {
      try { console.debug('handleHeroDeath ENTRY (raw)', params); } catch { }
    }

    let killerId = Number(params.killerId);
    let killerUserId = Number(params.killerUserId);
    let cause = params.cause;

    if (cause != "spawned_dead") {
      if (killerId && killerId < 0) {
        const killer = this.mainScene.level.children.filter((x: any) => x.heroId == killerId);
        if (killer.length > 0) {
          this.deathKillerName = killer[0].name;
        }
      } else {
        const killer = this.otherHeroes.filter(x => x.id == killerId);
        if (killer) {
          this.deathKillerName = killer[0].name;
          this.deathKillerUserId = killer[0].userId;
        }
      }
    } else {
      this.deathKillerName = "Spawned Dead";
    }

    this.stopPollingForUpdates = true;
    this.isDead = true;
    // Stop the game loop briefly and show a death panel, then return player to 0,0
    setTimeout(() => {
      try { this.gameLoop.stop(); } catch { }
      try { this.mainScene?.destroy(); } catch { }
      this.showDeathPanel = true;
      this.isMenuPanelOpen = false;
      this.parentRef?.showOverlay();
    }, 500);
  }

  async returnFromDeath() {
    this.metaHero = await this.bonesService.respawnHero(this.metaHero.id);
    window.location.href = '/Bones';
  }

  private copyStatsFromMetaHero(rz: MetaHero) {
    const prevMeta = { str: this.metaHero?.str, dex: this.metaHero?.dex, int: this.metaHero?.int };

    // copy into metaHero and persist to cachedStats so later fetches that omit stats don't wipe them
    this.metaHero.dex = rz.dex;
    this.metaHero.str = rz.str;
    this.metaHero.int = rz.int;

    const sstr = (rz as any)?.str ?? (rz as any)?.stats?.str;
    const sdex = (rz as any)?.dex ?? (rz as any)?.stats?.dex;
    const sint = (rz as any)?.int ?? (rz as any)?.stats?.int;

    const beforeCache = this.cachedStats ? { ...this.cachedStats } : undefined;

    // Only set cachedStats when we have at least one defined value to avoid overwriting good cache with undefined
    if (sstr !== undefined || sdex !== undefined || sint !== undefined) {
      this.cachedStats = {
        str: (sstr !== undefined ? Number(sstr) : (this.cachedStats?.str ?? 1)),
        dex: (sdex !== undefined ? Number(sdex) : (this.cachedStats?.dex ?? 1)),
        int: (sint !== undefined ? Number(sint) : (this.cachedStats?.int ?? 1)),
      };
    }


  }

  private reconcileDroppedItemsFromFetch(res: any) {
    // Delegate to centralized network helper
    try { reconcileDroppedItemsFromFetch(this, res); } catch (ex) { console.warn('reconcileDroppedItemsFromFetch delegation failed', ex); }
  }
}
