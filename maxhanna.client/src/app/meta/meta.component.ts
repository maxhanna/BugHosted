import { AfterViewInit, Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { MetaHero } from '../../services/datacontracts/meta/meta-hero';
import { User } from '../../services/datacontracts/user/user';
import { MetaService } from '../../services/meta.service';

@Component({
  selector: 'app-meta',
  templateUrl: './meta.component.html',
  styleUrls: ['./meta.component.css']
})
export class MetaComponent extends ChildComponent implements OnInit, AfterViewInit {
  @ViewChild('gameCanvas', { static: true }) gameCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chatInput') chatInput!: ElementRef<HTMLInputElement>;
  @ViewChild('componentMain', { static: true }) componentMain!: ElementRef<HTMLDivElement>;

  constructor(private metaService: MetaService) {
    super();
  }

  hero?: MetaHero = undefined;
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

  npc = {
    coordsX: 150,
    coordsY: 150,
    radius: 10,
    speed: 5
  };

  private moveRightInterval: any;
  private moveLeftInterval: any;
  private moveUpInterval: any;
  private moveDownInterval: any;

  async ngOnInit() {
    this.metaService.getHero(this.parentRef?.user ?? new User(0, 'Anonymous')).then(res => {
      if (res && res.MetaHero) {
        this.hero = res.MetaHero;
      } else {
        this.startStory();
      }
    });
    window.addEventListener('keydown', this.handleKeydown.bind(this));
    this.resizeCanvas();
  }

  ngAfterViewInit() {
    this.paintHero();

    // Add keydown event listener to the input field
    if (this.chatInput) {
      this.chatInput.nativeElement.addEventListener('keydown', this.handleInputKeydown.bind(this));
    }
  }

  @HostListener('window:resize')
  onResize() {
    this.resizeCanvas();
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
      this.paintHero();
    }
  }

  handleInputKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      this.drawChatBubble();
      event.preventDefault(); // Prevent form submission if inside a form
    }
  }
  drawChatBubble() {
    console.log("draw chat bubble");
    if (!this.hero) return;
    const canvas: HTMLCanvasElement = this.gameCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    const inputField = this.chatInput.nativeElement;
    const message = inputField.value;

    if (ctx && message) {
      ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas before redrawing
      console.log("canvas cleared");

      // Set font for text
      ctx.font = '16px Arial';
      ctx.textBaseline = 'top'; // Ensure proper text baseline

      // Draw hero
      this.drawHero(ctx, this.hero);
      this.drawNpc(ctx);

      // Draw chat bubble above the hero
      ctx.fillStyle = 'white';
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 2;

      const bubbleWidth = ctx.measureText(message).width + 20; // Add padding
      const bubbleHeight = 30; // Fixed height for simplicity
      let bubbleX = this.hero.coordsX - bubbleWidth / 2;
      let bubbleY = this.hero.coordsY - this.npc.radius - bubbleHeight - 10; // Position above the hero
      console.log(bubbleX);
      console.log(bubbleY);

      // Ensure the bubble is within the canvas boundaries
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;

      if (bubbleX < 0) bubbleX = 0;
      if (bubbleY < 0) bubbleY = 0;
      if (bubbleX + bubbleWidth > canvasWidth) bubbleX = canvasWidth - bubbleWidth;
      if (bubbleY + bubbleHeight > canvasHeight) bubbleY = canvasHeight - bubbleHeight;

      ctx.beginPath();
      ctx.rect(bubbleX, bubbleY, bubbleWidth, bubbleHeight);
      ctx.stroke();
      ctx.fill();

      ctx.fillStyle = 'black';
      ctx.fillText(message, bubbleX + 10, bubbleY + 10); // Position text inside the bubble

      // Clear input field after drawing
      inputField.value = '';
    }
  }

  private drawHero(ctx: CanvasRenderingContext2D, hero: MetaHero) {
    ctx.fillStyle = 'blue';
    ctx.beginPath();
    ctx.arc(hero.coordsX, hero.coordsY, this.npc.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  private drawNpc(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = 'red';
    ctx.beginPath();
    ctx.arc(this.npc.coordsX, this.npc.coordsY, this.npc.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  handleKeydown(event: KeyboardEvent) {
    const key = event.key;
    switch (key) {
      case 'ArrowUp':
      case 'w':
        if (this.hero) {
          this.hero.coordsY -= this.hero.speed;
          this.paintHero();
        }
        break;
      case 'ArrowDown':
      case 's':
        if (this.hero) {
          this.hero.coordsY += this.hero.speed;
          this.paintHero();
        }
        break;
      case 'ArrowLeft':
      case 'a':
        if (this.hero) {
          this.hero.coordsX -= this.hero.speed;
          this.paintHero();
        }
        break;
      case 'ArrowRight':
      case 'd':
        if (this.hero) {
          this.hero.coordsX += this.hero.speed;
          this.paintHero();
        }
        break;
      case 'Enter':
        if (document.activeElement === this.chatInput.nativeElement) {
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
      this.paintHero();
    }
  }

  moveDown() {
    if (this.hero) {
      this.hero.coordsY += this.hero.speed;
      this.paintHero();
    }
  }

  moveLeft() {
    if (this.hero) {
      this.hero.coordsX -= this.hero.speed;
      this.paintHero();
    }
  }

  moveRight() {
    if (this.hero) {
      this.hero.coordsX += this.hero.speed;
      this.paintHero();
    }
  }

  startMoveRight() {
    this.stopMoveRight();
    this.moveRightInterval = setInterval(() => {
      this.moveRight();
    }, 100);
  }

  stopMoveRight() {
    if (this.moveRightInterval) {
      clearInterval(this.moveRightInterval);
      this.moveRightInterval = null;
    }
  }

  startMoveLeft() {
    this.stopMoveLeft();
    this.moveLeftInterval = setInterval(() => {
      this.moveLeft();
    }, 100);
  }

  stopMoveLeft() {
    if (this.moveLeftInterval) {
      clearInterval(this.moveLeftInterval);
      this.moveLeftInterval = null;
    }
  }

  startMoveUp() {
    this.stopMoveUp();
    this.moveUpInterval = setInterval(() => {
      this.moveUp();
    }, 100);
  }

  stopMoveUp() {
    if (this.moveUpInterval) {
      clearInterval(this.moveUpInterval);
      this.moveUpInterval = null;
    }
  }

  startMoveDown() {
    this.stopMoveDown();
    this.moveDownInterval = setInterval(() => {
      this.moveDown();
    }, 100);
  }

  stopMoveDown() {
    if (this.moveDownInterval) {
      clearInterval(this.moveDownInterval);
      this.moveDownInterval = null;
    }
  }

  paintHero() {
    console.log('paint hero');
    const ctx = this.getCtx(); 

    if (ctx) {
      ctx.clearRect(0, 0, this.gameCanvas.nativeElement.width, this.gameCanvas.nativeElement.height);
      if (this.hero) {
        this.drawHero(ctx, this.hero);
      }
      this.drawNpc(ctx);
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
    lines.forEach((line, i) => {
      ctx.fillText(line, bubbleX + bubbleWidth / 2, bubbleY + 50 + (i * lineHeight));
    });

    // Draw placeholder for sprites (still a simple square for now)
    const spriteWidth = canvasWidth * 0.1;
    const spriteHeight = canvasHeight * 0.2;
    ctx.fillStyle = '#FF0000'; // Red color for the "character"
    ctx.fillRect(bubbleX + 100, bubbleY + bubbleHeight + 20, spriteWidth, spriteHeight);
  }


  advanceStartingStoryText(): void {
    if (this.advanceStoryButtonText == "Start!") {
      this.showingNarrationText = false;
      this.showStartingStory = false;
      if (this.hero?.name) { 
        this.metaService.createHero(this.parentRef?.user ?? new User(0, 'Anonymous'), this.hero.name).then(res => {
          this.hero = res?.MetaHero;
        });
      }
    }

    if (this.showNameInput && this.chatInput && this.chatInput.nativeElement.value.trim() == "") {
      return this.focusOnChatInput(); 
    } else if (this.showNameInput && this.chatInput && this.chatInput.nativeElement.value.trim().length > 2) {
      this.hero = { name: this.chatInput.nativeElement.value, user: (this.parentRef?.user ?? new User(0,"Anonymous")) } as MetaHero;
      this.startingConfirmNameStoryMessages[0] = this.startingConfirmNameStoryMessages[0] + `${this.hero.name} is it?`;
      this.showNameInput = false;
    } 

    if (this.hero?.name) {
      if (this.startingConfirmNameStoryMessageIndex < this.startingConfirmNameStoryMessages.length) {
        this.startingConfirmNameStoryCurrentMessage = this.startingConfirmNameStoryMessages[this.startingConfirmNameStoryMessageIndex];
        this.startingConfirmNameStoryMessageIndex++;
        this.drawStoryChatBubble(this.startingConfirmNameStoryCurrentMessage); // Redraw the chat bubble with the new message
      } else if (this.startingConfirmNameStoryMessageIndex === this.startingConfirmNameStoryMessages.length) {
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
        console.log("focused on chat");
        this.chatInput.nativeElement.focus();
      }
    }, 0);
  }
  private getCtx() {
    const canvas: HTMLCanvasElement = this.gameCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    return ctx;
  }
}
