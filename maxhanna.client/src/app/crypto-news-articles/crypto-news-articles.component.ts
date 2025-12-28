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
    // keep an immutable base copy of merged articles so toggles can restore
    baseArticles: Article[] = [];
    // coin pill state
    coinPills: string[] = [];
    coinCounts: Record<string, number> = {};
    selectedCoin: string | null = null;
    selectedArticle?: Article;
    loading = false;
    // current view: base (merged), negative, crypto, coin
    currentView: 'base' | 'negative' | 'crypto' | 'coin' = 'base';
    showPopup = false;
    collapsed = true;
    negCountServer: number = 0;
    cryptoCountServer: number = 0;
    previewLoaded = false;
    fullLoaded = false;
    fullLoadedAt: Date | null = null;
    fullLoadedTTLMinutes: number = 10; // configurable TTL for full data
    fullLoading = false;

    async ngAfterViewInit() {
        // Load a lightweight preview (counts + up to 5 articles). Full load happens on expand.
        setTimeout(() => {
            // fire-and-forget preview load
            void this.fetchPreview();
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

    ngOnDestroy() {
        try { if (this.articlesContainer?.nativeElement && this._articlesScrollHandler) this.articlesContainer.nativeElement.removeEventListener('scroll', this._articlesScrollHandler); } catch { }
    }

    private async fetchArticles() {
        try {
            this.startLoading();
            const sessionToken = await (this.inputtedParentRef ?? this.parentRef)?.getSessionToken() ?? '';

            // Fetch negative-sentiment and crypto-related articles via NewsService
            const negRes = await this.newsService.getNegativePreview(5, sessionToken);
            const cryptoRes = await this.newsService.getCryptoPreview(5, sessionToken);

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

            // Fetch coin counts from server and populate pills
            try {
                const sessionToken = await (this.inputtedParentRef ?? this.parentRef)?.getSessionToken() ?? '';
                const counts = await this.newsService.getCoinCounts(sessionToken);
                this.coinPills = [];
                this.coinCounts = {};
                if (counts) {
                    for (const [name, cnt] of Object.entries(counts)) {
                        if (cnt > 0) {
                            this.coinPills.push(name);
                            this.coinCounts[name] = cnt;
                        }
                    }
                }
            } catch (err) {
                console.warn('Could not fetch coin counts from server, falling back to client counts', err);
                // fallback: leave coinPills/coinCounts empty (or optionally compute locally)
                this.coinPills = [];
                this.coinCounts = {};
            }
            // store baseArticles and server-side neg/crypto counts so toggles restore correctly
            this.baseArticles = [...this.articles];
            this.negCountServer = negList.length;
            this.cryptoCountServer = cryptoList.length;
            // mark full data as loaded and set timestamp for TTL
            this.fullLoaded = true;
            this.fullLoadedAt = new Date();
        } catch (err) {
            console.error('Failed to fetch crypto news articles', err);
        } finally {
            this.stopLoading();
        }
    }

    // Treat negative/crypto as coin-like pills: fetch from server and replace articles
    async setFilter(c: 'negative' | 'crypto' | 'all') {
        try {
            const sessionToken = await (this.inputtedParentRef ?? this.parentRef)?.getSessionToken() ?? '';
            if (c === 'all') {
                this.currentView = 'base';
                this.selectedCoin = null;
                this.articles = [...this.baseArticles];
                return;
            }

            if (c === 'negative') {
                // toggle behavior
                if (this.currentView === 'negative') {
                    this.currentView = 'base';
                    this.articles = [...this.baseArticles];
                    this.selectedCoin = null;
                    return;
                }
                const res = await this.newsService.getNegativeToday(sessionToken);
                const arr = res?.articles ?? [];
                // mark negative flag
                this.articles = arr.map(a => ({ ...a, negative: true } as Article));
                this.currentView = 'negative';
                this.selectedCoin = null;
                return;
            }

            if (c === 'crypto') {
                if (this.currentView === 'crypto') {
                    this.currentView = 'base';
                    this.articles = [...this.baseArticles];
                    this.selectedCoin = null;
                    return;
                }
                const res = await this.newsService.getCryptoToday(sessionToken);
                const arr = res?.articles ?? [];
                this.articles = arr.map(a => ({ ...a, crypto: true } as Article));
                this.currentView = 'crypto';
                this.selectedCoin = null;
                return;
            }
        } catch (err) {
            console.error('Failed to set filter', err);
        }
    }

    // called when a coin pill is toggled from the template; fetch coin-specific articles from server
    async toggleCoin(coin: string) {
        try {
            // if clicking the same coin, clear selection
            if (this.selectedCoin === coin) {
                this.selectedCoin = null;
                this.currentView = 'base';
                this.articles = [...this.baseArticles];
                return;
            }

            this.selectedCoin = coin;
            const sessionToken = await (this.inputtedParentRef ?? this.parentRef)?.getSessionToken() ?? '';
            const res = await this.newsService.getArticlesByCoin(coin, sessionToken);
            const arr = res?.articles ?? [];

            // mark flags by checking against existing negative/crypto flags where urls match
            const urlSet = new Set(this.articles.map(a => a.url));
            const merged = arr.map(a => ({ ...a, negative: this.articles.find(x => x.url === a.url)?.negative, crypto: true }));

            // replace displayed pool with coin-specific fetched articles (do not modify counts)
            this.articles = (merged as unknown as Article[]).concat(this.baseArticles.filter(a => !urlSet.has(a.url))).sort((a, b) => {
                const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
                const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
                return db - da;
            });
            this.currentView = 'coin';
        } catch (err) {
            console.error('Failed to fetch coin articles', err);
        }
    }

    get displayedArticles(): Article[] {
        return this.articles || [];
    }

    get hasNeg(): boolean { return this.negCountServer > 0; }
    get hasCrypto(): boolean { return this.cryptoCountServer > 0; }
    // legacy getters kept for compatibility but UI shows server counts
    get negCount(): number { return this.negCountServer; }
    get cryptoCount(): number { return this.cryptoCountServer; }

    openSource(url: string) {
        this.closeArticle();
        setTimeout(() => {
            this.parentRef?.visitExternalLink(url);
        }, 50);
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

    async toggleCollapsed() {
        this.collapsed = !this.collapsed;
        try {
            const el = this.articlesContainer?.nativeElement;
            this.showTopButton = !!el && el.scrollTop > 0;
            this.changeDetectorRef.markForCheck();
        } catch { this.showTopButton = false; }

        // If panel was just expanded and we haven't loaded the full article set yet, fetch full articles now.
        if (!this.collapsed && !this.loading) {
            // If we have the full data and it's still within the TTL, skip reloading
            if (this.fullLoaded && this.fullLoadedAt) {
                const ageMinutes = (Date.now() - this.fullLoadedAt.getTime()) / 60000.0;
                if (ageMinutes <= this.fullLoadedTTLMinutes) {
                    return;
                }
            }

            // perform full load and show loading indicator on the expand button
            this.fullLoading = true;
            try {
                await this.fetchArticles();
            } finally {
                this.fullLoading = false;
            }
        }
    }

    // Lightweight preview: load counts and at most N articles (5)
    private async fetchPreview(limit: number = 5) {
        try {
            this.startLoading();
            const sessionToken = await (this.inputtedParentRef ?? this.parentRef)?.getSessionToken() ?? '';

            const negRes = await this.newsService.getNegativeToday(sessionToken);
            const cryptoRes = await this.newsService.getCryptoToday(sessionToken);

            const negList = negRes?.articles ?? [];
            const cryptoList = cryptoRes?.articles ?? [];

            const map = new Map<string, Article & { negative?: boolean; crypto?: boolean }>();
            negList.forEach((a: Article) => { if (a.url) map.set(a.url, { ...a, negative: true }); });
            cryptoList.forEach((a: Article) => {
                if (a.url) {
                    const existing = map.get(a.url);
                    if (existing) existing.crypto = true; else map.set(a.url, { ...a, crypto: true });
                }
            });

            const merged = Array.from(map.values()).sort((a, b) => {
                const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
                const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
                return db - da;
            });

            // Keep only a small preview
            const preview = merged.slice(0, limit);

            // Fetch coin counts (so pills show correct counts)
            try {
                const counts = await this.newsService.getCoinCounts(sessionToken);
                this.coinPills = [];
                this.coinCounts = {};
                if (counts) {
                    for (const [name, cnt] of Object.entries(counts)) {
                        if (cnt > 0) {
                            this.coinPills.push(name);
                            this.coinCounts[name] = cnt;
                        }
                    }
                }
            } catch (err) {
                console.warn('Could not fetch coin counts from server for preview', err);
                this.coinPills = [];
                this.coinCounts = {};
            }

            this.articles = preview as Article[];
            this.baseArticles = [...this.articles];
            this.negCountServer = negList.length;
            this.cryptoCountServer = cryptoList.length;
            this.previewLoaded = true;
            this.fullLoaded = false;
        } catch (err) {
            console.error('Failed to fetch crypto news preview', err);
        } finally {
            this.stopLoading();
        }
    }

    scrollTop() {
        try {
            if (this.articlesContainer && this.articlesContainer.nativeElement) {
                this.articlesContainer.nativeElement.scrollTop = 0;
            }
        } catch { }
    }

    // Handle dropdown selection: 'all' | 'negative' | 'crypto' | 'coin:CoinName'
    onSelectView(value: string) {
        if (!value) return;
        if (value === 'all') {
            this.setFilter('all');
            return;
        }
        if (value === 'negative') {
            this.setFilter('negative');
            return;
        }
        if (value === 'crypto') {
            this.setFilter('crypto');
            return;
        }
        if (value.startsWith('coin:')) {
            const coin = value.substring('coin:'.length);
            this.toggleCoin(coin);
            return;
        }
    }

}
