import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { NewsService } from '../../services/news.service';
import { Article, ArticlesResult, Statuses } from '../../services/datacontracts/news/news-data';
import { NotepadService } from '../../services/notepad.service';

@Component({
    selector: 'app-news',
    templateUrl: './news.component.html',
    styleUrl: './news.component.css',
    standalone: false
})
export class NewsComponent extends ChildComponent implements OnInit, OnDestroy {
  newsArticles?: undefined | ArticlesResult;
  selectedArticle?: Article;
  notifications: string[] = [];
  defaultSearch? : string;
  currentPage: number = 1;
  pageSize: number = 10; // Number of articles per page
  totalPages: number = 1;
  totalResults: number = 0;

  @ViewChild('searchKeywords') searchKeywords!: ElementRef<HTMLInputElement>;
  @ViewChild('defaultSearchInput') defaultSearchInput!: ElementRef<HTMLInputElement>;
  @ViewChild('newsList') newsList!: ElementRef<HTMLDivElement>; // Reference to newsList div

  constructor(private newsService: NewsService, private notepadService: NotepadService) {
    super();
  }
  async ngOnInit() {
    let preventLoadNews = false;
    if (this.parentRef?.user?.id) {
      try {
        this.newsService.getDefaultSearch(this.parentRef.user.id).then(
          res => {
            if (res) {
              setTimeout(() => {
                this.defaultSearch = res ?? ""; 
                if (this.defaultSearch) {
                  this.searchKeywords.nativeElement.value = this.defaultSearch;
                  this.searchByKeyword();
                  preventLoadNews = true;
                }
              }, 30);
            } else {
              this.defaultSearch = "";
            }
          });
      }
      catch (error) {
        this.defaultSearch = "";
      }  
    }
    if (!preventLoadNews) { 
      this.loadNews(); 
    }

    this.parentRef?.addResizeListener();
  }

  ngOnDestroy() {
    this.parentRef?.removeResizeListener();
  }

  async loadNews(data?: ArticlesResult) { 
    this.startLoading();
    try {
      if (data) {
        this.newsArticles = data;
        this.totalResults = data.totalResults || 0; // Fallback to 0 if undefined
        this.totalPages = Math.ceil(this.totalResults / this.pageSize) || 1; // Ensure at least 1 page
      } else {
        this.newsArticles = await this.newsService.getAllNews(this.currentPage, this.pageSize) as ArticlesResult;

        if (this.newsArticles) {
          this.totalResults = this.newsArticles.totalResults || 0;
          this.totalPages = Math.ceil(this.totalResults / this.pageSize) || 1;
        } else { 
          this.newsArticles = { articles: [], totalResults: 0, status: Statuses.OK };
          this.totalResults = 0;
          this.totalPages = 1;
          this.parentRef?.showNotification("No news data");
        }
      }
    } catch (e){ 
      this.newsArticles = { articles: [], totalResults: 0,   };
      this.totalResults = 0;
      this.totalPages = 1;
      this.parentRef?.showNotification("Error fetching news data");
    }
    if (this.newsList?.nativeElement) {
      this.newsList.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
    }
    this.stopLoading();
  }
  async searchByKeyword() { 
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      try {
        const keywords = this.searchKeywords.nativeElement.value;
        if (!keywords) {
          this.currentPage = 1; // Reset to first page
          return await this.loadNews();
        }

        const response = await this.newsService.searchNews(
          keywords,
          this.currentPage,
          this.pageSize
        );

        if (response == null) {
          this.parentRef?.showNotification("Error fetching news data");
          return;
        }

        this.loadNews(response);
      } catch {
        this.parentRef?.showNotification("Error fetching news data");
      }
    }, 100);
  } 

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadNews();
    }
  }

  previousPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadNews();
    }
  }
  openSource(url: string) {
    this.selectedArticle = undefined;
    this.parentRef?.visitExternalLink(url);  
  }
  selectArticle(article: Article): void {
    if (this.selectedArticle) {
      this.selectedArticle = undefined;
      return;
    }
    this.selectedArticle = article;
    this.parentRef?.hideBodyOverflow();
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
    if (this.parentRef?.user?.id) {
      this.newsService.saveDefaultSearch(this.parentRef.user.id, text).then(res => {
        if (res) { 
          this.parentRef?.showNotification(res);
        }
      });
    } 
  }
  saveArticle(article: Article) {
    if (this.parentRef?.user?.id) {
      let text = article.title + "\n" + article.content + "\n" + article.url;
      this.notepadService.addNote(this.parentRef.user.id, text).then(res => { 
        this.parentRef?.createComponent("Notepad", { "inputtedSearch": text });  
      }); 
    }
  }
}
