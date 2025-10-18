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
    // coin pill state
    coinPills: string[] = [];
    coinCounts: Record<string, number> = {};
    selectedCoin: string | null = null;
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

    ngOnDestroy() {
        try { if (this.articlesContainer?.nativeElement && this._articlesScrollHandler) this.articlesContainer.nativeElement.removeEventListener('scroll', this._articlesScrollHandler); } catch { }
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

    // called when a coin pill is toggled from the template; fetch coin-specific articles from server
    async toggleCoin(coin: string) {
        try {
            // if clicking the same coin, clear selection
            if (this.selectedCoin === coin) {
                this.selectedCoin = null;
                // refetch base sets (neg/crypto) - we already have this.articles populated
                return;
            }

            this.selectedCoin = coin;
            const sessionToken = await (this.inputtedParentRef ?? this.parentRef)?.getSessionToken() ?? '';
            const res = await this.newsService.getArticlesByCoin(coin, sessionToken);
            const arr = res?.articles ?? [];

            // mark flags by checking against existing negative/crypto flags where urls match
            const urlSet = new Set(this.articles.map(a => a.url));
            const merged = arr.map(a => ({ ...a, negative: this.articles.find(x => x.url === a.url)?.negative, crypto: true }));

            // replace displayed pool with coin-specific fetched articles
            // cast to Article[] to satisfy the declared array element type
            this.articles = (merged as unknown as Article[]).concat(this.articles.filter(a => !urlSet.has(a.url))).sort((a, b) => {
                const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
                const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
                return db - da;
            });
        } catch (err) {
            console.error('Failed to fetch coin articles', err);
        }
    }

    get displayedArticles(): Article[] {
        if (!this.articles || this.articles.length === 0) return [];

        // Start with base set depending on negative/crypto filter
        let base = this.articles;
        if (this.filter === 'negative') base = base.filter(a => !!a.negative);
        else if (this.filter === 'crypto') base = base.filter(a => !!a.crypto);

        // if a specific coin is selected via pill, further filter the base set by coin keywords
        if (this.selectedCoin) {
            const coinMap: Record<string, RegExp> = {
                'Ethereum': /\bethereum\b|\beth\b/i,
                'Dogecoin': /\bdoge(coin)?\b|\bxdg\b/i,
                'XRP': /\bxrp\b/i,
                'Solana': /\bsolana\b|\bsol\b/i
            };
            const regex = coinMap[this.selectedCoin];
            if (regex) base = base.filter(a => (a.title || '').match(regex) || (a.description || '').match(regex) || (a.content || '').match(regex));
        }

        return base;
    }

    get hasNeg(): boolean { return this.articles.some(a => !!a.negative); }
    get hasCrypto(): boolean { return this.articles.some(a => !!a.crypto); }
    get negCount(): number { return this.articles.filter(a => !!a.negative).length; }
    get cryptoCount(): number { return this.articles.filter(a => !!a.crypto).length; }

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

}
