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
    // Millisecond timestamp when the current run/level started
    runStartTimeMs: number | undefined = undefined;
    // Live elapsed seconds for HUD
    runElapsedSeconds: number = 0;
    private runElapsedInterval: any;

    async ngOnInit() {
        this.serverDown = (this.parentRef ? await this.parentRef?.isServerUp() <= 0 : false);
        this.parentRef?.setViewportScalability(false);
        this.parentRef?.addResizeListener();
        this.canvas = this.gameCanvas.nativeElement;
        this.ctx = this.canvas.getContext("2d")!;
        if (!this.parentRef?.user) {
            this.isUserComponentOpen = true;
        } else {
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
            } else {
                // attempt to load persisted last character name and pass it into the CharacterCreate level
                this.userService.getUserSettings(this.parentRef?.user?.id ?? 0).then(res => {
                    const defaultName = res?.lastCharacterName ?? undefined;
                    this.mainScene.setLevel(new CharacterCreate({ defaultName }));
                }).catch(() => {
                    this.mainScene.setLevel(new CharacterCreate());
                });
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
            this.enderService.fetchGameData(this.metaHero).then((res: any) => {
                if (res) {
                    this.updateOtherHeroesBasedOnFetchedData(res);
                    this.updateMissingOrNewHeroSprites();
                    this.updateEnemyEncounters(res);

                    // Persisted bike walls for this map
                    if (res.walls && Array.isArray(res.walls) && this.mainScene.level) {
                        for (const w of res.walls) {
                            const exists = this.mainScene.level.children.some((c: any) => c.name === 'bike-wall' && c.position && c.position.x === w.x && c.position.y === w.y);
                            if (!exists) {
                                const wall = new BikeWall({ position: new Vector2(w.x, w.y) });
                                this.mainScene.level.addChild(wall);
                                events.emit("BIKEWALL_CREATED", { x: w.x, y: w.y });
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
            let tgtBot = metaHero.metabots.find((x: any) => x.id === bot.id);
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
        // choose a random spawn for the local hero to avoid clustering on join
        const randomRange = 12; // grid cells range
        const randX = Math.floor(Math.random() * randomRange) + 1; // 1..randomRange
        const randY = Math.floor(Math.random() * randomRange) + 1;
        const spawnPos = new Vector2(gridCells(randX), gridCells(randY));
        this.hero = new Hero({
            id: rz.id, name: rz.name ?? "Anon",
            position: spawnPos,
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
            rz.mask,
            rz.level ?? 1,
            rz.kills ?? 0);
        this.hero.isLocked = this.isStartMenuOpened || this.isShopMenuOpened;
        this.mainScene.setHeroId(this.metaHero.id);
        this.mainScene.hero = this.hero;
        this.mainScene.metaHero = this.metaHero;
        storyFlags.flags = new Map<string, boolean>();

        if (!!skipDataFetch == false) {
            //console.log("initialize inv after reinitializeHero");
            await this.reinitializeInventoryData(true);
        }
        const heroLevel = (rz as any).level ?? 1;
        const level = this.getLevelFromLevelName(rz.map);
        if (level) {
            // if it's a HeroRoomLevel, pass heroPosition and heroLevel when constructing
            if (level instanceof HeroRoomLevel) {
                this.mainScene.setLevel(new HeroRoomLevel({ heroPosition: this.hero.position.duplicate(), heroLevel }));
            } else {
                this.mainScene.setLevel(level);
            }
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
        // Mark run as started when hero is fully initialized.
        // If the server-provided hero has a creation timestamp, derive the run start from it so server-side time matches client.
        if (!this.runStartTimeMs) {
            const createdStr = (rz as any).created || (rz as any).created_at || (rz as any).createdAt;
            if (createdStr) {
                const parsed = Date.parse(createdStr);
                this.runStartTimeMs = isNaN(parsed) ? Date.now() : parsed;
            } else {
                this.runStartTimeMs = Date.now();
            }
        }
        this.runElapsedSeconds = 0;
        this.startRunTimer();
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

    lockMovementForChat() {
        if (!this.hero?.isLocked) {
            console.log("lock movement for chat");
            events.emit("HERO_MOVEMENT_LOCK");
        }
    }
    async changeColor() {
        this.metaHero.color = this.colorInput.nativeElement.value;
        this.colorInput.nativeElement.style.display = "none";
        this.parentRef?.closeModal();
        if (this.parentRef) {
            this.parentRef.isModal = true;
        }
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
