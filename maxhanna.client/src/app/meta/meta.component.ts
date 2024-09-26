import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, input } from '@angular/core';
import { ChildComponent } from '../child.component';
import { MetaHero } from '../../services/datacontracts/meta/meta-hero';
import { Vector2 } from '../../services/datacontracts/meta/vector2';
import { PseudoRandom } from '../../services/datacontracts/meta/pseudorandom';
import { User } from '../../services/datacontracts/user/user';
import { MetaService } from '../../services/meta.service';
import { MetaChat } from '../../services/datacontracts/meta/meta-chat';
import { Sprite } from './objects/sprite';
import { Animations } from './helpers/animations';
import { UP, DOWN, LEFT, RIGHT, gridCells, isSpaceFree } from './helpers/grid-cells';
import { walls } from './levels/hero-room';
import { WALK_DOWN, WALK_LEFT, WALK_RIGHT, WALK_UP, STAND_DOWN, STAND_LEFT, STAND_RIGHT, STAND_UP } from './objects/Hero/hero-animations';
import { FrameIndexPattern } from './helpers/frame-index-pattern';
import { GameLoop } from './helpers/game-loop';
import { resources } from './helpers/resources';
import { Input } from './helpers/input';
import { moveTowards } from './helpers/move-towards';

@Component({
  selector: 'app-meta',
  templateUrl: './meta.component.html',
  styleUrls: ['./meta.component.css']
})

export class MetaComponent extends ChildComponent implements OnInit, OnDestroy {
  @ViewChild('gameCanvas', { static: true }) gameCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chatInput') chatInput!: ElementRef<HTMLInputElement>;
  @ViewChild('componentMain', { static: true }) componentMain!: ElementRef<HTMLDivElement>;
  @ViewChild('heroCanvas') heroCanvasRef!: ElementRef<HTMLCanvasElement>;

  constructor(private metaService: MetaService) {
    super();
    this.hero = {} as MetaHero; 
  }

  @HostListener('window:resize')
  onResize() {
    this.resizeCanvas();
  } 

  canvasWidth = 320;
  canvasHeight = 220;
  canvasCenterX = this.gameCanvas?.nativeElement.width ?? 320 / 2;
  canvasCenterY = this.gameCanvas?.nativeElement.height ?? 180 / 2;
  pollSeconds = 1;
  isUserComponentOpen = false;

  lastFrameTime: number = 0;
  accumulatedTime: number = 0;
  timeStep: number = 1000 / 60;
  rafId: number | null = null;
  isRunning: boolean = false;


  hero: MetaHero;
  otherHeroes: MetaHero[] = [];
  chat: MetaChat[] = [];
  latestMessagesMap = new Map<number, MetaChat>();
  currentMap = 0;
  showingNarrationText = false;
  advanceStoryButtonText = "Next";
  showStartingStory = false;
  showNameInput: boolean = false;
  currentStoryMessages: string[] = [
    "Welcome to the world of Meta-Bots!",
    "I, Mister Referee shall act as referee",
    "...for all the fights along your journey!",
    "But first, what shall we call you?",
  ];
  startingConfirmNameStoryMessages: string[] = [
    "Ah, ",
    "Your grand adventure awaits!",
  ];
  currentDisplayedStoryMessage: string = this.currentStoryMessages[0];
  startingStoryMessageIndex: number = 0;
  startingConfirmNameStoryCurrentMessage: string = this.startingConfirmNameStoryMessages[0];
  startingConfirmNameStoryMessageIndex: number = 0;

  npc = new MetaHero(0, new User(0, "Anonymous"), "Referee", new Vector2(gridCells(5), gridCells(5)), 5, 1);
  sprites: Sprite[] = [];
  heroSprite?: Sprite = undefined;

  mapBoundaries?: Vector2[] = undefined;
  input = new Input();

  private pollingInterval: any;
  private moveInterval: any;
  joystickActive = false;
  joystickOrigin = new Vector2(0, 0);
  joystickCurrentPos = new Vector2(0, 0);
  heldDirections: string[] = [];

  heroDestinationPosition = new Map<number, Vector2>;
  heroFacing = DOWN;

  async ngOnInit() { 
    if (!this.parentRef?.user) {
      this.isUserComponentOpen = true;
    } else {
      this.startLoading();
      this.pollForChanges();
      this.gameLoop.start(); 
      this.resizeCanvas();
      this.stopLoading();
    }
  }

