import { Component } from '@angular/core'; 
import { CrawlerService } from '../../services/crawler.service';



  
@Component({
  selector: 'app-youtube-search',
  templateUrl: './youtube-search.component.html',
  styleUrl: './youtube-search.component.css',
  standalone: false
})
export class YoutubeSearchComponent {
  keyword = '';
  videos: any[] = [];
  isLoading = false;

  constructor(private crawlerService: CrawlerService) { }

  async search() {
    this.isLoading = true;
    this.videos = [];

    const result = await this.crawlerService.searchYoutube(this.keyword);
    if (Array.isArray(result)) {
      this.videos = result;
    }

    this.isLoading = false;
  }
}
