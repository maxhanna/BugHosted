import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { FileService } from '../../services/file.service';

@Component({
  selector: 'app-game',
  templateUrl: './game.component.html',
  styleUrls: ['./game.component.css']
})
export class GameComponent extends ChildComponent implements OnInit {
  @ViewChild('canvas', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;

  private gba: any;

  constructor(private fileService: FileService) {
    super();
  }

  ngOnInit() {
    this.initializeEmulator();
  }

  initializeEmulator() {
    const canvas = this.canvas.nativeElement;
    this.gba = new GameBoyAdvance();
    this.gba.keypad.eatInput = true;
 
    this.gba.setCanvas(canvas);

    // Ensure logging is set to error only to avoid excessive logging
    this.gba.logLevel = this.gba.LOG_ERROR;

    // Attach event listeners and set up the emulator
    this.setupEvents();

    // Load ROM
    this.loadROM();
  }

  setupEvents() {
    window.addEventListener('keydown', (e) => this.gba.keypad.keyDown(e));
    window.addEventListener('keyup', (e) => this.gba.keypad.keyUp(e));
  }

  async loadROM() {
    const rom = await this.fileService.getRomFile(this.parentRef?.user!, "rom.gba");
    if (this.gba.loadRomFromFile) {
      this.gba.loadRomFromFile(rom);
    } else if (this.gba.loadRomFromBuffer) {
      this.gba.loadRomFromBuffer(rom);
    } else {
      console.error("No valid ROM loading method found in GBA emulator.");
    }

    this.gba.runStable();
  }
}