  update = async (delta: number) => { 
    const spriteMap = new Map<number, Sprite>();
    for (const sprite of this.sprites) {
      spriteMap.set(sprite.objectId, sprite);
    } 
    //console.log(this.heroSprite?.frame);

    for (let x = 0; x < this.otherHeroes.length; x++) {
      const hero = this.otherHeroes[x]; 
      const sprite = spriteMap.get(hero.id); 
      const heroDestination = this.heroDestinationPosition.get(hero.id);

      if (hero && sprite) {
        sprite.step(this.timeStep); 
      }
      if (!heroDestination) {
        this.heroDestinationPosition.set(hero.id, new Vector2(hero.position.x, hero.position.y));
      }
      if (hero && sprite && heroDestination) {
        const distance = moveTowards(sprite, heroDestination, 1);
        const hasArrived = (distance ?? 0) <= 1;
        if (hasArrived && hero.id === this.hero.id) {
          this.tryMove(hero, sprite);
        }
      }
    }
    

    if (this.showStartingStory) {
      this.drawStoryChatBubble(this.currentDisplayedStoryMessage);
    }
    //console.log(this.direction);
  }
  
  render = () => { 
    if (!this.showStartingStory) {  
      const levelSprite = new Sprite(0, resources.images["heroRoom"], new Vector2(0, 0), 1, 1, new Vector2(320, 420));
     
      const heroOffset = new Vector2(-8, -21);
      
      const ctx = this.getCtx();
       
      levelSprite.drawImage(0, -100, ctx);  
      
       
      if (this.sprites && this.sprites.length > 0) {
        const sortedSprites = [...this.sprites].sort((a, b) => a.position.y - b.position.y); 

        for (const sprite of sortedSprites) {
          const heroPos = sprite.position ?? new Vector2(gridCells(1), gridCells(1)); 
          const heroPosX = heroPos.x + heroOffset.x;
          const heroPosY = heroPos.y + heroOffset.y;
          sprite.drawImage(heroPosX, heroPosY, ctx);  
        }
      }
    }
  } 

  gameLoop = new GameLoop(this.update, this.render);

  private updatePlayers() { 
    if (this.hero) {
      const heroSprite = this.sprites.find(x => x.objectId === this.hero.id);
      if (heroSprite) { 
        this.hero.position.x = parseInt(heroSprite.position.x.toFixed(0));
        this.hero.position.y = parseInt(heroSprite.position.y.toFixed(0));
      }
      this.metaService.fetchGameData(this.hero).then(res => {
        if (res) {
          this.updateOtherHeroesBasedOnFetchedData(res);
          this.updateMissingOrNewHeroSprites();
           
          if (res.chat) { 
            this.chat = res.chat.reverse();
            if (this.hero) {
              this.hero.map = res.map;
            }
          }
          if (this.hero && this.currentMap != this.hero.map) {
            this.mapBoundaries = undefined;
            this.currentMap = this.hero.map;
            this.hero.position = res.position;  
          }
          this.scrollToBottomOfChat();
          this.getLatestMessages();
        }
      });
    }
  }




  tryMove = (hero: MetaHero, sprite: Sprite) => {
    if (!this.input.direction) { 
      //console.log("stand" + this.heroFacing.charAt(0) + this.heroFacing.substring(1, this.heroFacing.length).toLowerCase());
      sprite.animations?.play("stand" + this.heroFacing.charAt(0) + this.heroFacing.substring(1, this.heroFacing.length).toLowerCase());
      return;
    }

    const gridSize = gridCells(1);
    const destPos = this.heroDestinationPosition.get(hero.id);
    if (destPos) {
      let position = destPos.duplicate();

      if (this.input.direction === DOWN) {
        position.y += gridSize;
        sprite.animations?.play("walkDown");
      }
      else if (this.input.direction === UP) {
        position.y -= gridSize;
        sprite.animations?.play("walkUp");
      }
      else if (this.input.direction === LEFT) {
        position.x -= gridSize;
        sprite.animations?.play("walkLeft");
      }
      else if (this.input.direction === RIGHT) {
        position.x += gridSize;
        sprite.animations?.play("walkRight");
      } 

      this.heroFacing = this.input.direction ?? this.heroFacing;

      if (isSpaceFree(walls, position.x, position.y)) {
        this.heroDestinationPosition.set(hero.id, position);
      } 
    } 
  }

  private updateOtherHeroesBasedOnFetchedData(res: { map: number; position: Vector2; heroes: MetaHero[]; chat: MetaChat[]; }) {
    if (!res || !res.heroes) {
      this.otherHeroes = [];
      return;
    } 
    const updatedHeroes: MetaHero[] = [];
    const currentHeroesMap = new Map(this.otherHeroes.map(hero => [hero.id, hero])); 
    const thisHeroId = this.hero.id;

    for (const newHero of res.heroes) {
      const existingHero = currentHeroesMap.get(newHero.id);

      if (existingHero) {
        if ((existingHero.id != thisHeroId) && (existingHero.position.x !== newHero.position.x || existingHero.position.y !== newHero.position.y)) {
          //existingHero.position = newHero.position;
          this.heroDestinationPosition.set(existingHero.id, new Vector2(newHero.position.x, newHero.position.y)); 
        }
        updatedHeroes.push(existingHero);
      } else {
        updatedHeroes.push(newHero); 
      }
    }
    this.otherHeroes = updatedHeroes;
  }


