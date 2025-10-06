import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { MetaHero } from '../../services/datacontracts/ender/meta-hero';
import { Vector2 } from '../../services/datacontracts/ender/vector2';
import { User } from '../../services/datacontracts/user/user';
import { EnderService } from '../../services/ender.service';
import { UserService } from '../../services/user.service';
import { MetaChat } from '../../services/datacontracts/ender/meta-chat';
import { gridCells, snapToGrid } from './helpers/grid-cells';
import { GameLoop } from './helpers/game-loop';
import { hexToRgb } from './helpers/resources';
import { events } from './helpers/events';
import { storyFlags } from './helpers/story-flags';
import { actionMultiplayerEvents, subscribeToMainGameEvents } from './helpers/network';
import { Hero } from './objects/Hero/hero';
import { BikeWall } from './objects/Environment/bike-wall';
import { addBikeWallCell, clearBikeWallCells } from './helpers/bike-wall-index';
import { Main } from './objects/Main/main';
import { HeroRoomLevel } from './levels/hero-room';
import { CharacterCreate } from './levels/character-create';
import { Level } from './objects/Level/level';
import { MetaEvent } from '../../services/datacontracts/ender/meta-event';
import { InventoryItem } from './objects/InventoryItem/inventory-item';
import { DroppedItem } from './objects/Environment/DroppedItem/dropped-item';
import { ColorSwap } from '../../services/datacontracts/ender/color-swap';
import { MetaBot } from '../../services/datacontracts/ender/meta-bot';
import { MetaBotPart } from '../../services/datacontracts/ender/meta-bot-part';
import { Fire } from './objects/Effects/Fire/fire';
import { Mask, getMaskNameById } from './objects/Wardrobe/mask';
import { Bot } from './objects/Bot/bot';
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
    // Count of enemies that are on the same level as the local player
    enemiesOnSameLevelCount: number = 0;
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


    private currentChatTextbox?: ChatSpriteTextString | undefined;
    private pollingInterval: any;
    topScores: any[] = [];
    isMenuPanelOpen = false;
    // Count of bike-wall units placed during the current run
    wallsPlacedThisRun: number = 0;
    // cached defaults loaded from user settings (used when opening CharacterCreate)
    private cachedDefaultName?: string;
    private cachedDefaultColor?: string;
    // Millisecond timestamp when the current run/level started
    runStartTimeMs: number | undefined = undefined;
    // Live elapsed seconds for HUD
    runElapsedSeconds: number = 0;
    private runElapsedInterval: any;
    // In-memory set of meta bike walls (keys: "x|y") for fast existence checks
    // Track only the highest wall id we've processed; we don't retain all wall coordinates persistently.
    private lastKnownWallId: number = 0;
    // Reference to level to reset delta tracking when level changes
    private persistedWallLevelRef: any = undefined;
    // Collect all locally spawned walls since last fetch (delta batch)
    private pendingWallsBatch: { x: number, y: number }[] = [];

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
                this.colorInput.nativeElement.value = this.cachedDefaultColor ?? "#00A0C8";
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
        this.remove_me('EnderComponent');
        this.parentRef?.setViewportScalability(true);
        this.parentRef?.removeResizeListener();
    }

    private async handleHeroDeath(hero: Hero) {
        // spawn fire animation at hero location and lock input
        const fire = new Fire(hero.position.x, hero.position.y);
        this.mainScene.level.addChild(fire);
        hero.destroy();

        // send server request to record death and delete hero
        try {
            const timeOnLevel = Math.max(0, Math.floor((Date.now() - (this.runStartTimeMs ?? Date.now())) / 1000));
            // Combine time and walls for score: time seconds + 10 points per wall
            const score = timeOnLevel + (this.wallsPlacedThisRun * 10);
            await this.enderService.recordDeath(this.metaHero.id, this.parentRef?.user?.id, score, timeOnLevel, this.wallsPlacedThisRun, this.runStartTimeMs);
        } catch (e) {
            console.error('Failed to record death', e);
        }

        // wait for fire animation to finish (same duration as Bot destroy uses ~1100ms)
        setTimeout(() => {
            try {
                alert('You died. The game will now reload.');
            } finally {
                window.location.href = 'https://bughosted.com/Ender';
            }
        }, 1200);
    }


    ngAfterViewInit() {
        this.mainScene.input.setChatInput(this.chatInput.nativeElement);
        events.on("HERO_DIED", this, (hero: Hero) => {
            this.handleHeroDeath(hero);
        });
        // Track bike wall placements so we can submit to highscores
        events.on("SPAWN_BIKE_WALL", this, (params: { x: number, y: number }) => {
            // only count placements from the local hero and only after run started
            if (this.runStartTimeMs && params) {
                this.wallsPlacedThisRun = (this.wallsPlacedThisRun ?? 0) + 1;
            }
            // accumulate walls until next poll
            this.pendingWallsBatch.push({ x: params.x, y: params.y });
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
        console.log("polling...")
        if (!this.hero?.id && this.parentRef?.user?.id) {
            const rz = await this.enderService.getHero(this.parentRef.user.id);
            console.log("get hero returned", rz);
            if (rz) {
                this.partyMembers = await this.enderService.getPartyMembers(rz.id) ?? [];
                this.mainScene.partyMembers = this.partyMembers;
                this.mainScene.inventory.partyMembers = this.partyMembers;
                this.mainScene.inventory.renderParty();
                await this.reinitializeHero(rz);
                const allWalls = await this.enderService.fetchAllBikeWalls(rz.id) as MetaBikeWall[];
                if (Array.isArray(allWalls)) {
                    clearBikeWallCells();
                    this.persistedWallLevelRef = this.mainScene.level;
                    this.lastKnownWallId = 0; // we aren't using id delta now; recent fetch limited by time window
                    let myWallsCount = 0;
                    for (const w of allWalls) {
                        const wall = new BikeWall({ position: new Vector2(w.x, w.y), colorSwap: (w.heroId === this.metaHero.id ? this.metaHero ? this.mainScene.metaHero?.colorSwap : undefined : undefined) });
                        this.mainScene.level.addChild(wall);
                        addBikeWallCell(w.x, w.y);
                        if (w.heroId === rz.id) {
                            myWallsCount++;
                        }
                    }
                    this.wallsPlacedThisRun = myWallsCount;
                }
                console.log("found hero", rz);
            } else {
                // attempt to load persisted last character name and pass it into the CharacterCreate level
                // Use cached defaults if we fetched them earlier, otherwise fetch now
                if (this.cachedDefaultName !== undefined || this.cachedDefaultColor !== undefined) {
                    this.mainScene.setLevel(new CharacterCreate({ defaultName: this.cachedDefaultName, defaultColor: this.cachedDefaultColor }));
                } else {
                    this.userService.getUserSettings(this.parentRef?.user?.id ?? 0).then(res => {
                        const defaultName = res?.lastCharacterName ?? undefined;
                        const defaultColor = res?.lastCharacterColor ?? undefined;
                        this.mainScene.setLevel(new CharacterCreate({ defaultName, defaultColor }));
                    }).catch(() => {
                        this.mainScene.setLevel(new CharacterCreate());
                    });
                }
                console.log("did not find hero, character create level started");
                return;
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
            // send pending local walls with fetch request to reduce event spam
            const pendingWalls = this.pendingWallsBatch.length > 0 ? [...this.pendingWallsBatch] : undefined;
            // clear after snapshot so we don't resend
            this.pendingWallsBatch = [];
            if (this.hero && this.metaHero) {
                this.metaHero.position = this.hero?.position.duplicate();
            }

            // Debug: log positions being sent to server
            try {
                // eslint-disable-next-line no-console
                console.debug('[Ender] sending hero positions -> hero:', this.hero?.position, 'metaHero:', this.metaHero?.position);
            } catch { }

            this.enderService.fetchGameDataWithWalls(this.metaHero, pendingWalls, this.lastKnownWallId).then((res: any) => {
                if (res) {
                    // If the server provides the elapsed time on level, sync the client's
                    // run timer so returning players see the correct elapsed seconds.
                    // Server sends timeOnLevelSeconds (integer seconds).
                    if (res.timeOnLevelSeconds !== undefined && res.timeOnLevelSeconds !== null) {
                        const secs = Number(res.timeOnLevelSeconds) || 0;
                        this.runElapsedSeconds = Math.max(0, Math.floor(secs));
                        // Set runStartTimeMs so the interval-based clock continues from server time
                        this.runStartTimeMs = Date.now() - (this.runElapsedSeconds * 1000);
                        this.startRunTimer();
                    }
                    // apply server-provided kills to local hero
                    if (res.heroKills !== undefined && this.metaHero) {
                        this.metaHero.kills = Number(res.heroKills) || 0;
                    }
                    this.updateOtherHeroesBasedOnFetchedData(res);
                    this.updateMissingOrNewHeroSprites();

                    // Persisted bike walls for this map - use in-memory Set to avoid scanning level.children repeatedly
                    const walls = Array.isArray(res.walls) ? (res.walls as MetaBikeWall[]) : undefined;
                    if (walls && walls.length > 0 && this.mainScene.level) {
                        // Reset delta tracking if level changed
                        if (this.persistedWallLevelRef !== this.mainScene.level) {
                            clearBikeWallCells();
                            this.persistedWallLevelRef = this.mainScene.level;
                            this.lastKnownWallId = 0;
                        }
                        for (const w of walls) {
                            // Add only new walls (server already filtered by id > lastKnownWallId)
                            const wall = new BikeWall({ position: new Vector2(w.x, w.y), colorSwap: (w.heroId === this.metaHero.id ? this.metaHero ? this.mainScene.metaHero?.colorSwap : undefined : undefined) });
                            this.mainScene.level.addChild(wall);
                            addBikeWallCell(w.x, w.y);
                            // emit only for local hero walls 
                            events.emit("BIKEWALL_CREATED", { x: w.x, y: w.y });
                            if (w.id && w.id > this.lastKnownWallId) {
                                this.lastKnownWallId = w.id;
                            }
                        }
                    }

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
            this.updateEnemiesOnSameLevelCount();
            return;
        }
        // Ensure created dates are parsed and objects are instances of MetaHero
        this.otherHeroes = res.heroes.map((h: MetaHero) => {
            try {
                const pos = h.position ? new Vector2(h.position.x, h.position.y) : new Vector2(0, 0);
                return new MetaHero(h.id, h.name ?? "Anon", pos, h.speed ?? 1, h.map ?? "", h.color, h.mask, h.level ?? 1, h.kills ?? 0, h.created);
            } catch {
                // fallback: return raw object typed as MetaHero
                return h as MetaHero;
            }
        });
        this.updateEnemiesOnSameLevelCount();
    }

    private updateMissingOrNewHeroSprites() {
        let ids: number[] = [];
        for (const hero of this.otherHeroes) {
            let existingHero = this.mainScene.level?.children.find((x: any) => x.id === hero.id) as Character | undefined;
            if (this.partyMembers?.find(x => x.heroId === hero.id)) {
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
        console.log("add hero to scene", hero);
        // compute initial position; for remote heroes, nudge if crowding occurs so players start more spaced apart
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
        //tmpHero.metabots?.forEach((bot: MetaBot) => { bot.colorSwap = tmpHero.colorSwap;  })
        this.mainScene.level?.addChild(tmpHero);
        return tmpHero;
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
        // Use the server-provided position. The server (CreateHero) is responsible for
        // any randomization or avoidance of bike-walls; if the server didn't provide
        // a position, fall back to a safe default.
        let spawnPos: Vector2;
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
        this.metaHero = new MetaHero(this.hero.id, (this.hero.name ?? "Anon"),
            this.hero.position.duplicate(),
            rz.speed,
            rz.map,
            colorSwap,
            rz.mask,
            rz.level ?? 1,
            rz.kills ?? 0,
            rz.created ?? undefined);
        this.hero.isLocked = this.isStartMenuOpened || this.isShopMenuOpened;
        this.mainScene.setHeroId(this.metaHero.id);
        this.mainScene.hero = this.hero;
        this.mainScene.metaHero = this.metaHero;
        storyFlags.flags = new Map<string, boolean>();

        if (!!skipDataFetch == false) {
            //console.log("initialize inv after reinitializeHero");
            await this.reinitializeInventoryData(true);
        }
        const heroLevel = rz.level ?? 1;
        const level = this.getLevelFromLevelName(rz.map);
        if (level) {
            // if it's a HeroRoomLevel, pass heroPosition and heroLevel when constructing
            if (level instanceof HeroRoomLevel) {
                this.mainScene.setLevel(new HeroRoomLevel({ heroPosition: this.hero.position.duplicate(), heroLevel }));
            } else {
                this.mainScene.setLevel(level);
            }
        }

        this.mainScene.camera.centerPositionOnTarget(this.metaHero.position);
        // Mark run as started when hero is fully initialized.
        // If the server-provided hero has a creation timestamp, derive the run start from it so server-side time matches client.
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
        // Recompute enemy count now that the local player's level may have changed
        this.updateEnemiesOnSameLevelCount();
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

    private getLevelFromLevelName(key: string): Level {
        const upperKey = key.toUpperCase();
        const itemsFoundNames = this.mainScene?.inventory.getItemsFound();

        if (upperKey == "HEROROOM") return new HeroRoomLevel({ itemsFound: itemsFoundNames });

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

    lockMovementForChat() {
        if (!this.hero?.isLocked) {
            console.log("lock movement for chat");
            events.emit("HERO_MOVEMENT_LOCK");
        }
    }
    async changeColor() {
        const newColor = this.colorInput.nativeElement.value;
        this.metaHero.color = newColor;
        // Immediately update current hero's color swap if exists (no full rebuild flicker)
        if (this.hero && (this.hero as any).colorSwap) {
            try {
                const hex = newColor;
                const toRgb = (h: string) => {
                    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
                    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
                };
                (this.hero as any).colorSwap.target = toRgb(hex);
            } catch { }
        }
        // Reinitialize to propagate color to newly spawned assets / party display
        // Persist the selected color to user settings when possible
        try {
            const userId = this.parentRef?.user?.id ?? 0;
            if (userId && userId > 0) {
                await this.userService.updateLastCharacterColor(userId, newColor);
                this.cachedDefaultColor = newColor;
            }
        } catch { }

        await this.reinitializeHero(this.metaHero, true);
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
