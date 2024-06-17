import { Component } from '@angular/core';
import { FileEntry } from '../../services/datacontracts/file-entry';

@Component({
  selector: 'app-media-selector',
  templateUrl: './media-selector.component.html',
  styleUrl: './media-selector.component.css'
})
export class MediaSelectorComponent {
  viewMediaChoicesOpen = false;
  fileSelections: FileEntry[] = [];
  imageFileExtensions = ["jpg", "jpeg", "png", "gif", "bmp", "tiff", "svg", "webp"];
  videoFileExtensions = ["mp4", "mov", "avi", "wmv", "webm", "flv"];
  allowedFileExtensions = this.imageFileExtensions.concat(this.videoFileExtensions);
  constructor() { }
}
