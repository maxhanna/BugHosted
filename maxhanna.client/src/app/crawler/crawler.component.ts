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
  loading: boolean = false;
  error: string = '';
  indexCount = 0;
  indexUpdateTimer: any;

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
    this.loading = true; 

    if (url) {
      await this.crawlerService.searchUrl(url).then(res => { 
        if (res && res.length != 0) {
          this.searchMetadata = res;
        } else {
          this.error = "No data from given URL.";
          this.searchMetadata = [];
        }
      });
    } else {
      this.searchMetadata = [];
    }
    this.loading = false;
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
