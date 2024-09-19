import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { MetaHero } from '../../services/datacontracts/meta/meta-hero';
import { User } from '../../services/datacontracts/user/user';
import { MetaService } from '../../services/meta.service';
import { MetaChat } from '../../services/datacontracts/meta/meta-chat';

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
  }

  @HostListener('window:resize')
  onResize() {
    this.resizeCanvas();
  }

  pixelSize = 5;
  charWidth = 8 * this.pixelSize;
  charHeight = 12 * this.pixelSize;

  hero?: MetaHero = undefined;
  otherPlayers: MetaHero[] = [];
  chat: MetaChat[] = [];
  latestMessagesMap = new Map<number, MetaChat>();
  showingNarrationText = false;
  advanceStoryButtonText = "Next";
  showStartingStory = false;
  showNameInput: boolean = false;
  startingStoryMessages: string[] = [
    "Welcome to the world of Meta-Bots!",
    "I, Mister Referee shall act as referee",
    "...for all the fights along your journey!",
    "But first, what shall we call you?",
  ];
  startingConfirmNameStoryMessages: string[] = [
    "Ah, ",
    "Your grand adventure awaits you!",
  ];
  startingStoryCurrentMessage: string = this.startingStoryMessages[0];
  startingStoryMessageIndex: number = 0;
  startingConfirmNameStoryCurrentMessage: string = this.startingConfirmNameStoryMessages[0];
  startingConfirmNameStoryMessageIndex: number = 0;

  npc: MetaHero = {
    id: 0,
    coordsX: 150,
    coordsY: 150, 
    speed: 5,
    name: "Referee",
  };

  private pollingInterval: any;
  private moveInterval: any;
  joystickActive = false;
  joystickOrigin = { x: 0, y: 0 };
  joystickCurrentPos = { x: 0, y: 0 };


  async ngOnInit() {
    this.startLoading();
    this.metaService.getHero(this.parentRef?.user ?? new User(0, 'Anonymous')).then(res => {
      if (res) {
        this.hero = res;
      }
      if (this.hero) {
        this.drawBackground(true);
        this.drawHero(this.hero, true); 
        this.updatePlayers();
        this.pollForChanges();
      } else {
        this.startStory();
      }
      this.stopLoading();
    });
    window.addEventListener('keydown', this.handleKeydown.bind(this));
    this.resizeCanvas();
  }

  private updatePlayers() {
    if (this.hero) {
      this.metaService.fetchGameData(this.hero).then(res => {
        if (res) {
          this.otherPlayers = res.heroes;
          this.chat = res.chat;
          this.chat = this.chat.reverse();
          this.scrollToBottomOfChat();
          this.getLatestMessages(); 
          this.paintHeroesAndNpcs();
        }
      });
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
    const canvasWidth = window.innerWidth - 100;
    const canvasHeight = window.innerHeight * 0.8;

    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;

    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * devicePixelRatio;
    canvas.height = canvasHeight * devicePixelRatio;
    if (ctx) {
      ctx.scale(devicePixelRatio, devicePixelRatio);
      this.paintHeroesAndNpcs();
    }
  }


  pollForChanges() {
    clearInterval(this.pollingInterval);
    this.pollingInterval = setInterval(async () => {
      this.updatePlayers();
    }, 5000);
  }

  handleInputKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      if (this.hero) {
        this.metaService.chat(this.hero, this.chatInput.nativeElement.value);
        this.chatInput.nativeElement.value = "";
      }
      event.preventDefault(); // Prevent form submission if inside a form
    }
  }

  drawChatBubble(hero: MetaHero, message: string) {
    if (!hero) return;
    const canvas: HTMLCanvasElement = this.gameCanvas.nativeElement;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.font = '16px Arial';
      ctx.textBaseline = 'top';

      // Draw chat bubble above the hero
      ctx.fillStyle = 'white';
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 2;

      const bubbleWidth = ctx.measureText(message).width + 20; // Add padding
      const bubbleHeight = 30; // Fixed height for simplicity
      let bubbleX = hero.coordsX - bubbleWidth / 2;
      let bubbleY = hero.coordsY - this.charHeight - 10;
       

      ctx.beginPath();
      ctx.rect(bubbleX, bubbleY, bubbleWidth, bubbleHeight);
      ctx.stroke();
      ctx.fill();

      ctx.fillStyle = 'black';
      ctx.fillText(message, bubbleX + (ctx.measureText(message).width / 2) + 10, bubbleY + 10); // Position text inside the bubble

    }
  }
  private drawBackground(forAvatarCanvas = false) {
    const ctx = forAvatarCanvas ? this.heroCanvasRef.nativeElement.getContext('2d') : this.getCtx();
    if (!ctx) return;

    // Define canvas size
    const canvasWidth = parseInt(this.gameCanvas.nativeElement.style.width) * 2;
    const canvasHeight = parseInt(this.gameCanvas.nativeElement.style.height);
     
    const grassColor1 = '#9ACD32';  // Muted light green color for grass
    const grassColor2 = '#6B8E23';  // Muted darker green color for grass

    // Create a vertical gradient for a more realistic grass look
    const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
    gradient.addColorStop(0, grassColor1);  // Top of the canvas
    gradient.addColorStop(1, grassColor2);  // Bottom of the canvas

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Pseudo-random number generator with a fixed seed
    function pseudoRandom(seed: number): () => number {
      let state = seed;
      return function () {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
      };
    }

    const rng = pseudoRandom(12345); // Fixed seed for consistent results
     
    ctx.strokeStyle = 'rgba(0, 128, 0, 0.5)';  
    ctx.lineWidth = 2; 
     
    const bladeCount = canvasWidth * canvasHeight / 50;  
    const bladeLength = 10; 
    const spacing = 5;  
    for (let i = 0; i < bladeCount; i++) {
      const x = (Math.floor(i / (canvasHeight / spacing)) * spacing) % canvasWidth; // Consistent x position
      const y = (i % (canvasHeight / spacing)) * spacing; // Consistent y position

      const angle = rng() * Math.PI; // Random angle for blade direction
      const length = rng() * bladeLength; // Random length for each blade

      // Calculate end point of the grass blade
      const endX = x + Math.cos(angle) * length;
      const endY = y - Math.sin(angle) * length;

      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }
  }



  private drawHero(hero: MetaHero, forAvatarCanvas = false) {
    const ctx = forAvatarCanvas ? this.heroCanvasRef.nativeElement.getContext('2d') : this.getCtx();
    if (!ctx) return;
     
    const startX = forAvatarCanvas ? 0 : hero.coordsX - this.charWidth / 2;  // Center the character horizontally
    const startY = forAvatarCanvas ? 0 : hero.coordsY - this.charHeight / 2; // Center the character vertically
    const pixelSize = this.pixelSize;

    // Draw head (4x4 pixels with details)
    ctx.fillStyle = 'peachpuff';  // Head color
    ctx.fillRect(startX + 2 * pixelSize, startY, 4 * pixelSize, 4 * pixelSize);

    // Draw eyes (1x1 pixels each)
    ctx.fillStyle = 'black';  // Eye color
    ctx.fillRect(startX + 3 * pixelSize, startY + pixelSize, pixelSize, pixelSize);  // Left eye
    ctx.fillRect(startX + 5 * pixelSize, startY + pixelSize, pixelSize, pixelSize);  // Right eye

    // Draw mouth (2x1 pixels)
    ctx.fillRect(startX + 3 * pixelSize, startY + (5 * pixelSize / 2), 2 * pixelSize, pixelSize / 2);

    // Draw body (4x5 pixels)
    ctx.fillStyle = 'blue';  // Body color
    ctx.fillRect(startX + 2 * pixelSize, startY + 3 * pixelSize, 4 * pixelSize, 5 * pixelSize);

    // Draw legs (4x2 pixels)
    ctx.fillStyle = 'black';  // Leg color
    ctx.fillRect(startX + 2 * pixelSize, startY + 8 * pixelSize, 2 * pixelSize, 2 * pixelSize);  // Left leg
    ctx.fillRect(startX + 4 * pixelSize, startY + 8 * pixelSize, 2 * pixelSize, 2 * pixelSize);  // Right leg

    // Draw arms (2x3 pixels each)
    ctx.fillStyle = 'peachpuff';  // Arm color
    ctx.fillRect(startX, startY + 4 * pixelSize, 2 * pixelSize, 3 * pixelSize);  // Left arm
    ctx.fillRect(startX + 6 * pixelSize, startY + 4 * pixelSize, 2 * pixelSize, 3 * pixelSize);  // Right arm

    // Draw hero name below the character
    this.drawNameLabel(hero); 
  }

  private drawNpc(npc?: MetaHero) {
    const ctx = this.getCtx();
    if (!ctx) return;

    const pixelSize = this.pixelSize; 

    const startX = npc ? npc.coordsX : this.npc.coordsX - this.charWidth / 2;  // Center horizontally
    const startY = npc ? npc.coordsY : this.npc.coordsY - this.charHeight / 2; // Center vertically

    // Draw head (3x3 pixels)
    ctx.fillStyle = 'peachpuff';  // Skin color
    ctx.fillRect(startX + 2 * pixelSize, startY, 3 * pixelSize, 3 * pixelSize);

    // Draw whistle (1 pixel at mouth)
    ctx.fillStyle = 'gray';  // Whistle color
    ctx.fillRect(startX + 3 * pixelSize, startY + 1 * pixelSize, 1 * pixelSize, 1 * pixelSize);

    // Draw body (black and white stripes) (4x5 pixels)
    for (let i = 0; i < 5; i++) {
      // Alternate stripes
      ctx.fillStyle = i % 2 === 0 ? 'white' : 'black';
      ctx.fillRect(startX + 2 * pixelSize, startY + (3 + i) * pixelSize, 4 * pixelSize, 1 * pixelSize);
    }

    // Draw legs (2x2 pixels each)
    ctx.fillStyle = 'black';  // Leg color
    ctx.fillRect(startX + 2 * pixelSize, startY + 8 * pixelSize, 2 * pixelSize, 2 * pixelSize);  // Left leg
    ctx.fillRect(startX + 4 * pixelSize, startY + 8 * pixelSize, 2 * pixelSize, 2 * pixelSize);  // Right leg

    // Draw arms (1x3 pixels each)
    ctx.fillStyle = 'peachpuff';  // Arm color (skin)
    ctx.fillRect(startX + 1 * pixelSize, startY + 4 * pixelSize, 1 * pixelSize, 3 * pixelSize);  // Left arm
    ctx.fillRect(startX + 6 * pixelSize, startY + 4 * pixelSize, 1 * pixelSize, 3 * pixelSize);  // Right arm

    // Draw hat (1x2 pixels)
    ctx.fillStyle = 'black';  // Hat color
    ctx.fillRect(startX + 2 * pixelSize, startY - 1 * pixelSize, 3 * pixelSize, 1 * pixelSize);  // Cap
     
    // Set up the text properties
    this.drawNameLabel(npc ? npc : this.npc);
  }


  private drawNameLabel(hero: MetaHero) { 
    const ctx = this.getCtx();
    if (!ctx) return;
     
    const text = hero.name;
    if (text) { 
      const textWidth = ctx.measureText(text).width;
      const textHeight = 12; 
       
      const padding = 4; // Padding around the text
      const backgroundX = hero.coordsX - (textWidth / 2) - padding;
      const backgroundY = hero.coordsY + (this.charHeight / 2) - (textHeight / 2) - (padding / 2);
      const backgroundWidth = textWidth + 2 * padding;
      const backgroundHeight = textHeight + 2 * padding;

      // Draw the semi-transparent black background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; // Semi-transparent black
      ctx.fillRect(backgroundX, backgroundY, backgroundWidth, backgroundHeight);

      // Draw the text on top of the background
      ctx.fillStyle = hero.id == 0 ? 'red' : "chartreuse";
      ctx.textAlign = 'center';
      ctx.font = '700 12px monospace';
      ctx.fillText(text, hero.coordsX, hero.coordsY + (this.charHeight / 2) - 3);
    } 
  }

  handleKeydown(event: KeyboardEvent) {
    const key = event.key;
    switch (key) {
      case 'ArrowUp':
      case 'w':
        if (this.hero) {
          this.hero.coordsY -= this.hero.speed;
          this.paintHeroesAndNpcs();
        }
        break;
      case 'ArrowDown':
      case 's':
        if (this.hero) {
          this.hero.coordsY += this.hero.speed;
          this.paintHeroesAndNpcs();
        }
        break;
      case 'ArrowLeft':
      case 'a':
        if (this.hero) {
          this.hero.coordsX -= this.hero.speed;
          this.paintHeroesAndNpcs();
        }
        break;
      case 'ArrowRight':
      case 'd':
        if (this.hero) {
          this.hero.coordsX += this.hero.speed;
          this.paintHeroesAndNpcs();
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
  }

  moveUp() {
    if (this.hero) {
      this.hero.coordsY -= this.hero.speed;
      this.paintHeroesAndNpcs();
    }
  }

  moveDown() {
    if (this.hero) {
      this.hero.coordsY += this.hero.speed;
      this.paintHeroesAndNpcs();
    }
  }

  moveLeft() {
    if (this.hero) {
      this.hero.coordsX -= this.hero.speed;
      this.paintHeroesAndNpcs();
    }
  }

  moveRight() {
    if (this.hero) {
      this.hero.coordsX += this.hero.speed;
      this.paintHeroesAndNpcs();
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
    }, 100);  // Adjust the interval speed as needed
  }

  stopContinuousMovement() {
    if (this.moveInterval) {
      clearInterval(this.moveInterval);
      this.moveInterval = null;
    }
  }

  moveHeroBasedOnJoystick() {
    const threshold = 10;
    if (Math.abs(this.joystickCurrentPos.x) > threshold || Math.abs(this.joystickCurrentPos.y) > threshold) {

      if (Math.abs(this.joystickCurrentPos.x) > Math.abs(this.joystickCurrentPos.y)) {
        // Moving horizontally
        if (this.joystickCurrentPos.x > 0) {
          this.moveRight();
        } else {
          this.moveLeft();
        }
      } else {
        // Moving vertically
        if (this.joystickCurrentPos.y > 0) {
          this.moveDown();
        } else {
          this.moveUp();
        }
      }
    }
    this.paintHeroesAndNpcs();
  }
  paintHeroesAndNpcs() {
    const ctx = this.getCtx(); 
    if (ctx) {
      ctx.clearRect(0, 0, this.gameCanvas.nativeElement.width, this.gameCanvas.nativeElement.height);
      if (this.hero) {
        this.drawBackground();
        this.drawHero(this.hero);
        const existingMessage = this.latestMessagesMap.get(this.hero.id);
        if (existingMessage) {
          this.drawChatBubble(this.hero, existingMessage.content ?? "");
        } 
        if (this.otherPlayers) {
          for (let x = 0; x < this.otherPlayers.length; x++) {
            this.drawHero(this.otherPlayers[x]);
            const existingMessage = this.latestMessagesMap.get(this.otherPlayers[x].id);
            if (existingMessage) { 
              this.drawChatBubble(this.otherPlayers[x], existingMessage.content ?? "");
            }
          }
        }
      }
      this.drawNpc(); 
    } else {
      console.log("no ctx!");
    }
  }
  startStory() {
    this.showStartingStory = true;
    this.showingNarrationText = true;
    this.drawStoryChatBubble(this.startingStoryCurrentMessage);
  }
  drawStoryChatBubble(message: string) {
    const ctx = this.getCtx();
    if (!ctx) return;

    const canvasWidth = parseInt(this.gameCanvas.nativeElement.style.width);
    const canvasHeight = parseInt(this.gameCanvas.nativeElement.style.height);

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Define bubble dimensions based on canvas size
    const bubbleX = canvasWidth * 0.05;
    const bubbleY = canvasHeight * 0.05;
    const bubbleWidth = canvasWidth * 0.9;
    const bubbleHeight = canvasHeight * 0.3;

    // Draw bubble
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(bubbleX + 20, bubbleY);
    ctx.lineTo(bubbleX + bubbleWidth - 20, bubbleY);
    ctx.quadraticCurveTo(bubbleX + bubbleWidth, bubbleY, bubbleX + bubbleWidth, bubbleY + 20);
    ctx.lineTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight - 20);
    ctx.quadraticCurveTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight, bubbleX + bubbleWidth - 20, bubbleY + bubbleHeight);
    ctx.lineTo(bubbleX + 20, bubbleY + bubbleHeight);
    ctx.quadraticCurveTo(bubbleX, bubbleY + bubbleHeight, bubbleX, bubbleY + bubbleHeight - 20);
    ctx.lineTo(bubbleX, bubbleY + 20);
    ctx.quadraticCurveTo(bubbleX, bubbleY, bubbleX + 20, bubbleY);
    ctx.stroke();
    ctx.fill();

    // Draw message text, adjusting font size based on canvas width
    const fontSize = Math.floor(canvasWidth / 20); // Dynamic font size
    ctx.fillStyle = '#000000';
    ctx.font = `2rem Arial`;
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
    lines.forEach((line, i) => {
      ctx.fillText(line, bubbleX + bubbleWidth / 2, bubbleY + 50 + (i * lineHeight));
    });

    // Draw placeholder for sprites (still a simple square for now)
    let tmpReferee = this.npc;
    tmpReferee.coordsX = bubbleX + 100;
    tmpReferee.coordsY = bubbleY + bubbleHeight + 20;
    this.drawNpc(tmpReferee);
  }


  advanceStartingStoryText(): void {
    if (this.advanceStoryButtonText == "Start!") {
      this.showingNarrationText = false;
      this.showStartingStory = false;
      if (this.hero?.name) {
        this.metaService.createHero(this.parentRef?.user ?? new User(0, 'Anonymous'), this.hero.name).then(res => {
          this.hero = res;
          this.paintHeroesAndNpcs();
          this.pollForChanges();
        });
      }
    }

    if (this.showNameInput && this.chatInput && this.chatInput.nativeElement.value.trim() == "") {
      return this.focusOnChatInput();
    } else if (this.showNameInput && this.chatInput && this.chatInput.nativeElement.value.trim().length > 2) {
      this.hero = { name: this.chatInput.nativeElement.value, user: (this.parentRef?.user ?? new User(0, "Anonymous")) } as MetaHero;
      this.startingConfirmNameStoryMessages[0] = this.startingConfirmNameStoryMessages[0] + `${this.hero.name} is it?`;
      this.showNameInput = false;
    }

    if (this.hero?.name) {
      if (this.startingConfirmNameStoryMessageIndex < this.startingConfirmNameStoryMessages.length) {
        this.startingConfirmNameStoryCurrentMessage = this.startingConfirmNameStoryMessages[this.startingConfirmNameStoryMessageIndex];
        this.startingConfirmNameStoryMessageIndex++;
        this.drawStoryChatBubble(this.startingConfirmNameStoryCurrentMessage); // Redraw the chat bubble with the new message
      }
      if (this.startingConfirmNameStoryMessageIndex === this.startingConfirmNameStoryMessages.length) {
        this.advanceStoryButtonText = "Start!";
      }
    } else {
      this.startingStoryMessageIndex++;
      if (this.startingStoryMessageIndex < this.startingStoryMessages.length) {
        this.startingStoryCurrentMessage = this.startingStoryMessages[this.startingStoryMessageIndex];
        this.drawStoryChatBubble(this.startingStoryCurrentMessage); // Redraw the chat bubble with the new message
      } else if (this.startingStoryMessageIndex === this.startingStoryMessages.length) {
        this.showNameInput = true;
        this.promptForName();
        this.focusOnChatInput();
      }
    }
  }

  private getLatestMessages() {
    this.latestMessagesMap = new Map<number, MetaChat>();
     
    this.chat.forEach((message: MetaChat) => {
      const existingMessage = this.latestMessagesMap.get(message.hero.id);

      if (!existingMessage ||
        (message && message.timestamp
          && existingMessage && existingMessage.timestamp
          && new Date(message.timestamp) > new Date(existingMessage.timestamp))) {
        this.latestMessagesMap.set(message.hero.id, message);
      }
    });
  }

  promptForName(): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    this.showNameInput = true;
    const namePrompt = "Please enter your name:";
    this.drawStoryChatBubble(namePrompt);
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
}
