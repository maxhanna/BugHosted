import { ElementRef, ViewChild, Input } from '@angular/core';
import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ChildComponent } from '../child.component';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { MediaSelectorComponent } from '../media-selector/media-selector.component';
import { FileSearchComponent } from '../file-search/file-search.component';

interface ArtPiece {
  id: number;
  title: string;
  imageUrl: string;
  username: string;
  editing?: boolean;
  newUsername?: string;
}

@Component({
  selector: 'app-art',
  standalone: false,
  templateUrl: './art.component.html',
  styleUrls: ['./art.component.css']
})
export class ArtComponent extends ChildComponent implements OnInit {
  constructor(private http: HttpClient) { super(); }

  @ViewChild(MediaSelectorComponent) attachmentSelector!: MediaSelectorComponent;
  @ViewChild(FileSearchComponent) fileSearchComponent!: FileSearchComponent;

  isMenuPanelOpen = false;
  currentArtPage = 1;  
  artPieces: ArtPiece[] = []; 
 
  ngOnInit() { 
  }
 

  startEdit(art: ArtPiece) {
    art.editing = true;
    art.newUsername = art.username;
  } 

  cancelEdit(art: ArtPiece) {
    art.editing = false;
  }

  onUsernameInput(art: ArtPiece, event: Event) {
    art.newUsername = (event.target as HTMLInputElement).value;
  }

  showMenuPanel() {
    if (this.isMenuPanelOpen) {
      this.closeMenuPanel();
      return;
    }
    this.isMenuPanelOpen = true;
    if (this.parentRef) {
      this.parentRef.showOverlay();
    }
  }

  closeMenuPanel() {
    this.isMenuPanelOpen = false;
    if (this.parentRef) {
      this.parentRef.closeOverlay();
    }
  }
  onSearchArtInput(event: Event, fileSearchComponent: any) {
    const value = (event.target as HTMLInputElement).value;
    fileSearchComponent.searchTerms = value;
    fileSearchComponent.getDirectory();
  }
  uploadArt(files: FileEntry[]) { 
    setTimeout(() => {
      this.attachmentSelector.removeAllFiles();
    }, 40);
  }

  uploadFinished(files: FileEntry[]) {
    this.fileSearchComponent.handleUploadedFiles(files);
  }
  uploadNotification(event: string) {
    this.parentRef?.showNotification(event);
  }

  uploadFileListEvent(event: File[]) {
  }
  uploadCancelEvent(isCancelled: boolean) {
  }
}
