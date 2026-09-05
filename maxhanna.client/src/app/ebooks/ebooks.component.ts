import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';

/** Minimal structural types for the parts of pdf.js we use — the dynamic import
 *  is cast through this so the app never hard-depends on pdf.js typing quirks. */
type PdfViewport = { width: number; height: number; clone(o: { scale: number }): PdfViewport };
type PdfPageLike = {
  getViewport(o: { scale: number }): PdfViewport;
  render(p: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }): { cancel(): void; promise: Promise<void> };
};
type PdfDoc = {
  numPages: number;
  getPage(n: number): Promise<PdfPageLike>;
  destroy(): Promise<void>;
};
type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: ArrayBuffer }): { promise: Promise<PdfDoc> };
};

/** Minimal structural types for the parts of epub.js we use — same approach as
 *  the pdf.js types above. EPUB positions are saved as CFIs (free-form strings). */
type EpubTocItem = { label: string; href: string; subitems?: { items: EpubTocItem[] } };
type EpubLocation = { start?: { cfi?: string; href?: string } };
type EpubThemes = { default(o: string | Record<string, unknown>): void; fontSize(size: string): void };
type EpubRendition = {
  display(target?: string): Promise<unknown>;
  prev(): void;
  next(): void;
  resize?(w?: number | string, h?: number | string): void;
  destroy(): void;
  themes?: EpubThemes;
  on(ev: string, cb: (payload: unknown) => void): void;
};
type EpubBookLike = {
  loaded: { metadata: Promise<{ title?: string; creator?: string }> };
  toc?: EpubTocItem[];
  renderTo(el: HTMLElement, o: { width: string; height: string; flow?: string; spread?: string }): EpubRendition;
  destroy(): void;
};
type EpubJs = { Book(data: ArrayBuffer, opts?: object): EpubBookLike };
import { ChildComponent } from '../child.component';
import { AppComponent } from '../app.component';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { BookEntry } from '../../services/datacontracts/books/book-entry';
import { BooksService } from '../../services/books.service';
import { FileService } from '../../services/file.service';
import { FileSearchComponent } from '../file-search/file-search.component';

@Component({
  selector: 'app-ebooks',
  templateUrl: './ebooks.component.html',
  styleUrl: './ebooks.component.css',
  standalone: false
})
export class EbooksComponent extends ChildComponent implements AfterViewInit {
  @Input() inputtedParentRef?: AppComponent;
  @Input() showTitleBar = true;
  @Input() preloadBookId?: number;

  @ViewChild(FileSearchComponent) fileSearch?: FileSearchComponent;
  @ViewChild('pdfCanvas') pdfCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('epubHost') epubHost?: ElementRef<HTMLDivElement>;

  isMenuPanelOpen = false;

  // ---- uploads & folders ----
  // Books-relative folder currently browsed ('' = Books root). Uploads via the
  // toolbar uploader land in the folder being viewed.
  currentFolder = '';
  showNewFolderPrompt = false;
  newFolderName = '';

  // ---- reader ----
  readingBook?: BookEntry;
  readerObjectUrl?: string;
  readerBlobType = '';
  /** Fullscreen reading: the reader panel fills the whole screen. CSS-driven
   *  so it also works on iOS, where the element-fullscreen API is unavailable. */
  readerFullscreen = false;
  /** Whether a history entry was pushed so mobile back exits fullscreen. */
  private fsHistoryPushed = false;
  isLoadingReader = false;
  readerError = '';
  textContent = '';
  pdfPage = 1;
  zoom = 1.0;
  pdfPages = 1;
  // Reading progress: fetched in parallel with the book download, restored once
  // the page/text has rendered, and saved debounced as the user reads.
  private savedProgress: { page: number; scroll: number; position?: string | null } | null = null;
  private restoringProgress = false;
  private progressSaveTimer: any = null;