  private updateMissingOrNewHeroSprites() {
    const spriteMap = new Map<number, Sprite>();
    for (const sprite of this.sprites) {
      spriteMap.set(sprite.objectId, sprite);
    }

    // Step 2: Process the heroes
    for (const hero of this.otherHeroes) {
      let sprite = spriteMap.get(hero.id);
      const pos = hero?.position ?? new Vector2(gridCells(1), gridCells(1));   
      // Step 3: If no sprite exists for the hero, create and add it
      if (!sprite) {
        sprite = new Sprite(
          hero.id,
          resources.images["hero"],
          new Vector2(pos.x, pos.y),
          1,
          1,
          new Vector2(32, 32),
          4,
          4,
          new Animations(
          {
            walkDown: new FrameIndexPattern(WALK_DOWN),
            walkUp: new FrameIndexPattern(WALK_UP),
            walkLeft: new FrameIndexPattern(WALK_LEFT),
            walkRight: new FrameIndexPattern(WALK_RIGHT),
            standDown: new FrameIndexPattern(STAND_DOWN),
            standRight: new FrameIndexPattern(STAND_RIGHT),
            standLeft: new FrameIndexPattern(STAND_LEFT),
            standUp: new FrameIndexPattern(STAND_UP),
          })
        );
        sprite.animations?.play("standDown");
        this.sprites.push(sprite); 
      } 
    }
  }

  ngOnDestroy() {
    clearInterval(this.pollingInterval);
    clearInterval(this.moveInterval);
    stop();
  }

  resizeCanvas() {
    const canvas = this.gameCanvas.nativeElement;
    const ctx = canvas.getContext('2d');

    // Set the canvas size to match the CSS size
    const canvasWidth = 320;
    const canvasHeight = 220;

    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;

    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * devicePixelRatio;
    canvas.height = canvasHeight * devicePixelRatio;
    if (ctx) {
      ctx.scale(devicePixelRatio, devicePixelRatio);
    }
  }


  async pollForChanges() {
    if (!this.hero.id && this.parentRef?.user) {
      const rz = await this.metaService.getHero(this.parentRef.user);
      if (rz) {
        this.hero = rz;
        console.log("set hero " + this.hero.id);
      }
    } 

    this.updatePlayers(); 
    clearInterval(this.pollingInterval);
    this.pollingInterval = setInterval(async () => {
      this.updatePlayers();
    }, this.pollSeconds * 1000);
  }

  handleInputKeydown(event: KeyboardEvent) {
    const inputValue = this.chatInput?.nativeElement?.value?.trim();

    if (event.key === 'Enter' && inputValue) {
      if (this.hero) {
        this.metaService.chat(this.hero, this.chatInput.nativeElement.value);
        this.chatInput.nativeElement.value = "";
      }
      event.preventDefault();
    }
  }
    
    
    
