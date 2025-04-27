import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Favourite } from '../../services/datacontracts/favourite/favourite';
import { FavouriteService } from '../../services/favourite.service';
import { User } from '../../services/datacontracts/user/user';
import { CrawlerService } from '../../services/crawler.service';
import { UserService } from '../../services/user.service';
import { target } from '../meta/helpers/fight';

@Component({
  selector: 'app-favourites',
  templateUrl: './favourites.component.html',
  styleUrl: './favourites.component.css',
  standalone: false
})
export class FavouritesComponent extends ChildComponent implements OnInit {
  @ViewChild('linkInput') linkInput!: ElementRef<HTMLInputElement>;
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
  currentOrder: string = 'recent'; // default order

  editingCreatedBy?: User;
  editingUpdatedBy?: User;
  getProfileCount = 0;

  page = 1;
  pageSize = 100;
  totalCount = 1;

  constructor(private favoriteService: FavouriteService, private crawlerService: CrawlerService, private userService: UserService) {
    super();
  }

  ngOnInit() {
    this.startLoading();
    if (this.parentRef?.user?.id) {
      this.favoriteService.getFavourites('', this.page, this.pageSize, this.currentOrder, this.parentRef.user.id).then(res => {
        if (res) {
          console.log(res);
          this.userFavourites = Array.isArray(res.items) ? res.items : [];
          this.totalCount = res.totalCount || 0;
        } else {
          this.userFavourites = [];
          this.totalCount = 0;
        }
        this.stopLoading();
      });
    } else {
      this.stopLoading();
    }
  }

  permanentlyDelete(fav?: Favourite) {
    if (!fav) return;
    const user = this.parentRef?.user;
    if (!user?.id) { return alert("You must be logged in to delete favourites."); }
    this.startLoading();
    this.favoriteService.deleteFavourite(user.id, fav.id).then(res => {
      if (res) {
        this.parentRef?.showNotification(res);
      }
      this.stopLoading();
    });
    this.favouriteSearch = this.favouriteSearch.filter(x => x.id != this.editingFavourite?.id);
    this.userFavourites = this.userFavourites.filter(x => x.id != this.editingFavourite?.id);
    this.editingFavourite = undefined;
    this.closeEditPanel();
  }

  async deleteFav(fav: Favourite) {
    if (!this.parentRef?.user?.id) {
      return alert("You must be logged in to update the favourites");
    }
    this.startLoading();
    await this.favoriteService.removeFavourite(this.parentRef.user.id, fav.id).then(res => {
      if (res) {
        this.parentRef?.showNotification(res);
      }
      this.stopLoading();
    });
    this.userFavourites = this.userFavourites.filter(x => x.url != fav.url);
  }

  async addLink(fav?: Favourite) {
    const user = this.parentRef?.user;
    if (!user?.id) { return alert("You must be logged in to update the favourites"); }
    this.startLoading();
    console.log("adding link");
    if (fav) {
      await this.favoriteService.addFavourite(user.id, fav.id).then(res => {
        if (res) {
          this.parentRef?.showNotification(res);
        }
      });
      this.userFavourites.push(fav);
    } else {
      const linkUrl = this.linkInput.nativeElement.value;
      let imageUrl = "";
      let name = "";
      let tmpLinkUrl = linkUrl;
      if (tmpLinkUrl) {
        const exactMatch = linkUrl.includes('.') ? true : false;
        const cRes = await this.crawlerService.searchUrl(tmpLinkUrl, undefined, undefined, exactMatch);
        if (cRes && cRes.results.length > 0 && (!exactMatch ? cRes.results[0].url.includes(tmpLinkUrl) : true)) {
          let targetData = cRes.results[0];
          imageUrl = targetData.imageUrl;
          name = targetData.title;
          tmpLinkUrl = targetData.url;
          this.parentRef?.setModalBody(`
            Search results found and added this link to favourites:
            <img src='${imageUrl}' (error)="fav.imageUrl = '' /> <br />
            Found Title: ${name} <br />
            Found URL: ${tmpLinkUrl} <br />
          `);
          setTimeout(() => { this.parentRef?.openModal(); },);
        } else {
          if (!tmpLinkUrl.includes("https")) {
            tmpLinkUrl = "https://" + tmpLinkUrl;
            name = tmpLinkUrl;
          }
          this.parentRef?.setModalBody(`
            No search results found; Manually added link to favourites.<br />
            Title: ${name} <br />
            URL: ${tmpLinkUrl} <br />
          `);
          setTimeout(() => { this.parentRef?.openModal(); },);
        }
        console.log(cRes);
        await this.favoriteService.updateFavourites(user, tmpLinkUrl, 0, imageUrl, name ?? linkUrl).then(res => {
          var tmpFav = new Favourite();
          tmpFav.name = name ?? linkUrl;
          tmpFav.url = tmpLinkUrl;
          tmpFav.imageUrl = imageUrl;
          tmpFav.id = res.id;
          tmpFav.createdBy = user.id;
          tmpFav.modifiedBy = user.id;
          tmpFav.userCount = 1;
          this.parentRef?.showNotification(res.message);

          // Ensure we're adding to an array
          if (!Array.isArray(this.userFavourites)) {
            this.userFavourites = [];
          }
          this.userFavourites.push(tmpFav);
        });
      }
    }
    this.resetInputs();

    this.showNameImageInput = false;
    this.stopLoading();
  }

