import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, input } from '@angular/core';
import { ChildComponent } from '../child.component';
import { MetaHero } from '../../services/datacontracts/meta/meta-hero';
import { Vector2 } from '../../services/datacontracts/meta/vector2';
import { PseudoRandom } from '../../services/datacontracts/meta/pseudorandom';
import { User } from '../../services/datacontracts/user/user';
import { MetaService } from '../../services/meta.service';
import { MetaChat } from '../../services/datacontracts/meta/meta-chat';
import { Sprite } from './objects/sprite';
import { GameObject } from './objects/game-object';
import { Camera } from './objects/camera';
import { Inventory } from './objects/inventory'; 
import { Exit } from './objects/Exit/exit';
import { Animations } from './helpers/animations';
import { UP, DOWN, LEFT, RIGHT, gridCells, isSpaceFree } from './helpers/grid-cells';
import { FrameIndexPattern } from './helpers/frame-index-pattern';
import { GameLoop } from './helpers/game-loop';
import { resources } from './helpers/resources';
import { Input } from './helpers/input';
import { moveTowards } from './helpers/move-towards';
import { events } from './helpers/events'; 
import { Hero } from './objects/Hero/hero';
import { Main } from './objects/Main/main';
import { HeroRoomLevel } from './levels/hero-room';
import { CharacterCreate } from './levels/character-create';
import { Level } from './objects/Level/level';
import { SpriteTextString } from './objects/SpriteTextString/sprite-text-string';
import { CaveLevel1 } from './levels/cave-level1';
import { HeroHomeLevel } from './levels/hero-home';
import { BoltonLevel1 } from './levels/bolton-level1';

@Component({
  selector: 'app-meta',
  templateUrl: './meta.component.html',
  styleUrls: ['./meta.component.css']
})

export class MetaComponent extends ChildComponent implements OnInit, OnDestroy {
  @ViewChild('gameCanvas', { static: true }) gameCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chatInput') chatInput!: ElementRef<HTMLInputElement>; 

  constructor(private metaService: MetaService) {
    super();
    this.hero = {} as Hero;
    this.metaHero = {} as MetaHero;
    this.mainScene = new Main(0, 0);

    events.on("CHANGE_LEVEL", this.mainScene, (newLevelInstance: Level) => {
      if (newLevelInstance.name == "HeroRoom") {
        this.pollForChanges()
      }
      if (this.mainScene.level?.name) {
        this.metaHero.map = newLevelInstance?.name;
        console.log(this.metaHero.map);
        const hero = this.mainScene.level.children.filter((x: any) => x.id == this.metaHero.id) as Hero;
        hero.position = newLevelInstance.getDefaultHeroPosition();
        this.metaHero.position = newLevelInstance.getDefaultHeroPosition();
        console.log(hero.position);
      }
    });

    events.on("SEND_CHAT_MESSAGE", this, (chat: string) => {
      const currentTime = new Date();
      if (currentTime.getTime() - this.keyPressedDate.getTime() > 300 && this.parentRef?.user) {
        this.keyPressedDate = new Date();
        console.log("send chat message" + chat);
        if (this.chatInput.nativeElement.placeholder === "Enter your name") {
          this.metaService.createHero(this.parentRef.user, chat); 
        } else {
          this.metaService.chat(this.metaHero, chat);
          this.chatInput.nativeElement.value = '';
          setTimeout(() => {
            this.chatInput.nativeElement.blur();
            this.gameCanvas.nativeElement.focus();
          }, 0);
        }
      } 
    });
  } 
  canvas!: HTMLCanvasElement;
  ctx!: CanvasRenderingContext2D; 
  pollSeconds = 1;
  isUserComponentOpen = false;

  mainScene: Main;  
  metaHero: MetaHero;
  hero: Hero;
  otherHeroes: MetaHero[] = [];
  chat: MetaChat[] = [];
  latestMessagesMap = new Map<number, MetaChat>();
  stopChatScroll = false;
  keyPressedDate = new Date();
    
  private pollingInterval: any;


  async ngOnInit() {
    this.canvas = this.gameCanvas.nativeElement;
    this.ctx = this.canvas.getContext("2d")!;
    if (!this.parentRef?.user) {
      this.isUserComponentOpen = true;
    } else {
      this.startLoading();
      this.pollForChanges();
      this.gameLoop.start();  
      this.stopLoading();
    }
  }

  update = async (delta: number) => {
    this.mainScene.stepEntry(delta, this.mainScene);
    this.mainScene.input?.update();
  } 
  render = () => {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    //Anything that needs to be statically drawn (regardless of camera position) like a sky, goes here, before CTX save/translation
    this.mainScene.drawBackground(this.ctx);

    //Save the current state for camera offset;
    this.ctx.save();

    //Offset by camera position:
    if (this.mainScene.camera) { 
      this.ctx.translate(this.mainScene.camera.position?.x ?? 0, this.mainScene.camera.position?.y ?? 0);
    } 
    this.mainScene.drawObjects(this.ctx);

    //Restore to original state
    this.ctx.restore();

    //Draw anything above the game world
    this.mainScene.drawForeground(this.ctx);
  }  
  gameLoop = new GameLoop(this.update, this.render);

  private updatePlayers() {
    if (this.metaHero && this.metaHero.id) {
      this.metaService.fetchGameData(this.metaHero).then(res => {
        if (res) {
          this.updateOtherHeroesBasedOnFetchedData(res);
          this.updateMissingOrNewHeroSprites();
           
          if (res.chat) {
            this.chat = res.chat.reverse();
          }
          this.scrollToBottomOfChat();
          this.getLatestMessages();
        }
      });
    }
  }
   

