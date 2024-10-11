import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { gridCells } from "../helpers/grid-cells";
import { resources } from "../helpers/resources";
import { events } from "../helpers/events";
import { storyFlags, Scenario, CHARACTER_CREATE_STORY_TEXT_1, CHARACTER_CREATE_STORY_TEXT_2, CHARACTER_CREATE_STORY_TEXT_3, CHARACTER_CREATE_STORY_TEXT_4, CHARACTER_CREATE_STORY_TEXT_5, CHARACTER_CREATE_STORY_TEXT_6 } from "../helpers/story-flags";
import { Exit } from "../objects/Exit/exit";
import { Level } from "../objects/Level/level";
import { Watch } from "../objects/Watch/watch";
import { Sprite } from "../objects/sprite";
import { Npc } from "../objects/Npc/npc";
import { HeroRoomLevel } from "./hero-room";
import { SpriteTextStringWithBackdrop } from "../objects/SpriteTextString/sprite-text-string-with-backdrop";
import { input } from "@angular/core";

export class CharacterCreate extends Level { 
  textBox = new SpriteTextStringWithBackdrop({});
  inputKeyPressedDate = new Date();
  characterName = ""; 
  npc = new Npc({
    id: -791,
    position: new Vector2(gridCells(5), gridCells(5)),
    textConfig: {
      content: [
        {
          string: ["Wake up... Your journey awaits!"],
          requires: [CHARACTER_CREATE_STORY_TEXT_5],
          addsFlag: CHARACTER_CREATE_STORY_TEXT_6,
        } as Scenario,
        {
          string: [`Ah, ${this.characterName} is it?`],
          requires: [CHARACTER_CREATE_STORY_TEXT_4],
          addsFlag: CHARACTER_CREATE_STORY_TEXT_5,
        } as Scenario,
        {
          string: ["Now, before we begin your journey ...", "What shall be your name, the name the world will know?"],
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
      ],
      portraitFrame: 1
    },
    type: "referee"
  });
  override defaultHeroPosition = new Vector2(gridCells(1), gridCells(1));
  constructor(params: { heroPosition?: Vector2 } = {}) {
    super();
    this.name = "CharacterCreate";
    if (params.heroPosition) {
      this.defaultHeroPosition = params.heroPosition;
    }
    this.addChild(this.npc);
    this.hideChatInput();
    this.walls = new Set<string>();
  }

  override ready() {
    events.on("SEND_CHAT_MESSAGE", this, (chat: string) => {
      this.characterName = chat;
      if (!this.verifyCharacterName(this.characterName) || storyFlags.flags.get(CHARACTER_CREATE_STORY_TEXT_4)) { return; }
      console.log(this.characterName);
      this.returnChatInputToNormal();
      storyFlags.add(CHARACTER_CREATE_STORY_TEXT_4);
      const content = this.npc.getContent();
      if (content) {
        this.displayContent(content);
      } 
    });
    events.on("SPACEBAR_PRESSED", this, () => { 
      const currentTime = new Date();
      if (currentTime.getTime() - this.inputKeyPressedDate.getTime() > 1000) {
        this.inputKeyPressedDate = new Date();

        if (storyFlags.flags.get(CHARACTER_CREATE_STORY_TEXT_4) && !storyFlags.flags.get(CHARACTER_CREATE_STORY_TEXT_5)) {
          return;
        }
        if (storyFlags.flags.get(CHARACTER_CREATE_STORY_TEXT_6)) {
          events.emit("CHANGE_LEVEL", new HeroRoomLevel({
            heroPosition: new Vector2(gridCells(4), gridCells(4))
          }));
        }
        const content = this.npc.getContent();
        if (content) {
          if (storyFlags.flags.get(CHARACTER_CREATE_STORY_TEXT_3) && !storyFlags.flags.get(CHARACTER_CREATE_STORY_TEXT_4)) {
            this.createNameChatInput();
          } else {
            this.displayContent(content);
          }
        }
      }
    })
  }

  private displayContent(content: { portraitFrame: number | undefined; string: string[]; addsFlag: string | null; }) {
    this.children.forEach((child: any) => {
      if (child.textSpeed) {
        child.destroy();
      }
    });

    if (content.addsFlag) {
      storyFlags.add(content.addsFlag);
    }
    for (let x = 0; x < content.string.length; x++) {
      if (content.string[x].includes("Ah, ")) {
        content.string[x] = content.string[x].replace("Ah, ", `Ah, ${this.characterName} `); 
      }
    } 
    this.textBox = new SpriteTextStringWithBackdrop({
      portraitFrame: content.portraitFrame,
      string: content.string
    });
    this.addChild(this.textBox);
  }

  private returnChatInputToNormal() {
    setTimeout(() => {
      const chatInput = this.parent.input.chatInput;
      if (chatInput) {
        chatInput.value = "";
        chatInput.placeholder = "Chat";
        chatInput.style.setProperty('position', 'unset', 'important');
        chatInput.style.setProperty('top', 'unset', 'important');
        this.parent.input.chatInput.blur();
      }
    }, 0);
  }
  private hideChatInput() {
    setTimeout(() => {
      const chatInput = this.parent.input.chatInput;
      if (chatInput) {
        chatInput.value = ""; 
        chatInput.style.setProperty('display', 'none', 'important'); 
        this.parent.input.chatInput.blur();
      }
    }, 0);
  }

  private createNameChatInput() {
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
  private verifyCharacterName(name: string) {
    let outcome = undefined;
    const n = name.toLowerCase();
    const badWords = ["fuck", "shit", "pussy", "dick", "cunt", "spick", "nigger", "dumb"]
    if (!name) {
      outcome = "Enter a valid name.";
    }
    else if (badWords.some(bw => n.includes(bw))) { 
      outcome = "No bad words allowed."; 
    }

    if (outcome) {
      alert(outcome);
      return false;
    }
    return true;
  }
}
