import { Vector2 } from "../../../services/datacontracts/bones/vector2";
import { gridCells } from "../helpers/grid-cells";
import { events } from "../helpers/events";
import { Input } from "../helpers/input";
import { storyFlags, CHARACTER_CREATE_STORY_TEXT_4, CHARACTER_CREATE_STORY_TEXT_6, CHARACTER_CREATE_STORY_TEXT_7, CHARACTER_CREATE_STORY_TEXT_1 } from "../helpers/story-flags";
import { Level } from "../objects/Level/level"; 
import { HeroRoomLevel } from "./hero-room";
import { SpriteTextStringWithBackdrop } from "../objects/SpriteTextString/sprite-text-string-with-backdrop";
import { SpriteTextString } from "../objects/SpriteTextString/sprite-text-string";
import { resources } from "../helpers/resources";
import { Sprite } from "../objects/sprite";
import { actionBlocker, setActionBlocker } from "../helpers/network";

export class CharacterCreate extends Level { 
  // Condensed profanity list: base stems rather than exhaustive variants.
  // verifyCharacterName uses substring matching, so stems like 'cyberfuck' will match 'cyberfucker' or 'cyberfucked'.
  profanity = [
    'fuck', 'shit', 'ass', 'arse', 'bitch', 'cunt', 'dick', 'cock', 'cum', 'piss', 'porn', 'whore', 'slut',
    'nigg', 'fag', 'motherfuck', 'cyberfuck', 'masturbat', 'anal', 'blowjob', 'orgasm', 'tit', 'vagina',
    'wank', 'penis', 'testicle', 'retard', 'shemale', 'gay', 'horny'
  ];
  override defaultHeroPosition = new Vector2(gridCells(1), gridCells(1));
  defaultColor: string | undefined = undefined;
  heroNames: string[] | undefined = undefined;
  instructionString?: SpriteTextString | undefined;
  textBox = new SpriteTextStringWithBackdrop({});
  inputKeyPressedDate = new Date();
  characterNameEmitted = false;
  changeLevelEmitted = false;
  characterName = "";
  defaultName: string | undefined = undefined; 
  magiSprite?: Sprite;
  knightSprite?: Sprite; 
  rogueSprite?: Sprite;
  selectionIndex: number = 0; // selection index: 0 = magi, 1 = knight
  constructor(params: { 
    heroPosition?: Vector2, 
    defaultName?: string, 
    defaultColor?: string, 
    championName?: string, 
    championScore?: number,
    heroNames?: string[] 
  } = {}) {
    super();
    console.log("new char create");
    this.name = "CharacterCreate";
    if (params.heroPosition) {
      this.defaultHeroPosition = params.heroPosition;
    }  
    this.heroNames = params.heroNames; 
    if (params.defaultName) {
      const dn = params.defaultName.trim();
      if (dn.length > 0) {
        this.defaultName = dn;
        this.characterName = dn;
      }
    }
    if (params.defaultColor) {
      const dc = params.defaultColor.trim();
      if (dc.length > 0) {
        this.defaultColor = dc;
      }
    }
    this.addBackgroundLayer(resources.images["charcreatebg"], /*parallax=*/0, new Vector2(0, 0), /*repeat=*/false, /*scale=*/1, /*direction=*/'LEFT');
    
    // Create selectable hero sprites and keep references so we can swap skins
    this.magiSprite = new Sprite({
      objectId: 0,
      resource: resources.images["heroSelectMagi"],
      name: "Magi",
      frameSize: new Vector2(320, 220),
    });
    this.addChild(this.magiSprite);

    this.knightSprite = new Sprite({
      objectId: 0,
      resource: resources.images["heroSelectKnight"],
      name: "Knight",
      frameSize: new Vector2(320, 220),
    });
    this.addChild(this.knightSprite);
 
    this.rogueSprite = new Sprite({
      objectId: 0,
      resource: resources.images["heroSelectRogue"],
      name: "Rogue",
      frameSize: new Vector2(320, 220),
    });
    this.addChild(this.rogueSprite);

    // selection: 0 = magi, 1 = knight, 2 == rogue
    this.selectionIndex = 0;
    this.applySelectionSkins();
  
    this.hideChatInput();

    this.instructionString = new SpriteTextString(
      `Press the Arrow ${!this.onMobile() ? 'keys' : ''} And A Button to Select.`,
       new Vector2(10, 10),
       "White",
    );
    this.addChild(this.instructionString);

    this.walls = new Set<string>();
  }

