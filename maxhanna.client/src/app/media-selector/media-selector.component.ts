import { Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { AppComponent } from '../app.component';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { User } from '../../services/datacontracts/user/user';
import { FileUploadComponent } from '../file-upload/file-upload.component';
import { FileSearchComponent } from '../file-search/file-search.component';


@Component({
  selector: 'app-media-selector',
  templateUrl: './media-selector.component.html',
  styleUrl: './media-selector.component.css',
  standalone: false
})
export class MediaSelectorComponent implements OnDestroy {
  displaySearchButton = false;
  displaySearch = false;
  maxFilesReached = false;
  viewMediaChoicesOpen = false;
  imageFileExtensions = ["jpg", "jpeg", "png", "gif", "bmp", "tiff", "svg", "webp"];
  videoFileExtensions = ["mp4", "mov", "avi", "wmv", "webm", "flv"];
  @Input() selectedFiles: FileEntry[] = [];
  @Input() inputtedParentRef?: AppComponent;
  @Input() user?: User;
  @Input() maxSelectedFiles: number = 5;
  @Input() currentDirectory: string = "";
  @Input() disabled: boolean = false;
  @Input() takeAllSpace: boolean = false;
  @Input() allowedFileTypes: string = '';
  @Input() uploadButtonText: string = "Upload";
  @Input() closeInitialPopup: boolean = false;
  @Input() parentId?: string;
  @Output() selectFileEvent = new EventEmitter<FileEntry[]>();
  @Output() expandFileSelectorEvent = new EventEmitter<boolean>();
  @ViewChild('selectMediaDiv', { static: false }) selectMediaDiv!: ElementRef;
  @ViewChild('mediaButton', { static: false }) mediaButton!: ElementRef;
  @ViewChild('doneButton') doneButton!: ElementRef<HTMLButtonElement>;
  @ViewChild(FileUploadComponent) fileUploadComponent!: FileUploadComponent;
  @ViewChild(FileSearchComponent) fileSearchComponent!: FileSearchComponent;


  constructor() {
    this.inputtedParentRef?.addResizeListener();
  }

  ngOnDestroy() {
    this.inputtedParentRef?.removeResizeListener();
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
  }

  toggleMediaChoices() {
    if (this.closeInitialPopup) {
      this.inputtedParentRef?.closeOverlay();
    }
    setTimeout(() => {
      this.viewMediaChoicesOpen = !this.viewMediaChoicesOpen;
      if (this.inputtedParentRef) {
        if (this.viewMediaChoicesOpen) {
          this.expandFileSelectorEvent.emit(this.viewMediaChoicesOpen);
          this.inputtedParentRef.showOverlay();
        } else {
          this.inputtedParentRef.closeOverlay();
          this.expandFileSelectorEvent.emit(this.viewMediaChoicesOpen);
        }
      }
      if (this.selectMediaDiv) {
        this.selectMediaDiv.nativeElement.classList.toggle("open");
      }
    }, 100);
  }

  displaySearchDiv() {
    this.displaySearch = true;
    this.viewMediaChoicesOpen = false;
    this.selectMediaDiv?.nativeElement?.classList?.remove("open");
  }
  closeSearchDiv(event: Event) {
    console.log("closing closeSearchDiv");
    if (this.fileSearchComponent) {
      this.fileSearchComponent.closeSearchPanel();
      console.log("closing search panel");
    }
    if (!this.viewMediaChoicesOpen && !this.fileSearchComponent?.isSearchPanelOpen) {
      console.log("close media selector");
      this.closeMediaSelector();
    } else {
      this.displaySearch = false;
      this.viewMediaChoicesOpen = true;
    }
  }
  selectFile(file: FileEntry) {
    if (this.selectedFiles.length > this.maxSelectedFiles) {
      return alert(`Cannot add more then ${this.maxSelectedFiles} files!`);
    }
    this.selectedFiles.push(file);
    //this.displaySearch = false;
    this.viewMediaChoicesOpen = true;
    this.maxFilesReached = (this.selectedFiles.length >= this.maxSelectedFiles);
  }
  expandClickedEvent(file: FileEntry) {
    return this.selectFile(file);
  }
  removeFile(file: FileEntry) {
    this.selectedFiles = this.selectedFiles.filter(x => x != file);
    this.selectFileEvent.emit(this.selectedFiles);
    this.maxFilesReached = (this.selectedFiles.length >= this.maxSelectedFiles);
  }
  removeAllFiles() {
    this.selectedFiles = [];
    this.maxFilesReached = false;
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

      this.maxFilesReached = (this.selectedFiles.length >= this.maxSelectedFiles);
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
  done() {
    this.selectFileEvent.emit(this.selectedFiles);
    this.closeMediaSelector();
  }
  closeMediaSelector() {
    this.displaySearchButton = false;
    this.viewMediaChoicesOpen = false;
    //this.displaySearch = false;
    if (this.inputtedParentRef) {
      this.inputtedParentRef.closeOverlay();
    }
    if (this.fileSearchComponent) {
      this.fileSearchComponent.closeSearchPanel();
    }
    if (this.closeInitialPopup && this.parentId) {
      setTimeout(() => {
        if (this.parentId) {
          console.log("clicking parentId button: " + this.parentId);
          document.getElementById(this.parentId)?.click();
        }
      }, 100);
    }
  }
}
