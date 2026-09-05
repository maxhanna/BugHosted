import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';

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
import { MediaSelectorComponent } from '../media-selector/media-selector.component';

type BooksTab = 'library' | 'catalog';

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
  @Output() hasData = new EventEmitter<boolean>();

  @ViewChild(MediaSelectorComponent) mediaSelector?: MediaSelectorComponent;
  @ViewChild('pdfCanvas') pdfCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('epubHost') epubHost?: ElementRef<HTMLDivElement>;

  books: BookEntry[] = [];
  filteredBooks: BookEntry[] = [];
  activeTab: BooksTab = 'library';
  isMenuPanelOpen = false;

  // ---- add-book flow ----
  isAddPanelOpen = false;
  selectedBookFile?: FileEntry;
  selectedCoverFile?: FileEntry;
  newTitle = '';
  newAuthor = '';
  newDescription = '';
  isSubmittingBook = false;

  // ---- sharing ----
  shareBook?: BookEntry;
  shareUsername = '';
  shareMessage = '';

  // ---- editing ----
  editBook?: BookEntry;
  editTitle = '';
  editAuthor = '';
  editDescription = '';

  // ---- reader ----
  readingBook?: BookEntry;
  readerObjectUrl?: string;
  readerBlobType = '';
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

  searchQuery = '';
  formatFilter = '';

  public readonly allowedBookTypes = '.pdf,.epub,.txt,.doc,.docx,.docm,.dot,.dotx,.dotm,.rtf,.odt';

  constructor(public booksService: BooksService, private cdr: ChangeDetectorRef) { super(); }

  async ngOnInit() {
    if (this.inputtedParentRef) this.parentRef = this.inputtedParentRef;
    await this.loadBooks();
    if (this.preloadBookId) {
      // Deep links are keyed by fileId (the book's stable identity, shared
      // across every user's library entry), falling back to bookId for old
      // links minted before the fileId scheme.
      const pre = this.books.find(b => b.fileId === this.preloadBookId)
        ?? this.books.find(b => b.bookId === this.preloadBookId);
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
  }
  ngOnDestroy(): void {
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

  async loadBooks() {
    this.isLoading = true;
    try {
      if (this.isLoggedIn) {
        const token = await this.parentRef?.getSessionToken();
        if (this.activeTab === 'library') {
          this.books = await this.booksService.getMyLibrary(this.userId, token);
        } else {
          this.books = await this.booksService.getCatalog(this.userId);
        }
      } else {
        this.books = await this.booksService.getCatalog();
      }
      this.applyFilter();
      this.hasData.emit(this.books.length > 0);
      // Keep an open share dialog in sync with the freshly loaded data —
      // otherwise its visibility chips/status lag one reload behind.
      if (this.shareBook) {
        this.shareBook = this.books.find(b => b.bookId === this.shareBook!.bookId) ?? this.shareBook;
      }
    } finally {
      this.isLoading = false;
    }
  }

  async switchTab(tab: BooksTab) {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    await this.loadBooks();
  }

  applyFilter() {
    const q = this.searchQuery.trim().toLowerCase();
    const fmt = this.formatFilter.trim().toLowerCase();
    this.filteredBooks = this.books.filter(b => {
      if (fmt && (b.fileType || '').toLowerCase() !== fmt) return false;
      if (!q) return true;
      return (b.title || '').toLowerCase().includes(q)
        || (b.author || '').toLowerCase().includes(q)
        || (b.description || '').toLowerCase().includes(q)
        || (b.ownerName || '').toLowerCase().includes(q);
    });
  }

  get availableFormats(): string[] {
    const set = new Set<string>();
    for (const b of this.books) if (b.fileType) set.add(b.fileType.toLowerCase());
    return Array.from(set).sort();
  }

  // ================= Add book flow =================

  openAddPanel() {
    if (!this.isLoggedIn) { this.onLoginClick(); return; }
    this.isAddPanelOpen = true;
  }
  closeAddPanel() {
    this.isAddPanelOpen = false;
    this.selectedBookFile = undefined;
    this.selectedCoverFile = undefined;
    this.newTitle = '';
    this.newAuthor = '';
    this.newDescription = '';
  }

  onBookFileSelected(files: FileEntry[]) {
    const first = files && files.length > 0 ? files[0] : undefined;
    this.selectedBookFile = first;
    if (first && !this.newTitle.trim()) {
      this.newTitle = this.titleFromFile(first);
    }
  }
  onCoverFileSelected(files: FileEntry[]) {
    const first = files && files.length > 0 ? files[0] : undefined;
    this.selectedCoverFile = first;
  }

  private titleFromFile(f: FileEntry): string {
    const name = f.givenFileName || f.fileName || '';
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(0, dot) : name;
  }

  async submitBook() {
    if (!this.isLoggedIn || this.isSubmittingBook) return;
    if (!this.selectedBookFile?.id) {
      this.parentRef?.showNotification('Pick a book file (PDF, TXT or Word) first.');
      return;
    }
    if (!this.newTitle.trim()) {
      this.parentRef?.showNotification('Give your book a title.');
      return;
    }
    this.isSubmittingBook = true;
    try {
      const token = await this.parentRef?.getSessionToken();
      const result = await this.booksService.registerBook({
        userId: this.userId,
        fileId: this.selectedBookFile.id,
        title: this.newTitle.trim(),
        author: this.newAuthor.trim() || undefined,
        description: this.newDescription.trim() || undefined,
        coverFileId: this.selectedCoverFile?.id,
        isPublic: false,
      }, token);
      if (result) {
        this.parentRef?.showNotification(result.updated
          ? `Updated "${this.newTitle.trim()}" in your library.`
          : `"${this.newTitle.trim()}" added to your library.`);
        this.closeAddPanel();
        await this.loadBooks();
      } else {
        this.parentRef?.showNotification('Could not add the book. Supported: pdf, txt, doc, docx, rtf, odt.');
      }
    } finally {
      this.isSubmittingBook = false;
    }
  }

  // ================= Sharing =================

  openSharePanel(book: BookEntry) {
    this.shareBook = book;
    this.shareUsername = '';
    this.shareMessage = '';
  }
  closeSharePanel() { this.shareBook = undefined; this.shareMessage = ''; }

  async sharePublicly() {
    if (!this.shareBook || !this.isLoggedIn) return;
    const token = await this.parentRef?.getSessionToken();
    const res = await this.booksService.shareBook({
      userId: this.userId, bookId: this.shareBook.bookId, makePublic: true,
    }, token);
    if (res?.success) {
      this.shareMessage = 'Book is now public — everyone can see it in the catalog.';
      await this.loadBooks();
    } else {
      this.shareMessage = 'Could not share the book. Try again.';
    }
  }

  async shareWithUser() {
    if (!this.shareBook || !this.isLoggedIn) return;
    const name = this.shareUsername.trim();
    if (!name) { this.shareMessage = 'Enter a username to share with.'; return; }
    const token = await this.parentRef?.getSessionToken();
    const res = await this.booksService.shareBook({
      userId: this.userId, bookId: this.shareBook.bookId, usernames: [name],
    }, token);
    if (res?.success) {
      if (res.unknownUsernames && res.unknownUsernames.length > 0) {
        this.shareMessage = `User "${name}" was not found.`;
      } else {
        this.shareMessage = `Shared with ${name}.`;
        this.shareUsername = '';
        await this.loadBooks();
      }
    } else {
      this.shareMessage = 'Could not share the book. Try again.';
    }
  }

  async makePrivate() {
    if (!this.shareBook || !this.isLoggedIn) return;
    const token = await this.parentRef?.getSessionToken();
    const ok = await this.booksService.unshareBook({
      userId: this.userId, bookId: this.shareBook.bookId, makePublic: true,
    }, token);
    if (ok) {
      this.shareMessage = 'Book is private again — only you (and anyone individually shared) can see it.';
      await this.loadBooks();
    } else {
      this.shareMessage = 'Could not update sharing. Try again.';
    }
  }

  sharedUserEntries(book: BookEntry): { id: number; label: string }[] {
    return (book.sharedWith || []).map(id => ({ id, label: `user ${id}` }));
  }

  async removeSharedUser(id: number) {
    if (!this.shareBook || !this.isLoggedIn) return;
    const token = await this.parentRef?.getSessionToken();
    const ok = await this.booksService.unshareBook({
      userId: this.userId, bookId: this.shareBook.bookId, userIds: [id],
    }, token);
    if (ok) {
      this.shareMessage = 'Removed from shared list.';
      await this.loadBooks();
    }
  }

  // ---- cover art ----
  // Per-card cover state, keyed by fileId: undefined = still showing the real
  // cover/SVG; 'loading' = PDF thumbnail rendering in the background; 'pdf' =
  // first-page thumbnail; 'svg' = fell back to the generated cover.
  private coverStates = new Map<number, 'loading' | 'pdf' | 'svg'>();

  /** Source for a card's cover image: uploaded cover or generated SVG, unless
   *  a rendered PDF first-page thumbnail is available for the card. */
  coverSrc(book: BookEntry): string {
    if (this.coverStates.get(book.fileId) === 'pdf') {
      const thumb = this.booksService.peekPdfThumbnail(book.fileId);
      if (thumb) return thumb;
    }
    return this.booksService.getCoverUrl(book);
  }

  /** First successful cover load — for PDFs without a custom cover, kick off
   *  the first-page thumbnail render in the background and swap it in when done. */
  async onCoverLoad(book: BookEntry) {
    const fileId = book.fileId;
    const state = this.coverStates.get(fileId);
    if (state !== undefined) return; // thumbnail/fallback load — nothing to do
    if ((book.fileType || '').toLowerCase() !== 'pdf' || !fileId) {
      this.coverStates.set(fileId, 'svg');
      return;
    }
    this.coverStates.set(fileId, 'loading');
    const url = await this.booksService.getPdfThumbnail(fileId);
    // The card may have left the DOM (tab switch/filter) while rendering.
    if (url && this.books.some(b => b.fileId === fileId)) {
      this.coverStates.set(fileId, 'pdf');
      this.cdr.detectChanges();
    } else if (!url) {
      this.coverStates.set(fileId, 'svg');
    }
  }

  /** Cover load failed — fall back through PDF thumbnail to the generated SVG. */
  onCoverError(event: Event, book: BookEntry) {
    const img = event.target as HTMLImageElement | null;
    const fileId = book.fileId;
    const state = this.coverStates.get(fileId);
    if (state === 'loading') {
      // Thumbnail render still in flight — show the generated SVG so the card
      // never looks broken; the thumbnail swaps in when it lands.
      if (img) img.src = this.booksService.getCoverUrl(book);
      return;
    }
    if (state === undefined && (book.fileType || '').toLowerCase() === 'pdf' && fileId) {
      // The real cover 404'd — try the PDF thumbnail before giving up on art.
      this.coverStates.set(fileId, 'loading');
      const cached = this.booksService.peekPdfThumbnail(fileId);
      if (cached && img) { img.src = cached; return; }
      void this.booksService.getPdfThumbnail(fileId).then(url => {
        if (url && this.books.some(b => b.fileId === fileId)) {
          this.coverStates.set(fileId, 'pdf');
          this.cdr.detectChanges();
        } else {
          this.coverStates.set(fileId, 'svg');
        }
      });
      if (img) img.removeAttribute('src');
      return;
    }
    this.coverStates.set(fileId, 'svg');
    if (img && state !== 'svg') img.src = this.booksService.getCoverUrl(book);
    // state already 'svg' means the SVG itself failed — leave the image alone
    // rather than re-setting the same URL and erroring forever.
  }

  /** Jump to the uploader's profile page. */
  openOwner(event: Event, book: BookEntry) {
    event.preventDefault();
    event.stopPropagation();
    if (book.ownerId && this.parentRef) {
      this.parentRef.createComponent('User', { userId: book.ownerId });
    }
  }

  canManage(book: BookEntry): boolean {
    // Own library entry — edit/share/remove act on the entry itself, with
    // sharing additionally gated to the file owner on the server.
    return this.isLoggedIn && book.ownerId === this.userId;
  }

  /** True when the caller owns the underlying uploaded file (pre-caches data
   *  predates fileOwnerId and is treated as owner). */
  ownsFileOf(book: BookEntry): boolean {
    return !book.fileOwnerId || book.fileOwnerId === this.userId;
  }

  /** True for raw Books/-folder files that have no library row yet. */
  isUnregistered(book: BookEntry): boolean {
    return !book.bookId;
  }

  /**
   * True when this card represents someone else's book (registered or a raw
   * directory file) that the caller can save into their own library — the
   * inverse of the old behaviour, where the button appeared on your own raw
   * uploads.
   */
  canAddToLibrary(book: BookEntry): boolean {
    if (!this.isLoggedIn) return false;
    if (!book.bookId) return book.fileOwnerId !== this.userId;
    return book.ownerId !== this.userId;
  }

  /** One-click save of another user's book into the caller's library. */
  async quickRegister(book: BookEntry) {
    if (!this.isLoggedIn || !this.canAddToLibrary(book)) return;
    const token = await this.parentRef?.getSessionToken();
    const result = await this.booksService.registerBook({
      userId: this.userId,
      fileId: book.fileId,
      title: book.title || 'Untitled',
      isPublic: false, // a saved copy is private to the saver by default
    }, token);
    if (result) {
      this.parentRef?.showNotification(`"${book.title}" added to your library.`);
      await this.loadBooks();
    } else {
      this.parentRef?.showNotification('Could not add that book — it may not be public or shared with you.');
    }
  }

  visibilityLabel(book: BookEntry): string {
    if (book.isPublic) return '🌍 Public';
    if ((book.sharedWith || []).length > 0) return `👥 Shared (${book.sharedWith.length})`;
    return '🔒 Private';
  }

  formatLabel(ext: string): string {
    switch ((ext || '').toLowerCase()) {
      case 'pdf': return 'PDF';
      case 'epub': return 'EPUB';
      case 'txt': return 'TXT';
      case 'doc': return 'DOC';
      case 'docx': return 'DOCX';
      case 'docm': return 'DOCM';
      case 'dot': return 'DOT';
      case 'dotx': return 'DOTX';
      case 'dotm': return 'DOTM';
      case 'rtf': return 'RTF';
      case 'odt': return 'ODT';
      default: return (ext || '').toUpperCase();
    }
  }

  // ================= Edit / remove =================

  openEditPanel(book: BookEntry) {
    this.editBook = book;
    this.editTitle = book.title;
    this.editAuthor = book.author || '';
    this.editDescription = book.description || '';
  }
  closeEditPanel() { this.editBook = undefined; }

  async saveEdit() {
    if (!this.editBook || !this.isLoggedIn) return;
    if (!this.editTitle.trim()) { this.parentRef?.showNotification('Title cannot be empty.'); return; }
    const token = await this.parentRef?.getSessionToken();
    const ok = await this.booksService.updateBook({
      userId: this.userId,
      bookId: this.editBook.bookId,
      title: this.editTitle.trim(),
      author: this.editAuthor.trim() || undefined,
      description: this.editDescription.trim() || undefined,
    }, token);
    if (ok) {
      this.parentRef?.showNotification('Book updated.');
      this.closeEditPanel();
      await this.loadBooks();
    } else {
      this.parentRef?.showNotification('Could not update the book.');
    }
  }

  async removeBook(book: BookEntry) {
    if (!this.isLoggedIn || !this.canManage(book)) return;
    if (!confirm(`Remove "${book.title}" from your library? The uploaded file itself is not deleted.`)) return;
    const token = await this.parentRef?.getSessionToken();
    const ok = await this.booksService.removeBook({ userId: this.userId, bookId: book.bookId }, token);
    if (ok) {
      this.parentRef?.showNotification(`Removed "${book.title}" from your library.`);
      await this.loadBooks();
    } else {
      this.parentRef?.showNotification('Could not remove the book.');
    }
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
    // Persist the final position before tearing down the reader.
    void this.flushProgressSave();
    this.teardownEpub();
    this.readingBook = undefined;
    this.textContent = '';
    this.readerError = '';
    this.revokeReaderUrl();
  }

  /** Tear down the EPUB rendition and any listeners it owns. */
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

  epubPrev() { this.epubRendition?.prev(); }
  epubNext() { this.epubRendition?.next(); }

  epubTocChange() {
    const href = this.epubTocHref;
    if (!href || !this.epubRendition) return;
    void this.epubRendition.display(href);
  }

  epubFontDelta(delta: number) {
    this.epubFontSize = Math.min(220, Math.max(70, this.epubFontSize + delta));
    this.epubRendition?.themes?.fontSize(`${this.epubFontSize}%`);
  }

  /** Card-level download of the book file (same stream the reader uses). */
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

  copyShareLink(book: BookEntry) {
    // Always the canonical /Books/<fileId> deep link — it opens the eBooks
    // reader for registered books and unregistered directory files alike.
    const link = this.booksService.getShareLink(book);
    navigator.clipboard?.writeText(link).then(
      () => this.parentRef?.showNotification('Share link copied to clipboard.'),
      () => this.parentRef?.showNotification(link),
    );
  }

  zoomIn() { this.zoom = Math.min(2.5, +(this.zoom + 0.15).toFixed(2)); void this.renderPdfPage(); }
  zoomOut() { this.zoom = Math.max(0.5, +(this.zoom - 0.15).toFixed(2)); void this.renderPdfPage(); }
  nextPdfPage() { if (this.pdfPage < this.pdfPages) { this.pdfPage++; this.pendingScroll = 0; this.resetPdfPaneScroll(); void this.renderPdfPage(); } }
  prevPdfPage() { if (this.pdfPage > 1) { this.pdfPage--; this.pendingScroll = 0; this.resetPdfPaneScroll(); void this.renderPdfPage(); } }

  private resetPdfPaneScroll() {
    const pane = this.pdfCanvas?.nativeElement?.parentElement as HTMLElement | null;
    if (pane) pane.scrollTop = 0;
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
