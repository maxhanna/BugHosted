import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { AppComponent } from '../app.component';
import { NewsService } from '../../services/news.service';
import { NotepadService } from '../../services/notepad.service';
import { Article } from '../../services/datacontracts/news/news-data';

@Component({
    selector: 'app-crypto-news-articles',
    standalone: false,
    templateUrl: './crypto-news-articles.component.html',
    styleUrls: ['./crypto-news-articles.component.css']
})
export class CryptoNewsArticlesComponent extends ChildComponent implements AfterViewInit, OnDestroy {
    constructor(private changeDetectorRef: ChangeDetectorRef, private newsService: NewsService, private notepadService: NotepadService) { super(); }

    @Input() inputtedParentRef?: AppComponent;
    @ViewChild('articlesContainer') articlesContainer!: ElementRef<HTMLUListElement>;
    showTopButton: boolean = false;
    private _articlesScrollHandler: any;

    articles: Article[] = [];
    selectedArticle?: Article;
    loading = false;
    filter: 'all' | 'negative' | 'crypto' = 'all';
    showPopup = false;
    collapsed = true;

    async ngAfterViewInit() {
        // initial fetch
        setTimeout(() => {
            this.fetchArticles();
        }, 50);

        // attach scroll listener
        this._articlesScrollHandler = () => {
            try {
                const el = this.articlesContainer?.nativeElement;
                this.showTopButton = !!el && el.scrollTop > 0;
                this.changeDetectorRef.markForCheck();
            } catch { this.showTopButton = false; }
        };
        try { this.articlesContainer?.nativeElement.addEventListener('scroll', this._articlesScrollHandler); } catch { }
    }

    private async fetchArticles() {
        try {
            this.startLoading();
            const sessionToken = await (this.inputtedParentRef ?? this.parentRef)?.getSessionToken() ?? '';

            // Fetch negative-sentiment and crypto-related articles via NewsService
            const negRes = await this.newsService.getNegativeToday(sessionToken);
            const cryptoRes = await this.newsService.getCryptoToday(sessionToken);

            const negList = negRes?.articles ?? [];
            const cryptoList = cryptoRes?.articles ?? [];

            // Merge, dedupe by url and set flags
            const map = new Map<string, Article & { negative?: boolean; crypto?: boolean }>();
            negList.forEach((a: Article) => { if (a.url) map.set(a.url, { ...a, negative: true }); });
            cryptoList.forEach((a: Article) => {
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

    // Toggle filter: clicking the same pill clears it back to 'all'
    setFilter(c: 'negative' | 'crypto' | 'all') {
        if (c === 'all') { this.filter = 'all'; return; }
        this.filter = (this.filter === c) ? 'all' : c;
    }

    get displayedArticles(): Article[] {
        if (!this.articles || this.articles.length === 0) return [];
        if (this.filter === 'all') return this.articles;
        if (this.filter === 'negative') return this.articles.filter(a => !!a.negative);
        if (this.filter === 'crypto') return this.articles.filter(a => !!a.crypto);
        return this.articles;
    }

    get hasNeg(): boolean { return this.articles.some(a => !!a.negative); }
    get hasCrypto(): boolean { return this.articles.some(a => !!a.crypto); }
    get negCount(): number { return this.articles.filter(a => !!a.negative).length; }
    get cryptoCount(): number { return this.articles.filter(a => !!a.crypto).length; }

    openSource(url: string) {
        this.closeArticle();
        this.parentRef?.visitExternalLink(url);
    }

    selectArticle(article: Article): void {
        if (this.selectedArticle && this.selectedArticle.url === article.url) { 
            this.closeArticle(); 
            return; 
        }
        this.openArticle(article);
    }

    openArticle(article: Article) {
        this.selectedArticle = article;
        this.showPopup = true;
        this.inputtedParentRef?.showOverlay();
    }

    closeArticle() {
        this.selectedArticle = undefined;
        this.showPopup = false;
        this.inputtedParentRef?.closeOverlay();
    }

    getAuthors(article: Article): string {
        if (!article?.author || article.author === '') return 'Unknown';
        const authors = article.author.split(',').map(a => a.trim());
        return authors.join(', ');
    }

    saveArticle(article: Article) {
        if (this.parentRef?.user?.id) {
            let text = article.title + "\n" + article.content + "\n" + article.url;
            this.notepadService.addNote(this.parentRef.user.id, text).then((_res: any) => {
                this.inputtedParentRef?.createComponent("Notepad", { "inputtedSearch": text });
            });
        }
    }

    toggleCollapsed() {
        this.collapsed = !this.collapsed;
        try {
            const el = this.articlesContainer?.nativeElement;
            this.showTopButton = !!el && el.scrollTop > 0;
            this.changeDetectorRef.markForCheck();
        } catch { this.showTopButton = false; }
    }

    scrollTop() {
        try {
            if (this.articlesContainer && this.articlesContainer.nativeElement) {
                this.articlesContainer.nativeElement.scrollTop = 0;
            }
        } catch { }
    }

    ngOnDestroy() {
        try { if (this.articlesContainer?.nativeElement && this._articlesScrollHandler) this.articlesContainer.nativeElement.removeEventListener('scroll', this._articlesScrollHandler); } catch { }
    }
}
