import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Favourite } from '../../services/datacontracts/favourite/favourite';
import { FavouriteService } from '../../services/favourite.service';
import { User } from '../../services/datacontracts/user/user';
import { CrawlerService } from '../../services/crawler.service';
import { UserService } from '../../services/user.service';
import { MetaData } from '../../services/datacontracts/social/story';
import { CrawlerSearchResponse } from '../../services/datacontracts/crawler';

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

  favorites: Favourite[] = []; // Single array for all favorites
  editingFavourite?: Favourite;
  showNameImageInput = false;
  isEditPanelOpen = false;
  showEditLinks = false;
  showingLatestLinks = false;
  // visibility: 'yours' shows only the current user's favourites; 'others' shows all favourites
  currentVisibility: 'yours' | 'others' = 'yours';
  isSearchingUrls = false;
  currentOrder = 'recent';
  editingCreatedBy?: User;
  editingUpdatedBy?: User;
  page = 1;
  pageSize = 100;
  totalCount = 1;
  isMenuPanelOpen = false;
  isSearchingEditUrl = false;
  isSearchingUrl = false;
  selectedMeta?: MetaData;
  numberOfPages = 0;

  constructor(
    private favoriteService: FavouriteService,
    private crawlerService: CrawlerService,
    private userService: UserService
  ) {
    super();
  }

  ngOnInit() {
    this.startLoading();
    if (this.parentRef?.user?.id) {
      this.currentOrder = 'visited';
      this.currentVisibility = 'yours';
      this.showingLatestLinks = false;
      this.loadFavorites();
    } else {
      // not logged in -> default to showing all favourites (others)
      this.currentVisibility = 'others';
      this.showingLatestLinks = true;
      this.stopLoading();
      this.showLatestLinks();
    }
  }

  async loadFavorites(search: string = '') {
    if (!search) { this.isSearchingUrls = false; }
    // Compute showAll: show latest override or explicit visibility = 'others'
    const showAll = this.showingLatestLinks || this.currentVisibility === 'others';
    const res = await this.favoriteService.getFavourites(
      search,
      this.page,
      this.pageSize,
      showAll,
      this.currentOrder,
      this.parentRef?.user?.id
    );
    if (res) {
      this.favorites = res.items;
      this.totalCount = res.totalCount || 0;
    } else {
      this.favorites = [];
      this.totalCount = 0;
    }
    this.numberOfPages = Math.ceil(this.totalCount / this.pageSize);
    this.stopLoading();
  }

  async permanentlyDelete(fav?: Favourite) {
    if (!fav || !this.parentRef?.user?.id) {
      return alert("You must be logged in to delete favourites.");
    }
    this.startLoading();
    const res = await this.favoriteService.deleteFavourite(this.parentRef.user.id, fav.id);
    if (res) {
      this.parentRef?.showNotification(res);
    }
    this.favorites = this.favorites.filter(x => x.id !== fav.id);
    this.editingFavourite = undefined;
    this.closeEditPanel();
    this.stopLoading();
  }

  async deleteFav(fav: Favourite) {
    if (!this.parentRef?.user?.id) {
      return alert("You must be logged in to update the favourites");
    }
    this.startLoading();
    const res = await this.favoriteService.removeFavourite(this.parentRef.user.id, fav.id);
    if (res) {
      this.parentRef?.showNotification(res);
    }
    this.favorites = this.favorites.filter(x => x.id !== fav.id);
    this.stopLoading();
  }

  async addLink(fav?: Favourite) {
    const user = this.parentRef?.user;
    if (!user?.id) {
      return alert("You must be logged in to update the favourites");
    }
    this.parentRef?.closeOverlay();
    this.isSearchingUrl = false;
    this.startLoading();
    if (fav) {
      fav.userCount++;
      const res = await this.favoriteService.addFavourite(user.id, fav.id);
      if (res) {
        this.parentRef?.showNotification(res);
      }
      this.favorites = this.favorites.map(f =>
        f.id === fav.id ? { ...f, isUserFavourite: true } : f
      );
    } else {
      const linkUrl = this.linkInput.nativeElement.value;
      let imageUrl = "";
      let name = "";
      let tmpLinkUrl = linkUrl;

      if (tmpLinkUrl) {
        const exactMatch = linkUrl.includes('.') ? true : false;

        // If user previously selected a result from the crawler UI, reuse it instead of re-crawling
        let targetData: MetaData | undefined = undefined;
        if (this.selectedMeta && this.selectedMeta.url && tmpLinkUrl && tmpLinkUrl === this.selectedMeta.url) {
          targetData = this.selectedMeta;
        }

        if (!targetData) {
          const userId = this.parentRef?.user?.id;
          const cRes: CrawlerSearchResponse | null = await this.crawlerService.searchUrl(tmpLinkUrl, undefined, undefined, exactMatch, undefined, userId);
          if (cRes && cRes.results && cRes.results.length > 0 && (!exactMatch ? cRes.results[0].url.includes(tmpLinkUrl) : true)) {
            targetData = cRes.results[0];
          }
        }

        if (targetData) {
          imageUrl = targetData.imageUrl ?? '';
          name = targetData.title ?? '';
          tmpLinkUrl = targetData.url ?? tmpLinkUrl;
          this.parentRef?.setModalHeader("Added to favourites:");
          this.parentRef?.setModalBody(` 
            ${imageUrl ? `<small>Image:</small><br /><span style='margin-left: 10px; text-align: right; width: calc(100% - 20px); display: block;'><img src='${imageUrl}' (error)="fav.imageUrl = ''" /></span><br />` : ``}
            <small>Title:</small><br /><span style='margin-left: 10px; text-align: right; width: calc(100% - 20px); display: block;'>${name}</span> <br />
            <small>URL:</small><br /><span style='margin-left: 10px; text-align: right; width: calc(100% - 20px); display: block;'>${tmpLinkUrl}</span>
          `);
          setTimeout(() => this.parentRef?.openModal(undefined, false), 50);
        } else {
          if (!tmpLinkUrl.toLowerCase().includes("https") && !tmpLinkUrl.toLowerCase().includes("http")) {
            tmpLinkUrl = "https://" + tmpLinkUrl;
            name = tmpLinkUrl;
          }
          this.parentRef?.setModalHeader("Added to favourites:");
          this.parentRef?.setModalBody(`
            <small>Title:</small><br /><span style='margin-left: 10px; text-align: right; width: calc(100% - 20px); display: block;'>${name}</span> <br />
            <small>URL:</small><br /><span style='margin-left: 10px; text-align: right; width: calc(100% - 20px); display: block;'>${tmpLinkUrl}</span>
          `);
          setTimeout(() => this.parentRef?.openModal(), 50);
        }

        const res = await this.favoriteService.updateFavourites(user, tmpLinkUrl, 0, imageUrl, name ?? linkUrl);
        const tmpFav = new Favourite();
        tmpFav.name = name ?? linkUrl;
        tmpFav.url = tmpLinkUrl;
        tmpFav.imageUrl = imageUrl;
        tmpFav.id = res.id;
        tmpFav.createdBy = user.id;
        tmpFav.modifiedBy = user.id;
        tmpFav.userCount = 1;
        tmpFav.isUserFavourite = true;

        this.favorites.unshift(tmpFav);
        this.parentRef?.showNotification(res.message);
        // clear selectedMeta after use
        this.selectedMeta = undefined;
      }
    }

    this.resetInputs();
    this.showNameImageInput = false;
    this.linkInput.nativeElement.value = "";
    this.stopLoading();
  }

  private resetInputs() {
    if (this.linkInput && this.linkInput.nativeElement) {
      this.linkInput.nativeElement.value = "";
    }
    this.isSearchingUrls = false;
  }

  async editFavourite() {
    if (!this.parentRef?.user || !this.editingFavourite) {
      return alert("You must be logged in and select a favourite to edit.");
    }
    const name = this.editingNameInput.nativeElement.value;
    const url = this.editingUrlInput.nativeElement.value;
    const imageUrl = this.editingImageUrlInput.nativeElement.value;

    const res = await this.favoriteService.updateFavourites(
      this.parentRef.user,
      url,
      this.editingFavourite.id,
      imageUrl,
      name
    );

    this.favorites = this.favorites.map(f =>
      f.id === this.editingFavourite?.id ? { ...f, name, url, imageUrl } : f
    );
    this.closeEditPanel();
    this.parentRef?.showNotification(res.message);
  }

  linkUrlInput() {
    const search = this.linkInput.nativeElement.value ?? "";
    this.showNameImageInput = !!search;
    this.isSearchingUrls = true;
    const userId = this.parentRef?.user?.id;
    this.loadFavorites(search);
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
    if (fav.createdBy === fav.modifiedBy) {
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
    return 'https://' + url;
  }

  isIncludedInFavourites(fav: Favourite): boolean {
    return !!fav.isUserFavourite;
  }

  async showLatestLinks() {
    this.showingLatestLinks = !this.showingLatestLinks;
    this.showEditLinks = false;
    this.currentOrder = this.showingLatestLinks ? 'recent' : 'visited';
    await this.loadFavorites();
  }

  pageChanged(event: any) {
    this.page = parseInt(event.srcElement.value) || 1;
    this.loadFavorites(this.linkInput.nativeElement.value);
  }

  pageSizeChanged(event: any) {
    this.pageSize = parseInt(event.srcElement.value);
    this.loadFavorites(this.linkInput.nativeElement.value);
  }

  visibilityChanged(event?: any, value?: 'yours' | 'others') {
    this.currentVisibility = value ?? event.target.value;
    if (value == "yours") {
      this.showingLatestLinks = false;
    } else {
      this.showingLatestLinks = true;
    }
    // reload favourites based on visibility
    this.loadFavorites(this.linkInput?.nativeElement?.value ?? '');
  }

  visitExternalLink(fav: Favourite) {
    this.favoriteService.visit(fav.id);
    this.parentRef?.indexLink(fav.url);
  }

  orderChanged(event?: any, value?: string) {
    this.currentOrder = value ?? event.target.value;
    this.loadFavorites(this.linkInput.nativeElement.value);
  }

  showSearchPopup() {
    this.isSearchingUrl = !this.isSearchingUrl;
    if (this.isSearchingUrl) {
      this.parentRef?.showOverlay();
    }
  }

  closeSearchPopup() {
    this.isSearchingUrl = false;
    this.parentRef?.closeOverlay();
  }

  showMenuPanel() {
    this.isMenuPanelOpen = !this.isMenuPanelOpen;
    this.isMenuPanelOpen ? this.parentRef?.showOverlay() : this.parentRef?.closeOverlay();
  }

  closeMenuPanel() {
    this.isMenuPanelOpen = false;
    this.parentRef?.closeOverlay();
  }
  urlSelectedEvent(meta: MetaData) {
    this.linkInput.nativeElement.value = meta.url ?? "";
    if (this.isSearchingEditUrl) {
      this.editingUrlInput.nativeElement.value = meta.url ?? "";
      this.editingImageUrlInput.nativeElement.value = meta.imageUrl ?? this.editingImageUrlInput.nativeElement.value ?? "";
      // autopopulate the editing title when selecting from crawler
      try { this.editingNameInput.nativeElement.value = meta.title ?? this.editingNameInput.nativeElement.value ?? ""; } catch { }
      this.isSearchingEditUrl = false;
    }
    else if (this.isSearchingUrl) {
      // store selected metadata so addLink can reuse it
      this.selectedMeta = meta;
      this.closeSearchPopup();
    }
  }
}