  private updateOtherHeroesBasedOnFetchedData(res: { map: number; position: Vector2; heroes: MetaHero[]; chat: MetaChat[]; }) {
    if (!res || !res.heroes) {
      this.otherHeroes = [];
      return;
    }  
    this.otherHeroes = res.heroes;
  }


  private updateMissingOrNewHeroSprites() {
    let ids: number[] = [];
    for (const hero of this.otherHeroes) {
      const existingHero = this.mainScene.level?.children.find((x: any) => x.id === hero.id);
      if (existingHero) {
        if (existingHero.id != this.hero.id) {
          const newPos = new Vector2(hero.position.x, hero.position.y); 
          if (!existingHero.destinationPosition.matches(newPos)) { 
            existingHero.destinationPosition = newPos;
          }
        }
        else {
          this.metaHero.position = new Vector2(existingHero.position.x, existingHero.position.y).duplicate(); 
        }
        const latestMsg = this.latestMessagesMap.get(existingHero.id);
        if (latestMsg) {
          existingHero.latestMessage = latestMsg.content;
        } else {
          existingHero.latestMessage = ""; 
        }
      } else {
        const posX = hero.id == this.metaHero.id ? this.metaHero.position.x : hero.position.x;
        const posY = hero.id == this.metaHero.id ? this.metaHero.position.y : hero.position.y;
        const tmpHero = new Hero(posX, posY);
        tmpHero.id = hero.id;
        tmpHero.name = hero.name ?? "Anon";
        if (hero.id === this.metaHero.id) {
          tmpHero.isUserControlled = true;
        } 
        this.mainScene.level?.addChild(tmpHero); 
      }
      ids.push(hero.id);
    }
    if (ids.length > 0) {
      this.mainScene.level?.children.forEach((x: any) => {
        if (x.id > 0 && !ids.includes(x.id)) {
          x.destroy();
        }
      });
    }
  }
  private snapToGrid(value: number, gridSize: number): number {
    return Math.round(value / gridSize) * gridSize;
  }

  ngOnDestroy() {
    clearInterval(this.pollingInterval);
    stop();

    this.mainScene.destroy();
    this.remove_me('MetaComponent');
  } 

  async pollForChanges() {
    if (!this.hero.id && this.parentRef?.user) {
      const rz = await this.metaService.getHero(this.parentRef.user);
      if (rz) {
        this.hero = new Hero(this.snapToGrid(rz.position.x, 16), this.snapToGrid(rz.position.y, 16));
        this.hero.id = rz.id;
        this.hero.name = rz.name ?? "Anon";
        this.metaHero = new MetaHero(this.hero.id, this.hero.name, this.hero.position.duplicate(), rz.speed, rz.map);
        this.setInitialScene(rz); 
      }
      else {
        this.mainScene.setLevel(new CharacterCreate())
      }
    } 

    this.updatePlayers(); 
    clearInterval(this.pollingInterval);
    this.pollingInterval = setInterval(async () => {
      this.updatePlayers();
    }, this.pollSeconds * 1000);
  }
   
    
  private setInitialScene(rz: MetaHero) {
    const levelMap: { [key: string]: () => Level } = {
      "HEROROOM": () => new HeroRoomLevel(),
      "CAVELEVEL1": () => new CaveLevel1(),
      "HEROHOME": () => new HeroHomeLevel(),
      "BOLTONLEVEL1": () => new BoltonLevel1(),
    };
    const levelKey = rz.map.toUpperCase();
    const level = levelMap[levelKey]?.();

    if (level) {
      this.mainScene.setLevel(level);
    }

    this.mainScene.camera.centerPositionOnTarget(this.metaHero.position);
  }

       
  private getLatestMessages() {
    this.latestMessagesMap.clear();
    const twentySecondsAgo = new Date(Date.now() - 20000);

    this.chat.forEach((message: MetaChat) => {
      const timestampDate = message.timestamp ? new Date(message.timestamp) : undefined;

      if (timestampDate && timestampDate > twentySecondsAgo) {
        const existingMessage = this.latestMessagesMap.get(message.hero.id);

        if (!existingMessage || (existingMessage && existingMessage.timestamp && new Date(existingMessage.timestamp) < timestampDate)) {
          this.latestMessagesMap.set(message.hero.id, message);
        }
      }
    });
  }


  handleChatScroll() {
    const chatContent = document.getElementById("chatBox");
    if (chatContent) {
      const isUserAtBottom = chatContent.scrollHeight - chatContent.scrollTop <= chatContent.clientHeight + 10; 
         
      if (!isUserAtBottom) {
        this.stopChatScroll = true;
      } else {
        this.stopChatScroll = false;
      }
    }
  }

  scrollToBottomOfChat() { 
    if (!this.stopChatScroll) { 
      const chatContent = document.getElementById("chatBox");
      if (chatContent) {
        chatContent.scrollTop = chatContent.scrollHeight;
      }
    }
  }

  closeUserComponent(user: User) {
    this.isUserComponentOpen = false;
    if (this.parentRef) {
      this.ngOnInit();
    }
  }
   

  isDayTime() {
    const now = new Date();
    const hours = now.getHours(); // Get the current hour (0 - 23)

    // Day is considered between 6 AM (6) and 6 PM (18)
    if (hours >= 6 && hours < 18) {
      return true; // It's daytime
    } else {
      return false; // It's nighttime
    }
  } 
  
}
