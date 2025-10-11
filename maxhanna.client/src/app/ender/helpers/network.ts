import { events } from "./events";
import { Hero } from "../objects/Hero/hero";
import { MetaBot } from "../../../services/datacontracts/meta/meta-bot";
import { MetaEvent } from "../../../services/datacontracts/meta/meta-event";
import { MetaChat } from "../../../services/datacontracts/meta/meta-chat";
import { MetaBotPart, LEFT_ARM, RIGHT_ARM, LEGS, HEAD } from "../../../services/datacontracts/meta/meta-bot-part";
import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { GameObject } from "../objects/game-object";
import { Level } from "../objects/Level/level";
import { ShopMenu } from "../objects/Menu/shop-menu";
import { WardrobeMenu } from "../objects/Menu/wardrobe-menu";
import { gridCells } from "./grid-cells";
import { addBikeWallCell } from './bike-wall-index';
import { InventoryItem } from "../objects/InventoryItem/inventory-item";
import { Character } from "../objects/character";
import { BikeWall } from "../objects/Environment/bike-wall";

export class Network {
  constructor() {
  }
}

export let actionBlocker = false; 
export let batchInterval: any; 
  
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
 
export function subscribeToMainGameEvents(object: any) {
  events.on("CHANGE_LEVEL", object.mainScene, (level: Level) => {
    console.log("changing levels");
    object.otherHeroes = [];
    if (!object.hero?.id) {
      object.pollForChanges();
    }
    if (object.mainScene && object.mainScene.level) {
      // map property removed; level is inherent in scene/hero state
      // Compute spawn offset based on number of other players on the map.
      // Shift spawn to the right by 2 grid cells per player already on the map.
      // Count existing hero sprites on the current level (exclude self)
      const playerCount = (object.mainScene && object.mainScene.level && object.mainScene.level.children)
        ? object.mainScene.level.children.filter((c: any) => c.constructor && c.constructor.name === 'Hero' && c.id !== object.metaHero.id).length
        : 0;
      const offsetX = gridCells(playerCount * 2);
      const defaultPos = level.getDefaultHeroPosition();
      object.metaHero.position = new Vector2(defaultPos.x + offsetX, defaultPos.y);
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
      object.enderService.createHero(object.parentRef.user.id, name);
    }
  });
  // CHARACTER_POSITION death check removed - backend now authoritatively detects deaths.
  events.on("STARTED_TYPING", object, () => {
    const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "CHAT", object.metaHero.level, { "sender": object.metaHero.name ?? "Anon", "content": "..." });
    object.enderService.updateEvents(metaEvent);
    const name = object.metaHero.name;
    object.chat.unshift(
      {
        hero: name,
        content: "...",
        timestamp: new Date()
      } as MetaChat);
    object.setHeroLatestMessage(object.otherHeroes.find((x: Character) => x.name === name))
  })
  events.on("SEND_CHAT_MESSAGE", object, (chat: string) => {
    const msg = chat.trim();
    if (object.parentRef?.user) {
      if (object.chatInput.nativeElement.placeholder !== "Enter your name") {
  const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "CHAT", object.metaHero.level, { "sender": object.metaHero.name ?? "Anon", "content": msg })
        object.enderService.updateEvents(metaEvent);
        object.chatInput.nativeElement.value = '';
        setTimeout(() => {
          object.chatInput.nativeElement.blur();
          object.gameCanvas.nativeElement.focus();
        }, 0);

        const name = object.metaHero.name;
        object.chat.unshift(
          {
            hero: name,
            content: msg ?? "",
            timestamp: new Date()
          } as MetaChat);
        object.setHeroLatestMessage(object.otherHeroes.find((x: Character) => x.name === name))
      }
    }
  });

  events.on("WAVE_AT", object, (objectAtPosition: GameObject) => {
    const msg = `👋 ${(objectAtPosition as Hero).name}`;
  const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "CHAT", object.metaHero.level, { "sender": object.metaHero.name ?? "Anon", "content": msg })
    object.enderService.updateEvents(metaEvent);
  });

  events.on("WHISPER_AT", object, (objectAtPosition: GameObject) => {
    if (!objectAtPosition) return;
    const msgContent = object.getChatText();
    const receiver = (objectAtPosition as Hero).name ?? "Anon";
    const sender = (object.metaHero as Hero).name ?? "Anon";
    const msg = `🤫 (${sender}:${receiver}) : ${msgContent}`;
  const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "WHISPER", object.metaHero.level, { "sender": sender, "receiver": receiver, "content": msg })
    object.enderService.updateEvents(metaEvent);

    if (sender === object.metaHero.name) {
      object.chatInput.nativeElement.value = "";
    }
  });
    
  events.on("SPAWN_BIKE_WALL", object, (params: { x: number, y: number }) => {
    try {
      if (!object.pendingBikeWalls) object.pendingBikeWalls = [] as { x: number, y: number }[];
      object.pendingBikeWalls.push({ x: params.x, y: params.y });
    } catch (e) {
      // fallback to older behavior if something goes wrong
      const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "SPAWN_BIKE_WALL", object.metaHero.level, { x: params.x + "", y: params.y + "" });
      object.enderService.updateEvents(metaEvent);
    }
  });

  events.on("BIKEWALL_CREATED", object, (params: { x: number, y: number }) => {
    try {
      if (!params || !object.mainScene || !object.mainScene.level) return;
      const { x, y } = params;
      addBikeWallCell(x, y);
      const heroes = object.mainScene.level.children.filter((c: any) => c && c.constructor && c.constructor.name === 'Hero');
    } catch (e) {
      console.error("BIKEWALL_CREATED handler failed", e);
    }
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
 

  events.on("PARTY_UP", object, (person: Hero) => {
    const foundInParty = object.partyMembers.find((x: any) => x.heroId === object.metaHero.id);
    if (!foundInParty) {
      object.partyMembers.push({ heroId: object.metaHero.id, name: object.metaHero.name, color: object.metaHero.color });
    }
    const foundInParty2 = object.partyMembers.find((x: any) => x.heroId === person.id);
    if (!foundInParty2) {
      object.partyMembers.push({ heroId: person.id, name: person.name, color: person.colorSwap });
    }
  const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "PARTY_UP", object.metaHero.level, { "hero_id": `${person.id}`, "party_members": safeStringify(object.partyMembers.map((x: any) => x.heroId)) })
    object.enderService.updateEvents(metaEvent);
  });
  events.on("UNPARTY", object, (person: Hero) => {
  const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "UNPARTY", object.metaHero.level, { "hero_id": `${person.id}` })
    object.enderService.updateEvents(metaEvent);
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
        object.enderService.updateInventory(object.metaHero.id, data.name, data.imageName, data.category);
      } else if (data.item) {
        object.enderService.updateBotParts(object.metaHero.id, [data.item]);
        object.mainScene.inventory.parts.concat(data.item);

  const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "ITEM_DESTROYED", object.metaHero.level,
          {
            "position": `${safeStringify(data.position)}`,
            "damage": `${data.item?.damageMod}`,
            "partName": `${data.item?.partName}`,
            "skill": `${data.item?.skill?.name}`
          });
        object.enderService.updateEvents(metaEvent);
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
          object.parentRef.modalComponent.setModalFont("fontRetroGaming");
          object.parentRef.modalComponent.removeCloseButton();
          object.parentRef.setModalBody("What's your style? :");
        }
      }, 1);
    }
  });
}

