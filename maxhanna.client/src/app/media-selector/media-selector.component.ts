import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { AppComponent } from '../app.component';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { User } from '../../services/datacontracts/user/user';


@Component({
  selector: 'app-media-selector',
  templateUrl: './media-selector.component.html',
  styleUrl: './media-selector.component.css'
})
export class MediaSelectorComponent {
  displaySearchButton = false;
  displaySearch = false;
  viewMediaChoicesOpen = false;
  imageFileExtensions = ["jpg", "jpeg", "png", "gif", "bmp", "tiff", "svg", "webp"];
  videoFileExtensions = ["mp4", "mov", "avi", "wmv", "webm", "flv"];
  allowedFileExtensions = this.imageFileExtensions.concat(this.videoFileExtensions);
  selectedFiles: FileEntry[] = [];
  @Input() inputtedParentRef?: AppComponent;
  @Input() user?: User;
  @Input() maxSelectedFiles: number = 5;
  @Input() currentDirectory: string = "";
  @Output() selectFileEvent = new EventEmitter<FileEntry[]>();
  @ViewChild('selectMediaDiv', { static: false }) selectMediaDiv!: ElementRef;
  @ViewChild('mediaButton', { static: false }) mediaButton!: ElementRef;
  @ViewChild('doneButton') doneButton!: ElementRef<HTMLButtonElement>;

  constructor() { }

  toggleMediaChoices() {
    this.viewMediaChoicesOpen = !this.viewMediaChoicesOpen;
    console.log("toggle");
    if (this.inputtedParentRef) {
      console.log("toggle parent");
      this.inputtedParentRef.showOverlay = this.viewMediaChoicesOpen; 
    }
    this.displaySearchButton = true;
    if (this.selectMediaDiv) {
      this.selectMediaDiv.nativeElement.classList.toggle("open");
    }
  }

  done() {
    this.selectFileEvent.emit(this.selectedFiles);
    this.closeMediaSelector();
  }

  selectFile(file: FileEntry) {
    this.displaySearch = false;
    if (this.selectedFiles.length > this.maxSelectedFiles) {
      return alert(`Cannot add more then ${this.maxSelectedFiles} files!`);
    }
    this.selectedFiles.push(file);
    if (this.selectedFiles.length == this.maxSelectedFiles) {
      this.viewMediaChoicesOpen = true;
      this.displaySearchButton = false;
    }
  }

  removeFile(file: FileEntry) {
    this.selectedFiles = this.selectedFiles.filter(x => x != file);
    this.selectFileEvent.emit(this.selectedFiles);
  }
  uploadCancelledEvent(cancelled: boolean) {
    if (this.displaySearchButton) {
      this.displaySearchButton = true;
    }
    if (this.doneButton) {
      this.doneButton.nativeElement.disabled = false;
    }
  }
  uploadEvent(files: Array<File>) {
    if (this.displaySearchButton) {
      this.displaySearchButton = true;
    }
    if (this.doneButton) {
      this.doneButton.nativeElement.disabled = true;
    }
  }
  uploadFinishedEvent(files: FileEntry[]) {
    if (this.selectedFiles.length > this.maxSelectedFiles) {
      return alert(`Cannot add more then ${this.maxSelectedFiles} files!`);
    }
    if (files) {
      if (this.selectedFiles) {
        this.selectedFiles = this.selectedFiles.concat(files);
      }
      else {
        this.selectedFiles = files;
      }
    }

    if (this.displaySearchButton) {
      this.displaySearchButton = true;
    }
    if (this.doneButton) {
      this.doneButton.nativeElement.disabled = false;
    }
  }
  directoryChanged(dir: string) {
    this.currentDirectory = dir;
  }
  clickViewMediaChoices() {
    this.viewMediaChoicesOpen = !this.viewMediaChoicesOpen;
    this.displaySearchButton = !this.displaySearchButton;
  }
  closeMediaSelector() {
    this.selectedFiles = [];
    this.displaySearchButton = false;
    this.viewMediaChoicesOpen = false;
    this.displaySearch = false;
    if (this.selectMediaDiv) {
      this.selectMediaDiv.nativeElement.classList.remove("open"); 
    }
    if (this.inputtedParentRef) {
      this.inputtedParentRef.showOverlay = false;
    }
  }
}
