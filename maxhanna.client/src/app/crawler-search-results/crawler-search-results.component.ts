import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { CrawlerService } from '../../services/crawler.service';
import { FavouriteService } from '../../services/favourite.service';
import { RatingsService } from '../../services/ratings.service';
import { LightweightSearchResult, NormalizedMetaData } from '../../services/datacontracts/crawler';
import { User } from '../../services/datacontracts/user/user';
import { AppComponent } from '../app.component';

@Component({
  selector: 'app-crawler-search-results',
  standalone: false,
  templateUrl: './crawler-search-results.component.html',
  styleUrl: './crawler-search-results.component.css'
})
export class CrawlerSearchResultsComponent extends ChildComponent {
  @Input() result!: LightweightSearchResult;
  @Input() inputtedParentRef?: AppComponent;
  @Input() onlySearch: boolean = false;
  @Input() hideStatus: boolean = false;
  @Input() displaySocialResults: boolean = false;
  @Output() urlSelectedEvent = new EventEmitter<string>();

  @ViewChild('observerTarget', { static: true }) observerTarget!: ElementRef;

  detail: NormalizedMetaData | null = null;
  loadingDetail = false;
  loaded = false;

  private observer: IntersectionObserver | null = null;

  constructor(
    private crawlerService: CrawlerService,
    private favouriteService: FavouriteService,
    private ratingsService: RatingsService
  ) { super(); }

  ngAfterViewInit() {
    this.observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting && !this.loaded && !this.loadingDetail) {
        this.loadDetail();
      }
    }, { rootMargin: '200px' });
    this.observer.observe(this.observerTarget.nativeElement);
  }

  ngOnDestroy() {
    this.observer?.disconnect();
  }

  private async loadDetail() {
    if (!this.result?.id) return;
    this.loadingDetail = true;
    const userId = (this.inputtedParentRef ?? this.parentRef)?.user?.id;
    this.detail = await this.crawlerService.getDetail(this.result.id, userId);
    this.loadingDetail = false;
    this.loaded = true;
    this.observer?.disconnect();
  }

  get parent() { return this.inputtedParentRef ?? this.parentRef; }

  visit(url?: string) {
    if (!url) return;
    this.parent?.indexLink(url);
    if (this.onlySearch) this.urlSelectedEvent.emit(url);
  }

  async addFavourite() {
    if (!this.parent?.user?.id) return alert('You must be logged in to update favourites');
    if (!this.detail) return;
    const userId = this.parent.user.id;
    const url = this.detail.url;
    try {
      if (this.detail.isUserFavourite) {
        const lookup = await this.favouriteService.getFavourites(url, 1, 1, true, undefined, userId);
        const favItem = lookup?.items?.length
          ? lookup.items.find((f: any) => (f.url ?? '').toLowerCase() === url.toLowerCase())
          : null;
        if (favItem?.id) {
          const r = await this.favouriteService.removeFavourite(userId, favItem.id);
          this.parent.showNotification(r ?? '');
        }
        this.detail.favouriteCount = (this.detail.favouriteCount ?? 1) - 1;
        this.detail.isUserFavourite = false;
      } else {
        await this.parent.addFavourite(url, this.detail.imageUrl, this.detail.title);
        this.detail.isUserFavourite = true;
        this.detail.favouriteCount = (this.detail.favouriteCount ?? 0) + 1;
      }
    } catch (err) {
      console.error('Failed to toggle favourite', err);
    }
  }

  async rateSearchResult(star: any) {
    if (!this.detail?.id) return alert('Cannot rate this result.');
    const val = +star;
    try {
      const currentUser = this.parent?.user ?? new User(0, "Anonymous");
      await this.ratingsService.submitRating(currentUser, val, undefined, this.detail.id);
      this.detail.averageRating = this.detail.ratingCount
        ? ((this.detail.averageRating ?? 0) * this.detail.ratingCount + val) / (this.detail.ratingCount + 1)
        : val;
      this.detail.ratingCount = (this.detail.ratingCount ?? 0) + 1;
      this.parent?.showNotification(`Rated ${val} star${val > 1 ? 's' : ''}!`);
    } catch {
      this.parent?.showNotification('Failed to submit rating.');
    }
  }

  getHttpStatusMeaning(status: number): string {
    const meanings: Record<number, string> = {
      200: 'OK',
      301: 'Moved Permanently',
      302: 'Found',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      405: 'Method Not Allowed',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
      504: 'Gateway Timeout',
    };
    return meanings[status] || 'Unknown';
  }

  get currentUser() {
    return this.parent?.user ?? new User(0, "Anonymous");
  }
}
