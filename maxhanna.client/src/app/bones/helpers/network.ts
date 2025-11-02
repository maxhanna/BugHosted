import { events } from "./events";
import { Hero } from "../objects/Hero/hero";
import { MetaBot } from "../../../services/datacontracts/bones/meta-bot";
import { MetaEvent } from "../../../services/datacontracts/bones/meta-event";
import { MetaChat } from "../../../services/datacontracts/bones/meta-chat";
import { Vector2 } from "../../../services/datacontracts/bones/vector2";
import { Bot } from "../objects/Bot/bot";
import { GameObject } from "../objects/game-object";
import { Level } from "../objects/Level/level";
import { WardrobeMenu } from "../objects/Menu/wardrobe-menu";
import { gridCells } from "./grid-cells";
import { Skill } from "./skill-types";
import { Character } from "../objects/character";
import { HeroInventoryItem } from "../../../services/datacontracts/bones/hero-inventory-item";
import { DroppedItem } from "../objects/Environment/DroppedItem/dropped-item";
import { TownPortal } from "../objects/Environment/TownPortal/town-portal";
import { resources } from "./resources";


export class Network {
  constructor() {
  }
}

export let actionBlocker = false;
export let encounterUpdates: Bot[] = [];
export let batchInterval: any;
export let pendingAttacks: any[] = [];
// track last attack timestamp per hero id (ms since epoch)
export const lastAttackTimestamps: Map<number, number> = new Map();
export let attackBatchInterval: any;
export const processedAttacks: Map<string, number> = new Map();

export function startBatchUpdates(object: any, batchIntervalMs = 1000) {
  batchInterval = setInterval(() => {
    if (encounterUpdates.length > 0) {
      sendBatchToBackend(encounterUpdates, object);
      encounterUpdates = [];
    } else {
      stopBatchUpdates();
    }
  }, batchIntervalMs);
}

export function handleEncounterUpdate(bot: Bot) {
  encounterUpdates.push(bot);
}

export function stopBatchUpdates() {
  clearInterval(batchInterval);
  encounterUpdates = [];
}

export function startAttackBatch(object: any, batchIntervalMs = 1000) {
  // If an interval is already running with a different ms, restart it so timing matches attackSpeed
  if (attackBatchInterval) {
    clearInterval(attackBatchInterval);
    attackBatchInterval = undefined;
  }
  attackBatchInterval = setInterval(() => {
    if (pendingAttacks.length > 0) {
      sendAttackBatchToBackend(pendingAttacks, object);
      pendingAttacks = [];
    } else {
      stopAttackBatch();
    }
  }, batchIntervalMs);
}

export function stopAttackBatch() {
  clearInterval(attackBatchInterval);
  attackBatchInterval = undefined;
  pendingAttacks = [];
}

function sendAttackBatchToBackend(attacks: any[], object: any) {
  if (!attacks || attacks.length === 0) return;

  // Ensure each attack includes the hero's currentSkill so the server can process/projectile visuals
  const heroCurrentSkill = (object && object.metaHero && (object.metaHero as any).currentSkill) || (object && object.hero && (object.hero as any).currentSkill) || undefined;
  const attacksWithSkill = attacks.map(a => {
    try {
      if (!a) return a;
      // Do not overwrite if attack already provides a currentSkill or skill
      if (a.currentSkill || a.skill) return { ...a, currentSkill: a.currentSkill ?? a.skill };
      return { ...a, currentSkill: heroCurrentSkill ?? a.currentSkill ?? a.skill };
    } catch (ex) { return a; }
  });

  const metaEvent = new MetaEvent(
    0,
    object.metaHero.id,
    new Date(),
    "ATTACK_BATCH",
    object.metaHero.map,
    { "attacks": safeStringify(attacksWithSkill) }
  );

  object.bonesService.updateEvents(metaEvent).catch((error: any) => {
    console.error("Failed to send batched attacks:", error);
  });
}

export function setActionBlocker(duration: number) {
  actionBlocker = true;
  setTimeout(() => {
    actionBlocker = false;
  }, duration);
}

function safeStringify(obj: any) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return "[Circular]";
      }
      seen.add(value);
    }
    return value;
  });
}

function trimChatToLimit(object: any, limit: number) {
  if (!object || !object.chat || !Array.isArray(object.chat)) return;
  while (object.chat.length > limit) {
    object.chat.pop();
  }
}

