import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnInit, AfterViewInit, Output, SimpleChanges, ViewChild } from '@angular/core'; 
import { CrawlerService } from '../../services/crawler.service';
import { ChildComponent } from '../child.component';
import { AppComponent } from '../app.component'; 
  
@Component({
  selector: 'app-youtube-search',
  templateUrl: './youtube-search.component.html',
  styleUrl: './youtube-search.component.css',
  standalone: false,  
  changeDetection: ChangeDetectionStrategy.OnPush 
})
export class YoutubeSearchComponent extends ChildComponent implements OnChanges, OnInit, AfterViewInit { 
  videos: any[] = []; 
  hasSearched = false;

  @Input() keyword: string = '';
  @Input() inputtedParentRef?: AppComponent;
  @Output() selectVideoEvent = new EventEmitter<any>();
  
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  constructor(private crawlerService: CrawlerService, private cdr: ChangeDetectorRef) { super(); }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['keyword'] && this.keyword?.trim()) {
      if (this.keyword === this.parentRef?.getYoutubeSearchKeyword()) {
        this.videos = this.parentRef?.getYoutubeSearchResults() ?? [];
        this.keyword = this.parentRef?.getYoutubeSearchKeyword() ?? '';
        this.searchInput!.nativeElement.value = this.keyword;
      } else { 
        this.search();
      }
    }
    console.log("YouTube Search Component input changes detected:", changes);
  }

  ngOnInit() { 
    try { this.parentRef?.notifyYoutubeSearchOpened(); } catch { }
    console.log("YouTube Search Component initialized with keyword:", this.keyword);
  }

  ngAfterViewInit() { 
    try {
      const parentKeyword = this.parentRef?.getYoutubeSearchKeyword() ?? '';
      if ((!this.keyword || !this.keyword.trim()) && parentKeyword) {
        if (this.searchInput && this.searchInput.nativeElement) {
          this.searchInput.nativeElement.value = parentKeyword;
        }
      }
      this.videos = this.parentRef?.getYoutubeSearchResults() ?? [];
    } catch (e) { console.error(e); }
    console.log("YouTube Search Component view initialized. Current keyword:", this.keyword, "Videos count:", this.videos.length);
  }

  selectVideo(video: any) {
    this.selectVideoEvent.emit(video);
    this.parentRef?.closeOverlay();
  }

  async search() {
    this.startLoading();
    this.videos = [];
    const keyword = this.searchInput?.nativeElement.value.trim();
    if (keyword) {
      const result = await this.crawlerService.searchYoutube(keyword);
      if (Array.isArray(result)) {
        this.videos = result;
        this.parentRef?.setYoutubeSearchResults(keyword, this.videos); 
      }
    } 
    this.hasSearched = true;
    this.stopLoading();
    this.cdr.markForCheck();
  }
}
