import { Component, ElementRef, EventEmitter, Input, Output, Renderer2, ViewChild } from '@angular/core';
import { FileEntry } from '../../services/datacontracts/file-entry';
import { AppComponent } from '../app.component';
import { User } from '../../services/datacontracts/user';

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
  showFileUploader = true;
  @Input() inputtedParentRef?: AppComponent;
  @Input() user?: User;
  @Input() maxSelectedFiles: number = 5;
  @Input() currentDirectory: string = "";
  @Output() selectFileEvent = new EventEmitter<FileEntry[]>();
  @ViewChild('selectMediaDiv', { static: false }) selectMediaDiv!: ElementRef;
  @ViewChild('mediaButton', { static: false }) mediaButton!: ElementRef;

  constructor() { }

  toggleMediaChoices() {
    this.viewMediaChoicesOpen = !this.viewMediaChoicesOpen;
    this.displaySearchButton = true;
    if (this.selectMediaDiv) {
      if (this.selectMediaDiv.nativeElement.style.display == "block") {
        this.selectMediaDiv.nativeElement.style.display = "none";
      } else {
        this.selectMediaDiv.nativeElement.style.display = "block"; 
      }
    }
  }

  done() {
    this.toggleMediaChoices();
  }

  selectFile(file: FileEntry) {
    console.log("selecting file " + file.fileName);
    this.displaySearch = false;
    if (this.selectedFiles.length > this.maxSelectedFiles) {
      return alert(`Cannot add more then ${this.maxSelectedFiles} files!`);
    }
    this.selectedFiles.push(file);
    this.selectFileEvent.emit(this.selectedFiles);
    this.showFileUploader = false;
    if (this.selectedFiles.length == this.maxSelectedFiles) {
      this.viewMediaChoicesOpen = true;
      this.displaySearchButton = false;
    }
  }

  removeFile(file: FileEntry) {
    this.selectedFiles = this.selectedFiles.filter(x => x != file);
    this.selectFileEvent.emit(this.selectedFiles);

    if (this.selectedFiles.length == 0) {
      this.showFileUploader = true;
    }
  }
  uploadCancelledEvent(cancelled: boolean) {
    this.displaySearchButton = true; 
  }
  uploadEvent(files: Array<File>) {
    this.displaySearchButton = true;
  }
  uploadFinishedEvent(files: FileEntry[]) {
    if (this.selectedFiles.length > this.maxSelectedFiles) {
      return alert(`Cannot add more then ${this.maxSelectedFiles} files!`);
    }
    if (files) {
      console.log(  "got files, atatching to orgi" );
      this.selectedFiles = files;
    }
    this.selectFileEvent.emit(this.selectedFiles);

    this.displaySearchButton = true;
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
    this.showFileUploader = true;
  }
}