  // ---- EPUB reader ----
  epubToc: EpubTocItem[] = [];
  epubTocHref = '';
  epubFontSize = 100;
  private epubJs?: EpubJs;
  private epubBook?: EpubBookLike;
  private epubRendition?: EpubRendition;
  private epubCurrentCfi: string | null = null;
  private epubRelocated = false;
  private epubArrowHandler?: (ev: KeyboardEvent) => void;
  private epubResizeHandler?: () => void;
  private pdfDoc?: PdfDoc;
  private pdfRenderTask?: { cancel(): void; promise: Promise<void> };
  private pdfRenderSeq = 0;

  // ---- page-turn animation & swipe gestures ----
  private pageAnimTimer: any = null;
  private swipeTarget: 'pdf' | 'epub' | '' = '';
  private swipeStartX = 0;
  private swipeStartY = 0;
  private swipeStartTime = 0;
  private swipeHorizontal: boolean | null = null;

  public readonly allowedBookTypes = '.pdf,.epub,.txt,.doc,.docx,.docm,.dot,.dotx,.dotm,.rtf,.odt';

  constructor(public booksService: BooksService, private fileService: FileService, private cdr: ChangeDetectorRef) { super(); }

  async ngOnInit() {
    if (this.inputtedParentRef) this.parentRef = this.inputtedParentRef;
    // Deep links (/Books/<fileId>) open the reader on top of the file manager.
    // Resolved from the caller's library first, then the community catalog.
    if (this.preloadBookId) {
      const token = this.isLoggedIn ? await this.parentRef?.getSessionToken() : undefined;
      const entries = this.isLoggedIn
        ? await this.booksService.getMyLibrary(this.userId, token)
        : [];
      const catalog = await this.booksService.getCatalog(this.isLoggedIn ? this.userId : undefined);
      const pre = entries.find(b => b.fileId === this.preloadBookId)
        ?? entries.find(b => b.bookId === this.preloadBookId)
        ?? catalog.find(b => b.fileId === this.preloadBookId)
        ?? catalog.find(b => b.bookId === this.preloadBookId);
      if (pre) await this.openReader(pre);
    }
  }
  ngAfterViewInit() {
    // Configure the pdf.js worker once — the reader canvas loads pages off the
    // main thread so big PDFs never block the UI.
    void this.loadPdfJs();
    // Reader panes are created/destroyed with the overlay, so scroll tracking
    // uses a delegated capture listener instead of per-element wiring.
    document.addEventListener('scroll', this.onReaderScroll, true);
    // Fullscreen exits: Esc key and the mobile back button.
    document.addEventListener('keydown', this.onReaderKeydown);
    window.addEventListener('popstate', this.onFsPopState);
  }
  ngOnDestroy(): void {
    document.removeEventListener('scroll', this.onReaderScroll, true);
    document.removeEventListener('keydown', this.onReaderKeydown);
    window.removeEventListener('popstate', this.onFsPopState);
    if (this.pageAnimTimer) clearTimeout(this.pageAnimTimer);
    this.exitReaderFullscreen();
    document.removeEventListener('scroll', this.onReaderScroll, true);
    this.flushProgressSave();
    this.teardownEpub();
    this.revokeReaderUrl();
    this.pdfRenderSeq++;
    if (this.pdfRenderTask) { try { this.pdfRenderTask.cancel(); } catch { } this.pdfRenderTask = undefined; }
    if (this.pdfDoc) { void this.pdfDoc.destroy().catch(() => { }); this.pdfDoc = undefined; }
  }
  safeDestroy() { this.ngOnDestroy(); }

  get isLoggedIn(): boolean { return !!this.parentRef?.user?.id; }
  get userId(): number { return this.parentRef?.user?.id ?? 0; }

  async showMenuPanel() {
    this.isMenuPanelOpen = true;
    this.parentRef?.showOverlay();
  }
  hideMenuPanel() {
    this.isMenuPanelOpen = false;
    this.parentRef?.closeOverlay();
  }
  hideLoginPopup() {
    this.parentRef?.closeOverlay();
  }
  onLoginClick() {
    this.parentRef?.showOverlay();
  }

  // ================= Folder management =================

