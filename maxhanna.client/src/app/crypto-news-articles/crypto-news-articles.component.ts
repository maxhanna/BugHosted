import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { AppComponent } from '../app.component';
import { NewsService } from '../../services/news.service';

@Component({
    selector: 'app-crypto-news-articles',
    standalone: false,
    templateUrl: './crypto-news-articles.component.html',
    styleUrls: ['./crypto-news-articles.component.css']
})
export class CryptoNewsArticlesComponent extends ChildComponent implements AfterViewInit, OnDestroy {
    constructor(private changeDetectorRef: ChangeDetectorRef, private newsService: NewsService) { super(); }

    @Input() inputtedParentRef?: AppComponent;

    articles: any[] = [];
    loading = false;

    async ngAfterViewInit() {
        setTimeout(() => {
            this.fetchArticles();
        }, 50);
    }

    ngOnDestroy() { }

    private async fetchArticles() {
        try {
            this.startLoading();
            const sessionToken = await (this.inputtedParentRef ?? this.parentRef)?.getSessionToken() ?? '';

            // Fetch negative-sentiment and crypto-related articles via NewsService
            const negList = await this.newsService.getNegativeToday(sessionToken) ?? [];
            const cryptoList = await this.newsService.getCryptoToday(sessionToken) ?? [];

            // Merge, dedupe by url
            const map = new Map<string, any>();
            (negList || []).forEach((a: any) => { if (a.url) map.set(a.url, { ...a, negative: true }); });
            (cryptoList || []).forEach((a: any) => {
                if (a.url) {
                    const existing = map.get(a.url);
                    if (existing) existing.crypto = true; else map.set(a.url, { ...a, crypto: true });
                }
            });

            this.articles = Array.from(map.values()).sort((a, b) => {
                const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
                const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
                return db - da;
            });
        } catch (err) {
            console.error('Failed to fetch crypto news articles', err);
        } finally {
            this.stopLoading();
        }
    }
}
