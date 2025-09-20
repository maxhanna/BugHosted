import { ElementRef, ViewChild, Input } from '@angular/core';
import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ChildComponent } from '../child.component';

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
  isMenuPanelOpen = false;
  currentArtPage = 1;  
  artPieces: ArtPiece[] = []; 

  constructor(private http: HttpClient) { super(); }

  ngOnInit() {
    this.loadArt();
  }

  loadArt() {
    this.isLoading = true;
    this.http.get<ArtPiece[]>('/art/getall').subscribe(res => {
      this.artPieces = res;
      this.isLoading = false;
    }, err => {
      this.isLoading = false;
    });
  }

  startEdit(art: ArtPiece) {
    art.editing = true;
    art.newUsername = art.username;
  }

  saveEdit(art: ArtPiece) {
    this.http.post<ArtPiece>('/art/editsource?id=' + art.id + '&username=' + encodeURIComponent(art.newUsername || ''), {}).subscribe(res => {
      art.username = res.username;
      art.editing = false;
    });
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
}
