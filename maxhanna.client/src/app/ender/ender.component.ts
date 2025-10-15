import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { MetaHero } from '../../services/datacontracts/ender/meta-hero';
import { Vector2 } from '../../services/datacontracts/ender/vector2';
import { User } from '../../services/datacontracts/user/user';
import { EnderService } from '../../services/ender.service';
import { UserService } from '../../services/user.service';
import { MetaChat } from '../../services/datacontracts/ender/meta-chat';
import { gridCells, snapToGrid, UP, DOWN, LEFT, RIGHT } from './helpers/grid-cells';
import { GameLoop } from './helpers/game-loop';
import { hexToRgb, resources } from './helpers/resources';
import { events } from './helpers/events';
import { storyFlags } from './helpers/story-flags';
import { actionMultiplayerEvents, subscribeToMainGameEvents } from './helpers/network';
import { Hero } from './objects/Hero/hero';
import { BikeWall } from './objects/Environment/bike-wall';
import { Main } from './objects/Main/main';
import { HeroRoomLevel } from './levels/hero-room';
import { CharacterCreate } from './levels/character-create';
import { Level } from './objects/Level/level';
import { MetaEvent } from '../../services/datacontracts/ender/meta-event';
import { InventoryItem } from './objects/InventoryItem/inventory-item';
import { ColorSwap } from '../../services/datacontracts/ender/color-swap';
import { Mask, getMaskNameById } from './objects/Wardrobe/mask';
import { Character } from './objects/character';
import { ChatSpriteTextString } from './objects/SpriteTextString/chat-sprite-text-string';
import { MetaBikeWall } from '../../services/datacontracts/ender/meta-bike-wall';

@Component({
    selector: 'app-ender',
    templateUrl: './ender.component.html',
    styleUrls: ['./ender.component.css'],
    standalone: false
})

export class EnderComponent extends ChildComponent implements OnInit, OnDestroy, AfterViewInit {
    @ViewChild('gameCanvas', { static: true }) gameCanvas!: ElementRef<HTMLCanvasElement>;
    @ViewChild('chatInput') chatInput!: ElementRef<HTMLInputElement>;
    @ViewChild('colorInput') colorInput!: ElementRef<HTMLInputElement>;

