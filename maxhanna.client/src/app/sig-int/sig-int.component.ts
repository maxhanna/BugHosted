import { Component, OnInit } from '@angular/core';
import { ChildComponent } from '../child.component';
import { NewsService } from '../../services/news.service';
import { SocialService } from '../../services/social.service';
import { Article } from '../../services/datacontracts/news/news-data';
import { Story } from '../../services/datacontracts/social/story';
import { NewsPin } from '../../services/datacontracts/news/news-data';

@Component({
  selector: 'app-sig-int',
  standalone: false,
  templateUrl: './sig-int.component.html',
  styleUrl: './sig-int.component.css'
})
export class SigIntComponent extends ChildComponent implements OnInit {
  isMenuPanelOpen = false;

  stories: Story[] = [];
  newsPins: NewsPin[] = [];
  newsArticles: Article[] = [];
  selectedCard: { type: 'story' | 'newsPin' | 'article', item: Story | NewsPin | Article } | null = null;
  isLoadingCards = false;

  constructor(
    private readonly newsService: NewsService,
    private readonly socialService: SocialService,
  ) {
    super();
  }

  async ngOnInit() {
    await this.loadCards();
  }

  async loadCards() {
    this.isLoadingCards = true;
    await this.loadStories();
    await this.loadNewsPins();
    await this.loadNewsArticles();
    this.isLoadingCards = false;
  }

  async loadStories() {
    const storiesData = await this.socialService.getStories(undefined, undefined, undefined, undefined, undefined, 1, 50);
    if (storiesData?.stories) {
      this.stories = storiesData.stories;
    }
  }

  async loadNewsPins() {
    this.newsPins = await this.newsService.getNewsPins();
  }

  async loadNewsArticles() {
    const newsData = await this.newsService.getAllNews(1, 30);
    if (newsData?.articles) {
      this.newsArticles = newsData.articles;
    }
  }

  onCardSelect(type: 'story' | 'newsPin' | 'article', item: Story | NewsPin | Article) {
    this.selectedCard = { type, item };
  }

  getStoryAuthor(story: Story): string {
    return story.user?.username ?? 'Anonymous';
  }

  getStoryTimeAgo(story: Story): string {
    return story.date ? story.date.toLocaleDateString() : '';
  }

  getPinLocation(pin: NewsPin): string {
    const parts: string[] = [];
    if (pin.label) parts.push(pin.label);
    if (pin.locationType) parts.push(pin.locationType);
    return parts.join(' - ') || 'Unknown Location';
  }

  formatDate(date: Date | null): string {
    if (!date) return '';
    return new Date(date).toLocaleDateString();
  }

  truncate(str: string, len: number): string {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '...' : str;
  }
  ngOnDestroy(): void {
    this.remove_me("SigIntComponent");
  }
  safeDestroy() {
    this.ngOnDestroy();
  }
  showMenuPanel() {
    this.isMenuPanelOpen = true;
    this.parentRef?.showOverlay();
  }

  closeMenuPanel() {
    this.isMenuPanelOpen = false;
    this.parentRef?.closeOverlay();
  }

  isLoadingEventFired(isLoading: any) {
    if (isLoading) {
      this.startLoading();
    } else {
      this.stopLoading();
    }
  }
}
