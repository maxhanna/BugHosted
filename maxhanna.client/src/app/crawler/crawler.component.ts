import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { CrawlerService } from '../../services/crawler.service';
import { MetaData } from '../../services/datacontracts/social/story';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

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
  groupedResults?: { domain: string; links: MetaData[] }[] = [];

  pageSize: number = 10;  // Default page size
  currentPage: number = 1;
  totalResults: number = 0;  // To be populated by API
  totalPages: number = 0;
  paginatedResults: any[] = [];
  pageSizes: number[] = [10, 20, 30, 50]; // Dropdown options

  @ViewChild('pageSizeDropdown') pageSizeDropdown!: ElementRef<HTMLSelectElement>;
  @ViewChild('urlInput') urlInput!: ElementRef<HTMLInputElement>;
  @Input() url: string = '';
  constructor(private sanitizer: DomSanitizer, private crawlerService: CrawlerService) { super(); }
  ngOnInit() {
    this.parentRef?.addResizeListener();
    this.crawlerService.indexCount().then(res => { if (res) { this.indexCount = parseInt(res); } });

    setTimeout(() => {
      if (this.url) {
        this.urlInput.nativeElement.value = this.url;
        this.url = "";
        this.searchUrl();
      }
    }, 1);

    this.indexUpdateTimer = setInterval(() => {
      if (this.urlInput.nativeElement.value.trim() == '') {
        this.crawlerService.indexCount().then(res => { if (res) { this.indexCount = parseInt(res); } });
      }
    }, 60000);
  }
  ngOnDestroy() {
    clearInterval(this.indexUpdateTimer);
    this.parentRef?.removeResizeListener();
  }

  async searchUrl() {
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
      await this.crawlerService.searchUrl(url, currentPage, pageSize).then(res => {
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
    }
    this.stopLoading();
    document.getElementsByClassName("componentMain")[0].scrollTop = 0;
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
      const sortedLinks = links.sort((a: any, b:any) => {
        const urlA = new URL(a.url);
        const urlB = new URL(b.url);

        // Check if one URL is the top-level URL (i.e., it has no path or only '/' as a path)
        const isTopLevelA = urlA.pathname === '/' || urlA.pathname === '';
        const isTopLevelB = urlB.pathname === '/' || urlB.pathname === '';

        if (isTopLevelA && !isTopLevelB) {
          return -1;  // Move top-level URLs to the front
        } else if (!isTopLevelA && isTopLevelB) {
          return 1;   // Move subpages after top-level URLs
        }

        // If both are top-level or both are subpages, sort them alphabetically by URL
        return a.url.localeCompare(b.url);
      });

      return {
        domain,
        links: sortedLinks
      };
    });
  }

  onPageSizeChange() {
    console.log("apge size changed");
    this.currentPage = 1;
    this.pageSize = parseInt(this.pageSizeDropdown.nativeElement.value);
    this.searchUrl();
    this.closeMenuPanel();
  }

  onPageChange(page?: number) {
    let tmpPage = page;
    if (!tmpPage) {
      tmpPage = (this.currentPage + 1);
    }
    if (tmpPage >= 1 && tmpPage <= this.totalPages) {
      this.currentPage = tmpPage;
      this.searchUrl();
    }
  }
  showMenuPanel() {
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
