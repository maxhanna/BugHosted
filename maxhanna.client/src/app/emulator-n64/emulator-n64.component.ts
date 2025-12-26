import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { N64EmulatorService } from './n64-emulator.service';
import { ChildComponent } from '../child.component';

@Component({
  selector: 'app-emulator-n64',
  templateUrl: './emulator-n64.component.html',
  styleUrls: ['./emulator-n64.component.css'],
  standalone: false
})
export class EmulatorN64Component extends ChildComponent implements OnInit, OnDestroy {
  @ViewChild('romInput') romInput!: ElementRef<HTMLInputElement>;
  @ViewChild('screen') screen!: ElementRef<HTMLCanvasElement>;

  loading = false;
  status = 'idle';
  romName?: string;

  private romBuffer?: ArrayBuffer;
  private instance: any;

  constructor(private n64Service: N64EmulatorService) {
    super();
  }

  ngOnInit(): void {}
  ngOnDestroy(): void {
    this.stop();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (!file) return;
    this.romName = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      this.romBuffer = reader.result as ArrayBuffer;
      this.parentRef?.showNotification(`Loaded ${this.romName}`);
    };
    reader.onerror = (e) => {
      console.error(e);
      this.parentRef?.showNotification('Failed to read ROM file');
    };
    reader.readAsArrayBuffer(file);
  }

  async boot() {
    if (!this.romBuffer) {
      this.parentRef?.showNotification('Pick a ROM first');
      return;
    }
    if (!this.screen) {
      this.parentRef?.showNotification('No canvas available');
      return;
    }

    this.loading = true;
    this.status = 'booting';
    try {
      this.instance = await this.n64Service.bootRom(this.romBuffer!, this.screen.nativeElement, {});
      this.status = 'running';
      this.parentRef?.showNotification(`Booted ${this.romName}`);
    } catch (ex) {
      console.error(ex);
      this.status = 'error';
      this.parentRef?.showNotification('Failed to boot ROM: ' + ex);
    } finally {
      this.loading = false;
    }
  }

  async stop() {
    try {
      await this.n64Service.stop();
      this.status = 'stopped';
      this.parentRef?.showNotification('Emulator stopped');
    } catch (e) {
      console.error(e);
    }
  }

  async pause() {
    await this.n64Service.pause();
    this.status = 'paused';
  }

  async resume() {
    await this.n64Service.resume();
    this.status = 'running';
  }

  clearSelection() {
    this.romInput.nativeElement.value = '';
    this.romBuffer = undefined;
    this.romName = undefined;
  }
}
