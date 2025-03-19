import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { CrawlerService } from '../../services/crawler.service'; 
import { MetaData } from '../../services/datacontracts/social/story';
@Component({
  selector: 'app-crawler',
  templateUrl: './crawler.component.html',
  styleUrl: './crawler.component.css'
})
export class CrawlerComponent extends ChildComponent implements OnInit, OnDestroy {
  url: string = '';
  searchMetadata: MetaData[] = [];
  loading: boolean = false;
  error: string = '';
  indexCount = 0;

  @ViewChild('urlInput') urlInput!: ElementRef<HTMLInputElement>;
  constructor(private crawlerService: CrawlerService) { super(); }
  ngOnInit() {
    this.parentRef?.addResizeListener();
    this.crawlerService.indexCount().then(res => { if (res) { this.indexCount = parseInt(res); } });
  }
  ngOnDestroy() {
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

}
