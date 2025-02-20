import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { NewsService } from '../../services/news.service';
import { Article, ArticlesResult } from '../../services/datacontracts/news/news-data';
import { NotepadService } from '../../services/notepad.service';

@Component({
  selector: 'app-news',
  templateUrl: './news.component.html',
  styleUrl: './news.component.css'
})
export class NewsComponent extends ChildComponent implements OnInit {
  newsArticles?: undefined | ArticlesResult;
  selectedArticle?: Article;
  notifications: string[] = [];
  defaultSearch? : string;
  @ViewChild('searchKeywords') searchKeywords!: ElementRef<HTMLInputElement>;
  @ViewChild('defaultSearchInput') defaultSearchInput!: ElementRef<HTMLInputElement>;

  constructor(private newsService: NewsService, private notepadService: NotepadService) {
    super();
  }
  async ngOnInit() {
    let preventLoadNews = false;
    if (this.parentRef?.user) {
      this.newsService.getDefaultSearch(this.parentRef.user).then(res => {
        if (res) {
          setTimeout(() => {
            this.defaultSearch = res;
            console.log(res);
            if (this.defaultSearch) {
              this.searchKeywords.nativeElement.value = this.defaultSearch;
              this.searchByKeyword();
              preventLoadNews = true;
            } 
          }, 30);
        }
      })
    }
    if (!preventLoadNews) { 
      this.loadNews(); 
    }
  }

  async loadNews(data?: ArticlesResult) {
    this.startLoading();
    try {
      if (data) {
        this.newsArticles = data;
      } else {
        this.newsArticles = await this.newsService.getAllNews(this.parentRef?.user!) as ArticlesResult;

        if (this.newsArticles == null) {
          this.parentRef?.showNotification("Error fetching news data"); 
        }
      }
    } catch {
      this.parentRef?.showNotification("Error fetching news data"); 
    }
    this.stopLoading();
  }

  openSource(url: string) {
    this.selectedArticle = undefined;
    window.open(url, '_blank');
  }
  selectArticle(article: Article): void {
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
        this.parentRef?.showNotification("Error fetching news data"); 
        return;
      }
      this.loadNews(response!);
      this.searchKeywords.nativeElement.value = ''; 
    } catch {
      this.parentRef?.showNotification("Error fetching news data"); 
    }
  }

  getAuthors(article: Article): string {
    // Function to format authors' names
    if (!article.author || article.author === '') {
      return 'Unknown';
    } else {
      // Split authors by comma and trim extra spaces
      const authors = article.author.split(',').map(author => author.trim());
      return authors.join(', ');
    }
  }
  saveDefaultSearch() {
    const text = this.defaultSearchInput.nativeElement.value;
    if (this.parentRef?.user) { 
      this.newsService.saveDefaultSearch(this.parentRef.user, text).then(res => {
        if (res) { 
          this.parentRef?.showNotification(res);
        }
      });
    }
    console.log(text);
  }
  saveArticle(article: Article) {
    if (this.parentRef?.user) {
      let text = article.title + "\n" + article.content + "\n" + article.url;
      this.notepadService.addNote(this.parentRef.user, text).then(res => { 
        this.parentRef?.createComponent("Notepad", { "inputtedSearch": text });  
      }); 
    }
  }
}
