import { Vector2 } from "../../../services/datacontracts/bones/vector2";
import { gridCells } from "../helpers/grid-cells";
import { events } from "../helpers/events";
import { Input } from "../helpers/input";
import { storyFlags, Scenario, CHARACTER_CREATE_STORY_TEXT_2, CHARACTER_CREATE_STORY_TEXT_4, CHARACTER_CREATE_STORY_TEXT_5, CHARACTER_CREATE_STORY_TEXT_6, CHARACTER_CREATE_STORY_TEXT_7 } from "../helpers/story-flags";
import { Level } from "../objects/Level/level"; 
import { HeroRoomLevel } from "./hero-room";
import { SpriteTextStringWithBackdrop } from "../objects/SpriteTextString/sprite-text-string-with-backdrop";
import { SpriteTextString } from "../objects/SpriteTextString/sprite-text-string";
import { Bones } from "../objects/Npc/Bones/bones";
import { resources } from "../helpers/resources";
import { Sprite } from "../objects/sprite";

export class CharacterCreate extends Level { 
  textBox = new SpriteTextStringWithBackdrop({});
  inputKeyPressedDate = new Date();
  characterNameEmitted = false;
  changeLevelEmitted = false;
  characterName = "";
  // Optional default name provided from persisted user settings
  defaultName: string | undefined = undefined;
  bones = new Bones({ position: new Vector2(120, 95) });
  // selectable hero sprites
  magiSprite?: Sprite;
  knightSprite?: Sprite;
  // selection index: 0 = magi, 1 = knight
  selectionIndex: number = 0;
  profanity = ["4r5e", "5h1t", "5hit", "a55", "anal", "anus", "ar5e", "arrse", "arse", "ass", "ass-fucker", "asses",
    "assfucker", "assfukka", "asshole", "assholes", "asswhole", "a_s_s", "b!tch", "b00bs", "b17ch", "b1tch", "ballbag", "balls",
    "ballsack", "bastard", "beastial", "beastiality", "bellend", "bestial", "bestiality", "bi+ch", "biatch", "bitch", "bitcher",
    "bitchers", "bitches", "bitchin", "bitching", "bloody", "blow job", "blowjob", "blowjobs", "boiolas", "bollock", "bollok",
    "boner", "boob", "boobs", "booobs", "boooobs", "booooobs", "booooooobs", "breasts", "buceta", "bugger", "bum", "bunny fucker",
    "butt", "butthole", "buttmuch", "buttplug", "c0ck", "c0cksucker", "carpet muncher", "cawk", "chink", "cipa", "cl1t", "clit",
    "clitoris", "clits", "cnut", "cock", "cock-sucker", "cockface", "cockhead", "cockmunch", "cockmuncher", "cocks", "cocksuck",
    "cocksucked", "cocksucker", "cocksucking", "cocksucks", "cocksuka", "cocksukka", "cok", "coke", "cokmuncher", "coksucka", "condom", "coon", "cox",
    "crap", "cum", "cummer", "cumming", "cums", "cumshot", "cunilingus", "cunillingus", "cunnilingus", "cunt", "cuntlick", "cuntlicker",
    "cuntlicking", "cunts", "cyalis", "cyberfuc", "cyberfuck", "cyberfucked", "cyberfucker", "cyberfuckers", "cyberfucking", "d1ck", "damn",
    "dick", "dickhead", "dildo", "dildos", "dink", "dinks", "dirsa", "dlck", "dog-fucker", "doggin", "dogging", "donkeyribber", "doosh",
    "duche", "dyke", "ejaculate", "ejaculated", "ejaculates", "ejaculating", "ejaculatings", "ejaculation", "ejakulate", "f u c k",
    "f u c k e r", "f4nny", "fag", "fagging", "faggitt", "faggot", "faggs", "fagot", "fagots", "fags", "fanny", "fannyflaps", "fannyfucker",
    "fanyy", "fatass", "fcuk", "fcuker", "fcuking", "feck", "fecker", "felching", "fellate", "fellatio", "fingerfuck", "fingerfucked", "fingerfucker",
    "fingerfuckers", "fingerfucking", "fingerfucks", "fistfuck", "fistfucked", "fistfucker", "fistfuckers", "fistfucking", "fistfuckings",
    "fistfucks", "flange", "fook", "fooker", "fuck", "fucka", "fucked", "fucker", "fuckers", "fuckhead", "fuckheads", "fuckin", "fucking",
    "fuckings", "fuckingshitmotherfucker", "fuckme", "fucks", "fuckwhit", "fuckwit", "fudge packer", "fudgepacker", "fuk", "fuker", "fukker",
    "fukkin", "fuks", "fukwhit", "fukwit", "fux", "fux0r", "f_u_c_k", "gangbang", "gangbanged", "gangbangs", "gay", "gaylord", "gaysex", "goatse",
    "god-dam", "god-damned", "goddamn", "goddamned", "hardcoresex", "hell", "heshe", "hoar", "hoare", "hoer", "homo", "hore", "horniest",
    "horny", "hotsex", "jack-off", "jackoff", "jap", "jerk-off", "jism", "jiz", "jizm", "jizz", "kawk", "knob", "knobead", "knobed", "knobend",
    "knobhead", "knobjocky", "knobjokey", "kock", "kondum", "kondums", "kum", "kummer", "kumming", "kums", "kunilingus", "l3i+ch", "l3itch",
    "labia", "lmfao", "lust", "lusting", "m0f0", "m0fo", "m45terbate", "ma5terb8", "ma5terbate", "masochist", "master-bate", "masterb8", "masterbat*",
    "masterbat3", "masterbate", "masterbation", "masterbations", "masturbate", "mo-fo", "mof0", "mofo", "mothafuck", "mothafucka", "mothafuckas",
    "mothafuckaz", "mothafucked", "mothafucker", "mothafuckers", "mothafuckin", "mothafucking", "mothafuckings", "mothafucks", "mother fucker",
    "motherfuck", "motherfucked", "motherfucker", "motherfuckers", "motherfuckin", "motherfucking", "motherfuckings", "motherfuckka", "motherfucks",
    "muff", "mutha", "muthafecker", "muthafuckker", "muther", "mutherfucker", "n1gga", "n1gger", "nazi", "nigg", "niggha", "nigg3r", "nigg4h", "nigga", "niggah",
    "niggas", "niggaz", "nigger", "niggers", "nob", "nob jokey", "nobhead", "nobjocky", "nobjokey", "numbnuts", "nutsack", "orgasim", "orgasims",
    "orgasm", "orgasms", "p0rn", "pawn", "pecker", "penis", "penisfucker", "phonesex", "phuck", "phuk", "phuked", "phuking", "phukked", "phukking",
    "phuks", "phuq", "pigfucker", "pimpis", "piss", "pissed", "pisser", "pissers", "pisses", "pissflaps", "pissin", "pissing", "pissoff", "poop",
    "porn", "porno", "pornography", "pornos", "prick", "pricks", "pron", "pube", "pusse", "pussi", "pussies", "pussy", "pussys", "rectum",
    "retard", "rimjaw", "rimming", "s hit", "s.o.b.", "sadist", "schlong", "screwing", "scroat", "scrote", "scrotum", "semen", "sex",
    "sh!+", "sh!t", "sh1t", "shag", "shagger", "shaggin", "shagging", "shemale", "shi+", "shit", "shitdick", "shite", "shited", "shitey",
    "shitfuck", "shitfull", "shithead", "shiting", "shitings", "shits", "shitted", "shitter", "shitters", "shitting", "shittings", "shitty",
    "skank", "slut", "sluts", "smegma", "smut", "snatch", "son-of-a-bitch", "spac", "spunk", "s_h_i_t", "t1tt1e5", "t1tties", "teets", "teez",
    "testical", "fuuk", "testicle", "tit", "titfuck", "tits", "titt", "tittie5", "tittiefucker", "titties", "tittyfuck", "tittywank", "titwank",
    "tosser", "turd", "tw4t", "twat", "twathead", "twatty", "twunt", "twunter", "v14gra", "v1gra", "vagina", "viagra", "vulva", "w00se",
    "wang", "wank", "wanker", "wanky", "whoar", "whore", "willies", "xrated", "xxx", "suck"];
  override defaultHeroPosition = new Vector2(gridCells(1), gridCells(1));
  defaultColor: string | undefined = undefined;
  heroNames: string[] | undefined = undefined;
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