    constructor(private enderService: EnderService, private userService: UserService) {
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

    mainScene?: any;
    metaHero: MetaHero;
    hero?: Hero;
    otherHeroes: MetaHero[] = [];
    // Map heroId -> first time (ms since epoch) seen on current level
    private heroFirstSeen: Map<number, number> = new Map<number, number>();
    // Track whether we've ever observed a hero move (based on server snapshots)
    private heroEverMoved: Map<number, boolean> = new Map<number, boolean>();
    // Last server-known position per hero (used to detect movement across snapshots)
    private lastServerPos: Map<number, Vector2> = new Map<number, Vector2>();
    showOtherHeroesPanel: boolean = false;
    enemiesOnSameLevelCount: number = 0;
    currentScore: number = 0;
    wallsPlacedAuthoritative: number = 0;
    showDeathPanel: boolean = false;
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
    // Count consecutive failures to fetch game data; when threshold reached notify parent
    private consecutiveFetchFailures: number = 0;
    deathKillerUserId: number | undefined;


    private currentChatTextbox?: ChatSpriteTextString | undefined;
    private pollingInterval: any;
    // Abort controller for the current inflight fetchGameDataWithWalls request
    private currentFetchAbortController?: AbortController;
    topScores: any[] = [];
    isMenuPanelOpen = false;
    // Count of bike-wall units placed during the current run
    wallsPlacedThisRun: number = 0;
    // cached defaults loaded from user settings (used when opening CharacterCreate)
    private cachedDefaultName?: string;
    cachedDefaultColor?: string;
    // Millisecond timestamp when the current run/level started
    runStartTimeMs: number | undefined = undefined;
    // Live elapsed seconds for HUD
    runElapsedSeconds: number = 0;
    private runElapsedInterval: any;
    // In-memory set of meta bike walls (keys: "x|y") for fast existence checks
    // Track only the highest wall id we've processed; we don't retain all wall coordinates persistently.
    private lastKnownWallId: number = 0;
    // Temporary cache of wall position keys added during the last update to avoid re-adding
    private lastAddedWallKeys: Set<string> = new Set<string>();
    // Map of last-added wall keys to the instantiated BikeWall objects for quick destruction when they are removed
    private lastAddedWallObjects: Map<string, BikeWall> = new Map<string, BikeWall>();
    // Reference to level to reset delta tracking when level changes
    private persistedWallLevelRef: any = undefined;
    // Collect all locally spawned walls since last fetch (delta batch)
    private pendingWallsBatch: { x: number, y: number }[] = [];
    // Collect walls created while server was down so we can remove them from backend on recovery
    private offlineCreatedWalls: { x: number, y: number }[] = [];
    // Saved location when server goes down; restore before restart
    private savedLocation?: Vector2;
    // In-memory map of heroId -> color string for applying color swaps to bike walls
    private heroColors: Map<number, string> = new Map<number, string>();
    // Cache of user objects keyed by userId to avoid reloading/causing avatar flicker
    public cachedUsers: Map<number, User> = new Map<number, User>();
    // Champion (global best) info cached for CharacterCreate prompts
    private championName?: string;
    private championScore?: number;
    isMuted: boolean = false; // user preference for Ender sounds

    async ngOnInit() {
        this.serverDown = (this.parentRef ? await this.parentRef?.isServerUp() <= 0 : false);
        this.parentRef?.setViewportScalability(false);
        this.parentRef?.addResizeListener();
        this.canvas = this.gameCanvas.nativeElement;
        this.ctx = this.canvas.getContext("2d")!;
        if (!this.parentRef?.user) {
            this.isUserComponentOpen = true;
        } else { 
            // Preload user settings (default name/color) as early as possible so CharacterCreate can use them
            this.userService.getUserSettings(this.parentRef.user?.id ?? 0).then(res => {
                this.cachedDefaultName = res?.lastCharacterName ?? undefined;
                this.cachedDefaultColor = res?.lastCharacterColor ?? undefined;
                this.isMuted = !!res?.muteSounds;
                resources.setMuted(this.isMuted);
                if (!this.isMuted) {
                    // Try to play immediately; many browsers will block autoplay without a user gesture.
                    // Also register a one-time user-gesture handler to ensure playback starts when the user interacts.
                    resources.playSound("pixelDreams", { volume: 0.4, loop: true, allowOverlap: false });
                    const startMusic = () => {
                        resources.playSound("pixelDreams", { volume: 0.4, loop: true, allowOverlap: false });
                        document.removeEventListener('pointerdown', startMusic);
                        document.removeEventListener('keydown', startMusic);
                    };
                    document.addEventListener('pointerdown', startMusic, { once: true });
                    document.addEventListener('keydown', startMusic, { once: true });
                }
            }).catch(() => { /* ignore */ });
            // reset walls placed for a fresh run; actual run start will be set when hero is initialized
            this.wallsPlacedThisRun = 0;
            this.runStartTimeMs = undefined;
            this.runElapsedSeconds = 0;
            this.stopRunTimer();
            this.startLoading();
            this.pollForChanges();
            this.gameLoop.start();
            this.stopLoading();
        }

        window.addEventListener("resize", this.adjustCanvasSize);
        this.adjustCanvasSize();
    }

    showMenuPanel() {
        if (this.isMenuPanelOpen) {
            this.closeMenuPanel();
            return;
        }
        this.isMenuPanelOpen = true;
        this.parentRef?.showOverlay();
        this.enderService.getTopScores(50).then((res: any) => {
            this.topScores = res ?? [];
        }).catch(() => this.topScores = []);
    }
    closeMenuPanel() { this.isMenuPanelOpen = false; this.parentRef?.closeOverlay(); }


    ngOnDestroy() {
        clearInterval(this.pollingInterval);
        this.mainScene.destroy();
        this.gameLoop.stop(); 
        resources.stopSound("pixelDreams");  
        this.remove_me('EnderComponent');
        this.parentRef?.setViewportScalability(true);
        this.parentRef?.removeResizeListener();
    }

    toggleMuteSounds() {
        this.isMuted = !this.isMuted;
        resources.setMuted(this.isMuted);
        if (this.isMuted) {
            resources.stopSound("pixelDreams");
        } else {
            resources.playSound("pixelDreams", { volume: 0.4, loop: true, allowOverlap: false });
        }
        if (this.parentRef?.user?.id) {
            this.userService.updateMuteSounds(this.parentRef.user.id, this.isMuted).catch(()=>{});
        }
    }

    private async handleHeroDeath(killerId: string) {
        const killerMeta = this.otherHeroes.find(h => h.id === parseInt(killerId)) ?? (this.metaHero.id === parseInt(killerId) ? this.metaHero : undefined);
        this.deathKillerUserId = killerMeta?.userId ?? undefined;
        this.stopPollingForUpdates = true;
        this.stopRunTimer();
        setTimeout(() => {
            this.gameLoop.stop();
            this.mainScene?.destroy();
            this.showDeathPanel = true;
            // ensure other overlays closed
            this.isMenuPanelOpen = false;
            this.showOtherHeroesPanel = false;
            this.parentRef?.showOverlay();
        }, 1200);
    }

    restartGame() {
        window.location.href = '/Ender';
    }


    ngAfterViewInit() {
        this.mainScene.input.setChatInput(this.chatInput.nativeElement);
        events.on("HERO_DIED", this, (killerId: string) => {
            this.handleHeroDeath(killerId);
        });
        // Track bike wall placements so we can submit to highscores
        events.on("SPAWN_BIKE_WALL", this, (params: { x: number, y: number }) => {
            // only count placements from the local hero and only after run started
            if (this.runStartTimeMs && params) {
                this.wallsPlacedThisRun = (this.wallsPlacedThisRun ?? 0) + 1;
            }
            // accumulate walls until next poll
            this.pendingWallsBatch.push({ x: params.x, y: params.y });
            // if server is down, stash these with level/hero so we can delete them on recovery
            if (this.serverDown) { 
                this.offlineCreatedWalls.push({ x: params.x, y: params.y }); 
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
            const rz = await this.enderService.getHero(this.parentRef.user.id);
            if (rz) {
                this.partyMembers = await this.enderService.getPartyMembers(rz.id) ?? [];
                this.mainScene.partyMembers = this.partyMembers;
                this.mainScene.inventory.partyMembers = this.partyMembers;
                this.mainScene.inventory.renderParty();
                await this.reinitializeHero(rz);
                await this.setHeroColors();
                // Try to load persisted walls for this hero so walls placed previously are visible immediately
                this.currentFetchAbortController = new AbortController(); 
                const signal = this.currentFetchAbortController.signal;
                const res: any = await this.enderService.fetchGameDataWithWalls(this.metaHero, [], this.lastKnownWallId, signal);
                this.placeWallsAroundPlayer(res);
            } else {
                await this.enderService.getGlobalBestScore().then((best: any) => {
                    if (best && (best.username || best.user_id)) {
                        this.championName = best.username || ('User' + best.user_id);
                        this.championScore = best.score ?? 0;
                    }
                });
                if (this.cachedDefaultName !== undefined || this.cachedDefaultColor !== undefined) {
                    this.mainScene.setLevel(new CharacterCreate({ defaultName: this.cachedDefaultName, defaultColor: this.cachedDefaultColor, championName: this.championName, championScore: this.championScore }));
                } else {
                    this.userService.getUserSettings(this.parentRef?.user?.id ?? 0).then(res => {
                        const defaultName = res?.lastCharacterName ?? undefined;
                        const defaultColor = res?.lastCharacterColor ?? undefined;
                        this.mainScene.setLevel(new CharacterCreate({ defaultName, defaultColor, championName: this.championName, championScore: this.championScore }));
                    }).catch(() => {
                        this.mainScene.setLevel(new CharacterCreate({ championName: this.championName, championScore: this.championScore }));
                    });
                }
                return;
            }
        }

        this.updatePlayers();
        clearInterval(this.pollingInterval);
        this.pollingInterval = setInterval(async () => {
            this.updatePlayers();
        }, this.pollSeconds * 1000);
    }

    private async setHeroColors() {
        let heroes = undefined;
        if (this.otherHeroes && this.otherHeroes.length > 0) {
            heroes = this.otherHeroes;
        } else {
            const recentData = await this.enderService.fetchGameDataWithWalls(this.metaHero, undefined, undefined);
            heroes = recentData.heroes;
        }
        if (heroes) {
            for (var hero of heroes as MetaHero[]) {
                const oldOwnerColor = this.heroColors.get(hero.id) ?? undefined;
                if (!oldOwnerColor && hero.id && hero.color) {
                    this.heroColors.set(hero.id, hero.color);
                }
            }
        }
    }

    private async updatePlayers() {
        if (this.metaHero && this.metaHero.id && !this.stopPollingForUpdates) {
            const pendingWalls = this.pendingWallsBatch.length > 0 ? [...this.pendingWallsBatch] : undefined;
            this.pendingWallsBatch = [];
            if (this.hero && this.metaHero) {
                this.metaHero.position = this.hero?.position.duplicate();
            }
            try {
                // Abort any in-flight fetch so we only keep the freshest request
                this.currentFetchAbortController?.abort();
                this.currentFetchAbortController = new AbortController();
                const signal = this.currentFetchAbortController.signal;
                const res: any = await this.enderService.fetchGameDataWithWalls(this.metaHero, pendingWalls, this.lastKnownWallId, signal);
                if (!res) {
                    // treat null/undefined as a failure
                    this.consecutiveFetchFailures++;
                    if (this.consecutiveFetchFailures >= 3) {
                        this.serverDown = true;
                        // Save the user's current location so we can restore it on recovery 
                        if (!this.savedLocation) {
                            if (this.metaHero && this.metaHero.position) {
                                this.savedLocation = new Vector2(this.metaHero.position.x, this.metaHero.position.y);
                            } else if (this.hero && this.hero.position) {
                                this.savedLocation = new Vector2(this.hero.position.x, this.hero.position.y);
                            }
                        }
                    }
                    return;
                }
                // successful fetch: reset failure counter/state
                const wasServerDown = !!this.serverDown;
                this.consecutiveFetchFailures = 0;
                this.serverDown = false;

                // If server was down and is now back, attempt to delete any walls
                // the client created while offline, then clear local caches so
                // authoritative data can repopulate cleanly.
                if (wasServerDown) { 
                    await this.recoverFromServerDown();
                    return;
                }

                if (res) { 
                    if (res.events) {
                        actionMultiplayerEvents(this, res.events);
                    }
                    if (res.heroes) {
                        const myHeroExists = res.heroes?.filter((x: MetaHero) => x.id === this.metaHero.id);
                        if (!myHeroExists) {
                            const myHero = this.mainScene?.level?.children?.filter((x: any) => x.id === this.metaHero.id);
                            myHero.destroy();
                        }
                    }
                    if (res.timeOnLevelSeconds !== undefined && res.timeOnLevelSeconds !== null) {
                        const secs = Number(res.timeOnLevelSeconds) || 0;
                        this.runElapsedSeconds = Math.max(0, Math.floor(secs));
                        this.runStartTimeMs = Date.now() - (this.runElapsedSeconds * 1000);
                        this.startRunTimer();
                    }
                    if (res.currentScore !== undefined && res.currentScore !== null) {
                        this.currentScore = Number(res.currentScore) || 0;
                    }
                    if (res.wallsPlacedForRun !== undefined && res.wallsPlacedForRun !== null) {
                        this.wallsPlacedAuthoritative = Number(res.wallsPlacedForRun) || 0;
                        // keep local displayed wallsPlacedThisRun in sync if server authoritative differs
                        if (this.wallsPlacedAuthoritative > this.wallsPlacedThisRun) {
                            this.wallsPlacedThisRun = this.wallsPlacedAuthoritative;
                        }
                    }
                    if (res.heroKills !== undefined && this.metaHero) {
                        this.metaHero.kills = Number(res.heroKills) || 0;
                    }
                    if (res.currentLevel !== undefined && this.metaHero) {
                        if (this.metaHero?.level && this.metaHero.level != res.currentLevel) {
                            this.clearWalls();
                            this.heroEverMoved.clear();
                            this.lastServerPos.clear();
                        }
                        this.metaHero.level = Number(res.currentLevel) || 1;
                    }
                    this.updateOtherHeroesBasedOnFetchedData(res);

                    this.placeWallsAroundPlayer(res);

                    if (this.chat) {
                        this.getLatestMessages();
                    }
                }
            } catch (ex: any) {
                // treat exceptions as failures to fetch
                // ignore abort errors (expected when we cancel prior requests)
                if (ex && ex.name === 'AbortError') return;
                this.consecutiveFetchFailures++;
                if (this.consecutiveFetchFailures >= 3) {
                    this.serverDown = true;
                }
                return;
            }
        }
    }

    private placeWallsAroundPlayer(res: any) {
        // Persisted bike walls for this map - use in-memory Set to avoid scanning level.children repeatedly
        const walls = Array.isArray(res.recentWalls) ? (res.recentWalls as MetaBikeWall[]) : undefined;
        if (walls && walls.length > 0 && this.mainScene.level) {
            // Reset delta tracking if level changed
            if (this.persistedWallLevelRef !== this.mainScene.level) {
                this.persistedWallLevelRef = this.mainScene.level;
                this.lastKnownWallId = 0;
            }
            // Update hero color map from server-provided heroes list when available
            if (res.heroes && Array.isArray(res.heroes)) {
                for (const h of res.heroes) {
                    const hid = (typeof h.id === 'number') ? h.id : Number(h.id);
                    if (!isNaN(hid) && h.color) {
                        this.heroColors.set(hid, h.color);
                    }
                }
            }
            const newlyAddedKeys: string[] = [];
            for (const w of walls) {
                const key = `${w.x}|${w.y}`;
                newlyAddedKeys.push(key);
                if (this.lastAddedWallKeys.has(key)) {
                    continue;
                }
                const ownerId = w.heroId;
                const ownerColor = (ownerId && this.heroColors.has(ownerId)) ? this.heroColors.get(ownerId) : undefined;
                const colorSwap = ownerColor ? new ColorSwap([0, 160, 200], hexToRgb(ownerColor!)) : (ownerId === this.metaHero.id ? (this.metaHero ? this.mainScene.metaHero?.colorSwap : undefined) : undefined);
                const wall = new BikeWall({ position: new Vector2(w.x, w.y), colorSwap, heroId: ownerId ?? 0 });
                this.mainScene.level.addChild(wall);
                
                // track the created wall object by key so we can fast-destroy it later if it's removed from authoritative set
                this.lastAddedWallObjects.set(key, wall);
                
                events.emit("BIKEWALL_CREATED", { x: w.x, y: w.y });
                if (w.id && w.id > this.lastKnownWallId) {
                    this.lastKnownWallId = w.id;
                }
            }

            // Fast-destroy any instantiated walls whose keys are no longer present 
            // in the latest lastAddedWallKeys
            this.cullExtraWalls(newlyAddedKeys);
        }
    }

    private cullExtraWalls(newlyAddedKeys: string[]) {
        // Replace the lastAddedWallKeys with the newly added set
        this.lastAddedWallKeys.clear();
        for (const k of newlyAddedKeys) this.lastAddedWallKeys.add(k);
        for (const [k, obj] of Array.from(this.lastAddedWallObjects.entries())) {
            if (!newlyAddedKeys.includes(k)) {
                if (typeof (obj as any).quickDestroy === 'function') {
                    (obj as any).quickDestroy();
                }
                this.lastAddedWallObjects.delete(k);
            }
        }
    }

    private async recoverFromServerDown() {
        if (this.offlineCreatedWalls && this.offlineCreatedWalls.length > 0) {
            await this.enderService.deleteBikeWalls({ heroId: this.metaHero.id, level: this.metaHero.level, walls: this.offlineCreatedWalls });
            this.offlineCreatedWalls = [];
        }
        // Restore saved location (if present) before restarting so the player's
        // position persists across the server outage.
        if (this.savedLocation && this.metaHero && this.metaHero.id) {
            await this.enderService.setHeroLocation({ heroId: this.metaHero.id, x: this.savedLocation.x, y: this.savedLocation.y, level: this.metaHero.level ?? 1 });
            this.savedLocation = undefined;
        }

        this.restartGame();
    }

    private updateOtherHeroesBasedOnFetchedData(res: { position: Vector2; heroes: MetaHero[]; }) {
        for (var oh of this.otherHeroes) {
            const stillExists = Array.isArray(res.heroes) && res.heroes.some(x => x.id === oh.id);
            if (oh.id && !stillExists) {
                const theHero = this.mainScene?.level?.children?.filter((x: any) => x.id === oh.id);
                theHero?.destroy();
                this.heroEverMoved.delete(oh.id);
                this.lastServerPos.delete(oh.id);
            }
        }
        if (!res || !res.heroes) {
            this.otherHeroes = [];
            this.updateEnemiesOnSameLevelCount();
            return;
        }
        // Ensure created dates are parsed and objects are instances of MetaHero
        this.otherHeroes = res.heroes.map((h: MetaHero) => {
            const pos = h.position ? new Vector2(h.position.x, h.position.y) : new Vector2(0, 0);
            // detect server-observed movement and record it 
            const prev = this.lastServerPos.get(h.id);
            if (prev && (prev.x !== pos.x || prev.y !== pos.y)) {
                this.heroEverMoved.set(h.id, true);
            }
            // always update lastServerPos
            this.lastServerPos.set(h.id, pos); 
            if (h.id && h.color) {
                this.heroColors.set(h.id, h.color);
            }
            if (h.id && !this.heroFirstSeen.has(h.id)) {
                this.heroFirstSeen.set(h.id, Date.now());
            }
            return new MetaHero(h.id, h.userId ?? 0, h.name ?? "Anon", pos, h.speed ?? 1, h.color, h.mask, h.level ?? 1, h.kills ?? 0, h.created);
        });
        this.updateEnemiesOnSameLevelCount();
        this.updateMissingOrNewHeroSprites();
    }

    openOtherHeroesPanel() {
        this.showOtherHeroesPanel = true;
        this.parentRef?.showOverlay();
    }
    closeOtherHeroesPanel() {
        this.showOtherHeroesPanel = false;
        this.parentRef?.closeOverlay();

    }

    // trackBy function for ngFor to avoid re-creating user tag components on every change detection
    public trackByHeroId(index: number, item: any) {
        return item && (item.id ?? item.userId ?? index);
    }

    // Handler for user-tag components to emit loaded users so we can cache them and reuse
    onUserTagLoaded(user?: User) {
        if (!user || !user.id) return;
        this.cachedUsers.set(user.id, user);
    }

    getHeroTimeOnMap(heroId: number): number {
        let candidateCreated: any = undefined;
        if (this.metaHero && this.metaHero.id === heroId) {
            candidateCreated = this.metaHero.created;
        } else {
            const h = this.otherHeroes?.find(x => x.id === heroId);
            candidateCreated = h?.created;
        }
        let createdMs: number | undefined = undefined;
        if (candidateCreated instanceof Date) {
            createdMs = candidateCreated.getTime();
        } else if (typeof candidateCreated === 'string') {
            const parsed = Date.parse(candidateCreated);
            if (!isNaN(parsed)) createdMs = parsed;
        } else if (typeof candidateCreated === 'number') {
            // assume already ms epoch if looks plausible (> year 2000)
            createdMs = candidateCreated > 946684800000 ? candidateCreated : candidateCreated * 1000;
        }
        if (createdMs) {
            return Math.max(0, Math.floor((Date.now() - createdMs) / 1000));
        }
        // Fallback to first-seen map if creation unavailable
        const first = this.heroFirstSeen.get(heroId);
        if (first) return Math.max(0, Math.floor((Date.now() - first) / 1000));
        return 0;
    }

    private updateMissingOrNewHeroSprites() {
        let ids: number[] = [];
        const heroesToCheck = this.otherHeroes.concat(this.metaHero);
        for (const hero of heroesToCheck) {
            let existingHero = this.mainScene.level?.children.find((x: any) => x.id === hero.id) as Character | undefined;
            if (existingHero) {
                this.setUpdatedHeroPosition(existingHero, hero);
            } else {
                existingHero = this.addHeroToScene(hero);
            }
            if (existingHero) {
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
        // compute initial position; for remote heroes, nudge one grid cell ahead
        const baseX = hero.id == this.metaHero.id ? this.metaHero.position.x : hero.position.x;
        const baseY = hero.id == this.metaHero.id ? this.metaHero.position.y : hero.position.y;
        let initialPos = new Vector2(baseX, baseY);
        const tmpHero = new Hero({
            id: hero.id,
            name: hero.name ?? "Anon",
            position: initialPos,
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
        this.mainScene.level?.addChild(tmpHero);
        return tmpHero;
    }

    private setUpdatedHeroPosition(existingHero: any, hero: MetaHero) {
        if (existingHero.id != this.metaHero.id) {
            // Check whether the live hero has moved (compare live lastPosition vs incoming server position)
            const moved = this.heroEverMoved.get(hero.id) === true;

            // Only apply bump when the hero is moving
            let offsetX = 0;
            let offsetY = 0;
            if (moved) { 
                let facing: string = DOWN;
                const live: Hero = this.mainScene?.level?.children?.find((x: any) => 
                    x.id === hero.id && x.name === hero.name && x instanceof Hero);
                if (live) {
                    facing = live.facingDirection;
                }

                const oneCell = gridCells(2);
                if (facing === RIGHT) offsetX = oneCell;
                else if (facing === LEFT) offsetX = -oneCell;
                else if (facing === UP) offsetY = -oneCell;
                else if (facing === DOWN) offsetY = oneCell;
            }
            const newPos = new Vector2(hero.position.x + offsetX, hero.position.y + offsetY);
             
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
        this.heroEverMoved.delete(rz.id);
        this.lastServerPos.delete(rz.id);
        let spawnPos: Vector2;
        // map removed; determine level-specific spawn behavior directly
        if (rz && rz.position) {
            spawnPos = new Vector2(rz.position.x, rz.position.y);
        } else {
            // fallback fixed spawn (grid cell units)
            spawnPos = new Vector2(1 * 16, 11 * 16);
        }
        const colorSwap = this.cachedDefaultColor ?? rz.color;
        this.hero = new Hero({
            id: rz.id, name: rz.name ?? "Anon",
            position: spawnPos,
            isUserControlled: true,
            speed: rz.speed,
            mask: rz.mask ? new Mask(getMaskNameById(rz.mask)) : undefined,
            colorSwap: colorSwap ? new ColorSwap([0, 160, 200], hexToRgb(colorSwap)) : undefined,
        });
        this.metaHero = new MetaHero(this.hero.id, 
            rz.userId ?? 0,
            (this.hero.name ?? "Anon"),
            this.hero.position.duplicate(),
            rz.speed,
            colorSwap,
            rz.mask,
            rz.level ?? 1,
            rz.kills ?? 0,
            rz.created ?? undefined);

        if (this.metaHero && this.metaHero.id && colorSwap) {
            const colHex = colorSwap ?? (rz.color ?? this.cachedDefaultColor ?? undefined);
            if (colHex) this.heroColors.set(this.metaHero.id, colHex);
        }

        this.mainScene.setHeroId(this.metaHero.id);
        this.mainScene.hero = this.hero;
        this.mainScene.metaHero = this.metaHero;
        storyFlags.flags = new Map<string, boolean>();

        if (!!skipDataFetch == false) {
            await this.reinitializeInventoryData(true);
        }
        const heroLevel = rz.level ?? 1;
        const level = this.getLevelFromLevelName("HeroRoom", rz.level, this.hero.position.duplicate());
        if (level) {
            // if it's a HeroRoomLevel, pass heroPosition and heroLevel when constructing
            if (level instanceof HeroRoomLevel) {
                this.mainScene.setLevel(new HeroRoomLevel({ heroPosition: this.hero.position.duplicate(), heroLevel }));
            } else {
                this.mainScene.setLevel(level);
            }
        }

        this.mainScene.camera.centerPositionOnTarget(this.metaHero.position);
        this.recomputeGameTimer(rz);
        this.updateEnemiesOnSameLevelCount();
    }

    private recomputeGameTimer(rz: MetaHero) {
        if (!this.runStartTimeMs) {
            const createdVal = rz.created ?? undefined;
            if (createdVal) {
                let millis: number | undefined = undefined;
                if (createdVal instanceof Date) {
                    millis = createdVal.getTime();
                } else if (typeof createdVal === 'string') {
                    const parsed = Date.parse(createdVal);
                    millis = isNaN(parsed) ? undefined : parsed;
                }
                this.runStartTimeMs = millis ?? Date.now();
            } else {
                this.runStartTimeMs = Date.now();
            }
        }
        this.runElapsedSeconds = 0;
        this.startRunTimer();
    }

    // Recomputes the number of other heroes who are on the same level as the local player.
    // Excludes the local player from the count.
    private updateEnemiesOnSameLevelCount() {
        try {
            if (!this.metaHero || !this.otherHeroes) {
                this.enemiesOnSameLevelCount = 0;
                return;
            }
            const myLevel = this.metaHero.level ?? 0;
            this.enemiesOnSameLevelCount = this.otherHeroes.filter(h => (h.level ?? 0) === myLevel && h.id !== this.metaHero.id).length;
        } catch (e) {
            // safe fallback
            this.enemiesOnSameLevelCount = 0;
        }
    }

    // Public method callers can use to force a recompute and fetch the current count.
    // Useful for invoking when the user's level changes elsewhere in the code.
    public fetchEnemiesOnSameLevelCount(): number {
        this.updateEnemiesOnSameLevelCount();
        return this.enemiesOnSameLevelCount;
    }

    private clearWalls() {
        // Level changed: remove only BikeWall instances immediately and
        // clear local wall tracking to avoid resurrecting stale walls.            
        this.mainScene.level.children.forEach((child: any) => { 
            if (child instanceof BikeWall) {
                if (typeof (child as any).quickDestroy === 'function') {
                    (child as any).quickDestroy();
                } else {
                    child.destroy();
                }
            } 
        });
        
        // Clear client-side tracking of persisted walls for the old level
        this.lastAddedWallKeys.clear(); 
        
        for (const [k, obj] of Array.from(this.lastAddedWallObjects.entries())) {
            if (typeof (obj as any).quickDestroy === 'function') {
                (obj as any).quickDestroy();
            } else {
                obj.destroy();
            }
            
            this.lastAddedWallObjects.delete(k);
        }
        
        this.persistedWallLevelRef = undefined;
        this.lastKnownWallId = 0;
    }
    private startRunTimer() {
        this.stopRunTimer();
        this.runElapsedInterval = setInterval(() => {
            if (this.runStartTimeMs) {
                this.runElapsedSeconds = Math.max(0, Math.floor((Date.now() - this.runStartTimeMs) / 1000));
            }
        }, 1000);
    }

    private stopRunTimer() {
        if (this.runElapsedInterval) {
            clearInterval(this.runElapsedInterval);
            this.runElapsedInterval = undefined;
        }
    }

    private async reinitializeInventoryData(skipParty = false) {
        if (this.mainScene?.inventory?.items) {
            this.mainScene.inventory.items.forEach((item: any) => this.mainScene.inventory.removeFromInventory(item.id));
        }
        await this.enderService.fetchInventoryData(this.metaHero.id).then(inventoryData => {
            if (inventoryData) {
                const inventoryItems = inventoryData.inventory as InventoryItem[];
                this.mainScene.inventory.partyMembers = this.partyMembers;
            }
            if (!this.isShopMenuOpened && !skipParty) {
                this.mainScene.inventory.renderParty();
            }
        });
    }

    private getLevelFromLevelName(key: string, level: number, heroPosition: Vector2): Level {
        const upperKey = key.toUpperCase();
        const itemsFoundNames = this.mainScene?.inventory.getItemsFound();

        if (upperKey == "HERO_ROOM" || upperKey == "HEROROOM" || upperKey == "DEFAULT")
            return new HeroRoomLevel({ itemsFound: itemsFoundNames, heroLevel: level, heroPosition: heroPosition });

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

    getChatText() {
        return this.chatInput.nativeElement.value;
    }

    snapToGridFetch(vectorX: number) {
        return snapToGrid(vectorX, gridCells(1));
    }

    async changeColor() {
        // get and normalise the hex value from the input
        let raw = (this.colorInput.nativeElement.value || "").toString();
        function normalizeHex(h: string): string | null {
            if (!h) return null;
            h = h.replace(/^#/, '');
            if (h.length === 3) {
                h = h.split('').map(c => c + c).join('');
            }
            if (h.length !== 6) return null;
            return '#' + h.toUpperCase();
        }

        const norm = normalizeHex(raw);
        if (!norm) {
            // invalid input, revert to cached/default
            const fallback = this.cachedDefaultColor ?? this.metaHero?.color ?? '#444444';
            this.colorInput.nativeElement.value = fallback;
            raw = fallback;
        }

        const newColor = normalizeHex(raw) ?? (this.cachedDefaultColor ?? this.metaHero?.color ?? '#444444');

        // compute perceived luminance and prevent too-dark colors
        let rgb: number[] | undefined = undefined;
        try { rgb = hexToRgb(newColor); } catch { rgb = undefined; }
        const minLuminance = 40; // out of 0-255; tune this threshold if needed
        if (rgb && rgb.length >= 3) {
            const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
            if (lum < minLuminance) {
                // too dark — choose a safe fallback and update the input so the user sees it
                const fallback = this.cachedDefaultColor ?? this.metaHero?.color ?? '#444444';
                this.colorInput.nativeElement.value = fallback;
                // set chosen color to fallback
                raw = fallback;
            }
        }

        const chosenColor = normalizeHex(raw) ?? (this.cachedDefaultColor ?? this.metaHero?.color ?? '#444444');

        this.metaHero.color = chosenColor;
        if (this.hero && this.hero.colorSwap) {
            this.hero.colorSwap = new ColorSwap([0, 160, 200], hexToRgb(chosenColor));
        }
        const userId = this.parentRef?.user?.id ?? 0;
        if (userId && userId > 0) {
            await this.userService.updateLastCharacterColor(userId, chosenColor);
            this.cachedDefaultColor = chosenColor;
        }

        if (this.metaHero && this.metaHero.id && chosenColor) {
            this.heroColors.set(this.metaHero.id, chosenColor);
        }

        if (this.mainScene?.level?.name != "CharacterCreate") {
            await this.reinitializeHero(this.metaHero, true);
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
}