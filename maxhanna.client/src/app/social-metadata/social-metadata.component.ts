import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { ChildComponent } from '../child.component';
import { AppComponent } from '../app.component';
import { MetaData } from '../../services/datacontracts/social/story';
import { CrawlerService } from '../../services/crawler.service';

/**
 * Reusable social-metadata (link preview) card. Shows the title, description
 * and image for a link; for YouTube links it enriches the card from the
 * crawler's stored results (image, description, title) when the caller only
 * has the URL. All fetching is non-blocking — the card renders immediately
 * with whatever metadata it has (or a plain link row) and upgrades in the
 * background once the crawler answers.
 */
@Component({
  selector: 'app-social-metadata',
  templateUrl: './social-metadata.component.html',
  styleUrl: './social-metadata.component.css',
  standalone: false,
})
export class SocialMetadataComponent extends ChildComponent implements OnInit, OnDestroy {
  /** The link this card represents. */
  @Input() url = '';
  /** Optional pre-fetched metadata (renders instantly; nothing is fetched). */
  @Input() metadata?: MetaData;
  @Input() inputtedParentRef?: AppComponent;
  /** Show the "ⓘ Details" button (emits detailsRequested). */
  @Input() showDetails = true;
  @Output() detailsRequested = new EventEmitter<MetaData>();

  /** True while the crawler is still filling in the card in the background. */
  loading = false;

  private _fetchStarted = false;
  private _destroyed = false;
  private _imageFailed = false;

  get displayUrl(): string {
    return this.metadata?.url || this.url || '';
  }
  get displayImage(): string | undefined {
    return this._imageFailed ? undefined : this.metadata?.imageUrl;
  }
  get displayTitle(): string | undefined {
    return this.metadata?.title;
  }
  get displayDescription(): string | undefined {
    return this.metadata?.description;
  }

  onImageError() {
    this._imageFailed = true;
  }

  constructor(private crawlerService: CrawlerService) {
    super();
  }

  ngOnInit() {
    if (this.inputtedParentRef) this.parentRef = this.inputtedParentRef;
    // Render immediately. If the caller only handed us a URL (no metadata
    // row), ask the crawler in the background — never block the page on it.
    this.loading = !this.metadata && !!this.url;
    if (!this.metadata && this.url) this.startFetch();
  }

  ngOnDestroy() {
    this._destroyed = true;
  }

  private startFetch() {
    if (this._fetchStarted || this._destroyed) return;
    this._fetchStarted = true;
    // Fire-and-forget: the card is already on screen (plain link row) and
    // upgrades when the crawler responds. Errors keep the plain link row.
    void this.fetchFromCrawler()
      .catch(() => { /* keep the plain link card */ })
      .finally(() => {
        if (!this._destroyed) this.loading = false;
      });
  }

  /** Pull title/description/image for this URL from the crawler's results. */
  private async fetchFromCrawler(): Promise<void> {
    const canonical = this.canonicalUrl();
    if (!canonical) return;

    const userId = this.parentRef?.user?.id ?? 0;

    // Exact-match + skip-scrape: a fast DB-only lookup on the stored row
    // (YouTube rows are persisted with the API metadata when indexed).
    const res = await this.crawlerService.searchUrl(canonical, 1, 10, true, true, userId);
    if (this._destroyed) return;

    const rows = res && !('error' in res) ? (res.Results ?? res.results ?? []) : [];
    const row = rows[0];
    if (!row?.id) {
      // Not indexed yet — kick off a background index so a later visit shows
      // the card; this is one-way and non-blocking.
      void this.crawlerService.indexLink(canonical);
      return;
    }

    const detail = await this.crawlerService.getDetail(row.id, userId);
    if (this._destroyed || !detail) return;

    this.metadata = {
      url: detail.url || canonical,
      title: detail.title || row.title || undefined,
      description: detail.description || undefined,
      imageUrl: detail.imageUrl || undefined,
      author: detail.author || undefined,
    };
  }

  /** Canonical form used for the crawler lookup (YouTube → watch?v=…). */
  canonicalUrl(): string {
    const raw = (this.url || this.metadata?.url || '').trim();
    if (!raw) return '';
    const id = this.parseYouTubeId(raw);
    if (id) return 'https://www.youtube.com/watch?v=' + id;
    return raw;
  }

  private parseYouTubeId(url: string): string | null {
    const m = url.match(
      /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:[^/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    );
    return m ? m[1] : null;
  }

  isYoutubeUrl(url?: string): boolean {
    if (!url) return false;
    try {
      return ['www.youtube.com', 'm.youtube.com', 'youtube.com', 'youtu.be'].includes(new URL(url).hostname);
    } catch {
      return false;
    }
  }

  /** True when the image is a YouTube thumbnail (shows the play badge). */
  isYoutubeImage(url?: string): boolean {
    return !!url && url.includes('ytimg');
  }

  getDomain(url?: string): string {
    if (!url) return '';
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url.split('/')[0] ?? '';
    }
  }

  openLink(event?: Event) {
    event?.stopPropagation();
    if (this.parentRef?.visitExternalLink) {
      this.parentRef.visitExternalLink(this.canonicalUrl() || this.url);
    } else {
      window.open(this.canonicalUrl() || this.url, '_blank');
    }
  }

  onDetails(event?: Event) {
    event?.stopPropagation();
    event?.preventDefault();
    this.detailsRequested.emit(this.metadata ?? { url: this.url });
  }
}
