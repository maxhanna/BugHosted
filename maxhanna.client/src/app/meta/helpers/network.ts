import { events } from "./events";
import { Hero } from "../objects/Hero/hero";
import { MetaBot } from "../../../services/datacontracts/meta/meta-bot";
import { MetaEvent } from "../../../services/datacontracts/meta/meta-event";
import { MetaChat } from "../../../services/datacontracts/meta/meta-chat";
import { MetaBotPart, LEFT_ARM, RIGHT_ARM, LEGS, HEAD } from "../../../services/datacontracts/meta/meta-bot-part";
import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { Bot } from "../objects/Bot/bot";
import { GameObject } from "../objects/game-object";
import { Level } from "../objects/Level/level";
import { ShopMenu } from "../objects/Menu/shop-menu";
import { WardrobeMenu } from "../objects/Menu/wardrobe-menu";
import { Fight } from "../levels/fight";
import { gridCells } from "./grid-cells";
import { HEADBUTT, Skill } from "./skill-types";
import { InventoryItem } from "../objects/InventoryItem/inventory-item";
import { MetaHero } from "../../../services/datacontracts/meta/meta-hero";
import { Npc } from "../objects/Npc/npc";
import { BrushLevel1 } from "../levels/brush-level1";
import { storyFlags } from "./story-flags";
import { Character } from "../objects/character";


export class Network {
  constructor() {
  }
}