  override ready() {
  // Ensure chat input is hidden when the level becomes ready
  this.hideChatInput();
    events.on("SEND_CHAT_MESSAGE", this, (chat: string) => {
      // Prefer the explicit chat value; if empty, fall back to the persisted default name if present
      const trimmedChat = chat ? chat.trim() : "";
      let nameToUse = "";
      if (trimmedChat.length > 0) {
        nameToUse = trimmedChat;
      } else if (this.defaultName && this.defaultName.trim().length > 0) {
        nameToUse = this.defaultName.trim();
      } else {
        nameToUse = trimmedChat; // may be empty
      }
      this.characterName = nameToUse;
      if (!this.verifyCharacterName(this.characterName)) { return; } 
      this.returnChatInputToNormal();
      
      console.log("emitting char name");
      if (!this.characterNameEmitted) {
        // Emit a structured payload so listeners know which hero type was selected
        const selectedType = this.selectionIndex === 0 ? 'magi' : this.selectionIndex === 1 ? 'knight' : 'rogue';
        events.emit("CHARACTER_NAME_CREATED", { name: this.characterName, type: selectedType });
        this.characterNameEmitted = true;
        storyFlags.add(CHARACTER_CREATE_STORY_TEXT_1);
        const resourceKey = `heroSelect${selectedType.charAt(0).toUpperCase() + selectedType.slice(1)}Pick`;
        const pickSprite = new Sprite({ 
          objectId: 0,
          resource: resources.images[resourceKey],
          frameSize: new Vector2(320, 220) 
        }); 
        this.addChild(pickSprite);
      }
    });
    events.on("SPACEBAR_PRESSED", this, () => { 
      const currentTime = new Date();
      if (storyFlags.contains(CHARACTER_CREATE_STORY_TEXT_1)) {
        this.instructionString?.destroy();
        setTimeout(() => {
          // pick a random spawn within a 10x10 grid centered area
          const randX = Math.floor(Math.random() * 10) + 2; // 2..11
          const randY = Math.floor(Math.random() * 10) + 2;
          console.log("changing level to hero room");
          events.emit("CHANGE_LEVEL", new HeroRoomLevel({
            heroPosition: new Vector2(gridCells(randX), gridCells(randY))
          }));
          this.destroy();
        }, 100);
        return;
      }
      else if (currentTime.getTime() - this.inputKeyPressedDate.getTime() > 1000) {
        this.instructionString?.destroy();
        this.inputKeyPressedDate = new Date(); 
        this.instructionString = new SpriteTextString(  
          `Enter your name in the chat input, then press ${!this.onMobile() ? 'Enter or ' : ''}the A Button to confirm`, new Vector2(10, 10)
        );
        this.addChild(this.instructionString);
        this.createNameChatInput(); 
      }
    })
  }
  override destroy() {
  // Ensure chat input is restored when leaving this level
  this.returnChatInputToNormal();
  this.textBox.destroy(); 
  events.unsubscribe(this);
  super.destroy();
  }

  // Capture keyboard input from parent Main.input each frame so this level can react to arrow presses.
  // For now we simply log when arrows are pressed to demonstrate capability.
  override step(delta: number, root: any) {
    try { 
      const input = (root as any).input as Input | undefined;
      if (!input) return;
      // Use getActionJustPressed for instantaneous presses and heldDirections for continuous holds
      if (input.getActionJustPressed('ArrowUp') || input.heldDirections.includes('UP')) {
        console.log('CharacterCreate: ArrowUp pressed/held');
      }
      if (input.getActionJustPressed('ArrowDown') || input.heldDirections.includes('DOWN')) {
        console.log('CharacterCreate: ArrowDown pressed/held');
      } 
      // Toggle selection when left/right just pressed (throttle rapid switching)
      if (input.getActionJustPressed('ArrowLeft') || input.heldDirections.includes('LEFT')) {
        if (!actionBlocker) {
          console.log('CharacterCreate: ArrowLeft pressed/held', this.selectionIndex );
          // move selection left
          this.selectionIndex = Math.max(0, this.selectionIndex - 1);
          this.applySelectionSkins();
          console.log('CharacterCreate: selectionIndex', this.selectionIndex);
          // prevent another immediate selection change
          setActionBlocker(300);
        }
      }
      if (input.getActionJustPressed('ArrowRight') || input.heldDirections.includes('RIGHT')) {
        if (!actionBlocker) {
          console.log('CharacterCreate: ArrowRight pressed/held', this.selectionIndex );
          this.selectionIndex = Math.min(2, this.selectionIndex + 1);
          this.applySelectionSkins();
          console.log('CharacterCreate: selectionIndex', this.selectionIndex);
          // prevent another immediate selection change
          setActionBlocker(300);
        }
      }
    } catch (ex) {
      // swallow errors to avoid breaking the level loop
      try { console.warn('CharacterCreate.step input check failed', ex); } catch { }
    }
  }
 
