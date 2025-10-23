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


export class Network {
  constructor() {
  }
}
 
export let actionBlocker = false;
export let encounterUpdates: Bot[] = [];
export let batchInterval: any;
export let pendingAttacks: any[] = [];
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
  if (attackBatchInterval) return;
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

  const metaEvent = new MetaEvent(
    0,
    object.metaHero.id,
    new Date(),
    "ATTACK_BATCH",
    object.metaHero.map,
    { "attacks": safeStringify(attacks) }
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
  events.on("CHANGE_LEVEL", object.mainScene, (level: Level) => {
    console.log("changing levels");
    object.otherHeroes = [];
    if (!object.hero?.id) {
      object.pollForChanges();
    }
    if (object.mainScene && object.mainScene.level) {
      object.metaHero.map = level.name ?? "HERO_ROOM";
      object.metaHero.position = level.getDefaultHeroPosition();
      object.mainScene.level.itemsFound = object.mainScene.inventory.getItemsFound();

      const levelHero = object.mainScene.level.children.find((x: Character) => x.id === object.hero.id) ?? object.metaHero;
 
      let tmpBotPosition = levelHero.position.duplicate();

      switch (levelHero.facingDirection) {
        case "UP":
          tmpBotPosition.y -= gridCells(1); // Move bot below the hero
          break;
        case "DOWN":
          tmpBotPosition.y += gridCells(1); // Move bot above the hero
          break;
        case "LEFT":
          tmpBotPosition.x -= gridCells(1); // Move bot to the right
          break;
        case "RIGHT":
          tmpBotPosition.x += gridCells(1); // Move bot to the left
          break;
      }
       
      setTimeout(() => {
        const deployedBot = object.metaHero?.metabots?.find((x: MetaBot) => x.isDeployed && x.hp > 0);
        if (deployedBot) {
          deployedBot.position = tmpBotPosition;
          deployedBot.destinationPosition = tmpBotPosition.duplicate();
          deployedBot.lastPosition = tmpBotPosition.duplicate();
          const levelBot = object.mainScene.level.children.find((x: Bot) => x.id === deployedBot.id);
          if (levelBot) {
            levelBot.position = tmpBotPosition;
            levelBot.destinationPosition = tmpBotPosition.duplicate();
            levelBot.lastPosition = tmpBotPosition.duplicate();
          }

          console.log("set deployedBot position to hero position", deployedBot.position, object.metaHero.position);
        } 
      }, 25); 
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
  events.on("CHARACTER_NAME_CREATED", object, (name: string) => {
    if (object.chatInput.nativeElement.placeholder === "Enter your name" && object.parentRef && object.parentRef.user && object.parentRef.user.id) {
      object.bonesService.createHero(object.parentRef.user.id, name);
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

  events.on("WHISPER_AT", object, ( objectAtPosition: GameObject ) => {
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
  events.on("START_PRESSED", object, (data: any) => {
    if (object.blockOpenStartMenu) {
      return;
    }
    if (object.isStartMenuOpened) {
      events.emit("CLOSE_INVENTORY_MENU", data);
      events.emit("UNBLOCK_BACKGROUND_SELECTION");
    } else {
      const exits = object.mainScene.level.children.filter((x: GameObject) => x.name == "exitObject"); 
      events.emit("OPEN_START_MENU", ({ exits: exits, location: object.mainScene.metaHero.position }));
      events.emit("BLOCK_BACKGROUND_SELECTION");
    }
  });

  events.on("CLOSE_INVENTORY_MENU", object, () => {
    object.isStartMenuOpened = false;
    events.emit("SHOW_START_BUTTON");
  });

  events.on("OPEN_START_MENU", object, () => {
    object.reinitializeStartMenuData();
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
    if ((object.chatInput && document.activeElement != object.chatInput) || !object.chatInput)
    {
      const attack = {
        timestamp: new Date().toISOString(),
        skill: (skill && (typeof (skill as any).name === 'string')) ? (skill as any).name : (typeof skill === 'string' ? skill : undefined),
        heroId: object.metaHero.id
      };
      pendingAttacks.push(attack);
      startAttackBatch(object, 1000);
    }
  });

  events.on("GOT_REWARDS", object, (params: { location: Vector2, part: HeroInventoryItem }) => {
    if (!params.part) return;
    const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "ITEM_DROPPED", object.metaHero.map, { "location": safeStringify(params.location), "item": safeStringify(params.part) })
    object.bonesService.updateEvents(metaEvent);    
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
    const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "PARTY_UP", object.metaHero.map, { "hero_id": `${person.id}`, "party_members": safeStringify(object.partyMembers.map((x:any) => x.heroId)) })
    object.bonesService.updateEvents(metaEvent);
  });
  events.on("UNPARTY", object, (person: Hero) => { 
    const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "UNPARTY", object.metaHero.map, { "hero_id": `${person.id}` })
    object.bonesService.updateEvents(metaEvent);
    object.partyMembers = object.partyMembers.filter((x: any) => x.heroId === object.metaHero.id);
    console.log("reset party member ids");
    object.reinitializeInventoryData();
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
      //console.log("picking up item: ",data);
      if (data.category) {
        object.bonesService.updateInventory(object.metaHero.id, data.name, data.imageName, data.category);
      } else if (data.item) { 
        object.bonesService.updateBotParts(object.metaHero.id, [data.item]); 
        object.mainScene.inventory.parts.concat(data.item);

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
    } 
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
    try {
      // If this is an ATTACK or ATTACK_BATCH event, emit OTHER_HERO_ATTACK once per attack
      if (event && (event.eventType === "ATTACK" || event.eventType === "ATTACK_BATCH")) {
        const attackId = event.id ? String(event.id) : `${event.heroId}:${event.eventType}:${event.timestamp}:${JSON.stringify(event.data)}`;
        if (!processedAttacks.has(attackId)) {
          processedAttacks.set(attackId, Date.now());
          // Emit normalized payload (name and payload only) so handlers don't need object
          events.emit("OTHER_HERO_ATTACK", { sourceHeroId: event.heroId, attack: event.data ?? {} });
        }
      }
    } catch (ex) {
      console.error('actionMultiplayerEvents ATTACK handling error', ex);
    }

    try {
      // Only handle events we haven't seen before
      const existingEvent = currentEvents.find((e: MetaEvent) => e && e.id == event.id);
      if (!existingEvent) {
        //do something with object fresh event.
        if (event.eventType === "PARTY_UP" && event.data && event.data["hero_id"] == `${object.metaHero.id}` && !object.isDecidingOnParty) {
          actionPartyUpEvent(object, event);
        }
        if (event.eventType === "UNPARTY" && event.data && event.data["hero_id"]) {
          console.log("got unparty event", event);
          object.partyMembers = object.partyMembers.filter((x:any) => event && event.data && event.data["hero_id"] && x.heroId != parseInt(event.data["hero_id"]) && x.heroId != event.heroId);
          if (event.data["hero_id"] == object.metaHero.id) {
            object.reinitializeInventoryData();
          }
        }
        if (event.eventType === "PARTY_INVITE_ACCEPTED" && event.heroId != object.metaHero.id) {
          actionPartyInviteAcceptedEvent(object, event);
        } 
        if (event.eventType === "ITEM_DESTROYED") {
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
        if (event.eventType === "BUY_ITEM") {
          if (event.heroId === object.metaHero.id) {
            events.emit("BUY_ITEM_CONFIRMED", { heroId: event.heroId, item: (event.data ? event.data["item"] : "") })
            object.bonesService.deleteEvent(event.id);
          }
        }
        if (event.eventType === "ITEM_DROPPED") {
          if (event.data) {
            const tmpMetabotPart = JSON.parse(event.data["item"]) as HeroInventoryItem;
            const location = JSON.parse(event.data["location"]) as Vector2;
            object.addItemToScene(tmpMetabotPart, location);
          }
        }
        if (event.eventType === "ATTACK_BATCH" && event.data && event.data["attacks"]) {
          try {
            const attacks = JSON.parse(event.data["attacks"] as string) as any[];
            for (let atk of attacks) {
              if (event.heroId === object.metaHero.id) continue;
              events.emit("REMOTE_ATTACK", { attack: atk, sourceHeroId: event.heroId });
            }
          } catch (ex) { console.error("Failed to process ATTACK_BATCH event", ex); }
        }
        if (event.eventType === "OTHER_HERO_ATTACK") {
          try {
            const payload = { sourceHeroId: event.heroId, data: event.data };
            events.emit("OTHER_HERO_ATTACK", payload);
          } catch (ex) { console.error('Failed to handle OTHER_HERO_ATTACK', ex); }
        }
        if (event.eventType === "CHAT" && event.data) {
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
        if (event.eventType === "WHISPER" && event.data) {
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
      }
    } catch (ex) {
      console.error('actionMultiplayerEvents handling error', ex);
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
        object.partyMembers = party;
        events.emit("PARTY_INVITE_ACCEPTED", { playerId: object.metaHero.id, party: object.partyMembers });
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
        events.emit("PARTY_INVITE_ACCEPTED", { playerId: object.metaHero.id, party: object.partyMembers });
        object.isDecidingOnParty = false;
      } else {
        object.isDecidingOnParty = false;
      }
    } else {
      console.log("could not find other player?");
    }
  }
}