    // selection: 0 = magi, 1 = knight
    this.selectionIndex = 0;
    this.applySelectionSkins();

    this.bones.textContent = [
      {
        string: [params.championName ? 
          `Current Grid leader: ${params.championName} (${params.championScore ?? 0})` 
          : "Ah, ready to light the Grid.", "Boot complete. Cycle online. Let's ride."
        ],
        requires: [CHARACTER_CREATE_STORY_TEXT_6],
        addsFlag: CHARACTER_CREATE_STORY_TEXT_7,
      } as Scenario,
      // Name prompt (appears once flag 4 obtained)
      {
        string: ["State your handle."],
        requires: [CHARACTER_CREATE_STORY_TEXT_4],
        addsFlag: CHARACTER_CREATE_STORY_TEXT_5,
      } as Scenario,
      {
        string: ["Welcome to the Neon Grid.", "ID not registered. Initialization required."],
        requires: [CHARACTER_CREATE_STORY_TEXT_2],
        addsFlag: CHARACTER_CREATE_STORY_TEXT_4,
      } as Scenario, 
      {
        string: ["...Booting consciousness... signal locked."] ,
        addsFlag: CHARACTER_CREATE_STORY_TEXT_2,
      } as Scenario
    ];
    this.addChild(this.bones);
    this.hideChatInput();