export function actionMultiplayerEvents(object: any, metaEvents: MetaEvent[]) {
  const currentEvents = object.events;
  if (metaEvents.length > 0) {
    for (let event of metaEvents) {
      console.log("event received", event);
      const existingEvent = currentEvents.find((e: MetaEvent) => e.id == event.id);
      if (!existingEvent) {
        //do something with object fresh event.
        if (event.eventType === "PARTY_UP" && event.data && event.data["hero_id"] == `${object.metaHero.id}` && !object.isDecidingOnParty) {
          actionPartyUpEvent(object, event);
        }
        if (event.eventType === "UNPARTY" && event.data && event.data["hero_id"]) {
          console.log("got unparty event", event);
          object.partyMembers = object.partyMembers.filter((x: any) => event && event.data && event.data["hero_id"] && x.heroId != parseInt(event.data["hero_id"]) && x.heroId != event.heroId);
          if (event.data["hero_id"] == object.metaHero.id) {
            object.reinitializeInventoryData();
          }
        }
        if (event.eventType === "PARTY_INVITE_ACCEPTED" && event.heroId != object.metaHero.id) {
          actionPartyInviteAcceptedEvent(object, event);
        } 
       
        if (event.eventType === "HERO_DIED") {
          try {
            const evLevel = event.level ?? (event.data && event.data["level"]) ?? null;
            const myLevel = object.metaHero?.level ?? object.mainScene?.level?.name ?? null;
            const victimId = event.heroId ?? (event.data && event.data["heroId"]) ?? null;

            if (evLevel != null && myLevel != null && victimId != null && (evLevel === myLevel || String(evLevel) === String(myLevel))) {
              if (object.mainScene && object.mainScene.level && object.mainScene.level.children) {
                const found = object.mainScene.level.children.find((c: any) => c && c.id === victimId);
                if (found) {
                  try {
                    found.destroy();
                    if (victimId == object.metaHero.id) {
                      events.emit("HERO_DIED");
                    }
                    console.log(`HERO_DIED removed character id=${victimId} on level ${evLevel}`);
                  } catch (err) {
                    console.error('Failed to destroy hero element', err);
                  }
                }
              }
            }
          } catch (ex) {
            console.error('Error handling HERO_DIED event', ex);
          }
        }
          
        if (event.eventType === "SPAWN_BIKE_WALL" && event.data) {
          const x = parseInt(event.data["x"] ?? "NaN");
          const y = parseInt(event.data["y"] ?? "NaN");
          if (!isNaN(x) && !isNaN(y) && object.mainScene.level) {
            const exists = object.mainScene.level.children.some((c: any) => c.name === 'bike-wall' && c.position && c.position.x === x && c.position.y === y);
            if (!exists) {
              const useColor = event.heroId === object.metaHero.id ? object.metaHero?.colorSwap : undefined;
              const wall = new BikeWall({ position: new Vector2(x, y), colorSwap: useColor });
              object.mainScene.level.addChild(wall);
              // notify systems that a wall now exists at this location so any heroes under it can be processed
              try { events.emit("BIKEWALL_CREATED", { x, y }); } catch (e) { /* swallow errors */ }
            }
          }
        }
         
        if (event.eventType === "ITEM_DROPPED") {
          if (event.data) {
            const tmpMetabotPart = JSON.parse(event.data["item"]) as MetaBotPart;
            const location = JSON.parse(event.data["location"]) as Vector2;
            object.addItemToScene(tmpMetabotPart, location);
          }
        }
        if (event.eventType === "CHAT" && event.data) {
          const content = event.data["content"] ?? '';
          const name = event.data["sender"] ?? "Anon";

          const metachat = {
            hero: name,
            content: content,
            timestamp: new Date()
          } as MetaChat;
          //object.chat.unshift(metachat);
          object.displayChatMessage(metachat);
          object.setHeroLatestMessage(object.otherHeroes.find((x: Character) => x.name === name));

        }
        if (event.eventType === "WHISPER" && event.data) {
          let breakOut = false;
          const content = event.data["content"] ?? '';
          const senderName = event.data["sender"] ?? "Anon";
          const receiverName = event.data["receiver"] ?? "Anon";
          if (receiverName != object.metaHero.name && senderName != object.metaHero.name) {
            breakOut = true;
          }
          if (!breakOut) {

            if (senderName === object.metaHero.name || receiverName == object.metaHero.name) {
              object.setHeroLatestMessage(object.otherHeroes.find((x: Character) => x.name === senderName));

              const chatM = {
                hero: senderName,
                content: content,
                timestamp: new Date()
              } as MetaChat;
              object.displayChatMessage(chatM);
            }
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
        const partyUpAcceptedEvent = new MetaEvent(0, object.metaHero.id, new Date(), "PARTY_INVITE_ACCEPTED", object.metaHero.level, { "party_members": safeStringify(object.partyMembers.map((x: any) => x.heroId)) });
        object.enderService.updateEvents(partyUpAcceptedEvent);
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