export let actionBlocker = false;

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
    object.otherHeroes = [];
    if (!object.hero?.id) {
      object.pollForChanges();
    }
    if (object.mainScene && object.mainScene.level) {
      object.metaHero.map = level.name ?? "HERO_ROOM";
      object.metaHero.position = level.getDefaultHeroPosition();
      object.mainScene.level.itemsFound = object.mainScene.inventory.getItemsFound();
    }
  });

  events.on("ALERT", object, async (message: string) => {
    object.parentRef?.showNotification(message);
  });

  events.on("WARDROBE_OPENED", object, () => {
    if (actionBlocker) return;
    object.blockOpenStartMenu = true;

    const invItems = object.mainScene.inventory.items;
    if (object.mainScene.level) {
      console.log(object.mainScene.level);
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
      object.blockOpenStartMenu = true;
      object.mainScene?.setLevel(new ShopMenu(params));
      object.stopPollingForUpdates = true;
      setActionBlocker(50);
    }
  });

  events.on("SHOP_OPENED_TO_SELL", object, (params: { heroPosition: Vector2, entranceLevel: Level, items?: InventoryItem[] }) => {
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
    object.mainScene.setLevel(new ShopMenu(config));
    object.stopPollingForUpdates = true;
  });
  events.on("WARDROBE_CLOSED", object, (params: { heroPosition: Vector2, entranceLevel: Level }) => {
    object.stopPollingForUpdates = false;
    object.blockOpenStartMenu = false;
    const newLevel = object.getLevelFromLevelName((params.entranceLevel.name ?? "HERO_ROOM"));
    console.log(newLevel, params.entranceLevel);
    newLevel.defaultHeroPosition = params.heroPosition;
    events.emit("CHANGE_LEVEL", newLevel);
    events.emit("SHOW_START_BUTTON");
  });
  events.on("SHOP_CLOSED", object, (params: { heroPosition: Vector2, entranceLevel: Level }) => {
    object.stopPollingForUpdates = false;
    object.blockOpenStartMenu = false;
    const newLevel = object.getLevelFromLevelName((params.entranceLevel.name ?? "HERO_ROOM"));
    newLevel.defaultHeroPosition = params.heroPosition;
    events.emit("CHANGE_LEVEL", newLevel);
    events.emit("SHOW_START_BUTTON");
  });
  events.on("SELECTED_PART", object, (params: { selectedPart: string, selection: string, selectedMetabotId: number }) => {
    const parts = object.mainScene.inventory.parts;
    const skill = params.selection.split(/\d/)[0];
    const dmg = params.selection.split(' ').slice(-2, -1)[0];
    let targetPart = undefined;
    for (let part of parts) {
      console.log("Checking part:", part); // Debugging: log the part being checked
      console.log("skill:", skill); // Debugging: log the skill
      console.log("part.skill.name:", part.skill.name); // Debugging: log part.skill.name
      console.log("dmg:", dmg); // Debugging: log dmg value
      console.log("part.damageMod:", part.damageMod); // Debugging: log part.damageMod
      console.log("params.selectedPart:", params.selectedPart); // Debugging: log params.selectedPart
      console.log("part.partName:", part.partName); // Debugging: log part.partName

      if (part.skill.name.trim() === skill.trim() && part.damageMod === parseInt(dmg) && part.partName.trim() === params.selectedPart.trim()) {
        targetPart = part;
        console.log("FOUND !");
        break;
      }
    }
    let oldPart = undefined;
    const metabotSelected = object.metaHero.metabots.find((b: MetaBot) => b.id === params.selectedMetabotId);

    console.log("Selected a bot part : ", params, skill, dmg, parts, targetPart);
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
          object.metaService.unequipPart(invPart.id);
          invPart.metabotId = undefined;
        }
      }
      object.metaService.equipPart(targetPart.id, targetPart.metabotId);
    }
  });


  events.on("DEPLOY", object, async (params: { bot: MetaBot, metaHero?: MetaHero }) => {
    const hero = params.metaHero ?? object.metaHero;
    if (params.bot.id) {
      object.addBotToScene(hero, params.bot);
      if (object.metaHero.id === hero.id) {
        const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "DEPLOY", object.metaHero.map, { "metaHero": `${JSON.stringify(hero)}`, "metaBot": `${JSON.stringify(params.bot)}` });
        object.metaService.updateEvents(metaEvent);
      }
     // await object.reinitializeInventoryData();
    }
  });

  events.on("CALL_BOT_BACK", object, async (params: { bot: MetaBot }) => {
    if (params.bot?.id) {
      if (params.bot.heroId === object.metaHero.id) {
        const metaEvent = new MetaEvent(0, params.bot.heroId, new Date(), "CALL_BOT_BACK", object.metaHero.map);
        object.metaService.updateEvents(metaEvent).then(async (x: any) => {
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
        tgt.isDeployed = false;
        tgt.destroy();
      }
      const tgtHeroBot = object.metaHero.metabots.find((x: any) => x.id === params.bot.id);
      if (tgtHeroBot) {
        tgtHeroBot.isDeployed = false;
      }
    }
  });

  events.on("BOT_DESTROYED", object, (bot: Bot) => {
    if (bot?.id) { 
      const tgt = object.mainScene?.level?.children?.find((x: any) => x.id === bot.id);

      if (tgt) { 
        tgt.hp = 0;
        tgt.isDeployed = false;
      }
    }
  });

  events.on("CHARACTER_CREATED", object, (name: string) => {
    if (object.chatInput.nativeElement.placeholder === "Enter your name" && object.parentRef && object.parentRef.user) {
      object.metaService.createHero(object.parentRef.user, name);
    }
  });

  events.on("SEND_CHAT_MESSAGE", object, (chat: string) => {
    const msg = chat.trim();
    if (object.parentRef?.user) {
      if (object.chatInput.nativeElement.placeholder !== "Enter your name") {
        const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "CHAT", object.metaHero.map, { "sender": object.metaHero.name ?? "Anon", "content": msg })
        object.metaService.updateEvents(metaEvent);
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
    const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "CHAT", object.metaHero.map, { "sender": object.metaHero.name ?? "Anon", "content": msg })
    object.metaService.updateEvents(metaEvent);
  });

  events.on("WHISPER_AT", object, ( objectAtPosition: GameObject ) => {
    if (!objectAtPosition) return; 
    const msgContent = object.getChatText();
    const receiver = (objectAtPosition as Hero).name ?? "Anon";
    const sender = (object.metaHero as Hero).name ?? "Anon";
    const msg = `🤫 (${sender}:${receiver}) : ${msgContent}`;
    const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "WHISPER", object.metaHero.map, { "sender": sender, "receiver": receiver, "content": msg })
    object.metaService.updateEvents(metaEvent);

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
    object.metaService.updateEvents(metaEvent); 
    setActionBlocker(50);
  });

  events.on("ITEM_PURCHASED", object, (item: InventoryItem) => { 
    const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "BUY_ITEM", object.metaHero.map, { "item": safeStringify(item) });
    object.metaService.updateEvents(metaEvent);
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
      object.metaService.createBot(newBot).then((res: MetaBot) => {
        if (res) {
          object.metaHero.metabots.push(res);
        }
      });
    }
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

    object.metaService.sellBotParts(object.metaHero.id, partIdNumbers);
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
      object.metaService.updateEvents(metaEvent);
    }
  });

  events.on("TARGET_UNLOCKED", object, (params: { source: Bot, target: Bot }) => {
    if (params.source.heroId) { 
      const metaEvent = new MetaEvent(1, params.source.heroId, new Date(), "TARGET_UNLOCKED", object.metaHero.map, { "sourceId": params.source.id + "", "targetId": params.target.id + "" });
      object.metaService.updateEvents(metaEvent);
    }
  });

  events.on("START_FIGHT", object, (source: Npc) => { 
    const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "START_FIGHT", object.metaHero.map, { "party_members": `${JSON.stringify(object.partyMembers)}`, "source": `${source.type}` })
    object.metaService.updateEvents(metaEvent);
    const itemsFound = object.mainScene.inventory.getItemsFound();
    events.emit("CHANGE_LEVEL",
      new Fight({
        metaHero: object.metaHero,
        parts: object.mainScene.inventory.parts.filter((x: any) => x.metabotId),
        entryLevel: (object.metaHero.map == "FIGHT" ? new BrushLevel1({ itemsFound: itemsFound }) : object.getLevelFromLevelName(object.metaHero.map)),
        enemies: [source],
        party: object.partyMembers.length > 1 ? object.partyMembers : [object.metaHero],
        itemsFound: itemsFound
      })
    );
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
    } else {
      const exits = object.mainScene.level.children.filter((x: GameObject) => x.name == "exitObject"); 
      events.emit("OPEN_START_MENU", ({ exits: exits, location: object.mainScene.metaHero.position }));
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

  events.on("USER_ATTACK_SELECTED", object, (skill: Skill) => {
    const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "USER_ATTACK_SELECTED", object.metaHero.map, { "skill": JSON.stringify(skill) })
    object.metaService.updateEvents(metaEvent);
  });

  events.on("GOT_REWARDS", object, (params: { location: Vector2, part: MetaBotPart }) => {
    if (!params.part) return;
    const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "ITEM_DROPPED", object.metaHero.map, { "location": safeStringify(params.location), "item": safeStringify(params.part) })
    object.metaService.updateEvents(metaEvent);    
  });

  events.on("PARTY_UP", object, (person: Hero) => {
    const foundInParty = object.partyMembers.find((x: MetaHero) => x.id === object.metaHero.id);
    if (!foundInParty) {
      object.partyMembers.push(object.metaHero);
    }
    const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "PARTY_UP", object.metaHero.map, { "hero_id": `${person.id}`, "party_members": `${JSON.stringify(object.partyMembers)}` })
    object.metaService.updateEvents(metaEvent);
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
      console.log(data);
      if (data.category && data.stats) {
        object.metaService.updateInventory(object.metaHero, data.name, data.imageName, data.category);
      } else if (data.item) {
        console.log("updating bot parts", data.item);
        object.metaService.updateBotParts(object.metaHero, [data.item]); 
        object.mainScene.inventory.parts.concat(data.item);
        console.log(object.mainScene.inventory.parts);
      }
      setActionBlocker(500);
    } 
  });

  events.on("CREATE_ENEMY", object, (params: { bot: Bot, owner?: Character }) => { 

    const botData = {
      Id: params.bot.id,
      Type: params.bot.botType,
      Name: params.bot.name,
      Level: params.bot.level,
      Exp: params.bot.exp,
      Hp: params.bot.hp,
      IsDeployed: true,
      IsEnemy: true,
      HeroId: params.bot.heroId || 39758
    };
    const ownerData = params.owner ? { id: params.owner.id, name: params.owner.name } : null;

    const metaEvent = new MetaEvent(0, object.metaHero.id, new Date(), "CREATE_ENEMY", object.metaHero.map, {
      "bot": JSON.stringify(botData),
      "owner": JSON.stringify(ownerData)
    });
    object.metaService.updateEvents(metaEvent);
  });

  events.on("CHANGE_COLOR", object, () => {
    if (object.parentRef) {
      setTimeout(() => {
        events.emit("HERO_MOVEMENT_LOCK");
      }, 50);
      object.colorInput.nativeElement.style.display = "block";
      object.parentRef.openModal();
      setTimeout(() => {
        if (object.parentRef) {
          object.parentRef.isModal = true;
          object.parentRef.isModalCloseVisible = false;
          object.parentRef.modalComponent.setModalFont("fontRetroGaming");
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
            object.addBotToScene(tmpHero, targetBot);
          }
        }
        if (event.eventType === "BOT_DESTROYED") {
          const bot = object.mainScene.level?.children.find((x: any) => x.heroId == event.heroId) as Bot;  
          if (bot) { 
            bot.hp = 0;
            bot.isDeployed = false;
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
            bot.destroy();
          }
        }
        if (event.eventType === "START_FIGHT" && event.heroId != object.metaHero.id && !storyFlags.flags.has("START_FIGHT")) {
          actionStartFightEvent(object, event);
        }
        if (event.eventType === "USER_ATTACK_SELECTED") {
          const player = object.partyMembers.find((x: Character) => x.id === event.heroId);
          if (player || event.heroId === object.metaHero.id) {
            events.emit("SKILL_USED", { heroId: event.heroId, skill: (event.data ? JSON.parse(event.data["skill"]) as Skill : HEADBUTT) })
          }
        }
        if (event.eventType === "BUY_ITEM") {
          const player = object.partyMembers.find((x: Character) => x.id === event.heroId);
          if (player || event.heroId === object.metaHero.id) {
            console.log(event && event.data ? event.data["item"] : "undefined item data");
            events.emit("BUY_ITEM_CONFIRMED", { heroId: event.heroId, item: (event.data ? event.data["item"] : "") })
            object.metaService.deleteEvent(event.id);
          }
        }
        if (event.eventType === "ITEM_DROPPED") {
          if (event.data) {  
            const tmpMetabotPart = JSON.parse(event.data["item"]) as MetaBotPart;
            const location = JSON.parse(event.data["location"]) as Vector2;
            object.addItemToScene(tmpMetabotPart, location);

            console.log(tmpMetabotPart); 
          }
        }
        if (event.eventType === "CHAT" && event.data) {
          let breakOut = false;
          const content = event.data["content"] ?? '';
          const name = event.data["sender"] ?? "Anon";
          if (!content.includes("👋") && event.heroId === object.metaHero.id) {
            breakOut = true;
          };
          if (!breakOut) {
            object.chat.unshift(
              {
                hero: name,
                content: content,
                timestamp: new Date()
              } as MetaChat);
            object.setHeroLatestMessage(object.otherHeroes.find((x: Character) => x.name === name));
          }
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
            object.chat.unshift({
              hero: senderName,
              content: content,
              timestamp: new Date()
            } as MetaChat);
            if (senderName === object.metaHero.name || receiverName == object.metaHero.name) {
              object.setHeroLatestMessage(object.otherHeroes.find((x: Character) => x.name === senderName));
            }
          }
        }
      }
    }
  }
  object.events = metaEvents;
}

