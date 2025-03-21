import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Favourite } from '../../services/datacontracts/favourite/favourite';
import { FavouriteService } from '../../services/favourite.service';
import { User } from '../../services/datacontracts/user/user';

@Component({
  selector: 'app-favourites',
  templateUrl: './favourites.component.html',
  styleUrl: './favourites.component.css'
})
export class FavouritesComponent extends ChildComponent implements OnInit {
  @ViewChild('linkInput') linkInput!: ElementRef<HTMLInputElement>;
  @ViewChild('linkImageInput') linkImageInput!: ElementRef<HTMLInputElement>;
  @ViewChild('linkNameInput') linkNameInput!: ElementRef<HTMLInputElement>;
  @ViewChild('editingUrlInput') editingUrlInput!: ElementRef<HTMLInputElement>;
  @ViewChild('editingImageUrlInput') editingImageUrlInput!: ElementRef<HTMLInputElement>;
  @ViewChild('editingNameInput') editingNameInput!: ElementRef<HTMLInputElement>;
  userFavourites: Favourite[] = [];
  favouriteSearch: Favourite[] = [];
  editingFavourite?: Favourite;
  showNameImageInput = false;
  isEditPanelOpen = false;
  showEditLinks = false;
  showingLatestLinks = false;
  isSearchingUrls = false;

  constructor(private favoriteService: FavouriteService) {
    super();
  }

  ngOnInit() {
    if (this.parentRef?.user) {
      this.favoriteService.getUserFavourites(this.parentRef.user).then(res => {
        if (res) {
          this.userFavourites = res;
        }
      });
    }
  }

  async deleteFav(fav: Favourite) {
    if (!this.parentRef?.user) {
      return alert("You must be logged in to update the favourites");
    }
    await this.favoriteService.removeFavourite(this.parentRef.user, fav.id).then(res => {
      if (res) {
        this.parentRef?.showNotification(res);
      }
    });
    this.userFavourites = this.userFavourites.filter(x => x.url != fav.url);
  }

  async addLink(fav?: Favourite) {
    if (!this.parentRef?.user) { return alert("You must be logged in to update the favourites"); }
    if (fav) {
      await this.favoriteService.addFavourite(this.parentRef.user, fav.id).then(res => {
        if (res) {
          this.parentRef?.showNotification(res);
        }
      });
      this.userFavourites.push(fav);
    } else {
      const linkUrl = this.linkInput.nativeElement.value;
      const imageUrl = this.linkImageInput.nativeElement.value;
      const name = this.linkNameInput.nativeElement.value;
      const user = this.parentRef.user;
      if (linkUrl) {
        await this.favoriteService.updateFavourites(user, linkUrl, 0, imageUrl, name).then(res => {
          var tmpFav = new Favourite();
          tmpFav.name = name;
          tmpFav.url = linkUrl;
          tmpFav.imageUrl = imageUrl;
          tmpFav.id = res.id;
          this.parentRef?.showNotification(res.message);
          this.addLink(tmpFav);
        });
      }
    }
    this.resetInputs();

    this.showNameImageInput = false;
  }

  private resetInputs() {
    if (this.linkInput && this.linkInput.nativeElement) this.linkInput.nativeElement.value = "";
    if (this.linkImageInput && this.linkImageInput.nativeElement) this.linkImageInput.nativeElement.value = "";
    if (this.linkNameInput && this.linkNameInput.nativeElement) this.linkNameInput.nativeElement.value = "";
  }

  async editFavourite() {
    if (!this.parentRef?.user) { return alert("You must be log in to edit favourites."); }
    if (!this.editingFavourite) { return alert("You must select a favourite to edit."); }
    const name = this.editingNameInput.nativeElement.value;
    const url = this.editingUrlInput.nativeElement.value;
    const imageUrl = this.editingImageUrlInput.nativeElement.value;

    this.favoriteService.updateFavourites(this.parentRef.user, url, this.editingFavourite.id, imageUrl, name).then(res => {
      this.ngOnInit();
      this.closeEditPanel();
      this.parentRef?.showNotification(res.message);
    });
  }
  linkUrlInput() {
    const user = this.parentRef?.user ?? new User(0, "Anonymous");
    this.showNameImageInput = (this.linkInput.nativeElement.value ? true : false);
    const search = this.linkInput.nativeElement.value;

    if (search) {
      this.isSearchingUrls = true;
      this.favoriteService.getFavourites(user, search).then(res => {
        if (res) {
          this.favouriteSearch = res;
        } else {
          this.favouriteSearch = [];
        }
      });
    } else {
      this.isSearchingUrls = false;
      this.favouriteSearch = []
    }
    this.showingLatestLinks = false;
  }
  openEditPanel(fav: Favourite) {
    this.isEditPanelOpen = true;
    this.parentRef?.showOverlay();
    this.editingFavourite = fav;
  }
  closeEditPanel() {
    this.isEditPanelOpen = false;
    this.parentRef?.closeOverlay();
  }
  getTmpUserById(userId?: number) {
    if (!userId) return new User(0);
    return new User(userId);
  }
  getSafeUrl(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return 'https://' + url; // Ensures proper external URL navigation
  }
  isIncludedInFavourites(fav: Favourite) {
    return this.userFavourites.some(x => x.id === fav.id);
  }
  showLatestLinks() {
    this.showingLatestLinks = !this.showingLatestLinks;
    if (this.showingLatestLinks) {
      this.favoriteService.getFavourites(this.parentRef?.user ?? new User(0), '').then(res => {
        this.favouriteSearch = res;
      });
    } else {
      this.favouriteSearch = [];
    }
  }
}
