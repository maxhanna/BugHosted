import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core'; 
import { CrawlerService } from '../../services/crawler.service';
import { ChildComponent } from '../child.component';
import { AppComponent } from '../app.component';
import { DecodeHtmlPipe } from '../decode-html.pipe'; 



  
@Component({
  selector: 'app-youtube-search',
  templateUrl: './youtube-search.component.html',
  styleUrl: './youtube-search.component.css',
  standalone: false,  
  changeDetection: ChangeDetectionStrategy.OnPush 
})
export class YoutubeSearchComponent extends ChildComponent implements OnChanges { 
  videos: any[] = []; 
  hasSearched = false;

  @Input() keyword: string = '';
  @Input() inputtedParentRef?: AppComponent;
  @Output() selectVideoEvent = new EventEmitter<any>();
  
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  constructor(private crawlerService: CrawlerService, private cdr: ChangeDetectorRef) { super(); }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['keyword'] && this.keyword?.trim()) {
      this.search();
    }
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
      }
    } 
    this.hasSearched = true;
    this.stopLoading();
    this.cdr.markForCheck();
  }
}
