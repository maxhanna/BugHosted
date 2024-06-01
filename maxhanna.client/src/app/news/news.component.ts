import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { NewsService } from '../../services/news.service';
import { NewsItem, NewsResponse } from '../../services/datacontracts/news-data';

@Component({
  selector: 'app-news',
  templateUrl: './news.component.html',
  styleUrl: './news.component.css'
})
export class NewsComponent extends ChildComponent implements OnInit {
  newsArticles?: undefined | NewsResponse;
  selectedArticle?: NewsItem;
  notifications: string[] = [];
  @ViewChild('searchKeywords') searchKeywords!: ElementRef<HTMLInputElement>;

  constructor(private newsService: NewsService) {
    super();
  }
  ngOnInit() {
    this.loadNews();
  }

  async loadNews(data?: NewsResponse) {
    try {
      if (data) {
        this.newsArticles = data;
      } else {
        this.newsArticles = await this.newsService.getAllNews(this.parentRef?.user!) as NewsResponse;
        if (this.newsArticles == null) {
          this.notifications.push("Error fetching news data");
        }
      }
    } catch {
      this.notifications.push("Error fetching news data");
    }
  }


  selectArticle(article: NewsItem): void {
    if (this.selectedArticle) {
      this.selectedArticle = undefined;
      return;
    }
    this.selectedArticle = article;
  }

  async searchByKeyword() {
    try {
      const keywords = this.searchKeywords.nativeElement.value;
      if (!keywords) { return alert("You must enter some keywords"); }
      const response = await this.newsService.searchNews(this.parentRef?.user!, keywords);
      if (response == null) {
        this.notifications.push("Error fetching news data");
        return;
      }
      this.loadNews(response!);
      this.searchKeywords.nativeElement.value = ''; 
    } catch { 
      this.notifications.push("Error fetching news data");
    }
  }
}