function sendBatchToBackend(bots: Bot[], object: any) {
  if (bots.length === 0) return;

  const uniqueBots = new Map<number, Bot>();
  bots.forEach(bot => {
    if (bot.id && bot.heroId && bot.destinationPosition && !bot.isWarping && bot.hp > 0) {
      uniqueBots.set(bot.id, bot);
    }
  });

  if (uniqueBots.size === 0) return;

  const batchData = Array.from(uniqueBots.values()).map(bot => ({
    botId: bot.id,
    heroId: bot.heroId,
    destinationX: bot.destinationPosition.x,
    destinationY: bot.destinationPosition.y,
  }));

  const metaEvent = new MetaEvent(
    0,
    object.metaHero.id,
    new Date(),
    "UPDATE_ENCOUNTER_POSITION",
    object.metaHero.map,
    { batch: safeStringify(batchData) }
  );

  object.bonesService.updateEvents(metaEvent).catch((error: any) => {
    console.error("Failed to send batched encounter updates:", error);
  });
}
export function subscribeToMainGameEvents(object: any) {
  // Accept Level instance, level name string, or a payload { map, position, portalId }
  const parseLevelOrPayload = (levelOrPayload: any): { levelObj: Level | null, providedPosition?: any, portalId?: number } => {
    if (!levelOrPayload) return { levelObj: null };
    try {
      if (levelOrPayload instanceof Level) {
        const providedPosition = (levelOrPayload as any).defaultHeroPosition ?? (typeof (levelOrPayload as any)?.getDefaultHeroPosition === 'function' ? (levelOrPayload as any).getDefaultHeroPosition() : undefined);
        const portalId = (levelOrPayload as any).portalId ? Number((levelOrPayload as any).portalId) : undefined;
        return { levelObj: levelOrPayload as Level, providedPosition, portalId };
      }
      if (typeof levelOrPayload === 'string') {
        return { levelObj: object.getLevelFromLevelName(levelOrPayload as string) };
      }
      if (typeof levelOrPayload === 'object' && levelOrPayload.map) {
        const lvl = object.getLevelFromLevelName(levelOrPayload.map as string);
        const providedPosition = levelOrPayload.position ?? undefined;
        const portalId = levelOrPayload.portalId ? Number(levelOrPayload.portalId) : undefined;
        return { levelObj: lvl, providedPosition, portalId };
      }
    } catch (ex) {
      console.warn('parseLevelOrPayload failed', ex, levelOrPayload);
    }
    return { levelObj: null };
  };

  const shouldRequestPortalDeletion = (portalIdToDelete: number | undefined): boolean => {
    if (!portalIdToDelete || !object.bonesService || typeof object.bonesService.deleteTownPortal !== 'function') return false;
    try {
      const townMap = (object as any)._townPortalsMap as Map<number, any> | undefined;
      const portalObj = townMap ? townMap.get(portalIdToDelete) : undefined;
      if (!portalObj) return false;
      const serverData = portalObj ? (portalObj as any).serverData : undefined;
      const hasOrigin = !!(serverData && (serverData.originMap || serverData.map || serverData.originX !== undefined || serverData.coordsX !== undefined || serverData.originY !== undefined || serverData.coordsY !== undefined));
      const creatorId = portalObj ? ((portalObj as any).serverCreatorHeroId ?? (serverData ? (serverData.creatorHeroId ?? serverData.creator_id ?? serverData.creator ?? serverData.createdBy) : undefined)) : undefined;
      const isCreator = (creatorId !== undefined && creatorId !== null) ? (Number(creatorId) === Number(object.metaHero?.id)) : false;
      return !!(portalObj && hasOrigin && isCreator);
    } catch (err) {
      console.warn('Failed evaluating portal deletion conditions', err);
      return false;
    }
  };

  events.on("CHANGE_LEVEL", object.mainScene, (levelOrPayload: any) => {
    try {
      const parsed = parseLevelOrPayload(levelOrPayload);
      const levelObj = parsed.levelObj;
      if (!levelObj) return;

      console.log("changing levels");
      object.otherHeroes = [];
      if (!object.hero?.id) object.pollForChanges();

      if (object.mainScene && object.mainScene.level) {
        object.metaHero.map = levelObj.name ?? "HERO_ROOM";
        // Determine hero position safely
        let posToUse: any = parsed.providedPosition ?? undefined;
        try {
          if (!posToUse) {
            if (typeof (levelObj as any)?.getDefaultHeroPosition === 'function') posToUse = (levelObj as any).getDefaultHeroPosition();
            else posToUse = (levelObj as any).defaultHeroPosition;
          }
        } catch { }
        if (!posToUse) posToUse = new Vector2(gridCells(4), gridCells(4));
        object.metaHero.position = new Vector2(Number(posToUse.x), Number(posToUse.y));
        object.mainScene.level.itemsFound = object.mainScene.inventory.getItemsFound();
      }

      // Conditionally request portal deletion
      if (shouldRequestPortalDeletion(parsed.portalId)) {
        try { object.bonesService.deleteTownPortal(parsed.portalId).catch(() => { }); } catch { }
      }
    } catch (ex) {
      console.error('CHANGE_LEVEL handler failed', ex);
    }
  });

  events.on("ALERT", object, async (message: string) => {
    object.parentRef?.showNotification(message);
  });


  events.on("MASK_EQUIPPED", object, (params: { maskId: number }) => {
    object.metaHero.mask = params.maskId === 0 ? undefined : params.maskId;
    let existingHero = object.mainScene.level?.children.find((x: any) => x.id === object.metaHero.id);
    if (existingHero) {
      existingHero.destroy();
    }
    object.updatePlayers();
  });
  events.on("WARDROBE_OPENED", object, () => {
    if (actionBlocker) return;
    events.emit("BLOCK_BACKGROUND_SELECTION");
    object.blockOpenStartMenu = true;
    object.mainScene?.inventory?.children?.forEach((x: any) => x.destroy());

    const invItems = object.mainScene.inventory.items;
    if (object.mainScene.level) {
      //console.log(object.mainScene.level);
      object.mainScene.setLevel(new WardrobeMenu({ entranceLevel: object.getLevelFromLevelName((object.mainScene.level.name ?? "HERO_ROOM")), heroPosition: object.metaHero.position, inventoryItems: invItems, hero: object.metaHero }));
    }
    object.stopPollingForUpdates = true;
    setActionBlocker(50);
  });
  events.on("WARDROBE_CLOSED", object, (params: { heroPosition: Vector2, entranceLevel: Level }) => {
    object.stopPollingForUpdates = false;
    object.blockOpenStartMenu = false;
    object.mainScene?.inventory?.renderParty();
    const newLevel = object.getLevelFromLevelName((params.entranceLevel.name ?? "HERO_ROOM"));
    console.log(newLevel, params.entranceLevel);
    newLevel.defaultHeroPosition = params.heroPosition;
    events.emit("CHANGE_LEVEL", newLevel);
    events.emit("SHOW_START_BUTTON");
    events.emit("UNBLOCK_BACKGROUND_SELECTION");
  });
  events.on("CHARACTER_NAME_CREATED", object, (payload: any) => {
    // Accept either legacy string or new { name, type } payload
    const name = payload.name ?? undefined;
    const type = payload.type ?? undefined;
    if (!name || !type) return;
    if (object.chatInput.nativeElement.placeholder === "Enter your name" && object.parentRef && object.parentRef.user && object.parentRef.user.id) {
      object.bonesService.createHero(object.parentRef.user.id, name, type);
    }
  });
  events.on("STARTED_TYPING", object, () => {
    // Mirror Ender: locally show a "..." typing placeholder and avoid spamming the server
    const name = object.metaHero.name;
    object.chat = object.chat.filter((m: MetaChat) => !(m && m.hero === name && (m.content ?? '') === '...'));

    object.chat.unshift(
      {
        hero: name,
        content: "...",
        timestamp: new Date()
      } as MetaChat);
    object.setHeroLatestMessage(object.otherHeroes.find((x: Character) => x.name === name));
    object.displayChatMessage();
  })
  events.on("SEND_CHAT_MESSAGE", object, (chat: string) => {
    const msg = chat.trim();
    if (object.parentRef?.user) {
      if (object.chatInput.nativeElement.placeholder !== "Enter your name") {
        const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "CHAT", object.metaHero.map, { "sender": object.metaHero.name ?? "Anon", "content": msg })
        object.bonesService.updateEvents(metaEvent);
        object.chatInput.nativeElement.value = '';
        setTimeout(() => {
          object.chatInput.nativeElement.blur();
          object.gameCanvas.nativeElement.focus();
        }, 0);
        // Remove any local "..." typing placeholders for this hero and let the server echo the message
        const name = object.metaHero.name;
        object.chat = object.chat.filter((m: MetaChat) => !(m && m.hero === name && (m.content ?? '') === '...'));
      }
    }
  });

  events.on("WAVE_AT", object, (objectAtPosition: GameObject) => {
    const msg = `👋 ${(objectAtPosition as Hero).name}`;
    const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "CHAT", object.metaHero.map, { "sender": object.metaHero.name ?? "Anon", "content": msg })
    object.bonesService.updateEvents(metaEvent);
  });

  events.on("WHISPER_AT", object, (objectAtPosition: GameObject) => {
    if (!objectAtPosition) return;
    const msgContent = object.getChatText();
    const receiver = (objectAtPosition as Hero).name ?? "Anon";
    const sender = (object.metaHero as Hero).name ?? "Anon";
    const msg = `🤫 (${sender}:${receiver}) : ${msgContent}`;
    const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "WHISPER", object.metaHero.map, { "sender": sender, "receiver": receiver, "content": msg })
    object.bonesService.updateEvents(metaEvent);

    if (sender === object.metaHero.name) {
      object.chatInput.nativeElement.value = "";
    }
  });

  events.on("UPDATE_ENCOUNTER_POSITION", object, (source: Bot) => {
    handleEncounterUpdate(source);
    startBatchUpdates(object);
  });

  events.on("HIDE_START_BUTTON", object, () => {
    object.hideStartButton = true;
  })
  events.on("SHOW_START_BUTTON", object, () => {
    object.hideStartButton = false;
  })
  // events.on("START_PRESSED", object, (data: any) => {
  //   if (object.blockOpenStartMenu) {
  //     return;
  //   }
  //   if (object.isStartMenuOpened) {
  //     events.emit("CLOSE_INVENTORY_MENU", data);
  //     events.emit("UNBLOCK_BACKGROUND_SELECTION");
  //   } else {
  //     const exits = object.mainScene.level.children.filter((x: GameObject) => x.name == "exitObject"); 
  //     events.emit("OPEN_START_MENU", ({ exits: exits, location: object.mainScene.metaHero.position }));
  //     events.emit("BLOCK_BACKGROUND_SELECTION");
  //   }
  // });

  events.on("CLOSE_INVENTORY_MENU", object, () => {
    object.isStartMenuOpened = false;
    events.emit("SHOW_START_BUTTON");
  });

  events.on("OPEN_START_MENU", object, () => {
    object.isStartMenuOpened = true;
    events.emit("HIDE_START_BUTTON");
  });

  events.on("BLOCK_START_MENU", object, () => {
    object.blockOpenStartMenu = true;
    events.emit("HIDE_START_BUTTON");
  });
  events.on("UNBLOCK_START_MENU", object, () => {
    object.blockOpenStartMenu = false;
    events.emit("SHOW_START_BUTTON");
  });

  //Reposition Safely handler
  events.on("REPOSITION_SAFELY", object, () => {
    if (object.metaHero) {
      const levelName = object.mainScene.level?.name; // Get the class reference
      if (levelName && levelName != "Fight") {
        events.emit("CHANGE_LEVEL", object.getLevelFromLevelName(levelName));
      }
    }
  });

  events.on("WARP", object, (params: { x: string, y: string }) => {
    if (object.metaHero) {
      object.metaHero.position = new Vector2(gridCells(parseInt(params.x)), gridCells(parseInt(params.y)));
    }
  });

  events.on("INVALID_WARP", object, (hero: Hero) => {
    object.chat.unshift(
      {
        hero: object.metaHero.name ?? "Anon",
        content: "Can't warp there.",
        timestamp: new Date()
      } as MetaChat);
    object.setHeroLatestMessage(hero);
  })

  events.on("SPACEBAR_PRESSED", object, (skill: Skill) => {
    if ((object.chatInput && document.activeElement != object.chatInput) || !object.chatInput) {
      const attackSpeed = object?.metaHero?.attackSpeed ?? 400; // ms
      const now = Date.now();
      const last = lastAttackTimestamps.get(object.metaHero.id) ?? 0;
      if (now - last < attackSpeed) {
        // still cooling down; ignore attack
        return;
      }
      lastAttackTimestamps.set(object.metaHero.id, now);
      const attack: any = {
        timestamp: new Date().toISOString(),
        skill: (skill && (typeof (skill as any).name === 'string')) ? (skill as any).name : (typeof skill === 'string' ? skill : undefined),
        heroId: object.metaHero.id,
        sourceHeroId: object.metaHero.id
      };

      // Attempt to include facing and projectile length for ranged/magi attacks so the server
      // can apply damage along the projectile path. Prefer scene object facing, fall back to metaHero.
      try {
        const srcObj = object.mainScene?.level?.children?.find((x: any) => x.id === object.metaHero.id);
        const facingRaw = (srcObj && srcObj.facingDirection) ? srcObj.facingDirection : (object.metaHero && (object.metaHero as any).facingDirection ? (object.metaHero as any).facingDirection : undefined);
        if (facingRaw) {
          // normalize to lowercase string (server accepts numeric or string values)
          attack.facing = String(facingRaw).toLowerCase();
        }

        // Normalize type checks to be robust against casing, missing fields, or server shape differences
        try {
          const metaHeroType = String((object.metaHero as any)?.type ?? '').toLowerCase();
          const heroCurrentSkill = String((object.hero as any)?.currentSkill ?? '').toLowerCase();
          attack.currentSkill = heroCurrentSkill;
          const srcObjType = String((srcObj as any)?.type ?? '').toLowerCase();
          // Debug: show types when debugging magi detection (kept minimal)
          console.debug(`attack type check: metaHero.type='${metaHeroType}', srcObj.type='${srcObjType}'`);
          const isMagi = (metaHeroType === 'magi') || (srcObjType === 'magi');
          const isRogue = (metaHeroType === 'rogue') || (srcObjType === 'rogue');
          if (isMagi || isRogue) {
            attack.length = 200;
          }

        } catch (innerEx) {
          // If anything goes wrong here, don't block the attack; fall back to no length
          console.warn('Failed to determine hero type for magi length', innerEx);
        }
      } catch (ex) {
        console.log("Failed to extract facing/length for attack:", ex);
      }
      pendingAttacks.push(attack);
      startAttackBatch(object, attackSpeed);
    }
  });

  events.on("GOT_REWARDS", object, (params: { location: Vector2, part: HeroInventoryItem }) => {
    if (!params.part) return;
    const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "ITEM_DROPPED", object.metaHero.map, { "location": safeStringify(params.location), "item": safeStringify(params.part) })
    object.bonesService.updateEvents(metaEvent);
  });

  events.on("CHARACTER_PICKS_UP_ITEM", object, (data: { position: Vector2, id?: number, imageName?: string, hero?: any, item?: any }) => {
    setActionBlocker(500);
    resources.playSound('itemdrop', { volume: 0.8, allowOverlap: true });
    const payload: any = {
      position: safeStringify(data.position)
    };

    if (data.id !== undefined && data.id !== null) {
      payload.droppedItemId = `${data.id}`;
    }

    if (data.item) {
      payload.item = safeStringify(data.item);
    }
    const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "ITEM_DESTROYED", object.metaHero.map, payload);
    object.bonesService.updateEvents(metaEvent).catch((err: any) => {
      console.warn('Failed to send ITEM_DESTROYED', err);
    });
  });

  events.on("PARTY_UP", object, (person: Hero) => {
    const foundInParty = object.partyMembers.find((x: any) => x.heroId === object.metaHero.id);
    if (!foundInParty) {
      object.partyMembers.push({ heroId: object.metaHero.id, name: object.metaHero.name, color: object.metaHero.color });
    }
    const foundInParty2 = object.partyMembers.find((x: any) => x.heroId === person.id);
    if (!foundInParty2) {
      object.partyMembers.push({ heroId: person.id, name: person.name, color: person.colorSwap });
    }
    const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "PARTY_UP", object.metaHero.map, { "hero_id": `${person.id}`, "party_members": safeStringify(object.partyMembers.map((x: any) => x.heroId)) })
    object.bonesService.updateEvents(metaEvent);
  });
  events.on("UNPARTY", object, (person: Hero) => {
    const toRemoveId = person?.id ?? 0;
    if (!toRemoveId) return;
    // Only act if the target hero is currently in our local party list
    const isMember = Array.isArray(object.partyMembers) && object.partyMembers.some((x: any) => x.heroId === toRemoveId);
    if (!isMember) {
      console.log("UNPARTY ignored; hero not in local party:", toRemoveId);
      return;
    }
    // Remove the departed member from the local party list (keep other members and self)
    object.partyMembers = object.partyMembers.filter((x: any) => x.heroId !== toRemoveId);
    console.log("removed party member id", toRemoveId);
    // If we removed ourselves, reinitialize inventory data as before
    if (toRemoveId === object.metaHero.id) {
      object.reinitializeInventoryData();
    }
  });
  events.on("CHARACTER_PICKS_UP_ITEM", object, (data:
    {
      position: Vector2,
      hero: Hero,
      name: string,
      imageName: string,
      category: string,
      item: any,
      stats: any,
    }) => {
    if (!actionBlocker) {
      const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "ITEM_DESTROYED", object.metaHero.map,
        {
          "position": `${safeStringify(data.position)}`,
          "damage": `${data.item?.damageMod}`,
          "partName": `${data.item?.partName}`,
          "skill": `${data.item?.skill?.name}`
        });
      object.bonesService.updateEvents(metaEvent);
    }
    setActionBlocker(500);
  });



  events.on("CHANGE_COLOR", object, () => {
    if (object.parentRef) {
      setTimeout(() => {
        events.emit("HERO_MOVEMENT_LOCK");
      }, 50);
      object.colorInput.nativeElement.style.display = "block";
      object.parentRef.openModal(true);
      setTimeout(() => {
        if (object.parentRef) {
          object.parentRef.isModal = true;
          object.parentRef.modalComponent.isModalCloseVisible = false;
          object.parentRef.modalComponent.setModalFont("owreKynge");
          object.parentRef.modalComponent.removeCloseButton();
          object.parentRef.setModalBody("What's your style? :");
        }
      }, 1);
    }
  });
}