export function actionStartFightEvent(object: any, event: MetaEvent) {
  if (event.data) {
    const partyMembersData = JSON.parse(event.data["party_members"]);
    if (partyMembersData) {
      let isMyParty = false;
      for (let member of partyMembersData) {
        const parsedMember = new MetaHero(
          member.id,
          member.name,
          member.position,
          member.speed,
          member.map,
          member.metabots
        );
        if (object.partyMembers.find((x: Character) => x.id === parsedMember.id)) {
          isMyParty = true;
          break;
        }
      }
      if (isMyParty) {
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
export function actionPartyInviteAcceptedEvent(object: any, event: MetaEvent) {
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
        if (!party.find(x => x.id === parsedMember.id)) {
          party.push(parsedMember);
          if (parsedMember.id === object.metaHero.id) {
            isMyParty = true;
          }
        }
      }
      if (isMyParty) {
        object.partyMembers = party;
        events.emit("PARTY_INVITE_ACCEPTED", { playerId: object.metaHero.id, party: object.partyMembers });
      }
    }
  }
}

export function actionPartyUpEvent(object: any, event: MetaEvent) {
  if (event.data) {
    const otherPlayer = object.otherHeroes.find((hero: Character) => hero.id === event.heroId);
    if (otherPlayer) {
      object.isDecidingOnParty = true;
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
          object.partyMembers.push(parsedMember);
        }
        const inviterId = parseInt(event.data["hero_id"]);
        if (!object.partyMembers.find((x: Character) => event.data && x.id === inviterId)) {
          const member = object.otherHeroes.find((x: Character) => x.id === inviterId);
          if (member) {
            object.partyMembers.push(member);
          }
        }
        const partyUpAcceptedEvent = new MetaEvent(0, object.metaHero.id, new Date(), "PARTY_INVITE_ACCEPTED", object.metaHero.map, { "party_members": JSON.stringify(object.partyMembers) });
        object.metaService.updateEvents(partyUpAcceptedEvent);
        events.emit("PARTY_INVITE_ACCEPTED", { playerId: object.metaHero.id, party: object.partyMembers });
        object.isDecidingOnParty = false;
      } else {
        object.isDecidingOnParty = false;
      }
    }
  }
}