  applySelectionSkins() {
    try {
      // Helper to replace a sprite with a new resource while preserving basic properties
      const replaceSprite = (oldSprite: Sprite | undefined, resourceKey: string, name: string) => {
        if (oldSprite) {
          const pos = oldSprite.position?.duplicate ? oldSprite.position.duplicate() : new Vector2(0, 0);
          try { oldSprite.destroy(); } catch { }
          const s = new Sprite({ objectId: 0, resource: resources.images[resourceKey], name: name, frameSize: new Vector2(320, 220) });
          s.position = pos;
          this.addChild(s);
          return s;
        }
        return undefined;
      };

      if (this.selectionIndex === 0) { // magi selected 
        this.knightSprite = replaceSprite(this.knightSprite, "heroSelectKnight", "Knight");
        this.rogueSprite = replaceSprite(this.rogueSprite, "heroSelectRogue", "Rogue");
        this.magiSprite = replaceSprite(this.magiSprite, "heroSelectMagi2", "Magi");
      } else if (this.selectionIndex === 1)  { // knight selected 
        this.magiSprite = replaceSprite(this.magiSprite, "heroSelectMagi", "Magi");
        this.rogueSprite = replaceSprite(this.rogueSprite, "heroSelectRogue", "Rogue");
        this.knightSprite = replaceSprite(this.knightSprite, "heroSelectKnight2", "Knight");
      } else if (this.selectionIndex === 2)  { // rogue selected
        this.magiSprite = replaceSprite(this.magiSprite, "heroSelectMagi", "Magi");
        this.knightSprite = replaceSprite(this.knightSprite, "heroSelectKnight", "Knight");
        this.rogueSprite = replaceSprite(this.rogueSprite, "heroSelectRogue2", "Rogue");
      }
    } catch (ex) {
      try { console.warn('applySelectionSkins failed', ex); } catch { }
    }
  } 

  private returnChatInputToNormal() {
    setTimeout(() => {
      const chatInput = this.parent.input.chatInput;
      if (chatInput) {
        chatInput.value = "";
        chatInput.placeholder = "Chat";
        // restore layout and make sure the input is visible again
        chatInput.style.setProperty('position', 'unset', 'important');
        chatInput.style.setProperty('top', 'unset', 'important');
        chatInput.style.setProperty('display', 'block', 'important');
        this.parent.input.chatInput.blur();
      }
    }, 0);
  }
  private hideChatInput() {
    const chatInput = this.parent?.input?.chatInput;
    if (chatInput) {
      chatInput.value = "";
      // Only force-hide the chat input (display: none) if the
      // CHARACTER_CREATE_STORY_TEXT_4 flag has NOT yet been earned.
      if (!storyFlags.contains(CHARACTER_CREATE_STORY_TEXT_4)) {
        chatInput.style.setProperty('display', 'none', 'important');
      } else {
        // If the flag is already present, ensure the input is visible.
        chatInput.style.setProperty('display', 'block', 'important');
      }
      // keep the input unfocused while hidden
      chatInput.blur();
    }
  }

  private createNameChatInput() {
    if (!this.parent?.input?.chatInput) return;

    const chatInput = this.parent.input.chatInput; 
    setTimeout(() => {
      if (chatInput) {
        document.getElementsByClassName("chatArea")[0].setAttribute("style", "display: block !important;");
        chatInput.placeholder = "Enter your name";
        if (this.defaultName && (!chatInput.value || chatInput.value.trim().length === 0)) {
          chatInput.value = this.defaultName.trim();
        }
        chatInput.style.position = "absolute";
        chatInput.style.top = "50%";
        chatInput.style.setProperty('display', 'block', 'important'); 
        chatInput.focus();
      }
    }, 100);
  }
  private onMobile() {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }
  private verifyCharacterName(name: string) {
    let outcome = undefined;
    const n = name.toLowerCase().trim(); 
    if (!name || !n) {
      outcome = "Enter a valid name.";
    }
    else if (this.profanity.some(bw => n.includes(bw))) {
      outcome = "No bad words allowed.";
    } 
    else if (name.length > 12) {
      outcome = "Name must be under 12 characters long.";
    }
    else if (this.heroNames?.includes(name)) {
      outcome = "Name already taken, please choose another.";
    }

    if (outcome) {
      alert(outcome);
      return false;
    }
    return true;
  }
}