export function actionMultiplayerEvents(object: any, metaEvents: MetaEvent[]) {
  const currentEvents = object.events ?? [];
  if (!metaEvents || metaEvents.length === 0) {
    object.events = metaEvents;
    return;
  }

  for (let event of metaEvents) {

    // If this is an ATTACK or ATTACK_BATCH event, emit OTHER_HERO_ATTACK once per attack
    if (event && (event.eventType === "ATTACK" || event.eventType === "ATTACK_BATCH")) {
      const attackId = event.id ? String(event.id) : `${event.heroId}:${event.eventType}:${event.timestamp}:${JSON.stringify(event.data)}`;
      if (!processedAttacks.has(attackId)) {
        processedAttacks.set(attackId, Date.now());
        // Emit normalized payload (name and payload only) so handlers don't need object
        events.emit("OTHER_HERO_ATTACK", { sourceHeroId: event.heroId, attack: event.data ?? {} });
      }
    }



    // Only handle events we haven't seen before
    const existingEvent = currentEvents.find((e: MetaEvent) => e && e.id == event.id);
    if (!existingEvent) {
      //do something with object fresh event.
      if (event.eventType === "PARTY_UP" && event.data && event.data["hero_id"] == `${object.metaHero.id}` && !object.isDecidingOnParty) {
        actionPartyUpEvent(object, event);
      }
      else if (event.eventType === "UNPARTY" && event.data && event.data["hero_id"]) {
        try {
          console.log("got unparty event", event);
          const idStr = event.data["hero_id"];
          const removedId = parseInt(idStr);
          if (isNaN(removedId)) {
            console.log("UNPARTY event has invalid hero_id:", idStr);
          } else {
            const partyList = Array.isArray(object.partyMembers) ? object.partyMembers : [];
            const isMember = partyList.some((x: any) => x && x.heroId === removedId);
            if (!isMember) {
              console.log("UNPARTY ignored; hero not in local party:", removedId);
            } else {
              // Remove the departed member and avoid removing other members unintentionally
              object.partyMembers = partyList.filter((x: any) => x.heroId !== removedId && x.heroId !== event.heroId);
              object.reinitializeInventoryData();
              console.log("processed UNPARTY for hero id", removedId);
            }
          }
        } catch (ex) {
          console.error('Failed processing UNPARTY event', ex);
        }
      }
      else if (event.eventType === "PARTY_INVITE_ACCEPTED" && event.heroId != object.metaHero.id) {
        actionPartyInviteAcceptedEvent(object, event);
      }
      else if (event.eventType === "PARTY_INVITED" && event.data && event.data["hero_id"]) {
        try {
          // PARTY_INVITED is a server-persisted meta-event that should target a specific hero id
          const targetId = parseInt(event.data["hero_id"]);
          if (!isNaN(targetId) && targetId === object.metaHero.id) {
            const inviterId = event.heroId;
            const inviter = object.otherHeroes.find((h: any) => h.id === inviterId);
            const inviterName = inviter ? inviter.name : (`Hero ${inviterId}`);
            // Emit a normalized local event so components can show a popup and respond
            events.emit("PARTY_INVITED", { inviterId: inviterId, inviterName: inviterName, map: event.map });
          }
        } catch (ex) {
          console.error('Failed handling PARTY_INVITED event', ex);
        }
      }
      else if (event.eventType === "ITEM_DESTROYED") {
        if (event.data) {
          const dmgMod = event.data["damage"];
          const position = JSON.parse(event.data["position"]) as Vector2;
          const skillName = event.data["skill"];
          const maxRadius = gridCells(6);
          const possiblePositions: Vector2[] = [];
          for (let dx = -maxRadius; dx <= maxRadius; dx += gridCells(1)) {
            for (let dy = -maxRadius; dy <= maxRadius; dy += gridCells(1)) {
              const distance = Math.sqrt(dx * dx + dy * dy);
              if (distance <= maxRadius) {
                possiblePositions.push(new Vector2(position.x + dx, position.y + dy));
              }
            }
          }
          const tgtObject = object.mainScene.level?.children.find((x: any) => {
            const isMatchingLabel = x.itemLabel === `${dmgMod ?? 1} ${skillName ?? 1}`;
            const isNearby = possiblePositions.some(pos => x.position.x === pos.x && x.position.y === pos.y);
            return isMatchingLabel && isNearby;
          });
          if (tgtObject) { tgtObject.destroy(); }
        }
      }
      else if (event.eventType === "BUY_ITEM") {
        if (event.heroId === object.metaHero.id) {
          events.emit("BUY_ITEM_CONFIRMED", { heroId: event.heroId, item: (event.data ? event.data["item"] : "") })
          object.bonesService.deleteEvent(event.id);
        }
      }
      else if (event.eventType === "ITEM_DROPPED") {
        if (event.data) {
          const tmpMetabotPart = JSON.parse(event.data["item"]) as HeroInventoryItem;
          const location = JSON.parse(event.data["location"]) as Vector2;
          object.addItemToScene(tmpMetabotPart, location);
        }
      }
      else if (event.eventType === "ATTACK_BATCH" && event.data && event.data["attacks"]) {
        try {
          const attacks = JSON.parse(event.data["attacks"] as string) as any[];
          for (let atk of attacks) {
            if (event.heroId === object.metaHero.id) continue;
            events.emit("REMOTE_ATTACK", { attack: atk, sourceHeroId: event.heroId });
          }
        } catch (ex) { console.error("Failed to process ATTACK_BATCH event", ex); }
      }
      else if (event.eventType === "OTHER_HERO_ATTACK") {
        const payload = { sourceHeroId: event.heroId, data: event.data };
        events.emit("OTHER_HERO_ATTACK", payload);
      }
      else if (event.eventType === "CHAT" && event.data) {
        const content = event.data["content"] ?? '';
        const name = event.data["sender"] ?? "Anon";
        const eventTs = event.timestamp ? new Date(event.timestamp).getTime() : Date.now();
        const metachat = { hero: name, content: content, timestamp: event.timestamp ? new Date(event.timestamp) : new Date() } as MetaChat;
        const isDuplicate = object.chat && object.chat.some((m: MetaChat) => {
          try {
            if (!m || !m.hero) return false;
            if (m.hero !== name) return false;
            if ((m.content ?? '') !== (content ?? '')) return false;
            const mts = m.timestamp ? new Date(m.timestamp).getTime() : 0;
            return Math.abs(mts - eventTs) < 2000;
          } catch { return false; }
        });
        if (!isDuplicate) { object.chat.unshift(metachat); }
        trimChatToLimit(object, 10);
        object.setHeroLatestMessage(object.otherHeroes.find((x: Character) => x.name === name));
        object.displayChatMessage();
        events.emit("CHAT_MESSAGE_RECEIVED");
      }
      else if (event.eventType === "WHISPER" && event.data) {
        let breakOut = false;
        const content = event.data["content"] ?? '';
        const senderName = event.data["sender"] ?? "Anon";
        const receiverName = event.data["receiver"] ?? "Anon";
        if (receiverName != object.metaHero.name && senderName != object.metaHero.name) { breakOut = true; }
        if (!breakOut) {
          if (senderName === object.metaHero.name || receiverName == object.metaHero.name) {
            object.setHeroLatestMessage(object.otherHeroes.find((x: Character) => x.name === senderName));
            const chatM = { hero: senderName, content: content, timestamp: new Date() } as MetaChat;
            object.displayChatMessage(chatM);
          }
        }
      }
      else if (event.eventType === "HERO_DIED") {
        console.log("processing HERO_DIED event", event);
        // event.data may contain killerId/killerType; emit a normalized HERO_DIED locally
        const payload: any = {};
        if (event.data) {
          payload.killerId = event.data["killerId"] ?? event.data["killer_id"] ?? undefined;
          payload.killerType = event.data["killerType"] ?? event.data["killer_type"] ?? undefined;
          payload.cause = event.data["cause"] ?? undefined;
        }
        // If the death concerns our hero, emit HERO_DIED so UI can handle respawn
        if (event.heroId === object.metaHero.id) {
          events.emit("HERO_DIED", payload);
          setTimeout(() => {
            object.bonesService.deleteEvent(event.id);
          }, 1000);
        } else {
          const remote = object.mainScene?.level?.children?.find((x: any) => x.id === event.heroId);
          if (remote && typeof remote.destroy === 'function') {
            remote.destroy();
          }

        }
      }
    }
  }
  object.events = metaEvents;
}


