import { Component, EventEmitter, Input, Output } from '@angular/core';
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

  constructor() { }

  selectFile(file: FileEntry) {
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

  uploadFinishedEvent(files: FileEntry[]) {
    if (this.selectedFiles.length > this.maxSelectedFiles) {
      return alert(`Cannot add more then ${this.maxSelectedFiles} files!`);
    }
    if (files)
    this.selectedFiles = this.selectedFiles.concat(files);
  }
  directoryChanged(dir: string) {
    this.currentDirectory = dir;
  }
  clickViewMediaChoices() {
    this.viewMediaChoicesOpen = !this.viewMediaChoicesOpen;
    this.displaySearchButton = !this.displaySearchButton;
  }
}