  async createBookFolder() {
    const name = this.newFolderName.trim().replace(/[/\\]/g, '-');
    if (!name) return;
    if (!this.isLoggedIn) return;
    const token = await this.parentRef?.getSessionToken();
    if (!token) return;
    const target = this.currentFolder ? `Books/${this.currentFolder}/${name}` : `Books/${name}`;
    const res = await this.fileService.createDirectory(this.userId, target, false, token);
    if (res !== null) {
      this.parentRef?.showNotification(`Created folder ${name}.`);
      this.showNewFolderPrompt = false;
      this.newFolderName = '';
      try { this.fileSearch?.refreshDirectory(); } catch { }
    } else {
      this.parentRef?.showNotification('Could not create the folder.');
    }
  }

  /** Books-relative upload target: '' → Books/, 'Sci-Fi' → Books/Sci-Fi/. */
  get uploadDirectory(): string {
    return this.currentFolder ? `Books/${this.currentFolder}/` : 'Books/';
  }

  /** File-search uses the filesystem's Books/ path, including the trailing
   *  slash expected by its directory navigator. */
  get fileManagerDirectory(): string {
    return this.currentFolder ? `Books/${this.currentFolder}/` : 'Books/';
  }

  onFileManagerDirectoryChanged(directory: string) {
    const normalized = (directory || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const marker = normalized.toLowerCase().indexOf('books');
    if (marker < 0) return;
    const relative = normalized.slice(marker + 'books'.length).replace(/^\/+|\/+$/g, '');
    this.currentFolder = relative;
  }

  get fileManagerTypes(): string[] {
    return this.allowedBookTypes.split(',').map(type => type.trim().replace(/^\./, '')).filter(Boolean);
  }

  /** Open a book selected from app-file-search using the same reader and
   *  progress tracking as before. Raw Books-folder files get a usable
   *  temporary BookEntry (library metadata is no longer fetched up front). */
  async openBookFromFileSearch(file: FileEntry) {
    if (!file || file.isFolder || !file.id) return;
    const title = file.givenFileName || this.titleFromFile(file);
    const book = Object.assign(new BookEntry(), {
      fileId: file.id,
      title,
      fileType: (file.fileType || this.fileService.getFileExtension(file.fileName || '')).toLowerCase(),
      fileSize: file.fileSize || 0,
      ownerId: file.user?.id || 0,
      fileOwnerId: file.user?.id || 0,
      ownerName: file.user?.username || 'Unknown',
    });
    await this.openReader(book);
  }

  /** Uploader finished — register every uploaded book-format file so it appears
   *  in the library (and thus the "My library" book filter), then refresh the
   *  file browser so the new files show up immediately. */
  async uploadFinished(files: FileEntry[]) {
    if (!files?.length || !this.isLoggedIn) {
      try { this.fileSearch?.refreshDirectory(); } catch { }
      return;
    }
    const bookFiles = files.filter(f => {
      const name = (f.givenFileName || f.fileName || '').toLowerCase();
      const ext = name.includes('.') ? name.split('.').pop()! : '';
      return this.allowedBookTypes.split(',').includes('.' + ext);
    });
    if (!bookFiles.length) {
      try { this.fileSearch?.refreshDirectory(); } catch { }
      return;
    }
    const token = await this.parentRef?.getSessionToken();
    const ok = await this.booksService.bulkRegister(bookFiles.map(f => ({
      userId: this.userId,
      fileId: f.id,
      title: this.titleFromFile(f),
      isPublic: (f.visibility || '').toLowerCase() === 'public',
    })), token);
    this.parentRef?.showNotification(ok === bookFiles.length
      ? `Added ${ok} book${ok === 1 ? '' : 's'} to your library.`
      : `Added ${ok} of ${bookFiles.length} books — edit details to retry any missing.`);
    try { this.fileSearch?.refreshDirectory(); } catch { }
  }

  private titleFromFile(f: FileEntry): string {
    const name = f.givenFileName || f.fileName || '';
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(0, dot) : name;
  }

  /** Title-bar refresh: reload the file browser. */
  async refreshAll() {
    try { this.fileSearch?.refreshDirectory(); } catch { }
  }

  // ================= Reader =================

  async openReader(book: BookEntry) {
    this.readingBook = book;
    this.readerError = '';
    this.textContent = '';
    this.pdfPage = 1;
    this.zoom = 1.0;
    this.isLoadingReader = true;
    this.revokeReaderUrl();
    // Fetch the saved position in parallel with the book itself — resume must
    // not add latency to opening the reader.
    const uid = this.userId;
    this.savedProgress = null;
    this.restoringProgress = false;
    if (uid > 0 && book.fileId > 0) {
      const token = await this.parentRef?.getSessionToken();
      this.savedProgress = await this.booksService.getReadingProgress(uid, book.fileId, token);
    }
    try {
      const blob = await this.booksService.downloadBook(book.fileId);
      if (!blob || blob.size === 0) {
        this.readerError = 'Could not load the book file (empty or missing).';
        return;
      }
      const ext = (book.fileType || '').toLowerCase();
      if (ext === 'pdf') {
        this.readerBlobType = 'application/pdf';
      } else if (ext === 'epub') {
        this.readerBlobType = 'epub';
        await this.openEpubBook(book, blob);
        return;
      } else if (ext === 'txt' || ext === 'md' || ext === 'rtf') {
        this.readerBlobType = 'text';
        this.textContent = await blob.text();
        // Resume text readers at the saved scroll ratio once the pane exists.
        const saved = this.savedProgress;
        if (saved) {
          setTimeout(() => {
            const pane = document.querySelector('.text-pane') as HTMLElement | null;
            if (pane && pane.scrollHeight > pane.clientHeight) {
              pane.scrollTop = saved.scroll * (pane.scrollHeight - pane.clientHeight);
            }
          }, 0);
        }
        return; // no object url needed
      } else {
        // Word formats cannot be rendered natively by browsers — offer download.
        this.readerBlobType = 'download';
        this.readerObjectUrl = URL.createObjectURL(blob);
        return;
      }
      // PDF: render it ourselves with pdf.js. Chrome's native blob-iframe viewer
      // is unreliable — on mobile it shows a dead "Open" card instead of the
      // document — so we no longer depend on the browser's built-in viewer.
      const pdfjs = await this.loadPdfJs();
      const data = await blob.arrayBuffer();
      const doc = await pdfjs.getDocument({ data }).promise;
      if (this.readingBook !== book) { void doc.destroy().catch(() => { }); return; } // closed/superseded while loading
      this.pdfDoc = doc;
      this.pdfPages = doc.numPages;
      // Resume at the saved page when it still exists in this document.
      const saved = this.savedProgress;
      const savedPage = saved && saved.page > 0 && saved.page <= doc.numPages ? saved.page : 1;
      this.pdfPage = savedPage;
      this.restoringProgress = !!saved;
      // The canvas only exists after Angular renders the reader overlay — run
      // after the next change-detection pass.
      setTimeout(() => { void this.renderPdfPage(); }, 0);
    } catch (ex) {
      console.error('Error opening book:', ex);
      this.readerError = 'Failed to open the book.';
    } finally {
      this.isLoadingReader = false;
    }
  }

  closeReader() {
    // Leave fullscreen (consuming its history entry) before tearing down.
    this.exitReaderFullscreen();
    // Persist the final position before tearing down the reader.
    void this.flushProgressSave();
    this.teardownEpub();
    this.readingBook = undefined;
    this.textContent = '';
    this.readerError = '';
    this.revokeReaderUrl();
  }

  // ================= Fullscreen reading =================

  /** Fill the screen with the reader pane. A history entry is pushed so the
   *  Android back button exits fullscreen instead of leaving the reader. */
  enterReaderFullscreen() {
    this.readerFullscreen = true;
    if (!this.fsHistoryPushed) {
      try { history.pushState({ readerFullscreen: true }, ''); this.fsHistoryPushed = true; } catch { }
    }
    this.refitReaderPane();
  }

  /** Leave fullscreen. `fromPop` when triggered by the browser back button —
   *  the history entry was already consumed in that case. */
  exitReaderFullscreen(fromPop = false) {
    if (!this.readerFullscreen && !this.fsHistoryPushed) return;
    this.readerFullscreen = false;
    if (this.fsHistoryPushed && !fromPop && this.readingBook) {
      this.fsHistoryPushed = false;
      try { history.back(); } catch { }
    } else if (fromPop) {
      this.fsHistoryPushed = false;
    }
    this.refitReaderPane();
  }

  /** Re-fit the current page/rendition after the pane changed size. */
  private refitReaderPane() {
    setTimeout(() => {
      void this.renderPdfPage();
      this.epubRendition?.resize?.('100%', '100%');
    }, 0);
  }

  /** Esc exits fullscreen reading. */
  private onReaderKeydown = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape' && this.readerFullscreen) {
      ev.preventDefault();
      this.exitReaderFullscreen();
    }
  };

  /** Mobile back button exits fullscreen instead of leaving the reader. */
  private onFsPopState = () => {
    if (this.readerFullscreen) this.exitReaderFullscreen(true);
  };
  private teardownEpub() {
    if (this.epubArrowHandler) { document.removeEventListener('keydown', this.epubArrowHandler); this.epubArrowHandler = undefined; }
    if (this.epubResizeHandler) { window.removeEventListener('resize', this.epubResizeHandler); this.epubResizeHandler = undefined; }
    if (this.epubRendition) { try { this.epubRendition.destroy(); } catch { } this.epubRendition = undefined; }
    if (this.epubBook) { try { this.epubBook.destroy(); } catch { } this.epubBook = undefined; }
    this.epubToc = [];
    this.epubTocHref = '';
    this.epubCurrentCfi = null;
    this.epubRelocated = false;
  }

  private revokeReaderUrl() {
    if (this.readerObjectUrl) {
      try { URL.revokeObjectURL(this.readerObjectUrl); } catch { }
      this.readerObjectUrl = undefined;
    }
    this.pdfRenderSeq++;
    if (this.pdfRenderTask) { try { this.pdfRenderTask.cancel(); } catch { } this.pdfRenderTask = undefined; }
    if (this.pdfDoc) { void this.pdfDoc.destroy().catch(() => { }); this.pdfDoc = undefined; }
    this.pdfPages = 1;
  }

  async downloadReadingBook() {
    const book = this.readingBook;
    if (!book?.fileId) return;
    // Streams the same authenticated endpoint the reader used — works for every
    // format, including PDFs which no longer keep an object URL around.
    await this.downloadBookFile(book);
  }

  // ================= EPUB reader =================

  /** Lazily import epub.js so its bundle only loads when an EPUB is opened. */
  private async loadEpubJs(): Promise<EpubJs> {
    if (this.epubJs) return this.epubJs;
    const mod = (await import('epubjs')) as unknown as EpubJs;
    this.epubJs = mod;
    return mod;
  }

  private async openEpubBook(book: BookEntry, blob: Blob) {
    try {
      const epubjs = await this.loadEpubJs();
      if (this.readingBook !== book) return; // closed/superseded while loading
      const data = await blob.arrayBuffer();
      // The host div only exists once the loading flag clears — flip it and run
      // change detection synchronously so the pane is in the DOM before renderTo.
      this.isLoadingReader = false;
      this.cdr.detectChanges();
      const host = this.epubHost?.nativeElement;
      if (!host) return;
      const bk = epubjs.Book(data, { openAs: 'epub' });
      this.epubBook = bk;
      this.epubToc = (bk.toc as EpubTocItem[]) ?? [];
      const rendition = bk.renderTo(host, {
        width: '100%',
        height: '100%',
        flow: 'paginated',
        spread: 'none',
      });
      this.epubRendition = rendition;
      rendition.themes?.default(
        'body { background: #fffdf8 !important; color: #2a2620 !important; line-height: 1.55 !important; }',
      );
      if (this.epubFontSize !== 100) rendition.themes?.fontSize(`${this.epubFontSize}%`);
      // Position tracking: 'relocated' fires after every page turn / jump.
      rendition.on('relocated', (payload: unknown) => {
        const loc = payload as EpubLocation;
        const cfi = loc?.start?.cfi ?? null;
        if (!cfi) return;
        this.epubRelocated = true;
        this.epubCurrentCfi = cfi;
        this.queueProgressSave();
      });
      rendition.on('renderError', () => { });
      // Swipe-to-turn: epub.js forwards touch events from inside the book
      // iframe through the rendition emitter, so gestures work over the text.
      rendition.on('touchstart', (payload: unknown) => this.onPaneTouchStart(payload as TouchEvent, 'epub'));
      rendition.on('touchmove', (payload: unknown) => this.onPaneTouchMove(payload as TouchEvent));
      rendition.on('touchend', (payload: unknown) => this.onPaneTouchEnd(payload as TouchEvent));
      // Arrow keys page through the book while the reader is open.
      this.epubArrowHandler = (ev: KeyboardEvent) => {
        if (!this.readingBook || this.readerBlobType !== 'epub') return;
        if (ev.key === 'ArrowLeft') { this.epubPrev(); }
        else if (ev.key === 'ArrowRight') { this.epubNext(); }
      };
      document.addEventListener('keydown', this.epubArrowHandler);
      this.epubResizeHandler = () => rendition.resize?.('100%', '100%');
      window.addEventListener('resize', this.epubResizeHandler);
      // Restore the saved position if one exists, else open at the start. The
      // restoring flag is cleared once the jump lands so normal progress saves
      // resume (the debounced save queued by 'relocated' re-persists the same
      // restored position, which is harmless).
      const saved = this.savedProgress;
      if (saved?.position) {
        this.restoringProgress = true;
        await rendition.display(saved.position);
        this.restoringProgress = false;
      } else {
        await rendition.display();
      }
    } catch (ex) {
      console.error('Error opening EPUB:', ex);
      this.readerError = 'Failed to open the EPUB book.';
    }
  }

  epubPrev() { if (this.epubRendition) { this.epubRendition.prev(); this.playPageAnim('prev'); } }
  epubNext() { if (this.epubRendition) { this.epubRendition.next(); this.playPageAnim('next'); } }

  epubTocChange() {
    const href = this.epubTocHref;
    if (!href || !this.epubRendition) return;
    void this.epubRendition.display(href);
  }

  epubFontDelta(delta: number) {
    this.epubFontSize = Math.min(220, Math.max(70, this.epubFontSize + delta));
    this.epubRendition?.themes?.fontSize(`${this.epubFontSize}%`);
  }

  /** Download of the book file (same stream the reader uses). */
  async downloadBookFile(book: BookEntry) {
    if (!book?.fileId) return;
    const blob = await this.booksService.downloadBook(book.fileId);
    if (!blob || blob.size === 0) {
      this.parentRef?.showNotification(
        `Could not download "${book.title}" — the server returned empty content.`);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${book.title || 'book'}.${book.fileType || 'bin'}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch { } }, 10000);
  }

  zoomIn() { this.zoom = Math.min(2.5, +(this.zoom + 0.15).toFixed(2)); void this.renderPdfPage(); }
  zoomOut() { this.zoom = Math.max(0.5, +(this.zoom - 0.15).toFixed(2)); void this.renderPdfPage(); }
  /** Turn the page with the slide animation — shared by the ◀ ▶ buttons and
   *  swipe gestures so both feel identical. */
  async turnPdfPage(dir: 'next' | 'prev') {
    if (this.readerBlobType !== 'application/pdf') return;
    if (dir === 'next' ? this.pdfPage >= this.pdfPages : this.pdfPage <= 1) return;
    this.pdfPage += dir === 'next' ? 1 : -1;
    this.pendingScroll = 0;
    this.resetPdfPaneScroll();
    await this.renderPdfPage();
    this.playPageAnim(dir);
  }
  nextPdfPage() { void this.turnPdfPage('next'); }
  prevPdfPage() { void this.turnPdfPage('prev'); }

  private resetPdfPaneScroll() {
    const pane = this.pdfCanvas?.nativeElement?.parentElement as HTMLElement | null;
    if (pane) pane.scrollTop = 0;
  }

  // ================= Page-turn animation & swipe gestures =================

  /** Slides the freshly rendered page in from the direction of travel. */
  private playPageAnim(dir: 'next' | 'prev') {
    const el = (this.readerBlobType === 'application/pdf'
      ? this.pdfCanvas?.nativeElement
      : this.epubHost?.nativeElement) as HTMLElement | null;
    if (!el) return;
    const cls = dir === 'next' ? 'page-slide-next' : 'page-slide-prev';
    el.classList.remove('page-slide-next', 'page-slide-prev');
    void el.offsetWidth; // force a reflow so a running animation restarts
    el.classList.add(cls);
    if (this.pageAnimTimer) clearTimeout(this.pageAnimTimer);
    this.pageAnimTimer = setTimeout(() => el.classList.remove(cls), 260);
  }

  onPaneTouchStart(ev: TouchEvent, target: 'pdf' | 'epub') {
    if (!this.readingBook || ev.touches.length !== 1) return;
    // Zoomed wider than the pane? Horizontal drags pan the page — no turning.
    if (target === 'pdf') {
      const pane = this.pdfCanvas?.nativeElement?.parentElement as HTMLElement | null;
      if (pane && pane.scrollWidth > pane.clientWidth + 4) return;
    }
    const t = ev.touches[0];
    this.swipeTarget = target;
    this.swipeStartX = t.clientX;
    this.swipeStartY = t.clientY;
    this.swipeStartTime = Date.now();
    this.swipeHorizontal = null;
  }

  onPaneTouchMove(ev: TouchEvent) {
    if (!this.swipeTarget || ev.touches.length !== 1) return;
    const t = ev.touches[0];
    const dx = t.clientX - this.swipeStartX;
    const dy = t.clientY - this.swipeStartY;
    if (this.swipeHorizontal === null) {
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
      // Lock the axis early: horizontal swipes turn pages, vertical ones scroll.
      this.swipeHorizontal = Math.abs(dx) > Math.abs(dy) * 1.4;
    }
    if (!this.swipeHorizontal) return;
    // PDF page follows the finger with resistance; EPUB (iframe) just turns on
    // release since its content can't be transformed from outside safely.
    if (this.swipeTarget === 'pdf') {
      const canvas = this.pdfCanvas?.nativeElement;
      if (canvas) canvas.style.transform = `translateX(${(dx * 0.35).toFixed(1)}px)`;
    }
  }

  onPaneTouchEnd(ev: TouchEvent) {
    const target = this.swipeTarget;
    this.swipeTarget = '';
    const canvas = this.pdfCanvas?.nativeElement;
    if (canvas) canvas.style.transform = '';
    if (!target || this.swipeHorizontal !== true || ev.changedTouches.length !== 1) return;
    const dx = ev.changedTouches[0].clientX - this.swipeStartX;
    if (Math.abs(dx) < 48) return; // too small — a tap or accidental nudge
    const dir: 'next' | 'prev' = dx < 0 ? 'next' : 'prev';
    if (target === 'pdf') {
      void this.turnPdfPage(dir);
    } else if (dir === 'next') {
      this.epubNext();
    } else {
      this.epubPrev();
    }
  }

  onPaneTouchCancel() {
    this.swipeTarget = '';
    const canvas = this.pdfCanvas?.nativeElement;
    if (canvas) canvas.style.transform = '';
  }

  // ================= Reading progress =================

  /** Queued scroll ratio for the pending progress save (null = page-flip only). */
  private pendingScroll: number | null = null;

  /** Delegated capture listener: any scroll inside the open reader pane queues
   *  a debounced progress save. Re-created with the overlay each open, so no
   *  per-element listener wiring is needed. */
  private onReaderScroll = (ev: Event) => {
    const target = ev.target as HTMLElement | null;
    if (!target || !this.readingBook) return;
    const isPane = target.classList?.contains('text-pane') || target.classList?.contains('pdf-pane');
    if (!isPane) return;
    const max = target.scrollHeight - target.clientHeight;
    this.pendingScroll = max > 4 ? Math.min(1, Math.max(0, target.scrollTop / max)) : 0;
    this.queueProgressSave();
  };

  /** Debounced save — coalesces rapid page flips / scroll events into one POST. */
  private queueProgressSave(delay = 1200) {
    if (!this.isLoggedIn || !this.readingBook) return;
    if (this.progressSaveTimer) clearTimeout(this.progressSaveTimer);
    this.progressSaveTimer = setTimeout(() => this.flushProgressSave(), delay);
  }

  private async flushProgressSave() {
    if (this.progressSaveTimer) { clearTimeout(this.progressSaveTimer); this.progressSaveTimer = null; }
    const book = this.readingBook;
    const uid = this.userId;
    if (!book || uid <= 0 || book.fileId <= 0) return;
    // Don't persist an in-flight restore as new progress.
    if (this.restoringProgress) return;
    const scroll = this.pendingScroll;
    this.pendingScroll = null;
    const token = await this.parentRef?.getSessionToken();
    await this.booksService.saveReadingProgress({
      userId: uid,
      fileId: book.fileId,
      page: this.pdfPage,
      scroll: scroll ?? this.savedProgress?.scroll ?? 0,
      // EPUB CFI position — undefined for other formats keeps their stored value.
      position: this.epubCurrentCfi ?? this.savedProgress?.position ?? undefined,
    }, token);
  }

  /** Lazily import pdf.js (bundled as a lazy chunk) and point its worker at the
   *  copied asset, so the ~400 kB library only loads when someone opens a PDF. */
  private pdfJs?: PdfJs;
  private async loadPdfJs(): Promise<PdfJs> {
    if (this.pdfJs) return this.pdfJs;
    const mod = (await import('pdfjs-dist')) as unknown as PdfJs;
    mod.GlobalWorkerOptions.workerSrc = 'assets/pdfjs/pdf.worker.min.mjs';
    this.pdfJs = mod;
    return mod;
  }

  /** Render the current PDF page onto the reader canvas. Renders fit the panel
   *  width (scaled by the zoom factor) at device-pixel resolution for crisp text.
   *  A monotonic sequence guard plus task cancellation means rapid page/zoom
   *  clicks can never interleave draws from stale renders. */
  private async renderPdfPage(): Promise<void> {
    const doc = this.pdfDoc;
    const canvas = this.pdfCanvas?.nativeElement;
    if (!doc || !canvas || this.readerBlobType !== 'application/pdf') return;
    const seq = ++this.pdfRenderSeq;
    try {
      if (this.pdfRenderTask) { try { this.pdfRenderTask.cancel(); } catch { } this.pdfRenderTask = undefined; }
      const page = await doc.getPage(Math.min(Math.max(1, this.pdfPage), doc.numPages));
      if (seq !== this.pdfRenderSeq) return;
      const base = page.getViewport({ scale: 1 });
      const panelWidth = Math.max(240, (canvas.parentElement?.clientWidth || canvas.clientWidth || 800) - 16);
      const cssScale = Math.max(0.1, (panelWidth / base.width) * this.zoom);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: cssScale * dpr });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(base.width * cssScale)}px`;
      canvas.style.height = 'auto';
      // While a zoomed page is wider than the pane, horizontal drags must pan
      // it natively — otherwise horizontal touches belong to swipe-to-turn.
      const pane = canvas.parentElement as HTMLElement | null;
      if (pane) pane.style.touchAction = pane.scrollWidth > pane.clientWidth + 4 ? 'auto' : 'pan-y';
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const task = page.render({ canvasContext: ctx, viewport });
      this.pdfRenderTask = task;
      await task.promise;
      if (seq !== this.pdfRenderSeq) return;
      // Initial render of a resumed book: scroll the fresh canvas to the saved
      // in-page position, then hand control back to the reader.
      const restoring = this.restoringProgress;
      this.restoringProgress = false;
      if (restoring && this.savedProgress && this.savedProgress.scroll > 0) {
        const pane = canvas.parentElement as HTMLElement | null;
        if (pane && pane.scrollHeight > pane.clientHeight) {
          pane.scrollTop = this.savedProgress.scroll * (pane.scrollHeight - pane.clientHeight);
        }
      } else if (!restoring) {
        this.queueProgressSave();
      }
    } catch {
      // Cancelled renders land here (RenderingCancelledException) — harmless.
      if (seq === this.pdfRenderSeq) this.restoringProgress = false;
    }
  }
}