export function actionPartyInviteAcceptedEvent(object: any, event: MetaEvent) {
  if (event.data) {
    const partyMembersData = JSON.parse(event.data["party_members"]);
    console.log("received party member data : " + partyMembersData);
    if (partyMembersData) {
      let isMyParty = false;
      let party: any[] = [];
      for (let memberId of partyMembersData) {
        if (!party.find(x => x.heroId === memberId)) {
          const otherPlayer = object.otherHeroes.find((hero: Character) => hero.id === memberId);
          party.push({ heroId: memberId, name: otherPlayer.name, color: otherPlayer.color });
          if (memberId === object.metaHero.id) {
            isMyParty = true;
          }
        }
      }
      console.log("new party:", party);
      if (isMyParty) {

        const heroId = object.metaHero.id ?? 0;
        object.bonesService.getPartyMembers(heroId).then((resp: any) => {
          if (Array.isArray(resp)) {
            object.partyMembers = resp.map((p: any) => ({ heroId: p.heroId ?? p.id ?? 0, name: p.name ?? '', color: p.color }));
          } else {
            object.partyMembers = party; // fallback
          }
          events.emit("PARTY_INVITE_ACCEPTED", { playerId: object.metaHero.id, party: object.partyMembers });
        }).catch((err: any) => {
          console.warn('Failed to fetch canonical party members in actionPartyInviteAcceptedEvent', err);
          object.partyMembers = party; // fallback
          events.emit("PARTY_INVITE_ACCEPTED", { playerId: object.metaHero.id, party: object.partyMembers });
        });
      }
    }
  }
}

