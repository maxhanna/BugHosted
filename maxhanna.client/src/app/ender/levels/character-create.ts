import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { events } from "../helpers/events";
import { storyFlags, Scenario, CHARACTER_CREATE_STORY_TEXT_1, CHARACTER_CREATE_STORY_TEXT_2, CHARACTER_CREATE_STORY_TEXT_3, CHARACTER_CREATE_STORY_TEXT_4, CHARACTER_CREATE_STORY_TEXT_5, CHARACTER_CREATE_STORY_TEXT_6, CHARACTER_CREATE_STORY_TEXT_7, CHARACTER_CREATE_STORY_TEXT_8 } from "../helpers/story-flags";
import { Level } from "../objects/Level/level"; 
import { HeroRoomLevel } from "./hero-room";
import { SpriteTextStringWithBackdrop } from "../objects/SpriteTextString/sprite-text-string-with-backdrop";
import { Referee } from "../objects/Npc/Referee/referee";
import { SpriteTextString } from "../objects/SpriteTextString/sprite-text-string";

export class CharacterCreate extends Level { 
  textBox = new SpriteTextStringWithBackdrop({});
  inputKeyPressedDate = new Date();
  characterNameEmitted = false;
  changeLevelEmitted = false;
  characterName = "";
  referee = new Referee({ position: new Vector2(gridCells(5), gridCells(5)) });
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
    "testical", "testicle", "tit", "titfuck", "tits", "titt", "tittie5", "tittiefucker", "titties", "tittyfuck", "tittywank", "titwank",
    "tosser", "turd", "tw4t", "twat", "twathead", "twatty", "twunt", "twunter", "v14gra", "v1gra", "vagina", "viagra", "vulva", "w00se",
    "wang", "wank", "wanker", "wanky", "whoar", "whore", "willies", "xrated", "xxx", "suck"];
  override defaultHeroPosition = new Vector2(gridCells(1), gridCells(1));
  constructor(params: { heroPosition?: Vector2 } = {}) {
    super();
    console.log("new char create");
    this.name = "CharacterCreate";
    if (params.heroPosition) {
      this.defaultHeroPosition = params.heroPosition;
    } 
    this.referee.textContent = [
      {
        string: ["Wake up... Your journey awaits!"],
        requires: [CHARACTER_CREATE_STORY_TEXT_7],
        addsFlag: CHARACTER_CREATE_STORY_TEXT_8,
      } as Scenario,
      {
        string: [`Ah, ${this.characterName} is it?`],
        requires: [CHARACTER_CREATE_STORY_TEXT_6],
        addsFlag: CHARACTER_CREATE_STORY_TEXT_7,
      } as Scenario,
      {
        string: ["Now, before we begin your journey ...", "What shall be your name, the name the world will know?"],
        requires: [CHARACTER_CREATE_STORY_TEXT_4],
        addsFlag: CHARACTER_CREATE_STORY_TEXT_5,
      } as Scenario, 
      {
        string: ["These marvelous machines serve not just in battle, but also protect our planet."],
        requires: [CHARACTER_CREATE_STORY_TEXT_3],
        addsFlag: CHARACTER_CREATE_STORY_TEXT_4,
      } as Scenario,
      {
        string: ["This is the world of Meta-Bots!"],
        requires: [CHARACTER_CREATE_STORY_TEXT_2],
        addsFlag: CHARACTER_CREATE_STORY_TEXT_3,
      } as Scenario,
      {
        string: ["I am Mr. Referee, and I bring fair play to every ro-battle!", " Even in dreams, justice never sleeps!"],
        requires: [CHARACTER_CREATE_STORY_TEXT_1],
        addsFlag: CHARACTER_CREATE_STORY_TEXT_2,
      } as Scenario,
      {
        string: ["Zzz... Huh? Who dares disturb my dreams... oh, it's you!"],
        addsFlag: CHARACTER_CREATE_STORY_TEXT_1,
      } as Scenario
    ];
    this.addChild(this.referee);
    this.hideChatInput();

    const sts = new SpriteTextString(
      `Press ${!this.onMobile() ? 'Spacebar or ' : ''}the A Button to Start`,
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
      this.characterName = chat;
      if (!this.verifyCharacterName(this.characterName) || storyFlags.contains(CHARACTER_CREATE_STORY_TEXT_6)) { return; } 
      this.returnChatInputToNormal();
      storyFlags.add(CHARACTER_CREATE_STORY_TEXT_6);
      const content = this.referee.getContent();
      if (content) {
        this.displayContent(content);
      }
      console.log("emitting char name");
      if (!this.characterNameEmitted) {
        events.emit("CHARACTER_NAME_CREATED", this.characterName);
        this.characterNameEmitted = true;
      }
    });
    events.on("SPACEBAR_PRESSED", this, () => { 
      const currentTime = new Date();
      if (currentTime.getTime() - this.inputKeyPressedDate.getTime() > 1000) {
        this.inputKeyPressedDate = new Date();
         
        if (storyFlags.contains(CHARACTER_CREATE_STORY_TEXT_8)) {
          setTimeout(() => {
            events.emit("CHANGE_LEVEL", new HeroRoomLevel({
              heroPosition: new Vector2(gridCells(4), gridCells(4))
            }));
            this.destroy();
          }, 100);
          return;
        } else if (storyFlags.contains(CHARACTER_CREATE_STORY_TEXT_4)) {
          const sts = new SpriteTextString(  
            `Enter your name in the chat input, then press ${!this.onMobile() ? 'Enter or ' : ''}the A Button to confirm`, new Vector2(10, 10)
          );
          this.addChild(sts);
        }
        const content = this.referee.getContent();
        if (content) {
          if (storyFlags.contains(CHARACTER_CREATE_STORY_TEXT_5) && !storyFlags.contains(CHARACTER_CREATE_STORY_TEXT_6)) {
            this.createNameChatInput();
          } else {
            this.displayContent(content);
          }
        }
      }
    })
  }
  override destroy() {
  // Ensure chat input is restored when leaving this level
  this.returnChatInputToNormal();
  this.textBox.destroy();
  this.referee.destroy();
  events.unsubscribe(this);
  super.destroy();
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
    // If this content unlocks the CHARACTER_CREATE_STORY_TEXT_4 flag,
    // make sure the chat input is no longer forced hidden.
    if (storyFlags.contains(CHARACTER_CREATE_STORY_TEXT_5) && this.parent?.input?.chatInput) {
      const chatInput = this.parent.input.chatInput;
      chatInput.style.setProperty('display', 'block', 'important');
    }
    for (let x = 0; x < content.string.length; x++) {
      if (content.string[x].includes("Ah, ")) {
        content.string[x] = content.string[x].replace("Ah, ", `Ah, ${this.characterName} `); 
      }
    } 
    this.textBox = new SpriteTextStringWithBackdrop({
      portraitFrame: content.portraitFrame,
      string: content.string,
      objectSubject: this.referee,
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
    } else if (name.length > 40) {
      outcome = "Name must be under 40 characters long.";
    }

    if (outcome) {
      alert(outcome);
      return false;
    }
    return true;
  }
}
