import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { CrawlerService } from '../../services/crawler.service';
import { MetaData } from '../../services/datacontracts/social/story';
import { DomSanitizer, Meta, SafeHtml } from '@angular/platform-browser';

@Component({
    selector: 'app-crawler',
    templateUrl: './crawler.component.html',
    styleUrl: './crawler.component.css',
    standalone: false
})
export class CrawlerComponent extends ChildComponent implements OnInit, OnDestroy {
  searchMetadata: MetaData[] = [];
  error: string = '';
  indexCount = 0;
  indexUpdateTimer: any;
  isMenuOpen = false;
  lastSearch = "";
  groupedResults?: { domain: string; links: MetaData[]; showSubdomains: boolean }[] = [];
  storageStats?: any;
  currentPage: number = 1;
  totalResults: number = 0;  // To be populated by API
  totalPages: number = 0;
  paginatedResults: any[] = [];
  pageSizes: number[] = [50, 100, 150, 300]; // Dropdown options
  pageSize: number = this.pageSizes[0]; 

  @ViewChild('pageSizeDropdown') pageSizeDropdown!: ElementRef<HTMLSelectElement>;
  @ViewChild('urlInput') urlInput!: ElementRef<HTMLInputElement>;
  @Input() url: string = '';
  @Input() onlySearch: boolean = false;
  @Output() urlSelectedEvent = new EventEmitter<MetaData>();
  @Output() closeSearchEvent = new EventEmitter<void>();
  constructor(private sanitizer: DomSanitizer, private crawlerService: CrawlerService) { super(); }
  ngOnInit() {
    this.parentRef?.addResizeListener();
    this.crawlerService.indexCount().then(res => { if (res) { this.indexCount = parseInt(res); } });
    (document.getElementsByClassName("componentContainer")[0] as HTMLDivElement)?.classList.add("centeredContainer"); 
    setTimeout(() => {
      if (this.url) {
        this.urlInput.nativeElement.value = this.url;
        this.url = "";
        this.searchUrl();
      }
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
    this.parentRef?.removeResizeListener();
  }
  visitExternalLink(url?: string) {
    if (!url) return;
    if (this.onlySearch) {
      const tgtMetadata = this.searchMetadata.filter((x: MetaData) => x.url == url)[0];
      if (tgtMetadata) { 
        this.urlSelectedEvent.emit(tgtMetadata);
      }
    }  
    this.parentRef?.visitExternalLink(url); 
  }
  async searchUrl(skipScrape?: boolean) {
    (document.getElementsByClassName("componentContainer")[0] as HTMLDivElement)?.classList.remove("centeredContainer"); 
    this.error = '';
    const url = this.urlInput.nativeElement.value;
    if (url != this.lastSearch) {
      this.currentPage = 1;
    }

    this.lastSearch = url;
    const currentPage = this.currentPage;
    const pageSize = this.pageSize;
    this.startLoading();

    if (url) {
      await this.crawlerService.searchUrl(url, currentPage, pageSize, undefined, skipScrape).then(res => {
        if (res && res.totalResults != 0) {
          this.totalResults = res.totalResults;
          this.totalPages = Math.ceil(this.totalResults / this.pageSize);
          this.searchMetadata = res.results ?? [];
          const groupedResults: { [domain: string]: MetaData[]; } = this.getGroupedResults(this.searchMetadata);

          this.sortResults(groupedResults);
        } else {
          this.error = "No data from given URL.";
          this.totalResults = 0;
          this.totalPages = 0;
          this.searchMetadata = [];
          this.groupedResults = [];
        }
      });
    } else {
      this.searchMetadata = [];
      this.groupedResults = [];
      this.totalPages = 0;
      this.totalResults = 0;
      this.currentPage = 1;
    }
    this.stopLoading();
    setTimeout(() => {
      document.getElementsByClassName("metadataSearchWrapper")[0].scrollTop = 0;
    }, 100);
  }

  private getGroupedResults(results: MetaData[]) {
    const groupedResults: { [domain: string]: MetaData[]; } = {};

    (results ?? []).forEach((metadata: MetaData) => {
      try {
        if (metadata.url) {
          const urlObject = new URL(metadata.url);
          const domain = urlObject.hostname;

          if (!groupedResults[domain]) {
            groupedResults[domain] = [];
          }
          groupedResults[domain].push(metadata);
        }
      } catch (error) {
        console.error("Invalid URL:", metadata.url);
      }
    });
    return groupedResults;
  }

  private sortResults(groupedResults: { [domain: string]: MetaData[]; }) { 
    this.groupedResults = Object.entries(groupedResults).map(([domain, links]) => {
      const sortedLinks = links.sort((a: any, b: any) => {
        try {
          const urlA = new URL(a.url);
          const urlB = new URL(b.url);

          const isTopLevelA = urlA.pathname === '/' || urlA.pathname === '';
          const isTopLevelB = urlB.pathname === '/' || urlB.pathname === '';

          // Top-level URLs come first
          if (isTopLevelA && !isTopLevelB) return -1;
          if (!isTopLevelA && isTopLevelB) return 1;

          // Then sort by URL length (shorter URLs first)
          const lengthCompare = a.url.length - b.url.length;
          if (lengthCompare !== 0) return lengthCompare;

          // Finally sort alphabetically
          return a.url.localeCompare(b.url);
        } catch (e) {
          console.error('Error parsing URLs:', e);
          return 0;
        }
      });

      return {
        domain,
        links: sortedLinks,
        showSubdomains: false 
      };
    });
  }

  onPageSizeChange() { 
    this.currentPage = 1;
    this.pageSize = parseInt(this.pageSizeDropdown.nativeElement.value);
    this.searchUrl(true);
    this.closeMenuPanel();
  }

  onPageChange(page?: number) {
    let tmpPage = page;
    if (!tmpPage) {
      tmpPage = (this.currentPage + 1);
    }
    if (tmpPage >= 1 && tmpPage <= this.totalPages) {
      this.currentPage = tmpPage;
      this.searchUrl(true);
    }
  }
  showMenuPanel() {
    (document.getElementsByClassName("componentContainer")[0] as HTMLDivElement)?.classList.remove("centeredContainer"); 
    if (!this.storageStats) {
      this.crawlerService.storageStats().then(res => { if (res) this.storageStats = res; });
    }
    if (this.isMenuOpen) {
      this.closeMenuPanel();
      return;
    }
    this.isMenuOpen = true;
    if (this.parentRef) {
      this.parentRef.showOverlay();
    }
  }
  closeMenuPanel() {
    this.isMenuOpen = false;
    if (this.parentRef) {
      this.parentRef.closeOverlay();
    }
  }
  getSanitizedDescription(s?: string): SafeHtml {
    if (!s) return "";
    return this.sanitizer.bypassSecurityTrustHtml(s);
  }
  toggleSubdomains(group: any) {
    group.showSubdomains = !group.showSubdomains;
  }
  seeNew() {
    this.urlInput.nativeElement.value = '*';
    this.searchUrl(true);
  }
  addFavourite(url?: string, imageUrl?: string, title?: string) {
    const targetData = this.searchMetadata.find(x => x.url === url);
    if (targetData) {
      targetData.favouriteCount = (targetData.favouriteCount || 0) + 1;
    }
    this.parentRef?.addFavourite(url, imageUrl, title);
  }
  getHttpStatusMeaning(status: number): string {
    switch (status) {
      case 200:
        return 'OK: The request has succeeded.';
      case 301:
        return 'Moved Permanently: The requested resource has been permanently moved to a new location.';
      case 302:
        return 'Found: The requested resource is temporarily available at a different URL.';
      case 400:
        return 'Bad Request: The server could not understand the request due to invalid syntax.';
      case 401:
        return 'Unauthorized: Authentication is required to access this resource.';
      case 403:
        return 'Forbidden: You do not have permission to access this resource.';
      case 404:
        return 'Not Found: The requested resource could not be found.';
      case 405:
        return 'Method Not Allowed: The HTTP method used is not supported for the requested resource.';
      case 500:
        return 'Internal Server Error: The server encountered an unexpected condition.';
      case 502:
        return 'Bad Gateway: Invalid response from an upstream server.';
      case 503:
        return 'Service Unavailable: The server is temporarily unavailable due to overload or maintenance.';
      case 504:
        return 'Gateway Timeout: The server did not receive a timely response from an upstream server.';
      default:
        return 'Unknown status code.';
    }
  }
}
