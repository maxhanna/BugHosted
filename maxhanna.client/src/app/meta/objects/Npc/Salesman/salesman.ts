import { Vector2 } from "../../../../../services/datacontracts/meta/vector2"; 
import { Sprite } from "../../sprite"; 
import { DOWN } from "../../../helpers/grid-cells";
import { Animations } from "../../../helpers/animations";
import { resources } from "../../../helpers/resources";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";
import { events } from "../../../helpers/events";
import { WALK_LEFT, WALK_RIGHT, STAND_DOWN, STAND_RIGHT, STAND_LEFT } from "./salesman-animations";
import { Npc } from "../npc";
import { ShopMenu } from "../../Menu/shop-menu";
import { Level } from "../../Level/level";
import { GOT_FIRST_METABOT, GOT_WATCH, Scenario, TALKED_TO_BRUSH_SHOP_OWNER1, storyFlags } from "../../../helpers/story-flags";
import { InventoryItem } from "../../InventoryItem/inventory-item";

export class Salesman extends Npc {
  directionIndex = 0;
  heroPosition: Vector2;
  entranceLevel: Level;
  items?: InventoryItem[];
  npcDialogues = {
    SHOP_OPENED: [
      "Ah, back again, eh? Got that look in your eye like you need something special. Take a gander!",
      "Welcome back, kid! Your mom was just in here yesterday—said you keep breaking those MetaBots. Maybe buy some armor this time?",
      "Need something to help in the scrap yard? Got fresh stock today—handpicked, best in town!",
      "Ah, a fine choice coming to me! Some of these parts ain't cheap, but neither is fixing a busted bot, eh?",
      "Take your time, but don’t go touching everything like last time. Had to chase some rust mites outta here!",
      "You break it, you buy it. Just kidding… mostly.",
      "New parts, new deals! Don’t let ‘em rust up now.",
      "Gotta keep that bot running, eh? Let’s get you sorted.",
      "Hurry up, kid. Deals like these don’t last forever.",
      "Something catch your eye? Or just here to window shop?",
      "Fresh out of junk, but I got quality. Take a look.",
      "If it ain’t you! Here to buy, or just to chat?",
      "MetaBots don’t fix themselves, y’know. What do ya need?",
      "Running low on parts? Lucky for you, I stocked up.",
      "Shop’s open, credits are welcome, let’s do business.",
      "Looking sharp today! Too bad your bots aren’t…",
      "Credit’s good here. So’s bartering. So’s begging, if you’re desperate.",
      "New shipment just in! Well, ‘new’ is a strong word…",
      "If it ain’t my favorite reckless tinkerer!",
      "Buy somethin’ or get out. Just kiddin’… mostly."
    ], 
    REPAIR_ALL_METABOTS: [
      "Alright, let’s get these beauties back in shape. I’ve seen worse... but not much worse.",
      "Your MetaBots are patched up! Try not to bring ‘em back in pieces again, yeah?",
      "Fixed ‘em up real nice! That’ll keep ‘em running—unless you go pickin’ fights you can’t win again.",
      "Phew! That was a mess. You sure these bots weren’t in a demolition derby?",
      "All patched up! You know, your dad used to wreck his bots all the time too. Runs in the family, eh?",
      "That should hold… for now.",
      "These bots are barely holding together. Try dodging next time.",
      "Done! Maybe take ‘em for a test spin before wrecking ‘em again?",
      "Repaired and ready! No refunds if you break ‘em immediately.",
      "Looks like they got stomped on. Try not to make a habit of it.",
      "That was a rough job. Try letting ‘em rest once in a while!",
      "Good as new! Or at least… good enough.",
      "Hope you got deep pockets—these repairs add up!",
      "Try a little strategy next time, huh?",
      "I should charge extra for bots this banged up!", 
      "Good as new! Or at least, good as used.",
      "Repairs done! Try not to test their limits *too* much.",
      "There ya go! Now don’t make me regret this.",
      "Fixed! Next time, maybe dodge a hit or two?",
      "They’ll live… for now."
    ],
    CANCEL: [
      "Ah, leaving so soon? Thought you were gonna buy somethin’ this time.",
      "Come back when you’ve got some credits to spend, eh?",
      "A wise decision… or maybe not. Either way, I’ll be here!",
      "Alright, alright, off you go. Try not to break anything important!",
      "Well, don’t be a stranger now! Your mom’ll have words for me if I don’t treat you right.",
      "Changed your mind? Happens more than you’d think.",
      "Come back when your MetaBot’s limping.",
      "No worries, kid. The shop’s not going anywhere.",
      "Next time, maybe bring some credits.",
      "Hah, cold feet? Or just planning your next move?",
      "Fine, fine. Go on, but you’ll be back.",
      "Regret that choice yet?",
      "No deal? No problem. I’ll be here.",
      "Came to chat, did ya? That’ll cost ya extra.",
      "Alright, but don’t get scrapped out there!", 
      "Suit yourself. My parts aren’t goin’ anywhere.",
      "Leavin’ empty-handed? Bold move.",
      "Fine, fine. Go on then.",
      "Your loss! Or maybe mine. Who knows?",
      "Come back when you’re serious… or desperate."
    ]
  };
  constructor(params: { position: Vector2, heroPosition: Vector2, entranceLevel: Level, items?: InventoryItem[], skin?: string, preventDraw?: boolean }) {
    super({
      id: Math.floor(Math.random() * (-9999 + 1000)) - 1000,
      position: params.position,
      type: params.skin ?? "salesPerson",
      preventDraw: params.preventDraw, 
      body: params.preventDraw ? undefined : new Sprite({
        objectId: Math.floor(Math.random() * (-9999 + 1000)) - 1000,
        resource: resources.images[params.skin ?? "salesPerson"],
        position: new Vector2(0, 0),
        frameSize: new Vector2(32, 32),
        hFrames: 4,
        vFrames: 4,
        preventDraw: params.preventDraw,
        animations: new Animations(
          { 
            walkLeft: new FrameIndexPattern(WALK_LEFT),
            walkRight: new FrameIndexPattern(WALK_RIGHT),
            standDown: new FrameIndexPattern(STAND_DOWN),
            standRight: new FrameIndexPattern(STAND_RIGHT),
            standLeft: new FrameIndexPattern(STAND_LEFT), 
          })
      })
    }) 
    this.name = "Sales Person"; 
    this.textPortraitFrame = 3;
    this.entranceLevel = params.entranceLevel;
    this.heroPosition = params.heroPosition; 
    this.items = params.items;
    this.isSolid = !params.preventDraw;


    if (!this.preventDraw) { 
      const shadow = new Sprite({
        resource: resources.images["shadow"],
        preventDraw: params.preventDraw,
        position: new Vector2(0, 0),
        offsetX: -10, 
        scale: new Vector2(1.25, 1),
        frameSize: new Vector2(32, 32),
      });
      this.addChild(shadow); 
    }
  }

