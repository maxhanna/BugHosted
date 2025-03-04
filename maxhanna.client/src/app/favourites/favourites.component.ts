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
    await this.favoriteService.removeFavourite(this.parentRef.user, fav.id);
    this.userFavourites = this.userFavourites.filter(x => x.url != fav.url);
  }

  async addLink(fav?: Favourite) {
    if (!this.parentRef?.user) { return alert("You must be logged in to update the favourites"); }
    if (fav) {
      await this.favoriteService.addFavourite(this.parentRef.user, fav.id);
      this.userFavourites.push(fav);
    } else {
      const linkUrl = this.linkInput.nativeElement.value;
      const imageUrl = this.linkImageInput.nativeElement.value;
      const name = this.linkNameInput.nativeElement.value;
      const user = this.parentRef.user;
      console.log(linkUrl);
      if (linkUrl) {
        await this.favoriteService.updateFavourites(user, linkUrl, imageUrl, name).then(res => {
          var tmpFav = new Favourite();
          tmpFav.name = name;
          tmpFav.url = linkUrl;
          tmpFav.imageUrl = imageUrl;
          this.userFavourites.push(tmpFav);
        });
      }
    } 
  }

  async editFavourite() {
    if (!this.parentRef?.user) { return alert("You must be log in to edit favourites."); }
    const name = this.editingNameInput.nativeElement.value;
    const url = this.editingUrlInput.nativeElement.value;
    const imageUrl = this.editingImageUrlInput.nativeElement.value;

    this.favoriteService.updateFavourites(this.parentRef.user, url, imageUrl, name);
  }
  linkUrlInput() {
    const user = this.parentRef?.user ?? new User(0, "Anonymous");
    this.showNameImageInput = (this.linkInput.nativeElement.value ? true : false);
    const search = this.linkInput.nativeElement.value;
    this.favoriteService.getFavourites(user, search).then(res => {
      if (res) {
        this.favouriteSearch = res;
      }
    });
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
}