export function actionPartyUpEvent(object: any, event: MetaEvent) {
  console.log("actionPartyUpEvent", object, event);
  if (event.data && !object.partyMembers.find((x: any) => x.heroId == event.heroId)) {
    const otherPlayer = object.otherHeroes.find((hero: Character) => hero.id === event.heroId);
    if (otherPlayer) {
      console.log("found other player", otherPlayer);
      object.isDecidingOnParty = true;
      if (confirm(`Accept party request from ${otherPlayer.name}?`)) {
        const partyMemberIdsData = JSON.parse(event.data["party_members"]);

        for (let memberId of partyMemberIdsData) {
          const member = object.otherHeroes.find((x: Character) => x.id === memberId);
          object.partyMembers.push({ heroId: memberId, name: member.name, color: member.color });
          console.log("pushing: ", { heroId: memberId, name: member.name, color: member.color });
        }
        const inviterId = parseInt(event.data["hero_id"]);
        if (!object.partyMembers.find((x: any) => event.data && x.heroId === inviterId)) {
          const member = object.otherHeroes.find((x: Character) => x.id === inviterId);
          if (member) {
            object.partyMembers.push({ heroId: member.id, name: member.name, color: member.color });

            console.log("pushing: ", { heroId: member.id, name: member.name, color: member.color });
          }
        }
        const partyUpAcceptedEvent = new MetaEvent(0, object.metaHero.id, new Date(), "PARTY_INVITE_ACCEPTED", object.metaHero.map, { "party_members": safeStringify(object.partyMembers.map((x: any) => x.heroId)) });
        object.bonesService.updateEvents(partyUpAcceptedEvent);
        // After server-side update, fetch canonical party members and emit
        try {
          const userId = object.parentRef?.user?.id ?? 0;
          if (userId && object.bonesService && typeof object.bonesService.getPartyMembers === 'function') {
            object.bonesService.getPartyMembers(userId).then((resp: any) => {
              if (Array.isArray(resp)) {
                object.partyMembers = resp.map((p: any) => ({ heroId: p.heroId ?? p.id ?? 0, name: p.name ?? '', color: p.color }));
              }
              events.emit("PARTY_INVITE_ACCEPTED", { playerId: object.metaHero.id, party: object.partyMembers });
            }).catch((err: any) => {
              console.warn('Failed to fetch canonical party members after accepting invite in actionPartyUpEvent', err);
              events.emit("PARTY_INVITE_ACCEPTED", { playerId: object.metaHero.id, party: object.partyMembers });
            });
          } else {
            events.emit("PARTY_INVITE_ACCEPTED", { playerId: object.metaHero.id, party: object.partyMembers });
          }
        } catch (err) {
          console.warn('Failed to fetch canonical party members after accepting invite in actionPartyUpEvent', err);
          events.emit("PARTY_INVITE_ACCEPTED", { playerId: object.metaHero.id, party: object.partyMembers });
        }
        object.isDecidingOnParty = false;
      } else {
        object.isDecidingOnParty = false;
      }
    } else {
      console.log("could not find other player?");
    }
  }
}