  startStory() {
    this.showStartingStory = true;
    this.showingNarrationText = true;
    this.drawStoryChatBubble(this.currentDisplayedStoryMessage);
  }
  drawStoryChatBubble(message: string) {
    if (!message || message == '') return;
    const ctx = this.getCtx();
    if (!ctx) return;

    const canvasWidth = this.canvasWidth;
    const canvasHeight = this.canvasHeight;
    const padding = 10;

    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const bubbleWidth = canvasWidth - 2 * padding; // Adjust bubble width to fit within padding
    const bubbleHeight = 100; // Adjust as needed

    // Calculate bubble position to center it with padding
    const bubbleX = padding;
    const bubbleY = 10; // Vertically center the bubble

    // Draw the bubble
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(bubbleX + padding, bubbleY);
    ctx.lineTo(bubbleX + bubbleWidth - padding, bubbleY);
    ctx.quadraticCurveTo(bubbleX + bubbleWidth, bubbleY, bubbleX + bubbleWidth, bubbleY + padding);
    ctx.lineTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight - padding);
    ctx.quadraticCurveTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight, bubbleX + bubbleWidth - padding, bubbleY + bubbleHeight);
    ctx.lineTo(bubbleX + padding, bubbleY + bubbleHeight);
    ctx.quadraticCurveTo(bubbleX, bubbleY + bubbleHeight, bubbleX, bubbleY + bubbleHeight - padding);
    ctx.lineTo(bubbleX, bubbleY + padding);
    ctx.quadraticCurveTo(bubbleX, bubbleY, bubbleX + padding, bubbleY);
    ctx.stroke();
    ctx.fill();
    // Draw message text, adjusting font size based on canvas width
    const fontSize = Math.floor(canvasWidth / 12); // Dynamic font size
    ctx.fillStyle = '#000000';
    ctx.font = `${fontSize}px Arial`;
    ctx.textAlign = 'center';

    // Split message into multiple lines if needed
    const words = message.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    const maxWidth = bubbleWidth - 40; // Padding for the bubble
    for (const word of words) {
      const testLine = currentLine + word + ' ';
      const testWidth = ctx.measureText(testLine).width;
      if (testWidth > maxWidth) {
        lines.push(currentLine);
        currentLine = word + ' ';
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine);

    // Adjust text position dynamically
    const lineHeight = fontSize * 1.2;
    const textStartY = bubbleY + padding + lineHeight;

    lines.forEach((line, i) => {
      ctx.fillText(line, bubbleX + bubbleWidth / 2, textStartY + (i * lineHeight));
    });

    // Draw placeholder for sprites (still a simple square for now)
    //let tmpReferee = this.npc;
    //tmpReferee.position = new Vector2(bubbleX + 100, bubbleY + bubbleHeight + 20);
    //this.drawHeroAt(tmpReferee, tmpReferee.position);
  }


  advanceStartingStoryText(): void {
    this.showingNarrationText = true;
    if (this.advanceStoryButtonText == "Start!") {
      this.showingNarrationText = false;
      this.showStartingStory = false;
      if (this.hero?.name) {
        this.metaService.createHero(this.parentRef?.user ?? new User(0, 'Anonymous'), this.hero.name).then(res => {
          this.ngOnInit();
        });
      }
    }

    if (this.showNameInput && this.chatInput && this.chatInput.nativeElement.value.trim() == "") {
      return this.focusOnChatInput();
    } else if (this.showNameInput && this.chatInput && this.chatInput.nativeElement.value.trim().length > 2) {
      this.hero = { name: this.chatInput.nativeElement.value, user: (this.parentRef?.user ?? new User(0, "Anonymous")) } as MetaHero;
      this.startingConfirmNameStoryMessages[0] = this.startingConfirmNameStoryMessages[0] + `${this.hero.name} is it?`;
      this.showNameInput = false;
      this.chatInput.nativeElement.value = "";
    }

    if (this.hero?.name) {
      if (this.startingConfirmNameStoryMessageIndex == 0) {
        this.currentStoryMessages = this.startingConfirmNameStoryMessages;
        this.currentDisplayedStoryMessage = this.currentStoryMessages[this.startingConfirmNameStoryMessageIndex++];
      } else {
        this.currentDisplayedStoryMessage = this.currentStoryMessages[this.startingConfirmNameStoryMessageIndex++]; 
      }
      if (this.startingConfirmNameStoryMessageIndex === this.startingConfirmNameStoryMessages.length) {
        this.advanceStoryButtonText = "Start!";
      }
    } else {
      this.startingStoryMessageIndex++;
      if (this.startingStoryMessageIndex < this.currentStoryMessages.length) {
        this.currentDisplayedStoryMessage = this.currentStoryMessages[this.startingStoryMessageIndex];

      } else if (this.startingStoryMessageIndex === this.currentStoryMessages.length) {
        this.showNameInput = true;
        this.promptForName();
        this.focusOnChatInput();
      }
    }
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

  promptForName(): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    this.showNameInput = true;
    const namePrompt = "Please enter your:";
    this.drawStoryChatBubble(namePrompt);
  }
  heroCanvasClicked() {
    if (this.hero) {
      alert("Repositioned");
      if (this.currentMap == 0) {
        this.hero.position = new Vector2(105, 60);
      }
    }
  }
  focusOnChatInput(): void {
    setTimeout(() => {
      if (this.chatInput) {
        this.chatInput.nativeElement.focus();
      }
    }, 0);
  }
  getCtx(): CanvasRenderingContext2D | undefined {
    const canvas: HTMLCanvasElement = this.gameCanvas.nativeElement;
    const ctx = canvas?.getContext('2d');
    return ctx ? ctx : undefined;
  }
  scrollToBottomOfChat() {
    const chatContent = document.getElementById("chatBox");
    if (chatContent) {
      chatContent.scrollTop = chatContent.scrollHeight;
    }
  }
  closeUserComponent(user: User) {
    this.isUserComponentOpen = false;
    if (this.parentRef) {
      this.ngOnInit();
    }
  }
  showChatInput() {
    return this.showNameInput
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
