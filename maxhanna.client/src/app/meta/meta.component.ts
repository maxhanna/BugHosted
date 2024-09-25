import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { MetaHero } from '../../services/datacontracts/meta/meta-hero';
import { Vector2 } from '../../services/datacontracts/meta/vector2';
import { PseudoRandom } from '../../services/datacontracts/meta/pseudorandom';
import { User } from '../../services/datacontracts/user/user';
import { MetaService } from '../../services/meta.service';
import { MetaChat } from '../../services/datacontracts/meta/meta-chat';
import { Sprite } from '../../services/datacontracts/meta/sprite';

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

  pixelSize = 5;
  headWidth = 4 * this.pixelSize;
  headHeight = 2 * this.pixelSize;
  bodyHeight = 2 * this.pixelSize;
  legHeight = 2 * this.pixelSize;
  legWidth = 2 * this.pixelSize;
  armWidth = 1 * this.pixelSize;
  charWidth = this.headWidth + (2 * this.armWidth);
  charHeight = this.headHeight + this.bodyHeight + this.legHeight;

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

  npc = new MetaHero(0, new User(0, "Anonymous"), "Referee", 150, 150, 5, 1);
  sprites: Sprite[] = [];

  mapBoundaries?: Vector2[] = undefined;
  toLoad: { [key: string]: string } = {
    hero: "assets/metabots/herospritesheet.png",
    "gangster": "assets/metabots/gangsprite.png"
  }
  images: { [key: string]: any } = {};

  private pollingInterval: any;
  private moveInterval: any;
  joystickActive = false;
  joystickOrigin = new Vector2(0, 0);
  joystickCurrentPos = new Vector2(0, 0);
  heldDirections: string[] = [];

  async ngOnInit() {
    if (!this.parentRef?.user) {
      this.isUserComponentOpen = true;
    } else {
      this.startLoading();

      this.loadResources();

      this.start();
      this.metaService.getHero(this.parentRef?.user ?? new User(0, 'Anonymous')).then(res => {
        if (res) {
          this.sprites.push(new Sprite(res.id, this.images["hero"], new Vector2(res.coordsX, res.coordsY), 1, 1, new Vector2(32, 32), 4, 4));
          this.hero = res;
        }
        if (this.hero.id) {
          this.drawBackground(true);
          //this.drawHeroAt(this.hero, 0, 0, true);
          this.updatePlayers();
          this.pollForChanges();
          this.getMapBoundaries();
        } else {
          this.startStory();
        }
        this.stopLoading();
      });
      window.addEventListener('keydown', this.handleKeydown.bind(this));
      window.addEventListener('keyup', this.handleKeyup.bind(this));
      this.resizeCanvas();
    }
  }
  private loadResources() {
    Object.keys(this.toLoad).forEach((key: string) => {
      const img = new Image();
      img.src = this.toLoad[key];
      this.images[key] = {
        image: img,
        isLoaded: false
      };
      img.onload = () => {
        this.images[key].isLoaded = true;
      };
    });
  }

  update(timeStep: number) {
    if (this.direction === DOWN) {
      if (this.hero) { }
      this.hero.coordsY += 1;
    }
    else if (this.direction === UP) {
      this.hero.coordsY -= 1;
    }
    else if (this.direction === LEFT) {
      this.hero.coordsX -= 1;
    }
    else if (this.direction === RIGHT) {
      this.hero.coordsX += 1;
    }

    if (this.showStartingStory) {
      this.drawStoryChatBubble(this.currentDisplayedStoryMessage);
    }
    //console.log(this.direction);
  }
  render() { 
    if (!this.showStartingStory) {
      this.paintHeroesAndNpcs();
    }
  }
  mainLoop = (timestamp: number) => {
    if (!this.isRunning) return;

    let deltaTime = timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;
    this.accumulatedTime += deltaTime;

    while (this.accumulatedTime >= this.timeStep) {
      this.update(this.timeStep);
      this.accumulatedTime -= this.timeStep;
    }

    this.render();

    this.rafId = requestAnimationFrame(this.mainLoop);
  }

  start() {
    if (!this.isRunning && this.mainLoop) {
      this.isRunning = true;
      this.rafId = requestAnimationFrame(this.mainLoop);
    }
  }
  stop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }
    this.isRunning = false;
  }

  onArrowPressed(direction: string) {
    if (this.heldDirections.indexOf(direction) === -1) {
      this.heldDirections.unshift(direction);
    }
  }
  onArrowReleased(direction: string) {
    const index = this.heldDirections.indexOf(direction);
    if (index === -1) {
      return;
    }
    this.heldDirections.splice(index, 1);
  }
  get direction() {
    return this.heldDirections[0];
  }

  private updatePlayers() {
    if (this.hero) {
      this.metaService.fetchGameData(this.hero).then(res => {
        if (res) {
          this.updateOtherHeroesBasedOnFetchedData(res);
          this.updateDirtyHeroSprites();

          this.chat = res.chat.reverse();
          if (this.hero) {
            this.hero.map = res.map;
          }
          if (this.hero && this.currentMap != this.hero.map) {
            this.mapBoundaries = undefined;
            this.currentMap = this.hero.map;
            this.hero.coordsX = res.coordsX;
            this.hero.coordsY = res.coordsY;
            this.getMapBoundaries();
          }
          this.scrollToBottomOfChat();
          this.getLatestMessages();
        }
      });
    }
  }

  private updateOtherHeroesBasedOnFetchedData(res: { map: number; coordsX: number; coordsY: number; heroes: MetaHero[]; chat: MetaChat[]; }) {
    const updatedHeroes: MetaHero[] = [];
    const currentHeroesMap = new Map(this.otherHeroes.map(hero => [hero.id, hero])); // Combine map and processing

    for (const newHero of res.heroes) {
      const existingHero = currentHeroesMap.get(newHero.id);

      if (existingHero) {
        const { coordsX: newX, coordsY: newY } = newHero;
        if (existingHero.coordsX !== newX || existingHero.coordsY !== newY) {
          existingHero.coordsX = newX;
          existingHero.coordsY = newY;
          existingHero.dirty = true;
        }
        updatedHeroes.push(existingHero);
      } else {
        updatedHeroes.push(newHero); // Collect new heroes to add later
      }
    }
    this.otherHeroes = updatedHeroes;
  }


  private updateDirtyHeroSprites() {
    const spriteMap = new Map<number, Sprite>();
    for (const sprite of this.sprites) {
      spriteMap.set(sprite.objectId, sprite);
    }

    // Step 2: Process the heroes
    for (const hero of this.otherHeroes) {
      let sprite = spriteMap.get(hero.id);

      // Step 3: If no sprite exists for the hero, create and add it
      if (!sprite) {
        sprite = new Sprite(hero.id, this.images["hero"], new Vector2(hero.coordsX, hero.coordsY), 1, 1, new Vector2(32, 32), 4, 4);
        this.sprites.push(sprite);
        spriteMap.set(hero.id, sprite);
      }

      // Step 4: Update position if hero is dirty
      if (hero.dirty) {
        sprite.position.x = hero.coordsX;
        sprite.position.y = hero.coordsY;
      }
    }
  }

  ngOnDestroy() {
    clearInterval(this.pollingInterval);
    clearInterval(this.moveInterval);
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


  pollForChanges() {
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
  drawChatBubbleAt(hero: MetaHero, message: string, translatedX: number, translatedY: number) {
    if (!hero) return;
    const canvas: HTMLCanvasElement = this.gameCanvas.nativeElement;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.font = '16px Arial 700';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'white';
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 2;

      const bubbleWidth = ctx.measureText(message).width + 20; // Add padding
      const bubbleHeight = 30; // Fixed height for simplicity

      // Translate hero coordinates
      // Initial position of the bubble using translated coordinates
      const myHero = hero.id == this.hero?.id;
      let bubbleX = (myHero ? hero.coordsX : translatedX) - bubbleWidth / 2;
      let bubbleY = (myHero ? hero.coordsY : translatedY) - (this.charHeight / 2) - 10;

      // Adjust X position
      if (bubbleX < 0) {
        bubbleX = 0; // Clamp to left edge
      } else if (bubbleX + bubbleWidth > this.canvasWidth) {
        bubbleX = this.canvasWidth - bubbleWidth; // Clamp to right edge
      }

      // Adjust Y position
      if (bubbleY < 0) {
        bubbleY = 0; // Clamp to top edge
      } else if ((bubbleY - (bubbleHeight / 2)) > this.canvasHeight) {
        bubbleY = this.canvasHeight - (bubbleHeight / 2); // Clamp to bottom edge
      }

      // Draw the bubble
      ctx.beginPath();
      ctx.rect(bubbleX + 10, bubbleY, bubbleWidth, bubbleHeight);
      ctx.stroke();
      ctx.fill();

      // Draw the text inside the bubble
      ctx.fillStyle = 'black';
      ctx.fillText(message, bubbleX + 20, bubbleY + 10); // Position text inside the bubble
    }
  }

  heroRoom(ctx: CanvasRenderingContext2D) {
    const scaleFactor = 1 / (window.devicePixelRatio || 1);
    const canvasWidth = ctx.canvas.width * scaleFactor;
    const canvasHeight = ctx.canvas.height * scaleFactor;

    const offsetX = canvasWidth / 2 - (this.hero?.coordsX ?? 0);
    const offsetY = canvasHeight / 2 - (this.hero?.coordsY ?? 0);
    ctx.save(); // Save the current canvas state
    ctx.translate(offsetX, offsetY);
    // Define basic colors for the room
    const wallColor = '#E0B589'; // Light brown for walls
    const floorColor = '#A8A8A8'; // Gray for floor
    const bedColor = '#B22222'; // Dark red for the bed
    const pillowColor = '#FFFFFF'; // White for the pillow
    const rugColor = '#4682B4'; // Steel blue for the rug

    // Draw the floor (bottom section of the canvas)
    this.drawFloor(ctx, floorColor, canvasHeight, canvasWidth);

    // Draw the bed (near the top-left corner)
    const bedWidth = 80;
    const bedHeight = 40;
    const bedX = 20;
    const bedY = canvasHeight * 0.3 - bedHeight - 10; // Positioned just above the floor
    this.drawBed(ctx, bedX, bedY, bedWidth, bedHeight, bedColor, pillowColor);

    // Draw the rug (in the middle of the floor)

    this.drawRug(canvasWidth / 2 - 40 / 2, canvasHeight * 0.6, ctx, "gold");

    // Draw a desk or console (to the right of the bed)
    const deskWidth = 40;
    const deskHeight = 30;
    const deskX = bedX + bedWidth + 20;
    const deskY = bedY + bedHeight - deskHeight; // Aligned with the bed
    this.drawDesk(ctx, deskX, deskY, deskWidth, deskHeight);

    // Draw a TV next to the Xbox
    this.drawTv(canvasWidth - 20, canvasHeight - 20, ctx);

    // Draw an Xbox console in the bottom-right corner of the room
    this.drawXbox(canvasWidth - 20, canvasHeight * 0.7, ctx);

    const staircaseX = canvasWidth - 60; // Near the top-right edge of the room
    const staircaseY = 0;               // Top-right corner 
    this.drawDownstairsStaircase(ctx, staircaseX, staircaseY, '#8B4513'); // Dark brown staircase

    ctx.restore();
  }

  grassLands(ctx: CanvasRenderingContext2D) {
    const scaleFactor = 1 / (window.devicePixelRatio || 1);
    const canvasWidth = ctx.canvas.width * scaleFactor;
    const canvasHeight = ctx.canvas.height * scaleFactor;
    const offsetX = canvasWidth / 2 - (this.hero?.coordsX ?? 0);
    const offsetY = canvasHeight / 2 - (this.hero?.coordsY ?? 0);
    const randomGenerator = new PseudoRandom(12345);

    ctx.save(); // Save the current canvas state
    ctx.translate(offsetX, offsetY);

    if (this.isDayTime()) {
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }
    ctx.lineWidth = 2;
    const bladeLength = 10;
    const bladeSpacing = this.pixelSize * 1.45 * randomGenerator.next();
    ctx.strokeStyle = `rgba(0, ${100 + randomGenerator.next() * 50}, ${randomGenerator.next() * 20}, 0.5)`;

    for (let x = 0; x < canvasWidth; x += bladeSpacing) {
      for (let y = 0; y < canvasHeight; y += bladeSpacing) {
        const angle = randomGenerator.next() * Math.PI;
        const length = randomGenerator.next() * bladeLength;

        const endX = x + Math.cos(angle) * length;
        const endY = y - Math.sin(angle) * length;

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      }
    }
    const staircaseX = canvasWidth - 60; // Near the top-right edge of the room
    const staircaseY = 0;               // Top-right corner 
    this.drawDownstairsStaircase(ctx, staircaseX, staircaseY, '#8B4513'); // Dark brown staircase

    ctx.restore();
  }

  private drawBackground(forAvatarCanvas = false) {
    const ctx = forAvatarCanvas && this.heroCanvasRef ? this.heroCanvasRef.nativeElement.getContext('2d') : this.getCtx();
    if (!ctx) return;

    if (this.hero?.map == 1) {
      this.grassLands(ctx);
    } else if (this.hero?.map == 0) {
      this.heroRoom(ctx);
    }
  }
  private drawFloor(ctx: CanvasRenderingContext2D, floorColor: string, canvasHeight: number, canvasWidth: number) {
    ctx.fillStyle = floorColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }
  private drawDesk(ctx: CanvasRenderingContext2D, deskX: number, deskY: number, deskWidth: number, deskHeight: number) {
    ctx.fillStyle = '#8B4513'; // Brown for the desk
    ctx.fillRect(deskX, deskY, deskWidth, deskHeight);
  }
  private drawDownstairsStaircase(
    ctx: CanvasRenderingContext2D,
    startX: number,   // Starting X position (top-right corner)
    startY: number,   // Starting Y position 
    color: string     // Color of the staircase
  ) {
    ctx.fillStyle = color;
    const stepsDown = 5;
    const stepSize = 2 * this.pixelSize;
    const stairWidth = 10 * this.pixelSize;
    for (let i = 0; i < stepsDown; i++) {
      const stepY = startY + i * stepSize;
      ctx.fillRect(startX, stepY, stairWidth, stepSize);
      ctx.lineWidth = (this.pixelSize) - i; // Border thickness
      ctx.strokeStyle = '#000000';    // Border color (black in this case)  
      ctx.strokeRect(startX, stepY, 10 * this.pixelSize, stepSize);
    }
    // Set guard rail properties
    ctx.lineWidth = this.pixelSize; // Guard rail thickness
    ctx.strokeStyle = '#8B4513';    // Brown color for guard rails (you can customize this)

    // Draw left guard rail (static vertical line along the left side)
    ctx.beginPath();
    ctx.moveTo(startX, startY); // Top of the staircase
    ctx.lineTo(startX, startY + stepsDown * stepSize); // Bottom of the staircase
    ctx.stroke();

    // Draw right guard rail (static vertical line along the right side)
    ctx.beginPath();
    ctx.moveTo(startX + stairWidth, startY); // Top right of the staircase
    ctx.lineTo(startX + stairWidth, startY + stepsDown * stepSize); // Bottom right of the staircase
    ctx.stroke();
  }

  private drawTv(x: number, y: number, ctx: CanvasRenderingContext2D) {
    const tvWidth = 30;
    const tvHeight = 20;
    const tvX = x - tvWidth - 10;
    const tvY = y - tvHeight;

    ctx.fillStyle = '#333333'; // Dark gray for TV screen
    ctx.fillRect(tvX, tvY, tvWidth, tvHeight);

    // Draw TV antennas
    const antennaHeight = 12;
    const antennaWidth = 2;
    const antennaLeftX = tvX + 5;
    const antennaRightX = tvX + tvWidth - 5;
    const antennaY = tvY - antennaHeight;

    ctx.strokeStyle = '#000000'; // Black for antenna poles
    ctx.lineWidth = 1;

    // Left antenna
    ctx.beginPath();
    ctx.moveTo(tvX + 5, tvY); // Starting from the TV top
    ctx.lineTo(antennaLeftX, antennaY); // Diagonal to the top
    ctx.stroke();

    // Right antenna
    ctx.beginPath();
    ctx.moveTo(tvX + tvWidth - 5, tvY); // Starting from the TV top right
    ctx.lineTo(antennaRightX, antennaY); // Diagonal to the top
    ctx.stroke();
  }
  private drawXbox(x: number, y: number, ctx: CanvasRenderingContext2D) {
    const xboxWidth = 20;
    const xboxHeight = 14;
    const xboxX = x - xboxWidth; // Positioned 20px from the right edge
    const xboxY = y - xboxHeight; // Positioned on the floor, near the bottom

    ctx.fillStyle = '#000000'; // Black color for Xbox console
    ctx.fillRect(xboxX, xboxY, xboxWidth, xboxHeight);

    // Draw Xbox power button (simple green circle)
    const powerButtonX = xboxX + xboxWidth / 2;
    const powerButtonY = xboxY + xboxHeight / 4;
    const powerButtonRadius = 3;

    ctx.fillStyle = '#00FF00'; // Bright green for Xbox power button
    ctx.beginPath();
    ctx.arc(powerButtonX, powerButtonY, powerButtonRadius, 0, Math.PI * 2, false);
    ctx.fill();
  }
  private drawWallTexture(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.strokeStyle = '#D2A679'; // Slightly darker than wallColor
    ctx.lineWidth = 1;
    const tileSize = 10;
    for (let y = 0; y < height; y += tileSize) {
      for (let x = 0; x < width; x += tileSize) {
        ctx.strokeRect(x, y, tileSize, tileSize); // Draw grid-like lines for wall texture
      }
    }
  }
  private drawBed(ctx: CanvasRenderingContext2D, bedX: number, bedY: number, bedWidth: number, bedHeight: number, bedColor: string, pillowColor: string) {
    ctx.fillStyle = bedColor;
    ctx.fillRect(bedX, bedY, bedWidth, bedHeight);

    // Draw the pillow (on the bed)
    const pillowWidth = 20;
    const pillowHeight = 15;
    const pillowX = bedX + 5;
    const pillowY = bedY + 5;
    ctx.fillStyle = pillowColor;
    ctx.fillRect(pillowX, pillowY, pillowWidth, pillowHeight);
  }
  private drawRug(rugPosX: number, rugPosY: number, ctx: CanvasRenderingContext2D, rugColor: string) {
    const rugWidth = 60;
    const rugHeight = 40;
    const rugX = rugPosX;
    const rugY = rugPosY;
    ctx.fillStyle = rugColor;
    ctx.fillRect(rugX, rugY, rugWidth, rugHeight);
  }
  private drawHeroAt(hero: MetaHero, translatedX: number, translatedY: number, forAvatarCanvas = false) {
    const ctx = forAvatarCanvas && this.heroCanvasRef ? this.heroCanvasRef.nativeElement.getContext('2d') : this.getCtx();
    if (!ctx) return;

    const pixelSize = this.pixelSize;
    const halfCharWidth = this.charWidth / 2;
    const halfCharHeight = this.charHeight / 2;

    // Draw head  
    ctx.fillStyle = 'peachpuff';  // Head color
    ctx.fillRect(translatedX + this.armWidth, translatedY + this.headHeight, this.headWidth, this.headHeight);

    if (hero.id == 0) {
      // Draw whistle (1 pixel at mouth)
      ctx.fillStyle = 'gray';  // Whistle color
      ctx.fillRect(translatedX + 3.5 * pixelSize + 4, translatedY + 2 * pixelSize, 1 * pixelSize, 1 * pixelSize);

      // Draw body (black and white stripes) (4x5 pixels)
      for (let i = 0; i < (this.bodyHeight / this.pixelSize); i++) {
        // Alternate stripes
        ctx.fillStyle = i % 2 === 0 ? 'white' : 'black';
        ctx.fillRect(translatedX + 2 * pixelSize, translatedY + (3 + i) * pixelSize, 4 * pixelSize, 1 * pixelSize);
      }

      // Draw hat (1x2 pixels)
      ctx.fillStyle = 'black';  // Hat color
      ctx.fillRect(translatedX + 2 * pixelSize, translatedY - 1 * pixelSize, 3 * pixelSize, 1 * pixelSize);  // Cap 
    } else {
      // Draw body (4x5 pixels)
      ctx.fillStyle = 'blue';  // Body color
      ctx.fillRect(translatedX + this.armWidth, translatedY + 4 * pixelSize, this.headWidth, this.bodyHeight);

      // Draw mouth (2x1 pixels)
      ctx.fillStyle = 'black';  // Mouth color
      ctx.fillRect(translatedX + this.armWidth + pixelSize, translatedY + this.headHeight + (3 * pixelSize / 2), 2 * pixelSize, pixelSize / 2);
    }

    // Draw eyes (1x1 pixels each)
    ctx.fillStyle = 'black';  // Eye color
    ctx.fillRect(translatedX + this.armWidth + pixelSize, translatedY + this.headHeight, pixelSize, pixelSize);  // Left eye
    ctx.fillRect(translatedX + this.armWidth + 3 * pixelSize, translatedY + this.headHeight, pixelSize, pixelSize);  // Right eye

    // Draw legs (4x2 pixels)
    ctx.fillStyle = 'black';  // Leg color
    ctx.fillRect(translatedX + this.armWidth, translatedY + this.headHeight + this.bodyHeight + this.legHeight, this.legWidth, this.legHeight);  // Left leg
    ctx.fillRect(translatedX + this.armWidth + this.legWidth, translatedY + this.headHeight + this.bodyHeight + this.legHeight, this.legWidth, this.legHeight);  // Right leg

    // Draw arms (2x3 pixels each)
    ctx.fillStyle = 'peachpuff';  // Arm color
    ctx.fillRect(translatedX, translatedY + (2 * this.headHeight), this.armWidth, 3 * pixelSize);  // Left arm
    ctx.fillRect(translatedX + this.charWidth - this.armWidth, translatedY + (2 * this.headHeight), this.armWidth, 3 * pixelSize);  // Right arm

    // Draw hero name below the character
    this.drawNameLabelAt(hero, translatedX, translatedY);
  }

  private drawNameLabelAt(hero: MetaHero, translatedX: number, translatedY: number) {
    const ctx = this.getCtx();
    if (!ctx) return;

    const text = hero.name;
    if (text) {
      const padding = 4; // Padding around the text
      const fontSize = 16; // Set font size
      const fontWeight = 700; // Font weight
      ctx.font = `${fontSize}px Arial ${fontWeight}`;
      const textWidth = ctx.measureText(text).width;
      const textHeight = fontSize; // Use font size as an approximation of text height
      const backgroundX = translatedX - (textWidth / 2) + (this.charWidth / 2) - padding;
      const backgroundY = translatedY + this.charHeight + (textHeight / 2) + (padding / 2) + this.pixelSize;
      const backgroundWidth = textWidth + (2 * padding);
      const backgroundHeight = textHeight + (2 * padding); // Add pa

      // Draw the semi-transparent black background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; // Semi-transparent black
      ctx.fillRect(backgroundX, backgroundY, backgroundWidth, backgroundHeight);
      ctx.textAlign = "left";
      // Draw the text on top of the background
      ctx.fillStyle = hero.id === 0 ? 'red' : "chartreuse";
      ctx.fillText(text, backgroundX + padding, backgroundY + textHeight);
    }
  }


  handleKeydown(event: KeyboardEvent) {
    const key = event.key;
    switch (key) {
      case 'ArrowUp':
      case 'w':
        if (!this.chatInput || (this.chatInput && this.chatInput.nativeElement && document.activeElement != this.chatInput.nativeElement)) {
          //this.moveUp();
          this.onArrowPressed(UP);
        }
        break;
      case 'ArrowDown':
      case 's':
        if (!this.chatInput || (this.chatInput && this.chatInput.nativeElement && document.activeElement != this.chatInput.nativeElement)) {
          /// this.moveDown();
          this.onArrowPressed(DOWN);
        }
        break;
      case 'ArrowLeft':
      case 'a':
        if (!this.chatInput || (this.chatInput && this.chatInput.nativeElement && document.activeElement != this.chatInput.nativeElement)) {
          //this.moveLeft();
          this.onArrowPressed(LEFT);
        }
        break;
      case 'ArrowRight':
      case 'd':
        if (!this.chatInput || (this.chatInput && this.chatInput.nativeElement && document.activeElement != this.chatInput.nativeElement)) {
          // this.moveRight();
          this.onArrowPressed(RIGHT);
        }
        break;
      case 'Enter':
        if (document.activeElement === this.chatInput.nativeElement) {
          if (this.showingNarrationText) {
            this.advanceStartingStoryText();
          }
          this.chatInput.nativeElement.blur();
        } else {
          this.focusOnChatInput();
        }
        break;
    }
    console.log(this.mapBoundaries);
    console.log(this.hero);
  }

  handleKeyup(event: KeyboardEvent) {
    const key = event.key;
    switch (key) {
      case 'ArrowUp':
      case 'w':
        if (!this.chatInput || (this.chatInput && this.chatInput.nativeElement && document.activeElement != this.chatInput.nativeElement)) {
          this.onArrowReleased(UP);
        }
        break;
      case 'ArrowDown':
      case 's':
        if (!this.chatInput || (this.chatInput && this.chatInput.nativeElement && document.activeElement != this.chatInput.nativeElement)) {
          this.onArrowReleased(DOWN);
        }
        break;
      case 'ArrowLeft':
      case 'a':
        if (!this.chatInput || (this.chatInput && this.chatInput.nativeElement && document.activeElement != this.chatInput.nativeElement)) {
          this.onArrowReleased(LEFT);
        }
        break;
      case 'ArrowRight':
      case 'd':
        if (!this.chatInput || (this.chatInput && this.chatInput.nativeElement && document.activeElement != this.chatInput.nativeElement)) {
          this.onArrowReleased(RIGHT);
        }
        break;
    }
  }

  moveUp() {
    if (!this.hero) return;
    const newCoordsY = this.hero.coordsY - (this.hero.speed ?? 0);
    if (!this.mapBoundaries?.some(b => b.x == this.hero?.coordsX && b.y == newCoordsY)) {
      this.hero.coordsY = newCoordsY;
    }
  }
  moveDown() {
    if (!this.hero) return;
    const newCoordsY = this.hero.coordsY + (this.hero.speed ?? 0);
    if (!this.mapBoundaries?.some(b => b.x == this.hero?.coordsX && b.y == newCoordsY)) {
      this.hero.coordsY = newCoordsY;
    }
  }

  moveLeft() {
    if (!this.hero) return;
    const projectedCoords = (this.hero.coordsX ?? 0) - (this.hero.speed ?? 0);
    // Update the hero's position if it's within bounds
    if (!this.mapBoundaries?.some(b => b.x == projectedCoords && b.y == this.hero?.coordsY)) {
      this.hero.coordsX = projectedCoords;
    }
  }

  moveRight() {
    if (!this.hero) return;
    const projectedCoords = (this.hero.coordsX ?? 0) + (this.hero.speed ?? 0);
    if (!this.mapBoundaries?.some(b => b.x == projectedCoords && b.y == this.hero?.coordsY)) {
      this.hero.coordsX = projectedCoords;
    }
  }

  startJoystick(event: TouchEvent | MouseEvent): void {
    event.preventDefault();
    this.joystickActive = true;

    // For touch events
    if (event instanceof TouchEvent) {
      const touch = event.touches[0];
      this.joystickOrigin = {
        x: touch.clientX,
        y: touch.clientY
      };
    }
    // For mouse events
    else if (event instanceof MouseEvent) {
      this.joystickOrigin = {
        x: event.clientX,
        y: event.clientY
      };
    }


    // Start continuous movement
    this.startContinuousMovement();
  }

  moveJoystick(event: Event) {
    if (!this.joystickActive) return;
    let touch = undefined;

    if ((event as TouchEvent).touches) {
      touch = (event as TouchEvent).touches[0];
    }
    const mousePos = (event as MouseEvent);
    const deltaX = (touch?.clientX ?? mousePos.clientX) - (this.joystickOrigin.x);
    const deltaY = (touch?.clientY ?? mousePos.clientY) - (this.joystickOrigin.y);

    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const angle = Math.atan2(deltaY, deltaX);

    const maxDistance = 40;
    const limitedDistance = Math.min(distance, maxDistance);
    const newX = Math.cos(angle) * limitedDistance;
    const newY = Math.sin(angle) * limitedDistance;

    // Move joystick visually
    const joystickElement = document.querySelector('.joystick') as HTMLElement;
    joystickElement.style.transform = `translate(${newX}px, ${newY}px)`;

    // Update current joystick position for continuous movement logic
    this.joystickCurrentPos = { x: newX, y: newY };
  }

  stopJoystick() {
    this.joystickActive = false;

    // Stop continuous movement
    this.stopContinuousMovement();

    // Reset joystick position
    const joystickElement = document.querySelector('.joystick') as HTMLElement;
    joystickElement.style.transform = 'translate(0px, 0px)';
  }

  startContinuousMovement() {
    this.moveInterval = setInterval(() => {
      this.moveHeroBasedOnJoystick();
    }, 1000 / 35);  // Adjust the interval speed as needed
  }

  stopContinuousMovement() {
    if (this.moveInterval) {
      clearInterval(this.moveInterval);
      this.moveInterval = null;
      this.onArrowReleased(UP);
      this.onArrowReleased(DOWN);
      this.onArrowReleased(LEFT);
      this.onArrowReleased(RIGHT);
    }
  }

  moveHeroBasedOnJoystick() {
    const threshold = 10;
    if (Math.abs(this.joystickCurrentPos.x) > threshold || Math.abs(this.joystickCurrentPos.y) > threshold) {

      if (Math.abs(this.joystickCurrentPos.x) > Math.abs(this.joystickCurrentPos.y)) {
        // Moving horizontally
        if (this.joystickCurrentPos.x > 0) {
          //this.moveRight(); 
          this.onArrowPressed(RIGHT);
          this.onArrowReleased(LEFT);
          this.onArrowReleased(UP);
          this.onArrowReleased(DOWN);
        } else {
          // this.moveLeft();
          this.onArrowPressed(LEFT);
          this.onArrowReleased(RIGHT);
          this.onArrowReleased(UP);
          this.onArrowReleased(DOWN);
        }
      } else {
        // Moving vertically
        if (this.joystickCurrentPos.y > 0) {
          //this.moveDown(); 
          this.onArrowPressed(DOWN);
          this.onArrowReleased(LEFT);
          this.onArrowReleased(UP);
          this.onArrowReleased(RIGHT);
        } else {
          //this.moveUp(); 
          this.onArrowPressed(UP);
          this.onArrowReleased(LEFT);
          this.onArrowReleased(RIGHT);
          this.onArrowReleased(DOWN);
        }
      }
    }
  }
  paintHeroesAndNpcs() {
    const ctx = this.getCtx();
    if (ctx) {
      // Clear the canvas
      ctx.clearRect(0, 0, this.gameCanvas.nativeElement.width, this.gameCanvas.nativeElement.height);
      this.drawBackground(); 
      const heroSprite = this.sprites.find(x => x.objectId === this.hero.id);
      if (heroSprite) {
        heroSprite.position.x = this.hero.coordsX;
        heroSprite.position.y = this.hero.coordsY;
      } 
      const sortedSprites = [...this.sprites].sort((a, b) => a.position.y - b.position.y); 
      for (const sprite of sortedSprites) { 
        sprite.drawImage(ctx, sprite.position.x, sprite.position.y); 
      }
    } else {
      console.log("no ctx!");
    }
  }


  private translateCoordinates(x: number, y: number) {
    const canvas: HTMLCanvasElement = this.gameCanvas.nativeElement;
    const ctx = canvas.getContext('2d');

    // Check if context exists
    if (!ctx || !this.hero) return { x, y };

    // Get the canvas dimensions and hero position
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;

    // Calculate the translation to center the hero on the canvas
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;

    // Translate the coordinates so the hero appears in the center
    const translatedX = x - this.hero.coordsX + centerX;
    const translatedY = y - this.hero.coordsY + centerY;

    // Return the new translated coordinates
    return { x: translatedX, y: translatedY };
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
    let tmpReferee = this.npc;
    tmpReferee.coordsX = bubbleX + 100;
    tmpReferee.coordsY = bubbleY + bubbleHeight + 20;
    this.drawHeroAt(tmpReferee, tmpReferee.coordsX, tmpReferee.coordsY);
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
        console.log("switched");
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
        this.hero.coordsX = 105;
        this.hero.coordsY = 60;
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
  private getCtx() {
    const canvas: HTMLCanvasElement = this.gameCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    return ctx;
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
  getMapBoundaries() {
    this.mapBoundaries = [];
    if (this.hero?.map == 0) {
      //map wall
      for (let x = 0; x < 31; x++) {
        this.mapBoundaries.push(new Vector2(80 + (x * this.pixelSize), 40));
        this.mapBoundaries.push(new Vector2(80 + (x * this.pixelSize), 145));
      }
      for (let y = 0; y < 21; y++) {
        this.mapBoundaries.push(new Vector2(75, 45 + (y * this.pixelSize)));
        this.mapBoundaries.push(new Vector2(230, 45 + (y * this.pixelSize)));
      }

      //staircase
      for (let x = 0; x < 4; x++) {
        //left guardrail
        this.mapBoundaries.push(new Vector2(200, 45 + (x * this.pixelSize)));
        this.mapBoundaries.push(new Vector2(205, 45 + (x * this.pixelSize)));
        //right guardrail
        this.mapBoundaries.push(new Vector2(225, 45 + (x * this.pixelSize)));
      }
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

export const gridCells = (n: number) => {
  return n * 20;
}
export const UP = "UP";
export const DOWN = "DOWN";
export const LEFT = "LEFT";
export const RIGHT = "RIGHT";