export function reconcileDroppedItemsFromFetch(object: any, res: any) {
  if (!res) return;
  const map = res.map ?? object.metaHero?.map;
  // If map changed since last fetch, clear all dropped items
  if ((object as any)._lastDroppedMap !== undefined && (object as any)._lastDroppedMap !== map) {
    try {
      for (const inst of Array.from(((object as any)._droppedItemsMap ?? new Map()).values())) {
        try { if (inst && typeof (inst as any).destroy === 'function') (inst as any).destroy(); } catch { }
      }
    } finally {
      try { if ((object as any)._droppedItemsMap) (object as any)._droppedItemsMap.clear(); } catch { }
    }
  }
  try { (object as any)._lastDroppedMap = map; } catch { }

  const serverItems = Array.isArray(res.droppedItems) ? res.droppedItems : (Array.isArray(res.DroppedItems) ? res.DroppedItems : []);
  const seenIds = new Set<number>();

  for (const it of serverItems) {
    try {
      const id = Number(it.id ?? it.itemId ?? it.id);
      if (isNaN(id)) continue;
      seenIds.add(id);
      if (!(object as any)._droppedItemsMap) (object as any)._droppedItemsMap = new Map<number, any>();
      if ((object as any)._droppedItemsMap.has(id)) {
        // already present, skip
        continue;
      }
      // determine position
      const x = (it.coordsX !== undefined && it.coordsX !== null) ? Number(it.coordsX) : (it.position && it.position.x ? Number(it.position.x) : undefined);
      const y = (it.coordsY !== undefined && it.coordsY !== null) ? Number(it.coordsY) : (it.position && it.position.y ? Number(it.position.y) : undefined);
      if (x === undefined || y === undefined || isNaN(x) || isNaN(y)) continue;
      const itemData = (it.data && typeof it.data === 'object') ? it.data : (() => {
        try { return JSON.parse(it.data); } catch { return undefined; }
      })();
      const item = itemData?.item ?? itemData ?? undefined;
      // Determine label: prefer item.name; if server provided a numeric 'power' property,
      // compare against the current hero's power to show up/down arrow for upgrade/downgrade.
      let label: string | undefined = undefined;
      if (item && item.name) {
        label = item.name;
      } else if (itemData && (itemData as any).power !== undefined && (itemData as any).power !== null) {
        const droppedPower = Number((itemData as any).power) || 0;
        const heroPower = Number((object?.metaHero?.power ?? (object?.hero as any)?.power ?? 0)) || 0;
        let arrow = '';
        if (droppedPower > heroPower) arrow = '▲';
        else if (droppedPower < heroPower) arrow = '▼';
        label = `${arrow} Power ${droppedPower}`.trim();
      } else {
        label = undefined;
      }
      const skin = item && item.image ? item.image : (itemData && (itemData as any).image ? (itemData as any).image : undefined);

      // Use local constructors if available via object, otherwise expect globals/imports to exist in runtime
      const dropped = new DroppedItem({ position: new Vector2(x, y), item: item, itemLabel: label, itemSkin: skin, preventDestroyTimeout: true });
      // Attach server id so pickup forwards droppedItemId when available
      try { (dropped as any).serverDroppedId = id; } catch { }
      // Add to scene and tracking map
      try { object.mainScene.level.addChild(dropped); } catch (ex) { console.warn('Failed adding dropped to scene', ex); }
      (object as any)._droppedItemsMap.set(id, dropped);
      // Play item drop sound with distance-based attenuation from the player's hero
      try {
        const heroPos = object?.metaHero?.position;
        if (heroPos) {
          const dx = heroPos.x - x;
          const dy = heroPos.y - y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          // Attenuation: define a hearing radius in pixels (e.g., 300). Outside of that, sound is very quiet.
          const maxHear = gridCells(15); // 15 tiles by default
          const minVolume = 0.12;
          const maxVolume = 1.0;
          // Map distance [0, maxHear] -> volume [maxVolume, minVolume]
          const clamped = Math.max(0, Math.min(maxHear, dist));
          const t = clamped / maxHear; // 0..1
          const volume = Math.max(minVolume, maxVolume * (1 - t));
          resources.playSound('itemdrop', { volume: volume, allowOverlap: true });
        } else {
          // fallback: play at default volume
          resources.playSound('itemdrop', { volume: 0.8, allowOverlap: true });
        }
      } catch (ex) { console.warn('Failed to play itemdrop sound', ex); }
    } catch (ex) {
      console.warn('Error processing dropped item from server', ex, it);
    }
  }

  // Remove any dropped items that we no longer see from server
  const mapRef = ((object as any)._droppedItemsMap ?? new Map<any, any>()) as Map<any, any>;
  for (const [id, inst] of Array.from(mapRef.entries())) {
    if (!seenIds.has(id)) {
      try { if (inst && typeof (inst as any).destroy === 'function') (inst as any).destroy(); } catch { }
      try { mapRef.delete(id); } catch { }
    }
  }
}