    const sts = new SpriteTextString(
      `Press the Arrow ${!this.onMobile() ? 'keys' : ''} And A Button to Select a Hero.`,
       new Vector2(10, 10),
       "White",
    );
    this.addChild(sts);

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
      if (!this.verifyCharacterName(this.characterName) || storyFlags.contains(CHARACTER_CREATE_STORY_TEXT_6)) { return; } 
      this.returnChatInputToNormal();
      storyFlags.add(CHARACTER_CREATE_STORY_TEXT_6);
      const content = this.bones.getContent();
      if (content) {
        this.displayContent(content);
      }
      console.log("emitting char name");
      if (!this.characterNameEmitted) {
        events.emit("CHARACTER_NAME_CREATED", this.characterName);
        this.characterNameEmitted = true;
        storyFlags.add(CHARACTER_CREATE_STORY_TEXT_7);
      }
    });
    events.on("SPACEBAR_PRESSED", this, () => { 
      const currentTime = new Date();
      if (currentTime.getTime() - this.inputKeyPressedDate.getTime() > 1000) {
        this.inputKeyPressedDate = new Date();
         
        if (storyFlags.contains(CHARACTER_CREATE_STORY_TEXT_7)) {
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
        const sts = new SpriteTextString(  
          `Enter your name in the chat input, then press ${!this.onMobile() ? 'Enter or ' : ''}the A Button to confirm`, new Vector2(10, 10)
        );
        this.addChild(sts);
        this.createNameChatInput(); 
      }
    })
  }
  override destroy() {
  // Ensure chat input is restored when leaving this level
  this.returnChatInputToNormal();
  this.textBox.destroy();
  this.bones.destroy();
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
      // Toggle selection when left/right just pressed
      if (input.getActionJustPressed('ArrowLeft') || input.heldDirections.includes('LEFT')) {
        console.log('CharacterCreate: ArrowLeft pressed/held', this.selectionIndex );

        // move selection left
        this.selectionIndex = Math.max(0, this.selectionIndex - 1);
        this.applySelectionSkins();
        console.log('CharacterCreate: selectionIndex', this.selectionIndex);
      }
      if (input.getActionJustPressed('ArrowRight') || input.heldDirections.includes('RIGHT')) {
        console.log('CharacterCreate: ArrowRight pressed/held', this.selectionIndex );
        // move selection right
        this.selectionIndex = Math.min(1, this.selectionIndex + 1);
        this.applySelectionSkins();
        console.log('CharacterCreate: selectionIndex', this.selectionIndex);
      }
    } catch (ex) {
      // swallow errors to avoid breaking the level loop
      try { console.warn('CharacterCreate.step input check failed', ex); } catch { }
    }
  }

  // Swap sprite skins based on current selectionIndex.
  // selectionIndex 0 => magi selected, magi shows *2 skin
  // selectionIndex 1 => knight selected, knight shows *2 skin
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

      if (this.selectionIndex === 0) {
        // magi selected
        this.magiSprite = replaceSprite(this.magiSprite, "heroSelectMagi2", "Magi");
        this.knightSprite = replaceSprite(this.knightSprite, "heroSelectKnight", "Knight");
      } else {
        // knight selected
        this.magiSprite = replaceSprite(this.magiSprite, "heroSelectMagi", "Magi");
        this.knightSprite = replaceSprite(this.knightSprite, "heroSelectKnight2", "Knight");
      }
    } catch (ex) {
      try { console.warn('applySelectionSkins failed', ex); } catch { }
    }
  }
  private displayContent(content: Scenario) {
    this.children.forEach((child: any) => {
      if (child instanceof SpriteTextStringWithBackdrop || child instanceof SpriteTextString) {
        child.destroy();
      }
    });
    if (this.textBox) { this.textBox.destroy(); }

    if (content.addsFlag) {
      storyFlags.add(content.addsFlag);
    }
    // If this content unlocks the CHARACTER_CREATE_STORY_TEXT_6 flag,
    // make sure the chat input is no longer forced hidden.
    if (storyFlags.contains(CHARACTER_CREATE_STORY_TEXT_6) && this.parent?.input?.chatInput) {
      const chatInput = this.parent.input.chatInput;
      chatInput.style.setProperty('display', 'block', 'important');
    }
    for (let x = 0; x < content.string.length; x++) {
      if (content.string[x].startsWith("Ah,")) {
        content.string[x] = `Ah, ${this.characterName} ready to light the Grid.`;
      }
    }
    this.textBox = new SpriteTextStringWithBackdrop({
      portraitFrame: content.portraitFrame,
      string: content.string,
      objectSubject: this.bones,
    });
    this.addChild(this.textBox);
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
