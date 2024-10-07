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
import { UP, DOWN, LEFT, RIGHT, gridCells, isSpaceFree, snapToGrid } from './helpers/grid-cells';
import { FrameIndexPattern } from './helpers/frame-index-pattern';
import { GameLoop } from './helpers/game-loop';
import { resources } from './helpers/resources';
import { Input } from './helpers/input';
import { moveTowards } from './helpers/move-towards';
import { events } from './helpers/events'; 
import { storyFlags } from './helpers/story-flags'; 
import { Hero } from './objects/Hero/hero';
import { Main } from './objects/Main/main';
import { HeroRoomLevel } from './levels/hero-room';
import { Fight } from './levels/fight';
import { CharacterCreate } from './levels/character-create';
import { Level } from './objects/Level/level';
import { SpriteTextStringWithBackdrop } from './objects/SpriteTextString/sprite-text-string-with-backdrop';
import { CaveLevel1 } from './levels/cave-level1';
import { HeroHomeLevel } from './levels/hero-home';
import { BoltonLevel1 } from './levels/bolton-level1';
import { MetaEvent } from '../../services/datacontracts/meta/meta-event';

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
    this.subscribeToMainGameEvents();
  } 
  canvas!: HTMLCanvasElement;
  ctx!: CanvasRenderingContext2D; 
  pollSeconds = 1;
  isUserComponentOpen = false;

  mainScene: Main;  
  metaHero: MetaHero;
  hero: Hero;
  otherHeroes: MetaHero[] = [];
  partyMembers: MetaHero[] = [];
  chat: MetaChat[] = [];
  events: MetaEvent[] = [];
  latestMessagesMap = new Map<number, MetaChat>();
  stopChatScroll = false; 
    
  private pollingInterval: any;
    

  ngOnDestroy() {
    clearInterval(this.pollingInterval);
    this.mainScene.destroy(); 
    stop(); 
    this.remove_me('MetaComponent');
  } 

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
    this.mainScene.drawBackground(this.ctx); //Anything that needs to be statically drawn (regardless of camera position) like a sky, goes here, before CTX save/translation
    this.ctx.save(); //Save the current state for camera offset;
    if (this.mainScene.camera) { 
      this.ctx.translate(this.mainScene.camera.position?.x ?? 0, this.mainScene.camera.position?.y ?? 0); //Offset by camera position:
    } 
    this.mainScene.drawObjects(this.ctx); 
    this.ctx.restore(); //Restore to original state 
    this.mainScene.drawForeground(this.ctx); //Draw anything above the game world
  }  
  gameLoop = new GameLoop(this.update, this.render);

  private updatePlayers() {
    if (this.metaHero && this.metaHero.id) {
      this.metaService.fetchGameData(this.metaHero).then(res => {
        if (res) {
          this.updateOtherHeroesBasedOnFetchedData(res);
          this.updateMissingOrNewHeroSprites();
           
          if (res.chat) {
            this.chat = res.chat;
            this.getLatestMessages();
          }
          if (res.events) { 
            this.actionEvents(res.events);
          }
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
    if (storyFlags.flags.has("START_FIGHT")) {
      return;
    } 
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
        if (hero.id == this.metaHero.id) { 
          console.log("could not find existing hero for user so creating new one.");
        }
        const tmpHero = new Hero(
          hero.id == this.metaHero.id ? this.metaHero.position.x : hero.position.x,
          hero.id == this.metaHero.id ? this.metaHero.position.y : hero.position.y
        );
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

  async pollForChanges() {
    if (!this.hero.id && this.parentRef?.user) {
      const rz = await this.metaService.getHero(this.parentRef.user);
      if (rz) {
        this.reinitializeHero(rz); 
      }
      else {
        this.mainScene.setLevel(new CharacterCreate());
      }
    } 

    this.updatePlayers(); 
    clearInterval(this.pollingInterval);
    this.pollingInterval = setInterval(async () => {
      this.updatePlayers();
    }, this.pollSeconds * 1000);
  }

  private actionEvents(events: MetaEvent[]) {
    const currentEvents = this.events;
    if (events.length > 0) {
      for (let event of events) { 
        const existingEvent = currentEvents.find(e => e.id == event.id);
        if (!existingEvent) {
          //do something with this fresh event.
          if (event.event === "PARTY_UP" && event.data && event.data["hero_id"] == `${this.metaHero.id}`) {
            const otherPlayer = this.otherHeroes.find(hero => hero.id === event.heroId);
            if (otherPlayer) { 
              this.partyMembers.push(otherPlayer);
              console.log("Added party member: ", otherPlayer);
            }
          } 
        }
      } 
    }
    this.events = events;
  }

  private reinitializeHero(rz: MetaHero) {
    this.hero = new Hero(snapToGrid(rz.position.x, 16), snapToGrid(rz.position.y, 16));
    this.hero.id = rz.id;
    this.hero.name = rz.name ?? "Anon";
    this.metaHero = new MetaHero(this.hero.id, this.hero.name, this.hero.position.duplicate(), rz.speed, rz.map, []);
     
    const levelKey = rz.map.toUpperCase();
    const level = this.getLevelFromLevelName(rz.map);

    if (level) {
      this.mainScene.setLevel(level);
    }

    this.mainScene.camera.centerPositionOnTarget(this.metaHero.position);
  }

  private getLevelFromLevelName(key: string): Level {
    const upperKey = key.toUpperCase();
    if (upperKey === "HEROROOM") return new HeroRoomLevel();
    else if (upperKey == "CAVELEVEL1") return new CaveLevel1();
    else if (upperKey == "HEROHOME") return new HeroHomeLevel();
    else if (upperKey == "BOLTONLEVEL1") return new BoltonLevel1();
    else if (upperKey == "FIGHT") return new Fight(
      {
        heroPosition: this.metaHero.position,
        entryLevel: (this.metaHero.map == "FIGHT" ? new BoltonLevel1() : this.getLevelFromLevelName(this.metaHero.map)),
        enemies: undefined,
        party: [this.metaHero]
      }
    );
    return new HeroRoomLevel();
  }

  private subscribeToMainGameEvents() {
    events.on("CHANGE_LEVEL", this.mainScene, (newLevelInstance: Level) => {
      this.pollForChanges();
      if (this.mainScene.level?.name) {
        if (newLevelInstance.name != "Fight") { 
          this.metaHero.map = newLevelInstance?.name;
          this.metaHero.position = newLevelInstance.getDefaultHeroPosition();
        } 
        const hero = this.mainScene.level.children.filter((x: any) => x.id == this.metaHero.id) as Hero;
        hero.position = newLevelInstance.getDefaultHeroPosition(); 
      }
    });

    events.on("SEND_CHAT_MESSAGE", this, (chat: string) => {
      const msg = chat.trim();
      if (this.parentRef?.user) {
        console.log("Chat: " + msg);
        if (this.chatInput.nativeElement.placeholder === "Enter your name") {
          this.metaService.createHero(this.parentRef.user, msg);
        } else {
          this.metaService.chat(this.metaHero, msg);
          this.chatInput.nativeElement.value = '';
          setTimeout(() => {
            this.chatInput.nativeElement.blur();
            this.gameCanvas.nativeElement.focus();
          }, 0);
        }
      }
    });

    events.on("START_FIGHT", this, (source: any) => {
      console.log("got fight event, starting fight ..", source); 
      //this.mainScene.level?.children.forEach();
      events.emit("CHANGE_LEVEL", new Fight({
        heroPosition: this.metaHero.position,
        entryLevel: (this.metaHero.map == "FIGHT" ? new BoltonLevel1() : this.getLevelFromLevelName(this.metaHero.map)),
        enemies: source.partnerNpcs?.concat(source) ?? source,
        party: [this.metaHero]
      }));  
    });

    //Reposition Safely handler
    events.on("REPOSITION_SAFELY", this, () => {
      if (this.metaHero) {
        const levelName = this.mainScene.level?.name; // Get the class reference
        if (levelName && levelName != "Fight") {
          events.emit("CHANGE_LEVEL", this.getLevelFromLevelName(levelName));
        }
      }
    });

    events.on("USER_ATTACK_SELECTED", this, (skill: string) => {
      const metaEvent = new MetaEvent(0, this.metaHero.id, new Date(), "USER_ATTACK_SELECTED", this.metaHero.map, { "skill": skill })
      this.metaService.updateEvents(metaEvent);
    })
    events.on("PARTY_UP", this, (person: Hero) => {
      const metaEvent = new MetaEvent(0, this.metaHero.id, new Date(), "PARTY_UP", this.metaHero.map, { "hero_id": `${person.id}` })
      this.metaService.updateEvents(metaEvent);
    })
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
   
  closeUserComponent(user: User) {
    this.isUserComponentOpen = false;
    if (this.parentRef) {
      this.ngOnInit();
    }
  }  
}