// Reconcile persisted town portals from FetchGameData response.
export function reconcileTownPortalsFromFetch(object: any, res: any) {
  if (!res) return;
  const map = res.map ?? object.metaHero?.map;
  if ((object as any)._lastPortalsMap !== undefined && (object as any)._lastPortalsMap !== map) {
    try {
      for (const inst of Array.from(((object as any)._townPortalsMap ?? new Map()).values())) {
        try { if (inst && typeof (inst as any).destroy === 'function') (inst as any).destroy(); } catch { }
      }
    } finally {
      try { if ((object as any)._townPortalsMap) (object as any)._townPortalsMap.clear(); } catch { }
    }
  }
  try { (object as any)._lastPortalsMap = map; } catch { }

  const serverPortals = Array.isArray(res.townPortals) ? res.townPortals : (Array.isArray(res.TownPortals) ? res.TownPortals : []);

  const createPortalFromServer = (it: any): any | undefined => {
    try {
      const id = Number(it.id ?? it.portalId ?? it.id);
      if (isNaN(id)) return undefined;
      const x = (it.coordsX !== undefined && it.coordsX !== null) ? Number(it.coordsX) : (it.position && it.position.x ? Number(it.position.x) : undefined);
      const y = (it.coordsY !== undefined && it.coordsY !== null) ? Number(it.coordsY) : (it.position && it.position.y ? Number(it.position.y) : undefined);
      if (x === undefined || y === undefined || isNaN(x) || isNaN(y)) return undefined;
      // Compute a friendly label. If server provided creator hero id/name, show "Name's\nPortal" on two lines.
      let label = '';
      if (object.metaHero && object.metaHero.map && !object.metaHero.map.toLowerCase().includes('road')) {
        const creatorId = Number(it.creatorHeroId ?? it.creator_hero_id ?? it.heroId ?? it.creator ?? it.creatorId ?? it.ownerId ?? it.createdBy ?? it.hero_id ?? undefined);
        if (!isNaN(creatorId) && creatorId > 0 && object.otherHeroes) {
          const owner = object.otherHeroes.find((h: any) => Number(h.id) === creatorId || h.heroId === creatorId);
          if (owner && owner.name) {
            // e.g., "Max's\nPortal"
            const shortName = String(owner.name).split(' ')[0] || owner.name;
            label = `${shortName}'s\nPortal`;
          }
        } else if (it.creatorName || it.creator_name || it.createdByName) {
          const cn = it.creatorName ?? it.creator_name ?? it.createdByName;
          const shortName = String(cn).split(' ')[0];
          label = `${shortName}'s\nPortal`;
        } else if (object.metaHero && object.metaHero.name) {
          // Fallback: if this is the local player's portal, show local name
          const me = object.metaHero.name;
          label = `${String(me).split(' ')[0]}'s\nPortal`;
        } 
      }

      const portalMarker = new TownPortal({ position: new Vector2(x, y), label: label });
      try { (portalMarker as any).serverPortalId = id; } catch { }
      // Parse server data
      let dataObj: any = undefined;
      if (it.data && typeof it.data === 'object') dataObj = it.data;
      else if (it.data && typeof it.data === 'string') {
        try { dataObj = JSON.parse(it.data); } catch { dataObj = undefined; }
      }
      if (!dataObj && it.data && (it.coordsX !== undefined || it.coordsY !== undefined || it.map !== undefined)) {
        dataObj = { coordsX: it.coordsX, coordsY: it.coordsY, map: it.map };
      }

      if (dataObj && typeof dataObj === 'object') {
        let coerced = false;
        const pickFirst = (v: any) => Array.isArray(v) ? (v.length > 0 ? v[0] : undefined) : v;
        if (dataObj.map !== undefined) {
          const raw = pickFirst(dataObj.map);
          if (raw !== dataObj.map) { dataObj.map = raw; coerced = true; }
        }
        if (dataObj.originMap !== undefined) {
          const raw = pickFirst(dataObj.originMap);
          if (raw !== dataObj.originMap) { dataObj.originMap = raw; coerced = true; }
        }
        // Coerce coordinate-like fields
        const coordKeys = ['originX', 'originY', 'coordsX', 'coordsY', 'x', 'y'];
        for (const k of coordKeys) {
          if (dataObj[k] !== undefined && Array.isArray(dataObj[k])) {
            dataObj[k] = dataObj[k].length > 0 ? dataObj[k][0] : 0;
            coerced = true;
          }
        }
      }
      try { (portalMarker as any).serverData = dataObj; } catch { }
      try { (portalMarker as any).serverCreatorHeroId = Number(it.creatorHeroId ?? it.creator_hero_id ?? it.heroId ?? it.creator ?? it.creatorId ?? it.ownerId ?? it.createdBy ?? it.hero_id ?? undefined); } catch { }
      return { id, portalMarker };
    } catch (ex) {
      console.warn('Error processing town portal from server', ex, it);
      return undefined;
    }
  };

  const seenIds = new Set<number>();
  for (const it of serverPortals) {
    const created = createPortalFromServer(it);
    if (!created) continue;
    const { id, portalMarker } = created;
    seenIds.add(id);
    try { if (!(object as any)._townPortalsMap) (object as any)._townPortalsMap = new Map<number, any>(); } catch { }
    try { if ((object as any)._townPortalsMap.has(id)) continue; } catch { }
    try { object.mainScene.level.addChild(portalMarker); } catch { }
    try { (object as any)._townPortalsMap.set(id, portalMarker); } catch { }
  }

  const mapRef2 = ((object as any)._townPortalsMap ?? new Map<any, any>()) as Map<any, any>;
  for (const [id, inst] of Array.from(mapRef2.entries())) {
    if (!seenIds.has(id)) {
      try { if (inst && typeof (inst as any).destroy === 'function') (inst as any).destroy(); } catch { }
      try { mapRef2.delete(id); } catch { }
    }
  }
}