  override ready() {
    //fix the content to allow for shop
    if (this.textContent) {
      this.textContent = this.textContent.concat({
        string: storyFlags.contains(GOT_WATCH) ? ["Shop", "Repair", "Sell", "Cancel"] : ["Cancel"],
        canSelectItems: true,
        addsFlag: undefined, 
      } as Scenario);
    } else {
      this.textContent = [{ 
        string: ["Shop", "Repair", "Sell", "Cancel"],
        canSelectItems: true,
        addsFlag: undefined
      } as Scenario]
    }
    //add animation/functionality for hero talking to salesman
    events.on("HERO_REQUESTS_ACTION", this, (params: { hero: any, objectAtPosition: any }) => {
      if (params.objectAtPosition.id === this.id) {
        console.log("hero requested action");
        const oldKey = this.body?.animations?.activeKey;
        const oldFacingDirection = this.facingDirection;
        this.body?.animations?.play("standDown");
        this.facingDirection = DOWN;
        this.getRandomDialogue("SHOP_OPENED");
        setTimeout(() => {
          if (oldKey) {
            this.body?.animations?.play(oldKey);
          }
          this.facingDirection = oldFacingDirection;
        }, 20000);
      }
    });
    events.on("SELECTED_ITEM", this, (selectedItem: string) => {
      console.log(selectedItem);
      if (selectedItem === "Shop") {
        events.emit("SHOP_OPENED", { heroPosition: this.heroPosition, entranceLevel: this.entranceLevel, items: this.items });
      }
      if (selectedItem === "Sell") {
        events.emit("SHOP_OPENED_TO_SELL", { heroPosition: this.heroPosition, entranceLevel: this.entranceLevel, items: this.items }); 
      }
      if (selectedItem === "Repair") {
        events.emit("REPAIR_ALL_METABOTS");
        this.getRandomDialogue("REPAIR_ALL_METABOTS");  
      }
      if (selectedItem === "Cancel") {
        this.getRandomDialogue("CANCEL");
      }
    }); 
  }
  getRandomDialogue(type: keyof typeof this.npcDialogues) {
    const lines = this.npcDialogues[type];
    this.latestMessage = lines[Math.floor(Math.random() * lines.length)]; 
    setTimeout(() => {
      this.latestMessage = "";
    }, 5000);
  }
}
