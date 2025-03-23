import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { CrawlerService } from '../../services/crawler.service'; 
import { MetaData } from '../../services/datacontracts/social/story'; 
@Component({
  selector: 'app-crawler',
  templateUrl: './crawler.component.html',
  styleUrl: './crawler.component.css'
})
export class CrawlerComponent extends ChildComponent implements OnInit, OnDestroy { 
  searchMetadata: MetaData[] = []; 
  error: string = '';
  indexCount = 0;
  indexUpdateTimer: any;
  isMenuOpen = false;
  lastSearch = "";

  pageSize: number = 10;  // Default page size
  currentPage: number = 1;
  totalResults: number = 0;  // To be populated by API
  totalPages: number = 0;
  paginatedResults: any[] = [];
  pageSizes: number[] = [10, 20, 30, 50]; // Dropdown options

  @ViewChild('pageSizeDropdown') pageSizeDropdown!: ElementRef<HTMLSelectElement>;
  @ViewChild('urlInput') urlInput!: ElementRef<HTMLInputElement>;
  @Input() url: string = '';
  constructor(private crawlerService: CrawlerService) { super(); }
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
      this.crawlerService.indexCount().then(res => { if (res) { this.indexCount = parseInt(res); } });
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
    this.isLoading = true; 

    if (url) {
      await this.crawlerService.searchUrl(url, currentPage, pageSize).then(res => { 
        if (res && res.totalResults != 0) {
          this.totalResults = res.totalResults;  
          this.totalPages = Math.ceil(this.totalResults / this.pageSize);
          this.searchMetadata = res.results ?? [];
        } else {
          this.error = "No data from given URL.";
          this.totalResults = 0;
          this.totalPages = 0;
          this.searchMetadata = [];
        }
      });
    } else {
      this.searchMetadata = [];
    }
    this.isLoading = false;
    document.getElementsByClassName("componentMain")[0].scrollTop = 0;
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
