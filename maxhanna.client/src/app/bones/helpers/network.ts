import { events } from "./events";
import { Hero } from "../objects/Hero/hero";
import { MetaBot } from "../../../services/datacontracts/bones/meta-bot";
import { MetaEvent } from "../../../services/datacontracts/bones/meta-event";
import { MetaChat } from "../../../services/datacontracts/bones/meta-chat";
import { MetaBotPart, LEFT_ARM, RIGHT_ARM, LEGS, HEAD } from "../../../services/datacontracts/bones/meta-bot-part";
import { Vector2 } from "../../../services/datacontracts/bones/vector2";
import { Bot } from "../objects/Bot/bot";
import { GameObject } from "../objects/game-object";
import { Level } from "../objects/Level/level";
import { ShopMenu } from "../objects/Menu/shop-menu";
import { WardrobeMenu } from "../objects/Menu/wardrobe-menu"; 
import { gridCells } from "./grid-cells";
import { Skill } from "./skill-types";
import { InventoryItem } from "../objects/InventoryItem/inventory-item";
import { MetaHero } from "../../../services/datacontracts/bones/meta-hero";
import { Character } from "../objects/character";
import { generateReward, setTargetToDestroyed } from "./fight";
import { WarpBase } from "../objects/Effects/Warp/warp-base";


export class Network {
  constructor() {
  }
}
 
