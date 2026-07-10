import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { CrawlerService } from '../../services/crawler.service';
import { LightweightSearchResult, CrawlerSearchResponse, StorageStats } from '../../services/datacontracts/crawler';
import { DomSanitizer } from '@angular/platform-browser';
import { AppComponent } from '../app.component';
import { User } from '../../services/datacontracts/user/user';
import { YoutubeVideo } from '../../services/datacontracts/youtube';
import { MetaData } from '../../services/datacontracts/social/story';

@Component({
  selector: 'app-crawler',
  templateUrl: './crawler.component.html',
  styleUrl: './crawler.component.css',
  standalone: false
})
export class CrawlerComponent extends ChildComponent implements OnInit, OnDestroy {
  searchResults: LightweightSearchResult[] = [];
  error: string = '';
  indexCount = 0;
  indexUpdateTimer: any;
  isMenuOpen = false;
  lastSearch = "";
  hasSearched: boolean = false;
  groupedResults?: { domain: string; links: LightweightSearchResult[]; showSubdomains: boolean }[] = [];
  storageStats?: any;
  currentPage: number = 1;
  totalResults: number = 0;
  totalPages: number = 0;
  showYoutubePopup: boolean = false;
  currentYoutubeVideoUrl: string = '';
  sanitizedYoutubeUrl: any = '';
  pageSizes: number[] = [50, 100, 150, 300];
  pageSize: number = this.pageSizes[0];
  isFavouritedByPanelOpen: boolean = false;
  favouritedByList: User[] = [];
  isUrlDisabled: boolean = false;
  isKeywordsDisabled: boolean = false;
  youtubeResults: YoutubeVideo[] = [];
  redditResults: MetaData[] = [];
  isSearchingYoutube = false;
  youtubeDisplayLimit = 1;
  youtubeExpanded = false;
  redditExpanded = false;
  isSearchingReddit = false;
  socialResults: LightweightSearchResult[] = [];
  socialDisplayLimit = 1;
  redditDisplayLimit = 1;
  private socialDomains = ['reddit.com', 'www.reddit.com', 'twitter.com', 'www.twitter.com', 'x.com', 'www.x.com', 'facebook.com', 'www.facebook.com'];

  @ViewChild('pageSizeDropdown') pageSizeDropdown!: ElementRef<HTMLSelectElement>;
  @ViewChild('urlInput') urlInput!: ElementRef<HTMLInputElement>;
  @ViewChild('keywordsInput') keywordsInput!: ElementRef<HTMLInputElement>;
  @Input() url: string = '';
  @Input() onlySearch: boolean = false;
  @Input() inputtedParentRef?: AppComponent;
  @Output() urlSelectedEvent = new EventEmitter<string>();
  @Output() closeSearchEvent = new EventEmitter<void>();

  constructor(private sanitizer: DomSanitizer, private crawlerService: CrawlerService) { super(); }

  ngOnInit() {
    if (this.inputtedParentRef) {
      this.parentRef = this.inputtedParentRef;
    }
    this.crawlerService.indexCount().then(res => { if (res) { this.indexCount = parseInt(res); } });
    if (!this.onlySearch) {
      (document.getElementsByClassName("componentContainer")[0] as HTMLDivElement)?.classList.add("centeredContainer");
    }
    setTimeout(() => {
      if (this.url) {
        this.urlInput.nativeElement.value = this.url;
        this.url = "";
        this.searchUrl();
      }
      try {
        const u = this.urlInput?.nativeElement?.value?.trim();
        const k = this.keywordsInput?.nativeElement?.value?.trim();
        this.isKeywordsDisabled = !!(u && u.length > 0);
        this.isUrlDisabled = !!(k && k.length > 0);
      } catch (e) { }
      this.urlInput.nativeElement.focus();
    }, 1);
    this.indexUpdateTimer = setInterval(() => {
      if (this.urlInput.nativeElement.value.trim() == '') {
        this.crawlerService.indexCount().then(res => { if (res) { this.indexCount = parseInt(res); } });
      }
    }, 60000);
  }

  ngOnDestroy() {
    (document.getElementsByClassName("componentContainer")[0] as HTMLDivElement)?.classList.remove("centeredContainer");
    clearInterval(this.indexUpdateTimer);
    this.stopLoading();
  }

  fillSiteExample() {
    try {
      this.keywordsInput.nativeElement.value = 'site:www.example.com keywords';
      this.onKeywordsInput();
      this.keywordsInput.nativeElement.focus();
    } catch (e) { }
  }

  onUrlInput() {
    try {
      const val = this.urlInput?.nativeElement?.value ?? '';
      this.isKeywordsDisabled = !!(val && val.trim().length > 0);
      if (!this.isKeywordsDisabled) this.isUrlDisabled = false;
    } catch (e) { }
  }

  // onKeywordsInput() {
  //   try {
  //     const val = this.keywordsInput?.nativeElement?.value ?? '';
  //     this.isUrlDisabled = !!(val && val.trim().length > 0);
  //     if (!this.isUrlDisabled) this.isKeywordsDisabled = false;
  //   } catch (e) { }
  // }

