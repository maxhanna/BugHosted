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
import { Watch } from './objects/Watch/watch';
import { Exit } from './objects/Exit/exit';
import { Animations } from './helpers/animations';
import { UP, DOWN, LEFT, RIGHT, gridCells, isSpaceFree } from './helpers/grid-cells';
import { FrameIndexPattern } from './helpers/frame-index-pattern';
import { GameLoop } from './helpers/game-loop';
import { resources } from './helpers/resources';
import { Input } from './helpers/input';
import { moveTowards } from './helpers/move-towards';
import { events } from './helpers/events';
import { walls } from './levels/hero-room'; 
import { Hero } from './objects/Hero/hero';

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
    this.hero = {} as Hero;
    this.mainScene = new GameObject({ position: new Vector2(0, 0) });
    const levelSprite = new Sprite(
      0, resources.images["heroRoom"], new Vector2(0, 0), 1, 1, new Vector2(320, 420)
    );
    this.mainScene.addChild(levelSprite);
    this.mainScene.input = new Input();

    this.watch = new Watch(gridCells(2), gridCells(6));
    this.mainScene.addChild(this.watch);

    this.exit = new Exit(gridCells(2), gridCells(4));
    this.mainScene.addChild(this.exit);

    this.inventory = new Inventory();

    events.on("HERO_EXITS", this.mainScene, () => {
      console.log("CHANGE THE MAP");
    })

  }

  @HostListener('window:resize')
  onResize() {
    this.resizeCanvas();
  }
  canvas!: HTMLCanvasElement;
  ctx!: CanvasRenderingContext2D;
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


  hero: Hero;
  otherHeroes: MetaHero[] = [];
  chat: MetaChat[] = [];
  latestMessagesMap = new Map<number, MetaChat>();
  currentMap = 0; 
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

  npc = new MetaHero(0, "Referee", new Vector2(gridCells(5), gridCells(5)), 5, 1);
  heroSprites: Sprite[] = [];
  mainScene : GameObject;
  camera?: Camera;
  inventory?: Inventory;
  watch: Watch;
  exit: Exit;

  private pollingInterval: any; 
  heroDestinationPosition = new Map<number, Vector2>;
  heroFacing = DOWN;

  async ngOnInit() {
    this.canvas = this.gameCanvas.nativeElement;
    this.ctx = this.canvas.getContext("2d")!;
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
    this.mainScene.stepEntry(delta, this.mainScene);
     
    if (this.showStartingStory) {
      this.drawStoryChatBubble(this.currentDisplayedStoryMessage);
    } 
  } 
  render = () => {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    //Anything that needs to be statically drawn (regardless of camera position) like a sky, goes here, before CTX save/translation


    //Save the current state for camera offset;
    this.ctx.save();

    //Offset by camera position:
    this.ctx.translate(this.camera?.position?.x ?? 0, this.camera?.position?.y ?? 0);

    this.mainScene.draw(this.ctx, 0, 0);

    //Restore to original state
    this.ctx.restore();

    //Draw anything above the game world
    this.inventory?.draw(this.ctx, 0, 0);
  }  
  gameLoop = new GameLoop(this.update, this.render);

  private updatePlayers() { 
    if (this.hero) {
      const metaHero = new MetaHero(this.hero.id, this.hero.name, this.hero.position.duplicate(), 5, 0);
      this.metaService.fetchGameData(metaHero).then(res => {
        if (res) {
          this.updateOtherHeroesBasedOnFetchedData(res);
          this.updateMissingOrNewHeroSprites();
           
          if (res.chat) { 
            this.chat = res.chat.reverse();
            //if (this.hero) {
            //  this.hero.map = res.map;
            //}
          }
          //if (this.hero && this.currentMap != this.hero.map) { 
          //  this.currentMap = this.hero.map;
          //  this.hero.position = res.position;  
          //}
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
    for (const hero of this.otherHeroes) {
      const existingHero = this.mainScene.children.find((x: any) => x.id === hero.id);
      if (existingHero) {
        if (existingHero.id != this.hero.id) { 
          existingHero.position = hero.position;
        }
      } else {
        const tmpHero = new Hero(hero.position.x, hero.position.y);
        tmpHero.id = hero.id;
        tmpHero.name = hero.name ?? "Anon";
        this.mainScene.addChild(tmpHero); 
      } 
    }
  }
  private snapToGrid(value: number, gridSize: number): number {
    return Math.round(value / gridSize) * gridSize;
  }

  ngOnDestroy() {
    clearInterval(this.pollingInterval); 
    stop();
  }

  resizeCanvas() { 

    // Set the canvas size to match the CSS size
    const canvasWidth = 320;
    const canvasHeight = 220;

    this.canvas.style.width = `${canvasWidth}px`;
    this.canvas.style.height = `${canvasHeight}px`;

    const devicePixelRatio = window.devicePixelRatio || 1;
    this.canvas.width = canvasWidth * devicePixelRatio;
    this.canvas.height = canvasHeight * devicePixelRatio; 
    this.ctx.scale(devicePixelRatio, devicePixelRatio); 
  }


  async pollForChanges() {
    if (!this.hero.id && this.parentRef?.user) {
      const rz = await this.metaService.getHero(this.parentRef.user);
      if (rz) {
        this.hero = new Hero(rz.position.x, rz.position.y);
        this.hero.id = rz.id;
        this.hero.name = rz.name ?? "Anon";
        this.mainScene.addChild(this.hero);
         
        const personHalf = 8;
        const canvasWidth = 320;
        const canvasHeight = 220;
        const halfWidth = -personHalf + (canvasWidth / 2);
        const halfHeight = -personHalf + (canvasHeight / 2);

        this.camera = new Camera(-rz.position.x + halfWidth, -rz.position.y + halfHeight);
        this.mainScene.addChild(this.camera);
      } else {
        this.startStory();
      }
    } 

    this.updatePlayers(); 
    clearInterval(this.pollingInterval);
    this.pollingInterval = setInterval(async () => {
      this.updatePlayers();
    }, this.pollSeconds * 1000);
  }
   
    
  startStory() {
    this.showStartingStory = true; 
    this.drawStoryChatBubble(this.currentDisplayedStoryMessage);
  }
  drawStoryChatBubble(message: string) {
    if (!message || message == '') return; 

    const canvasWidth = this.canvasWidth;
    const canvasHeight = this.canvasHeight;
    const padding = 10;

    this.ctx.fillStyle = "#333";
    this.ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const bubbleWidth = canvasWidth - 2 * padding; // Adjust bubble width to fit within padding
    const bubbleHeight = 100; // Adjust as needed

    // Calculate bubble position to center it with padding
    const bubbleX = padding;
    const bubbleY = 10; // Vertically center the bubble

    // Draw the bubble
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 4;
    this.ctx.beginPath();
    this.ctx.moveTo(bubbleX + padding, bubbleY);
    this.ctx.lineTo(bubbleX + bubbleWidth - padding, bubbleY);
    this.ctx.quadraticCurveTo(bubbleX + bubbleWidth, bubbleY, bubbleX + bubbleWidth, bubbleY + padding);
    this.ctx.lineTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight - padding);
    this.ctx.quadraticCurveTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight, bubbleX + bubbleWidth - padding, bubbleY + bubbleHeight);
    this.ctx.lineTo(bubbleX + padding, bubbleY + bubbleHeight);
    this.ctx.quadraticCurveTo(bubbleX, bubbleY + bubbleHeight, bubbleX, bubbleY + bubbleHeight - padding);
    this.ctx.lineTo(bubbleX, bubbleY + padding);
    this.ctx.quadraticCurveTo(bubbleX, bubbleY, bubbleX + padding, bubbleY);
    this.ctx.stroke();
    this.ctx.fill();
    // Draw message text, adjusting font size based on canvas width
    const fontSize = Math.floor(canvasWidth / 12); // Dynamic font size
    this.ctx.fillStyle = '#000000';
    this.ctx.font = `${fontSize}px Arial`;
    this.ctx.textAlign = 'center';

    // Split message into multiple lines if needed
    const words = message.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    const maxWidth = bubbleWidth - 40; // Padding for the bubble
    for (const word of words) {
      const testLine = currentLine + word + ' ';
      const testWidth = this.ctx.measureText(testLine).width;
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
      this.ctx.fillText(line, bubbleX + bubbleWidth / 2, textStartY + (i * lineHeight));
    });

    // Draw placeholder for sprites (still a simple square for now)
    //let tmpReferee = this.npc;
    //tmpReferee.position = new Vector2(bubbleX + 100, bubbleY + bubbleHeight + 20);
    //this.drawHeroAt(tmpReferee, tmpReferee.position);
  }


  advanceStartingStoryText(): void { 
    if (this.advanceStoryButtonText == "Start!") { 
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
     // this.hero = { name: this.chatInput.nativeElement.value, user: (this.parentRef?.user ?? new User(0, "Anonymous")) } as MetaHero;
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
  scrollToBottomOfChat() {
    const chatContent = document.getElementById("chatBox");
    if (chatContent) {
      const isUserScrolled = chatContent.scrollTop > 0 && (chatContent.scrollTop + chatContent.clientHeight < chatContent.scrollHeight);
       
      if (!isUserScrolled) {
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