export let actionBlocker = false;
export let encounterUpdates: Bot[] = [];
export let batchInterval: any;
export let pendingAttacks: any[] = [];
export let attackBatchInterval: any;

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

  events.on("MASK_EQUIPPED", object, (params: { maskId: number }) => {
    object.metaHero.mask = params.maskId === 0 ? undefined : params.maskId;
    let existingHero = object.mainScene.level?.children.find((x: any) => x.id === object.metaHero.id);
    if (existingHero) {
      existingHero.destroy();
    }
    object.updatePlayers();
  });

  events.on("SHOP_OPENED", object, (params: { heroPosition: Vector2, entranceLevel: Level, items?: InventoryItem[] }) => {
    if (!actionBlocker) {
      events.emit("BLOCK_BACKGROUND_SELECTION");
      object.blockOpenStartMenu = true;
      object.isShopMenuOpened = true;
      object.mainScene?.inventory?.children?.forEach((x: any) => x.destroy());
      object.mainScene?.setLevel(new ShopMenu(params));
      object.stopPollingForUpdates = true;
      setActionBlocker(50);
    }
  });

  events.on("SHOP_OPENED_TO_SELL", object, (params: { heroPosition: Vector2, entranceLevel: Level, items?: InventoryItem[] }) => { 
    events.emit("BLOCK_BACKGROUND_SELECTION");
    let shopParts: InventoryItem[] = [];
    let x = 0;
    const parts = object.mainScene.inventory.parts.sort((x: MetaBotPart, y: MetaBotPart) => {
      const xId = x.metabotId ?? 0;
      const yId = y.metabotId ?? 0;
      return xId - yId;
    });
    for (let part of parts) {
      if (!part.metabotId) {
        shopParts.push(new InventoryItem({ id: x++, name: `${part.partName} ${part.skill.name} ${part.damageMod}`, category: "MetaBotPart" }))
      }
    }
    params.items = shopParts;
    let config = { ...params, sellingMode: true };

    object.blockOpenStartMenu = true;
    object.isShopMenuOpened = true;
    object.mainScene?.inventory?.children?.forEach((x: any) => x.destroy());
    object.mainScene.setLevel(new ShopMenu(config));
    object.stopPollingForUpdates = true;
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
  events.on("SHOP_CLOSED", object, (params: { heroPosition: Vector2, entranceLevel: Level }) => {
    object.stopPollingForUpdates = false;
    object.blockOpenStartMenu = false;
    object.isShopMenuOpened = false;
    object.mainScene?.inventory?.renderParty();
    const newLevel = object.getLevelFromLevelName((params.entranceLevel.name ?? "HERO_ROOM"));
    newLevel.defaultHeroPosition = params.heroPosition;
    events.emit("CHANGE_LEVEL", newLevel);
    events.emit("SHOW_START_BUTTON"); 
    events.emit("UNBLOCK_BACKGROUND_SELECTION");
  });
  events.on("SELECTED_PART", object, (params: { selectedPart: string, selection: string, selectedMetabotId: number }) => {
    const parts = object.mainScene.inventory.parts;
    const skill = params.selection.split(/\d/)[0];
    const dmg = params.selection.split(' ').slice(-2, -1)[0];
    let targetPart = undefined;
    for (let part of parts) {
      //console.log("Checking part:", part); // Debugging: log the part being checked
      //console.log("skill:", skill); // Debugging: log the skill
      //console.log("part.skill.name:", part.skill.name); // Debugging: log part.skill.name
      //console.log("dmg:", dmg); // Debugging: log dmg value
      //console.log("part.damageMod:", part.damageMod); // Debugging: log part.damageMod
      //console.log("params.selectedPart:", params.selectedPart); // Debugging: log params.selectedPart
      //console.log("part.partName:", part.partName); // Debugging: log part.partName

      if (part.skill.name.trim() === skill.trim() && part.damageMod === parseInt(dmg) && part.partName.trim() === params.selectedPart.trim()) {
        targetPart = part; 
        break;
      }
    }
    let oldPart = undefined;
    const metabotSelected = object.metaHero.metabots.find((b: MetaBot) => b.id === params.selectedMetabotId);

   // console.log("Selected a bot part : ", params, skill, dmg, parts, targetPart);
    if (metabotSelected && targetPart) {
      targetPart.metabotId = params.selectedMetabotId;
      if (targetPart.partName === LEFT_ARM) {
        oldPart = metabotSelected.leftArm;
        metabotSelected.leftArm = targetPart;
      } else if (targetPart.partName === RIGHT_ARM) {
        oldPart = metabotSelected.rightArm;
        metabotSelected.rightArm = targetPart;
      } else if (targetPart.partName === LEGS) {
        oldPart = metabotSelected.legs;
        metabotSelected.legs = targetPart;
      } else if (targetPart.partName === HEAD) {
        oldPart = metabotSelected.head;
        metabotSelected.head = targetPart;
      } 

      if (oldPart && oldPart.id == targetPart.id) {
        return;
      }

      for (let invPart of parts) {
        if (invPart.id != targetPart.id && invPart.partName === targetPart.partName && invPart.metabotId) {
          object.bonesService.unequipPart(invPart.id);
          invPart.metabotId = undefined;
        }
      }
      object.bonesService.equipPart(targetPart.id, targetPart.metabotId);
    }
  });


  events.on("DEPLOY", object, async (params: { bot: MetaBot, metaHero?: MetaHero }) => {
    const tmpMetahero = params.metaHero && !(params.metaHero instanceof MetaHero) ?
      object.mainScene?.level?.children?.find((x: any) => x.id === params.metaHero?.id) : params.metaHero;
    const hero = tmpMetahero ?? object.metaHero;
    if (params.bot.id) {
      const addedBot = object.addBotToScene(hero, params.bot);

      const warpBase = new WarpBase({ position: addedBot.position, parentId: addedBot.id, offsetX: -8, offsetY: 12 });
      object.mainScene.level?.addChild(warpBase);
      setTimeout(() => {
        warpBase.destroy();
      }, 1300);

      if (object.metaHero.id === hero.id) {
        const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "DEPLOY", object.metaHero.map, { "metaHero": `${safeStringify(hero)}`, "metaBot": `${safeStringify(params.bot)}` });
        object.bonesService.updateEvents(metaEvent);
      }
     // await object.reinitializeInventoryData();
    }
  });

  events.on("CALL_BOT_BACK", object, async (params: { bot: MetaBot }) => {
    if (params.bot?.id) {
      if (params.bot.heroId === object.metaHero.id) {
        const metaEvent = new MetaEvent(0, params.bot.heroId, new Date(), "CALL_BOT_BACK", object.metaHero.map);
        object.bonesService.updateEvents(metaEvent).then(async (x: any) => {
          //await object.reinitializeInventoryData();
        });
      }
      const tgt = object.mainScene?.level?.children?.find((x: any) => x.id === params.bot.id);
      const hero = object.mainScene?.level?.children?.find((x: any) => x.id === params.bot.heroId);
      if (hero) {
        const tgtBot = hero.metabots.find((x: any) => x.id === params.bot.id);
        if (tgtBot) {
          tgtBot.isDeployed = false;
        }
      }
      if (tgt) {
        tgt.preventDestroyAnimation = true;
        tgt.isDeployed = false;
        tgt.isWarping = true;
        tgt.destroy();
      }
      const tgtHeroBot = object.metaHero.metabots.find((x: any) => x.id === params.bot.id);
      if (tgtHeroBot) {
        tgtHeroBot.isDeployed = false;
      }
    }
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

  events.on("REPAIR_ALL_METABOTS", object, () => {
    if (actionBlocker) return;
    for (let bot of object.metaHero.metabots) {
      bot.hp = 100;
    }
    if (object.hero && object.hero.metabots) {
      for (let bot of object.hero.metabots) {
        bot.hp = 100;
      }
    }
    const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "REPAIR_ALL_METABOTS", object.metaHero.map, { "heroId": object.metaHero.id + "" });
    object.bonesService.updateEvents(metaEvent); 
    setActionBlocker(50);
  });

  events.on("ITEM_PURCHASED", object, (item: InventoryItem) => {
    console.log(item);
    const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "BUY_ITEM", object.metaHero.map, { "item": safeStringify(item) });
    object.bonesService.updateEvents(metaEvent);
    if (item.category === "botFrame") {
      const newBot = new MetaBot(
        {
          id: object.metaHero.metabots.length + 1,
          heroId: object.metaHero.id,
          type: item.stats["type"],
          hp: item.stats["hp"],
          name: item.name ?? "",
          level: 1
        });
      object.bonesService.createBot(newBot).then((res: MetaBot) => {
        if (res) {
          object.metaHero.metabots.push(res);
        }
      });
    }
    console.log("reinit inv after item purchase");
    object.reinitializeInventoryData();
  });

  events.on("ITEM_SOLD", object, (items: InventoryItem[]) => { 
    const botPartsSold = items.filter(x => x.category === "MetaBotPart");
    let partIdNumbers = [] 
    for (let item of botPartsSold) {
      let itmString = item.name ?? "";
      itmString = itmString.replace("Left Punch", "Left_Punch");
      itmString = itmString.replace("Right Punch", "Right_Punch"); 

      const partName = itmString.split(' ')[0].trim();
      let skillName = itmString.split(' ')[1].trim().replace("_", " ");
      const damageMod = itmString.split(' ')[2].trim();
       

      const part = object.mainScene.inventory.parts.find((x: any) => x.partName === partName && x.skill.name === skillName && x.damageMod === parseInt(damageMod) && !partIdNumbers.includes(x.id)) as MetaBotPart;
      if (part) {
        partIdNumbers.push(part.id);
        object.mainScene.inventory.parts = object.mainScene.inventory.parts.filter((x: any) => x.id !== part.id);
      }
    }

    object.bonesService.sellBotParts(object.metaHero.id, partIdNumbers);
  });

  events.on("BUY_ITEM_CONFIRMED", object, (params: { heroId: number, item: string }) => {
    const shopItem = JSON.parse(params.item) as InventoryItem;
    if (params.heroId === object.metaHero.id) {
      setTimeout(() => {
        events.emit("CHARACTER_PICKS_UP_ITEM", {
          position: new Vector2(0, 0),
          id: object.mainScene.inventory.nextId,
          hero: object.hero,
          name: shopItem.name,
          imageName: shopItem.image,
          category: shopItem.category,
          stats: shopItem.stats
        });
      }, 100);
    }
  });

  events.on("TARGET_LOCKED", object, (params: { source: Bot, target: Bot }) => {
    if (params.source.heroId) { 
      const metaEvent = new MetaEvent(0, params.source.heroId, new Date(), "TARGET_LOCKED", object.metaHero.map, { "sourceId": params.source.id + "", "targetId": params.target.id + "" });
      object.bonesService.updateEvents(metaEvent);
    }
  });

  events.on("TARGET_UNLOCKED", object, (params: { source: Bot, target: Bot }) => {
    if (params.source.heroId) { 
      const metaEvent = new MetaEvent(1, params.source.heroId, new Date(), "TARGET_UNLOCKED", object.metaHero.map, { "sourceId": params.source.id + "", "targetId": params.target.id + "" });
      object.bonesService.updateEvents(metaEvent);
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
    try {
      // Queue attack locally and send in batches to reduce network chatter
      const attack = {
        timestamp: new Date().toISOString(),
        skill: skill,
        heroId: object.metaHero.id
      };
      pendingAttacks.push(attack);
      startAttackBatch(object, 1000);
    } catch (ex) {
      console.error('Failed to queue attack', ex);
    }
  });

  events.on("GOT_REWARDS", object, (params: { location: Vector2, part: MetaBotPart }) => {
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
  const currentEvents = object.events;
  if (metaEvents.length > 0) {
    for (let event of metaEvents) {
      const existingEvent = currentEvents.find((e: MetaEvent) => e.id == event.id);
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
        if (event.eventType === "DEPLOY" && event.data && event.data["metaHero"] && event.data["metaBot"]) {
          const tmpHero = JSON.parse(event.data["metaHero"]) as MetaHero;
          const tmpMetabot = JSON.parse(event.data["metaBot"]) as MetaBot;
          const targetHero = object.mainScene.level?.children.find((x: any) => x.id == event.heroId) as Hero;
          const targetBot = targetHero?.metabots?.find(x => x.id === tmpMetabot.id);
          if (targetBot) {
            targetBot.isDeployed = true;
          }
          if (tmpHero.id != object.metaHero.id) {
            const addedBot = object.addBotToScene(tmpHero, targetBot);

            const warpBase = new WarpBase({ position: addedBot.position, parentId: addedBot?.id ?? 0, offsetX: -8 });
            object.mainScene.level?.addChild(warpBase); 
            setTimeout(() => {
              warpBase.destroy(); 
            }, 1300);
          }
        }
        if (event.eventType === "BOT_DESTROYED" && event.data) { 
          //console.log("data:", event.data);
          const bot = object.mainScene.level?.children.find((x: any) => x.heroId == event.heroId) as Bot;
          const winnerBotId = JSON.parse(event.data["winnerBotId"]) as number || undefined;
         // console.log("winnerBotId", winnerBotId);
          if (winnerBotId) {
            const winnerBot = object.mainScene.level.children.find((x: any) => x.id == winnerBotId) as Bot;
            if (winnerBot) {
              winnerBot.targeting = undefined;
              if (winnerBot.heroId === object.metaHero.id) {
                generateReward(winnerBot, bot);
              }
            } 
          }
        
          setTargetToDestroyed(bot); 
          if (bot) {  
            bot.hp = 0;
            bot.isDeployed = false;
            bot.targeting = undefined;
            bot.destroyBody();
            bot.destroy();
            setTimeout(() => {
              if (bot.heroId == object.metaHero.id) {
                const metaBot = object.metaHero.metabots.find((bot: MetaBot) => bot.name === bot.name);
                metaBot.hp = 0;
                metaBot.isDeployed = false; 
              }
            }, 50);
          } 
        }
        if (event.eventType === "CALL_BOT_BACK") {
          const bot = object.mainScene.level?.children.find((x: any) => x.heroId == event.heroId);
          if (bot) {
            bot.isWarping = true;
            bot.destroy();
          }
        } 
        if (event.eventType === "ITEM_DESTROYED") {
          if (event.data) {  
          //  console.log(event.data);
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
           // console.log("Item_Destroyed netwkr", dmgMod, skillName, tgtObject); 
            if (tgtObject) { tgtObject.destroy(); }
          }
        }
        if (event.eventType === "BUY_ITEM") { 
          if (event.heroId === object.metaHero.id) {
            //console.log(event && event.data ? event.data["item"] : "undefined item data");
            events.emit("BUY_ITEM_CONFIRMED", { heroId: event.heroId, item: (event.data ? event.data["item"] : "") })
            object.bonesService.deleteEvent(event.id);
          }
        }
        if (event.eventType === "ITEM_DROPPED") {
          if (event.data) {  
            const tmpMetabotPart = JSON.parse(event.data["item"]) as MetaBotPart;
            const location = JSON.parse(event.data["location"]) as Vector2;
            object.addItemToScene(tmpMetabotPart, location); 
          }
        }
        if (event.eventType === "ATTACK_BATCH" && event.data && event.data["attacks"]) {
          try {
            const attacks = JSON.parse(event.data["attacks"] as string) as any[];
            for (let atk of attacks) {
              // Skip animations for attacks originated from this client
              if (event.heroId === object.metaHero.id) continue;
              // Emit a local event so game code can animate the effect on targets
              events.emit("REMOTE_ATTACK", { attack: atk, sourceHeroId: event.heroId });
            }
          } catch (ex) {
            console.error("Failed to process ATTACK_BATCH event", ex);
          }
        }
        if (event.eventType === "OTHER_HERO_ATTACK") {
          try {
            // Emit a simple local event that UI/game objects can consume
            const payload = { sourceHeroId: event.heroId, data: event.data };
            events.emit("OTHER_HERO_ATTACK", payload);
          } catch (ex) {
            console.error('Failed to handle OTHER_HERO_ATTACK', ex);
          }
        }
        if (event.eventType === "CHAT" && event.data) {
          const content = event.data["content"] ?? '';
          const name = event.data["sender"] ?? "Anon";

          const eventTs = event.timestamp ? new Date(event.timestamp).getTime() : Date.now();
          const metachat = {
            hero: name,
            content: content,
            timestamp: event.timestamp ? new Date(event.timestamp) : new Date()
          } as MetaChat;

          // Duplicate suppression: only treat as duplicate if same hero + same content within 2s
          const isDuplicate = object.chat && object.chat.some((m: MetaChat) => {
            try {
              if (!m || !m.hero) return false;
              if (m.hero !== name) return false;
              if ((m.content ?? '') !== (content ?? '')) return false;
              const mts = m.timestamp ? new Date(m.timestamp).getTime() : 0;
              return Math.abs(mts - eventTs) < 2000;
            } catch { return false; }
          });
          if (!isDuplicate) {
            object.chat.unshift(metachat);
          }
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