  visitExternalLink(url?: string) {
    if (!url) return;
    if (this.onlySearch) {
      this.urlSelectedEvent.emit(url);
    }
    this.parentRef?.indexLink(url);
  }

  openYoutubePopup(event: MouseEvent, url: string) {
    if (event.button === 1) return;
    event.preventDefault();
    const match = url.match(/(?:v=|youtu\.be\/|\/embed\/)([a-zA-Z0-9_-]{11})/);
    this.currentYoutubeVideoUrl = match
      ? `https://www.youtube.com/embed/${match[1]}?autoplay=1`
      : url;
    this.sanitizedYoutubeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.currentYoutubeVideoUrl);
    this.showYoutubePopup = true;
  }

  closeYoutubePopup() {
    this.showYoutubePopup = false;
    this.currentYoutubeVideoUrl = '';
    this.sanitizedYoutubeUrl = '';
  }

  openFavouritedByPanel(url?: string) {
    if (!url) return;
    this.startLoading();
    this.crawlerService.getFavouritedByUrl(url).then(res => {
      this.favouritedByList = res ?? [];
    }).finally(() => {
      this.stopLoading();
      const parent = this.inputtedParentRef ?? this.parentRef;
      parent?.showOverlay(); 
      this.isFavouritedByPanelOpen = true;
    });
  }

  closeFavouritedByPanel() {
    this.isFavouritedByPanelOpen = false;
    this.favouritedByList = [];
  }

  async searchUrl(skipScrape?: boolean) {
    const raw = this.urlInput.nativeElement.value?.trim();
    if (!raw) return;
    if (raw.startsWith('site:')) { await this.doSearch(raw, false, skipScrape); return; }
    if (raw === '*') { await this.doSearch(raw, false, skipScrape); return; }
    let url = raw;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    if (!this.isValidUrl(url)) { alert('Invalid URL.'); return; }
    await this.doSearch(url, true, skipScrape);
  }

  async searchKeywords(skipScrape?: boolean) {
    const keywords = this.keywordsInput.nativeElement.value; 
    
    if (keywords) {
      this.isSearchingYoutube = true;
      this.crawlerService.searchYoutube(this.keywordsInput.nativeElement.value.trim()).then(response => {
        this.youtubeResults = response ?? [];
        this.isSearchingYoutube = false;
        this.youtubeDisplayLimit = 1;
      });
      this.isSearchingReddit = true;
      this.crawlerService.searchReddit(this.keywordsInput.nativeElement.value.trim()).then(response => {
        this.redditResults = response ?? [];
        this.isSearchingReddit = false;
        this.redditDisplayLimit = 1;
      });
    } else {
      this.youtubeResults = [];
      this.redditResults = [];
    }

    if (keywords.split(' ').length > 0 || !keywords.includes('.') || !keywords.includes('http')) { 
      await this.doSearch(keywords, false, skipScrape);
    } else {
      this.searchUrl(skipScrape);
    }
  }

  private isValidUrl(url: string): boolean {
    try {
      const u = new URL(url);
      if (!(u.protocol === 'http:' || u.protocol === 'https:')) return false;
      const host = u.hostname;
      if (!host) return false;
      if (host === 'localhost') return true;
      return host.indexOf('.') > 0;
    } catch { return false; }
  }

  private async doSearch(query: string, isExact: boolean, skipScrape?: boolean) {
    (document.getElementsByClassName("componentContainer")[0] as HTMLDivElement)?.classList.remove("centeredContainer");
    this.error = '';
    const value = query;
    if (value != this.lastSearch) this.currentPage = 1;
    this.lastSearch = value;
    const currentPage = this.currentPage;
    const pageSize = this.pageSize;
    this.startLoading();
    this.hasSearched = true;

    if (value) {
      const userId = (this.inputtedParentRef ?? this.parentRef)?.user?.id;
      const res = await this.crawlerService.searchUrl(value, currentPage, pageSize, isExact, skipScrape, userId) as CrawlerSearchResponse | { error: string; status?: number } | null;
      if ((res as any)?.error) {
        this.error = (res as any).error;
        this.totalResults = 0;
        this.totalPages = 0;
        this.searchResults = [];
        this.groupedResults = [];
        this.stopLoading();
        return;
      }
      if (res && (res as CrawlerSearchResponse).totalResults != 0) {
        const r = (res as CrawlerSearchResponse);
        this.totalResults = r.totalResults;
        this.totalPages = Math.ceil(this.totalResults / this.pageSize);
        this.searchResults = r.results ?? [];
        this.groupedResults = this.getGroupedResults(this.searchResults);
        this.filterSocialResults();
        this.sortResults();
      } else {
        this.error = isExact ? "No data from given URL." : "No results for those keywords.";
        this.totalResults = 0;
        this.totalPages = 0;
        this.searchResults = [];
        this.groupedResults = [];
      }
    } else {
      this.searchResults = [];
      this.groupedResults = [];
      this.totalPages = 0;
      this.totalResults = 0;
      this.currentPage = 1;
    }
    this.stopLoading();
    setTimeout(() => {
      (document.getElementsByClassName("metadataSearchWrapper")[0] as HTMLElement).scrollTop = 0;
    }, 100);
  }

  async addWithoutSearch() {
    const url = this.urlInput?.nativeElement?.value?.trim();
    if (!url) return;
    if (this.onlySearch) {
      this.urlSelectedEvent.emit(url);
      this.closeSearchEvent.emit();
      return;
    }
    try {
      const parent = this.inputtedParentRef ?? this.parentRef;
      await parent?.addFavourite(url, '', '');
      if (parent) parent.closeOverlay();
    } catch (e) { }
  }

  private filterSocialResults() {
    this.socialResults = [];
    this.socialDisplayLimit = 1;
    const socialSet = new Set(this.socialDomains);
    const webOnly: typeof this.groupedResults = [];
    for (const group of this.groupedResults ?? []) {
      if (socialSet.has(group.domain)) {
        for (const link of group.links) this.socialResults.push(link);
      } else {
        webOnly.push(group);
      }
    }
    this.groupedResults = webOnly;
  }

  private getGroupedResults(results: LightweightSearchResult[]) {
    const grouped: { [domain: string]: LightweightSearchResult[] } = {};
    (results ?? []).forEach(r => {
      try {
        if (r.url) {
          const domain = new URL(r.url).hostname;
          if (!grouped[domain]) grouped[domain] = [];
          grouped[domain].push(r);
        }
      } catch { }
    });
    return Object.entries(grouped).map(([domain, links]) => ({
      domain, links, showSubdomains: false
    }));
  }

  private sortResults() {
    if (!this.groupedResults) return;
    const grouped = this.groupedResults;
    const map: { [domain: string]: LightweightSearchResult[] } = {};
    grouped.forEach(g => { map[g.domain] = g.links; });
    const entries = Object.entries(map).map(([domain, links]) => {
      const sorted = links.sort((a, b) => {
        try {
          const urlA = new URL(a.url ?? '');
          const urlB = new URL(b.url ?? '');
          const isTopA = urlA.pathname === '/' || urlA.pathname === '';
          const isTopB = urlB.pathname === '/' || urlB.pathname === '';
          if (isTopA && !isTopB) return -1;
          if (!isTopA && isTopB) return 1;
          return (a.url?.length ?? 0) - (b.url?.length ?? 0);
        } catch { return 0; }
      });
      return { domain, links: sorted, showSubdomains: false };
    });
    entries.sort((a, b) => {
      const aIsTop = a.domain.startsWith('www.') ? a.domain.substring(4) : a.domain;
      const bIsTop = b.domain.startsWith('www.') ? b.domain.substring(4) : b.domain;
      return aIsTop.localeCompare(bIsTop);
    });
    this.groupedResults = entries;
  }

  onPageSizeChange() {
    this.currentPage = 1;
    this.pageSize = parseInt(this.pageSizeDropdown.nativeElement.value);
    this.searchUrl(true);
    this.closeMenuPanel();
  }

  showMoreYoutube() {
    this.youtubeExpanded = !this.youtubeExpanded;
    this.youtubeDisplayLimit = this.youtubeExpanded ? this.youtubeResults.length : 1;
  }

  showMoreReddit() {
    this.redditExpanded = !this.redditExpanded;
    this.redditDisplayLimit = this.redditExpanded ? this.redditResults.length : 1;
  }

  showMoreSocial() {
    this.socialDisplayLimit += 10;
  }

  onPageChange(page?: number) {
    let tmpPage = page;
    if (!tmpPage) tmpPage = this.currentPage + 1;
    if (tmpPage >= 1 && tmpPage <= this.totalPages) {
      this.currentPage = tmpPage;
      this.searchUrl(true);
    }
  }

  showMenuPanel() {
    (document.getElementsByClassName("componentContainer")[0] as HTMLDivElement)?.classList.remove("centeredContainer");
    if (!this.storageStats) {
      this.startLoading();
      this.crawlerService.storageStats()
        .then(res => { if (res) this.storageStats = res; })
        .catch(() => { })
        .finally(() => { this.stopLoading(); });
    }
    if (this.isMenuOpen) { this.closeMenuPanel(); return; }
    this.isMenuOpen = true;
    if (this.parentRef) this.parentRef.showOverlay();
  }

  closeMenuPanel() {
    this.isMenuOpen = false;
    if (this.parentRef) this.parentRef.closeOverlay();
  }

  toggleSubdomains(group: any) {
    group.showSubdomains = !group.showSubdomains;
  }

  seeNew() {
    this.urlInput.nativeElement.value = '*';
    this.searchUrl(true);
  }

  get currentUser() {
    return this.parentRef?.user ?? new User(0, "Anonymous");
  }
}
