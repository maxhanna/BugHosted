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
      const parent = this.inputtedParentRef ?? this.parentRef;
      if (this.keyword === parent?.getYoutubeSearchKeyword()) {
        this.videos = parent?.getYoutubeSearchResults() ?? [];
        this.keyword = parent?.getYoutubeSearchKeyword() ?? '';
        setTimeout(() => { 
          if (this.searchInput && this.searchInput.nativeElement) {
            this.searchInput.nativeElement.value = this.keyword;
          }
        }, 100);
      } else { 
        this.search();
      }
    } 
  }

  ngOnInit() { 
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.notifyYoutubeSearchOpened(); 
  }

  ngAfterViewInit() { 
    try {
      const parent = this.inputtedParentRef ?? this.parentRef;
      const parentKeyword = parent?.getYoutubeSearchKeyword() ?? '';
      if ((!this.keyword || !this.keyword.trim()) && parentKeyword) {
        if (this.searchInput && this.searchInput.nativeElement) {
          this.searchInput.nativeElement.value = parentKeyword;
        }
      }
      this.videos = parent?.getYoutubeSearchResults() ?? [];
    } catch (e) { console.error(e); }
  }

  selectVideo(video: any) {
    this.selectVideoEvent.emit(video);
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.closeOverlay();
  }

  async search() {
    this.startLoading();
    this.videos = []; 
    const keyword = this.searchInput?.nativeElement?.value?.trim();
    if (keyword) {
      const result = await this.crawlerService.searchYoutube(keyword);
      if (Array.isArray(result)) {
        this.videos = result;
        const parent = this.inputtedParentRef ?? this.parentRef;
        if (parent) {
          parent.setYoutubeSearchResults(keyword, result); 
        }
      }
    } 
    this.hasSearched = true;
    this.stopLoading();
    this.cdr.markForCheck();
  }
}