  private resetInputs() {
    if (this.linkInput && this.linkInput.nativeElement) this.linkInput.nativeElement.value = "";
    this.isSearchingUrls = false;
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
    this.showNameImageInput = (this.linkInput.nativeElement.value ? true : false);
    const search = this.linkInput.nativeElement.value;
    if (search) {
      this.isSearchingUrls = true;
      this.favoriteService.getFavourites(search, this.page, this.pageSize, this.currentOrder).then(res => {
        if (res) {
          this.favouriteSearch = res.items;
          this.totalCount = res.totalCount || 0;
        } else {
          this.favouriteSearch = [];
          this.totalCount = 0;
        }
      });
    } else {
      this.isSearchingUrls = false;
      this.favouriteSearch = []
      this.totalCount = 0;
    }
    this.showingLatestLinks = false;
  }
  async openEditPanel(fav: Favourite) {
    this.isEditPanelOpen = true;
    this.parentRef?.showOverlay();
    this.editingFavourite = fav;
    if (fav.createdBy) {
      const res = await this.userService.getUserById(fav.createdBy);
      if (res) {
        this.editingCreatedBy = res || new User(0, "Anonymous");
      }
    }
    if (fav.createdBy == fav.modifiedBy) {
      this.editingUpdatedBy = this.editingCreatedBy;
    } else if (fav.modifiedBy) {
      const res = await this.userService.getUserById(fav.modifiedBy);
      if (res) {
        this.editingUpdatedBy = res || new User(0, "Anonymous");
      }
    }
  }
  closeEditPanel() {
    this.isEditPanelOpen = false;
    this.parentRef?.closeOverlay();
  }

  getSafeUrl(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return 'https://' + url; // Ensures proper external URL navigation
  }
  isIncludedInFavourites(fav: Favourite): boolean {
    if (!fav || !fav.id || !Array.isArray(this.userFavourites)) {
      return false;
    }
    return this.userFavourites.some(x => x.id === fav.id);
  }
  async showLatestLinks() {
    this.showingLatestLinks = !this.showingLatestLinks;
    if (this.showingLatestLinks) {
      this.favoriteService.getFavourites('', 1, 50, this.currentOrder).then(res => {
        this.favouriteSearch = res.items;
        this.totalCount = res.totalCount || 0;
      });
    } else {
      this.favouriteSearch = [];
      this.totalCount = 0;
    }
  }
  pageChanged(event: any) {
    this.page = event.srcElement.value;
    console.log(event);
    this.favoriteService.getFavourites(this.linkInput.nativeElement.value, this.page, this.pageSize, this.currentOrder).then(res => {
      if (res) {
        if (this.showingLatestLinks) {
          this.favouriteSearch = Array.isArray(res.items) ? res.items : [];
          this.totalCount = res.totalCount || 0;
        } else {
          this.userFavourites = Array.isArray(res.items) ? res.items : [];
          this.totalCount = res.totalCount || 0;
        }
      } else {
        if (this.showingLatestLinks) {
          this.favouriteSearch = [];
          this.totalCount = 0;
        } else {
          this.userFavourites = [];
          this.totalCount = 0;
        }
      }
    });
  }

  pageSizeChanged(event: any) {
    this.pageSize = event.srcElement.value;
    console.log(this.pageSize);
    this.favoriteService.getFavourites(this.linkInput.nativeElement.value, this.page, this.pageSize, this.currentOrder, this.showingLatestLinks ? undefined : this.parentRef?.user?.id).then(res => {
      if (res) {
        if (this.showingLatestLinks) {
          this.favouriteSearch = Array.isArray(res.items) ? res.items : [];
          this.totalCount = res.totalCount || 0;
        } else {
          this.userFavourites = Array.isArray(res.items) ? res.items : [];
          this.totalCount = res.totalCount || 0;
        }
      } else {
        if (this.showingLatestLinks) {
          this.favouriteSearch = [];
          this.totalCount = 0;
        } else {
          this.userFavourites = [];
          this.totalCount = 0;
        }
      }
    });
  }
  visitExternalLink(fav: Favourite) {
    this.favoriteService.visit(fav.id);
    this.parentRef?.visitExternalLink(fav.url);
  }
  orderChanged(event: any) {
    this.currentOrder = event.target.value;
    this.favoriteService.getFavourites(this.linkInput.nativeElement.value, this.page, this.pageSize, this.currentOrder, this.showingLatestLinks ? undefined : this.parentRef?.user?.id).then(res => {
      if (res) {
        console.log(res);
        if (this.showingLatestLinks) {
          this.favouriteSearch = Array.isArray(res.items) ? res.items : [];
          this.totalCount = res.totalCount || 0;
        } else {
          this.userFavourites = Array.isArray(res.items) ? res.items : [];
          this.totalCount = res.totalCount || 0;
        }
        this.applyOrdering();
      } else {
        if (this.showingLatestLinks) {
          this.favouriteSearch = [];
          this.totalCount = 0;
        } else {
          this.userFavourites = [];
          this.totalCount = 0;
        }
      }
      this.stopLoading();
    });
  }
  private applyOrdering() {
    switch (this.currentOrder) {
      case 'recent':
        this.favouriteSearch.sort((a, b) =>
          new Date(b.creationDate).getTime() - new Date(a.creationDate).getTime());
        this.userFavourites.sort((a, b) =>
          new Date(b.creationDate).getTime() - new Date(a.creationDate).getTime());
        break;
      case 'popular':
        this.favouriteSearch.sort((a, b) => b.userCount - a.userCount);
        this.userFavourites.sort((a, b) => b.userCount - a.userCount);
        break;
      case 'visited':
        this.favouriteSearch.sort((a, b) => b.accessCount - a.accessCount);
        this.userFavourites.sort((a, b) => b.accessCount - a.accessCount);
        break;
      case 'name':
        this.favouriteSearch.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        this.userFavourites.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        break;
      case 'url':
        this.favouriteSearch.sort((a, b) => a.url.localeCompare(b.url));
        this.userFavourites.sort((a, b) => a.url.localeCompare(b.url));
        break;
    }
  }
}
